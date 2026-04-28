# Privacy Phase 4: Authorized Shielded Claims

`Privacy Phase 4` reduces claim-time witness exposure by introducing authorization-based shielded claims.

## Problem addressed

At the end of `Privacy Phase 3`, the platform could settle shielded winners by `identityHash`, but the last-mile claim paths still had an important leak:

- shielded refunds required `secret + nullifier` in calldata
- shielded asset claims required `secret + nullifier` in calldata

That meant a relayer could hide `msg.sender`, but the raw claim witness itself was still revealed on-chain.

## What is implemented now

This phase introduces a new `claimAuthority` per shielded note.

During `lockShieldedEscrow(...)`, the depositor now binds:

- `identityHash`
- `commitmentHash`
- `claimAuthority`

The `claimAuthority` is expected to be a one-time signer that is not tied to the bidder's public wallet.

## New claim paths

The vault now supports:

- `claimRefundWithAuthorization(...)`
- `authorizeAssetClaim(...)`
- `claimAuthorityForCommitment(...)`

The market now supports:

- `claimShieldedAssetWithAuthorization(...)`

These paths allow a relayer to execute the claim while the winner or bidder only reveals:

- a short-lived signed authorization
- the destination recipient

The raw `secret/nullifier` witness no longer needs to appear in calldata for the new path.

## What remains compatible

The earlier witness-based path is still available:

- `claimRefund(secret, nullifier, recipient)`
- `claimShieldedAsset(secret, nullifier, recipient)`

This keeps backward compatibility while the authorization path is adopted.

## What this improves

Compared with `Privacy Phase 3`, the protocol now gains:

- reduced claim-time witness disclosure
- relayer-friendly claims without exposing the raw note preimage
- a cleaner bridge toward proof-based claims in later phases

## What this still does not solve

This phase still does **not** provide:

- hidden aggregate escrow totals
- private calldata itself
- full sender anonymity against timing correlation
- zero-knowledge proof-based claim verification

Those remain the next logical targets for the following privacy phase.
