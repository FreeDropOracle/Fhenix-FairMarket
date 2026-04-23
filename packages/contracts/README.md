# Contracts Workspace

This workspace contains the runnable Phase 1 scaffold for `Fhenix-FairMarket`.

## Included in Phase 1

- `contracts/core/FhenixFairMarket.sol`: upgradeable auction foundation with `initialize`, `createAuction`, `lockEscrow`, and guarded state transitions
- `contracts/core/FhenixFairMarketProxy.sol`: thin `ERC1967Proxy` wrapper for UUPS deployments
- `contracts/adapters/CofheAdapter.sol`: adapter boundary that keeps the core contract isolated from future CoFHE vendor changes
- `contracts/mocks/*.sol`: local mock contracts used by the unit test suite
- `deploy/*.ts`: sequential deployment scripts for adapter first, then implementation + proxy

## Commands

Run these from the repository root:

```bash
pnpm install
pnpm compile
pnpm test
pnpm coverage
```

## Notes

- The adapter currently provides a deterministic local placeholder implementation so Phase 1 can compile and test without depending on the full CoFHE execution stack.
- The core contract deliberately avoids importing FHE libraries directly. Future encrypted bid logic should continue to flow only through `ICofheAdapter`.
