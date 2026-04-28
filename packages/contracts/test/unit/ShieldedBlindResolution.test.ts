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

  const registryFactory = await ethers.getContractFactory("ShieldedIdentityRegistry");
  const registry = await registryFactory.deploy(owner.address);
  await registry.waitForDeployment();

  await vault.connect(owner).setMarket(await market.getAddress());
  await vault.connect(owner).setPreviewReader(owner.address);
  await registry.connect(owner).setMarket(await market.getAddress());
  await market.connect(owner).setShieldedEscrowVault(await vault.getAddress());
  await market.connect(owner).setShieldedIdentityRegistry(await registry.getAddress());

  return {
    ...context,
    vault,
    registry
  };
}

function buildCommitment(label: string) {
  const secret = ethers.id(`${label}:secret`);
  const nullifier = ethers.id(`${label}:nullifier`);
  const identityHash = ethers.id(`${label}:identity`);
  const commitmentHash = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [secret, nullifier]);
  const claimAuthority = ethers.Wallet.createRandom();

  return {
    claimAuthority,
    identityHash,
    secret,
    nullifier,
    commitmentHash
  };
}

async function signAssetClaim(
  vaultAddress: string,
  auctionId: bigint,
  commitmentHash: string,
  recipient: string,
  deadline: bigint,
  claimAuthority: ethers.Wallet
) {
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "address", "uint256", "bytes32", "address", "uint256"],
      [ethers.id("FFM_SHIELDED_ASSET_CLAIM"), 31337n, vaultAddress, auctionId, commitmentHash, recipient, deadline]
    )
  );

  return claimAuthority.signMessage(ethers.getBytes(digest));
}

async function signRefundClaim(
  vaultAddress: string,
  auctionId: bigint,
  commitmentHash: string,
  recipient: string,
  deadline: bigint,
  claimAuthority: ethers.Wallet
) {
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "address", "uint256", "bytes32", "address", "uint256"],
      [ethers.id("FFM_SHIELDED_REFUND_CLAIM"), 31337n, vaultAddress, auctionId, commitmentHash, recipient, deadline]
    )
  );

  return claimAuthority.signMessage(ethers.getBytes(digest));
}

async function signBidCoverage(
  vaultAddress: string,
  auctionId: bigint,
  commitmentHash: string,
  encryptedBid: string,
  deadline: bigint,
  claimAuthority: ethers.Wallet
) {
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "address", "uint256", "bytes32", "bytes32", "uint256"],
      [
        ethers.id("FFM_SHIELDED_BID_COVERAGE"),
        31337n,
        vaultAddress,
        auctionId,
        commitmentHash,
        ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [encryptedBid])),
        deadline
      ]
    )
  );

  return claimAuthority.signMessage(ethers.getBytes(digest));
}

async function signVerifierCoverage(
  verifierAddress: string,
  vaultAddress: string,
  auctionId: bigint,
  commitmentHash: string,
  encryptedBid: string,
  deadline: bigint,
  prover: ethers.Wallet
) {
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "address", "uint256", "bytes32", "bytes32", "uint256"],
      [verifierAddress, 31337n, vaultAddress, auctionId, commitmentHash, encryptedBid, deadline]
    )
  );

  return prover.signMessage(ethers.getBytes(digest));
}

