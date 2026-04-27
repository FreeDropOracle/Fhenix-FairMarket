"use client";

import { formatEther, parseEther } from "ethers";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

import { StatusPill, type StatusPillTone } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { appConfig, formatAddress, isAddressLike } from "@/lib/app-config";
import type { AuctionState } from "@/lib/auctions";
import { lockEscrowWithWallet, readEscrowBalanceWithWallet } from "@/lib/live-auction-actions";

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
  onChain?: {
    auctionId: number;
    bidCount: number;
    endTimeUnix: number;
    nftContractAddress: string;
    sellerClaimed: boolean;
    sellerDepositWei: string;
    sellerPayoutWei: string;
    tokenId: string;
    totalEscrowWei: string;
  };
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

function formatEthFromWeiString(value: string) {
  return `${Number.parseFloat(formatEther(BigInt(value))).toFixed(4)} ETH`;
}

function isEnded(endTimeUnix: number) {
  return endTimeUnix <= Math.floor(Date.now() / 1000);
}

function getPostureMessage(state: AuctionState, isLiveAuction: boolean, closeWindowReached: boolean) {
  switch (state) {
    case "resolving":
      return "Bid entry is closed. This lot is already moving through the async settlement path.";
    case "finalized":
      return "Settlement is complete. Claim and settlement surfaces are now the next safe route.";
    case "cancelled":
      return "This lot was cancelled by the seller. New bidding is closed and the claim path is now more relevant.";
    case "voided":
      return "This lot already moved into fallback. Refund actions are now the safest route.";
    case "active":
    default:
      if (closeWindowReached) {
        return "The bidding window already ended. Start settlement from the dedicated controls before expecting a winner or asset release.";
      }

      return isLiveAuction
        ? "This lot is open for real on-chain escrow locking right now."
        : "This lot is open for escrow staging and confidential bidding.";
  }
}

