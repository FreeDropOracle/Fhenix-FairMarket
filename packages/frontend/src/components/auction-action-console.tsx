"use client";

import { startTransition, useState } from "react";

import { StatusPill, type StatusPillTone } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { appConfig, formatAddress } from "@/lib/app-config";
import type { AuctionState } from "@/lib/auctions";

type ActionMode = "escrow" | "bid";
type StageState = "idle" | "active" | "done";

type StageDefinition = {
  label: string;
  note: string;
};

type ActionStage = StageDefinition & {
  state: StageState;
};

type AuctionActionConsoleProps = {
  auctionId: string;
  auctionTitle: string;
  auctionState: AuctionState;
  openingBidAmount: number;
  openingBidLabel: string;
  escrowLabel: string;
  confidentialityLabel: string;
};

const escrowStages: StageDefinition[] = [
  { label: "Signature lane", note: "User signs a payable lockEscrow request." },
  { label: "Submission", note: "The escrow transaction is sent toward the Sepolia mempool." },
  { label: "Confirmation", note: "The escrow balance becomes available for confidential bidding." }
];

const bidStages: StageDefinition[] = [
  { label: "Client sealing", note: "Bid value is packaged into a confidential payload envelope." },
  { label: "Signature lane", note: "User approves placeBid for the encrypted payload." },
  { label: "Submission", note: "The encrypted bid reaches the contract surface." },
  { label: "Stored", note: "The confidential lane is recorded and waits for settlement." }
];

function buildStages(definitions: StageDefinition[], activeIndex: number | null, completed = false): ActionStage[] {
  return definitions.map((definition, index) => {
    if (completed || (activeIndex !== null && index < activeIndex)) {
      return { ...definition, state: "done" };
    }

    if (activeIndex === index) {
      return { ...definition, state: "active" };
    }

    return { ...definition, state: "idle" };
  });
}

function getStageTone(state: StageState): StatusPillTone {
  switch (state) {
    case "done":
      return "success";
    case "active":
      return "warning";
    case "idle":
    default:
      return "neutral";
  }
}

