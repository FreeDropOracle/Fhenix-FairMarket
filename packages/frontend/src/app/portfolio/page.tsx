import Link from "next/link";

import { PortfolioClaimsSurface } from "@/components/portfolio-claims-surface";
import { StatusPill } from "@/components/status-pill";
import { getAuctionStatusLabel, getAuctionStatusTone, getUserOperations } from "@/lib/auctions";
import { listMarketplaceAuctions } from "@/lib/marketplace-data";

function getActivityToneLabel(tone: "success" | "warning" | "danger" | "neutral") {
  switch (tone) {
    case "success":
      return "Healthy";
    case "warning":
      return "Watch";
    case "danger":
      return "Fallback";
    case "neutral":
    default:
      return "Standby";
  }
}

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const operations = getUserOperations();
  const liveAuctions = await listMarketplaceAuctions();

  return (
    <main className="page-grid portfolio-shell">
      <section className="section-block section-block--compact portfolio-intro">
        <div className="portfolio-intro__head">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h1 className="section-title portfolio-intro__title">See claims first, then everything else.</h1>
            <p className="section-note portfolio-intro__copy">
              This view keeps the next action obvious: what is claimable now, what needs attention next, and which
              auctions still matter to your session.
            </p>
          </div>

          <div className="portfolio-session-card">
            <span className="signal-label">Current session</span>
            <strong className="portfolio-session-card__title">{operations.summary.identity}</strong>
            <p className="portfolio-session-card__copy">{operations.summary.role}</p>
            <StatusPill label="Sepolia ready" tone="success" />
          </div>
        </div>
      </section>

      <section className="portfolio-summary-strip">
        <article className="portfolio-summary-card">
          <span className="signal-label">Claim routes</span>
          <strong className="portfolio-summary-card__value">Live</strong>
          <p className="portfolio-summary-card__copy">Claim visibility now follows the connected wallet and lot state.</p>
        </article>

        <article className="portfolio-summary-card">
          <span className="signal-label">Active bids</span>
          <strong className="portfolio-summary-card__value">{operations.summary.activeParticipations}</strong>
          <p className="portfolio-summary-card__copy">Lots still worth watching or acting on.</p>
        </article>

        <article className="portfolio-summary-card">
          <span className="signal-label">My auctions</span>
          <strong className="portfolio-summary-card__value">{operations.summary.managedAuctions}</strong>
          <p className="portfolio-summary-card__copy">Sell-side positions tied to this session.</p>
        </article>
      </section>

      <PortfolioClaimsSurface auctions={liveAuctions} />

      <nav className="portfolio-anchor-nav" aria-label="Portfolio sections">
        <a className="filter-chip" href="#portfolio-claims">
          Claims
        </a>
        <a className="filter-chip" href="#portfolio-activity">
          Activity
        </a>
        <a className="filter-chip" href="#portfolio-auctions">
          My Auctions
        </a>
        <a className="filter-chip" href="#portfolio-bids">
          My Bids
        </a>
      </nav>

      <section className="portfolio-grid portfolio-grid--single">
        <article className="detail-card portfolio-section-card" id="portfolio-activity">
          <div className="section-header">
            <div>
              <p className="eyebrow">Activity</p>
              <h2 className="detail-title portfolio-section-card__title">Stay oriented without reading everything.</h2>
            </div>
            <StatusPill label="Recent" tone="neutral" />
          </div>

          <div className="activity-list">
            {operations.activity.map((item) => (
              <div key={item.id} className="activity-row">
                <div className="activity-row__copy">
                  <span className="signal-label">{item.timestamp}</span>
                  <h3 className="activity-row__title">{item.title}</h3>
                  <p className="activity-row__detail">{item.detail}</p>
                </div>
                <StatusPill label={getActivityToneLabel(item.tone)} tone={item.tone} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="portfolio-grid">
        <article className="detail-card portfolio-section-card" id="portfolio-auctions">
          <div className="section-header">
            <div>
              <p className="eyebrow">My auctions</p>
              <h2 className="detail-title portfolio-section-card__title">Your sell-side positions.</h2>
            </div>
            <StatusPill label={`${operations.createdAuctions.length} lots`} tone="neutral" />
          </div>

          <div className="portfolio-auction-list">
            {operations.createdAuctions.map((auction) => (
              <Link key={auction.id} className="portfolio-auction-card" href={`/marketplace/${auction.id}`}>
                <div className="portfolio-auction-card__media">
                  <img className="portfolio-auction-card__image" src={auction.artwork.src} alt={auction.artwork.alt} loading="lazy" />
                </div>
                <div className="portfolio-auction-card__body">
                  <div className="portfolio-auction-card__head">
                    <div>
                      <span className="signal-label">{auction.collection}</span>
                      <h3 className="portfolio-auction-card__title">{auction.title}</h3>
                    </div>
                    <StatusPill label={getAuctionStatusLabel(auction.state)} tone={getAuctionStatusTone(auction.state)} />
                  </div>
                  <p className="portfolio-auction-card__copy">{auction.settlementNote}</p>
                  <div className="portfolio-auction-card__foot">
                    <span>{auction.timeLabel}</span>
                    <strong>{auction.nextActions[0]}</strong>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </article>

        <article className="detail-card portfolio-section-card" id="portfolio-bids">
          <div className="section-header">
            <div>
              <p className="eyebrow">My bids</p>
              <h2 className="detail-title portfolio-section-card__title">The lots you are still tracking.</h2>
            </div>
            <StatusPill label={`${operations.participations.length} lots`} tone="neutral" />
          </div>

          <div className="portfolio-auction-list">
            {operations.participations.map((auction) => (
              <Link key={auction.id} className="portfolio-auction-card" href={`/marketplace/${auction.id}`}>
                <div className="portfolio-auction-card__media">
                  <img className="portfolio-auction-card__image" src={auction.artwork.src} alt={auction.artwork.alt} loading="lazy" />
                </div>
                <div className="portfolio-auction-card__body">
                  <div className="portfolio-auction-card__head">
                    <div>
                      <span className="signal-label">{auction.lotLabel}</span>
                      <h3 className="portfolio-auction-card__title">{auction.title}</h3>
                    </div>
                    <StatusPill label={getAuctionStatusLabel(auction.state)} tone={getAuctionStatusTone(auction.state)} />
                  </div>
                  <p className="portfolio-auction-card__copy">{auction.bidLaneLabel}</p>
                  <div className="portfolio-auction-card__foot">
                    <span>{auction.timeLabel}</span>
                    <strong>{auction.nextActions[0]}</strong>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
