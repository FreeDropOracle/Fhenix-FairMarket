"use client";

import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { appConfig, formatAddress } from "@/lib/app-config";

type HealthItem = {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
};

export function SystemHealthBar() {
  const wallet = useWallet();

  const items: HealthItem[] = [
    {
      label: "Wallet",
      value: wallet.hasProvider
        ? wallet.account
          ? formatAddress(wallet.account)
          : "Awaiting connection"
        : "No injected wallet",
      tone: wallet.account ? "success" : wallet.hasProvider ? "warning" : "danger"
    },
    {
      label: "Network",
      value: wallet.chainName
        ? wallet.isSupportedNetwork
          ? wallet.chainName
          : `${wallet.chainName} / switch required`
        : appConfig.chain.name,
      tone: wallet.chainName ? (wallet.isSupportedNetwork ? "success" : "warning") : "neutral"
    },
    {
      label: "Contracts",
      value: appConfig.contracts.ready ? "Registry configured" : "Deployment values pending",
      tone: appConfig.contracts.ready ? "success" : "warning"
    },
    {
      label: "Protocol posture",
      value: "Phase 4 backend complete / Phase 5 shell active",
      tone: "success"
    }
  ];

  return (
    <div className="health-bar">
      {items.map((item) => (
        <div key={item.label} className="health-chip">
          <div className="health-copy">
            <span className="health-label">{item.label}</span>
            <span className="health-value">{item.value}</span>
          </div>
          <StatusPill
            label={
              item.tone === "success"
                ? "Ready"
                : item.tone === "warning"
                  ? "Attention"
                  : item.tone === "danger"
                    ? "Blocked"
                    : "Standby"
            }
            tone={item.tone}
          />
        </div>
      ))}
    </div>
  );
}
