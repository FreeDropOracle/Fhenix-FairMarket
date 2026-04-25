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

  const adapterFactory = await ethers.getContractFactory("CofheAdapter");
  const adapter = await adapterFactory.deploy();
  await adapter.waitForDeployment();

  const settlementEngineFactory = await ethers.getContractFactory("SettlementEngine");
  const settlementEngine = await settlementEngineFactory.deploy();
  await settlementEngine.waitForDeployment();

  const existing = await readDeploymentFile(deploymentFile);
  const nextPayload = {
    ...existing,
    adapter: await adapter.getAddress(),
    settlementEngine: await settlementEngine.getAddress()
  };

  await writeFile(deploymentFile, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");

  console.log(`Adapter deployed to ${nextPayload.adapter}`);
  console.log(`SettlementEngine deployed to ${nextPayload.settlementEngine}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
