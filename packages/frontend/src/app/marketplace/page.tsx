import Link from "next/link";

import { MarketplaceGridShell } from "@/components/marketplace-grid-shell";
import { StatusPill } from "@/components/status-pill";
import {
  auctionSortOptions,
  auctionStateOptions,
  filterAuctions,
  sortAuctions,
  type AuctionSortKey,
  type AuctionStateFilter
} from "@/lib/auctions";
import { listMarketplaceAuctions } from "@/lib/marketplace-data";

export const dynamic = "force-dynamic";

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

const primaryMarketplaceViews = [
  {
    href: "/marketplace",
    label: "All",
    matches: (state: AuctionStateFilter, sort: AuctionSortKey) => state === "all" && sort === "ending"
  },
  {
    href: buildMarketplaceHref("active", "activity"),
    label: "Live",
    matches: (state: AuctionStateFilter, sort: AuctionSortKey) => state === "active" && sort === "activity"
  },
  {
    href: buildMarketplaceHref("active", "ending"),
    label: "Ending Soon",
    matches: (state: AuctionStateFilter, sort: AuctionSortKey) => state === "active" && sort === "ending"
  },
  {
    href: "/portfolio",
    label: "My Activity",
    matches: () => false
  }
] as const;

export default async function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const params = (await searchParams) ?? {};
  const activeState = normalizeStateFilter(params.state);
  const activeSort = normalizeSortKey(params.sort);
  const records = await listMarketplaceAuctions();
  const filtered = filterAuctions(records, activeState);
  const auctions = sortAuctions(filtered, activeSort);
  const activeViewLabel =
    primaryMarketplaceViews.find((view) => view.matches(activeState, activeSort))?.label ?? "Custom view";

  return (
    <main className="page-grid marketplace-shell">
      <section className="section-block section-block--compact marketplace-intro">
        <div className="marketplace-intro__head">
          <div>
            <p className="eyebrow">Marketplace</p>
            <h1 className="section-title marketplace-intro__title">Explore sealed-bid prototype lots without the clutter.</h1>
            <p className="section-note marketplace-intro__copy">
              Scan the active desk quickly, open the right lot, and keep deeper protocol detail tucked away until you
              actually need it.
            </p>
          </div>

          <div className="marketplace-intro__actions">
            <Link className="primary-action" href="/marketplace/create">
              Launch Auction
            </Link>
            <Link className="secondary-action" href="/portfolio">
              Open Portfolio
            </Link>
          </div>
        </div>
      </section>

      <section className="marketplace-toolbar marketplace-toolbar--catalog">
        <div className="marketplace-toolbar__rail">
          <div className="filter-group filter-group--primary">
            <div className="filter-group__items">
              {primaryMarketplaceViews.map((option) => (
                <Link
                  key={option.label}
                  className="filter-chip"
                  data-active={option.matches(activeState, activeSort)}
                  href={option.href}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="marketplace-toolbar__meta">
            <StatusPill
              label={activeViewLabel}
              tone={activeState === "all" ? "neutral" : activeState === "resolving" ? "warning" : activeState === "voided" ? "danger" : "success"}
            />
            <p className="marketplace-toolbar__count">
              {auctions.length} lot{auctions.length === 1 ? "" : "s"} ready
            </p>
            <details className="marketplace-advanced-filters">
              <summary>More filters</summary>
              <div className="marketplace-advanced-filters__grid">
                <div className="filter-group">
                  <span className="filter-group__label">Auction state</span>
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
            </details>
          </div>
        </div>
      </section>

      <MarketplaceGridShell auctions={auctions} />
    </main>
  );
}
