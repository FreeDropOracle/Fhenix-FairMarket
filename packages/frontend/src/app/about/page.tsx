import { AppConfigSnapshot } from "@/components/app-config-snapshot";

export default function AboutPage() {
  return (
    <main className="page-grid">
      <section className="section-block section-block--compact">
        <div className="section-header">
          <div>
            <p className="eyebrow">Phase 5 Foundation</p>
            <h1 className="section-title">Application posture</h1>
          </div>
          <p className="section-note">
            The public landing page stays separate. This package is the product shell that will host the
            auction application itself.
          </p>
        </div>
        <div className="about-grid">
          <article className="detail-card">
            <span className="detail-label">Design stance</span>
            <h2 className="detail-title">Dark-first, premium, minimal guidance.</h2>
            <p className="detail-copy">
              We intentionally show only the information that matters at each step. The goal is a calm,
              high-trust cryptographic product, not a documentation wall.
            </p>
          </article>
          <article className="detail-card">
            <span className="detail-label">Wallet stance</span>
            <h2 className="detail-title">Direct connection with a strict Sepolia guard.</h2>
            <p className="detail-copy">
              The foundation supports injected wallets, explicit network mismatch messaging, and direct
              switch-to-Sepolia prompts from inside the shell.
            </p>
          </article>
        </div>
      </section>

      <AppConfigSnapshot />
    </main>
  );
}
