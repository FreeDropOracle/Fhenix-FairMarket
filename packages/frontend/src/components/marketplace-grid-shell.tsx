"use client";

import dynamic from "next/dynamic";

import type { AuctionRecord } from "@/lib/auctions";

const MarketplaceGridClient = dynamic(
  () => import("@/components/marketplace-grid-client").then((module) => module.MarketplaceGridClient),
  { ssr: false }
);

type MarketplaceGridShellProps = {
  auctions: AuctionRecord[];
};

export function MarketplaceGridShell({ auctions }: MarketplaceGridShellProps) {
  return <MarketplaceGridClient auctions={auctions} />;
}
