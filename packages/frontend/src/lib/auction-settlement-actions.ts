import { Interface, ZeroAddress, getAddress } from "ethers";

import type { Eip1193Provider } from "@/lib/eip1193";

const marketInterface = new Interface([
  "function triggerFinalize(uint256 auctionId)",
  "function claimAsset(uint256 auctionId)",
  "function getAuction(uint256 auctionId) view returns (address nftContract, uint256 tokenId, address seller, uint64 endTime, uint256 sellerDeposit, uint8 state, bool isVickrey, uint64 lastBlockTimestamp, bytes32 winnerCiphertext, uint256 winningAmount)",
  "function getAuctionPhase2Details(uint256 auctionId) view returns (address winner, uint256 totalEscrow, uint256 slashAmount, uint64 createdAt, uint64 resolvingSince, bool sellerClaimed, bool assetClaimed, uint32 bidCount)",
  "error AssetAlreadyClaimed(uint256 auctionId)",
  "error AuctionDoesNotExist(uint256 auctionId)",
  "error AuctionStillRunning(uint256 auctionId, uint256 endTime)",
  "error UnauthorizedAssetClaim(uint256 auctionId, address caller, address expectedRecipient)",
  "error UnexpectedAuctionState(uint8 expected, uint8 actual)"
]);

const erc721Interface = new Interface(["function ownerOf(uint256 tokenId) view returns (address)"]);

type JsonRpcReceipt = {
  status?: string;
  transactionHash?: string;
};

type SettlementLifecycle = {
  assetClaimed: boolean;
  state: number;
  winnerAddress: string;
};

type BaseAuctionSettlementParams = {
  account: string;
  auctionId: bigint;
  explorerBaseUrl: string;
  marketAddress: string;
  onProgress?: (message: string) => void;
  provider: Eip1193Provider;
};

type ClaimAssetParams = BaseAuctionSettlementParams & {
  nftContract: string;
  recipientAddress: string;
  tokenId: bigint;
};

export type AuctionSettlementActionResult = {
  assetClaimed?: boolean;
  state?: number;
  txHash: string;
  txUrl: string;
  winnerAddress?: string;
};

function normalizeErrorMessage(error: unknown) {
  const revertData =
    typeof error === "object" && error !== null
      ? "data" in error && typeof error.data === "string"
        ? error.data
        : "error" in error &&
            typeof error.error === "object" &&
            error.error !== null &&
            "data" in error.error &&
            typeof error.error.data === "string"
          ? error.error.data
          : null
      : null;

  if (revertData) {
    try {
      const parsed = marketInterface.parseError(revertData);
      switch (parsed?.name) {
        case "AssetAlreadyClaimed":
          return "The NFT was already claimed from this auction.";
        case "AuctionDoesNotExist":
          return "This auction no longer exists on the market contract.";
        case "AuctionStillRunning":
          return "The closing time has not passed yet, so settlement cannot start.";
        case "UnauthorizedAssetClaim":
          return "Only the recorded winner can claim this NFT.";
        case "UnexpectedAuctionState":
          return "This auction is no longer in the correct state for that action.";
        default:
          break;
      }
    } catch {
      // Fall through to generic parsing below.
    }
  }

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

async function sendTransaction(
  provider: Eip1193Provider,
  request: { from: string; to: string; data: string; value?: string }
) {
  return (await provider.request({
    method: "eth_sendTransaction",
    params: [request]
  })) as string;
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

async function readAuctionLifecycle(
  provider: Eip1193Provider,
  marketAddress: string,
  auctionId: bigint
): Promise<SettlementLifecycle> {
  const normalizedMarketAddress = getAddress(marketAddress);
  const [auctionState, phase2] = await Promise.all([
    callContract(
      provider,
      normalizedMarketAddress,
      marketInterface.encodeFunctionData("getAuction", [auctionId]),
      (raw) => Number(marketInterface.decodeFunctionResult("getAuction", raw)[5]) as number
    ),
    callContract(
      provider,
      normalizedMarketAddress,
      marketInterface.encodeFunctionData("getAuctionPhase2Details", [auctionId]),
      (raw) => {
        const decoded = marketInterface.decodeFunctionResult("getAuctionPhase2Details", raw);
        return {
          assetClaimed: decoded[6] as boolean,
          winnerAddress: decoded[0] as string
        };
      }
    )
  ]);

  return {
    assetClaimed: phase2.assetClaimed,
    state: auctionState,
    winnerAddress: phase2.winnerAddress
  };
}

async function waitForAssetClaim(
  provider: Eip1193Provider,
  nftContract: string,
  tokenId: bigint,
  recipientAddress: string,
  timeoutMs = 60_000
) {
  const startedAt = Date.now();
  const normalizedNftContract = getAddress(nftContract);
  const normalizedRecipientAddress = getAddress(recipientAddress);

  while (Date.now() - startedAt < timeoutMs) {
    const owner = await callContract(
      provider,
      normalizedNftContract,
      erc721Interface.encodeFunctionData("ownerOf", [tokenId]),
      (raw) => erc721Interface.decodeFunctionResult("ownerOf", raw)[0] as string
    );

    if (getAddress(owner) === normalizedRecipientAddress) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1_250));
  }

  throw new Error("The NFT claim transaction was mined, but the asset owner did not update yet.");
}

