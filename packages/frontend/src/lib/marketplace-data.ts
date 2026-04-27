import "server-only";

import { Contract, JsonRpcProvider, formatEther } from "ethers";

import { appConfig, formatAddress, isAddressLike } from "@/lib/app-config";
import { getAuctionById as getSeedAuctionById, type AuctionRecord, type AuctionState } from "@/lib/auctions";

const marketAbi = [
  "function auctionCounter() view returns (uint256)",
  "function getAuction(uint256 auctionId) view returns (address nftContract, uint256 tokenId, address seller, uint64 endTime, uint256 sellerDeposit, uint8 state, bool isVickrey, uint64 lastBlockTimestamp, bytes32 winnerCiphertext, uint256 winningAmount)",
  "function getAuctionPhase2Details(uint256 auctionId) view returns (address winner, uint256 totalEscrow, uint256 slashAmount, uint64 createdAt, uint64 resolvingSince, bool sellerClaimed, bool assetClaimed, uint32 bidCount)",
  "function getAuctionStartingPrice(uint256 auctionId) view returns (uint256)",
  "function previewSellerPayout(uint256 auctionId) view returns (uint256)"
] as const;

const erc721MetadataAbi = ["function name() view returns (string)"] as const;
const liveAuctionWindow = 24;
const rpcTimeoutMs = 4_000;
const liveAuctionVisuals = [
  {
    beam: "rgba(84, 150, 255, 0.92)",
    halo: "rgba(141, 107, 255, 0.72)",
    mist: "rgba(193, 142, 255, 0.14)"
  },
  {
    beam: "rgba(153, 111, 255, 0.84)",
    halo: "rgba(111, 203, 255, 0.64)",
    mist: "rgba(91, 190, 255, 0.12)"
  },
  {
    beam: "rgba(121, 178, 255, 0.9)",
    halo: "rgba(101, 255, 207, 0.64)",
    mist: "rgba(101, 255, 207, 0.1)"
  },
  {
    beam: "rgba(171, 108, 255, 0.9)",
    halo: "rgba(255, 208, 116, 0.62)",
    mist: "rgba(255, 208, 116, 0.12)"
  }
] as const;

type LiveAuctionState = 0 | 1 | 2 | 3 | 4 | 5;

type LiveAuctionCore = {
  endTime: bigint;
  isVickrey: boolean;
  lastBlockTimestamp: bigint;
  nftContract: string;
  seller: string;
  sellerDeposit: bigint;
  state: LiveAuctionState;
  tokenId: bigint;
};

type LiveAuctionPhase2 = {
  assetClaimed: boolean;
  bidCount: bigint;
  createdAt: bigint;
  sellerClaimed: boolean;
  totalEscrow: bigint;
  winner: string;
};

let cachedProvider: JsonRpcProvider | null = null;
let cachedMarketContract: Contract | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs = rpcTimeoutMs) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("RPC request timed out.")), timeoutMs);
    })
  ]);
}

function getRpcProvider() {
  if (!cachedProvider) {
    cachedProvider = new JsonRpcProvider(appConfig.chain.rpcUrl);
  }

  return cachedProvider;
}

function getMarketContract() {
  if (!cachedMarketContract) {
    cachedMarketContract = new Contract(appConfig.contracts.marketProxyAddress, marketAbi, getRpcProvider());
  }

  return cachedMarketContract;
}

function isNumericAuctionId(value: string) {
  return /^[0-9]+$/.test(value);
}

function mapLiveAuctionState(value: LiveAuctionState): AuctionState {
  switch (value) {
    case 2:
      return "resolving";
    case 3:
      return "finalized";
    case 4:
      return "cancelled";
    case 5:
      return "voided";
    case 0:
    case 1:
    default:
      return "active";
  }
}

function formatEthLabel(value: bigint) {
  return `${Number.parseFloat(formatEther(value)).toFixed(2)} ETH`;
}

function formatUtcTimestamp(value: bigint) {
  if (value <= 0n) {
    return "timestamp unavailable";
  }

  return new Date(Number(value) * 1000).toISOString().replace(".000Z", " UTC").replace("T", " ");
}

function formatRemainingTime(endTime: bigint, state: AuctionState) {
  if (state === "resolving") {
    return "Resolving now";
  }
  if (state === "finalized") {
    return "Finalized";
  }
  if (state === "voided") {
    return "Voided";
  }
  if (state === "cancelled") {
    return "Cancelled";
  }

  return `Ends ${formatUtcTimestamp(endTime)}`;
}

