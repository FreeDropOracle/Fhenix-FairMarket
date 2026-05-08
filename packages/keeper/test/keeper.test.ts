import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createKeeperConfigFromEnv } from "../config";
import {
  AuctionMonitor,
  computeExponentialBackoff,
  estimateFinalizeReward,
  type AuctionFinalizer,
  type MarketMonitorReader
} from "../services/auctionMonitor";
import { AvsSubmitter, aggregateSignatures, validateFraudProof } from "../services/avsSubmitter";
import {
  CofheDispatcher,
  HttpFheosBatchClient,
  InMemoryDispatchQueue,
  LocalCofheBatchClient,
  createFheosBatchClient,
  type CoFheDispatchJob
} from "../services/cofheDispatcher";
import { InMemoryAuctionStateStore } from "../stores/auctionStateStore";
import { InMemoryLockCoordinator } from "../stores/lockCoordinator";
import { JsonSlashingLogStore } from "../stores/slashingLogStore";

async function main(): Promise<void> {
  await runCase("config applies Phase 4 defaults and overrides", async () => {
    const config = createKeeperConfigFromEnv({
      KEEPER_POLL_INTERVAL_MS: "15000",
      KEEPER_MAX_BATCH_SIZE: "10",
      KEEPER_FHEOS_API_KEY: "secret",
      KEEPER_ALLOW_LOCAL_COFHE_SIMULATION: "true"
    });

    assert.equal(config.pollIntervalMs, 15_000);
    assert.equal(config.maxBatchSize, 10);
    assert.equal(config.fheosApiKey, "secret");
    assert.equal(config.finalizeLeadSeconds, 60);
    assert.equal(config.requestTimeoutMs, 120_000);
    assert.deepEqual(config.avsOperatorPrivateKeys, []);
    assert.equal(config.allowLocalCofheSimulation, true);
  });

  await runCase("auction monitor schedules due auctions, estimates reward, and records retries", async () => {
    const store = new InMemoryAuctionStateStore();
    const lockCoordinator = new InMemoryLockCoordinator(() => 1_000_000);
    const nowMs = 1_000_000;
    const reader: MarketMonitorReader = {
      getAuction: async () => [],
      getResolutionRequest: async () => ["0x0", "0x0", "0x0", 0n]
    };

    const monitor = new AuctionMonitor(
      reader,
      createKeeperConfigFromEnv({
        KEEPER_FINALIZE_LEAD_SECONDS: "60",
        KEEPER_MAX_RETRIES: "2",
        KEEPER_RETRY_BASE_DELAY_MS: "100"
      }),
      store,
      lockCoordinator,
      () => nowMs
    );

    await monitor.trackAuction({
      auctionId: 1n,
      state: 1n,
      endTime: 950n,
      sellerDeposit: 10_000n
    });

    const due = await monitor.planDueFinalizations(nowMs);
    assert.equal(due.length, 1);
    assert.equal(estimateFinalizeReward(due[0].sellerDeposit), 20n);

    let attempts = 0;
    const finalizer: AuctionFinalizer = {
      triggerFinalize: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary network issue");
        }

        return {
          txHash: "0xabc",
          gasUsed: 21_000n,
          incentiveWei: 20n
        };
      }
    };

    const result = await monitor.attemptFinalize(due[0], "keeper-a", finalizer);
    const finalizeAttempts = await store.listFinalizeAttempts();

    assert.equal(result.success, true);
    assert.equal(result.rewardEstimateWei, 20n);
    assert.equal(attempts, 2);
    assert.equal(finalizeAttempts.length, 2);
    assert.equal(finalizeAttempts[0].success, false);
    assert.equal(finalizeAttempts[1].success, true);
    assert.equal(computeExponentialBackoff(100, 2), 400);
  });

  await runCase("auction monitor records race conditions when another keeper already holds the lock", async () => {
    const store = new InMemoryAuctionStateStore();
    const lockCoordinator = new InMemoryLockCoordinator(() => 50_000);
    const reader: MarketMonitorReader = {
      getAuction: async () => [],
      getResolutionRequest: async () => ["0x0", "0x0", "0x0", 0n]
    };

    const monitor = new AuctionMonitor(reader, undefined, store, lockCoordinator, () => 50_000);
    await monitor.trackAuction({
      auctionId: 7n,
      state: 1n,
      endTime: 1n,
      sellerDeposit: 1_000n
    });

    await lockCoordinator.reserveLock(7n, "keeper-a", 60_000);
    const [auction] = await monitor.planDueFinalizations(50_000);
    const result = await monitor.attemptFinalize(auction, "keeper-b", {
      triggerFinalize: async () => ({})
    });

    const raceConditions = await store.listRaceConditions();
    assert.equal(result.acquired, false);
    assert.equal(raceConditions.length, 1);
    assert.equal(raceConditions[0].reason, "distributed-lock-held");
  });

  await runCase("auction monitor stops retrying once the chain state has already advanced", async () => {
    const store = new InMemoryAuctionStateStore();
    const readerState = { current: 1n };
    const reader: MarketMonitorReader = {
      getAuction: async () => ["0x0", 0n, "0x0", 900n, 1_000n, readerState.current, true, 0n, "0x0", 0n],
      getResolutionRequest: async () => ["0xreq", "0xwinner", "0xamount", 0n]
    };

    const monitor = new AuctionMonitor(
      reader,
      createKeeperConfigFromEnv({
        KEEPER_MAX_RETRIES: "3",
        KEEPER_RETRY_BASE_DELAY_MS: "10"
      }),
      store,
      new InMemoryLockCoordinator(() => 9_000),
      () => 9_000,
      async () => Promise.resolve()
    );

    await monitor.trackAuction({
      auctionId: 3n,
      state: 1n,
      endTime: 1n,
      sellerDeposit: 1_000n
    });

    let attempts = 0;
    const result = await monitor.attemptFinalize(
      {
        auctionId: 3n,
        state: 1n,
        endTime: 1n,
        sellerDeposit: 1_000n,
        trackedAtMs: 9_000,
        retryCount: 0
      },
      "keeper-a",
      {
        triggerFinalize: async () => {
          attempts += 1;
          readerState.current = 2n;
          throw new Error("already finalized elsewhere");
        }
      }
    );

    const syncedAuction = await store.getAuction(3n);
    assert.equal(attempts, 1);
    assert.equal(result.success, false);
    assert.equal(result.error, "auction-state-advanced:2");
    assert.equal(syncedAuction?.state, 2n);
  });

  await runCase("cofhe dispatcher enforces max batch size, rejects duplicates, and stores metrics", async () => {
    const queue = new InMemoryDispatchQueue();
    const dispatcher = new CofheDispatcher(
      queue,
      () => 1_000,
      createKeeperConfigFromEnv({
        KEEPER_MAX_BATCH_SIZE: "10"
      }),
      new LocalCofheBatchClient(() => 1_000)
    );

    const jobs = Array.from({ length: 12 }, (_, index) =>
      buildJob(BigInt(index + 1), `request-${index + 1}`, BigInt(index + 100))
    );
    for (const job of jobs) {
      await dispatcher.enqueue(job);
    }

    await assert.rejects(() => dispatcher.enqueue(jobs[0]), /Duplicate requestId/);

    const firstBatch = await dispatcher.dispatchPendingBatch();
    const secondBatch = await dispatcher.dispatchPendingBatch();
    const metrics = dispatcher.getMetricsSnapshot();

    assert.equal(firstBatch.length, 10);
    assert.equal(secondBatch.length, 2);
    assert.equal(metrics.successfulBatches, 2);
    assert.equal(metrics.successfulRequests, 12);
    assert.ok(metrics.averageLatencyMs >= 0);
    assert.equal((await queue.getCompleted("request-12"))?.winnerCiphertext, encodeEncryptedUint32(111n));
  });

  await runCase("cofhe dispatcher refuses prototype decoding unless local simulation is explicit", async () => {
    const dispatcher = new CofheDispatcher(new InMemoryDispatchQueue(), () => 2_500);
    await assert.rejects(() => dispatcher.dispatch(buildJob(9n, "request-no-local-fallback", 100n)), /Live CoFHE endpoint/);

    const localClient = createFheosBatchClient(
      createKeeperConfigFromEnv({
        KEEPER_ALLOW_LOCAL_COFHE_SIMULATION: "true"
      })
    );
    const [resolution] = await localClient.resolveBatch([buildJob(10n, "request-local-opt-in", 100n)], 1_000);

    assert.equal(resolution.winner, "0x00000000000000000000000000000000000000aa");
    assert.equal(resolution.winningAmount, 100n);
  });

  await runCase("cofhe dispatcher trusts explicit live provider results instead of local bid ranking", async () => {
    const dispatcher = new CofheDispatcher(
      new InMemoryDispatchQueue(),
      () => 2_750,
      undefined,
      {
        resolveBatch: async (jobs) =>
          jobs.map((job) => ({
            auctionId: job.auctionId,
            requestId: job.requestId,
            winnerHandle: job.winnerHandle,
            amountHandle: job.amountHandle,
            winner: "0x00000000000000000000000000000000000000bb",
            winnerKind: "public" as const,
            winnerCiphertext: job.bids[1].encryptedBid,
            winningAmount: 99n,
            latencyMs: 12,
            avsProof: "proof:live-provider"
          }))
      }
    );

    const resolution = await dispatcher.dispatch(buildJob(11n, "request-live-provider-authority", 100n));
    assert.equal(resolution.winner, "0x00000000000000000000000000000000000000bb");
    assert.equal(resolution.winningAmount, 99n);
    assert.equal(resolution.winnerCiphertext, encodeEncryptedUint32(99n));
  });

  await runCase("http cofhe client rejects malformed live winner results instead of inferring them locally", async () => {
    const client = new HttpFheosBatchClient(
      "https://fheos.example",
      "secret",
      async () =>
        ({
          ok: true,
          json: async () => [
            {
              auctionId: "12",
              requestId: "request-malformed-live-result",
              winnerHandle: "winner-request-malformed-live-result",
              amountHandle: "amount-request-malformed-live-result",
              winner: "0x00000000000000000000000000000000000000aa",
              winnerCiphertext: encodeEncryptedUint32(100n),
              winningAmount: "100",
              latencyMs: 7,
              avsProof: "proof:missing-kind"
            }
          ]
        }) as Response
    );

    await assert.rejects(
      () =>
        client.resolveBatch(
          [buildJob(12n, "request-malformed-live-result", 100n)],
          1_000
        ),
      /unsupported winnerKind|missing explicit winner metadata/
    );
  });

  await runCase("cofhe dispatcher respects the public opening bid and can yield a no-winner result", async () => {
    const dispatcher = new CofheDispatcher(new InMemoryDispatchQueue(), () => 2_000, undefined, new LocalCofheBatchClient());

    const resolution = await dispatcher.dispatch(buildJob(77n, "request-opening-floor", 450n, 500n));
    assert.equal(resolution.winner, null);
    assert.equal(resolution.winningAmount, 0n);
  });

  await runCase("cofhe dispatcher supports 96-bit confidential bids for live wei-sized amounts", async () => {
    const dispatcher = new CofheDispatcher(new InMemoryDispatchQueue(), () => 3_000, undefined, new LocalCofheBatchClient());
    const winningAmount = 1250000000000000000n;
    const resolution = await dispatcher.dispatch({
      auctionId: 88n,
      requestId: "request-live-wei",
      winnerHandle: "winner-request-live-wei",
      amountHandle: "amount-request-live-wei",
      startingPrice: 900000000000000000n,
      bids: [
        {
          bidder: "0x00000000000000000000000000000000000000aa",
          encryptedBid: encodeEncryptedUint96(winningAmount),
          availableEscrow: winningAmount + 500000000000000000n
        },
        {
          bidder: "0x00000000000000000000000000000000000000bb",
          encryptedBid: encodeEncryptedUint96(1150000000000000000n),
          availableEscrow: winningAmount + 500000000000000000n
        }
      ]
    });

    assert.equal(resolution.winner, "0x00000000000000000000000000000000000000aa");
    assert.equal(resolution.winningAmount, winningAmount);
  });

  await runCase("cofhe dispatcher skips shielded bids above their available escrow", async () => {
    const dispatcher = new CofheDispatcher(new InMemoryDispatchQueue(), () => 3_500, undefined, new LocalCofheBatchClient());
    const uncoveredAmount = 2_000n;
    const coveredAmount = 900n;
    const resolution = await dispatcher.dispatch({
      auctionId: 89n,
      requestId: "request-shielded-coverage",
      winnerHandle: "winner-request-shielded-coverage",
      amountHandle: "amount-request-shielded-coverage",
      startingPrice: 1n,
      bids: [
        {
          bidder: "0xshielded-undercovered",
          encryptedBid: encodeEncryptedUint96(uncoveredAmount),
          availableEscrow: 1n,
          isShielded: true
        },
        {
          bidder: "0xshielded-covered",
          encryptedBid: encodeEncryptedUint96(coveredAmount),
          availableEscrow: coveredAmount,
          isShielded: true
        }
      ]
    });

    assert.equal(resolution.winner, "0xshielded-covered");
    assert.equal(resolution.winningAmount, coveredAmount);
  });

  await runCase("avs submitter aggregates signatures, validates fraud proofs, and writes symbolic slashing logs", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "ffm-keeper-"));
    const slashingLogPath = path.join(tempDirectory, "slashing.json");
    const slashingLogStore = new JsonSlashingLogStore(slashingLogPath);
    await slashingLogStore.hydrate();

    const submitter = new AvsSubmitter(2, slashingLogStore, () => 123_456);
    const payload = {
      auctionId: 5n,
      requestId: "0xrequest",
      winner: "0x00000000000000000000000000000000000000aa",
      winnerCiphertext: "0xwinner",
      winningAmount: 450n
    };

    const proof = await submitter.collectProof(payload, "0xdigest", [
      {
        address: "0x1",
        signDigest: async () => "0xsig-a"
      },
      {
        address: "0x2",
        signDigest: async () => "0xsig-b"
      }
    ]);

    assert.equal(proof.signerCount, 2);
    assert.equal(proof.aggregateSignature, aggregateSignatures(["0xsig-a", "0xsig-b"]));

    validateFraudProof(payload, payload);
    assert.throws(
      () =>
        validateFraudProof(payload, {
          ...payload,
          winningAmount: 451n
        }),
      /Fraud proof mismatch/
    );

    await submitter.recordSlashingViolation(payload.requestId, payload.auctionId, "mismatched-winning-amount", proof.operators);
    const records = await slashingLogStore.list();

    assert.equal(records.length, 1);
    assert.equal(records[0].reason, "mismatched-winning-amount");
    assert.deepEqual(records[0].operators, ["0x1", "0x2"]);

    await rm(tempDirectory, { recursive: true, force: true });
  });

  console.log("keeper-tests: ok");
}

async function runCase(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function buildJob(auctionId: bigint, requestId: string, amount: bigint, startingPrice: bigint = 0n): CoFheDispatchJob {
  return {
    auctionId,
    requestId,
    winnerHandle: `winner-${requestId}`,
    amountHandle: `amount-${requestId}`,
    startingPrice,
    bids: [
      {
        bidder: "0x00000000000000000000000000000000000000aa",
        encryptedBid: encodeEncryptedUint32(amount),
        availableEscrow: amount + 50n
      },
      {
        bidder: "0x00000000000000000000000000000000000000bb",
        encryptedBid: encodeEncryptedUint32(amount - 1n),
        availableEscrow: amount + 50n
      }
    ]
  };
}

function encodeEncryptedUint32(amount: bigint): string {
  return ((1n << 248n) | amount).toString();
}

function encodeEncryptedUint96(amount: bigint): string {
  return ((3n << 248n) | amount).toString();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
