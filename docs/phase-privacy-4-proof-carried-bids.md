# Privacy Phase 4: Proof-Carried Shielded Bid Admission

This `Privacy Phase 4` slice moves shielded bid admission away from live balance reads and into a proof-carrying path.

## Problem addressed

After the amount-oblivious coverage slice:

- the market no longer needed the raw note amount
- the keeper no longer needed the raw note amount
- but the market still asked the vault to evaluate live coverage directly during `placeShieldedBid(...)`

That was already better than public previews, but it still kept bid admission tied to a direct vault-side balance check.

## What is implemented now

Shielded bid placement now carries a dedicated balance proof/attestation:

- `placeShieldedBid(...)` accepts a `coverageDeadline` and `coverageProof`
- the vault verifies that proof against the note's `claimAuthority`
- the proof is domain-separated by:
  - chain id
  - vault address
  - auction id
  - commitment hash
  - encrypted bid hash
  - deadline

This means the market no longer asks the vault to compare the bid against the note balance during live admission.

## Settlement follow-through

Settlement is now anchored to the already admitted ciphertext:

- the market resolves `winnerIdentityHash -> commitmentHash`
- it requires the stored shielded bid ciphertext to exactly match the submitted winning ciphertext
- it then relies on the AVS resolution proof for ciphertext/amount integrity
- the vault still keeps an internal winning-amount guard when funds are actually settled

That removes the need for the market to perform a second live encrypted coverage query during shielded finalization.

## Resulting privacy improvement

This means:

- shielded bid admission is now `proof-carried`
- live market admission no longer depends on a direct balance comparison call
- settlement is tied to the already admitted ciphertext instead of re-querying note coverage

## Important honesty note

This is still not a zero-knowledge proof system.

The current proof is an attestation boundary tied to the note's `claimAuthority`, which is a meaningful protocol step toward blindness, but not the final cryptographic end-state.

## Next likely step

The next privacy target after this slice is:

- replacing attestation-style coverage proofs with zero-knowledge or equivalent proof verification
- reducing visibility of commitment enumeration
- moving more claimant activity behind relay or stealth execution paths
