# Audit Checklist

## Deployment Readiness

- [ ] `packages/contracts/deployments/sepolia.json` generated from Phase 6 deploy scripts
- [ ] `sepolia.runtime.json` exported for handoff
- [ ] `sepolia.frontend.env` delivered to the frontend deployment target
- [ ] `sepolia.keeper.env` delivered to keeper operators
- [ ] `sepolia.smoke.json` confirms address wiring and ownership
- [ ] Explorer verification completed or intentionally deferred with reason logged

## Contract Review Focus

- [ ] UUPS upgrade authorization reviewed
- [ ] Storage layout append-only guarantee reviewed
- [ ] Opening bid floor behavior covered by tests
- [ ] Resolution request / AVS digest domain separation covered by tests
- [ ] Reentrancy-sensitive claim paths reviewed
- [ ] Fallback void and slash logic reviewed

## Runtime & Operations

- [ ] Prometheus scrape targets are reachable
- [ ] Grafana dashboard imported
- [ ] Alert rules loaded and firing paths tested
- [ ] Keeper dry-run and configured modes both tested
- [ ] Load-test plan documented
- [ ] Chaos drill checklist documented

## Final Handover

- [ ] README / Phase 6 docs point to current operational assets
- [ ] Frontend build passes
- [ ] Keeper build passes
- [ ] Contracts compile and tests pass
- [ ] Deployment workflow is ready for `workflow_dispatch`
