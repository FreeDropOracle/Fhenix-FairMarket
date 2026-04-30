# Fhenix-FairMarket 10/10 Production Readiness Plan

Current status:

- `PR #56` is merged into `main`
- `PR #57` is merged into `main`
- core privacy, hardening, and transitional ZK milestone work is now on
  `origin/main`

Target outcome:

- clean GitHub state
- Sepolia deployment completed
- runtime artifacts generated
- frontend wired to live runtime
- keeper services running in live mode
- monitoring active
- audit checklist closed

---

## Day 1: Main Cleanup and Deployment Readiness

Goal:

- close superseded PRs
- remove temporary split branches
- confirm `main` is the source of truth
- validate all deployment secrets and runtime inputs

Detailed checklist:

- see `day-1-main-cleanup-and-deployment-readiness.md`

---

## Day 2: Phase 6 Deployment to Sepolia

Goal:

- execute the real deployment flow
- export deployment handoff artifacts
- complete smoke validation

Primary tasks:

1. Run or trigger:
   - `phase6:deploy:adapter:sepolia`
   - `phase6:deploy:core:sepolia`
   - `phase6:export:sepolia`
   - `phase6:smoke:sepolia`
   - `phase6:verify:sepolia` when explorer verification is desired
2. Confirm generated files under `packages/contracts/deployments/`
3. Confirm smoke report wiring is correct

Success condition:

- contracts deployed
- runtime artifacts exist
- smoke report passes

---

## Day 3: Frontend Runtime Wiring

Goal:

- connect the frontend to the actual Sepolia deployment artifacts

Primary tasks:

1. Use `sepolia.frontend.env`
2. confirm production addresses are set
3. run frontend build
4. test marketplace and portfolio pages against live runtime

Success condition:

- frontend uses live addresses, not fallback defaults

---

## Day 4: Keeper Live Activation

Goal:

- move keeper services from dry-run or observe-only into live operation

Primary tasks:

1. hydrate keeper runtime from `sepolia.keeper.env`
2. set live values for:
   - `KEEPER_MARKET_ADDRESS`
   - `KEEPER_SETTLEMENT_ENGINE_ADDRESS`
   - `KEEPER_AVS_ADDRESS`
   - `PRIVATE_KEY`
   - `KEEPER_AVS_OPERATOR_KEYS`
   - `KEEPER_FHEOS_ENDPOINT`
3. start:
   - auction monitor
   - CoFHE dispatcher
   - AVS submitter
4. verify logs show active work instead of dry-run

Success condition:

- keeper stack is running live on Sepolia

---

## Day 5: Monitoring and Alerts

Goal:

- make runtime health visible and actionable

Primary tasks:

1. load Prometheus scrape config
2. load alert rules from `monitoring/alerts.yml`
3. import Grafana dashboard
4. verify metrics stream correctly
5. test at least one alert path

Success condition:

- monitoring is not only committed, but actually active

---

## Day 6: End-to-End Live Validation

Goal:

- prove the product works as an actual live system

Primary tasks:

1. create auction
2. fund escrow or shielded escrow
3. place bid
4. trigger finalize
5. let keeper and settlement path complete
6. claim seller proceeds
7. claim refund or asset
8. document transaction hashes and screenshots

Success condition:

- one full live auction lifecycle is completed on Sepolia

---

## Day 7: Audit Closure and Launch Declaration

Goal:

- convert technical readiness into operational sign-off

Primary tasks:

1. close `audit/audit-checklist.md`
2. record active deployment addresses
3. record monitoring status
4. record keeper runtime status
5. write final launch note for the Sepolia milestone

Success condition:

- project reaches 10/10 readiness for the Sepolia milestone

---

## Final Definition of 10/10

The project is 10/10 for this milestone only when all of the following are
true:

- `main` contains the accepted release scope
- deployment artifacts exist for Sepolia
- smoke validation passed
- frontend is wired to the live deployment
- keeper services are live
- monitoring is active
- audit checklist is closed
