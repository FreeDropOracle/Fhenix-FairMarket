import Link from "next/link";

import { StatusPill } from "@/components/status-pill";

const intakeChecklist = [
  "Select the NFT already approved for market custody.",
  "Confirm the seller-side deposit amount.",
  "Choose a closing window that gives keepers enough time to finalize."
] as const;

const configurationChecklist = [
  "Opening bid stays visible; bid values stay confidential.",
  "Sepolia is the only supported app network in this first release.",
  "Settlement continues privately after the auction closes."
] as const;

const summarySignals = [
  { label: "Custody", value: "NFT approval required before launch" },
  { label: "Closing flow", value: "The auction closes automatically at expiry" },
  { label: "Claim surface", value: "Refunds, seller proceeds, and asset claims remain unified later" }
] as const;

export default function CreateAuctionPage() {
  return (
    <main className="page-grid create-shell">
      <section className="section-block create-hero">
        <div>
          <p className="eyebrow">Create auction</p>
          <h1 className="section-title">Launch the next confidential lot without over-explaining it.</h1>
          <p className="section-note create-hero__copy">
            Set the asset, the opening bid, and the closing window. The screen stays focused on the details the
            seller actually needs.
          </p>
        </div>
        <div className="create-hero__actions">
          <StatusPill label="Sepolia only" tone="success" />
          <Link className="secondary-action" href="/marketplace">
            Back to marketplace
          </Link>
        </div>
      </section>

      <section className="create-grid">
        <article className="detail-card create-form-card">
          <p className="eyebrow">Asset intake</p>
          <div className="field-grid">
            <label className="field-block">
              <span className="field-label">NFT contract</span>
              <input className="field-input" defaultValue="0x..." placeholder="0x..." />
            </label>
            <label className="field-block">
              <span className="field-label">Token ID</span>
              <input className="field-input" defaultValue="91" />
            </label>
            <label className="field-block">
              <span className="field-label">Auction label</span>
              <input className="field-input" defaultValue="Aurora Vault / Lot 091" />
            </label>
            <label className="field-block">
              <span className="field-label">Collection context</span>
              <input className="field-input" defaultValue="Cipher Relics" />
            </label>
          </div>
          <ul className="signal-list">
            {intakeChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="detail-card create-form-card">
          <p className="eyebrow">Auction configuration</p>
          <div className="field-grid">
            <label className="field-block">
              <span className="field-label">Opening bid</span>
              <input className="field-input" defaultValue="0.10 ETH" />
            </label>
            <label className="field-block">
              <span className="field-label">Seller deposit</span>
              <input className="field-input" defaultValue="1.00 ETH" />
            </label>
            <label className="field-block">
              <span className="field-label">Auction duration</span>
              <select className="field-input" defaultValue="24h">
                <option value="12h">12 hours</option>
                <option value="24h">24 hours</option>
                <option value="48h">48 hours</option>
              </select>
            </label>
            <label className="field-block">
              <span className="field-label">Settlement policy</span>
              <select className="field-input" defaultValue="standard">
                <option value="standard">Standard async settlement</option>
                <option value="guarded">Guarded settlement window</option>
              </select>
            </label>
          </div>
          <ul className="signal-list">
            {configurationChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="create-grid">
        <article className="detail-card create-summary-card">
          <p className="eyebrow">Launch summary</p>
          <div className="summary-signal-grid">
            {summarySignals.map((signal) => (
              <div key={signal.label} className="signal-card">
                <span className="signal-label">{signal.label}</span>
                <strong className="signal-value">{signal.value}</strong>
              </div>
            ))}
          </div>
          <div className="hero-actions">
            <button className="primary-action create-launch-button" type="button" disabled>
              Listing submission opens with wallet confirmation
            </button>
            <Link className="secondary-action" href="/portfolio">
              Open portfolio
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
