import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredAuctionRecord {
  auctionId: bigint;
  state: bigint;
  endTime: bigint;
  sellerDeposit?: bigint;
  trackedAtMs: number;
  lastFinalizeAttemptAtMs?: number;
  retryCount: number;
}

export interface FinalizeAttemptRecord {
  auctionId: bigint;
  executionNonce: number;
  keeperId: string;
  success: boolean;
  retryCount: number;
  backoffMs: number;
  txHash?: string;
  gasUsed?: bigint;
  incentiveWei?: bigint;
  recordedAtMs: number;
  error?: string;
}

export interface RaceConditionRecord {
  auctionId: bigint;
  executionNonce: number;
  keeperId: string;
  reason: string;
  detectedAtMs: number;
}

export interface StoredDispatchBid {
  bidder: string;
  encryptedBid: string;
  availableEscrow: bigint;
}

export interface StoredDispatchJob {
  auctionId: bigint;
  requestId: string;
  winnerHandle: string;
  amountHandle: string;
  startingPrice: bigint;
  bids: StoredDispatchBid[];
  enqueuedAtMs: number;
  dispatchedAtMs?: number;
}

export interface StoredResolutionArtifact {
  requestId: string;
  auctionId: bigint;
  winner: string;
  winnerCiphertext: string;
  avsProof: string;
  winningAmount: bigint;
  storedAtMs: number;
  submittedAtMs?: number;
}

export interface AuctionStateStore {
  upsertAuction(record: StoredAuctionRecord): Promise<void>;
  updateAuctionState(auctionId: bigint, state: bigint, trackedAtMs: number): Promise<void>;
  getAuction(auctionId: bigint): Promise<StoredAuctionRecord | undefined>;
  listAuctions(): Promise<StoredAuctionRecord[]>;
  listReadyAuctions(nowMs: number, finalizeLeadSeconds: number): Promise<StoredAuctionRecord[]>;
  recordFinalizeAttempt(record: FinalizeAttemptRecord): Promise<void>;
  listFinalizeAttempts(): Promise<FinalizeAttemptRecord[]>;
  recordRaceCondition(record: RaceConditionRecord): Promise<void>;
  listRaceConditions(): Promise<RaceConditionRecord[]>;
  enqueueDispatchJob(job: StoredDispatchJob): Promise<void>;
  listDispatchJobs(): Promise<StoredDispatchJob[]>;
  hasPendingDispatchJob(requestId: string): Promise<boolean>;
  listPendingDispatchJobs(limit: number): Promise<StoredDispatchJob[]>;
  markDispatchJobCompleted(requestId: string, dispatchedAtMs: number): Promise<void>;
  storeResolutionArtifact(artifact: StoredResolutionArtifact): Promise<void>;
  getResolutionArtifact(requestId: string): Promise<StoredResolutionArtifact | undefined>;
  listResolutionArtifacts(): Promise<StoredResolutionArtifact[]>;
  listPendingResolutionArtifacts(limit: number): Promise<StoredResolutionArtifact[]>;
  markResolutionArtifactSubmitted(requestId: string, submittedAtMs: number): Promise<void>;
}

interface SerializedState {
  auctions: Array<Record<string, unknown>>;
  finalizeAttempts: Array<Record<string, unknown>>;
  raceConditions: Array<Record<string, unknown>>;
  dispatchJobs: Array<Record<string, unknown>>;
  resolutions: Array<Record<string, unknown>>;
}

export class InMemoryAuctionStateStore implements AuctionStateStore {
  protected readonly auctions = new Map<string, StoredAuctionRecord>();
  protected readonly finalizeAttempts: FinalizeAttemptRecord[] = [];
  protected readonly raceConditions: RaceConditionRecord[] = [];
  protected readonly dispatchJobs = new Map<string, StoredDispatchJob>();
  protected readonly resolutions = new Map<string, StoredResolutionArtifact>();

  async upsertAuction(record: StoredAuctionRecord): Promise<void> {
    this.auctions.set(record.auctionId.toString(), { ...record });
  }

