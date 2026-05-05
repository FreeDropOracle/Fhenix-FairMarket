# Security Status

## Current Posture

`Fhenix-FairMarket` is currently in a **security remediation** state and should be treated as a **prototype** rather than a production-ready privacy protocol.

## What Is Not Production-Ready Yet

- The current `CofheAdapter` path uses placeholder reversible encoding and does **not** provide production-grade bid confidentiality.
- Legacy witness claim paths were unsafe because they exposed reclaim material in calldata.
- Additional fixes are still required around shielded bid coverage, fallback accounting, and settlement liveness.

## Deployment Guidance

- Do **not** deploy the current prototype adapter stack to public networks.
- Use local development networks only until the production opaque-ciphertext path is implemented.
- Treat any public or testnet deployment as review/demo-only unless the remediation issues are closed.

## User-Facing Claim

Until the privacy remediation is complete, the application should be described as:

- `sealed-bid prototype`
- `review build`
- `security remediation build`

and **not** as:

- `production-private`
- `confidential by default`
- `privacy-preserving in production`

## Source of Truth

- [security_audit_report.md](./security_audit_report.md)
- [security_remediation_plan.md](./security_remediation_plan.md)
- [github_issues_master_draft.md](./github_issues_master_draft.md)
