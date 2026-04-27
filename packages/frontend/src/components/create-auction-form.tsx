"use client";

import Link from "next/link";
import { parseEther } from "ethers";
import { useMemo, useState } from "react";

import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { appConfig, formatAddress, isAddressLike } from "@/lib/app-config";
import { createAuctionWithWallet, type CreateAuctionResult } from "@/lib/create-auction";

type DurationComposerState = {
  months: string;
  days: string;
  hours: string;
  minutes: string;
};

type CreateAuctionFormState = {
  duration: DurationComposerState;
  format: "standard" | "vickrey";
  nftContract: string;
  sellerDeposit: string;
  tokenId: string;
};

const DAYS_PER_MONTH = 30;
const MIN_AUCTION_DURATION_SECONDS = 60;
const MAX_AUCTION_DURATION_SECONDS = 90 * 24 * 60 * 60;

const checklist = [
  "The NFT must already be inside the seller wallet.",
  "Approval is requested automatically if the market is not approved yet.",
  "You can compose the auction window from 1 minute up to 3 months.",
  "The seller deposit is sent with the same transaction that creates the auction.",
  "After confirmation, the NFT moves into market custody until the auction ends."
] as const;

function getPrimaryActionLabel(
  isSubmitting: boolean,
  wallet: ReturnType<typeof useWallet>,
  marketReady: boolean
) {
  if (!marketReady) {
    return "Market contract missing";
  }
  if (isSubmitting) {
    return "Submitting...";
  }
  if (!wallet.hasProvider) {
    return "Install wallet";
  }
  if (!wallet.isConnected) {
    return "Connect wallet";
  }
  if (!wallet.isSupportedNetwork) {
    return "Switch to Sepolia";
  }

  return "Create auction";
}

function sanitizeWholeNumberInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function parseDurationField(raw: string) {
  if (raw.trim().length === 0) {
    return 0;
  }

  return Number.parseInt(raw, 10);
}

function buildDurationSeconds(duration: DurationComposerState) {
  const months = parseDurationField(duration.months);
  const days = parseDurationField(duration.days);
  const hours = parseDurationField(duration.hours);
  const minutes = parseDurationField(duration.minutes);

  return ((((months * DAYS_PER_MONTH + days) * 24 + hours) * 60) + minutes) * 60;
}

