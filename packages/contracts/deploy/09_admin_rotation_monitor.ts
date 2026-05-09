import { ethers, network } from "hardhat";

import { readDeploymentFile, resolveDeploymentPaths, resolveNetworkDescriptor, writeJsonFile } from "./utils";

const MARKET_MONITOR_ABI = [
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event CofheAdapterUpdated(address indexed previousAdapter, address indexed nextAdapter)",
  "event ShieldedEscrowVaultUpdated(address indexed previousVault, address indexed nextVault)",
  "event ShieldedIdentityRegistryUpdated(address indexed previousRegistry, address indexed nextRegistry)",
  "event SettlementDependenciesUpdated(address indexed settlementEngine, address indexed slashedPot)"
];

const SETTLEMENT_MONITOR_ABI = [
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event AVSUpdated(address indexed previousAVS, address indexed newAVS)"
];

const SLASHED_POT_MONITOR_ABI = [
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event MarketUpdated(address indexed previousMarket, address indexed newMarket)"
];

const VAULT_MONITOR_ABI = [
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event MarketUpdated(address indexed previousMarket, address indexed newMarket)",
  "event PreviewReaderUpdated(address indexed previousPreviewReader, address indexed newPreviewReader)",
  "event ShieldedBidVerifierUpdated(address indexed previousVerifier, address indexed newVerifier)"
];

const REGISTRY_MONITOR_ABI = [
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event MarketUpdated(address indexed previousMarket, address indexed newMarket)"
];

const TIMELOCK_MONITOR_ABI = [
  "event CallScheduled(bytes32 indexed id,uint256 indexed index,address target,uint256 value,bytes data,bytes32 predecessor,uint256 delay)",
  "event CallExecuted(bytes32 indexed id,uint256 indexed index,address target,uint256 value,bytes data)",
  "event Cancelled(bytes32 indexed id)",
  "event MinDelayChange(uint256 oldDuration,uint256 newDuration)"
];

interface MonitoringTarget {
  label: string;
  address: string;
  abi: string[];
  eventNames: string[];
}

function serializeEventArgs(eventLog: any): Record<string, string> {
  const serialized: Record<string, string> = {};
  for (const input of eventLog.fragment.inputs) {
    const name = input.name || `arg${serialized.length}`;
    const value = eventLog.args[name];
    serialized[name] = typeof value === "bigint" ? value.toString() : String(value);
  }
  return serialized;
}

async function collectEvents(
  target: MonitoringTarget,
  fromBlock: bigint,
  toBlock: bigint
): Promise<
  Array<{
    component: string;
    address: string;
    event: string;
    blockNumber: number;
    transactionHash: string;
    args: Record<string, string>;
  }>
> {
  const contract = new ethers.Contract(target.address, target.abi, ethers.provider);
  const entries = [];

  for (const eventName of target.eventNames) {
    const filterBuilder = (contract.filters as Record<string, () => unknown>)[eventName];
    if (!filterBuilder) {
      continue;
    }

    const logs = await contract.queryFilter(filterBuilder(), Number(fromBlock), Number(toBlock));
    for (const eventLog of logs) {
      entries.push({
        component: target.label,
        address: target.address,
        event: eventName,
        blockNumber: eventLog.blockNumber,
        transactionHash: eventLog.transactionHash,
        args: serializeEventArgs(eventLog)
      });
    }
  }

  return entries;
}

async function main() {
  const descriptor = await resolveNetworkDescriptor(network.name);
  const { deploymentFile, runtimeFile } = resolveDeploymentPaths(network.name);
  const deployment = await readDeploymentFile(deploymentFile);
  const currentBlock = await ethers.provider.getBlockNumber();
  const lookbackBlocks = Number(process.env.ADMIN_MONITOR_LOOKBACK_BLOCKS || "50000");
  const fromBlock = BigInt(Math.max(currentBlock - lookbackBlocks, 0));
  const toBlock = BigInt(currentBlock);

  const targets: MonitoringTarget[] = [
    {
      label: "market",
      address: deployment.proxy,
      abi: MARKET_MONITOR_ABI,
      eventNames: [
        "OwnershipTransferred",
        "CofheAdapterUpdated",
        "ShieldedEscrowVaultUpdated",
        "ShieldedIdentityRegistryUpdated",
        "SettlementDependenciesUpdated"
      ]
    },
    {
      label: "settlementEngine",
      address: deployment.settlementEngine,
      abi: SETTLEMENT_MONITOR_ABI,
      eventNames: ["OwnershipTransferred", "AVSUpdated"]
    },
    {
      label: "slashedPot",
      address: deployment.slashedPot,
      abi: SLASHED_POT_MONITOR_ABI,
      eventNames: ["OwnershipTransferred", "MarketUpdated"]
    }
  ].filter((target) => target.address);

  if (deployment.shieldedEscrowVault) {
    targets.push({
      label: "shieldedEscrowVault",
      address: deployment.shieldedEscrowVault,
      abi: VAULT_MONITOR_ABI,
      eventNames: ["OwnershipTransferred", "MarketUpdated", "PreviewReaderUpdated", "ShieldedBidVerifierUpdated"]
    });
  }

  if (deployment.shieldedIdentityRegistry) {
    targets.push({
      label: "shieldedIdentityRegistry",
      address: deployment.shieldedIdentityRegistry,
      abi: REGISTRY_MONITOR_ABI,
      eventNames: ["OwnershipTransferred", "MarketUpdated"]
    });
  }

  if (deployment.timelockController) {
    targets.push({
      label: "timelockController",
      address: deployment.timelockController,
      abi: TIMELOCK_MONITOR_ABI,
      eventNames: ["CallScheduled", "CallExecuted", "Cancelled", "MinDelayChange"]
    });
  }

  const events = [];
  for (const target of targets) {
    events.push(...(await collectEvents(target, fromBlock, toBlock)));
  }

  events.sort((left, right) => left.blockNumber - right.blockNumber);

  const report = {
    network: descriptor.name,
    generatedAt: new Date().toISOString(),
    currentBlock,
    fromBlock: Number(fromBlock),
    lookbackBlocks,
    eventCount: events.length,
    events
  };

  await writeJsonFile(runtimeFile.replace(".runtime.json", ".admin-events.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
