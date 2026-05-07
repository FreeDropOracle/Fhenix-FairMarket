import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { buildPhase3ResolutionProof, collectEncryptedBids } from "../helpers/phase3";
import { deployPhase2Fixture } from "../helpers/fixtures";

function buildShieldedNote(label: string) {
  const identityHash = ethers.id(`${label}:identity`);
  const secret = ethers.encodeBytes32String(`${label}-secret`.slice(0, 31));
  const nullifier = ethers.encodeBytes32String(`${label}-nullifier`.slice(0, 31));
  const commitment = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [secret, nullifier]);
  const claimAuthority = ethers.Wallet.createRandom();

  return {
    identityHash,
    secret,
    nullifier,
    commitment,
    claimAuthority
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
  committedAmount: bigint,
  deadline: bigint,
  prover: ethers.Wallet
) {
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "address", "uint256", "bytes32", "bytes32", "uint256", "uint256"],
      [verifierAddress, 31337n, vaultAddress, auctionId, commitmentHash, encryptedBid, committedAmount, deadline]
    )
  );

  return prover.signMessage(ethers.getBytes(digest));
}

describe("ShieldedEscrowVault Privacy Phase 1", function () {
  async function createShieldedFixture() {
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
        {
          value: ethers.parseEther("1")
        }
      );

    return {
      ...context,
      vault,
      registry
    };
  }

  it("locks shielded escrow by commitment without creating a public bidder balance", async function () {
    const { bidder, market, registry, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("lock-escrow-1");

    await expect(
      market.connect(bidder).lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, {
        value: ethers.parseEther("2")
      })
    )
      .to.emit(market, "ShieldedEscrowLocked")
      .withArgs(1n, note.commitment, ethers.parseEther("2"));

    const preview = await vault.previewCommitment(note.commitment);
    expect(preview[0]).to.equal(1n);
    expect(preview[1]).to.equal(ethers.parseEther("2"));
    expect(preview[2]).to.equal(false);
    expect(preview[3]).to.equal(false);

    expect(await market.escrowBalances(1n, bidder.address)).to.equal(0n);
    expect(await vault.hasEscrowForAuction(1n)).to.equal(true);
    expect(await vault.totalEscrowForAuction(1n)).to.equal(ethers.parseEther("2"));
    expect(await registry.commitmentForIdentity(1n, note.identityHash)).to.equal(note.commitment);
    expect(await vault.claimAuthorityForCommitment(note.commitment)).to.equal(note.claimAuthority.address);

    const phase2Details = await market.getAuctionPhase2Details(1n);
    expect(phase2Details[1]).to.equal(0n);
  });

  it("releases shielded principal plus slash compensation after seller cancellation", async function () {
    const { bidder, market, outsider, seller, settlementEngine, slashedPot, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("cancel-escrow-2");
    const shieldedAmount = ethers.parseEther("2");

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, { value: shieldedAmount });

    const auction = await market.getAuction(1n);
    const details = await market.getAuctionPhase2Details(1n);
    const now = BigInt(await time.latest());
    const createdAt = BigInt(details[3]);
    const endTime = BigInt(auction[3]);
    const expectedSlash = await settlementEngine.computeCancellationSlash(
      BigInt(auction[4]),
      now - createdAt,
      endTime - createdAt,
      shieldedAmount
    );

    await expect(market.connect(seller).cancelAuction(1n))
      .to.emit(market, "ShieldedRefundPathOpened")
      .withArgs(1n);

    const preview = await vault.previewCommitment(note.commitment);
    expect(preview[2]).to.equal(true);

    const deadline = BigInt((await time.latest()) + 3600);
    const refundSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      note.commitment,
      bidder.address,
      deadline,
      note.claimAuthority
    );

    await expect(() =>
      vault.connect(outsider).claimRefundWithAuthorization(note.commitment, bidder.address, deadline, refundSignature)
    ).to.changeEtherBalances([vault, bidder, slashedPot], [-(shieldedAmount + expectedSlash), shieldedAmount + expectedSlash, 0n]);

    await expect(
      vault.connect(outsider).claimRefundWithAuthorization(note.commitment, bidder.address, deadline, refundSignature)
    ).to.be.revertedWithCustomError(vault, "CommitmentAlreadyClaimed");
  });

  it("routes the full seller slash into shielded refunds when fallback void hits a shielded-only auction", async function () {
    const { bidder, market, nft, owner, outsider, seller, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("fallback-void-shielded-only");
    const shieldedAmount = ethers.parseEther("2");

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, { value: shieldedAmount });

    const auction = await market.getAuction(1n);
    const sellerDeposit = BigInt(auction[4]);
    const finalizeReward = (sellerDeposit * 20n) / 10_000n;

    await time.increase(24 * 60 * 60 + 1);
    await market.connect(owner).triggerFinalize(1n);
    await time.increase(await market.previewDynamicTimeout());
    await market.triggerFallbackVoid(1n);

    expect(await nft.ownerOf(1n)).to.equal(seller.address);
    expect(await market.previewSellerPayout(1n)).to.equal(0n);
    expect(await vault.totalEscrowForAuction(1n)).to.equal(shieldedAmount);

    const deadline = BigInt((await time.latest()) + 3600);
    const refundSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      note.commitment,
      bidder.address,
      deadline,
      note.claimAuthority
    );

    await expect(() =>
      vault.connect(outsider).claimRefundWithAuthorization(note.commitment, bidder.address, deadline, refundSignature)
    ).to.changeEtherBalances(
      [vault, bidder],
      [-(shieldedAmount + sellerDeposit - finalizeReward), shieldedAmount + sellerDeposit - finalizeReward]
    );

    await expect(market.connect(seller).claimSellerProceeds(1n)).to.be.revertedWithCustomError(
      market,
      "NoClaimableBalance"
    );

    await market.connect(owner).claimFinalizeReward(1n);
    expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);
  });

  it("opens the shielded refund path after a no-winner finalization and lets the seller reclaim the NFT", async function () {
    const { avs, avsOperatorOne, avsOperatorTwo, bidder, market, nft, outsider, owner, seller, vault } =
      await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("no-winner-3");
    const shieldedAmount = ethers.parseEther("1");

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, { value: shieldedAmount });

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [avsOperatorOne, avsOperatorTwo]);

    await expect(
      market.connect(owner)["submitResolution(uint256,address,bytes32,uint256,bytes)"](
        1n,
        ethers.ZeroAddress,
        ethers.ZeroHash,
        0n,
        proof
      )
    )
      .to.emit(market, "ShieldedRefundPathOpened")
      .withArgs(1n);

    const preview = await vault.previewCommitment(note.commitment);
    expect(preview[2]).to.equal(true);

    const deadline = BigInt((await time.latest()) + 3600);
    const refundSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      note.commitment,
      bidder.address,
      deadline,
      note.claimAuthority
    );

    await expect(() =>
      vault.connect(outsider).claimRefundWithAuthorization(note.commitment, bidder.address, deadline, refundSignature)
    ).to.changeEtherBalances(
      [vault, bidder],
      [-shieldedAmount, shieldedAmount]
    );

    await market.connect(seller).claimAsset(1n);
    expect(await nft.ownerOf(1n)).to.equal(seller.address);
  });

  it("rejects expired or forged authorized refund claims", async function () {
    const { bidder, market, seller, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("auth-reject-4");
    const shieldedAmount = ethers.parseEther("1");

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, { value: shieldedAmount });

    await market.connect(seller).cancelAuction(1n);

    const expiredDeadline = BigInt(await time.latest());
    const expiredSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      note.commitment,
      bidder.address,
      expiredDeadline,
      note.claimAuthority
    );

    await time.increase(1);
    await expect(
      vault.connect(seller).claimRefundWithAuthorization(note.commitment, bidder.address, expiredDeadline, expiredSignature)
    ).to.be.revertedWithCustomError(vault, "ClaimAuthorizationExpired");

    const validDeadline = BigInt((await time.latest()) + 3600);
    const forgedSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      note.commitment,
      bidder.address,
      validDeadline,
      ethers.Wallet.createRandom()
    );

    await expect(
      vault.connect(seller).claimRefundWithAuthorization(note.commitment, bidder.address, validDeadline, forgedSignature)
    ).to.be.revertedWithCustomError(vault, "InvalidClaimAuthority");
  });

  it("blocks calldata-copyable legacy witness refund claims while authorization still works", async function () {
    const { bidder, market, outsider, seller, settlementEngine, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("legacy-refund-front-run");
    const shieldedAmount = ethers.parseEther("1");

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, { value: shieldedAmount });

    const auction = await market.getAuction(1n);
    const details = await market.getAuctionPhase2Details(1n);
    const now = BigInt(await time.latest());
    const createdAt = BigInt(details[3]);
    const endTime = BigInt(auction[3]);
    const expectedSlash = await settlementEngine.computeCancellationSlash(
      BigInt(auction[4]),
      now - createdAt,
      endTime - createdAt,
      shieldedAmount
    );

    await market.connect(seller).cancelAuction(1n);

    await expect(
      vault.connect(outsider).claimRefund(note.secret, note.nullifier, outsider.address)
    ).to.be.revertedWithCustomError(vault, "LegacyWitnessClaimsDisabled");

    const deadline = BigInt((await time.latest()) + 3600);
    const refundSignature = await signRefundClaim(
      await vault.getAddress(),
      1n,
      note.commitment,
      bidder.address,
      deadline,
      note.claimAuthority
    );

    await expect(() =>
      vault.connect(outsider).claimRefundWithAuthorization(note.commitment, bidder.address, deadline, refundSignature)
    ).to.changeEtherBalances([vault, bidder], [-(shieldedAmount + expectedSlash), shieldedAmount + expectedSlash]);
  });

  it("keeps note metadata readable without exposing raw shielded amounts to unauthorized callers", async function () {
    const { adapter, bidder, market, outsider, owner, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("preview-gate-5");

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, {
        value: ethers.parseEther("1")
      });

    const metadata = await vault.commitmentState(note.commitment);
    expect(metadata[0]).to.equal(1n);
    expect(metadata[1]).to.equal(false);
    expect(metadata[2]).to.equal(false);

    await expect(vault.connect(outsider).previewCommitment(note.commitment)).to.be.revertedWithCustomError(
      vault,
      "NotPreviewReader"
    );
    await expect(
      vault.connect(outsider).verifyPlaintextBidCoverage(note.commitment, ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(vault, "NotPreviewReader");

    const preview = await vault.connect(owner).previewCommitment(note.commitment);
    expect(preview[1]).to.equal(ethers.parseEther("1"));
    expect(
      await vault
        .connect(owner)
        .verifyEncryptedBidCoverage(note.commitment, await adapter.asEuint96(ethers.parseEther("0.75")), await adapter.getAddress())
    ).to.equal(true);
    expect(await vault.connect(owner).verifyPlaintextBidCoverage(note.commitment, ethers.parseEther("2"))).to.equal(false);
  });

  it("rejects legacy claim-authority bid coverage proofs when no verifier is configured", async function () {
    const { adapter, bidder, market, outsider, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("proof-carried-6");

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, {
        value: ethers.parseEther("1")
      });

    const encryptedBid = await adapter.asEuint96(ethers.parseEther("0.75"));
    const deadline = BigInt((await time.latest()) + 3600);
    const proof = await signBidCoverage(
      await vault.getAddress(),
      1n,
      note.commitment,
      encryptedBid,
      deadline,
      note.claimAuthority
    );

    await expect(
      vault.connect(outsider).verifyBidCoverageProof(note.commitment, encryptedBid, deadline, proof)
    ).to.be.revertedWithCustomError(vault, "InvalidShieldedBidProof");
  });

  it("can route shielded bid proofs through an external verifier boundary", async function () {
    const { adapter, bidder, market, outsider, owner, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("verifier-boundary-7");
    const prover = ethers.Wallet.createRandom();

    const verifierFactory = await ethers.getContractFactory("MockShieldedBidVerifier");
    const verifier = await verifierFactory.deploy(owner.address, prover.address);
    await verifier.waitForDeployment();
    await vault.connect(owner).setShieldedBidVerifier(await verifier.getAddress());

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, {
        value: ethers.parseEther("1")
      });

    const encryptedBid = await adapter.asEuint96(ethers.parseEther("0.75"));
    const committedAmount = ethers.parseEther("1");
    const deadline = BigInt((await time.latest()) + 3600);
    const verifierProof = await signVerifierCoverage(
      await verifier.getAddress(),
      await vault.getAddress(),
      1n,
      note.commitment,
      encryptedBid,
      committedAmount,
      deadline,
      prover
    );

    await expect(vault.connect(outsider).verifyBidCoverageProof(note.commitment, encryptedBid, deadline, verifierProof)).to
      .not.be.reverted;
    await expect(
      vault.connect(outsider).verifyBidCoverageProof(
        note.commitment,
        encryptedBid,
        deadline,
        await signVerifierCoverage(
          await verifier.getAddress(),
          await vault.getAddress(),
          1n,
          note.commitment,
          encryptedBid,
          committedAmount,
          deadline,
          ethers.Wallet.createRandom()
        )
      )
    ).to.be.revertedWithCustomError(vault, "InvalidShieldedBidProof");
  });

  it("rejects verifier proofs when the encrypted bid exceeds committed escrow", async function () {
    const { adapter, bidder, market, outsider, owner, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("verifier-undercovered-8");
    const prover = ethers.Wallet.createRandom();

    const verifierFactory = await ethers.getContractFactory("MockShieldedBidVerifier");
    const verifier = await verifierFactory.deploy(owner.address, prover.address);
    await verifier.waitForDeployment();
    await vault.connect(owner).setShieldedBidVerifier(await verifier.getAddress());

    await market.connect(bidder).lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, {
      value: 1n
    });

    const encryptedBid = await adapter.asEuint96(450n);
    const deadline = BigInt((await time.latest()) + 3600);
    const verifierProof = await signVerifierCoverage(
      await verifier.getAddress(),
      await vault.getAddress(),
      1n,
      note.commitment,
      encryptedBid,
      1n,
      deadline,
      prover
    );

    await expect(
      vault.connect(outsider).verifyBidCoverageProof(note.commitment, encryptedBid, deadline, verifierProof)
    ).to.be.revertedWithCustomError(vault, "InvalidShieldedBidProof");
  });
});
