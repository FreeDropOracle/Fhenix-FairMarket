import { ethers } from "hardhat";

import { readDeploymentFile, resolveDeploymentPaths, writeJsonFile } from "./utils";

const MARKET_ABI = [
  "function owner() view returns (address)",
  "function settlementEngine() view returns (address)",
  "function slashedPot() view returns (address)",
  "function cofheAdapter() view returns (address)",
  "function contractVersion() view returns (string)"
];

const SETTLEMENT_ENGINE_ABI = [
  "function owner() view returns (address)",
  "function avs() view returns (address)"
];

const SLASHED_POT_ABI = [
  "function market() view returns (address)",
  "function settlementEngine() view returns (address)"
];

async function assertCode(address: string, label: string) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`${label} is missing code at ${address}`);
  }
}

async function main() {
  const { deploymentFile, runtimeFile } = resolveDeploymentPaths();
  const deployment = await readDeploymentFile(deploymentFile);

  const requiredFields = ["adapter", "avs", "implementation", "proxy", "settlementEngine", "slashedPot", "initialOwner"];
  for (const field of requiredFields) {
    if (!deployment[field]) {
      throw new Error(`Missing deployment field: ${field}`);
    }
  }

  await assertCode(deployment.adapter, "adapter");
  await assertCode(deployment.avs, "avs");
  await assertCode(deployment.implementation, "implementation");
  await assertCode(deployment.proxy, "proxy");
  await assertCode(deployment.settlementEngine, "settlementEngine");
  await assertCode(deployment.slashedPot, "slashedPot");

  const market = new ethers.Contract(deployment.proxy, MARKET_ABI, ethers.provider);
  const settlementEngine = new ethers.Contract(deployment.settlementEngine, SETTLEMENT_ENGINE_ABI, ethers.provider);
  const slashedPot = new ethers.Contract(deployment.slashedPot, SLASHED_POT_ABI, ethers.provider);

  const [marketOwner, marketSettlementEngine, marketSlashedPot, marketAdapter, contractVersion, engineOwner, engineAvs, potMarket, potSettlementEngine] =
    await Promise.all([
      market.owner(),
      market.settlementEngine(),
      market.slashedPot(),
      market.cofheAdapter(),
      market.contractVersion(),
      settlementEngine.owner(),
      settlementEngine.avs(),
      slashedPot.market(),
      slashedPot.settlementEngine()
    ]);

  const lowerInitialOwner = deployment.initialOwner.toLowerCase();
  if (marketOwner.toLowerCase() !== lowerInitialOwner) {
    throw new Error(`Unexpected market owner: ${marketOwner}`);
  }
  if (engineOwner.toLowerCase() !== lowerInitialOwner) {
    throw new Error(`Unexpected settlement engine owner: ${engineOwner}`);
  }
  if (marketSettlementEngine.toLowerCase() !== deployment.settlementEngine.toLowerCase()) {
    throw new Error(`Unexpected settlement engine pointer: ${marketSettlementEngine}`);
  }
  if (marketSlashedPot.toLowerCase() !== deployment.slashedPot.toLowerCase()) {
    throw new Error(`Unexpected slashed pot pointer: ${marketSlashedPot}`);
  }
  if (marketAdapter.toLowerCase() !== deployment.adapter.toLowerCase()) {
    throw new Error(`Unexpected adapter pointer: ${marketAdapter}`);
  }
  if (engineAvs.toLowerCase() !== deployment.avs.toLowerCase()) {
    throw new Error(`Unexpected AVS pointer: ${engineAvs}`);
  }
  if (potMarket.toLowerCase() !== deployment.proxy.toLowerCase()) {
    throw new Error(`Unexpected slashed pot market pointer: ${potMarket}`);
  }
  if (potSettlementEngine.toLowerCase() !== deployment.settlementEngine.toLowerCase()) {
    throw new Error(`Unexpected slashed pot settlement engine pointer: ${potSettlementEngine}`);
  }

  const smokeReport = {
    checkedAt: new Date().toISOString(),
    contractVersion,
    owner: marketOwner,
    proxy: deployment.proxy,
    settlementEngine: deployment.settlementEngine,
    slashedPot: deployment.slashedPot,
    avs: deployment.avs,
    adapter: deployment.adapter,
    ok: true
  };

  await writeJsonFile(runtimeFile.replace(".runtime.json", ".smoke.json"), smokeReport);
  console.log(JSON.stringify(smokeReport, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
