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

export interface AdminTimelockConfig {
  adminOwner: string;
  adminRoleHolder: string;
  minDelaySeconds: number;
  proposers: string[];
  executors: string[];
}

const LOCAL_NETWORK_NAMES = new Set(["hardhat", "localhost", "anvil"]);
const LOCAL_CHAIN_IDS = new Set([1337, 31337]);

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

export function assertPrototypeAdapterLocalOnly(descriptor: NetworkDescriptor): void {
  if (isLocalNetworkDescriptor(descriptor)) {
    return;
  }

  throw new Error(
    [
      `Prototype CofheAdapter deployment is disabled on non-local networks (${descriptor.name}, chainId=${descriptor.chainId}).`,
      "The current adapter path is reversible placeholder encoding and must not be deployed to public networks.",
      "Use a production opaque-ciphertext adapter before deploying this stack outside local development."
    ].join(" ")
  );
}

export function isLocalNetworkDescriptor(descriptor: NetworkDescriptor): boolean {
  return LOCAL_NETWORK_NAMES.has(descriptor.name) || LOCAL_CHAIN_IDS.has(descriptor.chainId);
}

export function resolveAdminOwner(defaultSignerAddress: string, descriptor: NetworkDescriptor): string {
  const configuredOwner = process.env.ADMIN_MULTISIG_ADDRESS || process.env.PHASE1_INITIAL_OWNER;
  if (configuredOwner && configuredOwner.trim() !== "") {
    return configuredOwner.trim();
  }

  if (isLocalNetworkDescriptor(descriptor)) {
    return defaultSignerAddress;
  }

  throw new Error(
    [
      `Missing ADMIN_MULTISIG_ADDRESS for ${descriptor.name} (chainId=${descriptor.chainId}).`,
      "Public or shared-network deployments must place admin ownership behind a multisig or timelock-controlled admin address."
    ].join(" ")
  );
}

export function parseAddressList(value: string | undefined, fallback: string[]): string[] {
  if (!value || value.trim() === "") {
    return fallback;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

export function resolveAdminTimelockConfig(defaultSignerAddress: string, descriptor: NetworkDescriptor): AdminTimelockConfig {
  const adminOwner = resolveAdminOwner(defaultSignerAddress, descriptor);
  const adminRoleHolder = process.env.ADMIN_TIMELOCK_ADMIN?.trim() || adminOwner;
  const minDelaySeconds = Number(process.env.ADMIN_TIMELOCK_DELAY_SECONDS || "86400");
  if (!Number.isFinite(minDelaySeconds) || minDelaySeconds < 0) {
    throw new Error(`Invalid ADMIN_TIMELOCK_DELAY_SECONDS: ${process.env.ADMIN_TIMELOCK_DELAY_SECONDS}`);
  }

  const proposers = parseAddressList(process.env.ADMIN_TIMELOCK_PROPOSERS, [adminOwner]);
  const executors = parseAddressList(process.env.ADMIN_TIMELOCK_EXECUTORS, [adminOwner]);

  return {
    adminOwner,
    adminRoleHolder,
    minDelaySeconds,
    proposers,
    executors
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
