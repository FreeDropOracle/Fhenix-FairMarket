import { appConfig } from "@/lib/app-config";

export function AppConfigSnapshot() {
  return (
    <section className="section-block">
      <div className="section-header">
        <div>
          <p className="eyebrow">Environment Snapshot</p>
          <h2 className="section-title">Current frontend foundation wiring</h2>
        </div>
      </div>
      <div className="config-grid">
        <article className="config-card">
          <span className="config-label">Network</span>
          <strong className="config-value">{appConfig.chain.name}</strong>
          <ul>
            <li>Chain ID: {appConfig.chain.id}</li>
            <li>Switch target: {appConfig.chain.hexId}</li>
            <li>Explorer: {appConfig.chain.blockExplorerUrl}</li>
          </ul>
        </article>
        <article className="config-card">
          <span className="config-label">Contracts</span>
          <strong className="config-value">{appConfig.contracts.ready ? "Configured" : "Pending deployment values"}</strong>
          <ul>
            <li>Market proxy: {appConfig.contracts.marketProxyAddress || "Not set"}</li>
            <li>Settlement engine: {appConfig.contracts.settlementEngineAddress || "Not set"}</li>
            <li>Slashed pot: {appConfig.contracts.slashedPotAddress || "Not set"}</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
