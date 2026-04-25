import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { createPhase2AuctionFixture } from "../helpers/fixtures";

describe("Phase 2 async resolution and settlement", function () {
  it("rejects encrypted bids that exceed the caller's escrow and stores valid bid handles", async function () {
    const { adapter, bidder, market } = await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });

    const oversizedBid = await adapter.asEuint32(601);
    await expect(market.connect(bidder).placeBid(1n, oversizedBid)).to.be.revertedWithCustomError(
      market,
      "BidExceedsEscrow"
    );

    const validBid = await adapter.asEuint32(550);
    await expect(market.connect(bidder).placeBid(1n, validBid))
      .to.emit(market, "BidPlaced")
      .withArgs(1n, bidder.address, validBid);

    expect(await market.getEncryptedBid(1n, bidder.address)).to.equal(validBid);

    const phase2Details = await market.getAuctionPhase2Details(1n);
    expect(phase2Details[7]).to.equal(1n);
  });

  it("settles finalized auctions through pull-based refunds, seller proceeds, and deferred NFT claims", async function () {
    const { adapter, bidder, bidderTwo, market, nft, owner, seller } = await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market.connect(bidderTwo).lockEscrow(1n, { value: 500n });

    const winnerBid = await adapter.asEuint32(450);
    const runnerUpBid = await adapter.asEuint32(420);

    await market.connect(bidder).placeBid(1n, winnerBid);
    await market.connect(bidderTwo).placeBid(1n, runnerUpBid);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    await expect(market.connect(owner)["submitResolution(uint256,address,bytes32,uint256)"](1n, bidder.address, winnerBid, 450n))
      .to.emit(market, "ResolutionRecorded")
      .withArgs(1n, bidder.address, winnerBid);

    const winnerPreview = await market.previewRefund(1n, bidder.address);
    const runnerUpPreview = await market.previewRefund(1n, bidderTwo.address);
    const sellerPreview = await market.previewSellerPayout(1n);

    expect(winnerPreview[0]).to.equal(150n);
    expect(winnerPreview[1]).to.equal(0n);
    expect(runnerUpPreview[0]).to.equal(500n);
    expect(runnerUpPreview[1]).to.equal(0n);
    expect(sellerPreview).to.equal(ethers.parseEther("1") + 450n);

    await market.connect(bidderTwo).claimRefund(1n);
    await market.connect(bidder).claimRefund(1n);
    await market.connect(seller).claimSellerProceeds(1n);
    await market.connect(bidder).claimAsset(1n);

    expect(await market.hasWithdrawn(1n, bidder.address)).to.equal(true);
    expect(await market.hasWithdrawn(1n, bidderTwo.address)).to.equal(true);
    expect(await market.escrowBalances(1n, bidder.address)).to.equal(0n);
    expect(await market.escrowBalances(1n, bidderTwo.address)).to.equal(0n);
    expect(await nft.ownerOf(1n)).to.equal(bidder.address);
    expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);

    await expect(market.connect(seller).claimSellerProceeds(1n)).to.be.revertedWithCustomError(
      market,
      "SellerProceedsAlreadyClaimed"
    );
    await expect(market.connect(bidder).claimAsset(1n)).to.be.revertedWithCustomError(market, "AssetAlreadyClaimed");
  });

  it("rejects winner resolutions that try to settle at zero", async function () {
    const { adapter, bidder, market, owner } = await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    const winnerBid = await adapter.asEuint32(450);
    await market.connect(bidder).placeBid(1n, winnerBid);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    await expect(
      market.connect(owner)["submitResolution(uint256,address,bytes32,uint256)"](1n, bidder.address, winnerBid, 0n)
    ).to.be.revertedWithCustomError(market, "ZeroWinningAmount");
  });

  it("routes seller slashing into the compensation pot and distributes refunds without loops on cancellation", async function () {
    const { adapter, bidder, bidderTwo, market, seller, slashedPot } = await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market.connect(bidderTwo).lockEscrow(1n, { value: 400n });

    await market.connect(bidder).placeBid(1n, await adapter.asEuint32(450));
    await market.connect(bidderTwo).placeBid(1n, await adapter.asEuint32(350));

    await time.increase(12 * 60 * 60);
    await market.connect(seller).cancelAuction(1n);

    const phase2Details = await market.getAuctionPhase2Details(1n);
    const slashAmount = phase2Details[2];
    expect(slashAmount).to.be.greaterThan(0n);
    expect(await ethers.provider.getBalance(await slashedPot.getAddress())).to.equal(slashAmount);

    const bidderPreview = await market.previewRefund(1n, bidder.address);
    const bidderTwoPreview = await market.previewRefund(1n, bidderTwo.address);
    const sellerPreview = await market.previewSellerPayout(1n);

    expect(bidderPreview[0]).to.equal(600n);
    expect(bidderTwoPreview[0]).to.equal(400n);
    expect(bidderPreview[1] + bidderTwoPreview[1]).to.be.lessThanOrEqual(slashAmount);
    expect(sellerPreview + bidderPreview[1] + bidderTwoPreview[1]).to.be.lessThanOrEqual(ethers.parseEther("1"));

    await market.connect(bidder).claimRefund(1n);
    await market.connect(bidderTwo).claimRefund(1n);
    await market.connect(seller).claimSellerProceeds(1n);

    expect(await market.hasWithdrawn(1n, bidder.address)).to.equal(true);
    expect(await market.hasWithdrawn(1n, bidderTwo.address)).to.equal(true);
    expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);
  });
});
