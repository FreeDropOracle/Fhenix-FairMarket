export interface KeeperConfig {
  rpcUrl: string;
  websocketUrl: string;
  redisUrl: string;
  marketAddress: string;
  settlementEngineAddress: string;
  avsAddress: string;
  pollIntervalMs: number;
  finalizeLeadSeconds: number;
  finalizationDriftSeconds: number;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  queueCapacity: number;
  maxBatchSize: number;
  lockTtlMs: number;
  maxPriorityFeeGwei: number;
  avsThreshold: number;
  fheosEndpoint: string;
  fheosApiKey: string;
  stateFilePath: string;
  slashingLogPath: string;
  metricsPort: number;
}

export const defaultKeeperConfig: KeeperConfig = {
  rpcUrl: "http://127.0.0.1:8545",
  websocketUrl: "ws://127.0.0.1:8545",
  redisUrl: "redis://127.0.0.1:6379",
  marketAddress: "",
  settlementEngineAddress: "",
  avsAddress: "",
  pollIntervalMs: 30_000,
  finalizeLeadSeconds: 60,
  finalizationDriftSeconds: 12,
  requestTimeoutMs: 120_000,
  maxRetries: 4,
  retryBaseDelayMs: 2_000,
  queueCapacity: 256,
  maxBatchSize: 10,
  lockTtlMs: 90_000,
  maxPriorityFeeGwei: 2,
  avsThreshold: 3,
  fheosEndpoint: "https://fheos.fhenix.zone",
  fheosApiKey: "",
  stateFilePath: "./state/keeper-state.json",
  slashingLogPath: "./state/slashing-log.json",
  metricsPort: 9400
};

export function createKeeperConfig(overrides: Partial<KeeperConfig> = {}): KeeperConfig {
  return {
    ...defaultKeeperConfig,
    ...overrides
  };
}

export function createKeeperConfigFromEnv(env: NodeJS.ProcessEnv = process.env): KeeperConfig {
  return createKeeperConfig({
    rpcUrl: env.KEEPER_RPC_URL ?? defaultKeeperConfig.rpcUrl,
    websocketUrl: env.KEEPER_WS_URL ?? defaultKeeperConfig.websocketUrl,
    redisUrl: env.KEEPER_REDIS_URL ?? defaultKeeperConfig.redisUrl,
    marketAddress: env.KEEPER_MARKET_ADDRESS ?? defaultKeeperConfig.marketAddress,
    settlementEngineAddress: env.KEEPER_SETTLEMENT_ENGINE_ADDRESS ?? defaultKeeperConfig.settlementEngineAddress,
    avsAddress: env.KEEPER_AVS_ADDRESS ?? defaultKeeperConfig.avsAddress,
    pollIntervalMs: resolveInteger(env.KEEPER_POLL_INTERVAL_MS, defaultKeeperConfig.pollIntervalMs),
    finalizeLeadSeconds: resolveInteger(env.KEEPER_FINALIZE_LEAD_SECONDS, defaultKeeperConfig.finalizeLeadSeconds),
    finalizationDriftSeconds: resolveInteger(
      env.KEEPER_FINALIZATION_DRIFT_SECONDS,
      defaultKeeperConfig.finalizationDriftSeconds
    ),
    requestTimeoutMs: resolveInteger(env.KEEPER_REQUEST_TIMEOUT_MS, defaultKeeperConfig.requestTimeoutMs),
    maxRetries: resolveInteger(env.KEEPER_MAX_RETRIES, defaultKeeperConfig.maxRetries),
    retryBaseDelayMs: resolveInteger(env.KEEPER_RETRY_BASE_DELAY_MS, defaultKeeperConfig.retryBaseDelayMs),
    queueCapacity: resolveInteger(env.KEEPER_QUEUE_CAPACITY, defaultKeeperConfig.queueCapacity),
    maxBatchSize: resolveInteger(env.KEEPER_MAX_BATCH_SIZE, defaultKeeperConfig.maxBatchSize),
    lockTtlMs: resolveInteger(env.KEEPER_LOCK_TTL_MS, defaultKeeperConfig.lockTtlMs),
    maxPriorityFeeGwei: resolveInteger(env.KEEPER_MAX_PRIORITY_FEE_GWEI, defaultKeeperConfig.maxPriorityFeeGwei),
    avsThreshold: resolveInteger(env.KEEPER_AVS_THRESHOLD, defaultKeeperConfig.avsThreshold),
    fheosEndpoint: env.KEEPER_FHEOS_ENDPOINT ?? defaultKeeperConfig.fheosEndpoint,
    fheosApiKey: env.KEEPER_FHEOS_API_KEY ?? defaultKeeperConfig.fheosApiKey,
    stateFilePath: env.KEEPER_STATE_FILE_PATH ?? defaultKeeperConfig.stateFilePath,
    slashingLogPath: env.KEEPER_SLASHING_LOG_PATH ?? defaultKeeperConfig.slashingLogPath,
    metricsPort: resolveInteger(env.KEEPER_METRICS_PORT, defaultKeeperConfig.metricsPort)
  });
}

function resolveInteger(rawValue: string | undefined, fallback: number): number {
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
