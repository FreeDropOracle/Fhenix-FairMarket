"use client";

import Link from "next/link";
import { parseEther } from "ethers";
import { useMemo, useState } from "react";

import { StatusPill, type StatusPillTone } from "@/components/status-pill";
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

type CreateStep = "asset" | "duration" | "deposit" | "review";

const DAYS_PER_MONTH = 30;
const MIN_AUCTION_DURATION_SECONDS = 60;
const MAX_AUCTION_DURATION_SECONDS = 90 * 24 * 60 * 60;

const createSteps: Array<{
  id: CreateStep;
  label: string;
  short: string;
  title: string;
  copy: string;
}> = [
  {
    id: "asset",
    label: "Asset",
    short: "Which NFT are you listing?",
    title: "Define the NFT that will enter market custody.",
    copy: "Start with the contract, token ID, and auction format. This step makes the listing concrete before any funds move."
  },
  {
    id: "duration",
    label: "Duration",
    short: "How long should bidding stay open?",
    title: "Choose an auction window that stays within protocol bounds.",
    copy: "The contract accepts anything from 1 minute to 3 months, so this screen keeps the duration readable before you continue."
  },
  {
    id: "deposit",
    label: "Deposit",
    short: "How much seller coverage will you post?",
    title: "Set the seller deposit that travels with creation.",
    copy: "The deposit is sent in the same transaction as auction creation and becomes part of the seller-side guarantee."
  },
  {
    id: "review",
    label: "Review",
    short: "Confirm the listing before it goes on chain.",
    title: "Review the auction request before submitting it to Sepolia.",
    copy: "This final step summarizes the NFT, duration, and deposit so the wallet prompt never feels abrupt."
  }
];

