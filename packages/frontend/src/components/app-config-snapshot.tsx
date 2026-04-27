"use client";

import { StatusPill } from "@/components/status-pill";
import { appConfig } from "@/lib/app-config";
import { useRuntimeReadiness } from "@/hooks/use-runtime-readiness";

export function AppConfigSnapshot() {
  const runtime = useRuntimeReadiness();

  return (
    <section className="section-block">
      <div className="section-header">
        <div>
          <p className="eyebrow">Environment Snapshot</p>
          <h2 className="section-title">Current frontend runtime wiring</h2>
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
            <li>Coprocessor: {appConfig.coprocessor.name}</li>
          </ul>
        </article>
        <article className="config-card">
          <span className="config-label">Contracts</span>
          <strong className="config-value">{runtime.registryLabel}</strong>
          <ul>
            <li>Market proxy: {appConfig.contracts.marketProxyAddress || "Not set"}</li>
            <li>Settlement engine: {appConfig.contracts.settlementEngineAddress || "Not set"}</li>
            <li>Slashed pot: {appConfig.contracts.slashedPotAddress || "Not set"}</li>
            <li>AVS relay: {appConfig.contracts.avsAddress || "Not set"}</li>
          </ul>
          <StatusPill label={runtime.registryTone === "success" ? "Bytecode verified" : "Runtime probe active"} tone={runtime.registryTone} pulse={runtime.registryTone === "success"} />
        </article>
        <article className="config-card">
          <span className="config-label">Proof lane</span>
          <strong className="config-value">{runtime.avsLabel}</strong>
          <ul>
            <li>{runtime.avsNote}</li>
            <li>{runtime.coprocessor.note}</li>
            <li>
              <a href={appConfig.coprocessor.referenceUrl} rel="noreferrer" target="_blank">
                Open Fhenix coprocessor reference
              </a>
            </li>
          </ul>
        </article>
      </div>
    </section>
  );
}