function hasCloseWindowEnded(endTime: bigint) {
  return Number(endTime) <= Math.floor(Date.now() / 1000);
}

function getAuctionSynopsis(state: AuctionState, collectionLabel: string) {
  switch (state) {
    case "resolving":
      return `${collectionLabel} already moved beyond bidding and is now waiting for confidential settlement to complete.`;
    case "finalized":
      return `${collectionLabel} completed its confidential path and is now ready for post-settlement claims.`;
    case "voided":
      return `${collectionLabel} moved into a guarded cancellation path and now exposes refund-oriented actions.`;
    case "cancelled":
      return `${collectionLabel} was cancelled by the seller before close, and the recovery path is now focused on refunds plus seller payout settlement.`;
    case "active":
    default:
      return `${collectionLabel} is live on Sepolia and can accept escrow plus confidential bidding actions from compatible wallets.`;
  }
}

function getSettlementNote(state: AuctionState) {
  switch (state) {
    case "resolving":
      return "Settlement is already in progress and new bids should stay closed.";
    case "finalized":
      return "Claims and seller proceeds are now the next relevant routes.";
    case "voided":
      return "The auction ended outside the happy path and is now focused on refunds and recovery.";
    case "cancelled":
      return "The seller cancelled this auction before the close window ended. The NFT is back with the seller, while refunds and deposit payout remain claim-based.";
    case "active":
    default:
      return "The lot is still live and waiting for further escrow or bid activity before the close window ends.";
  }
}

function getNextActions(state: AuctionState, hasEnded: boolean) {
  switch (state) {
    case "resolving":
      return ["Monitor settlement", "Review lot details", "Prepare post-settlement claims"];
    case "finalized":
      return ["Claim asset", "Claim seller proceeds", "Inspect final activity"];
    case "voided":
      return ["Claim refund", "Review fallback notes", "Return to marketplace"];
    case "cancelled":
      return ["Claim seller deposit", "Claim refund", "Return to marketplace"];
    case "active":
    default:
      return hasEnded
        ? ["Start settlement", "Refresh lot state", "Review lot details"]
        : ["Lock escrow", "Review lot details", "Prepare settlement"];
  }
}

function getProtocolSignals(state: AuctionState, bidCount: bigint, hasEnded: boolean) {
  switch (state) {
    case "resolving":
      return [
        "The close window is over and the resolution proof is now in-flight.",
        "The public desk hides live escrow magnitudes during sealed-bid settlement.",
        `${bidCount.toString()} confidential bid lane(s) were recorded before the close window ended.`
      ];
    case "finalized":
      return [
        "The winner and payout path are already fixed on chain.",
        "The public desk stays focused on settlement state instead of exposing private auction sizing.",
        `${bidCount.toString()} confidential bid lane(s) fed into the final outcome.`
      ];
    case "voided":
      return [
        "Fallback protections are now more relevant than new bidding activity.",
        "Seller-side economic protection is still reflected on chain.",
        "Refund routes stay available without surfacing escrow magnitudes here."
      ];
    case "cancelled":
      return [
        "The NFT already left escrow and returned to the seller during cancellation.",
        "The seller deposit is now claimable only after the cancellation payout is computed.",
        "Bidder escrow can now move through the refund path."
      ];
    case "active":
    default:
      return [
        hasEnded
          ? "The bidding clock is over, but settlement has not been triggered yet."
          : "Seller protection is already locked on chain.",
        hasEnded
          ? "The next safe step is to start settlement from the auction details page."
          : "The public desk intentionally hides live escrow magnitudes for sealed-bid lots.",
        bidCount > 0n
          ? `${bidCount.toString()} confidential bid lane(s) are already recorded on chain.`
          : "No on-chain confidential bid has been recorded yet."
      ];
  }
}

function buildVisual(auctionId: number) {
  return liveAuctionVisuals[auctionId % liveAuctionVisuals.length];
}

async function readCollectionName(nftContract: string) {
  try {
    const contract = new Contract(nftContract, erc721MetadataAbi, getRpcProvider());
    const collectionName = (await withTimeout(contract.name())) as string;
    return collectionName.trim().length > 0 ? collectionName : `NFT ${formatAddress(nftContract)}`;
  } catch {
    return `NFT ${formatAddress(nftContract)}`;
  }
}

