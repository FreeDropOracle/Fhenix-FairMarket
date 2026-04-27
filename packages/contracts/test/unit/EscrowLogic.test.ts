import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

import { createPhase2AuctionFixture, deployPhase2Fixture } from "../helpers/fixtures";
import { buildPhase3ResolutionProof, collectEncryptedBids } from "../helpers/phase3";

describe("FhenixFairMarket Phase 1", function () {
  async function deployFixture() {
    return deployPhase2Fixture();
  }

  async function createAuctionFixture() {
    return createPhase2AuctionFixture();
  }

  it("initializes once through the proxy", async function () {
    const { market, adapter, owner } = await loadFixture(deployFixture);

    await expect(market.initialize(await adapter.getAddress(), owner.address, ethers.ZeroAddress)).to.be.reverted;
    expect(await market.contractVersion()).to.equal("phase4");
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

  it("allows the owner to rotate the CoFHE adapter for future bid formats", async function () {
    const { market, owner, bidder } = await loadFixture(deployFixture);
    const adapterFactory = await ethers.getContractFactory("CofheAdapter");
    const nextAdapter = await adapterFactory.deploy();
    await nextAdapter.waitForDeployment();

    await expect(market.connect(bidder).setCofheAdapter(await nextAdapter.getAddress())).to.be.revertedWithCustomError(
      market,
      "OwnableUnauthorizedAccount"
    );

    await expect(market.connect(owner).setCofheAdapter(await nextAdapter.getAddress()))
      .to.emit(market, "CofheAdapterUpdated")
      .withArgs(anyValue, await nextAdapter.getAddress());

    expect(await market.cofheAdapter()).to.equal(await nextAdapter.getAddress());
  });

  it("creates an auction and transfers the NFT into escrow", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await expect(
      market
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
        )
    )
      .to.emit(market, "AuctionCreated")
      .withArgs(1n, seller.address, await nft.getAddress(), 1n, anyValue, ethers.parseEther("1"), true);

    const auction = await market.getAuction(1n);
    expect(auction[0]).to.equal(await nft.getAddress());
    expect(auction[2]).to.equal(seller.address);
    expect(auction[5]).to.equal(1n);
    expect(await nft.ownerOf(1n)).to.equal(await market.getAddress());
  });

  it("stores a public starting price when the seller configures an opening bid", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await market
      .connect(seller)
      ["createAuction(address,uint256,uint256,uint256,uint256,bool)"](
        await nft.getAddress(),
        1n,
        24 * 60 * 60,
        400n,
        ethers.parseEther("1"),
        true,
        {
          value: ethers.parseEther("1")
        }
      );

    expect(await market.getAuctionStartingPrice(1n)).to.equal(400n);
  });

  it("rejects auction creation when the seller is not the NFT owner", async function () {
    const { market, nft, outsider } = await loadFixture(deployFixture);

    await nft.mint(outsider.address);
    await nft.connect(outsider).approve(await market.getAddress(), 1n);

    await expect(
      market["createAuction(address,uint256,uint256,uint256,bool)"](
        await nft.getAddress(),
        1n,
        24 * 60 * 60,
        ethers.parseEther("1"),
        false,
        {
          value: ethers.parseEther("1")
        }
      )
    ).to.be.revertedWithCustomError(market, "NotNFTOwner");
  });

  it("rejects auction creation with a zero NFT address", async function () {
    const { market } = await loadFixture(deployFixture);

    await expect(
      market["createAuction(address,uint256,uint256,uint256,bool)"](
        ethers.ZeroAddress,
        1n,
        24 * 60 * 60,
        ethers.parseEther("1"),
        false,
        {
          value: ethers.parseEther("1")
        }
      )
    ).to.be.revertedWithCustomError(market, "ZeroAddress");
  });

  it("rejects auction creation with durations outside the configured bounds", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await expect(
      market
        .connect(seller)
        ["createAuction(address,uint256,uint256,uint256,bool)"](
          await nft.getAddress(),
          1n,
          60,
          ethers.parseEther("1"),
          false,
          {
            value: ethers.parseEther("1")
          }
        )
    ).to.not.be.reverted;

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 2n);

    await expect(
      market
        .connect(seller)
        ["createAuction(address,uint256,uint256,uint256,bool)"](
          await nft.getAddress(),
          2n,
          59,
          ethers.parseEther("1"),
          false,
          {
            value: ethers.parseEther("1")
          }
        )
    ).to.be.revertedWithCustomError(market, "InvalidDuration");

    await expect(
      market
        .connect(seller)
        ["createAuction(address,uint256,uint256,uint256,bool)"](
          await nft.getAddress(),
          2n,
          91 * 24 * 60 * 60,
          ethers.parseEther("1"),
          false,
          {
            value: ethers.parseEther("1")
          }
        )
    ).to.be.revertedWithCustomError(market, "InvalidDuration");
  });

  it("rejects opening bids that exceed the current confidential bid encoding range", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await expect(
      market
        .connect(seller)
        ["createAuction(address,uint256,uint256,uint256,uint256,bool)"](
          await nft.getAddress(),
          1n,
          24 * 60 * 60,
          (1n << 96n),
          ethers.parseEther("1"),
          false,
          {
            value: ethers.parseEther("1")
          }
        )
    ).to.be.revertedWithCustomError(market, "InvalidStartingPrice");
  });

  it("accepts live wei-sized confidential bids through the full settlement path", async function () {
    const { adapter, avs, avsOperatorOne, avsOperatorTwo, bidder, bidderTwo, market, nft, owner, seller } =
      await loadFixture(deployFixture);

    const sellerDeposit = ethers.parseEther("1");
    const startingPrice = ethers.parseEther("0.40");
    const winnerAmount = ethers.parseEther("0.45");
    const runnerUpAmount = ethers.parseEther("0.42");

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);
    await market
      .connect(seller)
      ["createAuction(address,uint256,uint256,uint256,uint256,bool)"](
        await nft.getAddress(),
        1n,
        24 * 60 * 60,
        startingPrice,
        sellerDeposit,
        true,
        { value: sellerDeposit }
      );

    await market.connect(bidder).lockEscrow(1n, { value: ethers.parseEther("0.60") });
    await market.connect(bidderTwo).lockEscrow(1n, { value: ethers.parseEther("0.50") });

    const winnerBid = await adapter.asEuint96(winnerAmount);
    const runnerUpBid = await adapter.asEuint96(runnerUpAmount);

    await market.connect(bidder).placeBid(1n, winnerBid);
    await market.connect(bidderTwo).placeBid(1n, runnerUpBid);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [avsOperatorOne, avsOperatorTwo]);

    await expect(
      market.connect(owner)["submitResolution(uint256,address,bytes32,uint256,bytes)"](
        1n,
        bidder.address,
        winnerBid,
        winnerAmount,
        proof
      )
    )
      .to.emit(market, "ResolutionRecorded")
      .withArgs(1n, bidder.address, winnerBid);

    const auction = await market.getAuction(1n);
    const sellerPreview = await market.previewSellerPayout(1n);
    const finalizeReward = (sellerDeposit * 20n) / 10_000n;

    expect(await market.getAuctionStartingPrice(1n)).to.equal(startingPrice);
    expect(auction[8]).to.equal(winnerBid);
    expect(auction[9]).to.equal(winnerAmount);
    expect(sellerPreview).to.equal(sellerDeposit + winnerAmount - finalizeReward);
  });

  it("rejects auction creation with zero or mismatched seller deposits", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);

    await expect(
      market
        .connect(seller)
        ["createAuction(address,uint256,uint256,uint256,bool)"](await nft.getAddress(), 1n, 24 * 60 * 60, 0n, false, {
          value: 0n
        })
    ).to.be.revertedWithCustomError(market, "IncorrectSellerDeposit");

    await expect(
      market
        .connect(seller)
        ["createAuction(address,uint256,uint256,uint256,bool)"](
          await nft.getAddress(),
          1n,
          24 * 60 * 60,
          ethers.parseEther("2"),
          false,
          {
            value: ethers.parseEther("1")
          }
        )
    ).to.be.revertedWithCustomError(market, "IncorrectSellerDeposit");
  });

  it("rejects auction creation when the NFT is not approved", async function () {
    const { market, nft, seller } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);

    await expect(
      market
        .connect(seller)
        ["createAuction(address,uint256,uint256,uint256,bool)"](
          await nft.getAddress(),
          1n,
          24 * 60 * 60,
          ethers.parseEther("1"),
          false,
          {
            value: ethers.parseEther("1")
          }
        )
    ).to.be.revertedWithCustomError(market, "NFTNotApproved");
  });

  it("locks public escrow while the auction is active", async function () {
    const { market, bidder } = await loadFixture(createAuctionFixture);

    await expect(market.connect(bidder).lockEscrow(1n, { value: ethers.parseEther("2") }))
      .to.emit(market, "EscrowLocked")
      .withArgs(1n, bidder.address, ethers.parseEther("2"));

    expect(await market.escrowBalances(1n, bidder.address)).to.equal(ethers.parseEther("2"));
  });

  it("rejects encrypted bids below the configured opening bid", async function () {
    const { adapter, market, nft, seller, bidder } = await loadFixture(deployFixture);

    await nft.connect(seller).mint(seller.address);
    await nft.connect(seller).approve(await market.getAddress(), 1n);
    await market
      .connect(seller)
      ["createAuction(address,uint256,uint256,uint256,uint256,bool)"](
        await nft.getAddress(),
        1n,
        24 * 60 * 60,
        400n,
        ethers.parseEther("1"),
        true,
        {
          value: ethers.parseEther("1")
        }
      );

    await market.connect(bidder).lockEscrow(1n, { value: 600n });

    await expect(market.connect(bidder).placeBid(1n, await adapter.asEuint32(399))).to.be.revertedWithCustomError(
      market,
      "BidBelowStartingPrice"
    );

    await expect(market.connect(bidder).placeBid(1n, await adapter.asEuint32(400)))
      .to.emit(market, "BidPlaced")
      .withArgs(1n, bidder.address, await adapter.asEuint32(400));
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

  it("transitions from active to resolving after the end time and issues an async decryption request", async function () {
    const { market, outsider } = await loadFixture(createAuctionFixture);

    await time.increase(24 * 60 * 60 + 1);

    await expect(market.connect(outsider).triggerFinalize(1n))
      .to.emit(market, "AuctionStateChanged")
      .withArgs(1n, 1n, 2n);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(2n);

    const request = await market.getResolutionRequest(1n);
    expect(request[0]).to.not.equal(ethers.ZeroHash);
    expect(request[1]).to.not.equal(ethers.ZeroHash);
    expect(request[2]).to.not.equal(ethers.ZeroHash);
  });

  it("rejects finalize calls before the auction has ended", async function () {
    const { market } = await loadFixture(createAuctionFixture);

    await expect(market.triggerFinalize(1n)).to.be.revertedWithCustomError(market, "AuctionStillRunning");
  });

  it("allows a no-winner resolution only when the winning amount is zero", async function () {
    const { avs, avsOperatorOne, avsOperatorTwo, market, owner } = await loadFixture(createAuctionFixture);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [avsOperatorOne, avsOperatorTwo]);

    await expect(market.connect(owner)["submitResolution(uint256,bytes32,uint256,bytes)"](1n, ethers.ZeroHash, 0n, proof))
      .to.emit(market, "ResolutionRecorded")
      .withArgs(1n, ethers.ZeroAddress, ethers.ZeroHash);

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(3n);
    expect(auction[8]).to.equal(ethers.ZeroHash);
    expect(auction[9]).to.equal(0n);
  });

  it("rejects no-winner resolutions that try to assign a non-zero winning amount", async function () {
    const { avs, avsOperatorOne, avsOperatorTwo, market, owner } = await loadFixture(createAuctionFixture);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);

    const encryptedBids = await collectEncryptedBids(market, 1n);
    const { proof } = await buildPhase3ResolutionProof(market, avs, 1n, encryptedBids, [avsOperatorOne, avsOperatorTwo]);

    await expect(
      market.connect(owner)["submitResolution(uint256,bytes32,uint256,bytes)"](
        1n,
        ethers.encodeBytes32String("winner"),
        77n,
        proof
      )
    ).to.be.revertedWithCustomError(market, "WinnerRequiredForWinningAmount");
  });

  it("rejects resolution calls when the auction is not resolving", async function () {
    const { market, owner } = await loadFixture(createAuctionFixture);

    await expect(
      market.connect(owner)["submitResolution(uint256,bytes32,uint256,bytes)"](
        1n,
        ethers.encodeBytes32String("winner"),
        10n,
        "0x"
      )
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

  it("allows fallback void once the resolving timeout window has elapsed", async function () {
    const { market, nft, seller } = await loadFixture(createAuctionFixture);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);
    await time.increase(await market.previewDynamicTimeout());
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
    expect(await upgraded.contractVersion()).to.equal("phase2-v2");
    expect(await upgraded.versionMarker()).to.equal(2n);
  });

  it("keeps adapter behavior deterministic in the local mock path", async function () {
    const { adapter, mockCofhe } = await loadFixture(deployFixture);

    const ciphertext = await adapter.asEuint32(42);
    const largeCiphertext = await adapter.asEuint96(ethers.parseEther("0.45"));
    const encryptedTrue = await adapter.asEbool(true);
    const encryptedFalse = await adapter.asEbool(false);
    const selectedCiphertext = await adapter.select(encryptedTrue, ciphertext, await adapter.asEuint32(7));

    expect(await adapter.lte(ciphertext, 100)).to.equal(true);
    expect(await adapter.lte(largeCiphertext, ethers.parseEther("1"))).to.equal(true);
    expect(await adapter.gt(ciphertext, 40)).to.equal(true);
    expect(await adapter.gt(largeCiphertext, ethers.parseEther("0.40"))).to.equal(true);
    expect(await adapter.verifyEncryptedBidCoverage(ciphertext, 42)).to.equal(true);
    expect(await adapter.verifyEncryptedBidCoverage(largeCiphertext, ethers.parseEther("0.44"))).to.equal(false);
    expect(await adapter.verifyEncryptedBidCoverage(ciphertext, 41)).to.equal(false);
    expect(await adapter.ciphertextKind(ciphertext)).to.equal(1);
    expect(await adapter.ciphertextKind(largeCiphertext)).to.equal(3);
    expect(await adapter.ciphertextKind(encryptedTrue)).to.equal(2);
    expect(await adapter.select(encryptedFalse, ciphertext, await adapter.asEuint32(7))).to.equal(
      await adapter.asEuint32(7)
    );
    expect(await adapter.seal(ciphertext, ethers.ZeroAddress)).to.not.equal(ethers.ZeroHash);
    expect(await adapter.getRawCiphertext(ciphertext)).to.equal(ciphertext);
    expect(await mockCofhe.asEuint32(42)).to.equal(ciphertext);
    expect(await mockCofhe.lte(ciphertext, 100)).to.equal(true);
    expect(await mockCofhe.gt(ciphertext, 40)).to.equal(true);
    expect(await mockCofhe.seal(ciphertext, ethers.ZeroAddress)).to.not.equal(ethers.ZeroHash);
    expect(await mockCofhe.getRawCiphertext(ciphertext)).to.equal(ciphertext);
    expect(await mockCofhe.expectPlaintext(ciphertext, 42)).to.equal(true);
    expect(await mockCofhe.expectBoolPlaintext(encryptedTrue, true)).to.equal(true);
    expect(await mockCofhe.expectBoolPlaintext(encryptedFalse, false)).to.equal(true);
    expect(await mockCofhe.expectPlaintext(selectedCiphertext, 42)).to.equal(true);

    const explanation = await mockCofhe.explainCiphertext(ciphertext);
    expect(explanation[0]).to.equal(1n);
    expect(explanation[1]).to.equal(42n);

    const largeExplanation = await mockCofhe.explainCiphertext(largeCiphertext);
    expect(largeExplanation[0]).to.equal(3n);
    expect(largeExplanation[1]).to.equal(ethers.parseEther("0.45"));
  });

  it("keeps ciphertext type tags explicit across the local adapter and mock path", async function () {
    const { adapter, mockCofhe } = await loadFixture(deployFixture);

    const encryptedBid = await adapter.asEuint32(17);
    const encryptedCondition = await adapter.asEbool(true);

    expect(await adapter.ciphertextKind(encryptedBid)).to.equal(1);
    expect(await adapter.ciphertextKind(encryptedCondition)).to.equal(2);

    const bidExplanation = await mockCofhe.explainCiphertext(encryptedBid);
    expect(bidExplanation[0]).to.equal(1n);
    expect(bidExplanation[1]).to.equal(17n);
  });
});