export function AuctionActionConsole({
  auctionId,
  auctionTitle,
  auctionState,
  openingBidAmount,
  openingBidLabel,
  escrowLabel,
  confidentialityLabel,
  onChain
}: AuctionActionConsoleProps) {
  const wallet = useWallet();
  const router = useRouter();
  const [mode, setMode] = useState<ActionMode>("escrow");
  const [escrowInput, setEscrowInput] = useState("1.00");
  const [bidInput, setBidInput] = useState("0.85");
  const [stagedEscrow, setStagedEscrow] = useState(0);
  const [walletEscrowWei, setWalletEscrowWei] = useState("0");
  const [isRefreshingWalletEscrow, setIsRefreshingWalletEscrow] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [headline, setHeadline] = useState("Choose your next action");
  const [note, setNote] = useState("Connect on Sepolia, add escrow, then continue to a confidential bid.");
  const [notice, setNotice] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const [stages, setStages] = useState<ActionStage[]>(buildStages(escrowStages, null));
  const isLiveAuction = Boolean(onChain);
  const closeWindowReached = Boolean(onChain && isEnded(onChain.endTimeUnix));
  const isAuctionActive = auctionState === "active" && !closeWindowReached;
  const needsWallet = !wallet.hasProvider || !wallet.isConnected || !wallet.isSupportedNetwork;
  const marketReady = isAddressLike(appConfig.contracts.marketProxyAddress);
  const walletEscrowLabel = !wallet.hasProvider
    ? "Wallet unavailable"
    : !wallet.isConnected
      ? "Connect wallet"
      : !wallet.isSupportedNetwork
        ? "Switch to Sepolia"
        : isRefreshingWalletEscrow
          ? "Checking on chain..."
          : BigInt(walletEscrowWei) > 0n
            ? formatEthFromWeiString(walletEscrowWei)
            : "Nothing locked yet";

  const resetStageRail = (nextMode: ActionMode) => {
    setStages(buildStages(nextMode === "escrow" ? escrowStages : bidStages, null));
  };

  useEffect(() => {
    if (!isLiveAuction || !onChain || !window.ethereum || !wallet.account || !wallet.isConnected || !wallet.isSupportedNetwork || !marketReady) {
      setWalletEscrowWei("0");
      setIsRefreshingWalletEscrow(false);
      return;
    }

    let cancelled = false;

    const refreshEscrow = async () => {
      setIsRefreshingWalletEscrow(true);

      try {
        const preview = await readEscrowBalanceWithWallet(
          window.ethereum!,
          appConfig.contracts.marketProxyAddress,
          BigInt(onChain.auctionId),
          wallet.account!
        );

        if (!cancelled) {
          setWalletEscrowWei(preview.escrowWei);
        }
      } catch {
        if (!cancelled) {
          setWalletEscrowWei("0");
        }
      } finally {
        if (!cancelled) {
          setIsRefreshingWalletEscrow(false);
        }
      }
    };

    void refreshEscrow();

    return () => {
      cancelled = true;
    };
  }, [isLiveAuction, marketReady, onChain, wallet.account, wallet.isConnected, wallet.isSupportedNetwork]);

  const handleSwitchMode = (nextMode: ActionMode) => {
    if (isRunning) {
      return;
    }

    startTransition(() => {
      setMode(nextMode);
      setHeadline(nextMode === "escrow" ? "Add escrow first" : "Seal a confidential bid");
      setNote(
        nextMode === "escrow"
          ? isLiveAuction
            ? "Lock real escrow on chain before expecting seller cancellation or refund logic to see it."
            : "Escrow must be added before confidential bidding can open for this lot."
          : isLiveAuction
            ? "The escrow lane is live on chain. The confidential bid lane will stay closed here until its encrypted wallet path is fully wired."
            : "A confidential bid becomes available after you have enough escrow in place."
      );
      setNotice(null);
      resetStageRail(nextMode);
    });
  };

  const ensureWalletReady = async () => {
    if (!wallet.hasProvider) {
      window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      return false;
    }

    if (!wallet.isConnected) {
      await wallet.connect();
      return false;
    }

    if (!wallet.isSupportedNetwork) {
      await wallet.switchToSepolia();
      return false;
    }

    return true;
  };

  const handleWalletCta = async () => {
    await ensureWalletReady();
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
    setHeadline(isLiveAuction ? "Locking escrow on chain" : "Adding escrow");
    setNote(
      isLiveAuction ? "Waiting for the wallet signature and the on-chain confirmation trail." : "Preparing the escrow step and its confirmation trail."
    );
    setLastReceipt(null);

    try {
      if (isLiveAuction) {
        if (!onChain || !window.ethereum || !marketReady) {
          setNotice("The live auction contract is not ready in this frontend.");
          return;
        }

        const walletReady = await ensureWalletReady();
        if (!walletReady || !wallet.account) {
          return;
        }

        const amountWei = parseEther(escrowInput);
        setStages(buildStages(escrowStages, 0));
        const result = await lockEscrowWithWallet({
          account: wallet.account,
          amountWei,
          auctionId: BigInt(onChain.auctionId),
          explorerBaseUrl: appConfig.chain.blockExplorerUrl,
          marketAddress: appConfig.contracts.marketProxyAddress,
          onProgress: (message) => {
            setNotice(message);
            if (message.includes("Waiting")) {
              setStages(buildStages(escrowStages, 1));
            }
          },
          provider: window.ethereum
        });

        setStages(buildStages(escrowStages, null, true));
        setWalletEscrowWei(result.walletEscrowWei);
        setHeadline("Escrow locked on chain");
        setNote("This auction now sees your escrow on chain, so seller cancellation and refund logic will account for it.");
        setLastReceipt(`Escrow locked for ${formatEth(amount)} on ${auctionTitle}.`);
        router.refresh();
        return;
      }

      for (let index = 0; index < escrowStages.length; index += 1) {
        setStages(buildStages(escrowStages, index));
        await wait(index === 0 ? 450 : 650);
      }

      setStages(buildStages(escrowStages, null, true));
      setStagedEscrow((current) => current + amount);
      setHeadline("Escrow added");
      setNote("You can now continue to the confidential bid step for this lot.");
      setLastReceipt(`Escrow prepared for ${formatEth(amount)} on ${auctionTitle}.`);
      startTransition(() => {
        setMode("bid");
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Escrow locking failed.");
      resetStageRail("escrow");
    } finally {
      setIsRunning(false);
    }
  };

  const handleBidSubmit = async () => {
    if (isLiveAuction) {
      setHeadline("Confidential bid lane pending");
      setNote("Your escrow can be locked on chain from this page, but sealed bid submission is still disabled here until the production encrypted wallet path is wired.");
      setNotice("No bid transaction was sent. This release only activates real on-chain escrow for live auctions.");
      resetStageRail("bid");
      return;
    }

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

  const actionPrimaryLabel =
    mode === "escrow"
      ? isLiveAuction
        ? "Lock escrow on chain"
        : "Add escrow"
      : isLiveAuction
        ? "Bid lane unavailable"
        : "Seal bid";

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
              <strong>{isLiveAuction ? walletEscrowLabel : stagedEscrow > 0 ? formatEth(stagedEscrow) : "Nothing added yet"}</strong>
            </div>
          </div>

          <p className="detail-copy">{getPostureMessage(auctionState, isLiveAuction, closeWindowReached)}</p>

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
                    : auctionState === "cancelled"
                      ? "This lot was cancelled by the seller. Claim actions are now more relevant than bidding."
                      : auctionState === "active" && closeWindowReached
                        ? "The close window is over. Escrow and bid entry are closed until settlement is triggered."
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
                    {isLiveAuction
                      ? "This button sends a real payable lockEscrow transaction. Once it confirms, seller cancellation and refund routes will read the same on-chain escrow."
                      : "A payable escrow lock must land before any confidential bid can be accepted for this auction."}
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
                    {isLiveAuction
                      ? "This auction already accepts real escrow on chain. Sealed bid submission is still closed here until the encrypted wallet path is upgraded end to end."
                      : `${confidentialityLabel}. Add enough escrow first, then seal the bid amount you want to submit.`}
                  </p>
                  <button
                    className="primary-action action-console__cta"
                    disabled={isRunning || isLiveAuction}
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
