import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { getAuctionStatusLabel, getAuctionStatusTone, getUserOperations } from "@/lib/auctions";

function getClaimCategoryLabel(category: "refund" | "seller" | "asset" | "keeper") {
  switch (category) {
    case "refund":
      return "Refund";
    case "seller":
      return "Seller proceeds";
    case "asset":
      return "Asset claim";
    case "keeper":
    default:
      return "Keeper reward";
  }
}

export default function PortfolioPage() {
  const operations = getUserOperations();

  return (
    <main className="page-grid portfolio-shell">
      <section className="portfolio-hero">
        <div>
          <p className="eyebrow">Task 5.4 / User operations</p>
          <h1 className="section-title">Everything the user can do, without hunting across auctions.</h1>
          <p className="section-note portfolio-hero__copy">
            This desk centralizes personal exposure: created auctions, active participation, claimable balances,
            and the short activity trail needed to stay oriented.
          </p>
        </div>
        <div className="portfolio-identity-card">
          <span className="signal-label">Current session</span>
          <strong className="portfolio-identity-card__title">{operations.summary.identity}</strong>
          <p className="portfolio-identity-card__copy">{operations.summary.role}</p>
          <StatusPill label="Sepolia portfolio" tone="success" />
        </div>
      </section>

      <section className="portfolio-stats-grid">
        <article className="portfolio-stat-card">
          <span className="signal-label">Claimable surface</span>
          <strong className="portfolio-stat-card__value">{operations.summary.claimableValueLabel}</strong>
          <p className="portfolio-stat-card__copy">{operations.summary.claimableItems} items already visible in one place.</p>
        </article>
        <article className="portfolio-stat-card">
          <span className="signal-label">Active participations</span>
          <strong className="portfolio-stat-card__value">{operations.summary.activeParticipations}</strong>
          <p className="portfolio-stat-card__copy">Lots still accepting escrow or confidential bid operations.</p>
        </article>
        <article className="portfolio-stat-card">
          <span className="signal-label">Managed auctions</span>
          <strong className="portfolio-stat-card__value">{operations.summary.managedAuctions}</strong>
          <p className="portfolio-stat-card__copy">Auctions created or stewarded by this session.</p>
        </article>
      </section>

      <section className="portfolio-grid">
        <article className="detail-card portfolio-section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Claims center</p>
              <h2 className="detail-title portfolio-section-card__title">Unified claim surface</h2>
            </div>
            <Link className="secondary-action portfolio-inline-action" href="/marketplace">
              Return to marketplace
            </Link>
          </div>

          <div className="claims-list">
            {operations.claims.map((claim) => (
              <article key={claim.id} className="claim-card">
                <div className="claim-card__head">
                  <div>
                    <span className="signal-label">{getClaimCategoryLabel(claim.category)}</span>
                    <h3 className="claim-card__title">{claim.title}</h3>
                  </div>
                  <StatusPill label={claim.amountLabel} tone={claim.tone} />
                </div>
                <p className="claim-card__copy">{claim.note}</p>
                <button className="primary-action claim-card__action" type="button">
                  {claim.actionLabel}
                </button>
              </article>
            ))}
          </div>
        </article>

        <article className="detail-card portfolio-section-card">
          <p className="eyebrow">Personal activity</p>
          <h2 className="detail-title portfolio-section-card__title">Activity trail</h2>
          <div className="activity-list">
            {operations.activity.map((item) => (
              <div key={item.id} className="activity-row">
                <div className="activity-row__copy">
                  <span className="signal-label">{item.timestamp}</span>
                  <h3 className="activity-row__title">{item.title}</h3>
                  <p className="activity-row__detail">{item.detail}</p>
                </div>
                <StatusPill
                  label={item.tone === "success" ? "Healthy" : item.tone === "warning" ? "Watch" : item.tone === "danger" ? "Fallback" : "Standby"}
                  tone={item.tone}
                />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="portfolio-grid">
        <article className="detail-card portfolio-section-card">
          <p className="eyebrow">Created auctions</p>
          <h2 className="detail-title portfolio-section-card__title">Your sell-side desk</h2>
          <div className="portfolio-auction-list">
            {operations.createdAuctions.map((auction) => (
              <Link key={auction.id} className="portfolio-auction-card" href={`/marketplace/${auction.id}`}>
                <div className="portfolio-auction-card__head">
                  <div>
                    <span className="signal-label">{auction.collection}</span>
                    <h3 className="portfolio-auction-card__title">{auction.title}</h3>
                  </div>
                  <StatusPill label={getAuctionStatusLabel(auction.state)} tone={getAuctionStatusTone(auction.state)} />
                </div>
                <p className="portfolio-auction-card__copy">{auction.settlementNote}</p>
                <div className="portfolio-auction-card__foot">
                  <span>{auction.openingBidLabel}</span>
                  <strong>{auction.escrowLabel}</strong>
                </div>
              </Link>
            ))}
          </div>
        </article>

        <article className="detail-card portfolio-section-card">
          <p className="eyebrow">Participations</p>
          <h2 className="detail-title portfolio-section-card__title">Your bidder-side desk</h2>
          <div className="portfolio-auction-list">
            {operations.participations.map((auction) => (
              <Link key={auction.id} className="portfolio-auction-card" href={`/marketplace/${auction.id}`}>
                <div className="portfolio-auction-card__head">
                  <div>
                    <span className="signal-label">{auction.lotLabel}</span>
                    <h3 className="portfolio-auction-card__title">{auction.title}</h3>
                  </div>
                  <StatusPill label={getAuctionStatusLabel(auction.state)} tone={getAuctionStatusTone(auction.state)} />
                </div>
                <p className="portfolio-auction-card__copy">{auction.confidentialityLabel}</p>
                <div className="portfolio-auction-card__foot">
                  <span>{auction.timeLabel}</span>
                  <strong>{auction.nextActions[0]}</strong>
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