function buildTimeline(
  state: AuctionState,
  createdAt: bigint,
  endTime: bigint,
  bidCount: bigint,
  lastBlockTimestamp: bigint
) {
  const hasEnded = state === "active" && hasCloseWindowEnded(endTime);

  return [
    {
      label: "Asset intake",
      tone: "success" as const,
      value:
        createdAt > 0n
          ? `Custody moved into market escrow at ${formatUtcTimestamp(createdAt)}`
          : `Custody is already held by the market contract. Last update: ${formatUtcTimestamp(lastBlockTimestamp)}`
    },
    {
      label: "Auction state",
      tone:
        state === "active"
          ? hasEnded
            ? ("warning" as const)
            : ("success" as const)
          : state === "resolving" || state === "cancelled"
            ? ("warning" as const)
            : state === "finalized"
              ? ("success" as const)
              : ("danger" as const),
      value:
        state === "active"
          ? hasEnded
            ? "The close window is over and settlement still needs to be triggered."
            : `Bidding stays open until ${formatUtcTimestamp(endTime)}`
          : state === "resolving"
            ? "Bidding closed and settlement is currently in-flight."
            : state === "cancelled"
              ? "The seller cancelled the lot before close and the claim path is now active."
            : state === "finalized"
              ? "Settlement completed on chain."
              : "Fallback or cancellation path is now active."
    },
    {
      label: "Bid lanes",
      tone: bidCount > 0n ? ("success" as const) : ("neutral" as const),
      value: `${bidCount.toString()} confidential lane(s) recorded`
    }
  ];
}

function buildLiveAuctionRecord(
  auctionId: number,
  core: LiveAuctionCore,
  phase2: LiveAuctionPhase2,
  startingPrice: bigint,
  collectionName: string,
  sellerPayout: bigint
): AuctionRecord {
  const state = mapLiveAuctionState(core.state);
  const hasEnded = state === "active" && hasCloseWindowEnded(core.endTime);
  const lotLabel = `Lot #${auctionId} / token ${core.tokenId.toString()}`;
  const formatLabel = core.isVickrey ? "Vickrey sealed bid" : "Confidential auction";
  const openingBidLabel =
    startingPrice > 0n
      ? "Confidential floor configured"
      : state === "active"
        ? "No public opening bid"
        : "Opening price remained private";
  const publicEscrowLabel =
    state === "active"
      ? hasEnded
        ? "Close window reached. Settlement can start now."
        : phase2.bidCount > 0n
          ? "Confidential participation recorded"
          : "No public bidder activity"
      : state === "resolving"
        ? "Confidential settlement in progress"
        : state === "finalized"
          ? "Settlement complete"
          : state === "cancelled"
            ? "Seller cancellation path active"
            : "Fallback recovery path active";
  const sellerCoverageMetric =
    state === "active" || state === "resolving"
      ? "Locked"
      : state === "cancelled"
        ? "Released"
        : formatEthLabel(core.sellerDeposit);
  const bidLaneMetric =
    state === "active" && phase2.bidCount === 0n
      ? "Private"
      : phase2.bidCount > 0n
        ? `${phase2.bidCount.toString()} recorded`
        : "0";

  return {
    activityScore: Number(phase2.bidCount),
    collection: collectionName,
    confidentialityLabel:
      state === "active" && hasEnded
        ? "Close window reached"
        : core.isVickrey
          ? "Encrypted Vickrey lane active"
          : "Confidential bidding lane active",
    escrowLabel: publicEscrowLabel,
    escrowScore: Number.parseFloat(formatEther(core.sellerDeposit + phase2.totalEscrow)),
    formatLabel,
    freshnessScore: Number(phase2.createdAt),
    id: auctionId.toString(),
    lotLabel,
    metrics: [
      { label: "Token", value: `#${core.tokenId.toString()}` },
      { label: "Seller coverage", value: sellerCoverageMetric },
      { label: "Bid lanes", value: bidLaneMetric }
    ],
    nextActions: getNextActions(state, hasEnded),
    openingBidAmount: 0,
    openingBidLabel,
    onChain: {
      auctionId,
      assetClaimed: phase2.assetClaimed,
      bidCount: Number(phase2.bidCount),
      endTimeUnix: Number(core.endTime),
      nftContractAddress: core.nftContract,
      sellerClaimed: phase2.sellerClaimed,
      sellerDepositWei: core.sellerDeposit.toString(),
      sellerPayoutWei: sellerPayout.toString(),
      tokenId: core.tokenId.toString(),
      totalEscrowWei: phase2.totalEscrow.toString(),
      winnerAddress: phase2.winner
    },
    protocolSignals: getProtocolSignals(state, phase2.bidCount, hasEnded),
    seller: core.seller,
    sellerTag: `${formatAddress(core.nftContract)} on Sepolia`,
    settlementNote:
      state === "active" && hasEnded
        ? "The close window is over. Start settlement now so the keeper and AVS path can determine a winner or a no-winner result."
        : getSettlementNote(state),
    state,
    synopsis:
      state === "active" && hasEnded
        ? `${collectionName} has passed its bidding window and now needs a settlement trigger before a winner or no-winner outcome can be finalized.`
        : getAuctionSynopsis(state, collectionName),
    timeLabel: state === "active" && hasEnded ? "Close window reached" : formatRemainingTime(core.endTime, state),
    timeline: buildTimeline(state, phase2.createdAt, core.endTime, phase2.bidCount, core.lastBlockTimestamp),
    title: `Auction #${auctionId}`,
    visual: buildVisual(auctionId)
  };
}

