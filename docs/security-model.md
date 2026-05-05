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
- Append-only storage layout discipline across Phase 2-4 upgrades
- Pull-over-push payout paths for refunds, proceeds, and asset claims
- Explicit opening-bid floor validation
- Domain-separated request IDs and AVS digests
- Reentrancy hardening in payout-sensitive flows
- Slashed pot isolation for cancelled/voided auction compensation

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

## Current Operator Guidance

- Treat the current stack as review/demo-only on public testnets.
- Do not market the current bid lane as mathematically private until the real opaque-ciphertext path lands.
- Prefer local development networks for adapter and settlement rehearsals while remediation remains open.

## Audit Focus

- Upgrade authorization and storage layout safety
- Auction finalization invariants
- No-winner / zero-amount consistency
- Opening-bid floor enforcement
- AVS proof domain separation
- Keeper race handling and lock release discipline
