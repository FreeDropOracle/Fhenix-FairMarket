import { createKeeperConfig, type KeeperConfig } from "../config";

export interface EncryptedBidRecord {
  bidder: string;
  encryptedBid: string;
  availableEscrow: bigint;
}

export interface CoFheDispatchJob {
  auctionId: bigint;
  requestId: string;
  winnerHandle: string;
  amountHandle: string;
  startingPrice: bigint;
  bids: readonly EncryptedBidRecord[];
}

export interface CoFheResolution {
  auctionId: bigint;
  requestId: string;
  winnerHandle: string;
  amountHandle: string;
  winner: string | null;
  winnerCiphertext: string;
  winningAmount: bigint;
  latencyMs: number;
  avsProof: string;
}

export interface DispatchQueue {
  enqueue(job: CoFheDispatchJob): Promise<void>;
  markCompleted(requestId: string, resolution: CoFheResolution): Promise<void>;
}

export interface BatchDispatchQueue extends DispatchQueue {
  takeBatch(maxBatchSize: number): Promise<CoFheDispatchJob[]>;
  hasPending(requestId: string): Promise<boolean>;
  getCompleted(requestId: string): Promise<CoFheResolution | undefined>;
}

export interface FheosBatchClient {
  resolveBatch(jobs: readonly CoFheDispatchJob[], requestTimeoutMs: number): Promise<CoFheResolution[]>;
}

export interface DispatchMetricsSnapshot {
  successfulBatches: number;
  failedBatches: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
}

export class InMemoryDispatchQueue implements BatchDispatchQueue {
  readonly pending = new Map<string, CoFheDispatchJob>();
  readonly completed = new Map<string, CoFheResolution>();
  private readonly order: string[] = [];

  async enqueue(job: CoFheDispatchJob): Promise<void> {
    if (this.pending.has(job.requestId) || this.completed.has(job.requestId)) {
      throw new Error(`Duplicate requestId: ${job.requestId}`);
    }

    this.pending.set(job.requestId, job);
    this.order.push(job.requestId);
  }

  async takeBatch(maxBatchSize: number): Promise<CoFheDispatchJob[]> {
    const requestIds = this.order
      .filter((requestId) => this.pending.has(requestId))
      .slice(0, maxBatchSize);

    return requestIds.map((requestId) => this.pending.get(requestId) as CoFheDispatchJob);
  }

  async hasPending(requestId: string): Promise<boolean> {
    return this.pending.has(requestId);
  }

  async getCompleted(requestId: string): Promise<CoFheResolution | undefined> {
    const resolution = this.completed.get(requestId);
    return resolution ? { ...resolution } : undefined;
  }

  async markCompleted(requestId: string, resolution: CoFheResolution): Promise<void> {
    this.pending.delete(requestId);
    this.completed.set(requestId, { ...resolution });
  }
}

export class LocalCofheBatchClient implements FheosBatchClient {
  constructor(private readonly now: () => number = () => Date.now()) {}

  async resolveBatch(jobs: readonly CoFheDispatchJob[]): Promise<CoFheResolution[]> {
    return jobs.map((job) => {
      const startedAt = this.now();
      const winner = pickHighestEncryptedBid(job.bids, job.startingPrice);
      return {
        auctionId: job.auctionId,
        requestId: job.requestId,
        winnerHandle: job.winnerHandle,
        amountHandle: job.amountHandle,
        winner: winner?.bidder ?? null,
        winnerCiphertext: winner?.encryptedBid ?? ZERO_HASH,
        winningAmount: winner ? decodeEncryptedUint32(winner.encryptedBid) : 0n,
        latencyMs: this.now() - startedAt,
        avsProof: buildSyntheticAvsProof(job.requestId, winner?.encryptedBid ?? ZERO_HASH)
      };
    });
  }
}

