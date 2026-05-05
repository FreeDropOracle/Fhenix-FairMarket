"use client";

import Link from "next/link";

import { AuctionCountdown } from "@/components/auction-countdown";
import { type AuctionRecord } from "@/lib/auctions";

type AuctionCardProps = {
  auction: AuctionRecord;
};

export function AuctionCard({ auction }: AuctionCardProps) {
  const detailsHref = `/marketplace/${auction.id}`;
  const primaryActionLabel = auction.state === "finalized" ? "View Claims" : "Enter Auction";
  const bidSignal =
    auction.onChain?.bidCount !== undefined
      ? `${auction.onChain.bidCount}`
      : auction.metrics.find((metric) => metric.label.toLowerCase().includes("participants"))?.value ?? "Private";

  return (
    <article className="auction-card">
      <div className="auction-card__media">
        <img
          className="auction-card__image"
          src={auction.artwork.src}
          alt={auction.artwork.alt}
          loading="lazy"
          decoding="async"
        />
        <div className="auction-card__media-bar">
          <span className="auction-card__collection">{auction.collection}</span>
        </div>
        <div className="auction-card__media-preview">
          <span className="auction-card__lot">{auction.lotLabel}</span>
        </div>
        <div className="auction-card__media-footer">
          <span className="auction-card__countdown-chip" suppressHydrationWarning>
            <AuctionCountdown
              endTimeUnix={auction.onChain?.endTimeUnix}
              fallbackLabel={auction.timeLabel}
              state={auction.state}
            />
          </span>
        </div>
      </div>

      <div className="auction-card__body">
        <div className="auction-card__headline">
          <p className="auction-card__eyebrow">{auction.bidLaneLabel}</p>
          <h2 className="auction-card__title">{auction.title}</h2>
        </div>

        <div className="auction-card__metrics">
          <div className="auction-card__metric">
            <span>Bids</span>
            <strong>{bidSignal}</strong>
          </div>
          <div className="auction-card__metric">
            <span>Time</span>
            <strong>{auction.timeLabel}</strong>
          </div>
        </div>

        <div className="auction-card__foot">
          <div className="auction-card__actions">
            <Link className="primary-action auction-card__action" href={detailsHref}>
              {primaryActionLabel}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
