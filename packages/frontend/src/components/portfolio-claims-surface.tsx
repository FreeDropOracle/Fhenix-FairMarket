"use client";

import { ZeroAddress, formatEther, getAddress } from "ethers";
import Link from "next/link";
import { useMemo } from "react";

import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import type { AuctionRecord } from "@/lib/auctions";

type PortfolioClaimsSurfaceProps = {
  auctions: AuctionRecord[];
};

type LiveClaimRoute = {
  id: string;
  amountLabel: string;
  eyebrow: string;
  href: string;
  note: string;
  title: string;
  tone: "success" | "warning" | "neutral";
  actionLabel: string;
};

function isAddressEqual(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) {
    return false;
  }

  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}

function formatEthFromWei(value: string) {
  return `${Number.parseFloat(formatEther(BigInt(value))).toFixed(2)} ETH`;
}

function buildLiveClaims(auctions: AuctionRecord[], account: string): LiveClaimRoute[] {
  return auctions.flatMap((auction) => {
    if (!auction.onChain) {
      return [];
    }

    const claims: LiveClaimRoute[] = [];
    const { onChain } = auction;
    const sellerPayoutWei = BigInt(onChain.sellerPayoutWei);
    const sellerIsConnected = isAddressEqual(account, auction.seller);
    const expectedAssetRecipient =
      onChain.winnerAddress === ZeroAddress ? auction.seller : onChain.winnerAddress;
    const recipientIsConnected = isAddressEqual(account, expectedAssetRecipient);

    if (auction.state === "finalized" && !onChain.assetClaimed && recipientIsConnected) {
      claims.push({
        id: `${auction.id}-asset-claim`,
        amountLabel: "1 NFT",
        eyebrow: onChain.winnerAddress === ZeroAddress ? "Seller reclaim" : "Asset claim",
        href: `/marketplace/${auction.id}#settlement-controls`,
        note:
          onChain.winnerAddress === ZeroAddress
            ? "This lot finalized with no winner. The seller wallet can reclaim the NFT from escrow."
            : "The recorded winner wallet can now complete the NFT claim from settlement controls.",
        title: `${auction.title} / NFT release`,
        tone: "success",
        actionLabel: onChain.winnerAddress === ZeroAddress ? "Open reclaim route" : "Open NFT claim"
      });
    }

    if (auction.state === "cancelled" && !onChain.sellerClaimed && sellerPayoutWei > 0n && sellerIsConnected) {
      claims.push({
        id: `${auction.id}-seller-payout`,
        amountLabel: formatEthFromWei(onChain.sellerPayoutWei),
        eyebrow: "Seller proceeds",
        href: `/marketplace/${auction.id}#seller-controls`,
        note: "The seller payout route is open for this cancelled lot.",
        title: `${auction.title} / Seller payout`,
        tone: "warning",
        actionLabel: "Open seller payout"
      });
    }

    return claims;
  });
}

