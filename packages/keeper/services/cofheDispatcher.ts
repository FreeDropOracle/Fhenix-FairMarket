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
  bids: readonly EncryptedBidRecord[];
}

export interface CoFheResolution {
  requestId: string;
  winnerHandle: string;
  amountHandle: string;
  winner: string | null;
  winnerCiphertext: string;
  winningAmount: bigint;
  latencyMs: number;
}

export interface DispatchQueue {
  enqueue(job: CoFheDispatchJob): Promise<void>;
  markCompleted(requestId: string, resolution: CoFheResolution): Promise<void>;
}

export class InMemoryDispatchQueue implements DispatchQueue {
  readonly pending = new Map<string, CoFheDispatchJob>();
  readonly completed = new Map<string, CoFheResolution>();

  async enqueue(job: CoFheDispatchJob): Promise<void> {
    this.pending.set(job.requestId, job);
  }

  async markCompleted(requestId: string, resolution: CoFheResolution): Promise<void> {
    this.pending.delete(requestId);
    this.completed.set(requestId, resolution);
  }
}

export class CofheDispatcher {
  constructor(
    private readonly queue: DispatchQueue = new InMemoryDispatchQueue(),
    private readonly now: () => number = () => Date.now()
  ) {}

  async dispatch(job: CoFheDispatchJob): Promise<CoFheResolution> {
    const startedAt = this.now();
    await this.queue.enqueue(job);

    const winner = pickHighestEncryptedBid(job.bids);
    const resolution: CoFheResolution = {
      requestId: job.requestId,
      winnerHandle: job.winnerHandle,
      amountHandle: job.amountHandle,
      winner: winner?.bidder ?? null,
      winnerCiphertext: winner?.encryptedBid ?? ZERO_HASH,
      winningAmount: winner ? decodeEncryptedUint32(winner.encryptedBid) : 0n,
      latencyMs: this.now() - startedAt
    };

    await this.queue.markCompleted(job.requestId, resolution);
    return resolution;
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

export function pickHighestEncryptedBid(bids: readonly EncryptedBidRecord[]): EncryptedBidRecord | null {
  let winner: EncryptedBidRecord | null = null;
  let highestBid = -1n;

  for (const bid of bids) {
    const amount = decodeEncryptedUint32(bid.encryptedBid);
    if (amount > bid.availableEscrow) {
      continue;
    }
    if (winner === null || amount > highestBid) {
      winner = bid;
      highestBid = amount;
    }
  }

  return winner;
}
