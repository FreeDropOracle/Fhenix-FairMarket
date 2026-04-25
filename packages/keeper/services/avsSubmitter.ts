export interface AttestationPayload {
  auctionId: bigint;
  requestId: string;
  winner: string;
  winnerCiphertext: string;
  winningAmount: bigint;
}

export interface AVSOperatorSigner {
  address: string;
  signDigest(digest: string): Promise<string>;
}

export interface AttestationProofEnvelope extends AttestationPayload {
  operators: string[];
  signatures: string[];
}

export class AvsSubmitter {
  constructor(private readonly threshold: number) {}

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

    return {
      ...payload,
      operators: selectedOperators.map((operator) => operator.address),
      signatures
    };
  }
}
