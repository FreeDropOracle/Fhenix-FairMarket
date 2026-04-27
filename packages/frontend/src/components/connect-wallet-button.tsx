"use client";

import { useEffect, useRef, useState } from "react";

import { useWallet } from "@/components/wallet-provider";
import { appConfig, formatAddress } from "@/lib/app-config";

function getButtonStateLabel(input: ReturnType<typeof useWallet>) {
  if (!input.isClient) {
    return {
      tone: "neutral",
      label: "Loading wallet",
      value: "Starting",
      actionLabel: "Wait"
    } as const;
  }

  if (!input.hasProvider) {
    return {
      tone: "danger",
      label: "Wallet needed",
      value: "Install wallet",
      actionLabel: "Install"
    } as const;
  }

  if (input.isConnecting) {
    return {
      tone: "warning",
      label: "Wallet flow",
      value: "Connecting",
      actionLabel: "Connecting"
    } as const;
  }

  if (input.isConnected && input.isSupportedNetwork) {
    return {
      tone: "success",
      label: input.chainName ?? "Sepolia",
      value: formatAddress(input.account),
      actionLabel: "Manage"
    } as const;
  }

  if (input.isConnected && !input.isSupportedNetwork) {
    return {
      tone: "warning",
      label: input.chainName ?? "Wrong network",
      value: "Switch required",
      actionLabel: "Review"
    } as const;
  }

  if (input.isDismissed) {
    return {
      tone: "neutral",
      label: "Session closed",
      value: "Reconnect wallet",
      actionLabel: "Reconnect"
    } as const;
  }

  if (input.error) {
    return {
      tone: "danger",
      label: "Wallet issue",
      value: "Retry connection",
      actionLabel: "Retry"
    } as const;
  }

  return {
    tone: "neutral",
    label: "Sepolia access",
    value: "Connect wallet",
    actionLabel: "Connect"
  } as const;
}

function getExplorerHref(account: string | null) {
  if (!account) {
    return appConfig.chain.blockExplorerUrl;
  }

  return `${appConfig.chain.blockExplorerUrl}/address/${account}`;
}

export function ConnectWalletButton() {
  const wallet = useWallet();
  const view = getButtonStateLabel(wallet);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsPanelOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPanelOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isPanelOpen]);

  useEffect(() => {
    if (!wallet.isConnected) {
      setIsPanelOpen(false);
    }
  }, [wallet.isConnected]);

  const handlePrimaryClick = async () => {
    if (!wallet.hasProvider) {
      window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      return;
    }

    if (!wallet.isConnected) {
      await wallet.connect();
      return;
    }

    setIsPanelOpen((current) => !current);
  };

  const handleCopyAddress = async () => {
    if (!wallet.account || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(wallet.account);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1400);
  };

  const handleSwitchNetwork = async () => {
    await wallet.switchToSepolia();
  };

  const handleDisconnect = () => {
    wallet.disconnect();
    setIsPanelOpen(false);
  };

  return (
    <div className="wallet-control" ref={panelRef}>
      <button
        aria-controls="wallet-session-panel"
        aria-expanded={isPanelOpen}
        className="wallet-button"
        data-connected={wallet.isConnected}
        onClick={handlePrimaryClick}
        disabled={wallet.isConnecting}
        type="button"
      >
        <span className="wallet-dot" data-tone={view.tone} />
        <span className="wallet-button__meta">
          <span className="wallet-button__label">{view.label}</span>
          <span className="wallet-button__value">{view.value}</span>
        </span>
        <span className="wallet-button__suffix">{view.actionLabel}</span>
      </button>

      {wallet.isConnected ? (
        <div className="wallet-panel" hidden={!isPanelOpen} id="wallet-session-panel">
          <div className="wallet-panel__header">
            <div>
              <p className="wallet-panel__eyebrow">Wallet session</p>
              <h2 className="wallet-panel__title">{formatAddress(wallet.account)}</h2>
            </div>
            <span className="wallet-panel__network">{wallet.chainName ?? appConfig.chain.name}</span>
          </div>

          <div className="wallet-panel__body">
            <div className="wallet-panel__summary">
              <div className="wallet-panel__metric">
                <span>Account</span>
                <strong>{wallet.account}</strong>
              </div>
              <div className="wallet-panel__metric">
                <span>Network</span>
                <strong>{wallet.isSupportedNetwork ? "Ready on Sepolia" : "Wrong network detected"}</strong>
              </div>
            </div>

            {wallet.error ? (
              <p aria-live="polite" className="wallet-panel__notice" role="status">
                {wallet.error}
              </p>
            ) : null}

            <div className="wallet-panel__actions">
              {!wallet.isSupportedNetwork ? (
                <button className="wallet-panel__action wallet-panel__action--primary" onClick={handleSwitchNetwork} type="button">
                  Switch to Sepolia
                </button>
              ) : null}

              <button className="wallet-panel__action" onClick={handleCopyAddress} type="button">
                {copyState === "copied" ? "Address copied" : "Copy address"}
              </button>

              <a
                className="wallet-panel__action"
                href={getExplorerHref(wallet.account)}
                rel="noreferrer"
                target="_blank"
              >
                Open explorer
              </a>

              <button className="wallet-panel__action wallet-panel__action--danger" onClick={handleDisconnect} type="button">
                Disconnect
              </button>
            </div>

            <p className="wallet-panel__footnote">
              Disconnect closes the app session cleanly and lets you reconnect on demand.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
