import "dotenv/config";

import { Contract, JsonRpcProvider } from "ethers";

const MARKET_ABI = [
  "function auctionCounter() view returns (uint256)",
  "function getAuction(uint256 auctionId) view returns (address nftContract, uint256 tokenId, address seller, uint64 endTime, uint256 sellerDeposit, uint8 state, bool isVickrey, uint64 lastBlockTimestamp, bytes32 winnerCiphertext, uint256 winningAmount, address winner, uint256 totalEscrow, uint256 slashAmount, uint64 createdAt, uint64 resolvingSince, bool sellerClaimed, bool assetClaimed, uint32 bidCount, uint256 startingPrice)"
];

async function main() {
  const rpcUrl = process.env.LOAD_TEST_RPC_URL || process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;
  const marketAddress =
    process.env.LOAD_TEST_MARKET_ADDRESS ||
    process.env.KEEPER_MARKET_ADDRESS ||
    process.env.NEXT_PUBLIC_MARKET_PROXY_ADDRESS;

  if (!rpcUrl || !marketAddress) {
    throw new Error("LOAD_TEST_RPC_URL and LOAD_TEST_MARKET_ADDRESS (or equivalent deployment env) are required");
  }

  const plannedAuctions = Number(process.env.LOAD_TEST_AUCTIONS || "50");
  const plannedBidsPerMinute = Number(process.env.LOAD_TEST_BIDS_PER_MINUTE || "200");
  const provider = new JsonRpcProvider(rpcUrl);
  const market = new Contract(marketAddress, MARKET_ABI, provider);

  const totalAuctions = Number(await market.auctionCounter());
  let active = 0;
  let resolving = 0;
  let finalized = 0;

  for (let auctionId = 1; auctionId <= totalAuctions; auctionId += 1) {
    const auction = await market.getAuction(auctionId);
    const state = Number(auction[5]);
    if (state === 1) {
      active += 1;
    } else if (state === 2) {
      resolving += 1;
    } else if (state === 3) {
      finalized += 1;
    }
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    marketAddress,
    plannedProfile: {
      auctions: plannedAuctions,
      bidsPerMinute: plannedBidsPerMinute
    },
    observed: {
      totalAuctions,
      active,
      resolving,
      finalized
    },
    note: "This script is a Phase 6 operator baseline. Extend it with funded signers and mock NFT minting if you want a full live traffic drill."
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