const checklist = [
  "The NFT stays in the seller wallet until the final create transaction succeeds.",
  "Approval is requested automatically only if the market is not already approved.",
  "The auction window is constrained on chain to 1 minute through 3 months.",
  "Seller deposit and auction creation settle together in one transaction."
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

function getWalletStatus(wallet: ReturnType<typeof useWallet>, marketReady: boolean) {
  if (!marketReady) {
    return { label: "Blocked", tone: "danger" as StatusPillTone };
  }
  if (!wallet.hasProvider) {
    return { label: "Wallet needed", tone: "danger" as StatusPillTone };
  }
  if (!wallet.isConnected) {
    return { label: "Connect first", tone: "warning" as StatusPillTone };
  }
  if (!wallet.isSupportedNetwork) {
    return { label: "Wrong network", tone: "warning" as StatusPillTone };
  }

  return { label: "Ready", tone: "success" as StatusPillTone };
}

function getFormatLabel(format: CreateAuctionFormState["format"]) {
  return format === "vickrey" ? "Vickrey sealed bid" : "Prototype sealed auction";
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
  const [step, setStep] = useState<CreateStep>("asset");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMessage, setProgressMessage] = useState("Review each step, then confirm the final transaction in your wallet.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CreateAuctionResult | null>(null);

  const marketReady = isAddressLike(appConfig.contracts.marketProxyAddress);
  const actionLabel = getPrimaryActionLabel(isSubmitting, wallet, marketReady);
  const durationSeconds = useMemo(() => buildDurationSeconds(form.duration), [form.duration]);
  const durationError = getDurationError(durationSeconds);
  const durationSummary =
    durationSeconds >= MIN_AUCTION_DURATION_SECONDS ? formatDurationLabel(durationSeconds) : "Choose your duration";
  const activeStepIndex = createSteps.findIndex((entry) => entry.id === step);
  const activeStep = createSteps[activeStepIndex];
  const walletStatus = getWalletStatus(wallet, marketReady);
  const reviewRows = [
    { label: "NFT contract", value: form.nftContract || "Waiting for contract address" },
    { label: "Token ID", value: form.tokenId || "Waiting for token ID" },
    { label: "Format", value: getFormatLabel(form.format) },
    { label: "Duration", value: durationSummary },
    { label: "Seller deposit", value: form.sellerDeposit ? `${form.sellerDeposit} ETH` : "Waiting for deposit" }
  ] as const;

  const handleChange = <K extends keyof CreateAuctionFormState>(field: K, value: CreateAuctionFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrorMessage(null);
    setResult(null);
  };

  const handleDurationChange = (field: keyof DurationComposerState, value: string) => {
    setForm((current) => ({
      ...current,
      duration: {
        ...current.duration,
        [field]: sanitizeWholeNumberInput(value)
      }
    }));
    setErrorMessage(null);
    setResult(null);
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

  const validateCurrentStep = () => {
    if (step === "asset") {
      if (!isAddressLike(form.nftContract)) {
        setErrorMessage("Enter a valid NFT contract address before continuing.");
        return false;
      }

      try {
        BigInt(form.tokenId);
      } catch {
        setErrorMessage("Token ID must be a whole number before continuing.");
        return false;
      }
    }

    if (step === "duration" && durationError) {
      setErrorMessage(durationError);
      return false;
    }

    if (step === "deposit") {
      try {
        const sellerDepositWei = parseEther(form.sellerDeposit);
        if (sellerDepositWei <= 0n) {
          setErrorMessage("Seller deposit must be greater than zero.");
          return false;
        }
      } catch {
        setErrorMessage("Seller deposit must be a valid ETH amount.");
        return false;
      }
    }

    setErrorMessage(null);
    return true;
  };

  const handleAdvance = () => {
    if (!validateCurrentStep()) {
      return;
    }

    const nextStep = createSteps[activeStepIndex + 1];
    if (nextStep) {
      setStep(nextStep.id);
      setProgressMessage(`Step ${activeStepIndex + 2} is ready. ${nextStep.short}`);
    }
  };

  const handleBack = () => {
    const previousStep = createSteps[activeStepIndex - 1];
    if (previousStep) {
      setErrorMessage(null);
      setStep(previousStep.id);
      setProgressMessage(`Back to ${previousStep.label.toLowerCase()}.`);
    }
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
        onProgress: setProgressMessage,
        provider: window.ethereum,
        sellerDepositWei,
        tokenId
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
    <section className="create-grid create-wizard">
      <article className="detail-card create-form-card create-form-card--wizard">
        <div className="create-stepper" aria-label="Auction creation steps">
          {createSteps.map((entry, index) => {
            const isActive = entry.id === step;
            const isComplete = index < activeStepIndex;

            return (
              <div key={entry.id} className="create-step" data-active={isActive} data-complete={isComplete}>
                <span className="create-step__index">{index + 1}</span>
                <div className="create-step__copy">
                  <strong>{entry.label}</strong>
                </div>
              </div>
            );
          })}
        </div>

        <div className="create-form-stage">
          <p className="eyebrow">Step {activeStepIndex + 1}</p>
          <h2 className="detail-title portfolio-section-card__title">{activeStep.title}</h2>
          <p className="detail-card__copy">{activeStep.copy}</p>
        </div>

        {step === "asset" ? (
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
              <span className="field-label">Auction format</span>
              <select
                className="field-input"
                onChange={(event) => handleChange("format", event.target.value as CreateAuctionFormState["format"])}
                value={form.format}
              >
                <option value="vickrey">Vickrey sealed bid</option>
                <option value="standard">Prototype sealed auction</option>
              </select>
            </label>
          </div>
        ) : null}

        {step === "duration" ? (
          <div className="create-stage-stack">
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
              <p>Min 1 minute. Max 3 months. One month is treated as {DAYS_PER_MONTH} days on chain.</p>
            </div>
          </div>
        ) : null}

        {step === "deposit" ? (
          <div className="create-stage-stack">
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

            <div className="duration-summary">
              <span className="duration-summary__eyebrow">Why this exists</span>
              <strong>{form.sellerDeposit ? `${form.sellerDeposit} ETH` : "Waiting for deposit"}</strong>
              <p>The seller deposit is sent with the same transaction that creates the auction and backs the sell-side path.</p>
            </div>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="create-review-grid">
            {reviewRows.map((row) => (
              <div key={row.label} className="create-review-card">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {errorMessage ? (
          <p aria-live="polite" className="action-console__notice" role="status">
            {errorMessage}
          </p>
        ) : null}

        <div className="hero-actions create-wizard__actions">
          {activeStepIndex > 0 ? (
            <button className="secondary-action" disabled={isSubmitting} onClick={handleBack} type="button">
              Back
            </button>
          ) : null}

          {step === "review" ? (
            <button
              className="primary-action create-launch-button"
              disabled={isSubmitting || !marketReady}
              onClick={handleSubmit}
              type="button"
            >
              {actionLabel}
            </button>
          ) : (
            <button className="primary-action create-launch-button" disabled={isSubmitting} onClick={handleAdvance} type="button">
              Next: {createSteps[activeStepIndex + 1]?.label}
            </button>
          )}
        </div>
      </article>

      <article className="detail-card create-summary-card create-summary-card--wizard">
        <div className="section-header">
          <div>
            <p className="eyebrow">Review rail</p>
            <h2 className="detail-title portfolio-section-card__title">A quiet summary before the wallet prompt.</h2>
          </div>
          <StatusPill label={isSubmitting ? "Working" : walletStatus.label} tone={isSubmitting ? "warning" : walletStatus.tone} pulse={isSubmitting} />
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

        <div className="create-review-grid create-review-grid--summary">
          {reviewRows.map((row) => (
            <div key={row.label} className="create-review-card">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>

        <ul className="signal-list">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

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
              {result.approvalTxHash ? (
                <span className="create-feedback__meta">NFT approval was completed automatically first.</span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="create-support-links">
            <Link className="secondary-action" href="/portfolio">
              Open portfolio
            </Link>
            <Link className="secondary-action" href="/marketplace">
              Browse marketplace
            </Link>
          </div>
        )}
      </article>
    </section>
  );
}
