import { ethers, network } from "hardhat";

import {
  readDeploymentFile,
  resolveAdminTimelockConfig,
  resolveDeploymentPaths,
  resolveNetworkDescriptor,
  writeJsonFile
} from "./utils";

const OWNABLE_ABI = [
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)"
];

interface OwnableTarget {
  label: string;
  address: string;
}

function requireDeploymentField(record: Record<string, string>, field: string): string {
  const value = record[field];
  if (!value || value.trim() === "") {
    throw new Error(`Missing deployment field: ${field}`);
  }

  return value;
}

async function transferOwnershipIfNeeded(
  signer: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  target: OwnableTarget,
  nextOwner: string
): Promise<{ label: string; address: string; owner: string; updated: boolean }> {
  const ownable = new ethers.Contract(target.address, OWNABLE_ABI, signer);
  const currentOwner = await ownable.owner();

  if (currentOwner.toLowerCase() === nextOwner.toLowerCase()) {
    return {
      label: target.label,
      address: target.address,
      owner: currentOwner,
      updated: false
    };
  }

  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `${target.label} is owned by ${currentOwner}, not the loaded signer ${signer.address}. Transfer cannot proceed safely.`
    );
  }

  await (await ownable.transferOwnership(nextOwner)).wait();
  return {
    label: target.label,
    address: target.address,
    owner: nextOwner,
    updated: true
  };
}

async function main() {
  const descriptor = await resolveNetworkDescriptor(network.name);
  const { deploymentFile } = resolveDeploymentPaths(network.name);
  const deployment = await readDeploymentFile(deploymentFile);
  const [defaultSigner] = await ethers.getSigners();
  const config = resolveAdminTimelockConfig(defaultSigner.address, descriptor);

  const timelockFactory = await ethers.getContractFactory(
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController"
  );

  let timelockAddress = deployment.timelockController;
  if (timelockAddress) {
    const existingCode = await ethers.provider.getCode(timelockAddress);
    if (existingCode === "0x") {
      timelockAddress = undefined;
    }
  }

  if (!timelockAddress) {
    const timelock = await timelockFactory.deploy(
      config.minDelaySeconds,
      config.proposers,
      config.executors,
      config.adminRoleHolder
    );
    await timelock.waitForDeployment();
    timelockAddress = await timelock.getAddress();
  }

  const ownableTargets: OwnableTarget[] = [
    { label: "market proxy", address: requireDeploymentField(deployment, "proxy") },
    { label: "settlement engine", address: requireDeploymentField(deployment, "settlementEngine") },
    { label: "slashed pot", address: requireDeploymentField(deployment, "slashedPot") }
  ];

  if (deployment.shieldedEscrowVault) {
    ownableTargets.push({ label: "shielded escrow vault", address: deployment.shieldedEscrowVault });
  }
  if (deployment.shieldedIdentityRegistry) {
    ownableTargets.push({ label: "shielded identity registry", address: deployment.shieldedIdentityRegistry });
  }

  const ownershipResults = [];
  for (const target of ownableTargets) {
    ownershipResults.push(await transferOwnershipIfNeeded(defaultSigner, target, timelockAddress));
  }

  const nextDeployment = {
    ...deployment,
    adminOwner: config.adminOwner,
    timelockAdmin: config.adminRoleHolder,
    timelockController: timelockAddress,
    timelockDelaySeconds: config.minDelaySeconds.toString(),
    timelockExecutors: JSON.stringify(config.executors),
    timelockProposers: JSON.stringify(config.proposers),
    ownershipHardenedAt: new Date().toISOString()
  };

  await writeJsonFile(deploymentFile, nextDeployment);

  console.log(
    JSON.stringify(
      {
        network: descriptor.name,
        timelockController: timelockAddress,
        adminOwner: config.adminOwner,
        timelockAdmin: config.adminRoleHolder,
        timelockDelaySeconds: config.minDelaySeconds,
        ownershipResults
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
