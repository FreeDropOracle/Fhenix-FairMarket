import "dotenv/config";

import { createServer } from "node:http";

import { Contract, JsonRpcProvider, WebSocketProvider, Wallet, parseUnits } from "ethers";

import { createKeeperConfigFromEnv } from "./config";
import { AuctionMonitor, estimateFinalizeReward, type AuctionFinalizer, type MarketMonitorReader } from "./services/auctionMonitor";
import { AvsSubmitter } from "./services/avsSubmitter";
import { CofheDispatcher } from "./services/cofheDispatcher";
import { FileBackedAuctionStateStore } from "./stores/auctionStateStore";
import { InMemoryLockCoordinator, RedisLockCoordinator } from "./stores/lockCoordinator";
import { JsonSlashingLogStore } from "./stores/slashingLogStore";

const MARKET_ABI = [
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 endTime, uint256 sellerDeposit, bool isVickrey)",
  "function getAuction(uint256 auctionId) view returns (address nftContract, uint256 tokenId, address seller, uint64 endTime, uint256 sellerDeposit, uint8 state, bool isVickrey, uint64 lastBlockTimestamp, bytes32 winnerCiphertext, uint256 winningAmount)",
  "function getResolutionRequest(uint256 auctionId) view returns (bytes32 requestId, bytes32 winnerHandle, bytes32 amountHandle, uint64 requestedAt)",
  "function triggerFinalize(uint256 auctionId) external"
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
  const wsProvider = new WebSocketProvider(config.websocketUrl);
  const readContract = new Contract(config.marketAddress, MARKET_ABI, rpcProvider);
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

  if (process.env.PRIVATE_KEY) {
    const signer = new Wallet(process.env.PRIVATE_KEY, rpcProvider);
    const writeContract = new Contract(config.marketAddress, MARKET_ABI, signer);
    finalizer = new EthersAuctionFinalizer(writeContract);
  }

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

  setInterval(async () => {
    metrics.loopRuns += 1;
    try {
      const results = await monitor.executeDueFinalizations("auction-monitor", finalizer);
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
  const dispatcher = new CofheDispatcher();
  console.log(`[keeper] cofhe-dispatcher ready for batches up to ${config.maxBatchSize} auctions`);

  setInterval(async () => {
    metrics.loopRuns += 1;
    try {
      const results = await dispatcher.dispatchPendingBatch();
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
  const slashingLogStore = new JsonSlashingLogStore(config.slashingLogPath);
  await slashingLogStore.hydrate();
  const submitter = new AvsSubmitter(config.avsThreshold, slashingLogStore);

  console.log(`[keeper] avs-submitter ready with threshold ${config.avsThreshold}`);

  setInterval(async () => {
    metrics.loopRuns += 1;
    try {
      const slashingRecords = await slashingLogStore.list();
      metrics.lastSuccessAt = Date.now();
      metrics.lastError = "";
      console.log(`[keeper] avs-submitter heartbeat, slashing-records=${slashingRecords.length}`);
      void submitter;
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

main().catch((error) => {
  console.error("[keeper] fatal error", error);
  process.exitCode = 1;
});
