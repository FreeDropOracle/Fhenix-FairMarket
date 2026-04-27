import { appConfig } from "@/lib/app-config";
import { HeroCrest } from "@/components/brand-lockup";
import { HeroRuntimeSignals } from "@/components/hero-runtime-signals";
import { ReadinessPanel } from "@/components/readiness-panel";
import { RouteCard } from "@/components/route-card";

const routeCards = [
  {
    href: "/marketplace",
    kicker: "Execution Surface",
    title: "Live Auctions Terminal",
    description: "Marketplace listing, state-aware auction cards, and detailed views are now the active build surface.",
    badge: "Auctions live"
  },
  {
    href: "/portfolio",
    kicker: "User Operations",
    title: "Claim & Settlement Hub",
    description: "A single place for participations, refunds, seller proceeds, and asset claims.",
    badge: "Claims ready"
  },
  {
    href: "/governance",
    kicker: "Protocol Trust",
    title: "Safety Dead-man's Switch",
    description: "Status, governance posture, and delayed-settlement messaging will live here.",
    badge: "Reliability live"
  }
] as const;

export default function HomePage() {
  return (
    <main className="page-grid">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Sepolia-First Confidential Auction Application</p>
          <div className="hero-headline">
            <h1 className="hero-title">Math-Based Integrity, operationalized.</h1>
            <HeroCrest />
          </div>
          <p className="hero-summary">
            The public landing page introduces the protocol. This application layer focuses on execution:
            wallet readiness, confidential bidding, escrow orchestration, and clear operational states.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="/marketplace">
              Open Auction Desk
            </a>
            <a className="secondary-action" href={appConfig.docs.foundationUrl} rel="noreferrer" target="_blank">
              Review Foundation
            </a>
          </div>
          <HeroRuntimeSignals />
        </div>
      </section>

      <ReadinessPanel />

      <section className="section-block">
        <div className="section-header">
          <div>
            <p className="eyebrow">Operational Routes</p>
            <h2 className="section-title">Execution surfaces are wired and named for users.</h2>
          </div>
          <p className="section-note">
            The shell is stable. Each route now reads like a live service instead of an internal task tracker.
          </p>
        </div>
        <div className="route-grid">
          {routeCards.map((card) => (
            <RouteCard key={card.href} {...card} />
          ))}
        </div>
      </section>
    </main>
  );
}
