# packages/zk

This workspace is a minimal transitional Groth16 pipeline for the Fhenix-FairMarket monorepo.

## Purpose

- Establish a working `circom` + `snarkjs` artifact flow in `packages/zk`
- Demonstrate a real ZK pipeline without changing production contract semantics
- Do not claim full shielded bid coverage semantics yet

## What this demo proves

The demo circuit proves a simple arithmetic relation between a private secret and a public value.
It is intentionally narrow and does not prove `noteAmount >= bidAmount` or any full bid coverage property.

## Tool assumptions

- `circom` is expected to be available as a system tool in Codespaces
- `snarkjs` is installed via `pnpm` in this workspace

## Workspace layout

- `circuits/demo.circom` — demo circuit
- `build/` — generated circuit artifacts
- `package.json` — snarkjs dependency and build scripts
- `scripts/` — helper scripts for witness generation

## Commands

From `/workspaces/Fhenix-FairMarket/packages/zk`:

1. `pnpm install`
2. `pnpm run compile`
3. `pnpm run pot:init`
4. `pnpm run pot:contribute`
5. `pnpm run setup`
6. `pnpm run contribute`
7. `pnpm run export:vk`
8. `pnpm run export:sol`
9. `pnpm run prove`
10. `pnpm run verify`

## Important note

This workspace is a transitional ZK milestone for the repo. It is not a production verifier for full shielded bid coverage.
A true privacy-preserving bid coverage proof will require additional contract-boundary semantics beyond the current `IShieldedBidVerifier` interface.
