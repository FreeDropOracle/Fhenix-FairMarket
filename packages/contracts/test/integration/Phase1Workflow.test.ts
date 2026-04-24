import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Phase 1 integration workflow", function () {
  async function deployFixture() {
    const [owner, seller, bidder] = await ethers.getSigners();

    const adapterFactory = await ethers.getContractFactory("CofheAdapter");
    const adapter = await adapterFactory.deploy();
    await adapter.waitForDeployment();

    const implementationFactory = await ethers.getContractFactory("FhenixFairMarket");
    const implementation = await implementationFactory.deploy();
    await implementation.waitForDeployment();

    const proxyFactory = await ethers.getContractFactory("FhenixFairMarketProxy");
    const initData = implementationFactory.interface.encodeFunctionData("initialize", [
      await adapter.getAddress(),
      owner.address,
      ethers.ZeroAddress
    ]);

    const proxy = await proxyFactory.deploy(await implementation.getAddress(), initData);
    await proxy.waitForDeployment();

    const market = implementationFactory.attach(await proxy.getAddress());

    const nftFactory = await ethers.getContractFactory("MockERC721");
    const nft = await nftFactory.deploy();
    await nft.waitForDeployment();

    const mockCofheFactory = await ethers.getContractFactory("MockCofhe");
    const mockCofhe = await mockCofheFactory.deploy();
    await mockCofhe.waitForDeployment();

    return {
      owner,
      seller,
      bidder,
      adapter,
      market,
      nft,
      mockCofhe
    };
  }

  it("executes the Phase 1 scaffold from escrow to encrypted resolution", async function () {
    const { owner, seller, bidder, adapter, market, nft, mockCofhe } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await market.connect(seller).createAuction(await nft.getAddress(), 1n, 24 * 60 * 60, 1_000n, true, {
      value: 1_000n
    });

    await market.connect(bidder).lockEscrow(1n, { value: 600n });
    expect(await market.escrowBalances(1n, bidder.address)).to.equal(600n);

    const encryptedWinningBid = await adapter.asEuint32(450);
    expect(await adapter.verifyEncryptedBidCoverage(encryptedWinningBid, 600n)).to.equal(true);

    const encryptedWinner = await adapter.select(
      await adapter.asEbool(true),
      encryptedWinningBid,
      await adapter.asEuint32(300)
    );
    expect(await mockCofhe.expectPlaintext(encryptedWinner, 450)).to.equal(true);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);
    await market.connect(owner).submitResolution(1n, encryptedWinner, 450n);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(3n);
    expect(auction[8]).to.equal(encryptedWinner);
    expect(auction[9]).to.equal(450n);
    expect(await nft.ownerOf(1n)).to.equal(await market.getAddress());
  });
});
