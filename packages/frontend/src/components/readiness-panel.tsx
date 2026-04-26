"use client";

import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { appConfig } from "@/lib/app-config";

const readinessCards = [
  {
    key: "shell",
    title: "Application shell",
    copy: "Routing, navigation, and shared shell are wired for the rest of Phase 5."
  },
  {
    key: "wallet",
    title: "Wallet handshake",
    copy: "Injected wallet detection, account connection, and wrong-network prompts are active."
  },
  {
    key: "contracts",
    title: "Contract registry",
    copy: "Sepolia addresses are loaded from environment variables to keep deployments explicit."
  },
  {
    key: "status",
    title: "System readiness",
    copy: "A single health layer explains wallet, network, and protocol posture without noisy copy."
  }
] as const;

export function ReadinessPanel() {
  const wallet = useWallet();

  return (
    <section className="readiness-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Task 5.1 Acceptance Surface</p>
          <h2 className="section-title">Foundation checks in one glance.</h2>
        </div>
        <p className="section-note">
          This layer is intentionally compact. The user sees what is actionable now, not the whole protocol
          narrative.
        </p>
      </div>
      <div className="readiness-grid">
        {readinessCards.map((card) => (
          <article key={card.key} className="readiness-card">
            <div className="readiness-head">
              <h3 className="readiness-title">{card.title}</h3>
              <StatusPill
                tone={
                  card.key === "wallet"
                    ? wallet.isConnected && wallet.isSupportedNetwork
                      ? "success"
                      : wallet.hasProvider
                        ? "warning"
                        : "danger"
                    : card.key === "contracts"
                      ? appConfig.contracts.ready
                        ? "success"
                        : "warning"
                      : "success"
                }
                label={
                  card.key === "wallet"
                    ? wallet.isConnected && wallet.isSupportedNetwork
                      ? "Ready"
                      : wallet.hasProvider
                        ? "Awaiting action"
                        : "Wallet missing"
                    : card.key === "contracts"
                      ? appConfig.contracts.ready
                        ? "Configured"
                        : "Pending"
                      : "Live"
                }
              />
            </div>
            <p className="readiness-copy">{card.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
