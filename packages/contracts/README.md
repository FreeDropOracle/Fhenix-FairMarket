# Contracts Workspace

This workspace contains the runnable Phase 1 scaffold for `Fhenix-FairMarket`.

## Included in Phase 1

- `contracts/core/FhenixFairMarket.sol`: upgradeable auction foundation with `initialize`, `createAuction`, `lockEscrow`, and guarded state transitions
- `contracts/core/FhenixFairMarketProxy.sol`: thin `ERC1967Proxy` wrapper for UUPS deployments
- `contracts/adapters/CofheAdapter.sol`: adapter boundary that keeps the core contract isolated from future CoFHE vendor changes
- `contracts/mocks/*.sol`: local mock contracts used by the unit test suite
- `deploy/*.ts`: sequential deployment scripts for adapter first, then implementation + proxy
- [../../docs/phase-1-architecture.md](../../docs/phase-1-architecture.md): Phase 1 architecture review, upgrade notes, and state-machine diagram

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
- The core contract deliberately avoids importing FHE libraries directly. Future encrypted bid logic should continue to flow only through `ICofheAdapter`.
