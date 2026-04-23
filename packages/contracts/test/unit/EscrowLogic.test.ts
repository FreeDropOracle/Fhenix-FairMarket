import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("FhenixFairMarket Phase 1", function () {
  async function deployFixture() {
    const [owner, seller, bidder, outsider] = await ethers.getSigners();

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
      outsider,
      adapter,
      implementation,
      proxy,
      market,
      nft,
      mockCofhe
    };
  }

  async function createAuctionFixture() {
    const context = await deployFixture();
    const { market, nft, seller } = context;

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await market
      .connect(seller)
      .createAuction(await nft.getAddress(), 1n, 24 * 60 * 60, ethers.parseEther("1"), true, {
        value: ethers.parseEther("1")
      });

    return context;
  }

  it("initializes once through the proxy", async function () {
    const { market, adapter, owner } = await loadFixture(deployFixture);

    await expect(market.initialize(await adapter.getAddress(), owner.address, ethers.ZeroAddress)).to.be.reverted;
    expect(await market.contractVersion()).to.equal("phase1");
  });

  it("rejects invalid initialization parameters on a fresh implementation", async function () {
    const { adapter, owner } = await loadFixture(deployFixture);

    const implementationFactory = await ethers.getContractFactory("FhenixFairMarket");

    const rawImplementationA = await implementationFactory.deploy();
    await rawImplementationA.waitForDeployment();
    await expect(
      rawImplementationA.initialize(ethers.ZeroAddress, owner.address, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(rawImplementationA, "ZeroAddress");

    const rawImplementationB = await implementationFactory.deploy();
    await rawImplementationB.waitForDeployment();
    await expect(
      rawImplementationB.initialize(await adapter.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(rawImplementationB, "ZeroAddress");
  });

  it("creates an auction and transfers the NFT into escrow", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await expect(
      market
        .connect(seller)
        .createAuction(await nft.getAddress(), 1n, 24 * 60 * 60, ethers.parseEther("1"), true, {
          value: ethers.parseEther("1")
        })
    )
      .to.emit(market, "AuctionCreated")
      .withArgs(1n, seller.address, await nft.getAddress(), 1n, anyValue, ethers.parseEther("1"), true);

    const auction = await market.getAuction(1n);
    expect(auction[0]).to.equal(await nft.getAddress());
    expect(auction[2]).to.equal(seller.address);
    expect(auction[5]).to.equal(1n);
    expect(await nft.ownerOf(1n)).to.equal(await market.getAddress());
  });

  it("rejects auction creation when the seller is not the NFT owner", async function () {
    const { market, nft, outsider } = await loadFixture(deployFixture);

    await nft.mint(outsider.address);
    await nft.connect(outsider).approve(await market.getAddress(), 1n);

    await expect(
      market.createAuction(await nft.getAddress(), 1n, 24 * 60 * 60, ethers.parseEther("1"), false, {
        value: ethers.parseEther("1")
      })
    ).to.be.revertedWithCustomError(market, "NotNFTOwner");
  });

  it("rejects auction creation with a zero NFT address", async function () {
    const { market } = await loadFixture(deployFixture);

    await expect(
      market.createAuction(ethers.ZeroAddress, 1n, 24 * 60 * 60, ethers.parseEther("1"), false, {
        value: ethers.parseEther("1")
      })
    ).to.be.revertedWithCustomError(market, "ZeroAddress");
  });

  it("rejects auction creation with durations outside the configured bounds", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await expect(
      market.connect(seller).createAuction(await nft.getAddress(), 1n, 60, ethers.parseEther("1"), false, {
        value: ethers.parseEther("1")
      })
    ).to.be.revertedWithCustomError(market, "InvalidDuration");

    await expect(
      market
        .connect(seller)
        .createAuction(await nft.getAddress(), 1n, 31 * 24 * 60 * 60, ethers.parseEther("1"), false, {
          value: ethers.parseEther("1")
        })
    ).to.be.revertedWithCustomError(market, "InvalidDuration");
  });

  it("rejects auction creation with zero or mismatched seller deposits", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await expect(
      market.connect(seller).createAuction(await nft.getAddress(), 1n, 24 * 60 * 60, 0n, false, { value: 0n })
    ).to.be.revertedWithCustomError(market, "IncorrectSellerDeposit");

    await expect(
      market.connect(seller).createAuction(await nft.getAddress(), 1n, 24 * 60 * 60, ethers.parseEther("2"), false, {
        value: ethers.parseEther("1")
      })
    ).to.be.revertedWithCustomError(market, "IncorrectSellerDeposit");
  });

  it("rejects auction creation when the NFT is not approved", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);

    await expect(
      market
        .connect(seller)
        .createAuction(await nft.getAddress(), 1n, 24 * 60 * 60, ethers.parseEther("1"), false, {
          value: ethers.parseEther("1")
        })
    ).to.be.revertedWithCustomError(market, "NFTNotApproved");
  });

  it("locks public escrow while the auction is active", async function () {
    const { market, bidder } = await loadFixture(createAuctionFixture);

    await expect(market.connect(bidder).lockEscrow(1n, { value: ethers.parseEther("2") }))
      .to.emit(market, "EscrowLocked")
      .withArgs(1n, bidder.address, ethers.parseEther("2"));

    expect(await market.escrowBalances(1n, bidder.address)).to.equal(ethers.parseEther("2"));
  });

  it("rejects escrow on missing auctions, zero-value deposits, and expired auctions", async function () {
    const { market, bidder } = await loadFixture(createAuctionFixture);

    await expect(market.connect(bidder).lockEscrow(999n, { value: 1n })).to.be.revertedWithCustomError(
      market,
      "AuctionDoesNotExist"
    );

    await expect(market.connect(bidder).lockEscrow(1n, { value: 0n })).to.be.revertedWithCustomError(
      market,
      "ZeroValue"
    );

    await time.increase(24 * 60 * 60 + 1);
    await expect(market.connect(bidder).lockEscrow(1n, { value: 1n })).to.be.revertedWithCustomError(
      market,
      "AuctionAlreadyEnded"
    );
  });

  it("transitions from active to resolving after the end time", async function () {
    const { market, outsider } = await loadFixture(createAuctionFixture);

    await time.increase(24 * 60 * 60 + 1);

    await expect(market.connect(outsider).triggerFinalize(1n))
      .to.emit(market, "AuctionStateChanged")
      .withArgs(1n, 1n, 2n);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(2n);
  });

  it("rejects finalize calls before the auction has ended", async function () {
    const { market } = await loadFixture(createAuctionFixture);

    await expect(market.triggerFinalize(1n)).to.be.revertedWithCustomError(market, "AuctionStillRunning");
  });

  it("records a minimal resolution from the owner once resolving", async function () {
    const { market, owner } = await loadFixture(createAuctionFixture);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    const cipher = ethers.encodeBytes32String("winner");
    await expect(market.connect(owner).submitResolution(1n, cipher, 77n))
      .to.emit(market, "ResolutionRecorded")
      .withArgs(1n, cipher, 77n);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(3n);
    expect(auction[8]).to.equal(cipher);
    expect(auction[9]).to.equal(77n);
  });

  it("rejects resolution calls when the auction is not resolving", async function () {
    const { market, owner } = await loadFixture(createAuctionFixture);

    await expect(
      market.connect(owner).submitResolution(1n, ethers.encodeBytes32String("winner"), 10n)
    ).to.be.revertedWithCustomError(market, "UnexpectedAuctionState");
  });

  it("allows the seller to cancel before the auction ends", async function () {
    const { market, nft, seller } = await loadFixture(createAuctionFixture);

    await market.connect(seller).cancelAuction(1n);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(4n);
    expect(await nft.ownerOf(1n)).to.equal(seller.address);
  });

  it("rejects cancellation by non-sellers or after the auction end", async function () {
    const { market, outsider, seller } = await loadFixture(createAuctionFixture);

    await expect(market.connect(outsider).cancelAuction(1n)).to.be.revertedWithCustomError(
      market,
      "NotAuctionSeller"
    );

    await time.increase(24 * 60 * 60 + 1);
    await expect(market.connect(seller).cancelAuction(1n)).to.be.revertedWithCustomError(
      market,
      "AuctionAlreadyEnded"
    );
  });

  it("allows the owner to void a stuck resolving auction", async function () {
    const { market, nft, seller } = await loadFixture(createAuctionFixture);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);
    await market.triggerFallbackVoid(1n);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(5n);
    expect(await nft.ownerOf(1n)).to.equal(seller.address);
  });

  it("rejects fallback void when the auction is not in resolving state", async function () {
    const { market } = await loadFixture(createAuctionFixture);

    await expect(market.triggerFallbackVoid(1n)).to.be.revertedWithCustomError(market, "UnexpectedAuctionState");
  });

  it("upgrades through UUPS only when called by the owner", async function () {
    const { market, proxy, bidder } = await loadFixture(deployFixture);

    const v2Factory = await ethers.getContractFactory("MockFhenixFairMarketV2");
    const v2Implementation = await v2Factory.deploy();
    await v2Implementation.waitForDeployment();

    await expect(
      market.connect(bidder).upgradeToAndCall(await v2Implementation.getAddress(), "0x")
    ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");

    await market.upgradeToAndCall(await v2Implementation.getAddress(), "0x");

    const upgraded = v2Factory.attach(await proxy.getAddress());
    expect(await upgraded.contractVersion()).to.equal("phase1-v2");
    expect(await upgraded.versionMarker()).to.equal(2n);
  });

  it("keeps adapter behavior deterministic in the local mock path", async function () {
    const { adapter, mockCofhe } = await loadFixture(deployFixture);

    const ciphertext = await adapter.asEuint32(42);
    expect(await adapter.lte(ciphertext, 100)).to.equal(true);
    expect(await adapter.seal(ciphertext, ethers.ZeroAddress)).to.not.equal(ethers.ZeroHash);
    expect(await adapter.getRawCiphertext(ciphertext)).to.equal(ciphertext);
    expect(await mockCofhe.asEuint32(42)).to.equal(ciphertext);
    expect(await mockCofhe.lte(ciphertext, 100)).to.equal(true);
    expect(await mockCofhe.seal(ciphertext, ethers.ZeroAddress)).to.not.equal(ethers.ZeroHash);
    expect(await mockCofhe.getRawCiphertext(ciphertext)).to.equal(ciphertext);
    expect(await mockCofhe.expectPlaintext(ciphertext, 42)).to.equal(true);
  });
});
