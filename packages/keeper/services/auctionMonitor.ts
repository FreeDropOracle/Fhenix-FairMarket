import { createKeeperConfig, type KeeperConfig } from "../config";

export interface AuctionSnapshot {
  auctionId: bigint;
  state: bigint;
  endTime: bigint;
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

export class AuctionMonitor {
  constructor(
    private readonly reader: MarketMonitorReader,
    private readonly config: KeeperConfig = createKeeperConfig()
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
}
