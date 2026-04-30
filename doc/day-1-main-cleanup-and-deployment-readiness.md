# Day 1 Checklist: Main Cleanup and Deployment Readiness

Objective:

- make `main` the only active source of truth
- remove review noise from old PRs and split branches
- confirm deployment prerequisites before any live Sepolia action

Status at start:

- `PR #56` merged
- `PR #57` merged
- `PR #55` is superseded and should remain historical only

---

## Section 1: GitHub Cleanup

### 1. Close superseded PR #55

Actions:

1. open `PR #55`
2. post the superseded comment
3. close the PR without merging

Suggested comment:

```md
This draft PR is now superseded by the smaller stacked PRs created from it:

- #56 `Add Privacy Phase 1-2 blind auction core and live shielded flows`
- #57 `Add Privacy Phase 3-4 hardening and transitional test-only Groth16 scaffold`

Both follow-up PRs were split out to keep review scope cleaner, preserve a more
audit-friendly history, and land the work in smaller validated slices.

I am keeping this PR as historical context only, and plan to close it without
merging now that the split PRs have landed.
```

Done when:

- `PR #55` is closed

### 2. Delete temporary split branches

Branches to remove:

- `split/privacy-foundation`
- `split/privacy-hardening-zk`

Done when:

- GitHub no longer shows them as active delivery branches

### 3. Confirm merged state on `main`

Verify:

- `PR #56` is merged
- `PR #57` is merged
- no critical open PR remains for this milestone

Done when:

- `main` is the authoritative branch for this release slice

---

## Section 2: Local Repository Alignment

### 4. Refresh local repository

Run:

```powershell
git fetch origin
git switch main
git pull origin main
```

Verify:

```powershell
git log --oneline --decorate -n 10
```

Expected:

- `main` includes the merged work from `#56` and `#57`

Done when:

- local `main` matches `origin/main`

### 5. Confirm clean working tree

Run:

```powershell
git status --short
```

Expected:

- no uncommitted release-blocking changes

Done when:

- working tree is clean or any local-only files are intentionally understood

---

## Section 3: Deployment Secrets Review

### 6. Validate Phase 6 deployment inputs

Source of truth:

- `.github/workflows/deploy-testnet.yml`
- `.env.example`
- `packages/keeper/.env.example`

Required values to confirm:

- `PRIVATE_KEY`
- `SEPOLIA_RPC_URL`
- `SEPOLIA_WS_URL`
- `ETHERSCAN_API_KEY`
- `PHASE1_INITIAL_OWNER`
- `PHASE1_SLASHED_POT`
- `PHASE1_ADAPTER_ADDRESS`
- `PHASE2_SETTLEMENT_ENGINE`
- `PHASE3_AVS`
- `KEEPER_FHEOS_ENDPOINT`

Questions to answer:

- which values already exist in GitHub Secrets?
- which values still need to be created or rotated?
- which values are placeholders only?

Done when:

- every deployment input is either filled or explicitly marked missing

### 7. Validate keeper live-mode inputs

Required keeper runtime values:

- `KEEPER_MARKET_ADDRESS`
- `KEEPER_SETTLEMENT_ENGINE_ADDRESS`
- `KEEPER_AVS_ADDRESS`
- `PRIVATE_KEY`
- `KEEPER_AVS_OPERATOR_KEYS`
- `KEEPER_FHEOS_ENDPOINT`
- `KEEPER_FHEOS_API_KEY` if needed

Done when:

- you know exactly what will be used to move keeper from dry-run to live mode

---

## Section 4: Readiness Review

### 8. Confirm deployment assets and docs are present

Review these files:

- `docs/phase-6-audit-deploy.md`
- `audit/audit-checklist.md`
- `packages/keeper/README.md`
- `monitoring/alerts.yml`
- `monitoring/grafana-dashboard.phase6.json`

Answer:

- do we have deployment flow instructions?
- do we have keeper runtime instructions?
- do we have monitoring assets?
- do we have an audit closure checklist?

Done when:

- nothing essential for Day 2 is missing from the repository

---

## Day 1 Exit Criteria

Day 1 is complete only if all of the following are true:

- `PR #55` is closed
- split branches are deleted or clearly no longer needed
- local `main` matches `origin/main`
- release scope is settled on `main`
- Phase 6 secrets are reviewed
- keeper live-mode inputs are known
- deployment, monitoring, and audit reference files are confirmed present

If all exit criteria are met, move to:

- `Day 2: Phase 6 Deployment to Sepolia`