  async updateAuctionState(auctionId: bigint, state: bigint, trackedAtMs: number): Promise<void> {
    const existing = this.auctions.get(auctionId.toString());
    if (!existing) {
      return;
    }

    this.auctions.set(auctionId.toString(), {
      ...existing,
      state,
      trackedAtMs
    });
  }

  async getAuction(auctionId: bigint): Promise<StoredAuctionRecord | undefined> {
    return cloneAuction(this.auctions.get(auctionId.toString()));
  }

  async listAuctions(): Promise<StoredAuctionRecord[]> {
    return Array.from(this.auctions.values(), cloneAuction).filter((record): record is StoredAuctionRecord => record !== undefined);
  }

  async listReadyAuctions(nowMs: number, finalizeLeadSeconds: number): Promise<StoredAuctionRecord[]> {
    const finalizeLeadMs = finalizeLeadSeconds * 1_000;
    return (await this.listAuctions()).filter(
      (record) => record.state === 1n && Number(record.endTime) * 1_000 <= nowMs + finalizeLeadMs
    );
  }

  async recordFinalizeAttempt(record: FinalizeAttemptRecord): Promise<void> {
    this.finalizeAttempts.push({ ...record });
    const auction = this.auctions.get(record.auctionId.toString());
    if (auction) {
      auction.lastFinalizeAttemptAtMs = record.recordedAtMs;
      auction.retryCount = record.retryCount;
    }
  }

  async listFinalizeAttempts(): Promise<FinalizeAttemptRecord[]> {
    return this.finalizeAttempts.map((record) => ({ ...record }));
  }

  async recordRaceCondition(record: RaceConditionRecord): Promise<void> {
    this.raceConditions.push({ ...record });
  }

  async listRaceConditions(): Promise<RaceConditionRecord[]> {
    return this.raceConditions.map((record) => ({ ...record }));
  }

  async enqueueDispatchJob(job: StoredDispatchJob): Promise<void> {
    if (this.dispatchJobs.has(job.requestId) || this.resolutions.has(job.requestId)) {
      return;
    }

    this.dispatchJobs.set(job.requestId, {
      ...job,
      bids: job.bids.map((bid) => ({ ...bid }))
    });
  }

  async hasPendingDispatchJob(requestId: string): Promise<boolean> {
    const job = this.dispatchJobs.get(requestId);
    return job !== undefined && job.dispatchedAtMs === undefined;
  }

  async listDispatchJobs(): Promise<StoredDispatchJob[]> {
    return Array.from(this.dispatchJobs.values()).map(cloneDispatchJob);
  }

  async listPendingDispatchJobs(limit: number): Promise<StoredDispatchJob[]> {
    return Array.from(this.dispatchJobs.values())
      .filter((job) => job.dispatchedAtMs === undefined)
      .sort((left, right) => left.enqueuedAtMs - right.enqueuedAtMs)
      .slice(0, limit)
      .map(cloneDispatchJob);
  }

  async markDispatchJobCompleted(requestId: string, dispatchedAtMs: number): Promise<void> {
    const job = this.dispatchJobs.get(requestId);
    if (!job) {
      return;
    }

    this.dispatchJobs.set(requestId, {
      ...job,
      dispatchedAtMs
    });
  }

  async storeResolutionArtifact(artifact: StoredResolutionArtifact): Promise<void> {
    this.resolutions.set(artifact.requestId, { ...artifact });
  }

  async getResolutionArtifact(requestId: string): Promise<StoredResolutionArtifact | undefined> {
    const artifact = this.resolutions.get(requestId);
    return artifact ? { ...artifact } : undefined;
  }

  async listResolutionArtifacts(): Promise<StoredResolutionArtifact[]> {
    return Array.from(this.resolutions.values()).map((artifact) => ({ ...artifact }));
  }

  async listPendingResolutionArtifacts(limit: number): Promise<StoredResolutionArtifact[]> {
    return Array.from(this.resolutions.values())
      .filter((artifact) => artifact.submittedAtMs === undefined)
      .sort((left, right) => left.storedAtMs - right.storedAtMs)
      .slice(0, limit)
      .map((artifact) => ({ ...artifact }));
  }

