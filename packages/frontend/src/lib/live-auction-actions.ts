import { Interface, formatEther, getAddress } from "ethers";

import type { Eip1193Provider } from "@/lib/eip1193";

const marketInterface = new Interface([
  "function lockEscrow(uint256 auctionId) payable",
  "function placeBid(uint256 auctionId, bytes32 encryptedBid)",
  "function escrowBalances(uint256 auctionId, address bidder) view returns (uint256)",
  "function getEncryptedBid(uint256 auctionId, address bidder) view returns (bytes32)"
]);

const CIPHERTEXT_KIND_SHIFT = 248n;
const EUINT96_KIND = 3n;
const MAX_EUINT96_VALUE = (1n << 96n) - 1n;
const LOCAL_PROTOTYPE_CHAIN_IDS = new Set(["0x539", "0x7a69"]);
const PROTOTYPE_BID_DISABLED_MESSAGE =
  "Prototype wallet bidding is disabled on this network until real CoFHE ciphertext-input support is wired into the frontend.";

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

type PlaceBidParams = {
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

export type PlaceBidResult = {
  encryptedBid: string;
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

async function readChainId(provider: Eip1193Provider) {
  return ((await provider.request({
    method: "eth_chainId"
  })) as string).toLowerCase();
}

// Local deterministic envelope only. Production bidding must use opaque handles from a live CoFHE SDK/provider.
function encodeLocalPrototypeEuint96(value: bigint) {
  if (value < 0n || value > MAX_EUINT96_VALUE) {
    throw new Error("Bid amount is outside the current prototype bid-handle range.");
  }

  const encoded = (EUINT96_KIND << CIPHERTEXT_KIND_SHIFT) | value;
  return `0x${encoded.toString(16).padStart(64, "0")}`;
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

async function assertPrototypeBidPathAllowed(provider: Eip1193Provider) {
  const chainId = await readChainId(provider);
  if (LOCAL_PROTOTYPE_CHAIN_IDS.has(chainId)) {
    return;
  }

  throw new Error(PROTOTYPE_BID_DISABLED_MESSAGE);
}

async function readEncryptedBidWithWallet(
  provider: Eip1193Provider,
  marketAddress: string,
  auctionId: bigint,
  account: string
) {
  const normalizedMarketAddress = getAddress(marketAddress);
  const normalizedAccount = getAddress(account);

  return callContract(
    provider,
    normalizedMarketAddress,
    marketInterface.encodeFunctionData("getEncryptedBid", [auctionId, normalizedAccount]),
    (raw) => marketInterface.decodeFunctionResult("getEncryptedBid", raw)[0] as string
  );
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

export async function placeBidWithWallet({
  account,
  amountWei,
  auctionId,
  explorerBaseUrl,
  marketAddress,
  onProgress,
  provider
}: PlaceBidParams): Promise<PlaceBidResult> {
  const normalizedAccount = getAddress(account);
  const normalizedMarketAddress = getAddress(marketAddress);

  try {
    await assertPrototypeBidPathAllowed(provider);

    const encryptedBid = encodeLocalPrototypeEuint96(amountWei);
    onProgress?.("Preparing the local prototype bid envelope...");
    onProgress?.("Confirm the bid transaction in your wallet...");
    const txHash = await sendTransaction(provider, {
      from: normalizedAccount,
      to: normalizedMarketAddress,
      data: marketInterface.encodeFunctionData("placeBid", [auctionId, encryptedBid])
    });

    onProgress?.("Waiting for the bid transaction confirmation...");
    const receipt = await waitForReceipt(provider, txHash);
    if (receipt.status !== "0x1") {
      throw new Error("Prototype bid submission did not complete successfully.");
    }

    const [storedBid, walletEscrow] = await Promise.all([
      readEncryptedBidWithWallet(provider, normalizedMarketAddress, auctionId, normalizedAccount),
      readEscrowBalanceWithWallet(provider, normalizedMarketAddress, auctionId, normalizedAccount)
    ]);

    if (storedBid.toLowerCase() !== encryptedBid.toLowerCase()) {
      throw new Error("The prototype bid handle was not stored on chain as expected.");
    }

    onProgress?.("Local prototype bid handle stored on chain.");
    return {
      encryptedBid,
      txHash,
      txUrl: `${explorerBaseUrl}/tx/${txHash}`,
      walletEscrowEth: walletEscrow.escrowEth,
      walletEscrowWei: walletEscrow.escrowWei
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}