export function PortfolioClaimsSurface({ auctions }: PortfolioClaimsSurfaceProps) {
  const wallet = useWallet();

  const liveClaims = useMemo(() => {
    if (!wallet.account) {
      return [];
    }

    return buildLiveClaims(auctions, wallet.account);
  }, [auctions, wallet.account]);

  const highlightLabel = !wallet.hasProvider
    ? "Install wallet"
    : !wallet.isConnected
      ? "Connect wallet"
      : !wallet.isSupportedNetwork
        ? "Switch network"
        : liveClaims.length > 0
          ? `${liveClaims.length} live route${liveClaims.length > 1 ? "s" : ""}`
          : "No live claims";

  const highlightCopy = !wallet.hasProvider
    ? "Install a wallet first so the portfolio can inspect live claim routes."
    : !wallet.isConnected
      ? "Connect your wallet to see only the claim routes that really belong to this session."
      : !wallet.isSupportedNetwork
        ? "Switch to Sepolia so the portfolio can compare your wallet against current auction outcomes."
        : liveClaims.length > 0
          ? "These routes are derived from the connected wallet and the current on-chain state of each lot."
          : "No seller payout or NFT release route is currently claimable for the connected wallet.";

  const handleWalletAction = async () => {
    if (!wallet.hasProvider) {
      window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      return;
    }

    if (!wallet.isConnected) {
      await wallet.connect();
      return;
    }

    if (!wallet.isSupportedNetwork) {
      await wallet.switchToSepolia();
    }
  };

  return (
    <>
      <section className="portfolio-claim-spotlight">
        <div className="portfolio-claim-spotlight__copy">
          <p className="eyebrow">Claims center</p>
          <h2 className="detail-title portfolio-claim-spotlight__title">Only show claim routes that are real for this wallet.</h2>
          <p className="detail-card__copy">
            NFT release and seller payout routes now depend on the connected wallet and the current on-chain auction
            state, not on static sample data.
          </p>
        </div>

        <div className="portfolio-claim-spotlight__value">
          <span className="signal-label">Ready now</span>
          <strong>{highlightLabel}</strong>
          <p>{highlightCopy}</p>
        </div>

        <div className="portfolio-claim-spotlight__actions">
          {!wallet.hasProvider || !wallet.isConnected || !wallet.isSupportedNetwork ? (
            <button className="primary-action" onClick={handleWalletAction} type="button">
              {!wallet.hasProvider ? "Install wallet" : !wallet.isConnected ? "Connect wallet" : "Switch to Sepolia"}
            </button>
          ) : (
            <a className="primary-action" href="#portfolio-claims">
              Review live claims
            </a>
          )}
          <Link className="secondary-action" href="/marketplace">
            Back to marketplace
          </Link>
        </div>
      </section>

      <section className="portfolio-grid">
        <article className="detail-card portfolio-section-card" id="portfolio-claims">
          <div className="section-header">
            <div>
              <p className="eyebrow">Claims</p>
              <h2 className="detail-title portfolio-section-card__title">What can this wallet claim right now?</h2>
            </div>
            <StatusPill
              label={
                !wallet.isConnected || !wallet.isSupportedNetwork
                  ? "Wallet check"
                  : liveClaims.length > 0
                    ? `${liveClaims.length} ready`
                    : "Nothing live"
              }
              tone={!wallet.isConnected || !wallet.isSupportedNetwork ? "warning" : liveClaims.length > 0 ? "success" : "neutral"}
            />
          </div>

          <div className="claims-list">
            {!wallet.hasProvider || !wallet.isConnected || !wallet.isSupportedNetwork ? (
              <article className="claim-card">
                <div className="claim-card__head">
                  <div>
                    <span className="signal-label">Wallet required</span>
                    <h3 className="claim-card__title">Live claim routes need the actual claimant wallet.</h3>
                  </div>
                  <StatusPill label="Connect first" tone="warning" />
                </div>
                <p className="claim-card__copy">
                  Connect the wallet that won the NFT or owns the seller payout path, then this section will only show
                  routes that are truly actionable on chain.
                </p>
                <button className="primary-action claim-card__action" onClick={handleWalletAction} type="button">
                  {!wallet.hasProvider ? "Install wallet" : !wallet.isConnected ? "Connect wallet" : "Switch to Sepolia"}
                </button>
              </article>
            ) : liveClaims.length === 0 ? (
              <article className="claim-card">
                <div className="claim-card__head">
                  <div>
                    <span className="signal-label">Live status</span>
                    <h3 className="claim-card__title">No NFT or seller claim route is open for this wallet.</h3>
                  </div>
                  <StatusPill label="Standby" tone="neutral" />
                </div>
                <p className="claim-card__copy">
                  This can happen when settlement has not finalized yet, the NFT was already claimed, or this wallet is
                  not the recorded seller or winner for the currently listed lots.
                </p>
                <Link className="primary-action claim-card__action" href="/marketplace">
                  Review marketplace
                </Link>
              </article>
            ) : (
              liveClaims.map((claim) => (
                <article key={claim.id} className="claim-card">
                  <div className="claim-card__head">
                    <div>
                      <span className="signal-label">{claim.eyebrow}</span>
                      <h3 className="claim-card__title">{claim.title}</h3>
                    </div>
                    <StatusPill label={claim.amountLabel} tone={claim.tone} />
                  </div>
                  <p className="claim-card__copy">{claim.note}</p>
                  <Link className="primary-action claim-card__action" href={claim.href}>
                    {claim.actionLabel}
                  </Link>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </>
  );
}
