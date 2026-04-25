import { createKeeperConfig, type KeeperConfig } from "../config";
import {
  InMemoryAuctionStateStore,
  type AuctionStateStore,
  type FinalizeAttemptRecord,
  type StoredAuctionRecord
} from "../stores/auctionStateStore";
import { InMemoryLockCoordinator, type FinalizeLockCoordinator } from "../stores/lockCoordinator";

export interface AuctionSnapshot {
  auctionId: bigint;
  state: bigint;
  endTime: bigint;
  sellerDeposit?: bigint;
}

export interface ResolutionRequestSnapshot {
  requestId: string;
  winnerHandle: string;
  amountHandle: string;
  requestedAt: bigint;
}

export interface MarketMonitorReader {
  getAuction(auctionId: bigint): Promise<readonly unknown[]>;
  getResolutionRequest(auctionId: bigint): Promise<readonly [string, string, string, bigint]>;
}

export interface PendingResolutionJob {
  auctionId: bigint;
  requestId: string;
  winnerHandle: string;
  amountHandle: string;
  requestedAt: bigint;
}

export interface AuctionFinalizer {
  triggerFinalize(auctionId: bigint, options: { executionNonce: number; priorityFeeGwei: number }): Promise<{
    txHash?: string;
    gasUsed?: bigint;
    incentiveWei?: bigint;
  }>;
}

export interface FinalizeOutcome {
  auctionId: bigint;
  executionNonce: number;
  acquired: boolean;
  success: boolean;
  rewardEstimateWei: bigint;
  backoffMs: number;
  txHash?: string;
  gasUsed?: bigint;
  error?: string;
}

export class AuctionMonitor {
  constructor(
    private readonly reader: MarketMonitorReader,
    private readonly config: KeeperConfig = createKeeperConfig(),
    private readonly store: AuctionStateStore = new InMemoryAuctionStateStore(),
    private readonly lockCoordinator: FinalizeLockCoordinator = new InMemoryLockCoordinator(),
    private readonly now: () => number = () => Date.now()
  ) {}

  async scanExpiredAuctions(auctionIds: readonly bigint[], now: bigint): Promise<bigint[]> {
    const ready: bigint[] = [];

    for (const auctionId of auctionIds) {
      const auction = await this.reader.getAuction(auctionId);
      const state = BigInt(auction[5] as bigint);
      const endTime = BigInt(auction[3] as bigint);
      if (state === 1n && now + BigInt(this.config.finalizationDriftSeconds) >= endTime) {
        ready.push(auctionId);
      }
    }

    return ready;
  }

  async inspectTriggeredAuction(auctionId: bigint): Promise<PendingResolutionJob> {
    const request = await this.reader.getResolutionRequest(auctionId);
    return {
      auctionId,
      requestId: request[0],
      winnerHandle: request[1],
      amountHandle: request[2],
      requestedAt: BigInt(request[3])
    };
  }

  async trackAuction(snapshot: AuctionSnapshot): Promise<void> {
    await this.store.upsertAuction({
      auctionId: snapshot.auctionId,
      state: snapshot.state,
      endTime: snapshot.endTime,
      sellerDeposit: snapshot.sellerDeposit,
      trackedAtMs: this.now(),
      retryCount: 0
    });
  }

  async synchronizeAuction(auctionId: bigint): Promise<AuctionSnapshot> {
    const auction = await this.reader.getAuction(auctionId);
    const snapshot: AuctionSnapshot = {
      auctionId,
      state: BigInt(auction[5] as bigint),
      endTime: BigInt(auction[3] as bigint),
      sellerDeposit: BigInt(auction[4] as bigint)
    };
    await this.trackAuction(snapshot);
    return snapshot;
  }

  async planDueFinalizations(nowMs: number = this.now()): Promise<StoredAuctionRecord[]> {
    return this.store.listReadyAuctions(nowMs, this.config.finalizeLeadSeconds);
  }

  async executeDueFinalizations(keeperId: string, finalizer: AuctionFinalizer, nowMs: number = this.now()): Promise<FinalizeOutcome[]> {
    const dueAuctions = await this.planDueFinalizations(nowMs);
    const results: FinalizeOutcome[] = [];

    for (const auction of dueAuctions) {
      results.push(await this.attemptFinalize(auction, keeperId, finalizer));
    }

    return results;
  }

  async attemptFinalize(auction: StoredAuctionRecord, keeperId: string, finalizer: AuctionFinalizer): Promise<FinalizeOutcome> {
    const reservation = await this.lockCoordinator.reserveLock(auction.auctionId, keeperId, this.config.lockTtlMs);
    const rewardEstimateWei = estimateFinalizeReward(auction.sellerDeposit);

    if (!reservation.acquired) {
      await this.store.recordRaceCondition({
        auctionId: auction.auctionId,
        executionNonce: reservation.executionNonce,
        keeperId,
        reason: "distributed-lock-held",
        detectedAtMs: this.now()
      });

      return {
        auctionId: auction.auctionId,
        executionNonce: reservation.executionNonce,
        acquired: false,
        success: false,
        rewardEstimateWei,
        backoffMs: 0,
        error: "distributed-lock-held"
      };
    }

    try {
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
        const backoffMs = computeExponentialBackoff(this.config.retryBaseDelayMs, attempt);

        try {
          const receipt = await finalizer.triggerFinalize(auction.auctionId, {
            executionNonce: reservation.executionNonce,
            priorityFeeGwei: this.config.maxPriorityFeeGwei
          });

          await this.store.recordFinalizeAttempt({
            auctionId: auction.auctionId,
            executionNonce: reservation.executionNonce,
            keeperId,
            success: true,
            retryCount: attempt,
            backoffMs,
            txHash: receipt.txHash,
            gasUsed: receipt.gasUsed,
            incentiveWei: receipt.incentiveWei ?? rewardEstimateWei,
            recordedAtMs: this.now()
          });

          return {
            auctionId: auction.auctionId,
            executionNonce: reservation.executionNonce,
            acquired: true,
            success: true,
            rewardEstimateWei: receipt.incentiveWei ?? rewardEstimateWei,
            backoffMs,
            txHash: receipt.txHash,
            gasUsed: receipt.gasUsed
          };
        } catch (error) {
          lastError = normalizeError(error);
          const record: FinalizeAttemptRecord = {
            auctionId: auction.auctionId,
            executionNonce: reservation.executionNonce,
            keeperId,
            success: false,
            retryCount: attempt,
            backoffMs,
            incentiveWei: rewardEstimateWei,
            recordedAtMs: this.now(),
            error: lastError.message
          };
          await this.store.recordFinalizeAttempt(record);
        }
      }

      return {
        auctionId: auction.auctionId,
        executionNonce: reservation.executionNonce,
        acquired: true,
        success: false,
        rewardEstimateWei,
        backoffMs: computeExponentialBackoff(this.config.retryBaseDelayMs, this.config.maxRetries),
        error: lastError?.message ?? "finalize-failed"
      };
    } finally {
      await this.lockCoordinator.releaseLock(auction.auctionId, keeperId);
    }
  }
}

export function computeExponentialBackoff(baseDelayMs: number, attempt: number): number {
  return baseDelayMs * 2 ** attempt;
}

export function estimateFinalizeReward(sellerDeposit: bigint | undefined): bigint {
  if (sellerDeposit === undefined || sellerDeposit === 0n) {
    return 0n;
  }

  return (sellerDeposit * 20n) / 10_000n;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
