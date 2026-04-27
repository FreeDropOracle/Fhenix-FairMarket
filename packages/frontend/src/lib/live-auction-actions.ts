import { Interface, formatEther, getAddress } from "ethers";

import type { Eip1193Provider } from "@/lib/eip1193";

const marketInterface = new Interface([
  "function lockEscrow(uint256 auctionId) payable",
  "function escrowBalances(uint256 auctionId, address bidder) view returns (uint256)"
]);

type JsonRpcReceipt = {
  status?: string;
  transactionHash?: string;
};

type LockEscrowParams = {
  account: string;
  amountWei: bigint;
  auctionId: bigint;
  explorerBaseUrl: string;
  marketAddress: string;
  onProgress?: (message: string) => void;
  provider: Eip1193Provider;
};

export type LockEscrowResult = {
  txHash: string;
  txUrl: string;
  walletEscrowEth: string;
  walletEscrowWei: string;
};

type EscrowBalanceResult = {
  escrowEth: string;
  escrowWei: string;
};

function toHexQuantity(value: bigint) {
  return `0x${value.toString(16)}`;
}

function normalizeErrorMessage(error: unknown) {
  const candidate =
    typeof error === "object" && error !== null
      ? "shortMessage" in error && typeof error.shortMessage === "string"
        ? error.shortMessage
        : "message" in error && typeof error.message === "string"
          ? error.message
          : "error" in error &&
              typeof error.error === "object" &&
              error.error !== null &&
              "message" in error.error &&
              typeof error.error.message === "string"
            ? error.error.message
            : null
      : null;

  if (!candidate) {
    return "Transaction failed. Please try again.";
  }

  if (candidate.includes("user rejected")) {
    return "Transaction was rejected in the wallet.";
  }

  return candidate;
}

async function callContract<T>(
  provider: Eip1193Provider,
  to: string,
  data: string,
  decode: (raw: string) => T
) {
  const raw = (await provider.request({
    method: "eth_call",
    params: [{ to, data }, "latest"]
  })) as string;

  return decode(raw);
}

async function sendTransaction(
  provider: Eip1193Provider,
  request: { from: string; to: string; data: string; value?: string }
) {
  return (await provider.request({
    method: "eth_sendTransaction",
    params: [request]
  })) as string;
}

async function waitForReceipt(provider: Eip1193Provider, txHash: string, timeoutMs = 180_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const receipt = (await provider.request({
      method: "eth_getTransactionReceipt",
      params: [txHash]
    })) as JsonRpcReceipt | null;

    if (receipt) {
      return receipt;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1_250));
  }

  throw new Error("Transaction confirmation timed out.");
}

export async function readEscrowBalanceWithWallet(
  provider: Eip1193Provider,
  marketAddress: string,
  auctionId: bigint,
  account: string
): Promise<EscrowBalanceResult> {
  const normalizedMarketAddress = getAddress(marketAddress);
  const normalizedAccount = getAddress(account);

  try {
    const escrowWei = await callContract(
      provider,
      normalizedMarketAddress,
      marketInterface.encodeFunctionData("escrowBalances", [auctionId, normalizedAccount]),
      (raw) => marketInterface.decodeFunctionResult("escrowBalances", raw)[0] as bigint
    );

    return {
      escrowEth: Number.parseFloat(formatEther(escrowWei)).toFixed(4),
      escrowWei: escrowWei.toString()
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function lockEscrowWithWallet({
  account,
  amountWei,
  auctionId,
  explorerBaseUrl,
  marketAddress,
  onProgress,
  provider
}: LockEscrowParams): Promise<LockEscrowResult> {
  const normalizedAccount = getAddress(account);
  const normalizedMarketAddress = getAddress(marketAddress);

  try {
    onProgress?.("Confirm the escrow transaction in your wallet...");
    const txHash = await sendTransaction(provider, {
      from: normalizedAccount,
      to: normalizedMarketAddress,
      data: marketInterface.encodeFunctionData("lockEscrow", [auctionId]),
      value: toHexQuantity(amountWei)
    });

    onProgress?.("Waiting for the escrow transaction confirmation...");
    const receipt = await waitForReceipt(provider, txHash);
    if (receipt.status !== "0x1") {
      throw new Error("Escrow locking did not complete successfully.");
    }

    const walletEscrow = await readEscrowBalanceWithWallet(provider, normalizedMarketAddress, auctionId, normalizedAccount);
    onProgress?.(`Escrow confirmed on chain: ${walletEscrow.escrowEth} ETH.`);

    return {
      txHash,
      txUrl: `${explorerBaseUrl}/tx/${txHash}`,
      walletEscrowEth: walletEscrow.escrowEth,
      walletEscrowWei: walletEscrow.escrowWei
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}
