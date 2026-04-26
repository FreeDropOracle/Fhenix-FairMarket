import Link from "next/link";

import { AuctionCard } from "@/components/auction-card";
import { StatusPill } from "@/components/status-pill";
import {
  auctionSortOptions,
  auctionStateOptions,
  filterAuctions,
  getMarketplaceStats,
  listAuctions,
  sortAuctions,
  type AuctionSortKey,
  type AuctionStateFilter
} from "@/lib/auctions";

type MarketplacePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function normalizeStateFilter(value: string | string[] | undefined): AuctionStateFilter {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (auctionStateOptions.some((option) => option.value === candidate)) {
    return candidate as AuctionStateFilter;
  }

  return "all";
}

function normalizeSortKey(value: string | string[] | undefined): AuctionSortKey {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (auctionSortOptions.some((option) => option.value === candidate)) {
    return candidate as AuctionSortKey;
  }

  return "ending";
}

function buildMarketplaceHref(state: AuctionStateFilter, sort: AuctionSortKey) {
  const params = new URLSearchParams();

  if (state !== "all") {
    params.set("state", state);
  }

  if (sort !== "ending") {
    params.set("sort", sort);
  }

  const query = params.toString();
  return query.length > 0 ? `/marketplace?${query}` : "/marketplace";
}

export default async function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const params = (await searchParams) ?? {};
  const activeState = normalizeStateFilter(params.state);
  const activeSort = normalizeSortKey(params.sort);
  const records = listAuctions();
  const stats = getMarketplaceStats(records);
  const filtered = filterAuctions(records, activeState);
  const auctions = sortAuctions(filtered, activeSort);

  return (
    <main className="page-grid marketplace-shell">
      <section className="marketplace-hero">
        <div className="marketplace-hero__copy">
          <p className="eyebrow">Task 5.2 / Marketplace Core</p>
          <h1 className="hero-title marketplace-hero__title">Confidential auction desks, without the noise.</h1>
          <p className="hero-summary">
            This surface is focused on execution: browse lots, inspect settlement posture, and move toward
            escrow or bidding without dragging the user through protocol theory.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" href="/marketplace/create">
              Create auction
            </Link>
            <Link className="secondary-action" href="/portfolio">
              Open portfolio
            </Link>
          </div>
        </div>
        <div className="marketplace-overview-grid">
          {stats.map((stat) => (
            <article key={stat.label} className="marketplace-overview-card">
              <span className="signal-label">{stat.label}</span>
              <strong className="marketplace-overview-card__value">{stat.value}</strong>
              <p className="marketplace-overview-card__note">{stat.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-header">
          <div>
            <p className="eyebrow">Auction desk controls</p>
            <h2 className="section-title">Filter the surface, then drop into the right lot.</h2>
          </div>
          <div className="marketplace-toolbar__summary">
            <StatusPill
              label={activeState === "all" ? "All desks visible" : `${activeState} desk`}
              tone={activeState === "all" ? "neutral" : activeState === "resolving" ? "warning" : activeState === "voided" ? "danger" : "success"}
            />
            <p className="section-note">
              {auctions.length} lot{auctions.length === 1 ? "" : "s"} surfaced with the current filter.
            </p>
          </div>
        </div>

        <div className="marketplace-toolbar">
          <div className="filter-group">
            <span className="filter-group__label">Desk state</span>
            <div className="filter-group__items">
              {auctionStateOptions.map((option) => (
                <Link
                  key={option.value}
                  className="filter-chip"
                  data-active={activeState === option.value}
                  href={buildMarketplaceHref(option.value, activeSort)}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-group__label">Sort by</span>
            <div className="filter-group__items">
              {auctionSortOptions.map((option) => (
                <Link
                  key={option.value}
                  className="filter-chip"
                  data-active={activeSort === option.value}
                  href={buildMarketplaceHref(activeState, option.value)}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="auction-grid">
        {auctions.length > 0 ? (
          auctions.map((auction) => <AuctionCard key={auction.id} auction={auction} />)
        ) : (
          <article className="empty-state">
            <StatusPill label="No lots in this slice" tone="warning" />
            <h2 className="placeholder-title">This desk is quiet right now.</h2>
            <p className="placeholder-copy">
              Shift the state filter or open the create-auction route to keep building the next confidential
              listing surface.
            </p>
            <div className="hero-actions">
              <Link className="secondary-action" href="/marketplace">
                Reset filters
              </Link>
              <Link className="primary-action" href="/marketplace/create">
                Create auction
              </Link>
            </div>
          </article>
        )}
      </section>
    </main>
  );
}
