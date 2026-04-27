import { ethers, network } from "hardhat";

import { readDeploymentFile, resolveDeploymentPaths, resolveNetworkDescriptor, writeJsonFile } from "./utils";

async function main() {
  const descriptor = await resolveNetworkDescriptor(network.name);
  const { deploymentFile } = resolveDeploymentPaths(network.name);
  const deployment = await readDeploymentFile(deploymentFile);

  if (!deployment.proxy || !deployment.adapter) {
    throw new Error(`Deployment registry is missing proxy or adapter: ${deploymentFile}`);
  }

  const [defaultSigner] = await ethers.getSigners();
  const market = await ethers.getContractAt("FhenixFairMarket", deployment.proxy);
  const [owner, previousAdapter] = await Promise.all([market.owner(), market.cofheAdapter()]);

  if (owner.toLowerCase() !== defaultSigner.address.toLowerCase()) {
    throw new Error(
      `The loaded signer ${defaultSigner.address} does not own the proxy. Current owner: ${owner}`
    );
  }

  if (previousAdapter.toLowerCase() === deployment.adapter.toLowerCase()) {
    console.log(
      JSON.stringify(
        {
          network: descriptor.name,
          proxy: deployment.proxy,
          adapter: deployment.adapter,
          changed: false
        },
        null,
        2
      )
    );
    return;
  }

  const tx = await market.connect(defaultSigner).setCofheAdapter(deployment.adapter);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("The adapter rotation transaction did not complete successfully.");
  }

  const onChainAdapter = await market.cofheAdapter();
  if (onChainAdapter.toLowerCase() !== deployment.adapter.toLowerCase()) {
    throw new Error(`Unexpected adapter pointer after rotation: ${onChainAdapter}`);
  }

  await writeJsonFile(deploymentFile, {
    ...deployment,
    chainId: descriptor.chainId.toString(),
    network: descriptor.name,
    adapterRotationTxHash: receipt.hash,
    adapterRotatedAt: new Date().toISOString(),
    previousAdapterOnChain: previousAdapter
  });

  console.log(
    JSON.stringify(
      {
        network: descriptor.name,
        proxy: deployment.proxy,
        previousAdapter,
        nextAdapter: onChainAdapter,
        adapterRotationTxHash: receipt.hash
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
