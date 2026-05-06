# Contracts Workspace

This workspace contains the runnable Phase 1 and Phase 2 contract foundation for `Fhenix-FairMarket`.

## Included in the current scope

- `contracts/core/FhenixFairMarket.sol`: upgradeable auction core with escrow locking, encrypted bid placement, guarded state transitions, refunds, seller settlement, and fallback logic
- `contracts/core/FhenixFairMarketProxy.sol`: thin `ERC1967Proxy` wrapper for UUPS deployments
- `contracts/adapters/CofheAdapter.sol`: local-development prototype adapter boundary; the current reversible placeholder encoding is not production-private
- `contracts/adapters/NFTGuard.sol`: escrow helper for NFT custody and terminal asset release
- `contracts/privacy/ShieldedEscrowVault.sol`: Privacy Phase 1 vault for commitment-based escrow deposits and shielded refund claims
- `contracts/privacy/ShieldedIdentityRegistry.sol`: Privacy Phase 3 alias layer that separates settlement identity from raw escrow-note commitment
- `contracts/settlement/SettlementEngine.sol`: centralized math for dynamic timeout, refunds, slashing, and seller payouts
- `contracts/settlement/SlashedPot.sol`: pull-based compensation pot for cancelled or voided auctions
- `contracts/mocks/*.sol`: local mock contracts used by the unit test suite
- `deploy/*.ts`: sequential deployment scripts for adapter/engine first, then proxy + slashed-pot wiring
- [../../docs/phase-1-architecture.md](../../docs/phase-1-architecture.md): Phase 1 architecture review, upgrade notes, and state-machine diagram
- [../../docs/phase-2-security-settlement.md](../../docs/phase-2-security-settlement.md): Phase 2 settlement, refund, slashing, and dynamic-timeout overview
- [../../docs/phase-privacy-1-shielded-escrow.md](../../docs/phase-privacy-1-shielded-escrow.md): first protocol-native privacy layer for commitment-based escrow
- [../../docs/phase-privacy-2-blind-resolution.md](../../docs/phase-privacy-2-blind-resolution.md): commitment-keyed blind bidding, shielded winner settlement, and private asset-claim path
- [../../docs/phase-privacy-3-identity-aliases.md](../../docs/phase-privacy-3-identity-aliases.md): alias-based shielded settlement that removes the raw winning commitment from resolution calldata
- [../../docs/phase-privacy-4-authorized-claims.md](../../docs/phase-privacy-4-authorized-claims.md): relayer-friendly authorized claims that avoid exposing the raw note witness in calldata
- [../../docs/phase-privacy-4-shielded-aggregate.md](../../docs/phase-privacy-4-shielded-aggregate.md): shielded slash compensation handled inside the vault so public compensation surfaces only see the public escrow lane
- [../../docs/phase-privacy-4-amount-oblivious-coverage.md](../../docs/phase-privacy-4-amount-oblivious-coverage.md): market and keeper now validate shielded coverage without pulling raw note amounts into the live flow
- [../../docs/phase-privacy-4-proof-carried-bids.md](../../docs/phase-privacy-4-proof-carried-bids.md): shielded bid admission now carries a dedicated proof/attestation so live bidding no longer depends on direct balance comparison calls
- [../../docs/phase-privacy-4-zk-verifier-boundary.md](../../docs/phase-privacy-4-zk-verifier-boundary.md): optional external verifier boundary for shielded bid proofs so a real zk verifier can plug in without changing the market flow

## Commands

Run these from the repository root:

```bash
pnpm install
pnpm compile
pnpm test
pnpm test:unit
pnpm test:integration
pnpm coverage
```

## Notes

- The issue text references an older package name for the CoFHE Hardhat plugin. The maintained package integrated here is `cofhe-hardhat-plugin`.
- Security status: this workspace is under remediation. The current `CofheAdapter` is local-development only and deployment scripts intentionally block the prototype adapter on public networks.
- The CoFHE Hardhat plugin is installed and version-pinned in the workspace so later Fhenix-network phases can activate it without reworking dependencies.
- `IProductionCofheAdapter` documents the production boundary expected from a live CoFHE provider: opaque ciphertext handles only, with no plaintext constructors, raw-ciphertext accessors, or decode helpers.
- The default Phase 1 test path stays on the deterministic local adapter/mock implementation to keep the architectural foundation stable while full network-backed CoFHE flows are deferred to later phases.
- The adapter now models typed ciphertext handles (`euint32`, `ebool`), comparison helpers (`lte`, `gt`), conditional selection, and encrypted bid-coverage checks.
- The Phase 2 refund path is strictly pull-based. Compensation is computed per claimant and no payout loops are used in the core market contract.
- The core contract deliberately avoids importing FHE libraries directly. Encrypted bid logic should continue to flow only through the adapter boundary, and public deployments should use an opaque production adapter rather than the local `ICofheAdapter` test surface.
- Privacy Phase 1 does not claim absolute blockchain privacy yet. It introduces commitment-based escrow and shielded refund claims as the protocol base for later commitment-keyed bidding and proof-based settlement.
- Privacy Phase 2 keeps shielded bidders out of the public bidder registry and settles shielded winners without disclosing a winner wallet address during finalization. It still does not hide calldata senders, aggregate escrow totals, or claim-time witness disclosure.
- Privacy Phase 3 replaces raw winning-note references in settlement with alias-based `identityHash` flow, reducing direct linkability between settlement and later claims.
- Privacy Phase 4 introduces one-time `claimAuthority` signers so shielded refunds and asset claims can be relayed without revealing `secret/nullifier` in calldata on the new path.
- Privacy Phase 4 also splits slash handling between `SlashedPot` and an internal shielded reserve, so public aggregate compensation surfaces no longer need to include the shielded escrow lane.
- Privacy Phase 4 restricts full per-commitment amount previews to the market, owner, or an explicit `previewReader`, removing the vault as an open public note-balance oracle.
- Privacy Phase 4 now routes live shielded bid validation through `commitmentState(...)` and vault-side coverage verifiers, so neither the market nor the keeper needs the raw note amount in the operational path.
- Privacy Phase 4 now also accepts shielded bids through a proof-carried admission path tied to `claimAuthority`, reducing the need for direct live balance comparison in the market path while we work toward true zk balance proofs.
- Privacy Phase 4 now exposes an optional `shieldedBidVerifier` boundary inside the vault, allowing future zk verifier contracts to replace the fallback proof model without reshaping `placeShieldedBid(...)`.
