import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { createPhase2AuctionFixture } from "../helpers/fixtures";
import { buildPhase3ResolutionProof, collectEncryptedBids } from "../helpers/phase3";

describe("Phase 4 keeper incentives and race guards", function () {
  it("reserves the first keeper reward with a nonce and prior blockhash salt", async function () {
    const { adapter, bidder, market, outsider } = await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market.connect(bidder).placeBid(1n, await adapter.asEuint32(450));

    await time.increase(24 * 60 * 60 + 1);
    const priorBlock = await ethers.provider.getBlock("latest");
    await market.connect(outsider).triggerFinalize(1n);

    const keeperFinalization = await market.getKeeperFinalization(1n);
    const expectedReward = (ethers.parseEther("1") * 20n) / 10_000n;

    expect(keeperFinalization[0]).to.equal(outsider.address);
    expect(keeperFinalization[1]).to.equal(expectedReward);
    expect(keeperFinalization[2]).to.equal(1n);
    expect(keeperFinalization[3]).to.equal(priorBlock?.hash);
    expect(keeperFinalization[4]).to.equal(false);
    expect(await market.previewFinalizeReward(1n)).to.equal(0n);
  });

  it("lets only the keeper that triggered finalization claim the reserved reward after settlement", async function () {
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, market, outsider, owner, seller } =
      await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    const winningBid = await adapter.asEuint32(450);
    await market.connect(bidder).placeBid(1n, winningBid);

    await time.increase(24 * 60 * 60 + 1);
    await market.connect(outsider).triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [avsOperatorOne, avsOperatorTwo]);

    await market.connect(owner)["submitResolution(uint256,address,bytes32,uint256,bytes)"](
      1n,
      bidder.address,
      winningBid,
      450n,
      proof
    );

    const expectedReward = (ethers.parseEther("1") * 20n) / 10_000n;
    expect(await market.previewFinalizeReward(1n)).to.equal(expectedReward);
    expect(await market.previewSellerPayout(1n)).to.equal(ethers.parseEther("1") + 450n - expectedReward);

    await expect(market.connect(seller).claimFinalizeReward(1n)).to.be.revertedWithCustomError(
      market,
      "UnauthorizedFinalizeRewardClaim"
    );

    await expect(market.connect(outsider).claimFinalizeReward(1n))
      .to.emit(market, "FinalizeRewardClaimed")
      .withArgs(1n, outsider.address, expectedReward);

    expect(await market.previewFinalizeReward(1n)).to.equal(0n);
    await expect(market.connect(outsider).claimFinalizeReward(1n)).to.be.revertedWithCustomError(
      market,
      "FinalizeRewardAlreadyClaimed"
    );
  });

  it("keeps the keeper reward solvent on fallback void by reducing the seller slash amount", async function () {
    const { adapter, bidder, market, outsider } = await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market.connect(bidder).placeBid(1n, await adapter.asEuint32(500));

    await time.increase(24 * 60 * 60 + 1);
    await market.connect(outsider).triggerFinalize(1n);
    await time.increase(await market.previewDynamicTimeout());
    await market.triggerFallbackVoid(1n);

    const phase2Details = await market.getAuctionPhase2Details(1n);
    const expectedReward = (ethers.parseEther("1") * 20n) / 10_000n;

    expect(phase2Details[2]).to.equal(ethers.parseEther("1") - expectedReward);
    expect(await market.previewFinalizeReward(1n)).to.equal(expectedReward);
  });
});