function getStageLabel(state: StageState) {
  switch (state) {
    case "done":
      return "Done";
    case "active":
      return "Live";
    case "idle":
    default:
      return "Queued";
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatEth(value: number) {
  return `${value.toFixed(2)} ETH`;
}

function getPostureMessage(state: AuctionState) {
  switch (state) {
    case "resolving":
      return "Bid entry is closed. This lot is already moving through the async settlement path.";
    case "finalized":
      return "Settlement is complete. Claim and settlement surfaces are now the next safe route.";
    case "voided":
      return "This lot already moved into fallback. Refund actions are now the safest route.";
    case "active":
    default:
      return "This lot is open for escrow staging and confidential bidding.";
  }
}

export function AuctionActionConsole({
  auctionId,
  auctionTitle,
  auctionState,
  openingBidAmount,
  openingBidLabel,
  escrowLabel,
  confidentialityLabel
}: AuctionActionConsoleProps) {
  const wallet = useWallet();
  const [mode, setMode] = useState<ActionMode>("escrow");
  const [escrowInput, setEscrowInput] = useState("1.00");
  const [bidInput, setBidInput] = useState("0.85");
  const [stagedEscrow, setStagedEscrow] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [headline, setHeadline] = useState("Choose your next action");
  const [note, setNote] = useState("Connect on Sepolia, add escrow, then continue to a confidential bid.");
  const [notice, setNotice] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const [stages, setStages] = useState<ActionStage[]>(buildStages(escrowStages, null));
  const isAuctionActive = auctionState === "active";
  const needsWallet = !wallet.hasProvider || !wallet.isConnected || !wallet.isSupportedNetwork;

  const resetStageRail = (nextMode: ActionMode) => {
    setStages(buildStages(nextMode === "escrow" ? escrowStages : bidStages, null));
  };

  const handleSwitchMode = (nextMode: ActionMode) => {
    if (isRunning) {
      return;
    }

    startTransition(() => {
      setMode(nextMode);
      setHeadline(nextMode === "escrow" ? "Add escrow first" : "Seal a confidential bid");
      setNote(
        nextMode === "escrow"
          ? "Escrow must be added before confidential bidding can open for this lot."
          : "A confidential bid becomes available after you have enough escrow in place."
      );
      setNotice(null);
      resetStageRail(nextMode);
    });
  };

  const handleWalletCta = async () => {
    if (!wallet.hasProvider) {
      window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      return;
    }

    if (!wallet.isConnected) {
      await wallet.connect();
      return;
    }

    if (!wallet.isSupportedNetwork) {
      await wallet.switchToSepolia();
    }
  };

  const runStageSequence = async (definitions: StageDefinition[]) => {
    for (let index = 0; index < definitions.length; index += 1) {
      setStages(buildStages(definitions, index));
      await wait(index === 0 ? 450 : 650);
    }

    setStages(buildStages(definitions, null, true));
  };

  const handleEscrowSubmit = async () => {
    const amount = Number.parseFloat(escrowInput);

    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice("Enter a positive escrow amount before continuing.");
      return;
    }

    setIsRunning(true);
    setNotice(null);
    setHeadline("Adding escrow");
    setNote("Preparing the escrow step and its confirmation trail.");
    setLastReceipt(null);

    try {
      await runStageSequence(escrowStages);
      setStagedEscrow((current) => current + amount);
      setHeadline("Escrow added");
      setNote("You can now continue to the confidential bid step for this lot.");
      setLastReceipt(`Escrow prepared for ${formatEth(amount)} on ${auctionTitle}.`);
      startTransition(() => {
        setMode("bid");
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleBidSubmit = async () => {
    const amount = Number.parseFloat(bidInput);

    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice("Enter a positive bid amount before continuing.");
      return;
    }

    if (stagedEscrow <= 0) {
      setNotice("Add escrow first before continuing to a confidential bid.");
      return;
    }

    if (amount > stagedEscrow) {
      setNotice("Your bid cannot exceed the escrow you already added.");
      return;
    }
    if (amount < openingBidAmount) {
      setNotice(`This lot opens at ${formatEth(openingBidAmount)}. Raise the bid before sealing the payload.`);
      return;
    }

    setIsRunning(true);
    setNotice(null);
    setHeadline("Sealing confidential bid");
    setNote("Preparing the confidential bid and moving it through the submission steps.");
    setLastReceipt(null);

    try {
      await runStageSequence(bidStages);
      setHeadline("Confidential bid prepared");
      setNote("Your bid is sealed and ready for the normal settlement path.");
      setLastReceipt(`Confidential bid prepared for ${formatEth(amount)} on ${auctionTitle}.`);
    } finally {
      setIsRunning(false);
    }
  };

  const actionPrimaryLabel = mode === "escrow" ? "Add escrow" : "Seal bid";

  return (
    <section className="action-console">
      <div className="section-header">
        <div>
          <p className="eyebrow">Actions</p>
          <h2 className="section-title">Escrow first. Confidential bid second.</h2>
        </div>
      </div>

      <div className="action-console__grid">
        <article className="detail-card action-console__card">
          <div className="action-console__tabbar">
            <button
              className="action-console__tab"
              data-active={mode === "escrow"}
              onClick={() => handleSwitchMode("escrow")}
              type="button"
            >
              Lock Escrow
            </button>
            <button
              className="action-console__tab"
              data-active={mode === "bid"}
              onClick={() => handleSwitchMode("bid")}
              type="button"
            >
              Confidential Bid
            </button>
          </div>

          <div className="action-console__statgrid">
            <div className="action-console__stat">
              <span>Opening bid</span>
              <strong>{openingBidLabel}</strong>
            </div>
            <div className="action-console__stat">
              <span>Desk escrow</span>
              <strong>{escrowLabel}</strong>
            </div>
            <div className="action-console__stat">
              <span>Your available escrow</span>
              <strong>{stagedEscrow > 0 ? formatEth(stagedEscrow) : "Nothing added yet"}</strong>
            </div>
          </div>

          <p className="detail-copy">{getPostureMessage(auctionState)}</p>

          {needsWallet ? (
            <div className="action-console__gate">
              <StatusPill
                label={
                  !wallet.hasProvider
                    ? "Wallet missing"
                    : !wallet.isConnected
                      ? "Wallet required"
                      : "Switch network"
                }
                tone={!wallet.hasProvider ? "danger" : "warning"}
              />
              <p className="detail-copy">
                {!wallet.hasProvider
                  ? "An injected wallet is required before the encrypted action lane can open."
                  : !wallet.isConnected
                    ? "Connect a wallet first before continuing."
                    : "This action is currently available on Sepolia."}
              </p>
              <button className="primary-action action-console__cta" onClick={handleWalletCta} type="button">
                {!wallet.hasProvider ? "Install wallet" : !wallet.isConnected ? "Connect wallet" : "Switch to Sepolia"}
              </button>
            </div>
          ) : !isAuctionActive ? (
            <div className="action-console__gate">
              <StatusPill label="Action lane closed" tone={auctionState === "voided" ? "danger" : "warning"} />
              <p className="detail-copy">
                {auctionState === "resolving"
                  ? "This lot is already resolving. New escrow or bids stay closed until settlement finishes."
                  : auctionState === "finalized"
                    ? "This lot is finalized. Claims and history are now more relevant than bidding."
                    : "This lot already entered fallback and new bidding is permanently closed."}
              </p>
            </div>
          ) : (
            <div className="action-console__flow">
              {mode === "escrow" ? (
                <>
                  <div className="field-grid">
                    <label className="field-block">
                      <span className="field-label">Escrow amount in ETH</span>
                      <input
                        className="field-input"
                        inputMode="decimal"
                        onChange={(event) => setEscrowInput(event.target.value)}
                        value={escrowInput}
                      />
                    </label>
                  </div>
                  <p className="action-console__hint">
                    A payable escrow lock must land before any confidential bid can be accepted for this auction.
                  </p>
                  <button
                    className="primary-action action-console__cta"
                    disabled={isRunning}
                    onClick={handleEscrowSubmit}
                    type="button"
                  >
                    {actionPrimaryLabel}
                  </button>
                </>
              ) : (
                <>
                  <div className="field-grid">
                    <label className="field-block">
                      <span className="field-label">Bid amount in ETH</span>
                      <input
                        className="field-input"
                        inputMode="decimal"
                        onChange={(event) => setBidInput(event.target.value)}
                        value={bidInput}
                      />
                    </label>
                  </div>
                  <p className="action-console__hint">
                    {confidentialityLabel}. Add enough escrow first, then seal the bid amount you want to submit.
                  </p>
                  <button
                    className="primary-action action-console__cta"
                    disabled={isRunning}
                    onClick={handleBidSubmit}
                    type="button"
                  >
                    {actionPrimaryLabel}
                  </button>
                </>
              )}
            </div>
          )}

          {notice ? (
            <p aria-live="polite" className="action-console__notice" role="status">
              {notice}
            </p>
          ) : null}
        </article>

        <article className="detail-card action-console__card">
          <div className="action-console__execution-head">
            <div>
              <p className="eyebrow">Progress</p>
              <h3 className="detail-title action-console__execution-title">{headline}</h3>
            </div>
            <StatusPill label={isRunning ? "In progress" : "Ready"} tone={isRunning ? "warning" : "neutral"} />
          </div>

          <p className="detail-copy">{note}</p>

          <div className="action-console__timeline">
            {stages.map((stage) => (
              <div key={stage.label} className="action-console__timeline-row">
                <div className="action-console__timeline-copy">
                  <span className="detail-label">{stage.label}</span>
                  <p className="action-console__timeline-note">{stage.note}</p>
                </div>
                <StatusPill label={getStageLabel(stage.state)} tone={getStageTone(stage.state)} />
              </div>
            ))}
          </div>

          <div className="action-console__meta">
            <div className="action-console__meta-card">
              <span>Session account</span>
              <strong>{wallet.account ? formatAddress(wallet.account) : "No wallet bound"}</strong>
            </div>
            <div className="action-console__meta-card">
              <span>Network</span>
              <strong>{appConfig.chain.name}</strong>
            </div>
          </div>

          {lastReceipt ? (
            <div aria-live="polite" className="action-console__receipt" role="status">
              <span>Latest activity</span>
              <strong>{lastReceipt}</strong>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
