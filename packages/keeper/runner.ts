import "dotenv/config";

import { createServer } from "node:http";

import { AbiCoder, Contract, JsonRpcProvider, Wallet, WebSocketProvider, ZeroAddress, getBytes, parseUnits } from "ethers";

import { createKeeperConfigFromEnv } from "./config";
import { AuctionMonitor, estimateFinalizeReward, type AuctionFinalizer, type MarketMonitorReader } from "./services/auctionMonitor";
import { AvsSubmitter, type AVSOperatorSigner, type AttestationPayload, type AttestationProofEnvelope } from "./services/avsSubmitter";
import {
  CofheDispatcher,
  HttpFheosBatchClient,
  LocalCofheBatchClient,
  type BatchDispatchQueue,
  type CoFheDispatchJob,
  type CoFheResolution
} from "./services/cofheDispatcher";
import { FileBackedAuctionStateStore, type AuctionStateStore, type StoredDispatchJob } from "./stores/auctionStateStore";
import { InMemoryLockCoordinator, RedisLockCoordinator } from "./stores/lockCoordinator";
import { JsonSlashingLogStore } from "./stores/slashingLogStore";

const MARKET_ABI = [
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 endTime, uint256 sellerDeposit, bool isVickrey)",
  "function auctionCounter() view returns (uint256)",
  "function getAuction(uint256 auctionId) view returns (address nftContract, uint256 tokenId, address seller, uint64 endTime, uint256 sellerDeposit, uint8 state, bool isVickrey, uint64 lastBlockTimestamp, bytes32 winnerCiphertext, uint256 winningAmount)",
  "function getResolutionRequest(uint256 auctionId) view returns (bytes32 requestId, bytes32 winnerHandle, bytes32 amountHandle, uint64 requestedAt)",
  "function getBidders(uint256 auctionId) view returns (address[])",
  "function getEncryptedBid(uint256 auctionId, address bidder) view returns (bytes32)",
  "function escrowBalances(uint256 auctionId, address bidder) view returns (uint256)",
  "function triggerFinalize(uint256 auctionId) external",
  "function submitResolution(uint256 auctionId, address winner, bytes32 winnerCiphertext, uint256 winningAmount, bytes avsProof) external returns (bool)"
];

const AVS_ABI = [
  "function computeDigest(address market, uint256 auctionId, bytes32 requestId, address winner, bytes32 winnerCiphertext, uint256 winningAmount) view returns (bytes32)"
];

async function main(): Promise<void> {
  const config = createKeeperConfigFromEnv();
  const role = (process.argv[2] ?? process.env.KEEPER_ROLE ?? "auction-monitor").toLowerCase();
  const metrics = {
    loopRuns: 0,
    lastSuccessAt: 0,
    lastError: ""
  };

  const server = createServer((request, response) => {
    if (request.url === "/metrics") {
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      response.end(
        [
          "# HELP keeper_loop_runs Total service loop executions",
          "# TYPE keeper_loop_runs counter",
          `keeper_loop_runs{role="${role}"} ${metrics.loopRuns}`,
          "# HELP keeper_last_success_at Unix milliseconds of the last successful loop",
          "# TYPE keeper_last_success_at gauge",
          `keeper_last_success_at{role="${role}"} ${metrics.lastSuccessAt}`
        ].join("\n")
      );
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        role,
        ok: true,
        loopRuns: metrics.loopRuns,
        lastSuccessAt: metrics.lastSuccessAt,
        lastError: metrics.lastError
      })
    );
  });

  server.listen(config.metricsPort, () => {
    console.log(`[keeper] ${role} metrics listening on :${config.metricsPort}`);
  });

  if (role === "auction-monitor") {
    await startAuctionMonitor(config, metrics);
    return;
  }

  if (role === "cofhe-dispatcher") {
    await startDispatcher(config, metrics);
    return;
  }

  if (role === "avs-submitter") {
    await startAvsSubmitter(config, metrics);
    return;
  }

  throw new Error(`Unsupported keeper role: ${role}`);
}

