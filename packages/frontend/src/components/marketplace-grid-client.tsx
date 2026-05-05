"use client";

import Link from "next/link";

import { AuctionCard } from "@/components/auction-card";
import { StatusPill } from "@/components/status-pill";
import type { AuctionRecord } from "@/lib/auctions";

type MarketplaceGridClientProps = {
  auctions: AuctionRecord[];
};

export function MarketplaceGridClient({ auctions }: MarketplaceGridClientProps) {
  return (
    <section className="auction-grid">
      {auctions.length > 0 ? (
        auctions.map((auction) => <AuctionCard key={auction.id} auction={auction} />)
      ) : (
        <article className="empty-state">
          <StatusPill label="No lots in this slice" tone="warning" />
          <h2 className="placeholder-title">This desk is quiet right now.</h2>
          <p className="placeholder-copy">
            Change the filter or create a new sealed-bid prototype auction to see more activity here.
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
  );
}
