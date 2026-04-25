import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Phase 2 settlement components", function () {
  async function deployFixture() {
    const [owner, outsider, recipient] = await ethers.getSigners();

    const settlementEngineFactory = await ethers.getContractFactory("SettlementEngine");
    const settlementEngine = await settlementEngineFactory.deploy();
    await settlementEngine.waitForDeployment();

    const slashedPotFactory = await ethers.getContractFactory("SlashedPot");
    const slashedPot = await slashedPotFactory.deploy(owner.address, await settlementEngine.getAddress());
    await slashedPot.waitForDeployment();

    const rejectingReceiverFactory = await ethers.getContractFactory("MockRejectingReceiver");
    const rejectingReceiver = await rejectingReceiverFactory.deploy();
    await rejectingReceiver.waitForDeployment();

    return {
      owner,
      outsider,
      recipient,
      settlementEngine,
      slashedPot,
      rejectingReceiver
    };
  }

  it("covers the timeout, slash, payout, and pro-rata math branches in SettlementEngine", async function () {
    const { settlementEngine } = await loadFixture(deployFixture);

    expect(await settlementEngine.computeDynamicTimeout(0n)).to.equal(15n * 60n);
    expect(await settlementEngine.computeDynamicTimeout(1n)).to.equal(15n * 60n);
    expect(await settlementEngine.computeDynamicTimeout(30n)).to.equal(45n * 60n);
    expect(await settlementEngine.computeDynamicTimeout(300n)).to.equal(2n * 60n * 60n);

    expect(await settlementEngine.computeCancellationSlash(0n, 10n, 100n, 1n)).to.equal(0n);
    expect(await settlementEngine.computeCancellationSlash(1000n, 10n, 100n, 0n)).to.equal(0n);
    expect(await settlementEngine.computeCancellationSlash(1000n, 10n, 0n, 1n)).to.equal(1000n);
    expect(await settlementEngine.computeCancellationSlash(1000n, 200n, 100n, 1n)).to.equal(1000n);

    expect(await settlementEngine.computeWinningRefund(100n, 100n)).to.equal(0n);
    expect(await settlementEngine.computeWinningRefund(100n, 150n)).to.equal(0n);
    expect(await settlementEngine.computeWinningRefund(100n, 60n)).to.equal(40n);

    expect(await settlementEngine.computeSellerPayout(1000n, 400n)).to.equal(1400n);
    expect(await settlementEngine.computeSellerCancellationPayout(1000n, 1000n)).to.equal(0n);
    expect(await settlementEngine.computeSellerCancellationPayout(1000n, 250n)).to.equal(750n);

    expect(await settlementEngine.computeProRataShare(0n, 100n, 50n)).to.equal(0n);
    expect(await settlementEngine.computeProRataShare(10n, 0n, 50n)).to.equal(0n);
    expect(await settlementEngine.computeProRataShare(10n, 100n, 0n)).to.equal(0n);
    expect(await settlementEngine.computeProRataShare(25n, 100n, 80n)).to.equal(20n);
  });

  it("guards SlashedPot setup, access control, and successful pull-based compensation claims", async function () {
    const { owner, outsider, recipient, settlementEngine } = await loadFixture(deployFixture);

    const slashedPotFactory = await ethers.getContractFactory("SlashedPot");
    await expect(slashedPotFactory.deploy(owner.address, ethers.ZeroAddress)).to.be.revertedWithCustomError(
      slashedPotFactory,
      "ZeroAddress"
    );

    const slashedPot = await slashedPotFactory.deploy(owner.address, await settlementEngine.getAddress());
    await slashedPot.waitForDeployment();

    await expect(slashedPot.connect(owner).setMarket(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      slashedPot,
      "ZeroAddress"
    );
    await expect(slashedPot.connect(outsider).registerSlash(1n, 100n, { value: 10n })).to.be.revertedWithCustomError(
      slashedPot,
      "NotMarket"
    );

    await slashedPot.connect(owner).setMarket(owner.address);
    await slashedPot.connect(owner).registerSlash(1n, 100n, { value: 30n });
    await slashedPot.connect(owner).registerSlash(1n, 100n, { value: 20n });

    expect(await slashedPot.previewClaim(1n, 50n)).to.equal(25n);
    await expect(slashedPot.connect(owner).claimFor(1n, recipient.address, 50n))
      .to.emit(slashedPot, "CompensationClaimed")
      .withArgs(1n, recipient.address, 25n);
    await expect(slashedPot.connect(owner).claimFor(1n, recipient.address, 50n)).to.be.revertedWithCustomError(
      slashedPot,
      "CompensationAlreadyClaimed"
    );
  });

  it("covers zero-amount claims and transfer failures in SlashedPot", async function () {
    const { owner, rejectingReceiver, slashedPot } = await loadFixture(deployFixture);

    await slashedPot.connect(owner).setMarket(owner.address);
    await slashedPot.connect(owner).registerSlash(2n, 100n, { value: 1n });

    expect(await slashedPot.connect(owner).claimFor.staticCall(2n, owner.address, 0n)).to.equal(0n);
    await slashedPot.connect(owner).claimFor(2n, owner.address, 0n);
    expect(await slashedPot.hasClaimedCompensation(2n, owner.address)).to.equal(true);

    await slashedPot.connect(owner).registerSlash(3n, 100n, { value: 100n });
    await expect(
      slashedPot.connect(owner).claimFor(3n, await rejectingReceiver.getAddress(), 100n)
    ).to.be.revertedWithCustomError(slashedPot, "NativeTransferFailed");
  });
});
