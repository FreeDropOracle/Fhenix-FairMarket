export interface KeeperConfig {
  pollIntervalMs: number;
  finalizationDriftSeconds: number;
  requestTimeoutMs: number;
  maxRetries: number;
  queueCapacity: number;
}

export const defaultKeeperConfig: KeeperConfig = {
  pollIntervalMs: 12_000,
  finalizationDriftSeconds: 12,
  requestTimeoutMs: 90_000,
  maxRetries: 3,
  queueCapacity: 256
};

export function createKeeperConfig(overrides: Partial<KeeperConfig> = {}): KeeperConfig {
  return {
    ...defaultKeeperConfig,
    ...overrides
  };
}
