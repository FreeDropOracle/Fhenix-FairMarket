import type { StatusPillTone } from "@/components/status-pill";

export type AuctionState = "active" | "resolving" | "finalized" | "cancelled" | "voided";
export type AuctionStateFilter = "all" | AuctionState;
export type AuctionSortKey = "ending" | "activity" | "escrow" | "newest";

export type AuctionRecord = {
  id: string;
  title: string;
  collection: string;
  lotLabel: string;
  state: AuctionState;
  formatLabel: string;
  confidentialityLabel: string;
  seller: string;
  sellerTag: string;
  openingBidAmount: number;
  openingBidLabel: string;
  escrowLabel: string;
  timeLabel: string;
  synopsis: string;
  settlementNote: string;
  visual: {
    halo: string;
    beam: string;
    mist: string;
  };
  metrics: Array<{
    label: string;
    value: string;
  }>;
  nextActions: string[];
  timeline: Array<{
    label: string;
    value: string;
    tone: StatusPillTone;
  }>;
  protocolSignals: string[];
  activityScore: number;
  escrowScore: number;
  freshnessScore: number;
  onChain?: {
    auctionId: number;
    assetClaimed: boolean;
    bidCount: number;
    endTimeUnix: number;
    nftContractAddress: string;
    sellerClaimed: boolean;
    sellerDepositWei: string;
    sellerPayoutWei: string;
    tokenId: string;
    totalEscrowWei: string;
    winnerAddress: string;
  };
};

export const auctionStateOptions: Array<{
  value: AuctionStateFilter;
  label: string;
}> = [
  { value: "all", label: "All desks" },
  { value: "active", label: "Active" },
  { value: "resolving", label: "Resolving" },
  { value: "finalized", label: "Finalized" },
  { value: "cancelled", label: "Cancelled lots" },
  { value: "voided", label: "Voided" }
];

export const auctionSortOptions: Array<{
  value: AuctionSortKey;
  label: string;
}> = [
  { value: "ending", label: "Ending soon" },
  { value: "activity", label: "Highest activity" },
  { value: "escrow", label: "Largest escrow" },
  { value: "newest", label: "Newest lots" }
];

