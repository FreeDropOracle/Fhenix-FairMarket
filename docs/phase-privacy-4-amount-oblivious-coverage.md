# Privacy Phase 4: Amount-Oblivious Shielded Coverage

This `Privacy Phase 4` slice removes the market and keeper dependency on raw per-note shielded amounts during the live bidding and settlement flow.

## Problem addressed

After the earlier Phase 4 work:

- direct `previewCommitment(...)` reads were already restricted
- but the market still pulled the hidden amount to validate `placeShieldedBid(...)`
- and the keeper still pulled the hidden amount to build shielded bid batches

That meant the protocol had reduced casual visibility, but its operational path still depended on reading the exact note amount.

## What is implemented now

The live flow now uses:

- `commitmentState(...)` for note metadata only
- `verifyEncryptedBidCoverage(...)` for encrypted bid coverage checks
- `verifyPlaintextBidCoverage(...)` for settlement-time amount checks

The market no longer reads the raw shielded note amount when:

- accepting a shielded bid
- validating a shielded winner during settlement

The keeper also no longer reads the raw note amount. For shielded bids it now:

- collects the encrypted bid
- resolves the alias identity
- carries a sentinel escrow ceiling large enough for the `euint96` bid domain

That keeps winner selection possible without turning the keeper back into a raw shielded balance reader.

## Resulting privacy improvement

This means:

- the operational bidding path no longer depends on exact note balances
- the keeper no longer reconstructs per-commitment balances just to dispatch a batch
- settlement validation asks the vault for `coverage yes/no`, not `what is the amount`

## What still leaks

This is still not absolute blockchain blindness.

The current system still leaks or can still be probed through:

- observable funding transactions
- public commitment identifiers exposed through the market surface
- boolean coverage checks that are not yet backed by zero-knowledge proofs
- `eth_call` style inspection models that are stronger than ordinary UI access control

## Next likely step

The next privacy target after this slice is:

- replacing boolean coverage queries with proof-based balance verification
- hiding or abstracting commitment enumeration itself
- moving claim execution toward relay or stealth paths that reduce claimant linkability
