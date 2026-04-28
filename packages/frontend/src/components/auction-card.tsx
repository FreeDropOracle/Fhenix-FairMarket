import Link from "next/link";
import type { CSSProperties } from "react";

import { AuctionCountdown } from "@/components/auction-countdown";
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
  const hasLiveCountdown = auction.state === "active" && Boolean(auction.onChain?.endTimeUnix);
  const detailsHref = auction.onChain ? `/marketplace/${auction.id}#settlement-controls` : `/marketplace/${auction.id}`;
  const detailsLabel = auction.onChain ? "Open live lot" : "Open details";

  return (
    <article className="auction-card">
      <div className="auction-card__visual" style={visualStyle}>
        <div className="auction-card__signal">
          <span>{auction.collection}</span>
          <StatusPill label={getAuctionStatusLabel(auction.state)} tone={getAuctionStatusTone(auction.state)} />
        </div>
        <div className="auction-card__crest">
          {hasLiveCountdown ? <span className="auction-card__countdown-chip">Live countdown</span> : null}
          <span className="auction-card__lot">{auction.lotLabel}</span>
          <strong className="auction-card__clock" data-live={hasLiveCountdown}>
            <AuctionCountdown
              endTimeUnix={auction.onChain?.endTimeUnix}
              fallbackLabel={auction.timeLabel}
              state={auction.state}
            />
          </strong>
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
            <Link className="secondary-action auction-card__action" href={detailsHref}>
              {detailsLabel}
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
