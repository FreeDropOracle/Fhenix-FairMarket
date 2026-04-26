import { ethers, network } from "hardhat";

import { readDeploymentFile, resolveDeploymentPaths, resolveNetworkDescriptor, writeJsonFile } from "./utils";

async function main() {
  const { deploymentFile } = resolveDeploymentPaths(network.name);
  const descriptor = await resolveNetworkDescriptor(network.name);

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
  let avsOperators = existing.avsOperators;
  let avsThreshold = existing.avsThreshold;
  let avsAddress = process.env.PHASE3_AVS || existing.avs;
  if (avsAddress) {
    const deployedCode = await ethers.provider.getCode(avsAddress);
    if (deployedCode === "0x") {
      avsAddress = undefined;
    }
  }

  let settlementEngineAddress = process.env.PHASE2_SETTLEMENT_ENGINE || existing.settlementEngine;
  if (settlementEngineAddress) {
    const deployedCode = await ethers.provider.getCode(settlementEngineAddress);
    if (deployedCode === "0x") {
      settlementEngineAddress = undefined;
    }
  }

  if (!settlementEngineAddress) {
    const settlementEngineFactory = await ethers.getContractFactory("SettlementEngine");
    const settlementEngine = await settlementEngineFactory.deploy(initialOwner);
    await settlementEngine.waitForDeployment();
    settlementEngineAddress = await settlementEngine.getAddress();
  }

  if (!avsAddress) {
    const avsFactory = await ethers.getContractFactory("MockEigenLayerAVS");
    const avs = await avsFactory.deploy(initialOwner, [defaultSigner.address], 1);
    await avs.waitForDeployment();
    avsAddress = await avs.getAddress();
    avsOperators = JSON.stringify([defaultSigner.address]);
    avsThreshold = "1";
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

  const settlementEngineFactory = await ethers.getContractFactory("SettlementEngine");
  const settlementEngine = settlementEngineFactory.attach(settlementEngineAddress);
  if ((await settlementEngine.avs()) != avsAddress) {
    await (await settlementEngine.connect(defaultSigner).setAVS(avsAddress)).wait();
  }

  const nextPayload = {
    ...existing,
    adapter: adapterAddress,
    avs: avsAddress,
    ...(avsOperators ? { avsOperators } : {}),
    ...(avsThreshold ? { avsThreshold } : {}),
    chainId: descriptor.chainId.toString(),
    deployer: defaultSigner.address,
    deployedAt: new Date().toISOString(),
    settlementEngine: settlementEngineAddress,
    implementation: await implementation.getAddress(),
    network: descriptor.name,
    proxy: await proxy.getAddress(),
    proxyInitData: initData,
    initialOwner,
    slashedPot
  };

  await writeJsonFile(deploymentFile, nextPayload);

  console.log(`Implementation deployed to ${nextPayload.implementation}`);
  console.log(`Proxy deployed to ${nextPayload.proxy}`);
  console.log(`SlashedPot deployed to ${nextPayload.slashedPot}`);
  console.log(`SettlementEngine configured at ${nextPayload.settlementEngine}`);
  console.log(`Mock AVS configured at ${nextPayload.avs}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
