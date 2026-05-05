import { ethers, network } from "hardhat";

import {
  assertPrototypeAdapterLocalOnly,
  ensureDirectory,
  readDeploymentFile,
  resolveDeploymentPaths,
  resolveNetworkDescriptor,
  writeJsonFile
} from "./utils";

async function main() {
  const { deploymentDirectory, deploymentFile } = resolveDeploymentPaths(network.name);
  const descriptor = await resolveNetworkDescriptor(network.name);
  assertPrototypeAdapterLocalOnly(descriptor);
  await ensureDirectory(deploymentDirectory);
  const [defaultSigner] = await ethers.getSigners();
  const initialOwner = process.env.PHASE1_INITIAL_OWNER || defaultSigner.address;

  const adapterFactory = await ethers.getContractFactory("CofheAdapter");
  const adapter = await adapterFactory.deploy();
  await adapter.waitForDeployment();

  const settlementEngineFactory = await ethers.getContractFactory("SettlementEngine");
  const settlementEngine = await settlementEngineFactory.deploy(initialOwner);
  await settlementEngine.waitForDeployment();

  const existing = await readDeploymentFile(deploymentFile);
  const nextPayload = {
    ...existing,
    chainId: descriptor.chainId.toString(),
    deployer: defaultSigner.address,
    deployedAt: new Date().toISOString(),
    initialOwner,
    network: descriptor.name,
    adapter: await adapter.getAddress(),
    settlementEngine: await settlementEngine.getAddress()
  };

  await writeJsonFile(deploymentFile, nextPayload);

  console.log(`Adapter deployed to ${nextPayload.adapter}`);
  console.log(`SettlementEngine deployed to ${nextPayload.settlementEngine}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
