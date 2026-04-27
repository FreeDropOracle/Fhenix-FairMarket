"use client";

import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { appConfig } from "@/lib/app-config";
import { useRuntimeReadiness } from "@/hooks/use-runtime-readiness";

type HealthItem = {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
};

export function SystemHealthBar() {
  const wallet = useWallet();
  const runtime = useRuntimeReadiness();

  const items: HealthItem[] = [
    {
      label: "Wallet",
      value: runtime.walletValue,
      tone: runtime.walletTone
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
      value: runtime.registryLabel,
      tone: runtime.registryTone
    },
    {
      label: "Coprocessor",
      value: runtime.coprocessor.live ? appConfig.coprocessor.name : runtime.coprocessor.label,
      tone: runtime.coprocessor.tone
    },
    {
      label: "AVS",
      value: runtime.avsLabel,
      tone: runtime.avsTone
    },
    {
      label: "Protocol posture",
      value: "Phase 5 product complete / Phase 6 testnet runway active",
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
            pulse={item.tone === "success"}
          />
        </div>
      ))}
    </div>
  );
}
