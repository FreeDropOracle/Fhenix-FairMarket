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

  const sessionState = !wallet.hasProvider
    ? {
        title: "Wallet missing",
        tone: "danger" as const,
        body: "Install a wallet first so bidding, claims, and seller actions can unlock in one place.",
        status: "Blocked"
      }
    : !wallet.isConnected
      ? {
          title: "Wallet not connected",
          tone: "warning" as const,
          body: "Connect the session first, then governance and claim surfaces can reflect your real routes.",
          status: "Needs attention"
        }
      : !wallet.isSupportedNetwork
        ? {
            title: "Switch to Sepolia",
            tone: "warning" as const,
            body: "The interface is aligned around one network so outcomes, claims, and auctions stay predictable.",
            status: "Switch network"
          }
        : {
            title: "Session aligned",
            tone: "success" as const,
            body: "Wallet and network are in sync, so protocol state and next actions can stay simple.",
            status: "Ready"
          };

  const connectedWalletLabel =
    wallet.isConnected && wallet.account
      ? `${wallet.account.slice(0, 6)}...${wallet.account.slice(-4)}`
      : "No connected wallet";

  return (
    <main className="page-grid governance-shell">
      <section className="governance-hero">
        <div className="governance-hero__copy">
          <p className="eyebrow">Governance</p>
          <h1 className="section-title">Transparency first. Protocol depth only when it helps.</h1>
          <p className="section-note governance-hero__note">
            This route explains protocol health, fallback policy, and session guidance in plain language before it
            asks anyone to think about operator mechanics.
          </p>

          <div className="hero-actions governance-hero__actions">
            <Link className="primary-action" href="/portfolio">
              Open claims
            </Link>
            <Link className="secondary-action" href="/marketplace">
              Open marketplace
            </Link>
          </div>
        </div>

        <article className="governance-session-card">
          <div className="governance-session-card__head">
            <div>
              <span className="signal-label">Session state</span>
              <h2 className="governance-session-card__title">{sessionState.title}</h2>
            </div>
            <StatusPill label={sessionState.status} tone={sessionState.tone} />
          </div>

          <p className="governance-session-card__copy">{sessionState.body}</p>

          <div className="governance-session-card__meta">
            <article className="governance-session-card__meta-item">
              <span className="signal-label">Connected wallet</span>
              <strong>{connectedWalletLabel}</strong>
            </article>
            <article className="governance-session-card__meta-item">
              <span className="signal-label">Supported network</span>
              <strong>Sepolia only</strong>
            </article>
            <article className="governance-session-card__meta-item">
              <span className="signal-label">Claim surface</span>
              <strong>Portfolio first</strong>
            </article>
          </div>
        </article>
      </section>

      <section className="detail-card governance-section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">At a glance</p>
            <h2 className="detail-title governance-section-card__title">Signals worth trusting</h2>
          </div>
        </div>

        <div className="governance-signal-grid">
          {protocolSignals.map((signal) => (
            <article key={signal.label} className="governance-signal-card">
              <div className="governance-signal-card__head">
                <span className="signal-label">{signal.label}</span>
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
              <h3 className="claim-card__title">{signal.value}</h3>
              <p className="claim-card__copy">{signal.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="governance-section-grid">
        <article className="detail-card governance-section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Protocol windows</p>
              <h2 className="detail-title governance-section-card__title">How the lot moves when settlement slows</h2>
            </div>
            <StatusPill label="Fallback policy" tone="neutral" />
          </div>

          <div className="governance-note-list">
            {settlementScenarios.map((scenario) => (
              <article key={scenario.id} className="governance-note-card">
                <div className="governance-note-card__head">
                  <div>
                    <span className="signal-label">{scenario.windowLabel}</span>
                    <h3 className="claim-card__title">{scenario.title}</h3>
                  </div>
                  <StatusPill label={scenario.statusLabel} tone={scenario.tone} />
                </div>
                <p className="claim-card__copy">{scenario.detail}</p>
                <p className="governance-note-card__action">{scenario.operatorAction}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="detail-card governance-section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">User guardrails</p>
              <h2 className="detail-title governance-section-card__title">What the interface should say next</h2>
            </div>
            <Link className="secondary-action portfolio-inline-action" href="/about">
              Read project context
            </Link>
          </div>

          <div className="activity-list">
            {recoveryPlaybooks.map((playbook) => (
              <div key={playbook.id} className="activity-row">
                <div className="activity-row__copy">
                  <span className="signal-label">{playbook.trigger}</span>
                  <h3 className="activity-row__title">{playbook.title}</h3>
                  <p className="activity-row__detail">{playbook.detail}</p>
                  <p className="governance-note-card__action">{playbook.action}</p>
                </div>
                <StatusPill
                  label={
                    playbook.tone === "success"
                      ? "Stable"
                      : playbook.tone === "warning"
                        ? "Guide"
                        : playbook.tone === "danger"
                          ? "Blocked"
                          : "Context"
                  }
                  tone={playbook.tone}
                />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="detail-card governance-section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Small-screen behavior</p>
            <h2 className="detail-title governance-section-card__title">Reliability should stay readable everywhere</h2>
          </div>
          <StatusPill label="Mobile ready" tone="success" />
        </div>

        <div className="governance-mobile-grid">
          {mobileReadinessPoints.map((point) => (
            <article key={point.id} className="governance-mobile-card">
              <h3 className="claim-card__title">{point.title}</h3>
              <p className="claim-card__copy">{point.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