function formatDurationLabel(totalSeconds: number) {
  let remainingMinutes = Math.floor(totalSeconds / 60);

  const months = Math.floor(remainingMinutes / (DAYS_PER_MONTH * 24 * 60));
  remainingMinutes -= months * DAYS_PER_MONTH * 24 * 60;

  const days = Math.floor(remainingMinutes / (24 * 60));
  remainingMinutes -= days * 24 * 60;

  const hours = Math.floor(remainingMinutes / 60);
  remainingMinutes -= hours * 60;

  const minutes = remainingMinutes;

  const parts = [
    months > 0 ? `${months} month${months === 1 ? "" : "s"}` : null,
    days > 0 ? `${days} day${days === 1 ? "" : "s"}` : null,
    hours > 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : null,
    minutes > 0 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "0 minutes";
}

function getDurationError(totalSeconds: number) {
  if (totalSeconds < MIN_AUCTION_DURATION_SECONDS) {
    return "Choose at least 1 minute for the auction duration.";
  }

  if (totalSeconds > MAX_AUCTION_DURATION_SECONDS) {
    return "The auction duration cannot exceed 3 months.";
  }

  return null;
}

export function CreateAuctionForm() {
  const wallet = useWallet();
  const [form, setForm] = useState<CreateAuctionFormState>({
    duration: {
      months: "",
      days: "1",
      hours: "",
      minutes: ""
    },
    format: "vickrey",
    nftContract: "",
    sellerDeposit: "1.00",
    tokenId: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMessage, setProgressMessage] = useState("Fill the on-chain fields, then confirm the transaction in your wallet.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CreateAuctionResult | null>(null);

  const marketReady = isAddressLike(appConfig.contracts.marketProxyAddress);
  const actionLabel = getPrimaryActionLabel(isSubmitting, wallet, marketReady);
  const durationSeconds = useMemo(() => buildDurationSeconds(form.duration), [form.duration]);
  const durationError = getDurationError(durationSeconds);
  const durationSummary =
    durationSeconds >= MIN_AUCTION_DURATION_SECONDS ? formatDurationLabel(durationSeconds) : "Choose your duration";

  const handleChange = <K extends keyof CreateAuctionFormState>(field: K, value: CreateAuctionFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleDurationChange = (field: keyof DurationComposerState, value: string) => {
    setForm((current) => ({
      ...current,
      duration: {
        ...current.duration,
        [field]: sanitizeWholeNumberInput(value)
      }
    }));
  };

  const handleWalletSetup = async () => {
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

  const handleSubmit = async () => {
    setErrorMessage(null);
    setResult(null);

    if (!marketReady) {
      setErrorMessage("The marketplace contract is not configured for this frontend yet.");
      return;
    }

    const walletReady = await handleWalletSetup();
    if (!walletReady || !window.ethereum) {
      return;
    }

    if (!isAddressLike(form.nftContract)) {
      setErrorMessage("Enter a valid NFT contract address.");
      return;
    }

    let tokenId: bigint;
    let sellerDepositWei: bigint;

    try {
      tokenId = BigInt(form.tokenId);
    } catch {
      setErrorMessage("Token ID must be a whole number.");
      return;
    }

    try {
      sellerDepositWei = parseEther(form.sellerDeposit);
    } catch {
      setErrorMessage("Seller deposit must be a valid ETH amount.");
      return;
    }

    if (sellerDepositWei <= 0n) {
      setErrorMessage("Seller deposit must be greater than zero.");
      return;
    }

    if (durationError) {
      setErrorMessage(durationError);
      return;
    }

    if (!wallet.account) {
      setErrorMessage("Connect a wallet before creating the auction.");
      return;
    }

    setIsSubmitting(true);
    setProgressMessage(`Preparing the auction request for ${durationSummary}...`);

    try {
      const submission = await createAuctionWithWallet({
        account: wallet.account,
        durationSeconds: BigInt(durationSeconds),
        explorerBaseUrl: appConfig.chain.blockExplorerUrl,
        isVickrey: form.format === "vickrey",
        marketAddress: appConfig.contracts.marketProxyAddress,
        nftContract: form.nftContract,
        provider: window.ethereum,
        sellerDepositWei,
        tokenId,
        onProgress: setProgressMessage
      });

      setResult(submission);
      setProgressMessage(
        submission.auctionId
          ? `Auction #${submission.auctionId} is now confirmed on chain for ${durationSummary}.`
          : `Auction is now confirmed on chain for ${durationSummary}.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Auction creation failed.");
      setProgressMessage("The transaction stopped before confirmation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="create-grid">
      <article className="detail-card create-form-card">
        <p className="eyebrow">On-chain inputs</p>
        <div className="field-grid">
          <label className="field-block field-block--full">
            <span className="field-label">NFT contract</span>
            <input
              className="field-input"
              inputMode="text"
              onChange={(event) => handleChange("nftContract", event.target.value)}
              placeholder="0x..."
              value={form.nftContract}
            />
          </label>

          <label className="field-block">
            <span className="field-label">Token ID</span>
            <input
              className="field-input"
              inputMode="numeric"
              onChange={(event) => handleChange("tokenId", event.target.value)}
              placeholder="91"
              value={form.tokenId}
            />
          </label>

          <label className="field-block">
            <span className="field-label">Seller deposit (ETH)</span>
            <input
              className="field-input"
              inputMode="decimal"
              onChange={(event) => handleChange("sellerDeposit", event.target.value)}
              placeholder="1.00"
              value={form.sellerDeposit}
            />
          </label>

          <div className="field-block field-block--full">
            <span className="field-label">Auction duration</span>
            <div className="duration-grid">
              <label className="field-block">
                <span className="field-label">Months</span>
                <input
                  className="field-input"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => handleDurationChange("months", event.target.value)}
                  placeholder="0"
                  value={form.duration.months}
                />
              </label>

              <label className="field-block">
                <span className="field-label">Days</span>
                <input
                  className="field-input"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => handleDurationChange("days", event.target.value)}
                  placeholder="0"
                  value={form.duration.days}
                />
              </label>

              <label className="field-block">
                <span className="field-label">Hours</span>
                <input
                  className="field-input"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => handleDurationChange("hours", event.target.value)}
                  placeholder="0"
                  value={form.duration.hours}
                />
              </label>

              <label className="field-block">
                <span className="field-label">Minutes</span>
                <input
                  className="field-input"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => handleDurationChange("minutes", event.target.value)}
                  placeholder="0"
                  value={form.duration.minutes}
                />
              </label>
            </div>

            <div className="duration-summary" data-invalid={Boolean(durationError)}>
              <span className="duration-summary__eyebrow">Duration summary</span>
              <strong>{durationSummary}</strong>
              <p>
                Min 1 minute. Max 3 months. One month is treated as {DAYS_PER_MONTH} days on chain.
              </p>
            </div>
          </div>

          <label className="field-block">
            <span className="field-label">Auction format</span>
            <select
              className="field-input"
              onChange={(event) => handleChange("format", event.target.value as CreateAuctionFormState["format"])}
              value={form.format}
            >
              <option value="vickrey">Vickrey sealed bid</option>
              <option value="standard">Standard confidential auction</option>
            </select>
          </label>
        </div>

        <div className="hero-actions">
          <button
            className="primary-action create-launch-button"
            disabled={isSubmitting || !marketReady}
            onClick={handleSubmit}
            type="button"
          >
            {actionLabel}
          </button>
          <Link className="secondary-action" href="/marketplace">
            Back to marketplace
          </Link>
        </div>
      </article>

      <article className="detail-card create-summary-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Submission status</p>
            <h2 className="detail-title portfolio-section-card__title">What happens when you submit</h2>
          </div>
          <StatusPill
            label={
              isSubmitting
                ? "Working"
                : !wallet.hasProvider
                  ? "Wallet needed"
                  : !wallet.isConnected
                    ? "Connect first"
                    : !wallet.isSupportedNetwork
                      ? "Wrong network"
                      : marketReady
                        ? "Ready"
                        : "Blocked"
            }
            tone={
              isSubmitting
                ? "warning"
                : !wallet.hasProvider || !marketReady
                  ? "danger"
                  : !wallet.isConnected || !wallet.isSupportedNetwork
                    ? "warning"
                    : "success"
            }
            pulse={isSubmitting}
          />
        </div>

        <div className="detail-stack">
          <div>
            <span className="detail-label">Connected wallet</span>
            <h3 className="detail-card__value">
              {wallet.account ? formatAddress(wallet.account) : "No wallet connected"}
            </h3>
            <p className="detail-copy detail-card__copy">{progressMessage}</p>
          </div>
        </div>

        <ul className="signal-list">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {errorMessage ? (
          <p aria-live="polite" className="action-console__notice" role="status">
            {errorMessage}
          </p>
        ) : null}

        {result ? (
          <div aria-live="polite" className="action-console__receipt" role="status">
            <span>{result.auctionId ? `Auction #${result.auctionId}` : "Auction confirmed"}</span>
            <strong>{result.txHash}</strong>
            <div className="create-feedback__actions">
              {result.auctionId ? (
                <Link className="secondary-action" href={`/marketplace/${result.auctionId}`}>
                  Open auction details
                </Link>
              ) : null}
              <Link className="secondary-action" href="/marketplace">
                Open marketplace
              </Link>
              <a className="secondary-action" href={result.txUrl} rel="noreferrer" target="_blank">
                Open on Etherscan
              </a>
              {result.approvalTxHash ? <span className="create-feedback__meta">NFT approval was completed automatically first.</span> : null}
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}