  async markResolutionArtifactSubmitted(requestId: string, submittedAtMs: number): Promise<void> {
    const artifact = this.resolutions.get(requestId);
    if (!artifact) {
      return;
    }

    this.resolutions.set(requestId, {
      ...artifact,
      submittedAtMs
    });
  }
}

export class FileBackedAuctionStateStore extends InMemoryAuctionStateStore {
  constructor(private readonly filePath: string) {
    super();
  }

  async hydrate(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const state = JSON.parse(raw) as SerializedState;

      this.auctions.clear();
      for (const record of state.auctions ?? []) {
        await super.upsertAuction(deserializeAuction(record));
      }

      this.finalizeAttempts.splice(
        0,
        this.finalizeAttempts.length,
        ...(state.finalizeAttempts ?? []).map(deserializeFinalizeAttempt)
      );
      this.raceConditions.splice(0, this.raceConditions.length, ...(state.raceConditions ?? []).map(deserializeRaceCondition));

      this.dispatchJobs.clear();
      for (const record of state.dispatchJobs ?? []) {
        const job = deserializeDispatchJob(record);
        this.dispatchJobs.set(job.requestId, job);
      }

      this.resolutions.clear();
      for (const record of state.resolutions ?? []) {
        const artifact = deserializeResolution(record);
        this.resolutions.set(artifact.requestId, artifact);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  override async upsertAuction(record: StoredAuctionRecord): Promise<void> {
    await super.upsertAuction(record);
    await this.persist();
  }

  override async updateAuctionState(auctionId: bigint, state: bigint, trackedAtMs: number): Promise<void> {
    await super.updateAuctionState(auctionId, state, trackedAtMs);
    await this.persist();
  }

  override async recordFinalizeAttempt(record: FinalizeAttemptRecord): Promise<void> {
    await super.recordFinalizeAttempt(record);
    await this.persist();
  }

  override async recordRaceCondition(record: RaceConditionRecord): Promise<void> {
    await super.recordRaceCondition(record);
    await this.persist();
  }

  override async enqueueDispatchJob(job: StoredDispatchJob): Promise<void> {
    await super.enqueueDispatchJob(job);
    await this.persist();
  }

  override async markDispatchJobCompleted(requestId: string, dispatchedAtMs: number): Promise<void> {
    await super.markDispatchJobCompleted(requestId, dispatchedAtMs);
    await this.persist();
  }

  override async storeResolutionArtifact(artifact: StoredResolutionArtifact): Promise<void> {
    await super.storeResolutionArtifact(artifact);
    await this.persist();
  }

  override async markResolutionArtifactSubmitted(requestId: string, submittedAtMs: number): Promise<void> {
    await super.markResolutionArtifactSubmitted(requestId, submittedAtMs);
    await this.persist();
  }

  private async persist(): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });

    const payload: SerializedState = {
      auctions: (await this.listAuctions()).map(serializeAuction),
      finalizeAttempts: (await this.listFinalizeAttempts()).map(serializeFinalizeAttempt),
      raceConditions: (await this.listRaceConditions()).map(serializeRaceCondition),
      dispatchJobs: Array.from(this.dispatchJobs.values()).map(serializeDispatchJob),
      resolutions: Array.from(this.resolutions.values()).map(serializeResolution)
    };

    await writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}

function cloneAuction(record: StoredAuctionRecord | undefined): StoredAuctionRecord | undefined {
  return record ? { ...record } : undefined;
}

function cloneDispatchJob(record: StoredDispatchJob): StoredDispatchJob {
  return {
    ...record,
    bids: record.bids.map((bid) => ({ ...bid }))
  };
}

function serializeAuction(record: StoredAuctionRecord): Record<string, unknown> {
  return {
    ...record,
    auctionId: record.auctionId.toString(),
    state: record.state.toString(),
    endTime: record.endTime.toString(),
    sellerDeposit: record.sellerDeposit?.toString()
  };
}

function deserializeAuction(record: Record<string, unknown>): StoredAuctionRecord {
  return {
    auctionId: BigInt(String(record.auctionId)),
    state: BigInt(String(record.state)),
    endTime: BigInt(String(record.endTime)),
    sellerDeposit: record.sellerDeposit === undefined ? undefined : BigInt(String(record.sellerDeposit)),
    trackedAtMs: Number(record.trackedAtMs ?? 0),
    lastFinalizeAttemptAtMs:
      record.lastFinalizeAttemptAtMs === undefined ? undefined : Number(record.lastFinalizeAttemptAtMs),
    retryCount: Number(record.retryCount ?? 0)
  };
}

