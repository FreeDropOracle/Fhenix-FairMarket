# Privacy Phase 4: ZK Verifier Boundary

This `Privacy Phase 4` slice introduces a dedicated verifier boundary for shielded bid admission.

## Problem addressed

After the proof-carried bid slice:

- shielded bids already arrived with a coverage proof
- but that proof was still tied to the note's `claimAuthority`
- the protocol still needed a migration path toward a real verifier contract

That meant the live flow was improved, but the system still lacked a clean contract boundary where a future zk verifier could plug in.

## What is implemented now

The shielded vault now supports an optional external verifier:

- `shieldedBidVerifier`
- `setShieldedBidVerifier(...)`

When configured:

- `verifyBidCoverageProof(...)` delegates to the verifier contract
- the verifier receives only public statement inputs:
  - vault address
  - auction id
  - commitment hash
  - encrypted bid
  - deadline

When not configured:

- the vault falls back to the existing `claimAuthority` proof path

This keeps the current protocol operational while introducing a stable boundary for future zk circuits or verifier contracts.

## Resulting privacy improvement

This means:

- the market no longer cares how the proof is checked
- the vault no longer hardcodes a single proof model forever
- a future zk verifier can replace the mock verifier path without changing `placeShieldedBid(...)`

## Important honesty note

The current mock verifier is still not a real zk verifier.

It exists to establish the protocol boundary and public input shape so that a real verifier can be dropped in later with minimal protocol churn.

## Next likely step

The next privacy target after this slice is:

- replacing the mock verifier with a true zk-proof verifier
- introducing statement commitments or roots that reduce commitment-level visibility
- moving more of the remaining linkability into relayed or stealth execution paths
