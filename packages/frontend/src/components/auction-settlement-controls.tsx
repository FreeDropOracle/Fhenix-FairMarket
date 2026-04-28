"use client";

import { ZeroAddress, getAddress } from "ethers";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { appConfig, formatAddress, isAddressLike } from "@/lib/app-config";
import type { AuctionState } from "@/lib/auctions";
import {
  claimAssetWithWallet,
  resolveExpectedClaimRecipient,
  triggerFinalizeWithWallet
} from "@/lib/auction-settlement-actions";

type AuctionSettlementControlsProps = {
  auctionState: AuctionState;
  onChain?: {
    auctionId: number;
    assetClaimed: boolean;
    bidCount: number;
    endTimeUnix: number;
    nftContractAddress: string;
    sellerClaimed: boolean;
    sellerDepositWei: string;
    sellerPayoutWei: string;
    tokenId: string;
    totalEscrowWei: string;
    winnerAddress: string;
  };
  sellerAddress: string;
};

function isEnded(endTimeUnix: number) {
  return endTimeUnix <= Math.floor(Date.now() / 1000);
}

export function AuctionSettlementControls({
  auctionState,
  onChain,
  sellerAddress
}: AuctionSettlementControlsProps) {
  const wallet = useWallet();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [txUrl, setTxUrl] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [localState, setLocalState] = useState<AuctionState | null>(null);
  const [assetClaimed, setAssetClaimed] = useState(onChain?.assetClaimed ?? false);
  const [winnerAddress, setWinnerAddress] = useState(onChain?.winnerAddress ?? ZeroAddress);

  if (!onChain) {
    return null;
  }

  const marketReady = isAddressLike(appConfig.contracts.marketProxyAddress);
  const effectiveState = localState ?? auctionState;
  const closeWindowReached = isEnded(onChain.endTimeUnix);
  const normalizedWinner = isAddressLike(winnerAddress) ? getAddress(winnerAddress) : winnerAddress;
  const normalizedAccount = wallet.account && isAddressLike(wallet.account) ? getAddress(wallet.account) : wallet.account;
  const expectedRecipient = isAddressLike(sellerAddress)
    ? resolveExpectedClaimRecipient(sellerAddress, winnerAddress)
    : sellerAddress;
  const isExpectedRecipient = Boolean(normalizedAccount && normalizedAccount === expectedRecipient);
  const canTriggerFinalize = effectiveState === "active" && closeWindowReached;
  const canClaimAsset = effectiveState === "finalized" && !assetClaimed;
  const isBusy = isTriggering || isClaiming;
  const finalizeActionLabel = !wallet.hasProvider
    ? "Install wallet"
    : !wallet.isConnected
      ? "Connect wallet"
      : !wallet.isSupportedNetwork
        ? "Switch to Sepolia"
        : isTriggering
          ? "Starting settlement..."
          : "Start settlement";
  const claimActionLabel = !wallet.hasProvider
    ? "Install wallet"
    : !wallet.isConnected
      ? "Connect wallet"
      : !wallet.isSupportedNetwork
        ? "Switch to Sepolia"
        : !isExpectedRecipient
          ? normalizedWinner === ZeroAddress
            ? "Use seller wallet"
            : "Use winner wallet"
          : isClaiming
            ? "Claiming NFT..."
            : normalizedWinner === ZeroAddress
              ? "Return NFT to seller"
              : "Claim NFT";
  const callout = useMemo(() => {
    if (effectiveState === "active" && closeWindowReached) {
      return onChain.bidCount > 0
        ? "The bidding window is over. Start settlement now so the keeper and AVS path can resolve the winner."
        : "The bidding window is over, but no on-chain confidential bid was recorded. Start settlement to finalize the no-winner branch and let the seller reclaim the NFT.";
    }

    if (effectiveState === "resolving") {
      return "Settlement was already triggered. The next step is waiting for the keeper and AVS proof to finalize the outcome.";
    }

    if (effectiveState === "finalized") {
      return normalizedWinner === ZeroAddress
        ? "This auction finalized with no winner. The seller can now reclaim the NFT from escrow."
        : "The winner is already fixed on chain. The recorded winner wallet can now claim the NFT.";
    }

    return "This section activates when the close window ends or when a finalized auction is ready for NFT release.";
  }, [closeWindowReached, effectiveState, normalizedWinner, onChain.bidCount]);

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

  const handleRefresh = () => {
    router.refresh();
  };

  const handleTriggerFinalize = async () => {
    if (!window.ethereum || !marketReady) {
      setNotice("The market contract is not ready in this frontend.");
      return;
    }

    const walletReady = await handleWalletSetup();
    if (!walletReady || !wallet.account) {
      return;
    }

    setIsTriggering(true);
    setNotice("Preparing the settlement trigger...");
    setTxUrl(null);

    try {
      const result = await triggerFinalizeWithWallet({
        account: wallet.account,
        auctionId: BigInt(onChain.auctionId),
        explorerBaseUrl: appConfig.chain.blockExplorerUrl,
        marketAddress: appConfig.contracts.marketProxyAddress,
        onProgress: setNotice,
        provider: window.ethereum
      });

      setLocalState("resolving");
      if (result.winnerAddress) {
        setWinnerAddress(result.winnerAddress);
      }
      setTxUrl(result.txUrl);
      setNotice(
        onChain.bidCount > 0
          ? "Settlement started on chain. The keeper and AVS path must now finalize the winner before the NFT can be claimed."
          : "Settlement started on chain. Because no on-chain bid was recorded, the no-winner branch should finalize next and return claim rights to the seller."
      );
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Settlement trigger failed.");
    } finally {
      setIsTriggering(false);
    }
  };

  const handleClaimAsset = async () => {
    if (!window.ethereum || !marketReady) {
      setNotice("The market contract is not ready in this frontend.");
      return;
    }

    const walletReady = await handleWalletSetup();
    if (!walletReady || !wallet.account) {
      return;
    }

    if (!isExpectedRecipient) {
      setNotice(normalizedWinner === ZeroAddress ? "Connect the seller wallet to reclaim the NFT." : "Connect the winner wallet to claim the NFT.");
      return;
    }

    setIsClaiming(true);
    setNotice("Preparing the NFT claim...");
    setTxUrl(null);

    try {
      const result = await claimAssetWithWallet({
        account: wallet.account,
        auctionId: BigInt(onChain.auctionId),
        explorerBaseUrl: appConfig.chain.blockExplorerUrl,
        marketAddress: appConfig.contracts.marketProxyAddress,
        nftContract: onChain.nftContractAddress,
        onProgress: setNotice,
        provider: window.ethereum,
        recipientAddress: expectedRecipient,
        tokenId: BigInt(onChain.tokenId)
      });

      setAssetClaimed(Boolean(result.assetClaimed));
      if (result.winnerAddress) {
        setWinnerAddress(result.winnerAddress);
      }
      setTxUrl(result.txUrl);
      setNotice("The NFT claim completed successfully on chain.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "NFT claim failed.");
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <article className="detail-card" id="settlement-controls">
      <div className="section-header">
        <div>
          <p className="eyebrow">Settlement controls</p>
          <h2 className="detail-title portfolio-section-card__title">Close the lot safely after the bidding window ends.</h2>
        </div>
        <StatusPill
          label={
            isBusy
              ? "Working"
              : canTriggerFinalize
                ? "Ready to settle"
                : canClaimAsset
                  ? "Claimable"
                  : effectiveState === "resolving"
                    ? "Resolving"
                    : effectiveState === "finalized"
                      ? "Finalized"
                      : "Standby"
          }
          tone={
            isBusy
              ? "warning"
              : canTriggerFinalize || canClaimAsset
                ? "success"
                : effectiveState === "resolving"
                  ? "warning"
                  : "neutral"
          }
          pulse={isBusy}
        />
      </div>

      <div className="detail-stack">
        <div>
          <span className="detail-label">Recorded winner</span>
          <h3 className="detail-card__value">
            {normalizedWinner === ZeroAddress ? "No winner yet" : formatAddress(normalizedWinner)}
          </h3>
          <p className="detail-copy detail-card__copy">
            {normalizedWinner === ZeroAddress
              ? "No winner is currently recorded on chain. That is normal before settlement completes, or when the no-winner branch is the expected result."
              : "This wallet is currently recorded as the winner on chain."}
          </p>
        </div>
        <div>
          <span className="detail-label">Claim route</span>
          <h3 className="detail-card__value">{formatAddress(expectedRecipient)}</h3>
          <p className="detail-copy detail-card__copy">{callout}</p>
        </div>
      </div>

      <div className="hero-actions">
        {canTriggerFinalize ? (
          <button className="primary-action seller-action seller-action--warning" disabled={isBusy || !marketReady} onClick={handleTriggerFinalize} type="button">
            {finalizeActionLabel}
          </button>
        ) : null}

        {canClaimAsset ? (
          <button className="secondary-action seller-action seller-action--success" disabled={isBusy || !marketReady || assetClaimed} onClick={handleClaimAsset} type="button">
            {assetClaimed ? "NFT claimed" : claimActionLabel}
          </button>
        ) : null}

        <button className="secondary-action" disabled={isBusy} onClick={handleRefresh} type="button">
          Refresh auction status
        </button>
      </div>

      <ul className="signal-list">
        <li>Ending the countdown does not move the NFT by itself. The auction must enter settlement first.</li>
        <li>If `bidCount = 0`, settlement finalizes a no-winner result and the seller becomes the NFT claimant again.</li>
        <li>The public desk no longer surfaces live escrow figures for sealed-bid auctions.</li>
      </ul>

      {notice ? (
        <div className="action-console__receipt" role="status">
          <span>Settlement status</span>
          <strong>{notice}</strong>
          <div className="create-feedback__actions">
            {txUrl ? (
              <a className="secondary-action" href={txUrl} rel="noreferrer" target="_blank">
                Open transaction
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
