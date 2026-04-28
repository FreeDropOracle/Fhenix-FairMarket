# Privacy Phase 4: Shielded Aggregate Compensation

This `Privacy Phase 4` slice removes shielded slash compensation from the public `SlashedPot` path and moves it into the shielded vault itself.

## Problem addressed

Before this change:

- `auction.totalEscrow` mixed public and shielded escrow totals
- `SlashedPot` received the full slash amount
- shielded compensation claims depended on a public aggregate total path

That meant shielded participation still influenced public aggregate accounting surfaces.

## What is implemented now

The protocol now splits slash handling into two lanes:

- `public escrow` still uses `SlashedPot`
- `shielded escrow` uses an internal reserve inside `ShieldedEscrowVault`

On `cancel` or `void`:

1. the market sends the full slash amount into the vault
2. the vault computes how much of that slash belongs to shielded escrow based on its hidden internal totals
3. the vault returns only the public share back to the market
4. the market forwards only that public share into `SlashedPot`

## Resulting privacy improvement

This means:

- `SlashedPot` no longer learns the shielded side of aggregate escrow
- `auction.totalEscrow` can stay aligned with the public escrow lane
- shielded refund compensation is paid from an internal reserve without publishing the shielded aggregate through the public compensation path

## Public Preview Reduction

This slice also removes direct public access to per-commitment amount previews.

`previewCommitment(...)` is no longer a public-by-default amount oracle. Full note previews are now restricted to:

- the market contract
- the vault owner
- an explicitly configured `previewReader`

That means arbitrary callers can no longer use the vault surface itself as a public per-commitment balance explorer.

## What still leaks

This is still not absolute aggregate privacy.

The current system still exposes:

- individual shielded commitment identifiers through the market surface
- per-commitment escrow amounts through the current preview path
- transaction timing and funding patterns

So this slice removes the aggregate from the standard public compensation lane, but it does not yet make shielded balances fully opaque.

## Follow-up slice

The next privacy target after this slice was:

- reducing operational dependency on readable per-commitment amounts
- moving toward proof-based commitment balance checks instead of direct note-amount reads

That follow-up is now captured in:

- [phase-privacy-4-amount-oblivious-coverage.md](./phase-privacy-4-amount-oblivious-coverage.md)
