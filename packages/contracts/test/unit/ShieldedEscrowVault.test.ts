import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { buildPhase3ResolutionProof, collectEncryptedBids } from "../helpers/phase3";
import { createPhase2AuctionFixture } from "../helpers/fixtures";

describe("ShieldedEscrowVault Privacy Phase 1", function () {
  async function createShieldedFixture() {
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

  it("locks shielded escrow by commitment without creating a public bidder balance", async function () {
    const { bidder, market, vault } = await loadFixture(createShieldedFixture);

    const secret = ethers.encodeBytes32String("shielded-secret-1");
    const nullifier = ethers.encodeBytes32String("shielded-nullifier-1");
    const commitment = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [secret, nullifier]);

    await expect(market.connect(bidder).lockShieldedEscrow(1n, commitment, { value: ethers.parseEther("2") }))
      .to.emit(market, "ShieldedEscrowLocked")
      .withArgs(1n, commitment, ethers.parseEther("2"));

    const preview = await vault.previewCommitment(commitment);
    expect(preview[0]).to.equal(1n);
    expect(preview[1]).to.equal(ethers.parseEther("2"));
    expect(preview[2]).to.equal(false);
    expect(preview[3]).to.equal(false);

    expect(await market.escrowBalances(1n, bidder.address)).to.equal(0n);
    expect(await vault.totalEscrowForAuction(1n)).to.equal(ethers.parseEther("2"));

    const phase2Details = await market.getAuctionPhase2Details(1n);
    expect(phase2Details[1]).to.equal(ethers.parseEther("2"));
  });

  it("releases shielded principal plus slash compensation after seller cancellation", async function () {
    const { bidder, market, outsider, seller, settlementEngine, slashedPot, vault } = await loadFixture(createShieldedFixture);

    const secret = ethers.encodeBytes32String("shielded-secret-2");
    const nullifier = ethers.encodeBytes32String("shielded-nullifier-2");
    const commitment = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [secret, nullifier]);
    const shieldedAmount = ethers.parseEther("2");

    await market.connect(bidder).lockShieldedEscrow(1n, commitment, { value: shieldedAmount });

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

    const preview = await vault.previewCommitment(commitment);
    expect(preview[2]).to.equal(true);
    expect(await slashedPot.previewClaim(1n, shieldedAmount)).to.equal(expectedSlash);

    await expect(() => vault.connect(outsider).claimRefund(secret, nullifier, bidder.address)).to.changeEtherBalances(
      [vault, bidder, slashedPot],
      [-shieldedAmount, shieldedAmount + expectedSlash, -expectedSlash]
    );

    await expect(vault.connect(outsider).claimRefund(secret, nullifier, bidder.address)).to.be.revertedWithCustomError(
      vault,
      "NullifierAlreadySpent"
    );
  });

  it("opens the shielded refund path after a no-winner finalization and lets the seller reclaim the NFT", async function () {
    const { avs, avsOperatorOne, avsOperatorTwo, bidder, market, nft, outsider, owner, seller, vault } =
      await loadFixture(createShieldedFixture);

    const secret = ethers.encodeBytes32String("shielded-secret-3");
    const nullifier = ethers.encodeBytes32String("shielded-nullifier-3");
    const commitment = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [secret, nullifier]);
    const shieldedAmount = ethers.parseEther("1");

    await market.connect(bidder).lockShieldedEscrow(1n, commitment, { value: shieldedAmount });

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

    const preview = await vault.previewCommitment(commitment);
    expect(preview[2]).to.equal(true);

    await expect(() => vault.connect(outsider).claimRefund(secret, nullifier, bidder.address)).to.changeEtherBalances(
      [vault, bidder],
      [-shieldedAmount, shieldedAmount]
    );

    await market.connect(seller).claimAsset(1n);
    expect(await nft.ownerOf(1n)).to.equal(seller.address);
  });
});
