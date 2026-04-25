# Keeper Network

Phase 4 turns the keeper package into an operational service layer for:

- watching `AuctionCreated` and `endTime`
- reserving the first finalize attempt with a lock and execution nonce
- batching CoFHE requests with a hard cap of `10`
- aggregating AVS signatures and writing symbolic slashing logs

## Local Commands

Use Node 22 LTS:

```bash
pnpm --filter keeper build
pnpm --filter keeper test
```

Start a role directly:

```bash
pnpm --filter keeper start:monitor
pnpm --filter keeper start:dispatcher
pnpm --filter keeper start:avs
```

## Docker

You can validate the stack directly with the committed example env file:

```bash
docker compose --env-file packages/keeper/.env.example -f packages/keeper/docker-compose.yml up --build
```

Optional observability services:

```bash
docker compose --env-file packages/keeper/.env.example -f packages/keeper/docker-compose.yml --profile observability up --build
```

Ports:

- `9401` auction monitor metrics
- `9402` CoFHE dispatcher metrics
- `9403` AVS submitter metrics
- `9090` Prometheus
- `3001` Grafana

## Notes

- Redis is used for the distributed finalize lock and per-auction nonce coordination.
- Auction state and symbolic slashing logs are persisted under `packages/keeper/state/`.
- The current runner wires the live chain path for `auction-monitor` and keeps the dispatcher/AVS roles ready for queue-driven local simulation.
- For real secrets, pass `--env-file packages/keeper/.env` to override the example values.
