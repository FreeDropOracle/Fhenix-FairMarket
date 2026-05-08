import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { deployPhase2Fixture } from "../helpers/fixtures";
import { buildPhase3ResolutionProof, collectEncryptedBids } from "../helpers/phase3";

async function createShieldedAuctionFixture() {
  const context = await deployPhase2Fixture();
  const { market, nft, owner, seller } = context;

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

  await nft.connect(seller).mint(seller.address);
  await nft.connect(seller).approve(await market.getAddress(), 1n);
  await market
    .connect(seller)
    ["createAuction(address,uint256,uint256,uint256,bool)"](
      await nft.getAddress(),
      1n,
      24 * 60 * 60,
      ethers.parseEther("1"),
      true,
      { value: ethers.parseEther("1") }
    );

  return {
    ...context,
    registry,
    vault
  };
}

function buildShieldedNote(label: string) {
  const secret = ethers.id(`${label}:secret`);
  const nullifier = ethers.id(`${label}:nullifier`);
  const identityHash = ethers.id(`${label}:identity`);
  const commitmentHash = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [secret, nullifier]);
  const claimAuthority = ethers.Wallet.createRandom();

  return {
    claimAuthority,
    commitmentHash,
    identityHash,
    nullifier,
    secret
  };
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

describe("Comprehensive security and settlement suite", function () {
  it("stores bid handles without exposing the bid as a raw bytes32 value", async function () {
    const { adapter, bidder, market, nft, seller } = await loadFixture(deployPhase2Fixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);
    await market
      .connect(seller)
      ["createAuction(address,uint256,uint256,uint256,bool)"](await nft.getAddress(), 1n, 24 * 60 * 60, 1_000n, true, {
        value: 1_000n
      });

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    const bidHandle = await adapter.asEuint32(450);
    await market.connect(bidder).placeBid(1n, bidHandle);

    const storedBid = await market.getEncryptedBid(1n, bidder.address);
    const rawNumericEncoding = ethers.zeroPadValue(ethers.toBeHex(450n), 32);

    expect(storedBid).to.equal(bidHandle);
    expect(storedBid).to.not.equal(rawNumericEncoding);
    expect(BigInt(storedBid)).to.not.equal(450n);
  });

  it("settles a public auction end-to-end and prevents over-withdrawal", async function () {
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, bidderTwo, market, nft, outsider, seller } =
      await loadFixture(createShieldedAuctionFixture);

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market.connect(bidderTwo).lockEscrow(1n, { value: 500n });

    const winnerBid = await adapter.asEuint32(450);
    const losingBid = await adapter.asEuint32(420);
    await market.connect(bidder).placeBid(1n, winnerBid);
    await market.connect(bidderTwo).placeBid(1n, losingBid);

    await time.increase(24 * 60 * 60 + 1);
    await market.connect(outsider).triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [
      avsOperatorOne,
      avsOperatorTwo
    ]);

    await market
      .connect(outsider)
      ["submitResolution(uint256,address,bytes32,uint256,bytes)"](1n, bidder.address, winnerBid, 450n, proof);

    expect((await market.previewRefund(1n, bidder.address))[0]).to.equal(150n);
    expect((await market.previewRefund(1n, bidderTwo.address))[0]).to.equal(500n);

    await market.connect(bidder).claimRefund(1n);
    await expect(market.connect(bidder).claimRefund(1n)).to.be.revertedWithCustomError(market, "NoClaimableBalance");

    await market.connect(bidderTwo).claimRefund(1n);
    await market.connect(seller).claimSellerProceeds(1n);
    await market.connect(outsider).claimFinalizeReward(1n);
    await market.connect(bidder).claimAsset(1n);

    await expect(market.connect(bidder).claimAsset(1n)).to.be.revertedWithCustomError(market, "AssetAlreadyClaimed");
    expect(await nft.ownerOf(1n)).to.equal(bidder.address);
    expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);
  });

  it("settles mixed public and shielded cancellation without residual balances or double claims", async function () {
    const { bidder, bidderTwo, market, outsider, seller, slashedPot, vault } =
      await loadFixture(createShieldedAuctionFixture);
    const note = buildShieldedNote("mixed-cancel");

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market
      .connect(bidderTwo)
      .lockShieldedEscrow(1n, note.identityHash, note.commitmentHash, note.claimAuthority.address, { value: 400n });

    await market.connect(seller).cancelAuction(1n);
    expect((await market.previewRefund(1n, bidder.address))[0]).to.equal(600n);
    expect((await vault.previewCommitment(note.commitmentHash))[1]).to.equal(400n);

    await market.connect(bidder).claimRefund(1n);
    await expect(market.connect(bidder).claimRefund(1n)).to.be.revertedWithCustomError(market, "NoClaimableBalance");

    const deadline = BigInt((await time.latest()) + 3600);
    const refundSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      note.commitmentHash,
      bidderTwo.address,
      deadline,
      note.claimAuthority
    );

    await vault
      .connect(outsider)
      .claimRefundWithAuthorization(note.commitmentHash, bidderTwo.address, deadline, refundSignature);
    await expect(
      vault.connect(outsider).claimRefundWithAuthorization(note.commitmentHash, bidderTwo.address, deadline, refundSignature)
    ).to.be.revertedWithCustomError(vault, "CommitmentAlreadyClaimed");

    await market.connect(seller).claimSellerProceeds(1n);

    expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await slashedPot.getAddress())).to.equal(0n);
  });

  it("voids mixed public and shielded escrow and drains every claimable balance", async function () {
    const { bidder, bidderTwo, market, nft, outsider, seller, slashedPot, vault } =
      await loadFixture(createShieldedAuctionFixture);
    const note = buildShieldedNote("mixed-fallback");

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    await market
      .connect(bidderTwo)
      .lockShieldedEscrow(1n, note.identityHash, note.commitmentHash, note.claimAuthority.address, { value: 400n });

    await time.increase(24 * 60 * 60 + 1);
    await market.connect(outsider).triggerFinalize(1n);
    await time.increase(await market.previewDynamicTimeout());
    await market.connect(bidder).triggerFallbackVoid(1n);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(5n);
    expect(await nft.ownerOf(1n)).to.equal(seller.address);
    expect(await market.previewSellerPayout(1n)).to.equal(0n);

    await market.connect(bidder).claimRefund(1n);

    const deadline = BigInt((await time.latest()) + 3600);
    const refundSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      note.commitmentHash,
      bidderTwo.address,
      deadline,
      note.claimAuthority
    );
    await vault
      .connect(outsider)
      .claimRefundWithAuthorization(note.commitmentHash, bidderTwo.address, deadline, refundSignature);
    await market.connect(outsider).claimFinalizeReward(1n);

    expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await slashedPot.getAddress())).to.equal(0n);
  });
});
