import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

import { deployPhase2Fixture } from "../helpers/fixtures";

describe("Phase 1 integration workflow", function () {
  async function deployFixture() {
    return deployPhase2Fixture();
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
    await market.connect(bidder).placeBid(1n, encryptedWinningBid);

    const encryptedWinner = await adapter.select(
      await adapter.asEbool(true),
      encryptedWinningBid,
      await adapter.asEuint32(300)
    );
    expect(await mockCofhe.expectPlaintext(encryptedWinner, 450)).to.equal(true);

    await time.increase(24 * 60 * 60 + 1);
    await market.triggerFinalize(1n);
    await market.connect(owner)["submitResolution(uint256,address,bytes32,uint256)"](
      1n,
      bidder.address,
      encryptedWinner,
      450n
    );

    const auction = await market.getAuction(1n);
    expect(auction[5]).to.equal(3n);
    expect(auction[8]).to.equal(encryptedWinner);
    expect(auction[9]).to.equal(450n);
    expect(await nft.ownerOf(1n)).to.equal(await market.getAddress());
  });
});
