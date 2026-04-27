import { Interface, formatEther, getAddress } from "ethers";

import type { Eip1193Provider } from "@/lib/eip1193";

const marketInterface = new Interface([
  "function cancelAuction(uint256 auctionId)",
  "function claimSellerProceeds(uint256 auctionId)",
  "function previewSellerPayout(uint256 auctionId) view returns (uint256)",
  "function getAuction(uint256 auctionId) view returns (address nftContract, uint256 tokenId, address seller, uint64 endTime, uint256 sellerDeposit, uint8 state, bool isVickrey, uint64 lastBlockTimestamp, bytes32 winnerCiphertext, uint256 winningAmount)",
  "error AuctionAlreadyEnded(uint256 auctionId, uint256 endTime)",
  "error AuctionDoesNotExist(uint256 auctionId)",
  "error NoClaimableBalance(uint256 auctionId, address claimant)",
  "error NotAuctionSeller(address caller, address seller)",
  "error SlashedPotNotConfigured()",
  "error UnexpectedAuctionState(uint8 expected, uint8 actual)"
]);

const erc721Interface = new Interface(["function ownerOf(uint256 tokenId) view returns (address)"]);

type JsonRpcReceipt = {
  status?: string;
  transactionHash?: string;
};

type TxActionParams = {
  account: string;
  auctionId: bigint;
  explorerBaseUrl: string;
  marketAddress: string;
  nftContract?: string;
  onProgress?: (message: string) => void;
  provider: Eip1193Provider;
  sellerAddress?: string;
  tokenId?: bigint;
};

export type SellerAuctionActionResult = {
  sellerPayoutEth?: string;
  sellerPayoutWei?: string;
  txHash: string;
  txUrl: string;
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
        case "AuctionAlreadyEnded":
          return "The closing time already passed, so cancellation is no longer available.";
        case "AuctionDoesNotExist":
          return "This auction no longer exists on the market contract.";
        case "NoClaimableBalance":
          return "There is no seller payout available to claim for this auction.";
        case "NotAuctionSeller":
          return "Only the seller wallet can manage this auction.";
        case "SlashedPotNotConfigured":
          return "Cancellation with bidder escrow is blocked because the slashed pot is not configured.";
        case "UnexpectedAuctionState":
          return "This auction is no longer in the correct state for that seller action.";
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

async function waitForAuctionCancellation(
  provider: Eip1193Provider,
  marketAddress: string,
  auctionId: bigint,
  nftContract: string,
  tokenId: bigint,
  sellerAddress: string,
  timeoutMs = 60_000
) {
  const startedAt = Date.now();
  const normalizedSellerAddress = getAddress(sellerAddress);
  const normalizedNftContract = getAddress(nftContract);
  const normalizedMarketAddress = getAddress(marketAddress);

  while (Date.now() - startedAt < timeoutMs) {
    const [auctionState, owner] = await Promise.all([
      callContract(
        provider,
        normalizedMarketAddress,
        marketInterface.encodeFunctionData("getAuction", [auctionId]),
        (raw) => Number(marketInterface.decodeFunctionResult("getAuction", raw)[5]) as number
      ),
      callContract(
        provider,
        normalizedNftContract,
        erc721Interface.encodeFunctionData("ownerOf", [tokenId]),
        (raw) => erc721Interface.decodeFunctionResult("ownerOf", raw)[0] as string
      )
    ]);

    if (auctionState === 4 && getAddress(owner) === normalizedSellerAddress) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1_250));
  }

  throw new Error("Cancellation transaction was mined, but the auction state did not settle into CANCELLED yet.");
}

export async function previewSellerPayoutWithWallet(
  provider: Eip1193Provider,
  marketAddress: string,
  auctionId: bigint
) {
  const normalizedMarketAddress = getAddress(marketAddress);
  const sellerPayoutWei = await callContract(
    provider,
    normalizedMarketAddress,
    marketInterface.encodeFunctionData("previewSellerPayout", [auctionId]),
    (raw) => marketInterface.decodeFunctionResult("previewSellerPayout", raw)[0] as bigint
  );

  return {
    sellerPayoutEth: Number.parseFloat(formatEther(sellerPayoutWei)).toFixed(4),
    sellerPayoutWei: sellerPayoutWei.toString()
  };
}

export async function cancelAuctionWithWallet({
  account,
  auctionId,
  explorerBaseUrl,
  marketAddress,
  nftContract,
  onProgress,
  provider,
  sellerAddress,
  tokenId
}: TxActionParams): Promise<SellerAuctionActionResult> {
  const normalizedAccount = getAddress(account);
  const normalizedMarketAddress = getAddress(marketAddress);

  try {
    onProgress?.("Confirm the cancellation in your wallet...");
    const txHash = await sendTransaction(provider, {
      from: normalizedAccount,
      to: normalizedMarketAddress,
      data: marketInterface.encodeFunctionData("cancelAuction", [auctionId])
    });

    const receipt = await waitForReceipt(provider, txHash);
    if (receipt.status !== "0x1") {
      throw new Error("Auction cancellation did not complete successfully.");
    }

    if (nftContract && tokenId !== undefined && sellerAddress) {
      onProgress?.("Verifying on-chain cancellation state...");
      await waitForAuctionCancellation(
        provider,
        normalizedMarketAddress,
        auctionId,
        nftContract,
        tokenId,
        sellerAddress
      );
    }

    onProgress?.("Reading the seller payout preview...");
    const payout = await previewSellerPayoutWithWallet(provider, normalizedMarketAddress, auctionId).catch(() => null);

    return {
      sellerPayoutEth: payout?.sellerPayoutEth,
      sellerPayoutWei: payout?.sellerPayoutWei,
      txHash,
      txUrl: `${explorerBaseUrl}/tx/${txHash}`
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function claimSellerProceedsWithWallet({
  account,
  auctionId,
  explorerBaseUrl,
  marketAddress,
  onProgress,
  provider
}: TxActionParams): Promise<SellerAuctionActionResult> {
  const normalizedAccount = getAddress(account);
  const normalizedMarketAddress = getAddress(marketAddress);

  try {
    onProgress?.("Confirm the seller payout claim in your wallet...");
    const txHash = await sendTransaction(provider, {
      from: normalizedAccount,
      to: normalizedMarketAddress,
      data: marketInterface.encodeFunctionData("claimSellerProceeds", [auctionId])
    });

    const receipt = await waitForReceipt(provider, txHash);
    if (receipt.status !== "0x1") {
      throw new Error("Seller payout claim did not complete successfully.");
    }

    return {
      txHash,
      txUrl: `${explorerBaseUrl}/tx/${txHash}`
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}
