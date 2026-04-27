"use client";

import { StatusPill } from "@/components/status-pill";
import { appConfig } from "@/lib/app-config";
import { useRuntimeReadiness } from "@/hooks/use-runtime-readiness";

export function HeroRuntimeSignals() {
  const runtime = useRuntimeReadiness();

  return (
    <div className="hero-signal-grid">
      <div className="signal-card">
        <span className="signal-label">Settlement layer</span>
        <strong className="signal-value">Sepolia</strong>
        <div className="signal-inline-status">
          <span
            className="signal-inline-dot"
            data-tone={runtime.coprocessor.tone}
            data-pulse={runtime.coprocessor.live}
          />
          <span>{appConfig.coprocessor.name}</span>
        </div>
      </div>
      <div className="signal-card">
        <span className="signal-label">Service context</span>
        <strong className="signal-value">Live Auctions Terminal</strong>
        <span className="signal-copy">
          Overview, marketplace routing, and action surfaces now use user-facing service names instead of task markers.
        </span>
      </div>
      <div className="signal-card">
        <span className="signal-label">Visual direction</span>
        <strong className="signal-value">Dark-first tribunal UX</strong>
        <StatusPill
          label={runtime.verifiedContractCount > 0 ? `${runtime.verifiedContractCount}/${runtime.contractCount} contracts proven` : "Registry probe live"}
          tone={runtime.registryTone}
          pulse={runtime.registryTone === "success"}
        />
      </div>
    </div>
  );
}
