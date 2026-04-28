import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

async function deployRegistryFixture() {
  const [owner, market, outsider] = await ethers.getSigners();

  const registryFactory = await ethers.getContractFactory("ShieldedIdentityRegistry");
  const registry = await registryFactory.deploy(owner.address);
  await registry.waitForDeployment();
  await registry.connect(owner).setMarket(market.address);

  return {
    owner,
    market,
    outsider,
    registry
  };
}

describe("ShieldedIdentityRegistry Phase 3", function () {
  it("binds a shielded identity to a commitment and preserves the one-to-one mapping", async function () {
    const { market, registry } = await loadFixture(deployRegistryFixture);
    const identityHash = ethers.id("identity-a");
    const commitmentHash = ethers.id("commitment-a");

    await expect(registry.connect(market).bindIdentity(1n, identityHash, commitmentHash))
      .to.emit(registry, "ShieldedIdentityBound")
      .withArgs(1n, identityHash, commitmentHash);

    expect(await registry.commitmentForIdentity(1n, identityHash)).to.equal(commitmentHash);
    expect(await registry.identityForCommitment(1n, commitmentHash)).to.equal(identityHash);

    await expect(registry.connect(market).bindIdentity(1n, identityHash, commitmentHash)).to.not.be.reverted;
  });

  it("rejects rebinding an identity or commitment to a different partner", async function () {
    const { market, registry } = await loadFixture(deployRegistryFixture);
    const identityHash = ethers.id("identity-a");
    const commitmentHash = ethers.id("commitment-a");
    const otherCommitmentHash = ethers.id("commitment-b");
    const otherIdentityHash = ethers.id("identity-b");

    await registry.connect(market).bindIdentity(1n, identityHash, commitmentHash);

    await expect(
      registry.connect(market).bindIdentity(1n, identityHash, otherCommitmentHash)
    ).to.be.revertedWithCustomError(registry, "IdentityAlreadyBound");

    await expect(
      registry.connect(market).bindIdentity(1n, otherIdentityHash, commitmentHash)
    ).to.be.revertedWithCustomError(registry, "CommitmentAlreadyBound");
  });

  it("marks a winning identity only for a previously bound alias and keeps it stable", async function () {
    const { market, registry } = await loadFixture(deployRegistryFixture);
    const identityHash = ethers.id("winner-identity");
    const commitmentHash = ethers.id("winner-commitment");
    const otherIdentityHash = ethers.id("other-identity");

    await registry.connect(market).bindIdentity(4n, identityHash, commitmentHash);
    await expect(registry.connect(market).markWinningIdentity(4n, identityHash))
      .to.emit(registry, "WinningIdentityMarked")
      .withArgs(4n, identityHash, commitmentHash);

    expect(await registry.winningIdentity(4n)).to.equal(identityHash);

    await expect(registry.connect(market).markWinningIdentity(4n, otherIdentityHash)).to.be.revertedWithCustomError(
      registry,
      "IdentityNotBound"
    );
  });

  it("rejects non-market callers and zero-value inputs", async function () {
    const { outsider, registry } = await loadFixture(deployRegistryFixture);

    await expect(
      registry.connect(outsider).bindIdentity(1n, ethers.id("identity"), ethers.id("commitment"))
    ).to.be.revertedWithCustomError(registry, "NotMarket");

    await expect(
      registry.connect(outsider).markWinningIdentity(1n, ethers.id("identity"))
    ).to.be.revertedWithCustomError(registry, "NotMarket");
  });
});
