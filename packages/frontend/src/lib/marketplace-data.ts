import "server-only";

import { cache } from "react";
import { Contract, JsonRpcProvider, formatEther } from "ethers";

import { appConfig, formatAddress, isAddressLike } from "@/lib/app-config";
import { getAuctionArtwork, getAuctionById as getSeedAuctionById, type AuctionRecord, type AuctionState } from "@/lib/auctions";

const marketAbi = [
  "function auctionCounter() view returns (uint256)",
  "function getAuction(uint256 auctionId) view returns (address nftContract, uint256 tokenId, address seller, uint64 endTime, uint256 sellerDeposit, uint8 state, bool isVickrey, uint64 lastBlockTimestamp, bytes32 winnerCiphertext, uint256 winningAmount)",
  "function getAuctionPhase2Details(uint256 auctionId) view returns (address winner, uint256 totalEscrow, uint256 slashAmount, uint64 createdAt, uint64 resolvingSince, bool sellerClaimed, bool assetClaimed, uint32 bidCount)",
  "function getAuctionStartingPrice(uint256 auctionId) view returns (uint256)",
  "function previewSellerPayout(uint256 auctionId) view returns (uint256)"
] as const;

const erc721MetadataAbi = ["function name() view returns (string)", "function tokenURI(uint256 tokenId) view returns (string)"] as const;
const liveAuctionWindow = 24;
const rpcTimeoutMs = 4_000;
const alchemyApiKey = process.env.ALCHEMY_API_KEY?.trim() ?? "";
const artworkCache = new Map<string, AuctionRecord["artwork"] | null>();
const shouldLogArtworkDiagnostics = process.env.DEBUG_NFT_ARTWORK === "true";
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

function logArtworkDiagnostic(
  event: string,
  details: {
    nftContract: string;
    tokenId: string;
    title: string;
    reason?: string;
    source?: string;
  }
) {
  if (!shouldLogArtworkDiagnostics) {
    return;
  }

  console.info("[nft-artwork]", event, details);
}

function normalizeNftImageUrl(candidate: unknown) {
  if (typeof candidate !== "string") {
    return null;
  }

  const value = candidate.trim();
  if (value.length === 0 || value.startsWith("data:")) {
    return null;
  }

  if (value.startsWith("ipfs://")) {
    const path = value.replace(/^ipfs:\/\//, "").replace(/^ipfs\//, "");
    return `https://ipfs.io/ipfs/${path}`;
  }

  if (value.startsWith("ar://")) {
    return `https://arweave.net/${value.replace(/^ar:\/\//, "")}`;
  }

  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return null;
}

function normalizeInlineArtwork(candidate: unknown) {
  if (typeof candidate !== "string") {
    return null;
  }

  const value = candidate.trim();
  if (value.length === 0) {
    return null;
  }

  if (value.startsWith("data:image/")) {
    return value;
  }

  if (value.startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  }

  return null;
}

function normalizeArtworkSource(candidate: unknown) {
  return normalizeNftImageUrl(candidate) ?? normalizeInlineArtwork(candidate);
}

function normalizeMetadataUrl(candidate: unknown) {
  if (typeof candidate !== "string") {
    return null;
  }

  const value = candidate.trim();
  if (value.length === 0) {
    return null;
  }

  if (value.startsWith("data:application/json")) {
    return value;
  }

  return normalizeNftImageUrl(value);
}

function decodeJsonDataUri(uri: string) {
  const [, payload = ""] = uri.split(",", 2);
  if (!payload) {
    return null;
  }

  try {
    const json =
      uri.includes(";base64,")
        ? Buffer.from(payload, "base64").toString("utf8")
        : decodeURIComponent(payload);
    return JSON.parse(json) as Record<string, any>;
  } catch {
    return null;
  }
}

function resolveArtworkFromArray(candidate: unknown): string | null {
  if (!Array.isArray(candidate)) {
    return null;
  }

  for (const item of candidate) {
    const resolved =
      normalizeArtworkSource(item) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.gateway) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.raw) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.uri) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.url) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.href) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.src) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.image) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.image_url) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.thumbnail) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.thumbnailUrl) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.cachedUrl) ??
      normalizeArtworkSource((item as Record<string, unknown> | null)?.originalUrl);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveImageFromMetadataPayload(payload: Record<string, any>) {
  return (
    normalizeArtworkSource(payload.image) ??
    normalizeArtworkSource(payload.image_url) ??
    normalizeArtworkSource(payload.imageUrl) ??
    normalizeArtworkSource(payload.image_data) ??
    normalizeArtworkSource(payload.imageData) ??
    normalizeArtworkSource(payload.image_data_url) ??
    normalizeArtworkSource(payload.thumbnail) ??
    normalizeArtworkSource(payload.thumbnail_url) ??
    normalizeArtworkSource(payload.thumbnailUrl) ??
    normalizeArtworkSource(payload.cover_image) ??
    normalizeArtworkSource(payload.coverImage) ??
    normalizeArtworkSource(payload.content?.image) ??
    normalizeArtworkSource(payload.content?.image_url) ??
    normalizeArtworkSource(payload.content?.svg) ??
    normalizeArtworkSource(payload.properties?.image) ??
    normalizeArtworkSource(payload.properties?.image?.url) ??
    normalizeArtworkSource(payload.properties?.image?.uri) ??
    normalizeArtworkSource(payload.properties?.image?.href) ??
    normalizeArtworkSource(payload.properties?.image?.src) ??
    normalizeArtworkSource(payload.collection?.image) ??
    normalizeArtworkSource(payload.metadata?.image) ??
    normalizeArtworkSource(payload.metadata?.image_url) ??
    resolveArtworkFromArray(payload.properties?.files) ??
    resolveArtworkFromArray(payload.files) ??
    resolveArtworkFromArray(payload.content?.files) ??
    resolveArtworkFromArray(payload.assets) ??
    resolveArtworkFromArray(payload.media) ??
    resolveArtworkFromArray(payload.properties?.media) ??
    normalizeArtworkSource(payload.animation_url) ??
    normalizeArtworkSource(payload.animationUrl)
  );
}

