import Link from "next/link";

import { CreateAuctionForm } from "@/components/create-auction-form";
import { StatusPill } from "@/components/status-pill";

const summarySignals = [
  { label: "Network", value: "Sepolia" },
  { label: "Approval", value: "Requested automatically when needed" },
  { label: "Auction window", value: "1 minute to 3 months" }
] as const;

export default function CreateAuctionPage() {
  return (
    <main className="page-grid create-shell">
      <section className="section-block create-hero">
        <div>
          <p className="eyebrow">Create auction</p>
          <h1 className="section-title">Launch the next confidential lot without over-explaining it.</h1>
          <p className="section-note create-hero__copy">
            Enter the NFT contract, token ID, seller deposit, and a custom duration. The page will handle wallet
            connection, approval, and the auction transaction itself while keeping the duration inside the protocol
            bounds.
          </p>
        </div>
        <div className="create-hero__actions">
          <StatusPill label="Sepolia only" tone="success" />
          <Link className="secondary-action" href="/marketplace">
            Back to marketplace
          </Link>
        </div>
      </section>

      <CreateAuctionForm />

      <section className="create-grid">
        <article className="detail-card create-summary-card">
          <p className="eyebrow">Auction basics</p>
          <div className="summary-signal-grid">
            {summarySignals.map((signal) => (
              <div key={signal.label} className="signal-card">
                <span className="signal-label">{signal.label}</span>
                <strong className="signal-value">{signal.value}</strong>
              </div>
            ))}
          </div>
          <div className="hero-actions">
            <Link className="secondary-action" href="/portfolio">
              Open portfolio
            </Link>
            <Link className="secondary-action" href="/marketplace">
              Browse marketplace
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
