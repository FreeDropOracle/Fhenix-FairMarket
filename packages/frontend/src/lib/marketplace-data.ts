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

function getNextActions(state: AuctionState) {
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
      return ["Lock escrow", "Place confidential bid", "Review lot details"];
  }
}

function getProtocolSignals(state: AuctionState, sellerDeposit: bigint, totalEscrow: bigint, bidCount: bigint) {
  const sellerDepositLabel = formatEthLabel(sellerDeposit);
  const totalEscrowLabel = formatEthLabel(totalEscrow);

  switch (state) {
    case "resolving":
      return [
        `${sellerDepositLabel} seller deposit remains locked during settlement.`,
        `${totalEscrowLabel} bidder escrow is now waiting on the resolution path.`,
        `${bidCount.toString()} confidential bid lane(s) were recorded before the close window ended.`
      ];
    case "finalized":
      return [
        "The winner and payout path are already fixed on chain.",
        `${sellerDepositLabel} seller deposit has already served its settlement role.`,
        `${bidCount.toString()} confidential bid lane(s) fed into the final outcome.`
      ];
    case "voided":
      return [
        "Fallback protections are now more relevant than new bidding activity.",
        `${sellerDepositLabel} seller-side economic protection is still reflected on chain.`,
        `${totalEscrowLabel} bidder escrow is now routed toward refunds or guarded recovery.`
      ];
    case "cancelled":
      return [
        "The NFT already left escrow and returned to the seller during cancellation.",
        `${sellerDepositLabel} seller deposit is now claimable only after the cancellation payout is computed.`,
        `${totalEscrowLabel} bidder escrow can now move through the refund path.`
      ];
    case "active":
    default:
      return [
        `${sellerDepositLabel} seller deposit is already locked on chain.`,
        `${totalEscrowLabel} bidder escrow is currently staged in the auction.`,
        `${bidCount.toString()} confidential bid lane(s) have been recorded so far.`
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
          ? ("success" as const)
          : state === "resolving" || state === "cancelled"
            ? ("warning" as const)
            : state === "finalized"
              ? ("success" as const)
              : ("danger" as const),
      value:
        state === "active"
          ? `Bidding stays open until ${formatUtcTimestamp(endTime)}`
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
  const sellerDepositLabel = formatEthLabel(core.sellerDeposit);
  const totalEscrowLabel = formatEthLabel(phase2.totalEscrow);
  const lotLabel = `Lot #${auctionId} / token ${core.tokenId.toString()}`;
  const formatLabel = core.isVickrey ? "Vickrey sealed bid" : "Confidential auction";

  return {
    activityScore: Number(phase2.bidCount),
    collection: collectionName,
    confidentialityLabel: core.isVickrey ? "Encrypted Vickrey lane active" : "Confidential bidding lane active",
    escrowLabel:
      phase2.totalEscrow > 0n
        ? `${totalEscrowLabel} bidder escrow staged`
        : `${sellerDepositLabel} seller deposit locked`,
    escrowScore: Number.parseFloat(formatEther(core.sellerDeposit + phase2.totalEscrow)),
    formatLabel,
    freshnessScore: Number(phase2.createdAt),
    id: auctionId.toString(),
    lotLabel,
    metrics: [
      { label: "Token", value: `#${core.tokenId.toString()}` },
      { label: "Seller deposit", value: sellerDepositLabel },
      { label: "Bid lanes", value: phase2.bidCount.toString() }
    ],
    nextActions: getNextActions(state),
    openingBidAmount: 0,
    openingBidLabel: startingPrice > 0n ? "Confidential floor configured" : "No public opening bid",
    onChain: {
      auctionId,
      bidCount: Number(phase2.bidCount),
      endTimeUnix: Number(core.endTime),
      nftContractAddress: core.nftContract,
      sellerClaimed: false,
      sellerDepositWei: core.sellerDeposit.toString(),
      sellerPayoutWei: sellerPayout.toString(),
      tokenId: core.tokenId.toString(),
      totalEscrowWei: phase2.totalEscrow.toString()
    },
    protocolSignals: getProtocolSignals(state, core.sellerDeposit, phase2.totalEscrow, phase2.bidCount),
    seller: core.seller,
    sellerTag: `${formatAddress(core.nftContract)} on Sepolia`,
    settlementNote: getSettlementNote(state),
    state,
    synopsis: getAuctionSynopsis(state, collectionName),
    timeLabel: formatRemainingTime(core.endTime, state),
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
      totalEscrow: 0n
    };

    const [phase2Settled, startingPriceSettled, collectionName, sellerPayoutSettled] = await Promise.all([
      withTimeout(market.getAuctionPhase2Details(auctionId))
        .then((result) => ({
          assetClaimed: result.assetClaimed as boolean,
          bidCount: result.bidCount as bigint,
          createdAt: result.createdAt as bigint,
          sellerClaimed: result.sellerClaimed as boolean,
          totalEscrow: result.totalEscrow as bigint
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
    if (record.onChain) {
      record.onChain.sellerClaimed = phase2Settled.sellerClaimed;
    }

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