async function startAuctionMonitor(
  config: ReturnType<typeof createKeeperConfigFromEnv>,
  metrics: { loopRuns: number; lastSuccessAt: number; lastError: string }
): Promise<void> {
  const store = new FileBackedAuctionStateStore(config.stateFilePath);
  await store.hydrate();

  const lockCoordinator =
    config.redisUrl.trim() === "" ? new InMemoryLockCoordinator() : new RedisLockCoordinator(config.redisUrl);

  if (config.marketAddress.trim() === "") {
    console.log("[keeper] auction-monitor started in dry-run mode because KEEPER_MARKET_ADDRESS is empty");
    setInterval(() => {
      metrics.loopRuns += 1;
      metrics.lastSuccessAt = Date.now();
    }, config.pollIntervalMs);
    return;
  }

  const rpcProvider = new JsonRpcProvider(config.rpcUrl);
  const readContract = new Contract(config.marketAddress, MARKET_ABI, rpcProvider);
  const monitor = new AuctionMonitor(
    readContract as unknown as MarketMonitorReader,
    config,
    store,
    lockCoordinator
  );

  const wallet = createWalletOrUndefined(process.env.PRIVATE_KEY, rpcProvider);
  let finalizer: AuctionFinalizer = {
    triggerFinalize: async () => {
      throw new Error("KEEPER private key is not configured");
    }
  };

  if (wallet) {
    const writeContract = new Contract(config.marketAddress, MARKET_ABI, wallet);
    finalizer = new EthersAuctionFinalizer(writeContract);
  } else {
    console.log("[keeper] auction-monitor will only observe because PRIVATE_KEY is missing or invalid");
  }

  if (config.websocketUrl.trim() !== "") {
    try {
      const wsProvider = new WebSocketProvider(config.websocketUrl);
      const wsContract = new Contract(config.marketAddress, MARKET_ABI, wsProvider);
      wsContract.on("AuctionCreated", async (auctionId, _seller, _nftContract, _tokenId, endTime, sellerDeposit) => {
        await monitor.trackAuction({
          auctionId: BigInt(auctionId.toString()),
          state: 1n,
          endTime: BigInt(endTime.toString()),
          sellerDeposit: BigInt(sellerDeposit.toString())
        });
        console.log(`[keeper] tracked auction ${auctionId.toString()} ending at ${endTime.toString()}`);
      });
    } catch (error) {
      console.error("[keeper] websocket listener unavailable, relying on polling backfill", error);
    }
  }

  await synchronizeAuctionsFromChain(readContract, monitor, store);
  await enqueuePendingResolutionJobs(readContract, monitor, store);

  setInterval(async () => {
    metrics.loopRuns += 1;
    try {
      await synchronizeAuctionsFromChain(readContract, monitor, store);
      const results = await monitor.executeDueFinalizations("auction-monitor", finalizer);
      await synchronizeAuctionsFromChain(readContract, monitor, store);
      await enqueuePendingResolutionJobs(readContract, monitor, store);

      metrics.lastSuccessAt = Date.now();
      metrics.lastError = "";

      for (const result of results) {
        console.log(
          `[keeper] finalize ${result.auctionId.toString()} success=${result.success} reward=${result.rewardEstimateWei.toString()} nonce=${result.executionNonce}`
        );
      }
    } catch (error) {
      metrics.lastError = error instanceof Error ? error.message : String(error);
      console.error("[keeper] auction-monitor loop failed", error);
    }
  }, config.pollIntervalMs);
}

async function startDispatcher(
  config: ReturnType<typeof createKeeperConfigFromEnv>,
  metrics: { loopRuns: number; lastSuccessAt: number; lastError: string }
): Promise<void> {
  const store = new FileBackedAuctionStateStore(config.stateFilePath);
  await store.hydrate();

  const queue = new StoreBackedDispatchQueue(store);
  const client =
    config.fheosApiKey.trim() !== "" && !config.fheosApiKey.includes("replace-with-your-key")
      ? new HttpFheosBatchClient(config.fheosEndpoint, config.fheosApiKey)
      : new LocalCofheBatchClient();
  const dispatcher = new CofheDispatcher(queue, () => Date.now(), config, client);

  console.log(`[keeper] cofhe-dispatcher ready for batches up to ${config.maxBatchSize} auctions`);

  setInterval(async () => {
    metrics.loopRuns += 1;
    try {
      await store.hydrate();
      const results = await dispatcher.dispatchPendingBatch();
      const storedAtMs = Date.now();

      for (const resolution of results) {
        await store.storeResolutionArtifact({
          requestId: resolution.requestId,
          auctionId: resolution.auctionId,
          winner: normalizeWinnerAddress(resolution.winner),
          winnerCiphertext: resolution.winnerCiphertext,
          avsProof: resolution.avsProof,
          winningAmount: resolution.winningAmount,
          storedAtMs
        });
      }

      metrics.lastSuccessAt = Date.now();
      metrics.lastError = "";

      if (results.length > 0) {
        console.log(`[keeper] dispatched ${results.length} queued CoFHE requests`);
      }
    } catch (error) {
      metrics.lastError = error instanceof Error ? error.message : String(error);
      console.error("[keeper] cofhe-dispatcher loop failed", error);
    }
  }, config.pollIntervalMs);
}

