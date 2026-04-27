import { run } from "hardhat";

import { readDeploymentFile, resolveDeploymentPaths } from "./utils";

interface VerifyPayload {
  address: string;
  constructorArguments?: unknown[];
  contract?: string;
}

async function verifyAddress(label: string, payload: VerifyPayload) {
  try {
    await run("verify:verify", payload);
    console.log(`Verified ${label} at ${payload.address}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Already Verified") || message.includes("already verified")) {
      console.log(`Already verified: ${label} at ${payload.address}`);
      return;
    }

    throw error;
  }
}

async function main() {
  const { deploymentFile } = resolveDeploymentPaths();
  const deployment = await readDeploymentFile(deploymentFile);

  if (!deployment.implementation || !deployment.proxy || !deployment.adapter || !deployment.settlementEngine || !deployment.slashedPot) {
    throw new Error(`Deployment registry is incomplete: ${deploymentFile}`);
  }

  await verifyAddress("CofheAdapter", {
    address: deployment.adapter
  });

  await verifyAddress("SettlementEngine", {
    address: deployment.settlementEngine,
    constructorArguments: [deployment.initialOwner]
  });

  await verifyAddress("SlashedPot", {
    address: deployment.slashedPot,
    constructorArguments: [deployment.initialOwner, deployment.settlementEngine]
  });

  await verifyAddress("FhenixFairMarket implementation", {
    address: deployment.implementation
  });

  await verifyAddress("FhenixFairMarketProxy", {
    address: deployment.proxy,
    constructorArguments: [deployment.implementation, deployment.proxyInitData],
    contract: "contracts/core/FhenixFairMarketProxy.sol:FhenixFairMarketProxy"
  });

  if (deployment.avs && deployment.avsOperators && deployment.avsThreshold) {
    await verifyAddress("MockEigenLayerAVS", {
      address: deployment.avs,
      constructorArguments: [deployment.initialOwner, JSON.parse(deployment.avsOperators), Number(deployment.avsThreshold)]
    });
  } else {
    console.log("Skipping AVS verification because constructor metadata is unavailable.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
