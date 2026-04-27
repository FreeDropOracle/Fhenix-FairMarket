import { Interface, getAddress } from "ethers";

import type { Eip1193Provider } from "@/lib/eip1193";

const erc721Interface = new Interface([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function approve(address to, uint256 tokenId)"
]);

const marketInterface = new Interface([
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 endTime, uint256 sellerDeposit, bool isVickrey)",
  "function createAuction(address nftContract, uint256 tokenId, uint256 duration, uint256 sellerDeposit, bool isVickrey) payable returns (uint256 auctionId)"
]);

type JsonRpcReceiptLog = {
  address: string;
  topics: string[];
  data: string;
};

type JsonRpcReceipt = {
  status?: string;
  transactionHash?: string;
  logs?: JsonRpcReceiptLog[];
};

type CreateAuctionParams = {
  account: string;
  durationSeconds: bigint;
  explorerBaseUrl: string;
  isVickrey: boolean;
  marketAddress: string;
  nftContract: string;
  provider: Eip1193Provider;
  sellerDepositWei: bigint;
  tokenId: bigint;
  onProgress?: (message: string) => void;
};

export type CreateAuctionResult = {
  approvalTxHash?: string;
  auctionId?: string;
  txHash: string;
  txUrl: string;
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

function extractAuctionId(receipt: JsonRpcReceipt) {
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = marketInterface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "AuctionCreated") {
        return parsed.args.auctionId.toString();
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function createAuctionWithWallet({
  account,
  durationSeconds,
  explorerBaseUrl,
  isVickrey,
  marketAddress,
  nftContract,
  provider,
  sellerDepositWei,
  tokenId,
  onProgress
}: CreateAuctionParams): Promise<CreateAuctionResult> {
  const normalizedAccount = getAddress(account);
  const normalizedMarketAddress = getAddress(marketAddress);
  const normalizedNftContract = getAddress(nftContract);

  try {
    onProgress?.("Checking NFT ownership...");
    const owner = await callContract(provider, normalizedNftContract, erc721Interface.encodeFunctionData("ownerOf", [tokenId]), (raw) =>
      erc721Interface.decodeFunctionResult("ownerOf", raw)[0] as string
    );

    if (getAddress(owner) !== normalizedAccount) {
      throw new Error("This wallet does not own the selected NFT.");
    }

    onProgress?.("Checking NFT approval...");
    const [approvedAddress, approvedForAll] = await Promise.all([
      callContract(
        provider,
        normalizedNftContract,
        erc721Interface.encodeFunctionData("getApproved", [tokenId]),
        (raw) => erc721Interface.decodeFunctionResult("getApproved", raw)[0] as string
      ),
      callContract(
        provider,
        normalizedNftContract,
        erc721Interface.encodeFunctionData("isApprovedForAll", [normalizedAccount, normalizedMarketAddress]),
        (raw) => erc721Interface.decodeFunctionResult("isApprovedForAll", raw)[0] as boolean
      )
    ]);

    let approvalTxHash: string | undefined;
    if (!approvedForAll && getAddress(approvedAddress) !== normalizedMarketAddress) {
      onProgress?.("Approval required. Confirm it in your wallet...");
      approvalTxHash = await sendTransaction(provider, {
        from: normalizedAccount,
        to: normalizedNftContract,
        data: erc721Interface.encodeFunctionData("approve", [normalizedMarketAddress, tokenId])
      });

      const approvalReceipt = await waitForReceipt(provider, approvalTxHash);
      if (approvalReceipt.status !== "0x1") {
        throw new Error("NFT approval did not complete successfully.");
      }
    }

    onProgress?.("Creating auction on chain...");
    const txHash = await sendTransaction(provider, {
      from: normalizedAccount,
      to: normalizedMarketAddress,
      data: marketInterface.encodeFunctionData("createAuction", [
        normalizedNftContract,
        tokenId,
        durationSeconds,
        sellerDepositWei,
        isVickrey
      ]),
      value: toHexQuantity(sellerDepositWei)
    });

    const receipt = await waitForReceipt(provider, txHash);
    if (receipt.status !== "0x1") {
      throw new Error("Auction creation did not complete successfully.");
    }

    return {
      approvalTxHash,
      auctionId: extractAuctionId(receipt),
      txHash,
      txUrl: `${explorerBaseUrl}/tx/${txHash}`
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}
