export default function AboutPage() {
  return (
    <main className="page-grid">
      <section className="section-block section-block--compact">
        <div className="section-header">
          <div>
            <p className="eyebrow">About the experience</p>
            <h1 className="section-title">A cleaner way to move through confidential auctions.</h1>
          </div>
          <p className="section-note">
            This application keeps the flow direct: browse auctions, act when ready, and understand what comes next
            without reading through protocol-heavy screens.
          </p>
        </div>
        <div className="about-grid">
          <article className="detail-card">
            <span className="detail-label">Design stance</span>
            <h2 className="detail-title">Focused, calm, and readable.</h2>
            <p className="detail-copy">
              Only the information needed for the current decision stays visible. The goal is confidence and clarity,
              not crowded screens.
            </p>
          </article>
          <article className="detail-card">
            <span className="detail-label">Wallet stance</span>
            <h2 className="detail-title">Direct connection with clear network guidance.</h2>
            <p className="detail-copy">
              Wallet actions stay straightforward, and the interface tells the user exactly when a network switch is
              needed before continuing.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