const auctionSeed: AuctionRecord[] = [
  {
    id: "aurora-vault-091",
    title: "Aurora Vault",
    collection: "Cipher Relics",
    lotLabel: "Lot 091 / sealed opening",
    state: "active",
    formatLabel: "Sealed bid",
    confidentialityLabel: "Encrypted bid lane open",
    seller: "0x8A4d...72C1",
    sellerTag: "Treasury curator",
    openingBidAmount: 3.2,
    openingBidLabel: "Opening bid 3.20 ETH",
    escrowLabel: "11.80 ETH escrow locked",
    timeLabel: "03h 41m left",
    synopsis:
      "A high-interest vault relic prepared for confidential bidding with clear terms and strong seller coverage.",
    settlementNote: "Settlement begins as soon as the bidding window closes.",
    visual: {
      halo: "rgba(141, 107, 255, 0.72)",
      beam: "rgba(84, 150, 255, 0.92)",
      mist: "rgba(193, 142, 255, 0.14)"
    },
    metrics: [
      { label: "Bid slots", value: "18 lanes" },
      { label: "Participants", value: "07 active" },
      { label: "Settlement", value: "Protected close" }
    ],
    nextActions: ["Lock escrow", "Place confidential bid", "Review lot details"],
    timeline: [
      { label: "Asset intake", value: "NFT custody verified", tone: "success" },
      { label: "Auction state", value: "Open for encrypted bids", tone: "success" },
      { label: "Settlement", value: "Ready when bidding closes", tone: "warning" }
    ],
    protocolSignals: [
      "Seller deposit confirmed on Sepolia.",
      "Escrow coverage exceeds the opening bid by 3.68x.",
      "Closing time is already being tracked."
    ],
    activityScore: 18,
    escrowScore: 11.8,
    freshnessScore: 91
  },
  {
    id: "helios-index-144",
    title: "Helios Index",
    collection: "Quant Frames",
    lotLabel: "Lot 144 / confidential treasury release",
    state: "active",
    formatLabel: "Sealed bid",
    confidentialityLabel: "Bid lane gated by escrow",
    seller: "0xB163...D8A0",
    sellerTag: "Protocol partner",
    openingBidAmount: 2.45,
    openingBidLabel: "Opening bid 2.45 ETH",
    escrowLabel: "8.60 ETH escrow locked",
    timeLabel: "07h 12m left",
    synopsis:
      "Signal-rich release intended for active bidders who want a cleaner close window before the keeper handoff.",
    settlementNote: "Close window still open; escrow can be added before bid encryption.",
    visual: {
      halo: "rgba(111, 203, 255, 0.64)",
      beam: "rgba(153, 111, 255, 0.84)",
      mist: "rgba(91, 190, 255, 0.12)"
    },
    metrics: [
      { label: "Bid slots", value: "12 lanes" },
      { label: "Participants", value: "05 active" },
      { label: "Settlement", value: "Keeper tracked" }
    ],
    nextActions: ["Add more escrow", "Place confidential bid", "Wait for settlement"],
    timeline: [
      { label: "Asset intake", value: "Metadata synced", tone: "success" },
      { label: "Auction state", value: "Accepting encrypted bids", tone: "success" },
      { label: "Settlement", value: "Ready when bidding closes", tone: "neutral" }
    ],
    protocolSignals: [
      "Opening bid remains below current total escrow coverage.",
      "Wallet flow is Sepolia-only for first release.",
      "Closing time is already monitored."
    ],
    activityScore: 12,
    escrowScore: 8.6,
    freshnessScore: 96
  },
  {
    id: "zero-knowledge-bloom-208",
    title: "Zero-Knowledge Bloom",
    collection: "Signal Botanica",
    lotLabel: "Lot 208 / resolving sequence",
    state: "resolving",
    formatLabel: "Asynchronous settlement",
    confidentialityLabel: "Decryption request in-flight",
    seller: "0x71b0...A4C5",
    sellerTag: "Independent seller",
    openingBidAmount: 1.9,
    openingBidLabel: "Opening bid 1.90 ETH",
    escrowLabel: "6.42 ETH escrow locked",
    timeLabel: "Keeper resolving now",
    synopsis:
      "The bid window has closed and the lot is now moving through confidential settlement.",
    settlementNote: "Refunds and seller proceeds stay locked until the proof comes back.",
    visual: {
      halo: "rgba(101, 255, 207, 0.64)",
      beam: "rgba(121, 178, 255, 0.9)",
      mist: "rgba(101, 255, 207, 0.1)"
    },
    metrics: [
      { label: "Bid lanes", value: "09 sealed" },
      { label: "Settlement stage", value: "Verification in progress" },
      { label: "Fallback", value: "Armed" }
    ],
    nextActions: ["Monitor settlement", "Review settlement details", "Prepare claims"],
    timeline: [
      { label: "Asset intake", value: "Custody secured", tone: "success" },
      { label: "Auction state", value: "Resolving now", tone: "warning" },
      { label: "Settlement", value: "Fallback timer armed", tone: "warning" }
    ],
    protocolSignals: [
      "Finalization request already recorded on-chain.",
      "Winner selection remains confidential until settlement completes.",
      "Keeper reward becomes claimable after completion."
    ],
    activityScore: 9,
    escrowScore: 6.42,
    freshnessScore: 84
  },
  {
    id: "midnight-calculus-313",
    title: "Midnight Calculus",
    collection: "Oracle Geometry",
    lotLabel: "Lot 313 / final settlement complete",
    state: "finalized",
    formatLabel: "Confidential close complete",
    confidentialityLabel: "Winner committed",
    seller: "0xD912...331F",
    sellerTag: "Verified seller",
    openingBidAmount: 4.1,
    openingBidLabel: "Opening bid 4.10 ETH",
    escrowLabel: "13.24 ETH cleared",
    timeLabel: "Claims ready now",
    synopsis:
      "This lot has completed the sealed-bid path. Seller proceeds and winner-claim flows are now ready from the dashboard.",
    settlementNote: "Dashboard will surface any remaining claim actions.",
    visual: {
      halo: "rgba(255, 208, 116, 0.62)",
      beam: "rgba(171, 108, 255, 0.9)",
      mist: "rgba(255, 208, 116, 0.12)"
    },
    metrics: [
      { label: "Winning lane", value: "4.68 ETH" },
      { label: "Claims", value: "Open" },
      { label: "Settlement", value: "Completed" }
    ],
    nextActions: ["Claim asset", "Claim seller proceeds", "Inspect activity log"],
    timeline: [
      { label: "Asset intake", value: "Custody completed", tone: "success" },
      { label: "Auction state", value: "Finalized on-chain", tone: "success" },
      { label: "Settlement", value: "Claims available", tone: "success" }
    ],
    protocolSignals: [
      "Seller proceeds released only after proof verification.",
      "Winning amount remained concealed until settlement.",
      "Claim surface is now available from the dashboard."
    ],
    activityScore: 7,
    escrowScore: 13.24,
    freshnessScore: 72
  },
  {
    id: "parallax-axiom-402",
    title: "Parallax Axiom",
    collection: "Nebula Trust",
    lotLabel: "Lot 402 / guarded rollback",
    state: "voided",
    formatLabel: "Fallback void",
    confidentialityLabel: "No winner committed",
    seller: "0xA4F1...9907",
    sellerTag: "Seller under fallback review",
    openingBidAmount: 2.1,
    openingBidLabel: "Opening bid 2.10 ETH",
    escrowLabel: "4.90 ETH returned",
    timeLabel: "Refund path active",
    synopsis:
      "This lot moved into a controlled void path after the final settlement window exceeded its acceptable delay budget.",
    settlementNote: "Refunds are available and the slashed pot absorbed the cancellation penalty.",
    visual: {
      halo: "rgba(255, 126, 154, 0.58)",
      beam: "rgba(139, 110, 255, 0.82)",
      mist: "rgba(255, 126, 154, 0.12)"
    },
    metrics: [
      { label: "Refund lane", value: "Live" },
      { label: "Seller slash", value: "Triggered" },
      { label: "Settlement", value: "Voided" }
    ],
    nextActions: ["Claim refund", "Open portfolio", "Review fallback notes"],
    timeline: [
      { label: "Asset intake", value: "Custody reversed", tone: "warning" },
      { label: "Auction state", value: "Voided through fallback", tone: "danger" },
      { label: "Settlement", value: "Refund route unlocked", tone: "success" }
    ],
    protocolSignals: [
      "The no-winner branch forced a zero winning amount.",
      "Refund path is deterministic and visible to bidders.",
      "Slashed pot absorbed the seller-side penalty."
    ],
    activityScore: 4,
    escrowScore: 4.9,
    freshnessScore: 63
  },
  {
    id: "sable-atlas-119",
    title: "Sable Atlas",
    collection: "Archive Continuum",
    lotLabel: "Lot 119 / active competitive desk",
    state: "active",
    formatLabel: "Sealed bid",
    confidentialityLabel: "Escrow threshold satisfied",
    seller: "0x4340...AB12",
    sellerTag: "Archive steward",
    openingBidAmount: 5.6,
    openingBidLabel: "Opening bid 5.60 ETH",
    escrowLabel: "16.90 ETH escrow locked",
    timeLabel: "01h 26m left",
    synopsis:
      "The highest-volume active lot in the current desk, with enough bidder pressure to make the closing window operationally important.",
    settlementNote: "This lot will become the next keeper-priority close event.",
    visual: {
      halo: "rgba(153, 118, 255, 0.72)",
      beam: "rgba(93, 194, 255, 0.86)",
      mist: "rgba(153, 118, 255, 0.12)"
    },
    metrics: [
      { label: "Bid lanes", value: "23 lanes" },
      { label: "Participants", value: "11 active" },
      { label: "Settlement", value: "Priority close" }
    ],
    nextActions: ["Place confidential bid", "Track close window", "Review auction details"],
    timeline: [
      { label: "Asset intake", value: "Ready", tone: "success" },
      { label: "Auction state", value: "High-traffic active desk", tone: "success" },
      { label: "Settlement", value: "Closing soon", tone: "warning" }
    ],
    protocolSignals: [
      "Active bidder count is highest in the current batch.",
      "Escrow coverage remains above the opening bid by 3.01x.",
      "This lot is expected to stay busy until close."
    ],
    activityScore: 23,
    escrowScore: 16.9,
    freshnessScore: 88
  }
];

