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

export async function collectShieldedEncryptedBids(
  market: {
    getShieldedCommitments(auctionId: bigint): Promise<readonly string[]>;
    getShieldedEncryptedBid(auctionId: bigint, commitmentHash: string): Promise<string>;
  },
  vault: {
    previewCommitment(commitmentHash: string): Promise<readonly [bigint, bigint, boolean, boolean]>;
  },
  auctionId: bigint
): Promise<EncryptedBidRecord[]> {
  const commitments = await market.getShieldedCommitments(auctionId);
  const bids: EncryptedBidRecord[] = [];

  for (const commitmentHash of commitments) {
    const preview = await vault.previewCommitment(commitmentHash);
    bids.push({
      bidder: commitmentHash,
      encryptedBid: await market.getShieldedEncryptedBid(auctionId, commitmentHash),
      availableEscrow: BigInt(preview[1]),
      isShielded: true
    });
  }

  return bids;
}

export async function collectAllEncryptedBids(
  market: {
    getBidders(auctionId: bigint): Promise<readonly string[]>;
    getEncryptedBid(auctionId: bigint, bidder: string): Promise<string>;
    escrowBalances(auctionId: bigint, bidder: string): Promise<bigint>;
    getShieldedCommitments(auctionId: bigint): Promise<readonly string[]>;
    getShieldedEncryptedBid(auctionId: bigint, commitmentHash: string): Promise<string>;
  },
  vault: {
    previewCommitment(commitmentHash: string): Promise<readonly [bigint, bigint, boolean, boolean]>;
  },
  auctionId: bigint
): Promise<EncryptedBidRecord[]> {
  const [publicBids, shieldedBids] = await Promise.all([
    collectEncryptedBids(market, auctionId),
    collectShieldedEncryptedBids(market, vault, auctionId)
  ]);

  return [...publicBids, ...shieldedBids];
}

export async function buildPhase3ResolutionProof(
  market: {
    getAddress(): Promise<string>;
    getResolutionRequest(auctionId: bigint): Promise<readonly [string, string, string, bigint]>;
    getAuction(auctionId: bigint): Promise<readonly unknown[]>;
    getAuctionStartingPrice(auctionId: bigint): Promise<bigint>;
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
    startingPrice: await market.getAuctionStartingPrice(auctionId),
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

export async function buildShieldedResolutionProof(
  market: {
    getAddress(): Promise<string>;
    getResolutionRequest(auctionId: bigint): Promise<readonly [string, string, string, bigint]>;
    getAuction(auctionId: bigint): Promise<readonly unknown[]>;
    getAuctionStartingPrice(auctionId: bigint): Promise<bigint>;
  },
  avs: {
    computeShieldedDigest(
      market: string,
      auctionId: bigint,
      requestId: string,
      winnerIdentity: string,
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
    startingPrice: await market.getAuctionStartingPrice(auctionId),
    bids: bidders
  });

  if (resolution.winner === null) {
    throw new Error("Shielded resolution requires a non-empty winner identity");
  }

  const payload = {
    auctionId,
    requestId: request.requestId,
    winnerIdentity: resolution.winner,
    winnerCiphertext: resolution.winnerCiphertext,
    winningAmount: resolution.winningAmount
  };

  const digest = await avs.computeShieldedDigest(
    await market.getAddress(),
    payload.auctionId,
    payload.requestId,
    payload.winnerIdentity,
    payload.winnerCiphertext,
    payload.winningAmount
  );

  const submitter = new AvsSubmitter(2);
  const proofEnvelope = await submitter.collectProof(
    {
      auctionId: payload.auctionId,
      requestId: payload.requestId,
      winner: payload.winnerIdentity,
      winnerCiphertext: payload.winnerCiphertext,
      winningAmount: payload.winningAmount,
      winnerKind: "shielded"
    },
    digest,
    operators.map((operator) => ({
      address: (operator as unknown as { address: string }).address,
      signDigest: async (requestedDigest: string) => operator.signMessage(getBytes(requestedDigest))
    }))
  );

  const proof = AbiCoder.defaultAbiCoder().encode(
    [
      "tuple(uint256 auctionId, bytes32 requestId, bytes32 winnerIdentity, bytes32 winnerCiphertext, uint256 winningAmount, address[] operators, bytes[] signatures)"
    ],
    [
      [
        proofEnvelope.auctionId,
        proofEnvelope.requestId,
        payload.winnerIdentity,
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
