import Link from "next/link";
import type { CSSProperties } from "react";

import { StatusPill } from "@/components/status-pill";
import { getAuctionStatusLabel, getAuctionStatusTone, type AuctionRecord } from "@/lib/auctions";

type AuctionCardProps = {
  auction: AuctionRecord;
};

type AuctionVisualStyle = CSSProperties & {
  "--auction-halo": string;
  "--auction-beam": string;
  "--auction-mist": string;
};

export function AuctionCard({ auction }: AuctionCardProps) {
  const visualStyle: AuctionVisualStyle = {
    "--auction-halo": auction.visual.halo,
    "--auction-beam": auction.visual.beam,
    "--auction-mist": auction.visual.mist
  };

  return (
    <article className="auction-card">
      <div className="auction-card__visual" style={visualStyle}>
        <div className="auction-card__signal">
          <span>{auction.collection}</span>
          <StatusPill label={getAuctionStatusLabel(auction.state)} tone={getAuctionStatusTone(auction.state)} />
        </div>
        <div className="auction-card__crest">
          <span className="auction-card__lot">{auction.lotLabel}</span>
          <strong className="auction-card__clock">{auction.timeLabel}</strong>
        </div>
      </div>

      <div className="auction-card__body">
        <div className="auction-card__headline">
          <div>
            <p className="auction-card__eyebrow">{auction.formatLabel}</p>
            <h2 className="auction-card__title">{auction.title}</h2>
          </div>
          <p className="auction-card__confidentiality">{auction.confidentialityLabel}</p>
        </div>

        <p className="auction-card__summary">{auction.synopsis}</p>

        <div className="auction-card__metrics">
          {auction.metrics.map((metric) => (
            <div key={metric.label} className="auction-card__metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>

        <div className="auction-card__foot">
          <div className="auction-card__reserve">
            <span>{auction.openingBidLabel}</span>
            <strong>{auction.escrowLabel}</strong>
          </div>
          <div className="auction-card__actions">
            <Link className="secondary-action auction-card__action" href={`/marketplace/${auction.id}`}>
              Open details
            </Link>
            <Link className="primary-action auction-card__action" href="/marketplace/create">
              Create auction
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
