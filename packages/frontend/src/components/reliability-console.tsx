"use client";

import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import {
  mobileReadinessPoints,
  protocolSignals,
  recoveryPlaybooks,
  settlementScenarios
} from "@/lib/reliability";

export function ReliabilityConsole() {
  const wallet = useWallet();

  const primaryRecoveryState = !wallet.hasProvider
    ? {
        title: "Wallet not installed",
        tone: "danger" as const,
        body: "The safest next step is to install a wallet before trying to bid, claim, or create an auction."
      }
    : !wallet.isConnected
      ? {
          title: "Wallet not connected",
          tone: "warning" as const,
          body: "Connect first, then the interface can unlock bidding, claims, and seller actions."
        }
      : !wallet.isSupportedNetwork
        ? {
            title: "Wrong network detected",
            tone: "warning" as const,
            body: "Switch to Sepolia before continuing so the action buttons stay reliable."
          }
        : {
            title: "Session ready",
            tone: "success" as const,
            body: "Wallet and network are aligned, so the next action can stay simple."
          };

  return (
    <main className="page-grid reliability-shell">
      <section className="reliability-hero">
        <div>
          <p className="eyebrow">Recovery guidance</p>
          <h1 className="section-title">If something slows down, the next safe action stays clear.</h1>
          <p className="section-note reliability-hero__copy">
            This route keeps support language calm and direct when a wallet is missing, the network is wrong, or an
            auction takes longer than expected to settle.
          </p>
        </div>

        <article className="reliability-priority-card">
          <span className="signal-label">Primary recovery step</span>
          <h2 className="reliability-priority-card__title">{primaryRecoveryState.title}</h2>
          <p className="reliability-priority-card__copy">{primaryRecoveryState.body}</p>
          <StatusPill
            label={
              primaryRecoveryState.tone === "success"
                ? "Operational"
                : primaryRecoveryState.tone === "warning"
                  ? "Needs attention"
                  : "Blocked"
            }
            tone={primaryRecoveryState.tone}
          />
        </article>
      </section>

      <section className="portfolio-grid">
        <article className="detail-card portfolio-section-card">
          <p className="eyebrow">At a glance</p>
          <h2 className="detail-title portfolio-section-card__title">Signals users can trust</h2>
          <div className="claims-list">
            {protocolSignals.map((signal) => (
              <article key={signal.label} className="claim-card">
                <div className="claim-card__head">
                  <div>
                    <span className="signal-label">{signal.label}</span>
                    <h3 className="claim-card__title">{signal.value}</h3>
                  </div>
                  <StatusPill
                    label={
                      signal.tone === "success"
                        ? "Stable"
                        : signal.tone === "warning"
                          ? "Guarded"
                          : signal.tone === "danger"
                            ? "Critical"
                            : "Context"
                    }
                    tone={signal.tone}
                  />
                </div>
                <p className="claim-card__copy">{signal.note}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="portfolio-grid">
        <article className="detail-card portfolio-section-card">
          <p className="eyebrow">Recovery playbooks</p>
          <h2 className="detail-title portfolio-section-card__title">What the interface should say next</h2>
          <div className="activity-list">
            {recoveryPlaybooks.map((playbook) => (
              <div key={playbook.id} className="activity-row">
                <div className="activity-row__copy">
                  <span className="signal-label">{playbook.trigger}</span>
                  <h3 className="activity-row__title">{playbook.title}</h3>
                  <p className="activity-row__detail">{playbook.detail}</p>
                  <p className="reliability-recovery-action">{playbook.action}</p>
                </div>
                <StatusPill
                  label={
                    playbook.tone === "success"
                      ? "Stable"
                      : playbook.tone === "warning"
                        ? "Recover"
                        : playbook.tone === "danger"
                          ? "Block"
                          : "Guide"
                  }
                  tone={playbook.tone}
                />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="portfolio-grid">
        <article className="detail-card portfolio-section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Delayed settlement UX</p>
              <h2 className="detail-title portfolio-section-card__title">When resolving takes longer than expected</h2>
            </div>
            <Link className="secondary-action portfolio-inline-action" href="/marketplace">
              Open auction desk
            </Link>
          </div>
          <div className="reliability-scenario-list">
            {settlementScenarios.map((scenario) => (
              <article key={scenario.id} className="reliability-scenario-card">
                <div className="reliability-scenario-card__head">
                  <div>
                    <span className="signal-label">{scenario.windowLabel}</span>
                    <h3 className="claim-card__title">{scenario.title}</h3>
                  </div>
                  <StatusPill label={scenario.statusLabel} tone={scenario.tone} />
                </div>
                <p className="claim-card__copy">{scenario.detail}</p>
                <p className="reliability-scenario-card__action">{scenario.operatorAction}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="detail-card portfolio-section-card">
          <p className="eyebrow">Mobile experience</p>
          <h2 className="detail-title portfolio-section-card__title">Reliability on smaller screens</h2>
          <div className="reliability-mobile-grid">
            {mobileReadinessPoints.map((point) => (
              <article key={point.id} className="reliability-mobile-card">
                <h3 className="claim-card__title">{point.title}</h3>
                <p className="claim-card__copy">{point.detail}</p>
              </article>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
