import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { AuctionActionConsole } from "@/components/auction-action-console";
import { StatusPill } from "@/components/status-pill";
import {
  getAuctionById,
  getAuctionStatusLabel,
  getAuctionStatusTone,
  listAuctions
} from "@/lib/auctions";

type AuctionDetailsPageProps = {
  params: Promise<{
    auctionId: string;
  }>;
};

export function generateStaticParams() {
  return listAuctions().map((auction) => ({
    auctionId: auction.id
  }));
}

export default async function AuctionDetailsPage({ params }: AuctionDetailsPageProps) {
  const { auctionId } = await params;
  const auction = getAuctionById(auctionId);

  if (!auction) {
    notFound();
  }

  return (
    <main className="page-grid detail-shell">
      <section className="detail-hero">
        <div className="detail-hero__visual">
          <div
            className="detail-orb"
            style={
              {
                "--auction-halo": auction.visual.halo,
                "--auction-beam": auction.visual.beam,
                "--auction-mist": auction.visual.mist
              } as CSSProperties
            }
          >
            <span className="detail-orb__lot">{auction.lotLabel}</span>
            <strong className="detail-orb__state">{auction.timeLabel}</strong>
          </div>
        </div>

        <div className="detail-hero__copy">
          <div className="detail-hero__meta">
            <StatusPill label={getAuctionStatusLabel(auction.state)} tone={getAuctionStatusTone(auction.state)} />
            <span className="detail-hero__collection">{auction.collection}</span>
          </div>
          <h1 className="detail-title detail-hero__title">{auction.title}</h1>
          <p className="detail-copy">{auction.synopsis}</p>
          <p className="detail-callout">{auction.settlementNote}</p>
          <div className="hero-actions">
            <Link className="primary-action" href="/marketplace/create">
              Create adjacent lot
            </Link>
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
        openingBidAmount={auction.openingBidAmount}
        openingBidLabel={auction.openingBidLabel}
      />

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
              <p className="detail-copy detail-card__copy">{auction.escrowLabel}</p>
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
          <p className="eyebrow">Immediate actions</p>
          <ul className="signal-list">
            {auction.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </article>

        <article className="detail-card">
          <p className="eyebrow">Auction notes</p>
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
