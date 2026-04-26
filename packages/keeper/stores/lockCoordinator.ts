import { Socket } from "node:net";

export interface LockReservation {
  acquired: boolean;
  executionNonce: number;
}

export interface FinalizeLockCoordinator {
  reserveLock(auctionId: bigint, keeperId: string, ttlMs: number): Promise<LockReservation>;
  releaseLock(auctionId: bigint, keeperId: string): Promise<void>;
}

export class InMemoryLockCoordinator implements FinalizeLockCoordinator {
  private readonly locks = new Map<string, { keeperId: string; expiresAtMs: number }>();
  private readonly nonces = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async reserveLock(auctionId: bigint, keeperId: string, ttlMs: number): Promise<LockReservation> {
    const key = auctionId.toString();
    const current = this.locks.get(key);
    const currentTime = this.now();
    const executionNonce = (this.nonces.get(key) ?? 0) + 1;
    this.nonces.set(key, executionNonce);

    if (current && current.expiresAtMs > currentTime && current.keeperId !== keeperId) {
      return { acquired: false, executionNonce };
    }

    this.locks.set(key, {
      keeperId,
      expiresAtMs: currentTime + ttlMs
    });

    return { acquired: true, executionNonce };
  }

  async releaseLock(auctionId: bigint, keeperId: string): Promise<void> {
    const key = auctionId.toString();
    const current = this.locks.get(key);
    if (current?.keeperId === keeperId) {
      this.locks.delete(key);
    }
  }
}

export class RedisLockCoordinator implements FinalizeLockCoordinator {
  private readonly redis: MinimalRedisClient;

  constructor(redisUrl: string) {
    this.redis = new MinimalRedisClient(redisUrl);
  }

  async reserveLock(auctionId: bigint, keeperId: string, ttlMs: number): Promise<LockReservation> {
    const key = auctionId.toString();
    const executionNonce = Number(await this.redis.incr(`keeper:nonce:${key}`));
    const acquired = await this.redis.setIfNotExists(`keeper:lock:${key}`, keeperId, ttlMs);
    return {
      acquired,
      executionNonce
    };
  }

  async releaseLock(auctionId: bigint, keeperId: string): Promise<void> {
    const key = auctionId.toString();
    const lockKey = `keeper:lock:${key}`;
    const currentOwner = await this.redis.get(lockKey);
    if (currentOwner === keeperId) {
      await this.redis.del(lockKey);
    }
  }
}

class MinimalRedisClient {
  private readonly host: string;
  private readonly port: number;

  constructor(redisUrl: string) {
    const parsed = new URL(redisUrl);
    this.host = parsed.hostname;
    this.port = parsed.port === "" ? 6379 : Number(parsed.port);
  }

  async get(key: string): Promise<string | null> {
    const reply = await this.command(["GET", key]);
    return reply === null ? null : String(reply);
  }

  async del(key: string): Promise<number> {
    return Number(await this.command(["DEL", key]));
  }

  async incr(key: string): Promise<number> {
    return Number(await this.command(["INCR", key]));
  }

  async setIfNotExists(key: string, value: string, ttlMs: number): Promise<boolean> {
    const reply = await this.command(["SET", key, value, "PX", String(ttlMs), "NX"]);
    return reply === "OK";
  }

  private async command(parts: readonly string[]): Promise<string | number | null> {
    const payload = encodeRedisCommand(parts);
    const socket = new Socket();

    return await new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);

      socket.on("error", reject);
      socket.connect(this.port, this.host, () => {
        socket.write(payload);
      });

      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const parsed = parseRedisReply(buffer);
        if (!parsed.complete) {
          return;
        }

        socket.end();
        if (parsed.error) {
          reject(parsed.error);
          return;
        }

        resolve(parsed.value ?? null);
      });
    });
  }
}

function encodeRedisCommand(parts: readonly string[]): Buffer {
  const chunks = [`*${parts.length}\r\n`];
  for (const part of parts) {
    chunks.push(`$${Buffer.byteLength(part)}\r\n${part}\r\n`);
  }

  return Buffer.from(chunks.join(""), "utf8");
}

function parseRedisReply(buffer: Buffer): {
  complete: boolean;
  value?: string | number | null;
  error?: Error;
} {
  if (buffer.length === 0) {
    return { complete: false };
  }

  const prefix = String.fromCharCode(buffer[0]);
  const lineEnd = buffer.indexOf("\r\n");
  if (lineEnd === -1) {
    return { complete: false };
  }

  const line = buffer.subarray(1, lineEnd).toString("utf8");
  if (prefix === "+") {
    return { complete: true, value: line };
  }
  if (prefix === "-") {
    return { complete: true, error: new Error(line) };
  }
  if (prefix === ":") {
    return { complete: true, value: Number(line) };
  }
  if (prefix === "$") {
    const byteLength = Number(line);
    if (byteLength === -1) {
      return { complete: true, value: null };
    }

    const start = lineEnd + 2;
    const end = start + byteLength;
    if (buffer.length < end + 2) {
      return { complete: false };
    }

    return {
      complete: true,
      value: buffer.subarray(start, end).toString("utf8")
    };
  }

  return { complete: true, error: new Error(`Unsupported Redis reply prefix: ${prefix}`) };
}
