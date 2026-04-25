import { AbiCoder, getBytes, type Signer } from "ethers";

import { AuctionMonitor } from "../../../keeper/services/auctionMonitor";
import { AvsSubmitter } from "../../../keeper/services/avsSubmitter";
import { CofheDispatcher, type EncryptedBidRecord } from "../../../keeper/services/cofheDispatcher";

export async function collectEncryptedBids(
  market: {
    getBidders(auctionId: bigint): Promise<readonly string[]>;
    getEncryptedBid(auctionId: bigint, bidder: string): Promise<string>;
    escrowBalances(auctionId: bigint, bidder: string): Promise<bigint>;
  },
  auctionId: bigint
): Promise<EncryptedBidRecord[]> {
  const bidders = await market.getBidders(auctionId);
  const bids: EncryptedBidRecord[] = [];

  for (const bidder of bidders) {
    bids.push({
      bidder,
      encryptedBid: await market.getEncryptedBid(auctionId, bidder),
      availableEscrow: await market.escrowBalances(auctionId, bidder)
    });
  }

  return bids;
}

export async function buildPhase3ResolutionProof(
  market: {
    getAddress(): Promise<string>;
    getResolutionRequest(auctionId: bigint): Promise<readonly [string, string, string, bigint]>;
    getAuction(auctionId: bigint): Promise<readonly unknown[]>;
  },
  avs: {
    computeDigest(
      market: string,
      auctionId: bigint,
      requestId: string,
      winner: string,
      winnerCiphertext: string,
      winningAmount: bigint
    ): Promise<string>;
  },
  auctionId: bigint,
  bidders: EncryptedBidRecord[],
  operators: readonly Signer[]
) {
  const monitor = new AuctionMonitor(market);
  const request = await monitor.inspectTriggeredAuction(auctionId);
  const dispatcher = new CofheDispatcher();
  const resolution = await dispatcher.dispatch({
    auctionId,
    requestId: request.requestId,
    winnerHandle: request.winnerHandle,
    amountHandle: request.amountHandle,
    bids: bidders
  });

  const payload = {
    auctionId,
    requestId: request.requestId,
    winner: resolution.winner ?? "0x0000000000000000000000000000000000000000",
    winnerCiphertext: resolution.winnerCiphertext,
    winningAmount: resolution.winningAmount
  };

  const digest = await avs.computeDigest(
    await market.getAddress(),
    payload.auctionId,
    payload.requestId,
    payload.winner,
    payload.winnerCiphertext,
    payload.winningAmount
  );

  const submitter = new AvsSubmitter(2);
  const proofEnvelope = await submitter.collectProof(
    payload,
    digest,
    operators.map((operator) => ({
      address: (operator as unknown as { address: string }).address,
      signDigest: async (requestedDigest: string) => operator.signMessage(getBytes(requestedDigest))
    }))
  );

  const proof = AbiCoder.defaultAbiCoder().encode(
    [
      "tuple(uint256 auctionId, bytes32 requestId, address winner, bytes32 winnerCiphertext, uint256 winningAmount, address[] operators, bytes[] signatures)"
    ],
    [
      [
        proofEnvelope.auctionId,
        proofEnvelope.requestId,
        proofEnvelope.winner,
        proofEnvelope.winnerCiphertext,
        proofEnvelope.winningAmount,
        proofEnvelope.operators,
        proofEnvelope.signatures
      ]
    ]
  );

  return {
    request,
    resolution,
    payload,
    proof
  };
}
