# Monitoring KPIs

Phase 6 tracks protocol health through keeper-exported Prometheus metrics.

## Core KPIs

- `keeper_tracked_auctions`
  - Total auctions present in keeper state.
- `keeper_active_auctions`
  - Auctions that are still accepting escrow and confidential bids.
- `keeper_resolving_auctions`
  - Auctions waiting for CoFHE resolution and AVS submission.
- `keeper_pending_dispatch_jobs`
  - CoFHE backlog waiting for encrypted batch dispatch.
- `keeper_pending_resolution_artifacts`
  - AVS submission backlog waiting to settle on-chain.
- `keeper_average_dispatch_latency_ms`
  - Mean time spent resolving encrypted batches.
- `keeper_average_resolution_submit_latency_ms`
  - Mean delay between storing a resolution artifact and submitting it on-chain.
- `keeper_slashing_violations_total`
  - Count of fraud/slashing incidents recorded by the AVS submitter.

## Healthy Range

- Auction monitor loop freshness: `< 5 minutes`
- Pending dispatch jobs: `< 25`
- Pending resolution artifacts: `< 10`
- Average resolution submit latency: `< 300000 ms`
- Slashing violations: `0`

## Dashboard

Import [monitoring/grafana-dashboard.phase6.json](../../monitoring/grafana-dashboard.phase6.json) into Grafana and point it at the Prometheus service exposed through the keeper compose stack.

## Alert Rules

Prometheus loads [monitoring/alerts.yml](../../monitoring/alerts.yml), which raises alerts for:

- keeper service downtime
- stalled auction-monitor loops
- growing CoFHE backlogs
- stuck AVS submissions
- high settlement latency
- slashing violations
