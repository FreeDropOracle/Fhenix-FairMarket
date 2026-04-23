# Contributing

## Current Repository State

As of April 23, 2026, this repository is documentation-first. The committed work focuses on architecture, execution planning, and GitHub automation. The contracts, frontend, keeper, and deployment code described in `README.md` are planned targets and may not exist yet in the repository tree.

## Contribution Rules

- Keep documentation changes aligned with the actual repository state.
- Treat any security-sensitive claim as something that must be backed by code, tests, or an explicit roadmap note.
- Do not describe workflows, packages, or deployment steps as available unless they are committed and reviewable.

## Branch Naming

Use `phase-N/short-description` when your work clearly belongs to one execution phase.

Examples:

- `phase-1/proxy-bootstrap`
- `phase-2/dynamic-timeout`
- `phase-6/testnet-playbook`

## Pull Request Expectations

- Explain which phase or audit gate the change supports.
- Call out any security implications or assumptions.
- Update `README.md` or related docs when repository reality changes.
- Prefer small, reviewable pull requests over large mixed-scope batches.

## Issue Templates

The repository currently ships these issue forms:

- `1_bug_report.yml`
- `7_epic_phase_tracker.yml`

Phase selection in those forms is synchronized to the matching `phase-*` label by GitHub automation.

## Security Reporting

Do not open public issues for critical vulnerabilities that could threaten funds or privacy. Use the private GitHub security advisory flow configured in `.github/ISSUE_TEMPLATE/config.yml`.
