import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { appConfig, formatAddress } from "@/lib/app-config";

const docsUrl = "https://doc-fhenix-fair-market.vercel.app/";
const repositoryUrl = "https://github.com/FreeDropOracle/Fhenix-FairMarket";

const principles = [
  {
    label: "Private bidding",
    title: "Price discovery without public bid ladders",
    body: "Bids stay sealed until the protocol can settle the lot, which reduces unnecessary signaling during the auction window."
  },
  {
    label: "Action-first UX",
    title: "The next safe action stays visible",
    body: "Portfolio, marketplace, and settlement routes are organized around what the user can do next rather than protocol jargon."
  },
  {
    label: "Single-network release",
    title: "Sepolia-first by design",
    body: "One supported chain keeps wallet guidance, recovery language, and contract references predictable while the product hardens."
  }
] as const;

const trustLinks = [
  {
    label: "Documentation",
    title: "Read the product and deployment notes",
    href: docsUrl,
    body: "Use the docs for architecture context, release notes, and deployment guidance."
  },
  {
    label: "Repository",
    title: "Inspect the code on GitHub",
    href: repositoryUrl,
    body: "Browse the frontend, contracts, keeper flows, and the privacy milestones that shaped this release."
  },
  {
    label: "Explorer",
    title: "Open the Sepolia contract footprint",
    href: `${appConfig.chain.blockExplorerUrl}/address/${appConfig.contracts.marketProxyAddress}`,
    body: "The market proxy stays visible on the block explorer so users can verify the release target directly."
  },
  {
    label: "Compatibility",
    title: "Check the coprocessor reference",
    href: appConfig.coprocessor.referenceUrl,
    body: "The Fhenix compatibility reference explains the CoFHE context surrounding the prototype settlement path."
  }
] as const;

export default function AboutPage() {
  return (
    <main className="page-grid about-shell">
      <section className="about-hero">
        <div className="about-hero__copy">
          <p className="eyebrow">About</p>
          <h1 className="section-title">Sealed-bid prototypes, explained without the noise.</h1>
          <p className="section-note about-hero__note">
            Fhenix-FairMarket is a privacy-first auction desk designed to feel calm, legible, and trustworthy even
            when the underlying protocol path is complex.
          </p>

          <div className="hero-actions about-hero__actions">
            <Link className="primary-action" href="/marketplace">
              Explore auctions
            </Link>
            <Link className="secondary-action" href="/governance">
              Open governance
            </Link>
          </div>
        </div>

        <article className="about-trust-card">
          <div className="about-trust-card__head">
            <div>
              <span className="signal-label">Release posture</span>
              <h2 className="about-trust-card__title">One coherent route from browse to claim</h2>
            </div>
            <StatusPill label={appConfig.contracts.ready ? "Sepolia ready" : "Config in review"} tone={appConfig.contracts.ready ? "success" : "warning"} />
          </div>

          <p className="about-trust-card__copy">
            The product is intentionally narrowed around a single chain, portfolio-first claims, and a vault-like
            interface so the user sees fewer moving parts at once.
          </p>

          <div className="about-trust-grid">
            <article className="about-trust-item">
              <span className="signal-label">Market proxy</span>
              <strong>{formatAddress(appConfig.contracts.marketProxyAddress)}</strong>
            </article>
            <article className="about-trust-item">
              <span className="signal-label">Settlement engine</span>
              <strong>{formatAddress(appConfig.contracts.settlementEngineAddress)}</strong>
            </article>
            <article className="about-trust-item">
              <span className="signal-label">AVS surface</span>
              <strong>{formatAddress(appConfig.contracts.avsAddress)}</strong>
            </article>
          </div>
        </article>
      </section>

      <section className="about-section-grid">
        <article className="detail-card about-editorial-card">
          <p className="eyebrow">Mission</p>
          <h2 className="detail-title about-editorial-card__title">Privacy should improve market behavior, not hide the interface.</h2>
          <div className="about-editorial-card__copy">
            <p className="detail-copy">
              This product exists to make sealed-bid auctions feel operationally calm. The goal is not to expose every
              protocol concept on first contact, but to make each action legible: browse, bid, wait, settle, and
              claim.
            </p>
            <p className="detail-copy">
              That is why the interface now centers around quiet surfaces, wallet-aware routes, and portfolio-first
              outcomes instead of noisy dashboards or speculative price theater.
            </p>
          </div>
        </article>

        <article className="detail-card about-editorial-card">
          <p className="eyebrow">Why sealed bids</p>
          <h2 className="detail-title about-editorial-card__title">The product thesis in three simple ideas.</h2>
          <div className="about-principles">
            {principles.map((principle) => (
              <article key={principle.label} className="about-principle">
                <span className="signal-label">{principle.label}</span>
                <h3 className="claim-card__title">{principle.title}</h3>
                <p className="claim-card__copy">{principle.body}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="detail-card about-editorial-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Technical view</p>
            <h2 className="detail-title about-editorial-card__title">Optional depth for people who want the wiring.</h2>
          </div>
        </div>

        <div className="about-accordion-stack">
          <details className="about-accordion" open>
            <summary>
              <span>Release footprint</span>
              <span className="signal-label">Contracts</span>
            </summary>
            <div className="about-accordion__body">
              <p className="detail-copy">
                The current release centers on a market proxy, settlement engine, slashed pot, and AVS-facing path,
                all kept on Sepolia so state transitions remain understandable while the platform hardens.
              </p>
              <div className="about-trust-grid about-trust-grid--compact">
                <article className="about-trust-item">
                  <span className="signal-label">Market proxy</span>
                  <strong>{appConfig.contracts.marketProxyAddress}</strong>
                </article>
                <article className="about-trust-item">
                  <span className="signal-label">Settlement engine</span>
                  <strong>{appConfig.contracts.settlementEngineAddress}</strong>
                </article>
                <article className="about-trust-item">
                  <span className="signal-label">Slashed pot</span>
                  <strong>{appConfig.contracts.slashedPotAddress}</strong>
                </article>
              </div>
            </div>
          </details>

          <details className="about-accordion">
            <summary>
              <span>Prototype settlement context</span>
              <span className="signal-label">Reference</span>
            </summary>
            <div className="about-accordion__body">
              <p className="detail-copy">
                The live interface references the Fhenix coprocessor compatibility surface rather than forcing those
                details into every task screen. This keeps protocol depth available without crowding the primary user
                journey.
              </p>
              <p className="detail-copy">
                Current mode: <strong>{appConfig.coprocessor.mode}</strong>
              </p>
            </div>
          </details>
        </div>
      </section>

      <section className="detail-card about-editorial-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Trust links</p>
            <h2 className="detail-title about-editorial-card__title">The official places to verify what you see here.</h2>
          </div>
        </div>

        <div className="about-link-grid">
          {trustLinks.map((item) => (
            <a
              key={item.title}
              className="about-link-card"
              href={item.href}
              rel="noreferrer"
              target="_blank"
            >
              <span className="signal-label">{item.label}</span>
              <h3 className="claim-card__title">{item.title}</h3>
              <p className="claim-card__copy">{item.body}</p>
              <span className="about-link-card__cta">Open reference</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
