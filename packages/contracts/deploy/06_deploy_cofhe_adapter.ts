import { ethers, network } from "hardhat";

import {
  assertPrototypeAdapterLocalOnly,
  readDeploymentFile,
  resolveDeploymentPaths,
  resolveNetworkDescriptor,
  writeJsonFile
} from "./utils";

async function main() {
  const descriptor = await resolveNetworkDescriptor(network.name);
  assertPrototypeAdapterLocalOnly(descriptor);
  const { deploymentFile } = resolveDeploymentPaths(network.name);
  const existing = await readDeploymentFile(deploymentFile);
  const [defaultSigner] = await ethers.getSigners();

  const adapterFactory = await ethers.getContractFactory("CofheAdapter");
  const adapter = await adapterFactory.deploy();
  await adapter.waitForDeployment();

  const nextPayload = {
    ...existing,
    chainId: descriptor.chainId.toString(),
    network: descriptor.name,
    adapter: await adapter.getAddress(),
    adapterDeployer: defaultSigner.address,
    adapterDeployedAt: new Date().toISOString(),
    previousAdapter: existing.adapter || ""
  };

  await writeJsonFile(deploymentFile, nextPayload);

  console.log(
    JSON.stringify(
      {
        network: descriptor.name,
        previousAdapter: existing.adapter || null,
        nextAdapter: nextPayload.adapter,
        adapterDeployer: defaultSigner.address
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