async function fetchMetadataPayload(metadataUrl: string) {
  if (metadataUrl.startsWith("data:application/json")) {
    return decodeJsonDataUri(metadataUrl);
  }

  const response = await fetch(metadataUrl, {
    headers: { accept: "application/json" },
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(rpcTimeoutMs)
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as Record<string, any>;
}

async function fetchTokenUriArtwork(
  nftContract: string,
  tokenId: bigint,
  title: string,
  diagnosticBase: {
    nftContract: string;
    tokenId: string;
    title: string;
  }
) {
  try {
    const contract = new Contract(nftContract, erc721MetadataAbi, getRpcProvider());
    const tokenUriRaw = (await withTimeout(contract.tokenURI(tokenId))) as string;

    const directImageUrl = normalizeNftImageUrl(tokenUriRaw);
    if (directImageUrl) {
      logArtworkDiagnostic("resolved", {
        ...diagnosticBase,
        source: directImageUrl
      });
      return {
        src: directImageUrl,
        alt: `${title} NFT artwork preview`
      };
    }

    const metadataUrl = normalizeMetadataUrl(tokenUriRaw);
    if (!metadataUrl) {
      logArtworkDiagnostic("fallback", {
        ...diagnosticBase,
        reason: "token_uri_unreadable"
      });
      return null;
    }

    const metadataPayload = await fetchMetadataPayload(metadataUrl);
    if (!metadataPayload) {
      logArtworkDiagnostic("fallback", {
        ...diagnosticBase,
        reason: "token_uri_metadata_fetch_failed"
      });
      return null;
    }

    const resolvedUrl = resolveImageFromMetadataPayload(metadataPayload);
    if (!resolvedUrl) {
      logArtworkDiagnostic("fallback", {
        ...diagnosticBase,
        reason: "token_uri_metadata_missing_image"
      });
      return null;
    }

    logArtworkDiagnostic("resolved", {
      ...diagnosticBase,
      source: resolvedUrl
    });
    return {
      src: resolvedUrl,
      alt: `${title} NFT artwork preview`
    };
  } catch {
    logArtworkDiagnostic("fallback", {
      ...diagnosticBase,
      reason: "token_uri_contract_error"
    });
    return null;
  }
}

async function fetchNftArtwork(nftContract: string, tokenId: bigint, title: string, fallbackIndex: number) {
  const fallbackArtwork = getAuctionArtwork(fallbackIndex, title);
  const diagnosticBase = {
    nftContract,
    tokenId: tokenId.toString(),
    title
  };

  if (!alchemyApiKey) {
    const tokenUriArtwork = await fetchTokenUriArtwork(nftContract, tokenId, title, diagnosticBase);
    if (tokenUriArtwork) {
      artworkCache.set(`${nftContract.toLowerCase()}:${tokenId.toString()}`, tokenUriArtwork);
      return tokenUriArtwork;
    }

    logArtworkDiagnostic("fallback", { ...diagnosticBase, reason: "missing_alchemy_api_key" });
    return fallbackArtwork;
  }

  const cacheKey = `${nftContract.toLowerCase()}:${tokenId.toString()}`;
  if (artworkCache.has(cacheKey)) {
    const cachedArtwork = artworkCache.get(cacheKey);
    logArtworkDiagnostic(cachedArtwork ? "cache_hit" : "fallback", {
      ...diagnosticBase,
      reason: cachedArtwork ? "cached_remote_artwork" : "cached_fallback"
    });
    return cachedArtwork ?? fallbackArtwork;
  }

  try {
    const metadataUrl = new URL(`https://eth-sepolia.g.alchemy.com/nft/v3/${alchemyApiKey}/getNFTMetadata`);
    metadataUrl.searchParams.set("contractAddress", nftContract);
    metadataUrl.searchParams.set("tokenId", tokenId.toString());
    metadataUrl.searchParams.set("refreshCache", "false");

    const response = await fetch(metadataUrl, {
      headers: { accept: "application/json" },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(rpcTimeoutMs)
    });

    if (!response.ok) {
      const tokenUriArtwork = await fetchTokenUriArtwork(nftContract, tokenId, title, diagnosticBase);
      if (tokenUriArtwork) {
        artworkCache.set(cacheKey, tokenUriArtwork);
        return tokenUriArtwork;
      }

      artworkCache.set(cacheKey, null);
      logArtworkDiagnostic("fallback", {
        ...diagnosticBase,
        reason: `alchemy_http_${response.status}`
      });
      return fallbackArtwork;
    }

    const payload = (await response.json()) as Record<string, any>;
    const resolvedUrl =
      normalizeArtworkSource(payload.image?.cachedUrl) ??
      normalizeArtworkSource(payload.image?.thumbnailUrl) ??
      normalizeArtworkSource(payload.image?.pngUrl) ??
      normalizeArtworkSource(payload.image?.originalUrl) ??
      normalizeArtworkSource(payload.raw?.metadata?.image) ??
      normalizeArtworkSource(payload.raw?.metadata?.image_url) ??
      normalizeArtworkSource(payload.raw?.metadata?.image_data) ??
      normalizeArtworkSource(payload.rawMetadata?.image) ??
      normalizeArtworkSource(payload.metadata?.image) ??
      normalizeArtworkSource(payload.metadata?.image_url) ??
      resolveArtworkFromArray(payload.media) ??
      resolveImageFromMetadataPayload(payload.raw?.metadata ?? {}) ??
      resolveImageFromMetadataPayload(payload.rawMetadata ?? {}) ??
      resolveImageFromMetadataPayload(payload.metadata ?? {});

    if (!resolvedUrl) {
      const tokenUriArtwork = await fetchTokenUriArtwork(nftContract, tokenId, title, diagnosticBase);
      if (tokenUriArtwork) {
        artworkCache.set(cacheKey, tokenUriArtwork);
        return tokenUriArtwork;
      }

      artworkCache.set(cacheKey, null);
      logArtworkDiagnostic("fallback", {
        ...diagnosticBase,
        reason: "metadata_missing_image"
      });
      return fallbackArtwork;
    }

    const artwork = {
      src: resolvedUrl,
      alt: `${title} NFT artwork preview`
    };
    artworkCache.set(cacheKey, artwork);
    logArtworkDiagnostic("resolved", {
      ...diagnosticBase,
      source: resolvedUrl
    });
    return artwork;
  } catch {
    const tokenUriArtwork = await fetchTokenUriArtwork(nftContract, tokenId, title, diagnosticBase);
    if (tokenUriArtwork) {
      artworkCache.set(cacheKey, tokenUriArtwork);
      return tokenUriArtwork;
    }

    artworkCache.set(cacheKey, null);
    logArtworkDiagnostic("fallback", {
      ...diagnosticBase,
      reason: "alchemy_fetch_error"
    });
    return fallbackArtwork;
  }
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

function hasCloseWindowEnded(endTime: bigint, nowUnix: number) {
  return Number(endTime) <= nowUnix;
}

function getAuctionSynopsis(state: AuctionState, collectionLabel: string) {
  switch (state) {
    case "resolving":
      return `${collectionLabel} already moved beyond bidding and is now waiting for prototype settlement to complete.`;
    case "finalized":
      return `${collectionLabel} completed its sealed-bid path and is now ready for post-settlement claims.`;
    case "voided":
      return `${collectionLabel} moved into a guarded cancellation path and now exposes refund-oriented actions.`;
    case "cancelled":
      return `${collectionLabel} was cancelled by the seller before close, and the recovery path is now focused on refunds plus seller payout settlement.`;
    case "active":
    default:
      return `${collectionLabel} is live on Sepolia and can accept escrow plus prototype bidding actions from compatible wallets.`;
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
        `${bidCount.toString()} prototype bid lane(s) were recorded before the close window ended.`
      ];
    case "finalized":
      return [
        "The winner and payout path are already fixed on chain.",
        "The public desk stays focused on settlement state instead of exposing private auction sizing.",
        `${bidCount.toString()} prototype bid lane(s) fed into the final outcome.`
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
          ? `${bidCount.toString()} prototype bid lane(s) are already recorded on chain.`
          : "No on-chain prototype bid has been recorded yet."
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
  lastBlockTimestamp: bigint,
  nowUnix: number
) {
  const hasEnded = state === "active" && hasCloseWindowEnded(endTime, nowUnix);

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
      value: `${bidCount.toString()} prototype lane(s) recorded`
    }
  ];
}

function buildLiveAuctionRecord(
  auctionId: number,
  core: LiveAuctionCore,
  phase2: LiveAuctionPhase2,
  startingPrice: bigint,
  collectionName: string,
  sellerPayout: bigint,
  artwork: AuctionRecord["artwork"],
  nowUnix: number
): AuctionRecord {
  const state = mapLiveAuctionState(core.state);
  const hasEnded = state === "active" && hasCloseWindowEnded(core.endTime, nowUnix);
  const lotLabel = `Lot #${auctionId} / token ${core.tokenId.toString()}`;
  const formatLabel = core.isVickrey ? "Vickrey sealed bid" : "Prototype sealed auction";
  const openingBidLabel =
    startingPrice > 0n
      ? "Prototype floor configured"
      : state === "active"
        ? "No public opening bid"
        : "Opening price remained private";
  const publicEscrowLabel =
    state === "active"
      ? hasEnded
        ? "Close window reached. Settlement can start now."
        : phase2.bidCount > 0n
          ? "Prototype participation recorded"
          : "No public bidder activity"
      : state === "resolving"
        ? "Prototype settlement in progress"
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
    artwork,
    collection: collectionName,
    bidLaneLabel:
      state === "active" && hasEnded
        ? "Closed"
        : core.isVickrey
          ? "Prototype Vickrey lane active"
          : "Prototype bidding lane active",
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
    timeLabel: state === "active" && hasEnded ? "Closed" : formatRemainingTime(core.endTime, state),
    timeline: buildTimeline(state, phase2.createdAt, core.endTime, phase2.bidCount, core.lastBlockTimestamp, nowUnix),
    title: `Auction #${auctionId}`,
    visual: buildVisual(auctionId)
  };
}

async function loadLiveAuctionRecord(auctionId: number, nowUnix: number): Promise<AuctionRecord | null> {
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

    const title = `Auction #${auctionId}`;
    const [phase2Settled, startingPriceSettled, collectionName, sellerPayoutSettled, artwork] = await Promise.all([
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
      withTimeout(market.previewSellerPayout(auctionId)).catch(() => 0n),
      fetchNftArtwork(core.nftContract, core.tokenId, title, auctionId)
    ]);
    const record = buildLiveAuctionRecord(
      auctionId,
      core,
      phase2Settled,
      startingPriceSettled as bigint,
      collectionName,
      sellerPayoutSettled as bigint,
      artwork,
      nowUnix
    );
    return record;
  } catch {
    return null;
  }
}

const listLiveAuctions = cache(async () => {
  if (!isAddressLike(appConfig.contracts.marketProxyAddress)) {
    return [];
  }

  try {
    const market = getMarketContract();
    const auctionCounter = Number(await withTimeout(market.auctionCounter()));
    const nowUnix = Math.floor(Date.now() / 1000);

    if (!Number.isFinite(auctionCounter) || auctionCounter <= 0) {
      return [];
    }

    const firstAuctionId = Math.max(1, auctionCounter - liveAuctionWindow + 1);
    const records = await Promise.all(
      Array.from({ length: auctionCounter - firstAuctionId + 1 }, (_, index) => loadLiveAuctionRecord(firstAuctionId + index, nowUnix))
    );

    return records.filter((record): record is AuctionRecord => record !== null);
  } catch {
    return [];
  }
});

export const listMarketplaceAuctions = cache(async () => {
  const liveRecords = await listLiveAuctions();
  return liveRecords;
});

export const getMarketplaceAuctionById = cache(async (auctionId: string) => {
  if (isNumericAuctionId(auctionId)) {
    return loadLiveAuctionRecord(Number(auctionId), Math.floor(Date.now() / 1000));
  }

  return getSeedAuctionById(auctionId);
});
