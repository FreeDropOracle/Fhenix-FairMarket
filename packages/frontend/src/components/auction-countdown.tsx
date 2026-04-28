"use client";

import { useEffect, useState } from "react";

import type { AuctionState } from "@/lib/auctions";

type AuctionCountdownProps = {
  endTimeUnix?: number;
  fallbackLabel: string;
  state: AuctionState;
};

function formatRemainingLabel(endTimeUnix: number) {
  const remainingSeconds = Math.max(0, Math.floor(endTimeUnix - Date.now() / 1000));

  if (remainingSeconds === 0) {
    return "Settle now";
  }

  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m left`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s left`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s left`;
  }

  return `${seconds}s left`;
}

export function AuctionCountdown({ endTimeUnix, fallbackLabel, state }: AuctionCountdownProps) {
  const [label, setLabel] = useState(fallbackLabel);

  useEffect(() => {
    if (!endTimeUnix || state !== "active") {
      setLabel(fallbackLabel);
      return;
    }

    const refreshLabel = () => {
      setLabel(formatRemainingLabel(endTimeUnix));
    };

    refreshLabel();
    const intervalId = window.setInterval(refreshLabel, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [endTimeUnix, fallbackLabel, state]);

  return <>{label}</>;
}