describe("Privacy Phase 2 blind resolution", function () {
  it("stores shielded bids by commitment without polluting the public bidder registry", async function () {
    const { adapter, bidder, market, registry, vault } = await loadFixture(createShieldedBlindFixture);
    const note = buildCommitment("shielded-bidder-one");

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitmentHash, note.claimAuthority.address, { value: 600n });

    const bidHandle = await adapter.asEuint96(450n);
    const deadline = BigInt((await time.latest()) + 3600);
    const coverageProof = await signBidCoverage(
      await vault.getAddress(),
      1n,
      note.commitmentHash,
      bidHandle,
      deadline,
      note.claimAuthority
    );
    await expect(market.connect(bidder).placeShieldedBid(1n, note.commitmentHash, bidHandle, deadline, coverageProof))
      .to.emit(market, "ShieldedBidPlaced")
      .withArgs(1n, note.commitmentHash, bidHandle);

    expect(await market.getBidders(1n)).to.deep.equal([]);
    expect(await market.getShieldedCommitments(1n)).to.deep.equal([note.commitmentHash]);
    expect(await registry.commitmentForIdentity(1n, note.identityHash)).to.equal(note.commitmentHash);
    expect(await registry.identityForCommitment(1n, note.commitmentHash)).to.equal(note.identityHash);
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

  it("rejects shielded bids that do not carry a valid balance proof", async function () {
    const { adapter, bidder, market, seller, vault } = await loadFixture(createShieldedBlindFixture);
    const note = buildCommitment("shielded-proof-reject");

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitmentHash, note.claimAuthority.address, { value: 600n });

    const bidHandle = await adapter.asEuint96(450n);
    const deadline = BigInt((await time.latest()) + 3600);
    const forgedProof = await signBidCoverage(
      await vault.getAddress(),
      1n,
      note.commitmentHash,
      bidHandle,
      deadline,
      ethers.Wallet.createRandom()
    );

    await expect(
      market.connect(seller).placeShieldedBid(1n, note.commitmentHash, bidHandle, deadline, forgedProof)
    ).to.be.revertedWithCustomError(vault, "InvalidClaimAuthority");
  });

  it("accepts shielded bid proofs from an external verifier boundary when configured", async function () {
    const { adapter, bidder, market, owner, vault } = await loadFixture(createShieldedBlindFixture);
    const note = buildCommitment("shielded-verifier-boundary");
    const prover = ethers.Wallet.createRandom();

    const verifierFactory = await ethers.getContractFactory("MockShieldedBidVerifier");
    const verifier = await verifierFactory.deploy(owner.address, prover.address);
    await verifier.waitForDeployment();
    await vault.connect(owner).setShieldedBidVerifier(await verifier.getAddress());

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitmentHash, note.claimAuthority.address, { value: 600n });

    const bidHandle = await adapter.asEuint96(450n);
    const deadline = BigInt((await time.latest()) + 3600);
    const verifierProof = await signVerifierCoverage(
      await verifier.getAddress(),
      await vault.getAddress(),
      1n,
      note.commitmentHash,
      bidHandle,
      deadline,
      prover
    );

    await expect(market.connect(bidder).placeShieldedBid(1n, note.commitmentHash, bidHandle, deadline, verifierProof))
      .to.emit(market, "ShieldedBidPlaced")
      .withArgs(1n, note.commitmentHash, bidHandle);
  });

  it("finalizes a shielded winner, routes only the winning amount into seller payout, and defers NFT reveal until claim", async function () {
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, bidderTwo, market, nft, owner, registry, seller, vault } =
      await loadFixture(createShieldedBlindFixture);

    const winnerNote = buildCommitment("winner");
    const loserNote = buildCommitment("loser");
    const winnerBid = await adapter.asEuint96(450n);
    const loserBid = await adapter.asEuint96(420n);
    const sellerDeposit = ethers.parseEther("1");
    const finalizeReward = (sellerDeposit * 20n) / 10_000n;

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, winnerNote.identityHash, winnerNote.commitmentHash, winnerNote.claimAuthority.address, {
        value: 600n
      });
    await market
      .connect(bidderTwo)
      .lockShieldedEscrow(1n, loserNote.identityHash, loserNote.commitmentHash, loserNote.claimAuthority.address, {
        value: 500n
      });

    const bidDeadline = BigInt((await time.latest()) + 3600);
    const winnerCoverageProof = await signBidCoverage(
      await vault.getAddress(),
      1n,
      winnerNote.commitmentHash,
      winnerBid,
      bidDeadline,
      winnerNote.claimAuthority
    );
    const loserCoverageProof = await signBidCoverage(
      await vault.getAddress(),
      1n,
      loserNote.commitmentHash,
      loserBid,
      bidDeadline,
      loserNote.claimAuthority
    );

    await market.connect(bidder).placeShieldedBid(1n, winnerNote.commitmentHash, winnerBid, bidDeadline, winnerCoverageProof);
    await market
      .connect(bidderTwo)
      .placeShieldedBid(1n, loserNote.commitmentHash, loserBid, bidDeadline, loserCoverageProof);

    await time.increase(24 * 60 * 60 + 1);
    await market.connect(owner).triggerFinalize(1n);

    const encryptedBids = await collectAllEncryptedBids(market, vault, registry, 1n);
    const { proof } = await buildShieldedResolutionProof(market, avs, 1n, encryptedBids, [
      avsOperatorOne,
      avsOperatorTwo
    ]);

    await expect(market.connect(owner).submitShieldedResolution(1n, winnerNote.identityHash, winnerBid, 450n, proof))
      .to.emit(market, "ResolutionRecorded")
      .withArgs(1n, ethers.ZeroAddress, winnerBid);

    const phase2Details = await market.getAuctionPhase2Details(1n);
    expect(phase2Details[0]).to.equal(ethers.ZeroAddress);

    const winnerPreview = await vault.previewCommitment(winnerNote.commitmentHash);
    const loserPreview = await vault.previewCommitment(loserNote.commitmentHash);
    expect(await registry.winningIdentity(1n)).to.equal(winnerNote.identityHash);
    expect(winnerPreview[1]).to.equal(150n);
    expect(winnerPreview[2]).to.equal(true);
    expect(loserPreview[1]).to.equal(500n);
    expect(loserPreview[2]).to.equal(true);
    expect(await market.previewSellerPayout(1n)).to.equal(sellerDeposit + 450n - finalizeReward);

    await expect(market.connect(seller).claimAsset(1n)).to.be.revertedWithCustomError(
      market,
      "ShieldedWinnerMustClaimPrivately"
    );

    const refundDeadline = (await time.latest()) + 3600;
    const winnerRefundSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      winnerNote.commitmentHash,
      bidder.address,
      BigInt(refundDeadline),
      winnerNote.claimAuthority
    );
    const loserRefundSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      loserNote.commitmentHash,
      bidderTwo.address,
      BigInt(refundDeadline),
      loserNote.claimAuthority
    );

    await vault
      .connect(owner)
      .claimRefundWithAuthorization(
        winnerNote.commitmentHash,
        bidder.address,
        refundDeadline,
        winnerRefundSignature
      );
    await vault
      .connect(owner)
      .claimRefundWithAuthorization(
        loserNote.commitmentHash,
        bidderTwo.address,
        refundDeadline,
        loserRefundSignature
      );
    await market.connect(seller).claimSellerProceeds(1n);
    await market.connect(owner).claimFinalizeReward(1n);
    const assetDeadline = (await time.latest()) + 3600;
    const assetSignature = await signAssetClaim(
      await vault.getAddress(),
      1n,
      winnerNote.commitmentHash,
      bidder.address,
      BigInt(assetDeadline),
      winnerNote.claimAuthority
    );

    await market
      .connect(owner)
      .claimShieldedAssetWithAuthorization(
        1n,
        winnerNote.identityHash,
        bidder.address,
        assetDeadline,
        assetSignature
      );

    expect(await nft.ownerOf(1n)).to.equal(bidder.address);
    expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);
  });
});
