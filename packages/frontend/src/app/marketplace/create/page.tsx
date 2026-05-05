import Link from "next/link";

import { CreateAuctionForm } from "@/components/create-auction-form";
import { StatusPill } from "@/components/status-pill";

export default function CreateAuctionPage() {
  return (
    <main className="page-grid create-shell">
      <section className="section-block create-hero">
        <div>
          <p className="eyebrow">Create auction</p>
          <h1 className="section-title">Create a sealed-bid prototype lot in four calm steps.</h1>
          <p className="section-note create-hero__copy">
            Start with the NFT, choose the duration, confirm the seller deposit, then review the transaction before it
            moves on chain.
          </p>
        </div>
        <div className="create-hero__actions">
          <StatusPill label="Guided flow" tone="success" />
          <Link className="secondary-action" href="/marketplace">
            Back to marketplace
          </Link>
        </div>
      </section>

      <CreateAuctionForm />
    </main>
  );
}