async function startAvsSubmitter(
  config: ReturnType<typeof createKeeperConfigFromEnv>,
  metrics: { loopRuns: number; lastSuccessAt: number; lastError: string }
): Promise<void> {
  const store = new FileBackedAuctionStateStore(config.stateFilePath);
  await store.hydrate();

  const slashingLogStore = new JsonSlashingLogStore(config.slashingLogPath);
  await slashingLogStore.hydrate();
  const submitter = new AvsSubmitter(config.avsThreshold, slashingLogStore);

  console.log(`[keeper] avs-submitter ready with threshold ${config.avsThreshold}`);

  const canSubmitOnChain =
    config.marketAddress.trim() !== "" &&
    config.avsAddress.trim() !== "" &&
    config.avsOperatorPrivateKeys.length >= config.avsThreshold &&
    isValidPrivateKey(process.env.PRIVATE_KEY);

  let writer: EthersResolutionWriter | undefined;
  let digestReader: Contract | undefined;
  let operatorSigners: AVSOperatorSigner[] = [];

  if (canSubmitOnChain) {
    const provider = new JsonRpcProvider(config.rpcUrl);
    const keeperWallet = createWalletOrUndefined(process.env.PRIVATE_KEY, provider);
    if (keeperWallet) {
      writer = new EthersResolutionWriter(new Contract(config.marketAddress, MARKET_ABI, keeperWallet));
      digestReader = new Contract(config.avsAddress, AVS_ABI, provider);
      operatorSigners = config.avsOperatorPrivateKeys
        .filter(isValidPrivateKey)
        .map((privateKey) => new Wallet(privateKey))
        .map(
          (wallet): AVSOperatorSigner => ({
            address: wallet.address,
            signDigest: async (digest: string) => wallet.signMessage(getBytes(digest))
          })
        );
    }
  } else {
    console.log("[keeper] avs-submitter will observe only until market, AVS, and operator keys are configured");
  }

  setInterval(async () => {
    metrics.loopRuns += 1;
    try {
      await store.hydrate();
      const pendingArtifacts = await store.listPendingResolutionArtifacts(config.maxBatchSize);

      if (writer && digestReader && operatorSigners.length >= config.avsThreshold) {
        for (const artifact of pendingArtifacts) {
          const payload: AttestationPayload = {
            auctionId: artifact.auctionId,
            requestId: artifact.requestId,
            winner: artifact.winner,
            winnerCiphertext: artifact.winnerCiphertext,
            winningAmount: artifact.winningAmount
          };

          try {
            const digest = await digestReader.computeDigest(
              config.marketAddress,
              payload.auctionId,
              payload.requestId,
              payload.winner,
              payload.winnerCiphertext,
              payload.winningAmount
            );

            const proof = await submitter.submitVerifiedResolution(payload, payload, digest, operatorSigners, writer);
            await store.markResolutionArtifactSubmitted(artifact.requestId, Date.now());
            console.log(
              `[keeper] submitted resolution ${artifact.requestId} for auction ${artifact.auctionId.toString()} with ${proof.signerCount} AVS signatures`
            );
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            await submitter.recordSlashingViolation(artifact.requestId, artifact.auctionId, reason, operatorSigners.map((operator) => operator.address));
            throw error;
          }
        }
      }

      metrics.lastSuccessAt = Date.now();
      metrics.lastError = "";
      console.log(`[keeper] avs-submitter heartbeat, pending-artifacts=${pendingArtifacts.length}`);
    } catch (error) {
      metrics.lastError = error instanceof Error ? error.message : String(error);
      console.error("[keeper] avs-submitter loop failed", error);
    }
  }, config.pollIntervalMs);
}

class EthersAuctionFinalizer implements AuctionFinalizer {
  constructor(private readonly contract: Contract) {}

  async triggerFinalize(
    auctionId: bigint,
    options: { executionNonce: number; priorityFeeGwei: number }
  ): Promise<{ txHash?: string; gasUsed?: bigint; incentiveWei?: bigint }> {
    const auction = await this.contract.getAuction(auctionId);
    const rewardEstimate = estimateFinalizeReward(BigInt(auction[4].toString()));

    const tx = await this.contract.triggerFinalize(auctionId, {
      maxPriorityFeePerGas: parseUnits(options.priorityFeeGwei.toString(), "gwei")
    });
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      gasUsed: receipt?.gasUsed ? BigInt(receipt.gasUsed.toString()) : undefined,
      incentiveWei: rewardEstimate
    };
  }
}

class EthersResolutionWriter {
  constructor(private readonly contract: Contract) {}

