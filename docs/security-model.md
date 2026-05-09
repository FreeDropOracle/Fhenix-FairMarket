# Security Model

## Current Prototype Limitations

- The current `CofheAdapter` path is a prototype and does not provide production-grade ciphertext privacy.
- Public-network deployments must not rely on the current adapter as proof of private bidding.
- Legacy witness claim paths are being retired in favor of authorization-based claims because calldata-visible secrets are unsafe.
- Shielded bid coverage and fallback accounting still require the follow-up remediation items tracked in the security plan.

## Trust Boundaries

- **Market contract**
  - Holds NFT custody during auction execution.
  - Enforces state transitions, payout eligibility, and opening-bid validity.
- **CoFHE / FHEOS**
  - Resolves encrypted bids off-chain and returns winner artifacts.
- **AVS**
  - Attests that the resolved winner payload matches the expected request.
- **Keepers**
  - Trigger finalization, batch encrypted jobs, and relay AVS-backed settlement.

## Primary Protections

- UUPS upgradeability with owner-controlled `_authorizeUpgrade`
- `_disableInitializers()` on the UUPS implementation contract; the supporting vault, registry, settlement, and pot contracts use constructor-based ownership instead of proxy initializers
- Per-auction dependency snapshots for market, vault, registry, adapter, settlement engine, and slashed pot resolution paths
- Append-only storage layout discipline across Phase 2-4 upgrades
- Pull-over-push payout paths for refunds, proceeds, and asset claims
- Explicit opening-bid floor validation
- Domain-separated request IDs and AVS digests
- Reentrancy hardening in payout-sensitive flows
- Slashed pot isolation for cancelled/voided auction compensation
- Optional TimelockController + multisig admin layer for shared/public-network ownership rotation

## Key Failure Modes

- **Prototype bid privacy misunderstood as production privacy**
  - Mitigation: explicit repository warning, `SECURITY_STATUS.md`, frontend review language, and deployment guards for the current adapter path.
- **Keeper outage**
  - Mitigation: backfill from chain state, metrics freshness alerts, distributed finalize lock.
- **CoFHE delay**
  - Mitigation: pending dispatch and latency alerts, fallback void path after timeout.
- **AVS fraud or mismatched payload**
  - Mitigation: digest verification and symbolic slashing log entries.
- **User misconfiguration**
  - Mitigation: Sepolia-only app guard, explicit contract registry readiness, generated runtime env snippets.
- **Admin key compromise or rushed dependency rotation**
  - Mitigation: per-auction dependency snapshots, optional timelock ownership handoff, and admin-rotation event monitoring.

## Current Operator Guidance

- Treat the current stack as review/demo-only on public testnets.
- Do not market the current bid lane as mathematically private until the real opaque-ciphertext path lands.
- Prefer local development networks for adapter and settlement rehearsals while remediation remains open.
- On shared or public networks, do not leave contract ownership on a deployer EOA. Use `ADMIN_MULTISIG_ADDRESS` and `deploy/08_deploy_admin_timelock.ts` to transfer ownership to a timelock controlled by multisig roles.
- Run `deploy/09_admin_rotation_monitor.ts` on a schedule or after admin operations to surface `OwnershipTransferred`, dependency updates, verifier changes, and timelock execution activity.

## Audit Focus

- Upgrade authorization and storage layout safety
- Auction finalization invariants
- No-winner / zero-amount consistency
- Opening-bid floor enforcement
- AVS proof domain separation
- Keeper race handling and lock release discipline
- Owner rotation and dependency-change monitoring discipline
