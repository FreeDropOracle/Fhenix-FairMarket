"use client";

import { StatusPill } from "@/components/status-pill";
import { appConfig } from "@/lib/app-config";
import { useRuntimeReadiness } from "@/hooks/use-runtime-readiness";

export function ReadinessPanel() {
  const runtime = useRuntimeReadiness();

  const readinessCards = [
    {
      key: "shell",
      title: "Application shell",
      copy: "Routing, navigation, and the live product shell are already stable enough to host execution surfaces.",
      tone: "success" as const,
      label: "Live"
    },
    {
      key: "wallet",
      title: "Wallet handshake",
      copy: runtime.walletNote,
      tone: runtime.walletTone,
      label:
        runtime.walletTone === "success"
          ? "Bound"
          : runtime.walletTone === "warning"
            ? "Awaiting action"
            : "Wallet missing"
    },
    {
      key: "contracts",
      title: "Contract registry",
      copy: runtime.registryNote,
      tone: runtime.registryTone,
      label:
        runtime.registryTone === "success"
          ? "Verified"
          : runtime.registryTone === "warning"
            ? "Verifying"
            : "Blocked"
    },
    {
      key: "coprocessor",
      title: appConfig.coprocessor.name,
      copy: runtime.coprocessor.note,
      tone: runtime.coprocessor.tone,
      label: runtime.coprocessor.live ? "Monitored" : runtime.coprocessor.label
    },
    {
      key: "avs",
      title: "AVS verification engine",
      copy: runtime.avsNote,
      tone: runtime.avsTone,
      label: runtime.avsTone === "success" ? "Fraud proofs armed" : "Awaiting checkpoint"
    }
  ] as const;

  return (
    <section className="readiness-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Runtime Readiness</p>
          <h2 className="section-title">Operational checks in one glance.</h2>
        </div>
        <p className="section-note">
          This layer now binds live wallet posture, contract registry checks, and proof-lane context instead of
          repeating build-task names.
        </p>
      </div>
      <div className="readiness-grid">
        {readinessCards.map((card) => (
          <article key={card.key} className="readiness-card">
            <div className="readiness-head">
              <h3 className="readiness-title">{card.title}</h3>
              <StatusPill tone={card.tone} label={card.label} pulse={card.tone === "success"} />
            </div>
            <p className="readiness-copy">{card.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
