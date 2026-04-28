# Phase Privacy 1: Shielded Escrow Foundation

This phase introduces the first protocol-native privacy layer for `Fhenix-FairMarket`.

## What this phase adds

- `ShieldedEscrowVault.sol` stores bidder deposits behind opaque `commitmentHash` values instead of `escrowBalances[auctionId][bidder]`.
- `FhenixFairMarket.sol` now supports `lockShieldedEscrow(auctionId, commitmentHash)`.
- The market opens a shielded refund path automatically when an auction reaches:
  - `CANCELLED`
  - `VOIDED`
  - `FINALIZED` with `winner == address(0)`
- Shielded refunds can recover:
  - the committed principal from the vault
  - slashing compensation from `SlashedPot` using a nullifier-based claim key

## Commitment model in this phase

The current vault uses a lightweight commitment scheme:

```solidity
commitmentHash = keccak256(abi.encodePacked(secret, nullifier))
nullifierHash = keccak256(abi.encodePacked(nullifier))
```

- `secret` stays private until refund claim time.
- `nullifier` prevents replay and double-claiming.
- Refund claims are recipient-directed, so the claimer can forward recovered funds to a preferred address.

## What is private now

- Per-commitment escrow balances are no longer stored in the market's public bidder mapping.
- Refund compensation for shielded commitments is keyed by nullifier instead of recipient address.

## What is still not "absolute privacy"

This phase is an escrow foundation, not the final privacy architecture.

The following are still visible today:

- the auction's aggregate `totalEscrow`
- the transaction sender that called `lockShieldedEscrow(...)`
- public seller deposits
- address-based bids in the legacy `placeBid(...)` path

The following are not implemented yet:

- shielded bid storage keyed by commitments instead of wallet addresses
- proof-based winner selection that hides the winning lane from public state
- shielded seller proceeds
- shielded winner asset claims
- zero-knowledge or threshold-attested refund authorization

## Why this phase is still valuable

It moves escrow privacy into an append-only protocol layer without breaking the current settlement and safety model.

That gives the next phase a clean target:

1. replace address-keyed bidding with commitment-keyed bidding
2. compute winners from shielded commitments
3. settle with proof-backed results rather than public escrow accounting
