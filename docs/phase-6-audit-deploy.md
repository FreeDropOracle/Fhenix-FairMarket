# Phase 6: Testnet Deployment, Monitoring & Final Audit

Phase 6 turns the completed protocol and product surface into an operator-ready system.

## Scope

- Deploy the market stack to Sepolia
- Export runtime configuration for the frontend and keeper services
- Smoke test and optionally verify contracts on the explorer
- Add Prometheus alert rules and a Grafana dashboard payload
- Provide load/chaos runbooks for resilience drills
- Hand over audit-ready documentation for reviewers

## Deployment Flow

1. Run `phase6:deploy:adapter:sepolia`
2. Run `phase6:deploy:core:sepolia`
3. Run `phase6:export:sepolia`
4. Run `phase6:smoke:sepolia`
5. Optionally run `phase6:verify:sepolia`

Generated runtime handoff lives under `packages/contracts/deployments/`:

- `sepolia.runtime.json`
- `sepolia.frontend.env`
- `sepolia.keeper.env`
- `sepolia.smoke.json`

## Observability Assets

- Prometheus scrape config: [packages/keeper/prometheus.yml](../packages/keeper/prometheus.yml)
- Alert rules: [monitoring/alerts.yml](../monitoring/alerts.yml)
- Grafana dashboard payload: [monitoring/grafana-dashboard.phase6.json](../monitoring/grafana-dashboard.phase6.json)

## Operational Gates

- `pnpm --filter contracts compile`
- `pnpm --filter keeper build`
- `pnpm --filter frontend build`
- `docker compose -f packages/keeper/docker-compose.yml --profile observability config`

## Handoff Targets

- Operator deployment checklist: [audit/audit-checklist.md](../audit/audit-checklist.md)
- Monitoring KPIs: [docs/operations/monitoring-kpis.md](./operations/monitoring-kpis.md)
- Security model: [docs/security-model.md](./security-model.md)
- Async settlement flow: [docs/architecture/async-cofhe-flow.md](./architecture/async-cofhe-flow.md)
