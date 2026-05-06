import "dotenv/config";

import { createServer } from "node:http";

import { AbiCoder, Contract, JsonRpcProvider, Wallet, WebSocketProvider, ZeroAddress, ZeroHash, getBytes, parseUnits } from "ethers";

import { createKeeperConfigFromEnv } from "./config";
import { AuctionMonitor, estimateFinalizeReward, type AuctionFinalizer, type MarketMonitorReader } from "./services/auctionMonitor";
import { AvsSubmitter, type AVSOperatorSigner, type AttestationPayload, type AttestationProofEnvelope } from "./services/avsSubmitter";
import {
  CofheDispatcher,
  createFheosBatchClient,
  type DispatchMetricsSnapshot,
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
  "function getAuctionStartingPrice(uint256 auctionId) view returns (uint256)",
  "function getResolutionRequest(uint256 auctionId) view returns (bytes32 requestId, bytes32 winnerHandle, bytes32 amountHandle, uint64 requestedAt)",
  "function getBidders(uint256 auctionId) view returns (address[])",
  "function getShieldedCommitments(uint256 auctionId) view returns (bytes32[])",
  "function getEncryptedBid(uint256 auctionId, address bidder) view returns (bytes32)",
  "function getShieldedEncryptedBid(uint256 auctionId, bytes32 commitmentHash) view returns (bytes32)",
  "function escrowBalances(uint256 auctionId, address bidder) view returns (uint256)",
  "function shieldedEscrowVault() view returns (address)",
  "function shieldedIdentityRegistry() view returns (address)",
  "function triggerFinalize(uint256 auctionId) external",
  "function submitResolution(uint256 auctionId, address winner, bytes32 winnerCiphertext, uint256 winningAmount, bytes avsProof) external returns (bool)",
  "function submitShieldedResolution(uint256 auctionId, bytes32 winnerIdentityHash, bytes32 winnerCiphertext, uint256 winningAmount, bytes avsProof) external returns (bool)"
];

const AVS_ABI = [
  "function computeDigest(address market, uint256 auctionId, bytes32 requestId, address winner, bytes32 winnerCiphertext, uint256 winningAmount) view returns (bytes32)",
  "function computeShieldedDigest(address market, uint256 auctionId, bytes32 requestId, bytes32 winnerIdentity, bytes32 winnerCiphertext, uint256 winningAmount) view returns (bytes32)"
];

const SHIELDED_VAULT_ABI = [
  "function commitmentState(bytes32 commitmentHash) view returns (uint256 auctionId, bool refundUnlocked, bool claimed)",
  "function previewCommitment(bytes32 commitmentHash) view returns (uint256 auctionId, uint256 amount, bool refundUnlocked, bool claimed)"
];

const SHIELDED_IDENTITY_REGISTRY_ABI = [
  "function identityForCommitment(uint256 auctionId, bytes32 commitmentHash) view returns (bytes32)"
];

type RuntimeMetrics = {
  activeAuctions: number;
  averageDispatchLatencyMs: number;
  averageResolutionSubmitLatencyMs: number;
  failedBatches: number;
  failedRequests: number;
  finalizedAuctions: number;
  lastError: string;
  lastErrorAt: number;
  lastLoopDurationMs: number;
  lastResolutionSubmissionAt: number;
  lastSuccessAt: number;
  loopRuns: number;
  pendingDispatchJobs: number;
  pendingResolutionArtifacts: number;
  resolvingAuctions: number;
  slashingViolations: number;
  submittedResolutionArtifacts: number;
  successfulBatches: number;
  successfulRequests: number;
  trackedAuctions: number;
  voidedAuctions: number;
};

