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

With the committed example file the services start in `dry-run` mode on purpose.
To execute a real local lifecycle you must fill:

- `KEEPER_MARKET_ADDRESS`
- `KEEPER_AVS_ADDRESS`
- `PRIVATE_KEY`
- `KEEPER_AVS_OPERATOR_KEYS`
- optionally `KEEPER_FHEOS_API_KEY` for the live endpoint

Ports:

- `9401` auction monitor metrics
- `9402` CoFHE dispatcher metrics
- `9403` AVS submitter metrics
- `9090` Prometheus
- `3001` Grafana

## Notes

- Redis is used for the distributed finalize lock and per-auction nonce coordination.
- Auction state and symbolic slashing logs are persisted under `packages/keeper/state/`.
- The runner now backfills auctions from chain state, queues resolving auctions for dispatch, and forwards completed resolutions to the AVS submitter when keys are configured.
- For real secrets, pass `--env-file packages/keeper/.env` to override the example values.
