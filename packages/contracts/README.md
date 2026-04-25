# Contracts Workspace

This workspace contains the runnable Phase 1 and Phase 2 contract foundation for `Fhenix-FairMarket`.

## Included in the current scope

- `contracts/core/FhenixFairMarket.sol`: upgradeable auction core with escrow locking, encrypted bid placement, guarded state transitions, refunds, seller settlement, and fallback logic
- `contracts/core/FhenixFairMarketProxy.sol`: thin `ERC1967Proxy` wrapper for UUPS deployments
- `contracts/adapters/CofheAdapter.sol`: adapter boundary that keeps the core contract isolated from future CoFHE vendor changes
- `contracts/adapters/NFTGuard.sol`: escrow helper for NFT custody and terminal asset release
- `contracts/settlement/SettlementEngine.sol`: centralized math for dynamic timeout, refunds, slashing, and seller payouts
- `contracts/settlement/SlashedPot.sol`: pull-based compensation pot for cancelled or voided auctions
- `contracts/mocks/*.sol`: local mock contracts used by the unit test suite
- `deploy/*.ts`: sequential deployment scripts for adapter/engine first, then proxy + slashed-pot wiring
- [../../docs/phase-1-architecture.md](../../docs/phase-1-architecture.md): Phase 1 architecture review, upgrade notes, and state-machine diagram
- [../../docs/phase-2-security-settlement.md](../../docs/phase-2-security-settlement.md): Phase 2 settlement, refund, slashing, and dynamic-timeout overview

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
- The CoFHE Hardhat plugin is installed and version-pinned in the workspace so later Fhenix-network phases can activate it without reworking dependencies.
- The default Phase 1 test path stays on the deterministic local adapter/mock implementation to keep the architectural foundation stable while full network-backed CoFHE flows are deferred to later phases.
- The adapter now models typed ciphertext handles (`euint32`, `ebool`), comparison helpers (`lte`, `gt`), conditional selection, and encrypted bid-coverage checks.
- The Phase 2 refund path is strictly pull-based. Compensation is computed per claimant and no payout loops are used in the core market contract.
- The core contract deliberately avoids importing FHE libraries directly. Encrypted bid logic should continue to flow only through `ICofheAdapter`.