async function loadLiveAuctionRecord(auctionId: number): Promise<AuctionRecord | null> {
  if (!isAddressLike(appConfig.contracts.marketProxyAddress)) {
    return null;
  }

  try {
    const market = getMarketContract();
    const coreResult = await withTimeout(market.getAuction(auctionId));

    const core: LiveAuctionCore = {
      endTime: coreResult.endTime as bigint,
      isVickrey: coreResult.isVickrey as boolean,
      lastBlockTimestamp: coreResult.lastBlockTimestamp as bigint,
      nftContract: coreResult.nftContract as string,
      seller: coreResult.seller as string,
      sellerDeposit: coreResult.sellerDeposit as bigint,
      state: Number(coreResult.state) as LiveAuctionState,
      tokenId: coreResult.tokenId as bigint
    };

    const phase2Defaults: LiveAuctionPhase2 = {
      assetClaimed: false,
      bidCount: 0n,
      createdAt: 0n,
      sellerClaimed: false,
      totalEscrow: 0n,
      winner: "0x0000000000000000000000000000000000000000"
    };

    const [phase2Settled, startingPriceSettled, collectionName, sellerPayoutSettled] = await Promise.all([
      withTimeout(market.getAuctionPhase2Details(auctionId))
        .then((result) => ({
          assetClaimed: result.assetClaimed as boolean,
          bidCount: result.bidCount as bigint,
          createdAt: result.createdAt as bigint,
          sellerClaimed: result.sellerClaimed as boolean,
          totalEscrow: result.totalEscrow as bigint,
          winner: result.winner as string
        }))
        .catch(() => phase2Defaults),
      withTimeout(market.getAuctionStartingPrice(auctionId)).catch(() => 0n),
      readCollectionName(core.nftContract),
      withTimeout(market.previewSellerPayout(auctionId)).catch(() => 0n)
    ]);
    const record = buildLiveAuctionRecord(
      auctionId,
      core,
      phase2Settled,
      startingPriceSettled as bigint,
      collectionName,
      sellerPayoutSettled as bigint
    );
    return record;
  } catch {
    return null;
  }
}

async function listLiveAuctions() {
  if (!isAddressLike(appConfig.contracts.marketProxyAddress)) {
    return [];
  }

  try {
    const market = getMarketContract();
    const auctionCounter = Number(await withTimeout(market.auctionCounter()));

    if (!Number.isFinite(auctionCounter) || auctionCounter <= 0) {
      return [];
    }

    const firstAuctionId = Math.max(1, auctionCounter - liveAuctionWindow + 1);
    const records = await Promise.all(
      Array.from({ length: auctionCounter - firstAuctionId + 1 }, (_, index) => loadLiveAuctionRecord(firstAuctionId + index))
    );

    return records.filter((record): record is AuctionRecord => record !== null);
  } catch {
    return [];
  }
}

export async function listMarketplaceAuctions() {
  const liveRecords = await listLiveAuctions();
  return liveRecords;
}

export async function getMarketplaceAuctionById(auctionId: string) {
  if (isNumericAuctionId(auctionId)) {
    return loadLiveAuctionRecord(Number(auctionId));
  }

  return getSeedAuctionById(auctionId);
}