  async submitResolution(payload: AttestationPayload, proof: AttestationProofEnvelope): Promise<{ txHash?: string }> {
    const encodedProof = AbiCoder.defaultAbiCoder().encode(
      [
        "tuple(uint256 auctionId, bytes32 requestId, address winner, bytes32 winnerCiphertext, uint256 winningAmount, address[] operators, bytes[] signatures)"
      ],
      [[payload.auctionId, payload.requestId, payload.winner, payload.winnerCiphertext, payload.winningAmount, proof.operators, proof.signatures]]
    );

    const tx = await this.contract["submitResolution(uint256,address,bytes32,uint256,bytes)"](
      payload.auctionId,
      payload.winner,
      payload.winnerCiphertext,
      payload.winningAmount,
      encodedProof
    );

    await tx.wait();
    return { txHash: tx.hash };
  }
}

class StoreBackedDispatchQueue implements BatchDispatchQueue {
  constructor(private readonly store: AuctionStateStore) {}

  async enqueue(job: CoFheDispatchJob): Promise<void> {
    await this.store.enqueueDispatchJob({
      auctionId: job.auctionId,
      requestId: job.requestId,
      winnerHandle: job.winnerHandle,
      amountHandle: job.amountHandle,
      bids: job.bids.map((bid) => ({ ...bid })),
      enqueuedAtMs: Date.now()
    });
  }

  async takeBatch(maxBatchSize: number): Promise<CoFheDispatchJob[]> {
    const jobs = await this.store.listPendingDispatchJobs(maxBatchSize);
    return jobs.map(toDispatchJob);
  }

  async hasPending(requestId: string): Promise<boolean> {
    return this.store.hasPendingDispatchJob(requestId);
  }

  async getCompleted(_requestId: string): Promise<CoFheResolution | undefined> {
    return undefined;
  }

  async markCompleted(requestId: string): Promise<void> {
    await this.store.markDispatchJobCompleted(requestId, Date.now());
  }
}

function toDispatchJob(job: StoredDispatchJob): CoFheDispatchJob {
  return {
    auctionId: job.auctionId,
    requestId: job.requestId,
    winnerHandle: job.winnerHandle,
    amountHandle: job.amountHandle,
    bids: job.bids.map((bid) => ({ ...bid }))
  };
}

async function synchronizeAuctionsFromChain(
  marketContract: Contract,
  monitor: AuctionMonitor,
  store: AuctionStateStore
): Promise<void> {
  const totalAuctions = Number(await marketContract.auctionCounter());

  for (let auctionId = 1; auctionId <= totalAuctions; auctionId += 1) {
    const numericAuctionId = BigInt(auctionId);
    const existing = await store.getAuction(numericAuctionId);
    if (!existing || existing.state === 1n || existing.state === 2n) {
      await monitor.synchronizeAuction(numericAuctionId);
    }
  }
}

async function enqueuePendingResolutionJobs(
  marketContract: Contract,
  monitor: AuctionMonitor,
  store: AuctionStateStore
): Promise<void> {
  const auctions = await store.listAuctions();

  for (const auction of auctions) {
    if (auction.state !== 2n) {
      continue;
    }

    let request;
    try {
      request = await monitor.inspectTriggeredAuction(auction.auctionId);
    } catch {
      continue;
    }

    if (await store.hasPendingDispatchJob(request.requestId)) {
      continue;
    }
    if (await store.getResolutionArtifact(request.requestId)) {
      continue;
    }

    const bids = await collectEncryptedBidsFromChain(marketContract, auction.auctionId);
    await store.enqueueDispatchJob({
      auctionId: auction.auctionId,
      requestId: request.requestId,
      winnerHandle: request.winnerHandle,
      amountHandle: request.amountHandle,
      bids,
      enqueuedAtMs: Date.now()
    });
  }
}

async function collectEncryptedBidsFromChain(marketContract: Contract, auctionId: bigint): Promise<StoredDispatchJob["bids"]> {
  const bidders = (await marketContract.getBidders(auctionId)) as string[];
  const bids: StoredDispatchJob["bids"] = [];

  for (const bidder of bidders) {
    bids.push({
      bidder,
      encryptedBid: await marketContract.getEncryptedBid(auctionId, bidder),
      availableEscrow: BigInt((await marketContract.escrowBalances(auctionId, bidder)).toString())
    });
  }

  return bids;
}

function createWalletOrUndefined(rawPrivateKey: string | undefined, provider: JsonRpcProvider): Wallet | undefined {
  if (!isValidPrivateKey(rawPrivateKey)) {
    return undefined;
  }

  return new Wallet(rawPrivateKey, provider);
}

function isValidPrivateKey(rawPrivateKey: string | undefined): rawPrivateKey is string {
  return rawPrivateKey !== undefined && /^0x[0-9a-fA-F]{64}$/.test(rawPrivateKey);
}

function normalizeWinnerAddress(winner: string | null): string {
  return winner === null || winner.trim() === "" ? ZeroAddress : winner;
}

main().catch((error) => {
  console.error("[keeper] fatal error", error);
  process.exitCode = 1;
});
