import { createHash } from "node:crypto";

import { InMemorySlashingLogStore, type SlashingLogRecord, type SlashingLogStore } from "../stores/slashingLogStore";

export interface AttestationPayload {
  auctionId: bigint;
  requestId: string;
  winner: string;
  winnerCiphertext: string;
  winningAmount: bigint;
}

export interface FraudProofExpectation extends AttestationPayload {}

export interface AVSOperatorSigner {
  address: string;
  signDigest(digest: string): Promise<string>;
}

export interface AttestationProofEnvelope extends AttestationPayload {
  operators: string[];
  signatures: string[];
  aggregateSignature: string;
  signerCount: number;
}

export interface ResolutionSubmissionWriter {
  submitResolution(payload: AttestationPayload, proof: AttestationProofEnvelope): Promise<{
    txHash?: string;
  }>;
}

export class AvsSubmitter {
  constructor(
    private readonly threshold: number,
    private readonly slashingLogStore: SlashingLogStore = new InMemorySlashingLogStore(),
    private readonly now: () => number = () => Date.now()
  ) {}

  async collectProof(
    payload: AttestationPayload,
    digest: string,
    operators: readonly AVSOperatorSigner[]
  ): Promise<AttestationProofEnvelope> {
    if (operators.length < this.threshold) {
      throw new Error(`Threshold not met: expected ${this.threshold}, received ${operators.length}`);
    }

    const selectedOperators = operators.slice(0, this.threshold);
    const signatures = await Promise.all(selectedOperators.map((operator) => operator.signDigest(digest)));
    const aggregateSignature = aggregateSignatures(signatures);

    return {
      ...payload,
      operators: selectedOperators.map((operator) => operator.address),
      signatures,
      aggregateSignature,
      signerCount: selectedOperators.length
    };
  }

  async submitVerifiedResolution(
    expected: FraudProofExpectation,
    payload: AttestationPayload,
    digest: string,
    operators: readonly AVSOperatorSigner[],
    writer: ResolutionSubmissionWriter
  ): Promise<AttestationProofEnvelope> {
    validateFraudProof(expected, payload);
    const proof = await this.collectProof(payload, digest, operators);
    await writer.submitResolution(payload, proof);
    return proof;
  }

  async recordSlashingViolation(requestId: string, auctionId: bigint, reason: string, operators: readonly string[]): Promise<void> {
    const record: SlashingLogRecord = {
      requestId,
      auctionId,
      reason,
      operators: [...operators],
      recordedAtMs: this.now()
    };
    await this.slashingLogStore.append(record);
  }
}

export function aggregateSignatures(signatures: readonly string[]): string {
  const hash = createHash("sha256");
  for (const signature of signatures) {
    hash.update(signature);
  }

  return `0x${hash.digest("hex")}`;
}

export function validateFraudProof(expected: FraudProofExpectation, payload: AttestationPayload): void {
  if (
    expected.auctionId !== payload.auctionId ||
    expected.requestId !== payload.requestId ||
    expected.winner !== payload.winner ||
    expected.winnerCiphertext !== payload.winnerCiphertext ||
    expected.winningAmount !== payload.winningAmount
  ) {
    throw new Error("Fraud proof mismatch: resolution payload diverged from the expected request");
  }
}
