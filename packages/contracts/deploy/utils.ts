import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ethers, network } from "hardhat";

export type DeploymentRecord = Record<string, string>;

export interface DeploymentPaths {
  deploymentDirectory: string;
  deploymentFile: string;
  frontendEnvFile: string;
  keeperEnvFile: string;
  runtimeFile: string;
}

export interface NetworkDescriptor {
  name: string;
  chainId: number;
  rpcUrl: string;
  websocketUrl: string;
  blockExplorerUrl: string;
}

export function resolveDeploymentPaths(targetNetwork: string = network.name): DeploymentPaths {
  const deploymentDirectory = path.join(__dirname, "..", "deployments");
  return {
    deploymentDirectory,
    deploymentFile: path.join(deploymentDirectory, `${targetNetwork}.json`),
    frontendEnvFile: path.join(deploymentDirectory, `${targetNetwork}.frontend.env`),
    keeperEnvFile: path.join(deploymentDirectory, `${targetNetwork}.keeper.env`),
    runtimeFile: path.join(deploymentDirectory, `${targetNetwork}.runtime.json`)
  };
}

export async function ensureDirectory(targetDirectory: string): Promise<void> {
  await mkdir(targetDirectory, { recursive: true });
}

export async function readDeploymentFile(targetFile: string): Promise<DeploymentRecord> {
  try {
    const raw = await readFile(targetFile, "utf8");
    return JSON.parse(raw) as DeploymentRecord;
  } catch {
    return {};
  }
}

export async function writeJsonFile(targetFile: string, payload: unknown): Promise<void> {
  await ensureDirectory(path.dirname(targetFile));
  await writeFile(targetFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function writeTextFile(targetFile: string, payload: string): Promise<void> {
  await ensureDirectory(path.dirname(targetFile));
  await writeFile(targetFile, payload, "utf8");
}

export async function resolveNetworkDescriptor(targetNetwork: string = network.name): Promise<NetworkDescriptor> {
  const { chainId } = await ethers.provider.getNetwork();
  const numericChainId = Number(chainId);

  return {
    name: targetNetwork,
    chainId: numericChainId,
    rpcUrl: resolveRpcUrl(targetNetwork),
    websocketUrl: resolveWebsocketUrl(targetNetwork),
    blockExplorerUrl: resolveBlockExplorerUrl(targetNetwork, numericChainId)
  };
}

export function resolveRpcUrl(targetNetwork: string): string {
  if (targetNetwork === "sepolia" || targetNetwork === "fhenixTestnet") {
    return (
      process.env.SEPOLIA_RPC_URL ||
      process.env.FHENIX_TESTNET_RPC_URL ||
      "https://ethereum-sepolia-rpc.publicnode.com"
    );
  }

  return process.env.RPC_URL || "http://127.0.0.1:8545";
}

export function resolveWebsocketUrl(targetNetwork: string): string {
  if (targetNetwork === "sepolia" || targetNetwork === "fhenixTestnet") {
    return process.env.SEPOLIA_WS_URL || process.env.KEEPER_WS_URL || "wss://ethereum-sepolia-rpc.publicnode.com";
  }

  return process.env.KEEPER_WS_URL || "ws://127.0.0.1:8545";
}

export function resolveBlockExplorerUrl(targetNetwork: string, chainId: number): string {
  if (targetNetwork === "sepolia" || chainId === 11155111) {
    return process.env.BLOCK_EXPLORER_URL || "https://sepolia.etherscan.io";
  }

  return process.env.BLOCK_EXPLORER_URL || "";
}
