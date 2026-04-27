import { ethers, network } from "hardhat";

import { readDeploymentFile, resolveDeploymentPaths, resolveNetworkDescriptor, writeJsonFile } from "./utils";

const ERC1967_IMPLEMENTATION_SLOT =
  "0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC";

const TARGET_MIN_AUCTION_DURATION = 60n;
const TARGET_MAX_AUCTION_DURATION = 90n * 24n * 60n * 60n;

function decodeImplementationAddress(storageValue: string) {
  return ethers.getAddress(`0x${storageValue.slice(-40)}`);
}

async function readImplementationAddress(proxyAddress: string) {
  const raw = (await ethers.provider.send("eth_getStorageAt", [
    proxyAddress,
    ERC1967_IMPLEMENTATION_SLOT,
    "latest"
  ])) as string;

  return decodeImplementationAddress(raw);
}

async function main() {
  const descriptor = await resolveNetworkDescriptor(network.name);
  const { deploymentFile } = resolveDeploymentPaths(network.name);
  const deployment = await readDeploymentFile(deploymentFile);

  if (!deployment.proxy || !deployment.implementation) {
    throw new Error(`Deployment registry is incomplete: ${deploymentFile}`);
  }

  const [defaultSigner] = await ethers.getSigners();
  const implementationFactory = await ethers.getContractFactory("FhenixFairMarket");
  const market = implementationFactory.attach(deployment.proxy);

  const [owner, beforeImplementation, beforeVersion, beforeMinDuration, beforeMaxDuration] = await Promise.all([
    market.owner(),
    readImplementationAddress(deployment.proxy),
    market.contractVersion(),
    market.MIN_AUCTION_DURATION(),
    market.MAX_AUCTION_DURATION()
  ]);

  if (owner.toLowerCase() !== defaultSigner.address.toLowerCase()) {
    throw new Error(
      `The loaded signer ${defaultSigner.address} does not own the proxy. Current owner: ${owner}`
    );
  }

  const nextImplementation = await implementationFactory.deploy();
  await nextImplementation.waitForDeployment();
  const nextImplementationAddress = await nextImplementation.getAddress();

  if (nextImplementationAddress.toLowerCase() === beforeImplementation.toLowerCase()) {
    throw new Error(`The new implementation matches the current implementation at ${beforeImplementation}`);
  }

  const upgradeTx = await market.connect(defaultSigner).upgradeToAndCall(nextImplementationAddress, "0x");
  const upgradeReceipt = await upgradeTx.wait();

  if (!upgradeReceipt || upgradeReceipt.status !== 1) {
    throw new Error("The upgrade transaction did not complete successfully.");
  }

  const [afterImplementation, afterVersion, afterMinDuration, afterMaxDuration] = await Promise.all([
    readImplementationAddress(deployment.proxy),
    market.contractVersion(),
    market.MIN_AUCTION_DURATION(),
    market.MAX_AUCTION_DURATION()
  ]);

  if (afterImplementation.toLowerCase() !== nextImplementationAddress.toLowerCase()) {
    throw new Error(
      `Proxy implementation did not update correctly. Expected ${nextImplementationAddress}, got ${afterImplementation}`
    );
  }

  if (afterMinDuration !== TARGET_MIN_AUCTION_DURATION) {
    throw new Error(`Unexpected MIN_AUCTION_DURATION after upgrade: ${afterMinDuration.toString()}`);
  }

  if (afterMaxDuration !== TARGET_MAX_AUCTION_DURATION) {
    throw new Error(`Unexpected MAX_AUCTION_DURATION after upgrade: ${afterMaxDuration.toString()}`);
  }

  const nextPayload = {
    ...deployment,
    chainId: descriptor.chainId.toString(),
    implementation: nextImplementationAddress,
    network: descriptor.name,
    previousImplementation: beforeImplementation,
    upgradeDeployer: defaultSigner.address,
    upgradeTxHash: upgradeReceipt.hash,
    upgradedAt: new Date().toISOString()
  };

  await writeJsonFile(deploymentFile, nextPayload);

  console.log(
    JSON.stringify(
      {
        network: descriptor.name,
        proxy: deployment.proxy,
        owner,
        contractVersion: {
          before: beforeVersion,
          after: afterVersion
        },
        implementation: {
          before: beforeImplementation,
          after: afterImplementation
        },
        minAuctionDuration: {
          before: beforeMinDuration.toString(),
          after: afterMinDuration.toString()
        },
        maxAuctionDuration: {
          before: beforeMaxDuration.toString(),
          after: afterMaxDuration.toString()
        },
        upgradeTxHash: upgradeReceipt.hash
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
