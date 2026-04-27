import { network } from "hardhat";

import {
  readDeploymentFile,
  resolveDeploymentPaths,
  resolveNetworkDescriptor,
  writeJsonFile,
  writeTextFile
} from "./utils";

function requireValue(record: Record<string, string>, field: string): string {
  const value = record[field];
  if (!value || value.trim() === "") {
    throw new Error(`Missing deployment field: ${field}`);
  }

  return value;
}

async function main() {
  const descriptor = await resolveNetworkDescriptor(network.name);
  const { deploymentFile, frontendEnvFile, keeperEnvFile, runtimeFile } = resolveDeploymentPaths(network.name);
  const deployment = await readDeploymentFile(deploymentFile);

  const runtimePayload = {
    network: descriptor.name,
    chainId: descriptor.chainId,
    rpcUrl: descriptor.rpcUrl,
    websocketUrl: descriptor.websocketUrl,
    blockExplorerUrl: descriptor.blockExplorerUrl,
    contracts: {
      adapter: requireValue(deployment, "adapter"),
      avs: requireValue(deployment, "avs"),
      implementation: requireValue(deployment, "implementation"),
      marketProxy: requireValue(deployment, "proxy"),
      settlementEngine: requireValue(deployment, "settlementEngine"),
      slashedPot: requireValue(deployment, "slashedPot")
    },
    owner: requireValue(deployment, "initialOwner"),
    deploymentMeta: {
      deployer: requireValue(deployment, "deployer"),
      deployedAt: requireValue(deployment, "deployedAt")
    }
  };

  const frontendEnv = [
    "NEXT_PUBLIC_APP_NAME=Fhenix-FairMarket",
    `NEXT_PUBLIC_CHAIN_ID=${descriptor.chainId}`,
    "NEXT_PUBLIC_CHAIN_NAME=Sepolia",
    `NEXT_PUBLIC_SEPOLIA_RPC_URL=${descriptor.rpcUrl}`,
    `NEXT_PUBLIC_BLOCK_EXPLORER_URL=${descriptor.blockExplorerUrl}`,
    `NEXT_PUBLIC_MARKET_PROXY_ADDRESS=${runtimePayload.contracts.marketProxy}`,
    `NEXT_PUBLIC_SETTLEMENT_ENGINE_ADDRESS=${runtimePayload.contracts.settlementEngine}`,
    `NEXT_PUBLIC_SLASHED_POT_ADDRESS=${runtimePayload.contracts.slashedPot}`,
    `NEXT_PUBLIC_AVS_ADDRESS=${runtimePayload.contracts.avs}`,
    ""
  ].join("\n");

  const keeperEnv = [
    "KEEPER_ROLE=auction-monitor",
    `KEEPER_RPC_URL=${descriptor.rpcUrl}`,
    `KEEPER_WS_URL=${descriptor.websocketUrl}`,
    "KEEPER_REDIS_URL=redis://redis:6379",
    `KEEPER_MARKET_ADDRESS=${runtimePayload.contracts.marketProxy}`,
    `KEEPER_SETTLEMENT_ENGINE_ADDRESS=${runtimePayload.contracts.settlementEngine}`,
    `KEEPER_AVS_ADDRESS=${runtimePayload.contracts.avs}`,
    `KEEPER_FHEOS_ENDPOINT=${process.env.KEEPER_FHEOS_ENDPOINT || ""}`,
    "KEEPER_FHEOS_API_KEY=",
    "KEEPER_POLL_INTERVAL_MS=30000",
    "KEEPER_FINALIZE_LEAD_SECONDS=60",
    "KEEPER_FINALIZATION_DRIFT_SECONDS=12",
    "KEEPER_REQUEST_TIMEOUT_MS=120000",
    "KEEPER_MAX_RETRIES=4",
    "KEEPER_RETRY_BASE_DELAY_MS=2000",
    "KEEPER_QUEUE_CAPACITY=256",
    "KEEPER_MAX_BATCH_SIZE=10",
    "KEEPER_LOCK_TTL_MS=90000",
    "KEEPER_MAX_PRIORITY_FEE_GWEI=2",
    `KEEPER_AVS_THRESHOLD=${deployment.avsThreshold || "1"}`,
    "KEEPER_AVS_OPERATOR_KEYS=",
    "KEEPER_STATE_FILE_PATH=/app/packages/keeper/state/keeper-state.json",
    "KEEPER_SLASHING_LOG_PATH=/app/packages/keeper/state/slashing-log.json",
    "KEEPER_METRICS_PORT=9400",
    "PRIVATE_KEY=",
    ""
  ].join("\n");

  await writeJsonFile(runtimeFile, runtimePayload);
  await writeTextFile(frontendEnvFile, frontendEnv);
  await writeTextFile(keeperEnvFile, keeperEnv);

  console.log(`Runtime payload written to ${runtimeFile}`);
  console.log(`Frontend env snippet written to ${frontendEnvFile}`);
  console.log(`Keeper env snippet written to ${keeperEnvFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