export async function triggerFinalizeWithWallet({
  account,
  auctionId,
  explorerBaseUrl,
  marketAddress,
  onProgress,
  provider
}: BaseAuctionSettlementParams): Promise<AuctionSettlementActionResult> {
  const normalizedAccount = getAddress(account);
  const normalizedMarketAddress = getAddress(marketAddress);

  try {
    onProgress?.("Confirm the settlement trigger in your wallet...");
    const txHash = await sendTransaction(provider, {
      from: normalizedAccount,
      to: normalizedMarketAddress,
      data: marketInterface.encodeFunctionData("triggerFinalize", [auctionId])
    });

    onProgress?.("Waiting for the settlement trigger confirmation...");
    const receipt = await waitForReceipt(provider, txHash);
    if (receipt.status !== "0x1") {
      throw new Error("Settlement trigger did not complete successfully.");
    }

    onProgress?.("Reading the auction lifecycle state...");
    const lifecycle = await readAuctionLifecycle(provider, normalizedMarketAddress, auctionId);

    return {
      state: lifecycle.state,
      txHash,
      txUrl: `${explorerBaseUrl}/tx/${txHash}`,
      winnerAddress: lifecycle.winnerAddress
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function claimAssetWithWallet({
  account,
  auctionId,
  explorerBaseUrl,
  marketAddress,
  nftContract,
  onProgress,
  provider,
  recipientAddress,
  tokenId
}: ClaimAssetParams): Promise<AuctionSettlementActionResult> {
  const normalizedAccount = getAddress(account);
  const normalizedMarketAddress = getAddress(marketAddress);

  try {
    onProgress?.("Confirm the NFT claim in your wallet...");
    const txHash = await sendTransaction(provider, {
      from: normalizedAccount,
      to: normalizedMarketAddress,
      data: marketInterface.encodeFunctionData("claimAsset", [auctionId])
    });

    onProgress?.("Waiting for the NFT claim confirmation...");
    const receipt = await waitForReceipt(provider, txHash);
    if (receipt.status !== "0x1") {
      throw new Error("NFT claim did not complete successfully.");
    }

    onProgress?.("Verifying the NFT owner on chain...");
    await waitForAssetClaim(provider, nftContract, tokenId, recipientAddress);
    const lifecycle = await readAuctionLifecycle(provider, normalizedMarketAddress, auctionId);

    return {
      assetClaimed: lifecycle.assetClaimed,
      state: lifecycle.state,
      txHash,
      txUrl: `${explorerBaseUrl}/tx/${txHash}`,
      winnerAddress: lifecycle.winnerAddress
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export function resolveExpectedClaimRecipient(sellerAddress: string, winnerAddress: string) {
  if (winnerAddress === ZeroAddress) {
    return getAddress(sellerAddress);
  }

  return getAddress(winnerAddress);
}
