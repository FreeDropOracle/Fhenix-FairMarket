import { appConfig } from "@/lib/app-config";
import { HeroCrest } from "@/components/brand-lockup";
import { RouteCard } from "@/components/route-card";

const routeCards = [
  {
    href: "/marketplace",
    kicker: "Marketplace",
    title: "Confidential auctions",
    description: "Browse active lots, inspect each auction clearly, and move toward escrow or bidding from one place.",
    badge: "Open now"
  },
  {
    href: "/portfolio",
    kicker: "Portfolio",
    title: "Claims and activity",
    description: "Follow your auctions, claim what is yours, and keep recent actions within reach.",
    badge: "Personal view"
  },
  {
    href: "/governance",
    kicker: "Support",
    title: "Recovery guidance",
    description: "If settlement takes longer than expected, this route explains the next safe action in plain language.",
    badge: "Help route"
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
            Browse confidential auctions, manage claims, and move through each step with a calmer interface that
            stays focused on the action in front of you.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="/marketplace">
              Open marketplace
            </a>
            <a className="secondary-action" href="/portfolio">
              Open portfolio
            </a>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-header">
          <div>
            <p className="eyebrow">Core Routes</p>
            <h2 className="section-title">Everything important stays one click away.</h2>
          </div>
          <p className="section-note">
            Choose the route that matches what you want to do now: browse, claim, or check what to do next.
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