export class HttpFheosBatchClient implements FheosBatchClient {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async resolveBatch(jobs: readonly CoFheDispatchJob[], requestTimeoutMs: number): Promise<CoFheResolution[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey
        },
        body: JSON.stringify({
          jobs: jobs.map((job) => ({
            auctionId: job.auctionId.toString(),
            requestId: job.requestId,
            winnerHandle: job.winnerHandle,
            amountHandle: job.amountHandle,
            startingPrice: job.startingPrice.toString(),
            bids: job.bids.map((bid) => ({
              bidder: bid.bidder,
              encryptedBid: bid.encryptedBid,
              availableEscrow: bid.availableEscrow.toString()
            }))
          }))
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`FHEOS request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as Array<Record<string, unknown>>;
      return payload.map((entry) => ({
        auctionId: BigInt(String(entry.auctionId ?? "0")),
        requestId: String(entry.requestId ?? ""),
        winnerHandle: String(entry.winnerHandle ?? ""),
        amountHandle: String(entry.amountHandle ?? ""),
        winner: entry.winner === null || entry.winner === undefined ? null : String(entry.winner),
        winnerCiphertext: String(entry.winnerCiphertext ?? ZERO_HASH),
        winningAmount: BigInt(String(entry.winningAmount ?? "0")),
        latencyMs: Number(entry.latencyMs ?? 0),
        avsProof: String(entry.avsProof ?? "")
      }));
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class CofheDispatcher {
  private successfulBatches = 0;
  private failedBatches = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private totalLatencyMs = 0;

  constructor(
    private readonly queue: BatchDispatchQueue = new InMemoryDispatchQueue(),
    private readonly now: () => number = () => Date.now(),
    private readonly config: KeeperConfig = createKeeperConfig(),
    private readonly client: FheosBatchClient = new LocalCofheBatchClient(),
    private readonly sleep: (ms: number) => Promise<void> = async () => Promise.resolve()
  ) {}

  async enqueue(job: CoFheDispatchJob): Promise<void> {
    await this.queue.enqueue(job);
  }

  async dispatch(job: CoFheDispatchJob): Promise<CoFheResolution> {
    await this.enqueue(job);
    const [resolution] = await this.dispatchBatch([job]);
    return resolution;
  }

  async dispatchPendingBatch(): Promise<CoFheResolution[]> {
    const batch = await this.queue.takeBatch(this.config.maxBatchSize);
    if (batch.length === 0) {
      return [];
    }

    return this.dispatchBatch(batch);
  }

  getMetricsSnapshot(): DispatchMetricsSnapshot {
    const averageLatencyMs = this.successfulRequests === 0 ? 0 : this.totalLatencyMs / this.successfulRequests;
    return {
      successfulBatches: this.successfulBatches,
      failedBatches: this.failedBatches,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      averageLatencyMs
    };
  }

  private async dispatchBatch(batch: readonly CoFheDispatchJob[]): Promise<CoFheResolution[]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const startedAt = this.now();
        const resolutions = await this.client.resolveBatch(batch, this.config.requestTimeoutMs);

        for (const resolution of resolutions) {
          await this.queue.markCompleted(resolution.requestId, resolution);
          this.successfulRequests += 1;
          this.totalLatencyMs += resolution.latencyMs;
        }

        this.successfulBatches += 1;
        const batchLatencyMs = this.now() - startedAt;
        if (resolutions.length === 0) {
          this.totalLatencyMs += batchLatencyMs;
        }

        return resolutions;
      } catch (error) {
        lastError = normalizeError(error);
        if (attempt === this.config.maxRetries) {
          break;
        }

        await this.sleep(this.config.retryBaseDelayMs * 2 ** attempt);
      }
    }

    this.failedBatches += 1;
    this.failedRequests += batch.length;
    throw lastError ?? new Error("batch-dispatch-failed");
  }
}

export const ZERO_HASH = `0x${"0".repeat(64)}`;

export function decodeEncryptedUint32(ciphertext: string): bigint {
  const parsed = BigInt(ciphertext);
  const kind = parsed >> 248n;
  if (kind !== 1n) {
    throw new Error(`Unsupported ciphertext kind: ${kind.toString()}`);
  }

  return parsed & ((1n << 248n) - 1n);
}

export function pickHighestEncryptedBid(
  bids: readonly EncryptedBidRecord[],
  startingPrice: bigint = 0n
): EncryptedBidRecord | null {
  let winner: EncryptedBidRecord | null = null;
  let highestBid = -1n;

  for (const bid of bids) {
    const amount = decodeEncryptedUint32(bid.encryptedBid);
    if (amount > bid.availableEscrow) {
      continue;
    }
    if (amount < startingPrice) {
      continue;
    }
    if (winner === null || amount > highestBid) {
      winner = bid;
      highestBid = amount;
    }
  }

  return winner;
}

function buildSyntheticAvsProof(requestId: string, winnerCiphertext: string): string {
  return `proof:${requestId}:${winnerCiphertext}`;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
