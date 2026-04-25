# Phase 4: Decentralized Keepers and Infrastructure

Phase 4 hardens the off-chain execution layer around the encrypted settlement flow introduced in Phase 3.

## Delivered

- Keeper incentive reservation on `triggerFinalize()` with:
  - `0.2%` reward reservation for the first successful finalizer
  - per-auction finalization nonce
  - prior-block `blockhash` salt to harden request identity and race handling
- `claimFinalizeReward()` for terminal states (`FINALIZED` and `VOIDED`)
- seller payout and void-slash accounting updated so the keeper reward remains solvent
- keeper runtime package with:
  - auction monitoring and retry logic
  - batch-oriented CoFHE dispatcher with a hard batch cap of `10`
  - AVS submitter helpers with fraud-proof validation and symbolic slashing logs
  - file-backed local state and optional Redis lock coordination
- local infrastructure:
  - `packages/keeper/docker-compose.yml`
  - `packages/keeper/.env.example`
  - `packages/keeper/Dockerfile`
  - Prometheus/Grafana profile
- CI:
  - `.github/workflows/ci-contracts.yml`
  - `.github/workflows/ci-keeper.yml`

## Audit Notes

- Phase 4 storage was appended after the Phase 3 layout to preserve proxy upgrade safety.
- Finalization request identity now includes:
  - market address
  - auction id
  - bid count
  - end time
  - keeper nonce
  - race salt
- Keeper reward accounting is reserved before settlement and paid only after a terminal state, preventing insolvency.

## Local Validation Targets

- keeper monitor auto-detects auctions near `endTime`
- duplicate finalization is reduced through lock coordination and per-auction nonces
- dispatcher metrics show batch throughput and latency
- AVS symbolic slashing records are persisted as JSON
