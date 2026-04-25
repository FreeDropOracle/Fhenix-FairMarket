import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

import { createPhase2AuctionFixture } from "../helpers/fixtures";

async function advanceWithHeartbeat(seconds: number, callback: () => Promise<unknown>) {
  await time.increase(seconds);
  await callback();
}

describe("Phase 2 dynamic timeout and fallback logic", function () {
  it("voids a resolving auction after a 30 minute sequencer outage and restores bidder liquidity", async function () {
    const { adapter, bidder, market, nft, seller } = await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market.connect(bidder).placeBid(1n, await adapter.asEuint32(500));

    await advanceWithHeartbeat(12, () => market.connect(bidder).lockEscrow(1n, { value: 1n }));
    await advanceWithHeartbeat(12, () => market.connect(bidder).lockEscrow(1n, { value: 1n }));

    const auctionBeforeEnd = await market.getAuction(1n);
    const finalizeAt = Number(auctionBeforeEnd[3]) - 15;
    await time.increaseTo(finalizeAt);
    await market.connect(bidder).lockEscrow(1n, { value: 1n });

    const timeoutWindow = await market.previewDynamicTimeout();
    expect(timeoutWindow).to.be.lessThan(30n * 60n);

    await time.increase(16);
    await market.triggerFinalize(1n);

    await expect(market.triggerFallbackVoid(1n)).to.be.revertedWithCustomError(market, "FallbackThresholdNotReached");

    await time.increase(30 * 60);
    await expect(market.triggerFallbackVoid(1n))
      .to.emit(market, "FallbackTriggered")
      .withArgs(1n, anyValue, timeoutWindow);

    const phase2Details = await market.getAuctionPhase2Details(1n);
    const finalizeReward = (ethers.parseEther("1") * 20n) / 10_000n;
    expect(phase2Details[2]).to.equal(ethers.parseEther("1") - finalizeReward);
    expect(await nft.ownerOf(1n)).to.equal(seller.address);

    const refundPreview = await market.previewRefund(1n, bidder.address);
    expect(refundPreview[0]).to.equal(603n);
    expect(refundPreview[1]).to.equal(ethers.parseEther("1") - finalizeReward);

    await market.connect(bidder).claimRefund(1n);
    expect(await market.previewSellerPayout(1n)).to.equal(0n);
  });

  it("expands the emergency threshold when the moving block-time average rises under congestion", async function () {
    const { adapter, bidder, market } = await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 700n });
    await market.connect(bidder).placeBid(1n, await adapter.asEuint32(500));

    await advanceWithHeartbeat(5 * 60, () => market.connect(bidder).lockEscrow(1n, { value: 1n }));
    await advanceWithHeartbeat(5 * 60, () => market.connect(bidder).lockEscrow(1n, { value: 1n }));
    await advanceWithHeartbeat(5 * 60, () => market.connect(bidder).lockEscrow(1n, { value: 1n }));

    const auctionBeforeEnd = await market.getAuction(1n);
    const finalizeAt = Number(auctionBeforeEnd[3]) - 301;
    await time.increaseTo(finalizeAt);
    await market.connect(bidder).lockEscrow(1n, { value: 1n });

    const timeoutWindow = await market.previewDynamicTimeout();
    expect(timeoutWindow).to.be.greaterThan(30n * 60n);

    await time.increase(302);
    await market.triggerFinalize(1n);

    await time.increase(30 * 60);
    await expect(market.triggerFallbackVoid(1n)).to.be.revertedWithCustomError(market, "FallbackThresholdNotReached");

    await time.increase(Number(timeoutWindow));
    await market.triggerFallbackVoid(1n);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(5n);
  });
});
