import Link from "next/link";

import { HeroCrest } from "@/components/brand-lockup";
import { ReadinessPanel } from "@/components/readiness-panel";
import { RouteCard } from "@/components/route-card";

const routeCards = [
  {
    href: "/marketplace",
    kicker: "Marketplace Core",
    title: "Auction Desk",
    description: "Marketplace listing, state-aware auction cards, and detailed views are now the active build surface.",
    badge: "Task 5.2"
  },
  {
    href: "/portfolio",
    kicker: "User Operations",
    title: "Portfolio & Claims",
    description: "A single place for participations, refunds, seller proceeds, and asset claims.",
    badge: "Task 5.4"
  },
  {
    href: "/governance",
    kicker: "Protocol Trust",
    title: "Reliability Layer",
    description: "Status, governance posture, and delayed-settlement messaging will live here.",
    badge: "Task 5.5"
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
            <Link className="primary-action" href="/marketplace">
              Open Auction Desk
            </Link>
            <Link className="secondary-action" href="/about">
              Review Foundation
            </Link>
          </div>
          <div className="hero-signal-grid">
            <div className="signal-card">
              <span className="signal-label">Initial network</span>
              <strong className="signal-value">Sepolia only</strong>
            </div>
            <div className="signal-card">
              <span className="signal-label">Current scope</span>
              <strong className="signal-value">Task 5.2 auction desk</strong>
            </div>
            <div className="signal-card">
              <span className="signal-label">Visual direction</span>
              <strong className="signal-value">Dark-first tribunal UX</strong>
            </div>
          </div>
        </div>
      </section>

      <ReadinessPanel />

      <section className="section-block">
        <div className="section-header">
          <div>
            <p className="eyebrow">Phase 5.1 Routing Surface</p>
            <h2 className="section-title">Foundation routes are wired and ready.</h2>
          </div>
          <p className="section-note">
            The shell is stable. Marketplace Core is now filling it with real flows while keeping the same visual posture.
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
