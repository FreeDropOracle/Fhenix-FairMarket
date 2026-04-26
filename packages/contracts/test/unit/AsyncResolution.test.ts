import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { createPhase2AuctionFixture } from "../helpers/fixtures";
import { buildPhase3ResolutionProof, collectEncryptedBids } from "../helpers/phase3";

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
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, bidderTwo, market, nft, owner, seller } =
      await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market.connect(bidderTwo).lockEscrow(1n, { value: 500n });

    const winnerBid = await adapter.asEuint32(450);
    const runnerUpBid = await adapter.asEuint32(420);

    await market.connect(bidder).placeBid(1n, winnerBid);
    await market.connect(bidderTwo).placeBid(1n, runnerUpBid);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [avsOperatorOne, avsOperatorTwo]);

    await expect(
      market.connect(owner)["submitResolution(uint256,address,bytes32,uint256,bytes)"](
        1n,
        bidder.address,
        winnerBid,
        450n,
        proof
      )
    )
      .to.emit(market, "ResolutionRecorded")
      .withArgs(1n, bidder.address, winnerBid);

    const winnerPreview = await market.previewRefund(1n, bidder.address);
    const runnerUpPreview = await market.previewRefund(1n, bidderTwo.address);
    const sellerPreview = await market.previewSellerPayout(1n);
    const finalizeReward = (ethers.parseEther("1") * 20n) / 10_000n;

    expect(winnerPreview[0]).to.equal(150n);
    expect(winnerPreview[1]).to.equal(0n);
    expect(runnerUpPreview[0]).to.equal(500n);
    expect(runnerUpPreview[1]).to.equal(0n);
    expect(sellerPreview).to.equal(ethers.parseEther("1") + 450n - finalizeReward);

    await market.connect(bidderTwo).claimRefund(1n);
    await market.connect(bidder).claimRefund(1n);
    await market.connect(seller).claimSellerProceeds(1n);
    await market.claimFinalizeReward(1n);
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
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, market, owner } =
      await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    const winnerBid = await adapter.asEuint32(450);
    await market.connect(bidder).placeBid(1n, winnerBid);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [avsOperatorOne, avsOperatorTwo]);

    await expect(
      market.connect(owner)["submitResolution(uint256,address,bytes32,uint256,bytes)"](1n, bidder.address, winnerBid, 0n, proof)
    ).to.be.revertedWithCustomError(market, "ZeroWinningAmount");
  });

  it("keeps the auction in resolving and slashes attesters when the submitted resolution payload is tampered with", async function () {
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, bidderTwo, market, owner } =
      await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market.connect(bidderTwo).lockEscrow(1n, { value: 500n });

    await market.connect(bidder).placeBid(1n, await adapter.asEuint32(450));
    await market.connect(bidderTwo).placeBid(1n, await adapter.asEuint32(400));

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof, request } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [
      avsOperatorOne,
      avsOperatorTwo
    ]);

    await expect(
      market.connect(owner)["submitResolution(uint256,address,bytes32,uint256,bytes)"](
        1n,
        bidder.address,
        await adapter.asEuint32(450),
        451n,
        proof
      )
    )
      .to.emit(market, "ResolutionRejected")
      .withArgs(1n, request.requestId);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(2n);
    expect(await avs.slashCount(avsOperatorOne.address)).to.equal(1n);
    expect(await avs.slashCount(avsOperatorTwo.address)).to.equal(1n);
  });

  it("rejects replaying a valid proof on a different market that shares the same settlement infrastructure", async function () {
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, market, nft, owner, seller, settlementEngine, slashedPot } =
      await loadFixture(createPhase2AuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    const winnerBid = await adapter.asEuint32(450);
    await market.connect(bidder).placeBid(1n, winnerBid);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [avsOperatorOne, avsOperatorTwo]);

    const implementationFactory = await ethers.getContractFactory("FhenixFairMarket");
    const implementation = await implementationFactory.deploy();
    await implementation.waitForDeployment();

    const proxyFactory = await ethers.getContractFactory("FhenixFairMarketProxy");
    const initData = implementationFactory.interface.encodeFunctionData("initialize", [
      await adapter.getAddress(),
      owner.address,
      await slashedPot.getAddress()
    ]);
    const proxy = await proxyFactory.deploy(await implementation.getAddress(), initData);
    await proxy.waitForDeployment();

    const secondMarket = implementationFactory.attach(await proxy.getAddress());
    await secondMarket.connect(owner).setSettlementEngine(await settlementEngine.getAddress());

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await secondMarket.getAddress(), 2n);
    await secondMarket.connect(seller).createAuction(await nft.getAddress(), 2n, 24 * 60 * 60, ethers.parseEther("1"), true, {
      value: ethers.parseEther("1")
    });

    await secondMarket.connect(bidder).lockEscrow(1n, { value: 600n });
    await secondMarket.connect(bidder).placeBid(1n, winnerBid);
    await time.increase(24 * 60 * 60 + 1);
    await secondMarket.triggerFinalize(1n);

    const secondRequest = await secondMarket.getResolutionRequest(1n);
    await expect(
      secondMarket.connect(owner)["submitResolution(uint256,address,bytes32,uint256,bytes)"](
        1n,
        bidder.address,
        winnerBid,
        450n,
        proof
      )
    )
      .to.emit(secondMarket, "ResolutionRejected")
      .withArgs(1n, secondRequest[0]);

    const secondAuction = await secondMarket.getAuction(1n);
    expect(secondAuction[5]).to.equal(2n);
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
