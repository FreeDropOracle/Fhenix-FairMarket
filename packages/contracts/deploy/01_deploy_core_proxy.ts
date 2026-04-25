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
  let settlementEngineAddress = process.env.PHASE2_SETTLEMENT_ENGINE || existing.settlementEngine;
  if (settlementEngineAddress) {
    const deployedCode = await ethers.provider.getCode(settlementEngineAddress);
    if (deployedCode === "0x") {
      settlementEngineAddress = undefined;
    }
  }

  if (!settlementEngineAddress) {
    const settlementEngineFactory = await ethers.getContractFactory("SettlementEngine");
    const settlementEngine = await settlementEngineFactory.deploy();
    await settlementEngine.waitForDeployment();
    settlementEngineAddress = await settlementEngine.getAddress();
  }

  let slashedPot = process.env.PHASE1_SLASHED_POT || existing.slashedPot;
  if (slashedPot && slashedPot !== ethers.ZeroAddress) {
    const deployedCode = await ethers.provider.getCode(slashedPot);
    if (deployedCode === "0x") {
      slashedPot = undefined;
    }
  }

  if (!slashedPot || slashedPot === ethers.ZeroAddress) {
    const slashedPotFactory = await ethers.getContractFactory("SlashedPot");
    const slashedPotInstance = await slashedPotFactory.deploy(initialOwner, settlementEngineAddress);
    await slashedPotInstance.waitForDeployment();
    slashedPot = await slashedPotInstance.getAddress();
  }

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

  const market = implementationFactory.attach(await proxy.getAddress());
  const slashedPotFactory = await ethers.getContractFactory("SlashedPot");
  const slashedPotInstance = slashedPotFactory.attach(slashedPot);

  if ((await slashedPotInstance.market()) != (await proxy.getAddress())) {
    await (await slashedPotInstance.connect(defaultSigner).setMarket(await proxy.getAddress())).wait();
  }

  if ((await market.settlementEngine()) != settlementEngineAddress) {
    await (await market.connect(defaultSigner).setSettlementEngine(settlementEngineAddress)).wait();
  }

  const nextPayload = {
    ...existing,
    adapter: adapterAddress,
    settlementEngine: settlementEngineAddress,
    implementation: await implementation.getAddress(),
    proxy: await proxy.getAddress(),
    initialOwner,
    slashedPot
  };

  await writeFile(deploymentFile, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");

  console.log(`Implementation deployed to ${nextPayload.implementation}`);
  console.log(`Proxy deployed to ${nextPayload.proxy}`);
  console.log(`SlashedPot deployed to ${nextPayload.slashedPot}`);
  console.log(`SettlementEngine configured at ${nextPayload.settlementEngine}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
