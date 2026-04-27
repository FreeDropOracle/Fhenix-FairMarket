"use client";

import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { appConfig } from "@/lib/app-config";
import { useRuntimeReadiness } from "@/hooks/use-runtime-readiness";
import {
  mobileReadinessPoints,
  protocolSignals,
  recoveryPlaybooks,
  settlementScenarios
} from "@/lib/reliability";

export function ReliabilityConsole() {
  const wallet = useWallet();
  const runtime = useRuntimeReadiness();

  const runtimeSignals = [
    {
      label: "Wallet session",
      value: runtime.walletValue,
      tone: runtime.walletTone,
      note: runtime.walletNote
    },
    {
      label: "Network posture",
      value: wallet.isSupportedNetwork ? appConfig.chain.name : wallet.chainName ?? appConfig.chain.name,
      tone: wallet.isConnected ? (wallet.isSupportedNetwork ? "success" : "warning") : "neutral",
      note: wallet.isConnected
        ? wallet.isSupportedNetwork
          ? "The session is already on the release network."
          : "The session is live but still off-network for this release."
        : "The UI defaults to a Sepolia-only release posture."
    },
    {
      label: "Contract registry",
      value: runtime.registryLabel,
      tone: runtime.registryTone,
      note: runtime.registryNote
    },
    {
      label: "Coprocessor bridge",
      value: runtime.coprocessor.live ? appConfig.coprocessor.name : runtime.coprocessor.label,
      tone: runtime.coprocessor.tone,
      note: runtime.coprocessor.note
    },
    {
      label: "AVS checkpoint",
      value: runtime.avsLabel,
      tone: runtime.avsTone,
      note: runtime.avsNote
    },
    {
      label: "Current route policy",
      value: "Trust-first recovery",
      tone: "neutral",
      note: "When the system is delayed, the UI should show the next safe user action before exposing internal complexity."
    }
  ] as const;

  const primaryRecoveryState = !wallet.hasProvider
    ? {
        title: "Wallet not installed",
        tone: "danger" as const,
        body: "Action routes should stay blocked and the user should be sent directly to wallet installation."
      }
    : !wallet.isConnected
      ? {
          title: "Wallet not connected",
          tone: "warning" as const,
          body: "Connection is the next safe step before any escrow, bid, or claim route appears."
        }
      : !wallet.isSupportedNetwork
        ? {
            title: "Wrong network detected",
            tone: "warning" as const,
            body: "The correct response is a one-click switch to Sepolia, not exposing unsupported actions."
          }
        : {
            title: "Session posture healthy",
            tone: "success" as const,
            body: "The runtime prerequisites for wallet and network are already satisfied."
          };

  return (
    <main className="page-grid reliability-shell">
      <section className="reliability-hero">
        <div>
          <p className="eyebrow">Safety Dead-man&apos;s Switch</p>
          <h1 className="section-title">Protocol status, recovery language, and delayed-settlement trust.</h1>
          <p className="section-note reliability-hero__copy">
            This route is where the product proves it can explain itself under stress: wrong network, missing
            wallet, pending proof returns, and fallback transitions all need calm, deterministic guidance.
          </p>
        </div>

        <article className="reliability-priority-card">
          <span className="signal-label">Primary runtime recovery</span>
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

      <section className="reliability-runtime-grid">
        {runtimeSignals.map((signal) => (
          <article key={signal.label} className="reliability-runtime-card">
            <div className="reliability-runtime-card__head">
              <span className="signal-label">{signal.label}</span>
              <StatusPill
                label={
                  signal.tone === "success"
                    ? "Ready"
                    : signal.tone === "warning"
                      ? "Watch"
                : signal.tone === "danger"
                  ? "Blocked"
                  : "Standby"
                }
                tone={signal.tone}
                pulse={signal.tone === "success"}
              />
            </div>
            <strong className="reliability-runtime-card__value">{signal.value}</strong>
            <p className="reliability-runtime-card__copy">{signal.note}</p>
          </article>
        ))}
      </section>

      <section className="portfolio-grid">
        <article className="detail-card portfolio-section-card">
          <p className="eyebrow">Protocol posture</p>
          <h2 className="detail-title portfolio-section-card__title">Status signals users can trust</h2>
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

        <article className="detail-card portfolio-section-card">
          <p className="eyebrow">Transparency links</p>
          <h2 className="detail-title portfolio-section-card__title">External proof and coprocessor surfaces</h2>
          <div className="claims-list">
            <article className="claim-card">
              <div className="claim-card__head">
                <div>
                  <span className="signal-label">Coprocessor reference</span>
                  <h3 className="claim-card__title">{appConfig.coprocessor.name}</h3>
                </div>
                <StatusPill label={runtime.coprocessor.live ? "Live probe" : "Reference"} tone={runtime.coprocessor.tone} pulse={runtime.coprocessor.live} />
              </div>
              <p className="claim-card__copy">
                Keep the privacy engine visible to the user, even when the live probe is still exposed through an
                external public surface.
              </p>
              <a className="secondary-action portfolio-inline-action" href={appConfig.coprocessor.referenceUrl} rel="noreferrer" target="_blank">
                Open Fhenix Coprocessor Stats
              </a>
            </article>
            <article className="claim-card">
              <div className="claim-card__head">
                <div>
                  <span className="signal-label">Foundation review</span>
                  <h3 className="claim-card__title">Security and economic principles</h3>
                </div>
                <StatusPill label="Docs linked" tone="success" pulse />
              </div>
              <p className="claim-card__copy">
                The recovery surface should always give the user a direct path to the canonical foundation notes.
              </p>
              <a className="secondary-action portfolio-inline-action" href={appConfig.docs.foundationUrl} rel="noreferrer" target="_blank">
                Review foundation
              </a>
            </article>
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
          <p className="eyebrow">Mobile readiness</p>
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
