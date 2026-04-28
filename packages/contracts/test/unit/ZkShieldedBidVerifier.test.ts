import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { createPhase2AuctionFixture } from "../helpers/fixtures";
import { loadDemoProofBytes } from "../helpers/zkProof";

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

describe("ShieldedEscrowVault zk verifier integration", function () {
  async function createShieldedFixture() {
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

  it("routes a generated Groth16 proof through the test-only verifier wrapper", async function () {
    const { bidder, market, outsider, owner, vault } = await loadFixture(createShieldedFixture);
    const note = buildShieldedNote("zk-verifier-8");

    const verifierFactory = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await verifierFactory.deploy();
    await verifier.waitForDeployment();

    const zkVerifierFactory = await ethers.getContractFactory("ZkShieldedBidVerifier");
    const zkVerifier = await zkVerifierFactory.deploy(await verifier.getAddress());
    await zkVerifier.waitForDeployment();
    await vault.connect(owner).setShieldedBidVerifier(await zkVerifier.getAddress());

    await market
      .connect(bidder)
      .lockShieldedEscrow(1n, note.identityHash, note.commitment, note.claimAuthority.address, {
        value: ethers.parseEther("1")
      });

    const encryptedBid = "0x" + "10".padStart(64, "0");
    const deadline = BigInt((await time.latest()) + 3600);
    const proofBytes = loadDemoProofBytes();

    await expect(vault.connect(outsider).verifyBidCoverageProof(note.commitment, encryptedBid, deadline, proofBytes)).to.not.be
      .reverted;

    const invalidProof = proofBytes.slice(0, proofBytes.length - 1);
    await expect(vault.connect(outsider).verifyBidCoverageProof(note.commitment, encryptedBid, deadline, invalidProof)).to.be.reverted;
  });
});
