import type { StatusPillTone } from "@/components/status-pill";

export type ProtocolSignal = {
  label: string;
  value: string;
  tone: StatusPillTone;
  note: string;
};

export type SettlementScenario = {
  id: string;
  title: string;
  tone: StatusPillTone;
  windowLabel: string;
  statusLabel: string;
  detail: string;
  operatorAction: string;
};

export type RecoveryPlaybook = {
  id: string;
  title: string;
  tone: StatusPillTone;
  trigger: string;
  action: string;
  detail: string;
};

export type MobileReadinessPoint = {
  id: string;
  title: string;
  detail: string;
};

export const protocolSignals: ProtocolSignal[] = [
  {
    label: "Settlement lane",
    value: "CoFHE + AVS async path",
    tone: "success",
    note: "Winner determination stays confidential until proof-backed resolution returns."
  },
  {
    label: "Fallback posture",
    value: "Deterministic void path",
    tone: "warning",
    note: "If the settlement window exceeds budget, refunds and seller slashing stay explicit and bounded."
  },
  {
    label: "Keeper mesh",
    value: "Phase 4 monitoring online",
    tone: "success",
    note: "Automated finalization, dispatch, and proof submission already exist underneath the UI."
  },
  {
    label: "Trust surface",
    value: "Single-network release",
    tone: "neutral",
    note: "Sepolia-only support reduces user ambiguity while the product hardens."
  }
];

export const settlementScenarios: SettlementScenario[] = [
  {
    id: "scenario-resolving",
    title: "Auction is resolving longer than expected",
    tone: "warning",
    windowLabel: "Within delay budget",
    statusLabel: "Monitor, do not panic",
    detail:
      "The most common case is simply that the proof round-trip is still in flight. Funds and claims remain locked by design during this window.",
    operatorAction: "Stay on the lot or portfolio view and wait for the proof-backed transition."
  },
  {
    id: "scenario-proof-return",
    title: "Proof returned, claims not yet surfaced",
    tone: "neutral",
    windowLabel: "Short post-proof lag",
    statusLabel: "Allow indexing to settle",
    detail:
      "The chain may already be finalized while the interface is still catching up to the new state. This is a refresh/read-model issue, not a custody issue.",
    operatorAction: "Refresh the route or reopen the portfolio surface before retrying the action."
  },
  {
    id: "scenario-fallback",
    title: "Fallback void executed",
    tone: "danger",
    windowLabel: "Outside safe budget",
    statusLabel: "Refund route becomes explicit",
    detail:
      "If the acceptable settlement window is exceeded, the lot can move into a deterministic fallback path that exposes refunds and seller-side slashing clearly.",
    operatorAction: "Move to Portfolio and use the claim surface rather than retrying bid-side actions."
  }
];

export const recoveryPlaybooks: RecoveryPlaybook[] = [
  {
    id: "playbook-wallet",
    title: "No injected wallet",
    tone: "danger",
    trigger: "Wallet provider missing",
    action: "Install a wallet and reopen the session",
    detail: "The UI must block sensitive actions immediately and steer the user toward wallet installation with no ambiguous buttons."
  },
  {
    id: "playbook-network",
    title: "Wrong network selected",
    tone: "warning",
    trigger: "Connected off-Sepolia",
    action: "Offer one-click switch to Sepolia",
    detail: "The first release is intentionally single-network to reduce operational and user-facing ambiguity."
  },
  {
    id: "playbook-registry",
    title: "Deployment registry not configured",
    tone: "warning",
    trigger: "Frontend envs incomplete",
    action: "Stay in preview mode and suppress on-chain execution buttons",
    detail: "This protects the user from dead-end actions while contracts are not yet published into the frontend registry."
  },
  {
    id: "playbook-recovery",
    title: "Settlement took too long",
    tone: "neutral",
    trigger: "User sees a prolonged resolving state",
    action: "Explain the delay budget and show the next safe action",
    detail: "Recovery language should tell the user exactly whether to wait, refresh, or move to claims."
  }
];

export const mobileReadinessPoints: MobileReadinessPoint[] = [
  {
    id: "mobile-thumb",
    title: "Thumb-safe actions",
    detail: "Primary actions stay large, isolated, and readable even when the user is mid-session on a smaller screen."
  },
  {
    id: "mobile-recovery",
    title: "Recovery before complexity",
    detail: "On constrained screens, the user sees what to do next before they see implementation detail."
  },
  {
    id: "mobile-status",
    title: "Compact protocol posture",
    detail: "Wallet, network, registry, and settlement posture remain visible without forcing long vertical hunting."
  }
];
