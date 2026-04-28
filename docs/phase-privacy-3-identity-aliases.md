# Privacy Phase 3: Shielded Identity Aliases

`Privacy Phase 3` separates a bidder's settlement identity from the raw escrow note commitment and wires that alias layer into both the market contract and the keeper flow.

## Why this matters

At the end of `Privacy Phase 2`, the platform still leaked one important linkage:

- the shielded settlement path still needed the raw `winnerCommitmentHash` in the resolution call

Even if the winner wallet address stayed hidden, the winning note itself was still visible in settlement calldata and therefore remained linkable to later claim activity.

## What is implemented now

This phase introduces and actively uses a dedicated alias substrate:

- `ShieldedIdentityRegistry.sol`
- `IShieldedIdentityRegistry.sol`

The registry keeps a one-to-one relationship between:

- `identityHash`
- `commitmentHash`

## Integrated Flow

The market and automation pipeline now use the alias layer in four places:

- `lockShieldedEscrow(...)` binds `identityHash -> commitmentHash` before escrow is accepted into the shielded vault
- `submitShieldedResolution(...)` settles by `winnerIdentityHash` rather than raw `winnerCommitmentHash`
- `claimShieldedAsset(...)` resolves the winning alias back to its escrow note internally, so the winning commitment no longer appears in settlement calldata
- the keeper maps shielded commitments back to `identityHash` before dispatching AVS resolution payloads

## What this enables next

With aliases wired end-to-end, the platform can now evolve toward:

- alias-based AVS resolution payloads with smaller public linkage surfaces
- reduced linkability between settlement and later asset claim
- shielded aggregation that no longer exposes raw note identifiers to the keeper loop

## What this does not solve yet

This phase materially reduces settlement-time linkability, but it still does **not** yet provide:

- sender privacy
- private calldata
- hidden aggregate escrow
- proof-based claim execution

Those remain the next steps for `Privacy Phase 4`.
