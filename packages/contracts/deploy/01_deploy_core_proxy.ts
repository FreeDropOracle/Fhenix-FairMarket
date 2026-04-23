import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ethers, network } from "hardhat";

async function readDeploymentFile(targetFile: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(targetFile, "utf8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

async function main() {
  const deploymentDirectory = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentDirectory, `${network.name}.json`);

  await mkdir(deploymentDirectory, { recursive: true });

  const existing = await readDeploymentFile(deploymentFile);
  let adapterAddress = process.env.PHASE1_ADAPTER_ADDRESS || existing.adapter;
  if (adapterAddress) {
    const deployedCode = await ethers.provider.getCode(adapterAddress);
    if (deployedCode === "0x") {
      adapterAddress = undefined;
    }
  }

  if (!adapterAddress) {
    const adapterFactory = await ethers.getContractFactory("CofheAdapter");
    const adapter = await adapterFactory.deploy();
    await adapter.waitForDeployment();
    adapterAddress = await adapter.getAddress();
  }

  const [defaultSigner] = await ethers.getSigners();
  const initialOwner = process.env.PHASE1_INITIAL_OWNER || defaultSigner.address;
  const slashedPot = process.env.PHASE1_SLASHED_POT || ethers.ZeroAddress;

  const implementationFactory = await ethers.getContractFactory("FhenixFairMarket");
  const implementation = await implementationFactory.deploy();
  await implementation.waitForDeployment();

  const initData = implementationFactory.interface.encodeFunctionData("initialize", [
    adapterAddress,
    initialOwner,
    slashedPot
  ]);

  const proxyFactory = await ethers.getContractFactory("FhenixFairMarketProxy");
  const proxy = await proxyFactory.deploy(await implementation.getAddress(), initData);
  await proxy.waitForDeployment();

  const nextPayload = {
    ...existing,
    adapter: adapterAddress,
    implementation: await implementation.getAddress(),
    proxy: await proxy.getAddress(),
    initialOwner,
    slashedPot
  };

  await writeFile(deploymentFile, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");

  console.log(`Implementation deployed to ${nextPayload.implementation}`);
  console.log(`Proxy deployed to ${nextPayload.proxy}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