function serializeFinalizeAttempt(record: FinalizeAttemptRecord): Record<string, unknown> {
  return {
    ...record,
    auctionId: record.auctionId.toString(),
    gasUsed: record.gasUsed?.toString(),
    incentiveWei: record.incentiveWei?.toString()
  };
}

function deserializeFinalizeAttempt(record: Record<string, unknown>): FinalizeAttemptRecord {
  return {
    auctionId: BigInt(String(record.auctionId)),
    executionNonce: Number(record.executionNonce ?? 0),
    keeperId: String(record.keeperId ?? ""),
    success: Boolean(record.success),
    retryCount: Number(record.retryCount ?? 0),
    backoffMs: Number(record.backoffMs ?? 0),
    txHash: record.txHash === undefined ? undefined : String(record.txHash),
    gasUsed: record.gasUsed === undefined ? undefined : BigInt(String(record.gasUsed)),
    incentiveWei: record.incentiveWei === undefined ? undefined : BigInt(String(record.incentiveWei)),
    recordedAtMs: Number(record.recordedAtMs ?? 0),
    error: record.error === undefined ? undefined : String(record.error)
  };
}

function serializeRaceCondition(record: RaceConditionRecord): Record<string, unknown> {
  return {
    ...record,
    auctionId: record.auctionId.toString()
  };
}

function deserializeRaceCondition(record: Record<string, unknown>): RaceConditionRecord {
  return {
    auctionId: BigInt(String(record.auctionId)),
    executionNonce: Number(record.executionNonce ?? 0),
    keeperId: String(record.keeperId ?? ""),
    reason: String(record.reason ?? ""),
    detectedAtMs: Number(record.detectedAtMs ?? 0)
  };
}

function serializeDispatchJob(record: StoredDispatchJob): Record<string, unknown> {
  return {
    ...record,
    auctionId: record.auctionId.toString(),
    startingPrice: record.startingPrice.toString(),
    bids: record.bids.map((bid) => ({
      ...bid,
      availableEscrow: bid.availableEscrow.toString()
    }))
  };
}

function deserializeDispatchJob(record: Record<string, unknown>): StoredDispatchJob {
  return {
    auctionId: BigInt(String(record.auctionId)),
    requestId: String(record.requestId ?? ""),
    winnerHandle: String(record.winnerHandle ?? ""),
    amountHandle: String(record.amountHandle ?? ""),
    startingPrice: BigInt(String(record.startingPrice ?? "0")),
    bids: Array.isArray(record.bids)
      ? record.bids.map((rawBid) => {
          const bid = rawBid as Record<string, unknown>;
          return {
            bidder: String(bid.bidder ?? ""),
            encryptedBid: String(bid.encryptedBid ?? ""),
            availableEscrow: BigInt(String(bid.availableEscrow ?? "0"))
          };
        })
      : [],
    enqueuedAtMs: Number(record.enqueuedAtMs ?? 0),
    dispatchedAtMs: record.dispatchedAtMs === undefined ? undefined : Number(record.dispatchedAtMs)
  };
}

function serializeResolution(record: StoredResolutionArtifact): Record<string, unknown> {
  return {
    ...record,
    auctionId: record.auctionId.toString(),
    winningAmount: record.winningAmount.toString()
  };
}

function deserializeResolution(record: Record<string, unknown>): StoredResolutionArtifact {
  return {
    requestId: String(record.requestId ?? ""),
    auctionId: BigInt(String(record.auctionId ?? "0")),
    winner: String(record.winner ?? ""),
    winnerCiphertext: String(record.winnerCiphertext ?? ""),
    avsProof: String(record.avsProof ?? ""),
    winningAmount: BigInt(String(record.winningAmount ?? "0")),
    storedAtMs: Number(record.storedAtMs ?? 0),
    submittedAtMs: record.submittedAtMs === undefined ? undefined : Number(record.submittedAtMs)
  };
}
