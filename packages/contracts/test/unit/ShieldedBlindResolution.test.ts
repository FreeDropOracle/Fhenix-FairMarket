import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { createPhase2AuctionFixture } from "../helpers/fixtures";
import { buildShieldedResolutionProof, collectAllEncryptedBids } from "../helpers/phase3";

async function createShieldedBlindFixture() {
  const context = await createPhase2AuctionFixture();
  const { market, owner } = context;

  const vaultFactory = await ethers.getContractFactory("ShieldedEscrowVault");
  const vault = await vaultFactory.deploy(owner.address);
  await vault.waitForDeployment();

  await vault.connect(owner).setMarket(await market.getAddress());
  await market.connect(owner).setShieldedEscrowVault(await vault.getAddress());

  return {
    ...context,
    vault
  };
}

function buildCommitment(label: string) {
  const secret = ethers.id(`${label}:secret`);
  const nullifier = ethers.id(`${label}:nullifier`);
  const commitmentHash = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [secret, nullifier]);

  return {
    secret,
    nullifier,
    commitmentHash
  };
}

describe("Privacy Phase 2 blind resolution", function () {
  it("stores shielded bids by commitment without polluting the public bidder registry", async function () {
    const { adapter, bidder, market, vault } = await loadFixture(createShieldedBlindFixture);
    const note = buildCommitment("shielded-bidder-one");

    await market.connect(bidder).lockShieldedEscrow(1n, note.commitmentHash, { value: 600n });

    const bidHandle = await adapter.asEuint96(450n);
    await expect(market.connect(bidder).placeShieldedBid(1n, note.commitmentHash, bidHandle))
      .to.emit(market, "ShieldedBidPlaced")
      .withArgs(1n, note.commitmentHash, bidHandle);

    expect(await market.getBidders(1n)).to.deep.equal([]);
    expect(await market.getShieldedCommitments(1n)).to.deep.equal([note.commitmentHash]);
    expect(await market.getShieldedEncryptedBid(1n, note.commitmentHash)).to.equal(bidHandle);
    expect(await market.escrowBalances(1n, bidder.address)).to.equal(0n);

    const preview = await vault.previewCommitment(note.commitmentHash);
    expect(preview[0]).to.equal(1n);
    expect(preview[1]).to.equal(600n);
    expect(preview[2]).to.equal(false);
    expect(preview[3]).to.equal(false);

    const phase2Details = await market.getAuctionPhase2Details(1n);
    expect(phase2Details[7]).to.equal(1n);
  });

  it("finalizes a shielded winner, routes only the winning amount into seller payout, and defers NFT reveal until claim", async function () {
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, bidderTwo, market, nft, owner, seller, vault } =
      await loadFixture(createShieldedBlindFixture);

    const winnerNote = buildCommitment("winner");
    const loserNote = buildCommitment("loser");
    const winnerBid = await adapter.asEuint96(450n);
    const loserBid = await adapter.asEuint96(420n);
    const sellerDeposit = ethers.parseEther("1");
    const finalizeReward = (sellerDeposit * 20n) / 10_000n;

    await market.connect(bidder).lockShieldedEscrow(1n, winnerNote.commitmentHash, { value: 600n });
    await market.connect(bidderTwo).lockShieldedEscrow(1n, loserNote.commitmentHash, { value: 500n });

    await market.connect(bidder).placeShieldedBid(1n, winnerNote.commitmentHash, winnerBid);
    await market.connect(bidderTwo).placeShieldedBid(1n, loserNote.commitmentHash, loserBid);

    await time.increase(24 * 60 * 60 + 1);
    await market.connect(owner).triggerFinalize(1n);

    const encryptedBids = await collectAllEncryptedBids(market, vault, 1n);
    const { proof } = await buildShieldedResolutionProof(market, avs, 1n, encryptedBids, [
      avsOperatorOne,
      avsOperatorTwo
    ]);

    await expect(market.connect(owner).submitShieldedResolution(1n, winnerNote.commitmentHash, winnerBid, 450n, proof))
      .to.emit(market, "ResolutionRecorded")
      .withArgs(1n, ethers.ZeroAddress, winnerBid);

    const phase2Details = await market.getAuctionPhase2Details(1n);
    expect(phase2Details[0]).to.equal(ethers.ZeroAddress);

    const winnerPreview = await vault.previewCommitment(winnerNote.commitmentHash);
    const loserPreview = await vault.previewCommitment(loserNote.commitmentHash);
    expect(winnerPreview[1]).to.equal(150n);
    expect(winnerPreview[2]).to.equal(true);
    expect(loserPreview[1]).to.equal(500n);
    expect(loserPreview[2]).to.equal(true);
    expect(await market.previewSellerPayout(1n)).to.equal(sellerDeposit + 450n - finalizeReward);

    await expect(market.connect(seller).claimAsset(1n)).to.be.revertedWithCustomError(
      market,
      "ShieldedWinnerMustClaimPrivately"
    );

    await vault.connect(bidder).claimRefund(winnerNote.secret, winnerNote.nullifier, bidder.address);
    await vault.connect(bidderTwo).claimRefund(loserNote.secret, loserNote.nullifier, bidderTwo.address);
    await market.connect(seller).claimSellerProceeds(1n);
    await market.connect(owner).claimFinalizeReward(1n);
    await market.connect(bidder).claimShieldedAsset(1n, winnerNote.secret, winnerNote.nullifier, bidder.address);

    expect(await nft.ownerOf(1n)).to.equal(bidder.address);
    expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);
  });
});