export function listAuctions() {
  return auctionSeed;
}

export function getAuctionById(id: string) {
  return auctionSeed.find((auction) => auction.id === id);
}

export function filterAuctions(records: AuctionRecord[], state: AuctionStateFilter) {
  if (state === "all") {
    return records;
  }

  return records.filter((auction) => auction.state === state);
}

export function sortAuctions(records: AuctionRecord[], sort: AuctionSortKey) {
  const cloned = [...records];

  switch (sort) {
    case "activity":
      return cloned.sort((left, right) => right.activityScore - left.activityScore);
    case "escrow":
      return cloned.sort((left, right) => right.escrowScore - left.escrowScore);
    case "newest":
      return cloned.sort((left, right) => right.freshnessScore - left.freshnessScore);
    case "ending":
    default:
      return cloned.sort((left, right) => right.activityScore + right.freshnessScore - (left.activityScore + left.freshnessScore));
  }
}

export function getAuctionStatusTone(state: AuctionState): StatusPillTone {
  switch (state) {
    case "active":
      return "success";
    case "resolving":
      return "warning";
    case "cancelled":
      return "warning";
    case "voided":
      return "danger";
    case "finalized":
    default:
      return "neutral";
  }
}

export function getAuctionStatusLabel(state: AuctionState) {
  switch (state) {
    case "active":
      return "Active";
    case "resolving":
      return "Resolving";
    case "cancelled":
      return "Cancelled";
    case "voided":
      return "Voided";
    case "finalized":
    default:
      return "Finalized";
  }
}