async function main(): Promise<void> {
  const config = createKeeperConfigFromEnv();
  const role = (process.argv[2] ?? process.env.KEEPER_ROLE ?? "auction-monitor").toLowerCase();
  const metrics: RuntimeMetrics = {
    activeAuctions: 0,
    averageDispatchLatencyMs: 0,
    averageResolutionSubmitLatencyMs: 0,
    failedBatches: 0,
    failedRequests: 0,
    finalizedAuctions: 0,
    lastError: "",
    lastErrorAt: 0,
    lastLoopDurationMs: 0,
    lastResolutionSubmissionAt: 0,
    lastSuccessAt: 0,
    loopRuns: 0,
    pendingDispatchJobs: 0,
    pendingResolutionArtifacts: 0,
    resolvingAuctions: 0,
    slashingViolations: 0,
    submittedResolutionArtifacts: 0,
    successfulBatches: 0,
    successfulRequests: 0,
    trackedAuctions: 0,
    voidedAuctions: 0
  };

  const server = createServer((request, response) => {
    if (request.url === "/metrics") {
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      response.end(renderPrometheusMetrics(role, metrics));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        role,
        ok: true,
        metrics
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
  metrics: RuntimeMetrics
): Promise<void> {
  const store = new FileBackedAuctionStateStore(config.stateFilePath);
  await store.hydrate();
  applyStoreSnapshot(metrics, await buildStoreMetricsSnapshot(store));

  const lockCoordinator =
    config.redisUrl.trim() === "" ? new InMemoryLockCoordinator() : new RedisLockCoordinator(config.redisUrl);

  if (config.marketAddress.trim() === "") {
    console.log("[keeper] auction-monitor started in dry-run mode because KEEPER_MARKET_ADDRESS is empty");
    setInterval(() => {
      const startedAt = Date.now();
      metrics.loopRuns += 1;
      metrics.lastSuccessAt = Date.now();
      metrics.lastLoopDurationMs = Date.now() - startedAt;
    }, config.pollIntervalMs);
    return;
  }

  const rpcProvider = new JsonRpcProvider(config.rpcUrl);
  const readContract = new Contract(config.marketAddress, MARKET_ABI, rpcProvider);
  const wallet = createWalletOrUndefined(process.env.PRIVATE_KEY, rpcProvider);
  const privilegedReadContract = wallet ? new Contract(config.marketAddress, MARKET_ABI, wallet) : readContract;
  const monitor = new AuctionMonitor(
    readContract as unknown as MarketMonitorReader,
    config,
    store,
    lockCoordinator
  );

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
  await enqueuePendingResolutionJobs(privilegedReadContract, monitor, store);

  setInterval(async () => {
    const startedAt = Date.now();
    metrics.loopRuns += 1;
    try {
      await synchronizeAuctionsFromChain(readContract, monitor, store);
      const results = await monitor.executeDueFinalizations("auction-monitor", finalizer);
      await synchronizeAuctionsFromChain(readContract, monitor, store);
      await enqueuePendingResolutionJobs(privilegedReadContract, monitor, store);

      applyStoreSnapshot(metrics, await buildStoreMetricsSnapshot(store));
      metrics.lastLoopDurationMs = Date.now() - startedAt;
      metrics.lastSuccessAt = Date.now();
      metrics.lastError = "";
      metrics.lastErrorAt = 0;

      for (const result of results) {
        console.log(
          `[keeper] finalize ${result.auctionId.toString()} success=${result.success} reward=${result.rewardEstimateWei.toString()} nonce=${result.executionNonce}`
        );
      }
    } catch (error) {
      metrics.lastLoopDurationMs = Date.now() - startedAt;
      metrics.lastError = error instanceof Error ? error.message : String(error);
      metrics.lastErrorAt = Date.now();
      console.error("[keeper] auction-monitor loop failed", error);
    }
  }, config.pollIntervalMs);
}

async function startDispatcher(
  config: ReturnType<typeof createKeeperConfigFromEnv>,
  metrics: RuntimeMetrics
): Promise<void> {
  const store = new FileBackedAuctionStateStore(config.stateFilePath);
  await store.hydrate();
  applyStoreSnapshot(metrics, await buildStoreMetricsSnapshot(store));

  const queue = new StoreBackedDispatchQueue(store);
  const hasLiveFheos =
    config.fheosEndpoint.trim() !== "" &&
    config.fheosApiKey.trim() !== "" &&
    !config.fheosApiKey.includes("replace-with-your-key");
  if (!hasLiveFheos && config.allowLocalCofheSimulation) {
    console.warn("[keeper] local CoFHE simulation enabled; do not use this mode for public-network bid privacy");
  }
  if (!hasLiveFheos && !config.allowLocalCofheSimulation) {
    console.warn("[keeper] live CoFHE endpoint is not configured; dispatcher will not decode prototype bid handles");
  }

  const client = createFheosBatchClient(config);
  const dispatcher = new CofheDispatcher(queue, () => Date.now(), config, client);

  console.log(`[keeper] cofhe-dispatcher ready for batches up to ${config.maxBatchSize} auctions`);

  setInterval(async () => {
    const startedAt = Date.now();
    metrics.loopRuns += 1;
    try {
      await store.hydrate();
      const results = await dispatcher.dispatchPendingBatch();
      const storedAtMs = Date.now();

      for (const resolution of results) {
        await store.storeResolutionArtifact({
          requestId: resolution.requestId,
          auctionId: resolution.auctionId,
          winner: normalizeWinnerIdentity(resolution.winnerKind, resolution.winner),
          winnerKind: resolution.winnerKind,
          winnerCiphertext: resolution.winnerCiphertext,
          avsProof: resolution.avsProof,
          winningAmount: resolution.winningAmount,
          storedAtMs
        });
      }

      applyStoreSnapshot(metrics, await buildStoreMetricsSnapshot(store));
      applyDispatchSnapshot(metrics, dispatcher.getMetricsSnapshot());
      metrics.lastLoopDurationMs = Date.now() - startedAt;
      metrics.lastSuccessAt = Date.now();
      metrics.lastError = "";
      metrics.lastErrorAt = 0;

      if (results.length > 0) {
        console.log(`[keeper] dispatched ${results.length} queued CoFHE requests`);
      }
    } catch (error) {
      applyDispatchSnapshot(metrics, dispatcher.getMetricsSnapshot());
      metrics.lastLoopDurationMs = Date.now() - startedAt;
      metrics.lastError = error instanceof Error ? error.message : String(error);
      metrics.lastErrorAt = Date.now();
      console.error("[keeper] cofhe-dispatcher loop failed", error);
    }
  }, config.pollIntervalMs);
}

async function startAvsSubmitter(
  config: ReturnType<typeof createKeeperConfigFromEnv>,
  metrics: RuntimeMetrics
): Promise<void> {
  const store = new FileBackedAuctionStateStore(config.stateFilePath);
  await store.hydrate();

  const slashingLogStore = new JsonSlashingLogStore(config.slashingLogPath);
  await slashingLogStore.hydrate();
  applyStoreSnapshot(metrics, await buildStoreMetricsSnapshot(store));
  metrics.slashingViolations = (await slashingLogStore.list()).length;
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
    const startedAt = Date.now();
    metrics.loopRuns += 1;
    try {
      await store.hydrate();
      const pendingArtifacts = await store.listPendingResolutionArtifacts(config.maxBatchSize);

      if (writer && digestReader && operatorSigners.length >= config.avsThreshold) {
        for (const artifact of pendingArtifacts) {
          const currentState = await writer.getAuctionState(artifact.auctionId);
          if (currentState !== 2n) {
            await store.updateAuctionState(artifact.auctionId, currentState, Date.now());
            await store.markResolutionArtifactSubmitted(artifact.requestId, Date.now());
            continue;
          }

          const payload: AttestationPayload = {
            auctionId: artifact.auctionId,
            requestId: artifact.requestId,
            winner: artifact.winner,
            winnerKind: artifact.winnerKind ?? "public",
            winnerCiphertext: artifact.winnerCiphertext,
            winningAmount: artifact.winningAmount
          };

          try {
            const digest =
              payload.winnerKind === "shielded"
                ? await digestReader.computeShieldedDigest(
                    config.marketAddress,
                    payload.auctionId,
                    payload.requestId,
                    payload.winner,
                    payload.winnerCiphertext,
                    payload.winningAmount
                  )
                : await digestReader.computeDigest(
                    config.marketAddress,
                    payload.auctionId,
                    payload.requestId,
                    payload.winner,
                    payload.winnerCiphertext,
                    payload.winningAmount
                  );

            const proof = await submitter.submitVerifiedResolution(payload, payload, digest, operatorSigners, writer);
            await store.markResolutionArtifactSubmitted(artifact.requestId, Date.now());
            metrics.lastResolutionSubmissionAt = Date.now();
            console.log(
              `[keeper] submitted resolution ${artifact.requestId} for auction ${artifact.auctionId.toString()} with ${proof.signerCount} AVS signatures`
            );
          } catch (error) {
            const refreshedState = await writer.getAuctionState(artifact.auctionId).catch(() => undefined);
            if (refreshedState !== undefined && refreshedState !== 2n) {
              await store.updateAuctionState(artifact.auctionId, refreshedState, Date.now());
              await store.markResolutionArtifactSubmitted(artifact.requestId, Date.now());
              continue;
            }

            const reason = error instanceof Error ? error.message : String(error);
            await submitter.recordSlashingViolation(artifact.requestId, artifact.auctionId, reason, operatorSigners.map((operator) => operator.address));
            throw error;
          }
        }
      }

      applyStoreSnapshot(metrics, await buildStoreMetricsSnapshot(store));
      metrics.slashingViolations = (await slashingLogStore.list()).length;
      metrics.lastLoopDurationMs = Date.now() - startedAt;
      metrics.lastSuccessAt = Date.now();
      metrics.lastError = "";
      metrics.lastErrorAt = 0;
      console.log(`[keeper] avs-submitter heartbeat, pending-artifacts=${pendingArtifacts.length}`);
    } catch (error) {
      metrics.slashingViolations = (await slashingLogStore.list()).length;
      metrics.lastLoopDurationMs = Date.now() - startedAt;
      metrics.lastError = error instanceof Error ? error.message : String(error);
      metrics.lastErrorAt = Date.now();
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
    const feeOverrides = {
      maxPriorityFeePerGas: parseUnits(options.priorityFeeGwei.toString(), "gwei")
    };

    let tx;
    try {
      tx = await this.contract.triggerFinalize(auctionId, feeOverrides);
    } catch (error) {
      if (!shouldRetryFinalizeWithManualGas(error)) {
        throw error;
      }

      tx = await this.contract.triggerFinalize(auctionId, {
        ...feeOverrides,
        gasLimit: 800_000n
      });
    }
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

  async getAuctionState(auctionId: bigint): Promise<bigint> {
    const auction = await this.contract.getAuction(auctionId);
    return BigInt(auction[5].toString());
  }

  async submitResolution(payload: AttestationPayload, proof: AttestationProofEnvelope): Promise<{ txHash?: string }> {
    const tx =
      payload.winnerKind === "shielded"
        ? await this.contract.submitShieldedResolution(
            payload.auctionId,
            payload.winner,
            payload.winnerCiphertext,
            payload.winningAmount,
            AbiCoder.defaultAbiCoder().encode(
              [
                "tuple(uint256 auctionId, bytes32 requestId, bytes32 winnerIdentity, bytes32 winnerCiphertext, uint256 winningAmount, address[] operators, bytes[] signatures)"
              ],
              [
                [
                  payload.auctionId,
                  payload.requestId,
                  payload.winner,
                  payload.winnerCiphertext,
                  payload.winningAmount,
                  proof.operators,
                  proof.signatures
                ]
              ]
            )
          )
        : await this.contract["submitResolution(uint256,address,bytes32,uint256,bytes)"](
            payload.auctionId,
            payload.winner,
            payload.winnerCiphertext,
            payload.winningAmount,
            AbiCoder.defaultAbiCoder().encode(
              [
                "tuple(uint256 auctionId, bytes32 requestId, address winner, bytes32 winnerCiphertext, uint256 winningAmount, address[] operators, bytes[] signatures)"
              ],
              [
                [
                  payload.auctionId,
                  payload.requestId,
                  payload.winner,
                  payload.winnerCiphertext,
                  payload.winningAmount,
                  proof.operators,
                  proof.signatures
                ]
              ]
            )
          );

    await tx.wait();
    return { txHash: tx.hash };
  }
}

function shouldRetryFinalizeWithManualGas(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    shortMessage?: string;
    message?: string;
    info?: { error?: { code?: number; message?: string } };
  };

  if (candidate.code === "UNPREDICTABLE_GAS_LIMIT") {
    return true;
  }
  if (candidate.code === "CALL_EXCEPTION" && !candidate.info?.error?.code) {
    return true;
  }

  const combinedMessage = [
    candidate.shortMessage,
    candidate.message,
    candidate.info?.error?.message
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return /estimateGas|missing revert data|execution reverted/i.test(combinedMessage);
}

class StoreBackedDispatchQueue implements BatchDispatchQueue {
  constructor(private readonly store: AuctionStateStore) {}

  async enqueue(job: CoFheDispatchJob): Promise<void> {
    await this.store.enqueueDispatchJob({
      auctionId: job.auctionId,
      requestId: job.requestId,
      winnerHandle: job.winnerHandle,
      amountHandle: job.amountHandle,
      startingPrice: job.startingPrice,
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
    startingPrice: job.startingPrice,
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
    const startingPrice = BigInt((await marketContract.getAuctionStartingPrice(auction.auctionId)).toString());
    await store.enqueueDispatchJob({
      auctionId: auction.auctionId,
      requestId: request.requestId,
      winnerHandle: request.winnerHandle,
      amountHandle: request.amountHandle,
      startingPrice,
      bids,
      enqueuedAtMs: Date.now()
    });
  }
}

async function collectEncryptedBidsFromChain(marketContract: Contract, auctionId: bigint): Promise<StoredDispatchJob["bids"]> {
  const bidders = (await marketContract.getBidders(auctionId)) as string[];
  const shieldedCommitments = (await marketContract.getShieldedCommitments(auctionId)) as string[];
  const bids: StoredDispatchJob["bids"] = [];

  for (const bidder of bidders) {
    bids.push({
      bidder,
      encryptedBid: await marketContract.getEncryptedBid(auctionId, bidder),
      availableEscrow: BigInt((await marketContract.escrowBalances(auctionId, bidder)).toString()),
      isShielded: false
    });
  }

  if (shieldedCommitments.length > 0) {
    const shieldedVaultAddress = String(await marketContract.shieldedEscrowVault());
    const shieldedRegistryAddress = String(await marketContract.shieldedIdentityRegistry());
    if (shieldedVaultAddress && shieldedVaultAddress !== ZeroAddress) {
      const vaultContract = new Contract(shieldedVaultAddress, SHIELDED_VAULT_ABI, marketContract.runner);
      const registryContract =
        shieldedRegistryAddress && shieldedRegistryAddress !== ZeroAddress
          ? new Contract(shieldedRegistryAddress, SHIELDED_IDENTITY_REGISTRY_ABI, marketContract.runner)
          : undefined;

      for (const commitmentHash of shieldedCommitments) {
        const [commitmentAuctionId, refundUnlocked, claimed] = (await vaultContract.commitmentState(
          commitmentHash
        )) as readonly [bigint, boolean, boolean];
        if (commitmentAuctionId !== auctionId || refundUnlocked || claimed) {
          continue;
        }
        let availableEscrow: bigint;
        try {
          const [previewAuctionId, amount, previewRefundUnlocked, previewClaimed] = (await vaultContract.previewCommitment(
            commitmentHash
          )) as readonly [bigint, bigint, boolean, boolean];
          if (previewAuctionId !== auctionId || previewRefundUnlocked || previewClaimed) {
            continue;
          }
          availableEscrow = BigInt(amount.toString());
        } catch (error) {
          console.warn(
            `[keeper] skipped shielded commitment ${commitmentHash} for auction ${auctionId.toString()} because amount preview failed: ${normalizeError(error).message}`
          );
          continue;
        }
        const identityHash =
          registryContract === undefined
            ? ZeroHash
            : String(await registryContract.identityForCommitment(auctionId, commitmentHash));
        bids.push({
          bidder: identityHash === ZeroHash ? commitmentHash : identityHash,
          encryptedBid: await marketContract.getShieldedEncryptedBid(auctionId, commitmentHash),
          availableEscrow,
          isShielded: true
        });
      }
    }
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

function normalizeWinnerIdentity(
  winnerKind: "public" | "shielded" | "none",
  winner: string | null
): string {
  if (winner === null || winner.trim() === "") {
    return winnerKind === "shielded" ? ZeroAddress : ZeroAddress;
  }

  return winner;
}

async function buildStoreMetricsSnapshot(store: AuctionStateStore): Promise<{
  activeAuctions: number;
  averageResolutionSubmitLatencyMs: number;
  finalizedAuctions: number;
  lastResolutionSubmissionAt: number;
  pendingDispatchJobs: number;
  pendingResolutionArtifacts: number;
  resolvingAuctions: number;
  submittedResolutionArtifacts: number;
  trackedAuctions: number;
  voidedAuctions: number;
}> {
  const [auctions, dispatchJobs, resolutions] = await Promise.all([
    store.listAuctions(),
    store.listDispatchJobs(),
    store.listResolutionArtifacts()
  ]);

  let activeAuctions = 0;
  let resolvingAuctions = 0;
  let finalizedAuctions = 0;
  let voidedAuctions = 0;

  for (const auction of auctions) {
    if (auction.state === 1n) {
      activeAuctions += 1;
    } else if (auction.state === 2n) {
      resolvingAuctions += 1;
    } else if (auction.state === 3n) {
      finalizedAuctions += 1;
    } else if (auction.state === 5n) {
      voidedAuctions += 1;
    }
  }

  const pendingDispatchJobs = dispatchJobs.filter((job) => job.dispatchedAtMs === undefined).length;
  const pendingResolutionArtifacts = resolutions.filter((artifact) => artifact.submittedAtMs === undefined).length;
  const submittedArtifacts = resolutions.filter((artifact) => artifact.submittedAtMs !== undefined);
  const totalSubmitLatencyMs = submittedArtifacts.reduce(
    (total, artifact) => total + ((artifact.submittedAtMs as number) - artifact.storedAtMs),
    0
  );

  return {
    activeAuctions,
    averageResolutionSubmitLatencyMs:
      submittedArtifacts.length === 0 ? 0 : totalSubmitLatencyMs / submittedArtifacts.length,
    finalizedAuctions,
    lastResolutionSubmissionAt: submittedArtifacts.reduce(
      (latest, artifact) => Math.max(latest, artifact.submittedAtMs as number),
      0
    ),
    pendingDispatchJobs,
    pendingResolutionArtifacts,
    resolvingAuctions,
    submittedResolutionArtifacts: submittedArtifacts.length,
    trackedAuctions: auctions.length,
    voidedAuctions
  };
}

function applyStoreSnapshot(
  metrics: RuntimeMetrics,
  snapshot: Awaited<ReturnType<typeof buildStoreMetricsSnapshot>>
): void {
  metrics.activeAuctions = snapshot.activeAuctions;
  metrics.averageResolutionSubmitLatencyMs = snapshot.averageResolutionSubmitLatencyMs;
  metrics.finalizedAuctions = snapshot.finalizedAuctions;
  metrics.lastResolutionSubmissionAt = snapshot.lastResolutionSubmissionAt;
  metrics.pendingDispatchJobs = snapshot.pendingDispatchJobs;
  metrics.pendingResolutionArtifacts = snapshot.pendingResolutionArtifacts;
  metrics.resolvingAuctions = snapshot.resolvingAuctions;
  metrics.submittedResolutionArtifacts = snapshot.submittedResolutionArtifacts;
  metrics.trackedAuctions = snapshot.trackedAuctions;
  metrics.voidedAuctions = snapshot.voidedAuctions;
}

function applyDispatchSnapshot(metrics: RuntimeMetrics, snapshot: DispatchMetricsSnapshot): void {
  metrics.averageDispatchLatencyMs = snapshot.averageLatencyMs;
  metrics.failedBatches = snapshot.failedBatches;
  metrics.failedRequests = snapshot.failedRequests;
  metrics.successfulBatches = snapshot.successfulBatches;
  metrics.successfulRequests = snapshot.successfulRequests;
}

function renderPrometheusMetrics(role: string, metrics: RuntimeMetrics): string {
  return [
    "# HELP keeper_loop_runs Total service loop executions",
    "# TYPE keeper_loop_runs counter",
    `keeper_loop_runs{role="${role}"} ${metrics.loopRuns}`,
    "# HELP keeper_last_success_at Unix milliseconds of the last successful loop",
    "# TYPE keeper_last_success_at gauge",
    `keeper_last_success_at{role="${role}"} ${metrics.lastSuccessAt}`,
    "# HELP keeper_last_error_at Unix milliseconds of the last recorded error",
    "# TYPE keeper_last_error_at gauge",
    `keeper_last_error_at{role="${role}"} ${metrics.lastErrorAt}`,
    "# HELP keeper_last_loop_duration_ms Duration of the last loop execution in milliseconds",
    "# TYPE keeper_last_loop_duration_ms gauge",
    `keeper_last_loop_duration_ms{role="${role}"} ${metrics.lastLoopDurationMs}`,
    "# HELP keeper_tracked_auctions Number of auctions tracked in keeper state",
    "# TYPE keeper_tracked_auctions gauge",
    `keeper_tracked_auctions{role="${role}"} ${metrics.trackedAuctions}`,
    "# HELP keeper_active_auctions Number of active auctions in keeper state",
    "# TYPE keeper_active_auctions gauge",
    `keeper_active_auctions{role="${role}"} ${metrics.activeAuctions}`,
    "# HELP keeper_resolving_auctions Number of resolving auctions awaiting settlement",
    "# TYPE keeper_resolving_auctions gauge",
    `keeper_resolving_auctions{role="${role}"} ${metrics.resolvingAuctions}`,
    "# HELP keeper_finalized_auctions Number of finalized auctions recorded in keeper state",
    "# TYPE keeper_finalized_auctions gauge",
    `keeper_finalized_auctions{role="${role}"} ${metrics.finalizedAuctions}`,
    "# HELP keeper_voided_auctions Number of voided auctions recorded in keeper state",
    "# TYPE keeper_voided_auctions gauge",
    `keeper_voided_auctions{role="${role}"} ${metrics.voidedAuctions}`,
    "# HELP keeper_pending_dispatch_jobs Pending CoFHE dispatch jobs",
    "# TYPE keeper_pending_dispatch_jobs gauge",
    `keeper_pending_dispatch_jobs{role="${role}"} ${metrics.pendingDispatchJobs}`,
    "# HELP keeper_pending_resolution_artifacts Pending AVS submission artifacts",
    "# TYPE keeper_pending_resolution_artifacts gauge",
    `keeper_pending_resolution_artifacts{role="${role}"} ${metrics.pendingResolutionArtifacts}`,
    "# HELP keeper_submitted_resolution_artifacts Submitted resolution artifacts",
    "# TYPE keeper_submitted_resolution_artifacts gauge",
    `keeper_submitted_resolution_artifacts{role="${role}"} ${metrics.submittedResolutionArtifacts}`,
    "# HELP keeper_average_dispatch_latency_ms Average CoFHE dispatch latency",
    "# TYPE keeper_average_dispatch_latency_ms gauge",
    `keeper_average_dispatch_latency_ms{role="${role}"} ${metrics.averageDispatchLatencyMs}`,
    "# HELP keeper_average_resolution_submit_latency_ms Average AVS submission latency",
    "# TYPE keeper_average_resolution_submit_latency_ms gauge",
    `keeper_average_resolution_submit_latency_ms{role="${role}"} ${metrics.averageResolutionSubmitLatencyMs}`,
    "# HELP keeper_last_resolution_submission_at Unix milliseconds of the most recent AVS submission",
    "# TYPE keeper_last_resolution_submission_at gauge",
    `keeper_last_resolution_submission_at{role="${role}"} ${metrics.lastResolutionSubmissionAt}`,
    "# HELP keeper_successful_batches Total successful CoFHE batches",
    "# TYPE keeper_successful_batches counter",
    `keeper_successful_batches{role="${role}"} ${metrics.successfulBatches}`,
    "# HELP keeper_failed_batches Total failed CoFHE batches",
    "# TYPE keeper_failed_batches counter",
    `keeper_failed_batches{role="${role}"} ${metrics.failedBatches}`,
    "# HELP keeper_successful_requests Total successful encrypted resolution requests",
    "# TYPE keeper_successful_requests counter",
    `keeper_successful_requests{role="${role}"} ${metrics.successfulRequests}`,
    "# HELP keeper_failed_requests Total failed encrypted resolution requests",
    "# TYPE keeper_failed_requests counter",
    `keeper_failed_requests{role="${role}"} ${metrics.failedRequests}`,
    "# HELP keeper_slashing_violations_total Total recorded AVS slashing violations",
    "# TYPE keeper_slashing_violations_total gauge",
    `keeper_slashing_violations_total{role="${role}"} ${metrics.slashingViolations}`
  ].join("\n");
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

main().catch((error) => {
  console.error("[keeper] fatal error", error);
  process.exitCode = 1;
});
