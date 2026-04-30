import Link from "next/link";
import { notFound } from "next/navigation";

import { AuctionActionConsole } from "@/components/auction-action-console";
import { AuctionSettlementControls } from "@/components/auction-settlement-controls";
import { SellerAuctionControls } from "@/components/seller-auction-controls";
import { StatusPill } from "@/components/status-pill";
import {
  getAuctionStatusLabel,
  getAuctionStatusTone
} from "@/lib/auctions";
import { getMarketplaceAuctionById } from "@/lib/marketplace-data";

export const dynamic = "force-dynamic";

type AuctionDetailsPageProps = {
  params: Promise<{
    auctionId: string;
  }>;
};

export default async function AuctionDetailsPage({ params }: AuctionDetailsPageProps) {
  const { auctionId } = await params;
  const auction = await getMarketplaceAuctionById(auctionId);

  if (!auction) {
    notFound();
  }

  const closeWindowReached = auction.state === "active" && auction.timeLabel === "Closed";
  const primaryAction = auction.onChain
    ? closeWindowReached
      ? { href: "#settlement-controls", label: "Open settlement" }
      : auction.state === "finalized"
        ? { href: "#settlement-controls", label: "Open claim route" }
        : auction.state === "cancelled"
          ? { href: "#seller-controls", label: "Open seller route" }
          : auction.state === "resolving"
            ? { href: "#settlement-controls", label: "Review settlement" }
            : { href: "#auction-actions", label: "Place private bid" }
    : { href: "#auction-actions", label: "Review actions" };

  return (
    <main className="page-grid detail-shell">
      <section className="detail-hero">
        <div className="detail-hero__visual">
          <div className="detail-hero__art">
            <img
              className="detail-hero__image"
              src={auction.artwork.src}
              alt={auction.artwork.alt}
              loading="lazy"
            />
            <div className="detail-hero__art-head">
              <span className="detail-hero__lot">{auction.lotLabel}</span>
              <strong className="detail-hero__timechip">{auction.timeLabel}</strong>
            </div>
          </div>
        </div>

        <div className="detail-hero__copy">
          <div className="detail-hero__meta">
            <StatusPill label={getAuctionStatusLabel(auction.state)} tone={getAuctionStatusTone(auction.state)} />
            <span className="detail-hero__collection">{auction.collection}</span>
          </div>
          <h1 className="detail-title detail-hero__title">{auction.title}</h1>
          <p className="detail-copy">{auction.synopsis}</p>
          <div className="detail-hero__summary">
            <article className="detail-hero__summary-card">
              <span>Window</span>
              <strong>{auction.timeLabel}</strong>
            </article>
            <article className="detail-hero__summary-card">
              <span>Opening</span>
              <strong>{auction.openingBidLabel}</strong>
            </article>
            <article className="detail-hero__summary-card">
              <span>Privacy</span>
              <strong>{auction.confidentialityLabel}</strong>
            </article>
          </div>
          <p className="detail-callout">{auction.settlementNote}</p>
          <div className="hero-actions">
            <Link className="primary-action" href={primaryAction.href}>
              {primaryAction.label}
            </Link>
            {auction.onChain ? (
              <>
                <Link className="secondary-action" href="#settlement-controls">
                  Settlement
                </Link>
                <Link className="secondary-action" href="#seller-controls">
                  Seller path
                </Link>
              </>
            ) : null}
            <Link className="secondary-action" href="/marketplace">
              Return to desk
            </Link>
          </div>
        </div>
      </section>

      <AuctionActionConsole
        auctionId={auction.id}
        auctionState={auction.state}
        auctionTitle={auction.title}
        confidentialityLabel={auction.confidentialityLabel}
        escrowLabel={auction.escrowLabel}
        onChain={auction.onChain}
        openingBidAmount={auction.openingBidAmount}
        openingBidLabel={auction.openingBidLabel}
      />

      {auction.onChain ? (
        <section className="detail-grid">
          <AuctionSettlementControls
            auctionState={auction.state}
            onChain={auction.onChain}
            sellerAddress={auction.seller}
          />
          <SellerAuctionControls
            auctionId={auction.id}
            auctionState={auction.state}
            onChain={auction.onChain}
            sellerAddress={auction.seller}
          />
        </section>
      ) : null}

      <section className="detail-grid">
        <article className="detail-card">
          <p className="eyebrow">Auction details</p>
          <div className="detail-stack">
            <div>
              <span className="detail-label">Seller</span>
              <h2 className="detail-card__value">{auction.seller}</h2>
              <p className="detail-copy detail-card__copy">{auction.sellerTag}</p>
            </div>
            <div>
              <span className="detail-label">Opening bid</span>
              <h2 className="detail-card__value">{auction.openingBidLabel}</h2>
              <p className="detail-copy detail-card__copy">
                {auction.onChain ? "Live sealed-bid escrow magnitudes stay hidden on the public desk." : auction.escrowLabel}
              </p>
            </div>
            <div>
              <span className="detail-label">Confidentiality</span>
              <h2 className="detail-card__value">{auction.confidentialityLabel}</h2>
              <p className="detail-copy detail-card__copy">{auction.formatLabel}</p>
            </div>
          </div>
        </article>

        <article className="detail-card">
          <p className="eyebrow">Timeline</p>
          <div className="timeline-list">
            {auction.timeline.map((entry) => (
              <div key={entry.label} className="timeline-row">
                <div>
                  <span className="detail-label">{entry.label}</span>
                  <p className="timeline-row__value">{entry.value}</p>
                </div>
                <StatusPill
                  label={
                    entry.tone === "success"
                      ? "Ready"
                      : entry.tone === "warning"
                        ? "Watch"
                        : entry.tone === "danger"
                          ? "Critical"
                          : "Standby"
                  }
                  tone={entry.tone}
                />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="detail-grid">
        <article className="detail-card">
          <p className="eyebrow">What happens next</p>
          <ul className="signal-list">
            {auction.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </article>

        <article className="detail-card">
          <p className="eyebrow">Technical notes</p>
          <ul className="signal-list">
            {auction.protocolSignals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