export function getMarketplaceStats(records: AuctionRecord[]) {
  const activeCount = records.filter((auction) => auction.state === "active").length;
  const confidentialCount = records.filter((auction) => auction.onChain).length;
  const resolvingCount = records.filter((auction) => auction.state === "resolving").length;

  return [
    {
      label: "Confidential lots",
      value: `${records.length} listed`,
      note: "Curated across the current Sepolia desk."
    },
    {
      label: "Public price surface",
      value: "Hidden",
      note: "The public desk no longer surfaces live escrow amounts for sealed-bid lots."
    },
    {
      label: "Resolving now",
      value: `${resolvingCount} resolving`,
      note: "These auctions are already moving through settlement."
    },
    {
      label: "Live actions",
      value: `${activeCount} active / ${confidentialCount} confidential`,
      note: "Only settlement state and route readiness stay visible on the public desk."
    }
  ] as const;
}

export type UserOperationRecord = {
  summary: {
    identity: string;
    role: string;
    activeParticipations: number;
    managedAuctions: number;
    claimableItems: number;
    claimableValueLabel: string;
  };
  createdAuctions: AuctionRecord[];
  participations: AuctionRecord[];
  claims: Array<{
    id: string;
    title: string;
    category: "refund" | "seller" | "asset" | "keeper";
    amountLabel: string;
    note: string;
    tone: StatusPillTone;
    actionLabel: string;
  }>;
  activity: Array<{
    id: string;
    timestamp: string;
    title: string;
    detail: string;
    tone: StatusPillTone;
  }>;
};

export function getUserOperations(): UserOperationRecord {
  const records = listAuctions();
  const createdAuctions = records.filter((auction) =>
    ["aurora-vault-091", "midnight-calculus-313", "parallax-axiom-402"].includes(auction.id)
  );
  const participations = records.filter((auction) =>
    ["aurora-vault-091", "zero-knowledge-bloom-208", "midnight-calculus-313", "sable-atlas-119"].includes(auction.id)
  );

  return {
    summary: {
      identity: "0x8A4d...72C1",
      role: "Seller + bidder session",
      activeParticipations: participations.filter((auction) => auction.state === "active").length,
      managedAuctions: createdAuctions.length,
      claimableItems: 4,
      claimableValueLabel: "6.04 ETH + 1 NFT"
    },
    createdAuctions,
    participations,
    claims: [
      {
        id: "claim-seller-midnight",
        title: "Seller proceeds / Midnight Calculus",
        category: "seller",
        amountLabel: "4.68 ETH",
        note: "Settlement finalized and seller proceeds are ready to withdraw.",
        tone: "success",
        actionLabel: "Claim proceeds"
      },
      {
        id: "claim-asset-midnight",
        title: "Winning asset / Midnight Calculus",
        category: "asset",
        amountLabel: "1 NFT",
        note: "Finalized lot. Winning account can pull the NFT into custody.",
        tone: "success",
        actionLabel: "Claim asset"
      },
      {
        id: "claim-refund-parallax",
        title: "Refund / Parallax Axiom",
        category: "refund",
        amountLabel: "1.40 ETH",
        note: "Fallback void completed. Refund route is unlocked.",
        tone: "warning",
        actionLabel: "Claim refund"
      },
      {
        id: "claim-keeper-bloom",
        title: "Keeper reward / Zero-Knowledge Bloom",
        category: "keeper",
        amountLabel: "0.06 ETH",
        note: "Resolution is in-flight and the keeper reward will unlock on successful completion.",
        tone: "neutral",
        actionLabel: "Track reward"
      }
    ],
    activity: [
      {
        id: "activity-001",
        timestamp: "2m ago",
        title: "Escrow staged for Sable Atlas",
        detail: "You opened a 1.20 ETH local escrow lane before confidential bid submission.",
        tone: "success"
      },
      {
        id: "activity-002",
        timestamp: "18m ago",
        title: "Resolution request dispatched",
        detail: "Zero-Knowledge Bloom moved from ACTIVE to RESOLVING and is now waiting for settlement to finish.",
        tone: "warning"
      },
      {
        id: "activity-003",
        timestamp: "1h ago",
        title: "Seller proceeds unlocked",
        detail: "Midnight Calculus finalized successfully and seller proceeds are now claimable.",
        tone: "success"
      },
      {
        id: "activity-004",
        timestamp: "3h ago",
        title: "Fallback void completed",
        detail: "Parallax Axiom exceeded its settlement window and moved into a clear refund state.",
        tone: "danger"
      }
    ]
  };
}
