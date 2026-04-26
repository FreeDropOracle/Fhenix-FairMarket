import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { createPhase2AuctionFixture } from "../helpers/fixtures";
import { buildPhase3ResolutionProof, collectEncryptedBids } from "../helpers/phase3";

describe("Phase 3 CoFHE and AVS integration flow", function () {
  it("runs the full async flow from encrypted bidding through AVS-backed settlement", async function () {
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, bidderTwo, market, nft, owner, seller } =
      await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market.connect(bidderTwo).lockEscrow(1n, { value: 500n });

    const winningBid = await adapter.asEuint32(450);
    const losingBid = await adapter.asEuint32(420);
    await market.connect(bidder).placeBid(1n, winningBid);
    await market.connect(bidderTwo).placeBid(1n, losingBid);

    const bidders = await market.getBidders(1n);
    expect(bidders).to.deep.equal([bidder.address, bidderTwo.address]);

    await time.increase(24 * 60 * 60 + 1);

    await expect(market.triggerFinalize(1n))
      .to.emit(market, "FinalizationTriggered")
      .withArgs(1n, anyRequestId());

    const request = await market.getResolutionRequest(1n);
    expect(request[0]).to.not.equal(ethers.ZeroHash);
    expect(request[1]).to.not.equal(ethers.ZeroHash);
    expect(request[2]).to.not.equal(ethers.ZeroHash);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof, resolution } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [
      avsOperatorOne,
      avsOperatorTwo
    ]);

    expect(resolution.winner).to.equal(bidder.address);
    expect(resolution.winningAmount).to.equal(450n);

    await expect(
      market.connect(owner)["submitResolution(uint256,address,bytes32,uint256,bytes)"](
        1n,
        bidder.address,
        winningBid,
        450n,
        proof
      )
    )
      .to.emit(market, "ResolutionRecorded")
      .withArgs(1n, bidder.address, winningBid);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(3n);

    await expect(market.getResolutionRequest(1n)).to.be.revertedWithCustomError(market, "MissingResolutionRequest");

    const sellerPayout = await market.previewSellerPayout(1n);
    const bidderRefund = await market.previewRefund(1n, bidder.address);
    const bidderTwoRefund = await market.previewRefund(1n, bidderTwo.address);
    const finalizeReward = (ethers.parseEther("1") * 20n) / 10_000n;

    expect(sellerPayout).to.equal(ethers.parseEther("1") + 450n - finalizeReward);
    expect(bidderRefund[0]).to.equal(150n);
    expect(bidderTwoRefund[0]).to.equal(500n);

    await market.connect(bidderTwo).claimRefund(1n);
    await market.connect(bidder).claimRefund(1n);
    await market.connect(seller).claimSellerProceeds(1n);
    await market.claimFinalizeReward(1n);
    await market.connect(bidder).claimAsset(1n);

    expect(await nft.ownerOf(1n)).to.equal(bidder.address);
    expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);
  });
});

function anyRequestId() {
  return (value: string) => value !== ethers.ZeroHash;
}
