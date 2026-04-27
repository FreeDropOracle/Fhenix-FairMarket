"use client";

import { formatEther, getAddress } from "ethers";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { appConfig, formatAddress, isAddressLike } from "@/lib/app-config";
import type { AuctionState } from "@/lib/auctions";
import {
  cancelAuctionWithWallet,
  claimSellerProceedsWithWallet,
  previewSellerPayoutWithWallet
} from "@/lib/seller-auction-actions";

type SellerAuctionControlsProps = {
  auctionId: string;
  auctionState: AuctionState;
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
  sellerAddress: string;
};

function formatEthFromWei(value: string) {
  return `${Number.parseFloat(formatEther(BigInt(value))).toFixed(4)} ETH`;
}

export function SellerAuctionControls({
  auctionId,
  auctionState,
  onChain,
  sellerAddress
}: SellerAuctionControlsProps) {
  const wallet = useWallet();
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [txUrl, setTxUrl] = useState<string | null>(null);
  const [localState, setLocalState] = useState<AuctionState | null>(null);
  const [sellerClaimed, setSellerClaimed] = useState(onChain?.sellerClaimed ?? false);
  const [sellerPayoutWei, setSellerPayoutWei] = useState(onChain?.sellerPayoutWei ?? "0");

  if (!onChain) {
    return null;
  }

  const marketReady = isAddressLike(appConfig.contracts.marketProxyAddress);
  const effectiveState = localState ?? auctionState;
  const normalizedSeller = isAddressLike(sellerAddress) ? getAddress(sellerAddress) : sellerAddress;
  const normalizedAccount = wallet.account && isAddressLike(wallet.account) ? getAddress(wallet.account) : wallet.account;
  const isSeller = Boolean(normalizedAccount && normalizedAccount === normalizedSeller);
  const totalEscrowWei = BigInt(onChain.totalEscrowWei);
  const hasBidderEscrow = totalEscrowWei > 0n;
  const canCancel = effectiveState === "active";
  const canClaimSellerPayout = effectiveState === "cancelled" && !sellerClaimed && BigInt(sellerPayoutWei) > 0n;
  const isBusy = isCancelling || isClaiming;
  const cancelButtonClassName = `primary-action seller-action${
    canCancel && isSeller && wallet.isConnected && wallet.isSupportedNetwork ? " seller-action--danger" : ""
  }`;
  const claimButtonClassName = [
    "secondary-action",
    "seller-action",
    sellerClaimed ? "seller-action--neutral" : canClaimSellerPayout || isClaiming ? "seller-action--success" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const cancelActionLabel = !wallet.hasProvider
    ? "Install wallet"
    : !wallet.isConnected
      ? "Connect seller wallet"
      : !wallet.isSupportedNetwork
        ? "Switch to Sepolia"
        : !isSeller
          ? "Use seller wallet"
          : isCancelling
            ? "Cancelling..."
            : "Cancel auction";

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

  const handleCancel = async () => {
    if (!window.ethereum || !marketReady) {
      setNotice("The market contract is not ready in this frontend.");
      return;
    }

    const walletReady = await handleWalletSetup();
    if (!walletReady || !wallet.account) {
      return;
    }

    if (!isSeller) {
      setNotice("Connect the seller wallet to cancel this auction.");
      return;
    }

    setIsCancelling(true);
    setNotice("Preparing the cancellation...");
    setTxUrl(null);

    try {
      const result = await cancelAuctionWithWallet({
        account: wallet.account,
        auctionId: BigInt(onChain.auctionId),
        explorerBaseUrl: appConfig.chain.blockExplorerUrl,
        marketAddress: appConfig.contracts.marketProxyAddress,
        nftContract: onChain.nftContractAddress,
        onProgress: setNotice,
        provider: window.ethereum,
        sellerAddress,
        tokenId: BigInt(onChain.tokenId)
      });

      setLocalState("cancelled");
      setSellerClaimed(false);
      setSellerPayoutWei(result.sellerPayoutWei ?? "0");
      setTxUrl(result.txUrl);
      setNotice(
        hasBidderEscrow
          ? "Auction cancelled. The NFT returned to the seller. Bidders can now claim refunds, and any remaining seller payout can be claimed below."
          : "Auction cancelled. The NFT returned to the seller, and the seller deposit can now be claimed below."
      );
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Auction cancellation failed.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleClaimSellerPayout = async () => {
    if (!window.ethereum || !marketReady) {
      setNotice("The market contract is not ready in this frontend.");
      return;
    }

    const walletReady = await handleWalletSetup();
    if (!walletReady || !wallet.account) {
      return;
    }

    if (!isSeller) {
      setNotice("Connect the seller wallet to claim the seller payout.");
      return;
    }

    setIsClaiming(true);
    setNotice("Preparing the seller payout claim...");
    setTxUrl(null);

    try {
      const result = await claimSellerProceedsWithWallet({
        account: wallet.account,
        auctionId: BigInt(onChain.auctionId),
        explorerBaseUrl: appConfig.chain.blockExplorerUrl,
        marketAddress: appConfig.contracts.marketProxyAddress,
        onProgress: setNotice,
        provider: window.ethereum
      });

      setSellerClaimed(true);
      setSellerPayoutWei("0");
      setTxUrl(result.txUrl);
      setNotice("Seller payout claimed successfully.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Seller payout claim failed.");
    } finally {
      setIsClaiming(false);
    }
  };

  const handleRefreshPayout = async () => {
    if (!window.ethereum || !marketReady) {
      setNotice("The market contract is not ready in this frontend.");
      return;
    }

    setNotice("Refreshing the seller payout preview...");

    try {
      const preview = await previewSellerPayoutWithWallet(
        window.ethereum,
        appConfig.contracts.marketProxyAddress,
        BigInt(onChain.auctionId)
      );

      setSellerPayoutWei(preview.sellerPayoutWei);
      setNotice(
        BigInt(preview.sellerPayoutWei) > 0n
          ? `Seller payout available: ${preview.sellerPayoutEth} ETH.`
          : "No seller payout is available right now."
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to refresh the seller payout preview.");
    }
  };

  return (
    <article className="detail-card" id="seller-controls">
      <div className="section-header">
        <div>
          <p className="eyebrow">Seller controls</p>
          <h2 className="detail-title portfolio-section-card__title">Cancel the lot or close the seller payout path.</h2>
        </div>
        <StatusPill
          label={
            isBusy
              ? "Working"
              : canCancel
                ? "Cancellable"
                : effectiveState === "cancelled"
                  ? "Cancelled"
                  : "Locked"
          }
          tone={isBusy ? "warning" : canCancel ? "success" : effectiveState === "cancelled" ? "warning" : "neutral"}
          pulse={isBusy}
        />
      </div>

      <div className="detail-stack">
        <div>
          <span className="detail-label">Seller wallet</span>
          <h3 className="detail-card__value">{formatAddress(sellerAddress)}</h3>
          <p className="detail-copy detail-card__copy">
            {wallet.account
              ? isSeller
                ? "The connected wallet matches the seller and can manage this auction."
                : "The connected wallet does not match the seller. Use the seller wallet for cancellation and payout claims."
              : "Connect the seller wallet to manage this auction."}
          </p>
        </div>
        <div>
          <span className="detail-label">Current exposure</span>
          <h3 className="detail-card__value">{formatEthFromWei(onChain.sellerDepositWei)} seller deposit</h3>
          <p className="detail-copy detail-card__copy">
            {hasBidderEscrow
              ? `${formatEthFromWei(onChain.totalEscrowWei)} of bidder escrow is already staged. If you cancel now, the NFT returns to you, bidders move to refunds, and the seller payout may be reduced by slash rules.`
              : "No bidder escrow is staged right now. If you cancel now, the NFT returns to you and the seller deposit remains the only claimable payout path."}
          </p>
        </div>
      </div>

      <div className="hero-actions">
        {canCancel ? (
          <button className={cancelButtonClassName} disabled={isBusy || !marketReady} onClick={handleCancel} type="button">
            {cancelActionLabel}
          </button>
        ) : null}

        {effectiveState === "cancelled" ? (
          <button
            className={claimButtonClassName}
            disabled={isBusy || !marketReady || sellerClaimed || BigInt(sellerPayoutWei) === 0n}
            onClick={handleClaimSellerPayout}
            type="button"
          >
            {isClaiming
              ? "Claiming..."
              : sellerClaimed
                ? "Seller payout claimed"
                : BigInt(sellerPayoutWei) === 0n
                  ? "No seller payout available"
                  : "Claim seller deposit"}
          </button>
        ) : null}

        <button className="secondary-action" disabled={isBusy} onClick={handleRefresh} type="button">
          Refresh auction status
        </button>
      </div>

      <ul className="signal-list">
        <li>The cancel transaction returns the NFT to the seller immediately when it succeeds.</li>
        <li>If bidder escrow already exists, bidders must claim refunds separately after cancellation.</li>
        <li>The seller payout is claim-based after cancellation, and the final amount can be reduced by slash rules.</li>
      </ul>

      {effectiveState === "cancelled" ? (
        <div className="action-console__receipt" role="status">
          <span>Seller payout preview</span>
          <strong>{sellerClaimed ? "Already claimed" : formatEthFromWei(sellerPayoutWei)}</strong>
          <div className="create-feedback__actions">
            <button className="secondary-action" disabled={isBusy || !marketReady} onClick={handleRefreshPayout} type="button">
              Refresh payout preview
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="action-console__receipt" role="status">
          <span>Seller action status</span>
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
