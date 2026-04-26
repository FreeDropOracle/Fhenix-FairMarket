import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SlashingLogRecord {
  auctionId: bigint;
  requestId: string;
  reason: string;
  operators: string[];
  recordedAtMs: number;
}

export interface SlashingLogStore {
  append(record: SlashingLogRecord): Promise<void>;
  list(): Promise<SlashingLogRecord[]>;
}

export class InMemorySlashingLogStore implements SlashingLogStore {
  protected readonly records: SlashingLogRecord[] = [];

  async append(record: SlashingLogRecord): Promise<void> {
    this.records.push({ ...record, operators: [...record.operators] });
  }

  async list(): Promise<SlashingLogRecord[]> {
    return this.records.map((record) => ({
      ...record,
      operators: [...record.operators]
    }));
  }
}

export class JsonSlashingLogStore extends InMemorySlashingLogStore {
  constructor(private readonly filePath: string) {
    super();
  }

  async hydrate(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      this.records.splice(0, this.records.length, ...parsed.map(deserializeRecord));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  override async append(record: SlashingLogRecord): Promise<void> {
    await super.append(record);
    await this.persist();
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const payload = this.records.map((record) => ({
      ...record,
      auctionId: record.auctionId.toString()
    }));
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}

function deserializeRecord(raw: Record<string, unknown>): SlashingLogRecord {
  return {
    auctionId: BigInt(String(raw.auctionId ?? "0")),
    requestId: String(raw.requestId ?? ""),
    reason: String(raw.reason ?? ""),
    operators: Array.isArray(raw.operators) ? raw.operators.map((entry) => String(entry)) : [],
    recordedAtMs: Number(raw.recordedAtMs ?? 0)
  };
}
