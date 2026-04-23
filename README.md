# Fhenix-FairMarket

> **Sealed-Bid Auction Protocol** — Privacy-preserving, gas-efficient, and censorship-resistant, powered by CoFHE Coprocessing and EigenLayer AVS.

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.25-363636?logo=solidity)](https://soliditylang.org)
[![Fhenix](https://img.shields.io/badge/Fhenix-fhEVM-6C3CE1)](https://fhenix.io)
[![EigenLayer](https://img.shields.io/badge/EigenLayer-AVS-0ea5e9)](https://eigenlayer.xyz)
[![Status](https://img.shields.io/badge/Status-Documentation--First-2563eb)]()
[![Version](https://img.shields.io/badge/Version-2.0-orange)]()

</div>

> Repository state as of April 23, 2026: this repository currently contains architecture documents, execution planning material, and GitHub workflow scaffolding. The contracts, frontend, keeper, and CI paths described below are the target implementation and planned buildout, not code that already exists in this tree.

---

## Table of Contents

- [Overview](#-overview)
- [The Problem We Solve](#-the-problem-we-solve)
- [Architecture v2.0](#-architecture-v20)
  - [System Data Flow](#system-data-flow)
  - [State Machine](#state-machine)
  - [Component Map](#component-map)
- [Tech Stack](#-tech-stack)
- [Target Project Structure](#-target-project-structure)
- [6-Phase Execution Roadmap](#-6-phase-execution-roadmap)
  - [Phase 1 — Architectural Foundation](#-phase-1--architectural-foundation)
  - [Phase 2 — Encrypted Security & Settlement](#-phase-2--encrypted-security--settlement)
  - [Phase 3 — CoFHE & AVS Integration](#-phase-3--cofhe--avs-integration)
  - [Phase 4 — Keeper Network & Infrastructure](#-phase-4--keeper-network--infrastructure)
  - [Phase 5 — Frontend & UX 2.0](#-phase-5--frontend--ux-20)
  - [Phase 6 — Testnet Deployment & Audit](#-phase-6--testnet-deployment--audit)
- [Security Model](#-security-model)
- [Audit Readiness Matrix](#-audit-readiness-matrix)
- [Smart Contract Reference](#-smart-contract-reference)
- [Planned Local Development](#-planned-local-development)
- [Planned Testing](#-planned-testing)
- [Planned Deployment](#-planned-deployment)
- [Monitoring & KPIs](#-monitoring--kpis)
- [Governance](#-governance)
- [Ethics Charter](#-ethics-charter)
- [Contributing](#-contributing)

---

## 🔷 Overview

**Fhenix-FairMarket** is a decentralized sealed-bid auction protocol that resolves the fundamental tension between **absolute privacy** and **economic viability** in on-chain auctions.

Instead of executing expensive Fully Homomorphic Encryption (FHE) operations on-chain, the protocol adopts an **Asynchronous FHE Coprocessing** model via the `CoFHE` architecture, backed by `EigenLayer AVS` for economic verification — reducing gas costs by **~99.9%** while preserving mathematical integrity and eliminating any trusted intermediary.

### Key Innovations

| Innovation | Description |
|---|---|
| **O(1) On-chain Storage** | Only `Ciphertext Hash` is stored per bid — full FHE processing happens off-chain |
| **Pull-based Refunds** | `Pull over Push` pattern eliminates OOG risk and reentrancy vectors |
| **Dynamic Emergency Threshold** | `Moving Time Average` replaces fixed timeouts — network volatility-aware |
| **EigenLayer AVS Verification** | Fraud Proofs replace heavy ZK-circuits for fast economic finality |
| **ERC-4337 Session Keys** | Ephemeral keys managed by Smart Accounts — no `localStorage` exposure |
| **Keeper Incentives** | `triggerFinalize()` pays 0.2% to first executor — self-sustaining liveness |

---

## 🔴 The Problem We Solve

Traditional on-chain sealed-bid auctions face four fatal flaws. Fhenix-FairMarket v2.0 addresses each with a concrete architectural fix:

```
PROBLEM 1: Gas explosion (10x–100x overhead from on-chain FHE)
FIX: CoFHE Async — all comparisons run off-chain via FHEOS; on-chain cost = O(1) hash storage

PROBLEM 2: Deposit lockup on sequencer failure
FIX: Dynamic Dead Man's Switch — auto-VOID after Moving Time Average × 1.5 factor

PROBLEM 3: Push-based refunds vulnerable to OOG and reentrancy
FIX: Pull over Push with hasWithdrawn mapping; state updated before transfer

PROBLEM 4: Session key theft via localStorage
FIX: ERC-4337 Smart Account generates Ephemeral Session Permits — 24h TTL, memory-only
```

---

## 🏗 Architecture v2.0

### System Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FHENIX-FAIRMARKET PROTOCOL FLOW                         │
└─────────────────────────────────────────────────────────────────────────────────┘

  USER                  FRONTEND               SMART CONTRACT         OFF-CHAIN LAYER
   │                      │                         │                       │
   │──lockEscrow()───────►│──lockEscrow(ETH)───────►│                       │
   │                      │◄────────────────────────│ emit EscrowLocked     │
   │                      │                         │                       │
   │──placeBid(amount)───►│──encrypt(amount)        │                       │
   │                      │  via @cofhe/sdk         │                       │
   │                      │──placeBid(cipherHash)──►│ FHE.lte verify        │
   │                      │                         │ O(1) storage          │
   │                      │                         │                       │
   │                      │              ┌──────────┤ endTime reached       │
   │                      │              │          │                       │
   │                      │    KEEPER────┘          │                       │
   │                      │    triggerFinalize()───►│ emit DecryptionReq.   │
   │                      │                         │──────────────────────►│
   │                      │                         │                       │ FHEOS
   │                      │                         │                       │ compare
   │                      │                         │                       │ all hashes
   │                      │                         │◄──winnerCiphertext────│
   │                      │                         │◄──AVS Signatures──────│
   │                      │                         │                       │
   │                      │                  submitResolution()             │
   │                      │                  verify Fraud Proof             │
   │                      │                  → state: FINALIZED             │
   │                      │                         │                       │
   │──claimRefund()──────►│──claimRefund()─────────►│ Pull pattern          │
   │◄─────────────────────│◄──funds returned────────│ hasWithdrawn = true   │
```

### State Machine

```
                         ┌──────────┐
                         │  CREATED │
                         └────┬─────┘
                              │ lockEscrow() + NFT transfer
                              ▼
                         ┌──────────┐
                    ┌───►│  ACTIVE  │◄──── bidders place encrypted bids
                    │    └────┬─────┘
                    │         │ triggerFinalize() @ endTime
                    │         ▼
                    │    ┌────────────┐
                    │    │ RESOLVING  │◄──── FHEOS processing off-chain
                    │    └─────┬──────┘
                    │          │
              CANCEL│          ├──── submitResolution() + AVS Proof ──► FINALIZED
              before│          │
              endTime│         └──── Dynamic Timeout exceeded ──────────► VOIDED
                    │
                    └── cancelAuction() ──► CANCELLED
```

### Component Map

```
fhenix-fairmarket/
├── contracts/
│   ├── core/          ← FhenixFairMarket.sol (UUPS Impl)
│   │                     FhenixFairMarketProxy.sol (EIP-1967)
│   ├── adapters/      ← CofheAdapter.sol (FHE abstraction layer)
│   │                     NFTGuard.sol (asset locking)
│   ├── settlement/    ← SettlementEngine.sol (async resolution)
│   │                     SlashedPot.sol (compensation pool)
│   ├── factories/     ← AuctionFactory.sol (ERC-1167 clones)
│   └── interfaces/    ← IFhenixFairMarket / ICofheAdapter / ISettlementEngine
│
├── keeper/            ← auctionMonitor.ts (watches endTime)
│                         cofheDispatcher.ts (sends to FHEOS)
│                         avsSubmitter.ts (collects AVS signatures)
│
├── frontend/          ← Next.js 14 App Router
│                         useERC4337Session.ts
│                         useOptimisticUI.ts
│                         ConfidenceDashboard.tsx
│
└── docs/              ← async-cofhe-flow.md
                          security-model.md
                          monitoring-kpis.md
```

---

## ⚙️ Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Blockchain | Fhenix Testnet (fhEVM) → Mainnet | — |
| Smart Contracts | Solidity | `^0.8.25` |
| FHE Contracts | `@fhenixprotocol/cofhe-contracts` | `^0.2.0` |
| Client SDK | `@cofhe/sdk` | `^1.2.0` |
| Proxy Pattern | UUPS / EIP-1967 | — |
| Verification | EigenLayer AVS + Fraud Proofs | — |
| Account Abstraction | ERC-4337 Smart Accounts | — |
| Frontend | Next.js | `14` |
| Web3 Bindings | Wagmi v2 + Viem v1 | — |
| Tooling | Hardhat + `@cofhe/hardhat-plugin` | `^2.19` / `^0.3` |
| Automation | Chainlink / Gelato | — |
| Package Manager | pnpm workspaces | — |

---

## 📁 Target Project Structure

> This section describes the intended repository layout after the implementation phases are scaffolded. It is not the current file tree on disk.

```
fhenix-fairmarket/
├── README.md
├── .gitignore
├── .env.example                       # RPC, PRIVATE_KEY, EIGEN_LAYER_RPC
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
└── packages/
    ├── contracts/
    │   ├── hardhat.config.ts
    │   ├── contracts/
    │   │   ├── core/
    │   │   │   ├── FhenixFairMarket.sol
    │   │   │   └── FhenixFairMarketProxy.sol
    │   │   ├── adapters/
    │   │   │   ├── CofheAdapter.sol
    │   │   │   └── NFTGuard.sol
    │   │   ├── settlement/
    │   │   │   ├── SettlementEngine.sol
    │   │   │   └── SlashedPot.sol
    │   │   ├── factories/
    │   │   │   └── AuctionFactory.sol
    │   │   └── interfaces/
    │   │       ├── IFhenixFairMarket.sol
    │   │       ├── ICofheAdapter.sol
    │   │       └── ISettlementEngine.sol
    │   ├── deploy/
    │   │   ├── 00_deploy_adapters.ts
    │   │   ├── 01_deploy_core_proxy.ts
    │   │   └── 02_setup_factory.ts
    │   ├── tasks/
    │   │   ├── createAuction.ts
    │   │   ├── triggerFinalize.ts
    │   │   └── emergencyHalt.ts
    │   └── test/
    │       ├── unit/
    │       │   ├── EscrowLogic.test.ts
    │       │   ├── AsyncResolution.test.ts
    │       │   └── DynamicTimeout.test.ts
    │       ├── integration/
    │       │   └── CoFHEFlow.test.ts
    │       └── mocks/
    │           ├── MockCofhe.sol
    │           ├── MockEigenLayerAVS.sol
    │           └── MockERC4337Bundler.sol
    │
    ├── frontend/
    │   ├── src/
    │   │   ├── app/
    │   │   │   ├── layout.tsx
    │   │   │   ├── page.tsx
    │   │   │   └── auction/[id]/
    │   │   │       ├── page.tsx
    │   │   │       └── components/
    │   │   │           ├── BidForm.tsx
    │   │   │           ├── ConfidenceDashboard.tsx
    │   │   │           └── SettlementStatus.tsx
    │   │   └── lib/
    │   │       ├── cofhe/
    │   │       │   ├── client.ts
    │   │       │   ├── encryption.ts
    │   │       │   └── avd-proof.ts
    │   │       └── hooks/
    │   │           ├── useERC4337Session.ts
    │   │           └── useOptimisticUI.ts
    │   └── tests/
    │       ├── e2e/           # Playwright
    │       └── unit/          # Vitest
    │
    └── keeper/
        ├── src/
        │   ├── index.ts
        │   ├── services/
        │   │   ├── auctionMonitor.ts
        │   │   ├── cofheDispatcher.ts
        │   │   └── avsSubmitter.ts
        │   └── config.ts
        └── docker-compose.yml
```

---

## 🗺 6-Phase Execution Roadmap

> Each phase has a hard **Audit Gate** — a failed P0 check blocks progression to the next phase. No exceptions.

```
Phase 1          Phase 2          Phase 3          Phase 4          Phase 5          Phase 6
Architecture  →  Security     →  CoFHE/AVS    →  Keepers      →  Frontend     →  Deploy/Audit
10–14 days       12–16 days       14–18 days       10–12 days       12–15 days       10–14 days

[FOUNDATION]    [SETTLEMENT]   [INTEGRATION]   [INFRA]         [UX 2.0]        [PRODUCTION]
```

---

### 🟦 Phase 1 — Architectural Foundation

**Goal:** Set up the development environment, implement `UUPS Proxy` pattern, isolate `CoFHE` libraries via `Adapter`, and build the core state machine.

**Target Files:**
- `packages/contracts/hardhat.config.ts`
- `packages/contracts/core/FhenixFairMarket.sol`
- `packages/contracts/core/FhenixFairMarketProxy.sol`
- `packages/contracts/adapters/CofheAdapter.sol`
- `packages/contracts/test/mocks/MockCofhe.sol`
- `packages/contracts/test/unit/EscrowLogic.test.ts`

**Execution Tasks:**

1. Configure `hardhat.config.ts` with `@cofhe/hardhat-plugin` and pin all versions (`Solidity ^0.8.25`, `ethers v6`)
2. Build `FhenixFairMarketProxy.sol` with `UUPS/EIP-1967` pattern and secure `initialize()` function
3. Develop `CofheAdapter.sol` to wrap all `@fhenixprotocol/cofhe-contracts` calls (prevents direct dependency in core logic)
4. Implement `State Transition Matrix`: `CREATED → ACTIVE → RESOLVING → FINALIZED/CANCELLED/VOIDED`
5. Write `MockCofhe.sol` to simulate encryption operations locally without gas
6. Implement core unit tests (`EscrowLogic.test.ts`) targeting ≥70% logic coverage

**Audit Gate — Phase 1:**

- [ ] Contract inherits `UUPSUpgradeable` and blocks `upgradeToAndCall` for non-owner
- [ ] No direct `import` of FHE library in core contract — only via `ICofheAdapter` interface
- [ ] All state transitions work without unauthorized jumps
- [ ] Unit test coverage ≥ 70%

**Estimated Duration:** 10–14 days

---

### 🟨 Phase 2 — Encrypted Security & Settlement Logic

**Goal:** Implement solvency verification without decryption, individual refund system, dynamic emergency threshold, and safe cancellation/failure mechanics.

**Target Files:**
- `packages/contracts/core/FhenixFairMarket.sol` — `placeBid`, `claimRefund`, `triggerFallbackVoid`, `cancelAuction`
- `packages/contracts/settlement/SettlementEngine.sol`
- `packages/contracts/settlement/SlashedPot.sol`
- `packages/contracts/test/unit/AsyncResolution.test.ts`
- `packages/contracts/test/unit/DynamicTimeout.test.ts`

**Execution Tasks:**

1. Apply `FHE.lte(encryptedBid, FHE.asEuint32(escrowBalances[msg.sender]))` for encrypted balance verification
2. Design `Pull over Push` pattern in `claimRefund()` with `mapping hasWithdrawn` and no push loops
3. Build `DynamicTimeout` using `Moving Time Average` on `block.timestamp` — no hardcoded values
4. Implement `triggerFallbackVoid()` to recover all deposits and return NFT to seller when threshold exceeded
5. Develop `SlashedPot.sol` to distribute cancellation compensation via linear/time-based ratios
6. Write tests simulating 30-minute `Sequencer` outage and automatic emergency activation

**Execution Specifications:**

```solidity
// Pull over Push refund pattern
function claimRefund(uint256 _auctionId) external {
    require(state == FINALIZED || state == CANCELLED || state == VOIDED);
    require(!hasWithdrawn[msg.sender]);
    uint256 amount = escrowBalances[msg.sender];
    escrowBalances[msg.sender] = 0;
    hasWithdrawn[msg.sender] = true;
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success);
}

// Dynamic emergency threshold
function _getResolutionTimeout() internal view returns (uint256) {
    uint256 avgBlockTime = block.timestamp - lastBlockTimestamp;
    return avgBlockTime * 1.5; // self-compensating factor
}
```

**Audit Gate — Phase 2:**

- [ ] Zero `for/while` loops in refund or compensation logic
- [ ] Emergency threshold operates dynamically under network volatility simulation
- [ ] `triggerFallbackVoid()` returns 100% of liquidity and disables FHE engine
- [ ] P0 test coverage ≥ 90%

**Estimated Duration:** 12–16 days

---

### 🟧 Phase 3 — CoFHE & EigenLayer AVS Async Integration

**Goal:** Enable off-chain processing flow, event emission, and connect `EigenLayer AVS` for economic verification.

**Target Files:**
- `packages/contracts/interfaces/ISettlementEngine.sol`
- `packages/keeper/services/auctionMonitor.ts`
- `packages/keeper/services/cofheDispatcher.ts`
- `packages/keeper/services/avsSubmitter.ts`
- `packages/contracts/test/integration/CoFHEFlow.test.ts`
- `packages/contracts/test/mocks/MockEigenLayerAVS.sol`

**Execution Tasks:**

1. Modify `finalizeAuction()` to emit `DecryptionRequested` event with zero on-chain processing
2. Build `auctionMonitor.ts` to watch `endTime` and invoke `cofheDispatcher` on completion
3. Develop `cofheDispatcher.ts` to send `Ciphertext Hashes` to FHEOS servers and receive encrypted result
4. Integrate `avsSubmitter.ts` to collect operator signatures, verify `Fraud Proof`, and call `submitResolution()`
5. Write `MockEigenLayerAVS.sol` to simulate collective signing and Slashing mechanism locally
6. Implement `CoFHEFlow.test.ts` simulating complete cycle: create → encrypt → close → AVS result → withdrawal

**Integration Architecture:**

```
                    ┌───────────────────────────────────────────┐
                    │            OFF-CHAIN KEEPER LAYER          │
                    │                                           │
  endTime reached   │  auctionMonitor.ts                        │
  ────────────────► │    │                                      │
                    │    └─► cofheDispatcher.ts                 │
                    │             │                             │
                    │             └─► FHEOS Server              │
                    │                    │ winnerCiphertext      │
                    │                    ▼                       │
                    │         avsSubmitter.ts                   │
                    │             │ collect N operator sigs      │
                    │             │ verify Fraud Proof           │
                    │             └─► submitResolution()         │
                    └───────────────────────────────────────────┘
```

**Audit Gate — Phase 3:**

- [ ] Zero plaintext bid values broadcast in Events or Storage
- [ ] FHEOS result rejected without valid AVS Fraud Proof
- [ ] Integration test passes 100% in local environment (`hardhat localcofhe`)
- [ ] Slashing mechanism auto-applies on fraudulent results

**Estimated Duration:** 14–18 days

---

### 🟥 Phase 4 — Decentralized Keeper Network & Infrastructure

**Goal:** Self-paying keeper execution, batch processing, race condition prevention, and local Docker setup.

**Target Files:**
- `packages/keeper/config.ts`
- `packages/keeper/docker-compose.yml`
- `packages/keeper/services/*.ts` (performance improvements)
- `.github/workflows/ci-contracts.yml`

**Execution Tasks:**

1. Convert `triggerFinalize()` to `public` function with `0.2%` incentive for first valid executor
2. Add `nonce` or `blockhash` to prevent Race Conditions between multiple Keepers
3. Implement `Batch Queue` capping at 10 auctions/block to prevent OOG under load
4. Configure `docker-compose.yml` to run `auctionMonitor + cofheDispatcher + avsSubmitter` locally
5. Connect `ci-contracts.yml` to auto-run integration tests on every `push`

**Keeper Incentive Model:**

```
triggerFinalize() → public
  ├── First Keeper to call → receives 0.2% of auction value
  ├── nonce check prevents duplicate execution
  └── Batch limit: max 10 auctions per block
```

**Audit Gate — Phase 4:**

- [ ] Keepers auto-invoke closure at `endTime` without human intervention
- [ ] Batch processing maintains stable gas under network congestion
- [ ] `docker compose up` succeeds and simulates full cycle locally
- [ ] CI pipelines pass without errors

**Estimated Duration:** 10–12 days

---

### 🟪 Phase 5 — Frontend & UX 2.0

**Goal:** Build Next.js interface with ERC-4337 key isolation, optimistic UI, and non-revealing trust dashboards.

**Target Files:**
- `packages/frontend/src/lib/hooks/useERC4337Session.ts`
- `packages/frontend/src/lib/hooks/useOptimisticUI.ts`
- `packages/frontend/src/lib/cofhe/encryption.ts`
- `packages/frontend/src/app/auction/[id]/components/BidForm.tsx`
- `packages/frontend/src/app/auction/[id]/components/ConfidenceDashboard.tsx`
- `packages/frontend/tests/e2e/auction-flow.spec.ts`

**Execution Tasks:**

1. Implement `useERC4337Session.ts` to create `Smart Account` and temporary session keys (no `localStorage`)
2. Develop `useOptimisticUI.ts` to update button state immediately on signing before network confirmation
3. Build `ConfidenceDashboard.tsx` showing only: bid count, time remaining, encryption status
4. Connect `BidForm.tsx` to `encryption.ts` with pre-submission checks (`euint32` range validation)
5. Write `Playwright` E2E tests covering: connect wallet → encrypt → track status → claim refund
6. Replace technical jargon (`FHE`, `AVS`, `Threshold`) with privacy-focused language

**UX 2.0 Design Principles:**

```
Technical Term     →    User-Facing Language
─────────────────────────────────────────────
FHE Encryption     →    🔒 Bid Protected
CoFHE Processing   →    🛡 Sealed Vault Active
AVS Verification   →    ✅ Verified by Network
Threshold Exceeded →    ⚠️  Automatic refund issued

ConfidenceDashboard shows ONLY:
  • Number of sealed bids: 24
  • Time until reveal: 4:00 PM
  • Your bid status: Encrypted & Confirmed
```

**Audit Gate — Phase 5:**

- [ ] Session keys never stored in `localStorage` or `cookies`
- [ ] Optimistic UI auto-reverts on transaction rejection
- [ ] `ConfidenceDashboard` displays zero numeric bid values or winner addresses
- [ ] E2E tests pass 100% on simulation environment

**Estimated Duration:** 12–15 days

---

### 🟫 Phase 6 — Testnet Deployment, Monitoring & Final Audit

**Goal:** Deploy to `Fhenix Testnet`, activate KPIs, set up alerting, and prepare for external audit.

**Target Files:**
- `.github/workflows/deploy-testnet.yml`
- `docs/architecture/async-cofhe-flow.md`
- `docs/operations/monitoring-kpis.md`
- `docs/security-model.md`
- `packages/contracts/test/mocks/` — coverage reports

**Execution Tasks:**

1. Implement `deploy-testnet.yml` with sequential deployment: `Adapters → Proxy → Factory`
2. Activate performance metrics: `Avg Decryption Latency`, `Failed Decryption Attempts`, `Gas/Bid`
3. Set up alert system (`Slack/PagerDuty`) for emergency thresholds (`>300s latency`, `>5% failure rate`)
4. Document `EmergencyHalt`, `Multisig/DAO` permissions, and vulnerability disclosure model (`Immunefi`)
5. Run load test (50 concurrent auctions) measuring `CoFHE Dispatcher` stability
6. Compile report ready for external auditor (`CertiK` / `OpenZeppelin`)

**Audit Gate — Final (Definition of Done):**

- [ ] All P0/P1 items completed and documented
- [ ] Testnet deployment stable for 72 consecutive hours
- [ ] Load tests pass without `OOG` or `Decryption Timeout`
- [ ] Documentation matches actual code 100%
- [ ] Project officially ready for **Tier-A External Audit** request

**Estimated Duration:** 10–14 days

---

### Phase Timeline Summary

```
Week  1-2   ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Phase 1: Architecture
Week  3-4   ░░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░  Phase 2: Security
Week  5-7   ░░░░░░░░░████████████████░░░░░░░░░░░░░░░  Phase 3: CoFHE/AVS
Week  8-9   ░░░░░░░░░░░░░░░░░████████████░░░░░░░░░░░  Phase 4: Keepers
Week 10-12  ░░░░░░░░░░░░░░░░░░░░░░░████████████░░░░░  Phase 5: Frontend
Week 13-14  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████░░  Phase 6: Deploy/Audit

            ↑ Phase 5 can run in parallel with Phase 2 using mock ABIs
```

> ⚠️ **Critical Execution Note:** Any P0 Audit Gate failure halts progression to the next phase. Never skip `DynamicTimeout` or `Pull over Push` under any circumstance.

---

## 🔐 Security Model

### Threat Matrix & Mitigations

| Threat | Attack Vector | Mitigation |
|---|---|---|
| Bid value leak | Event emitting plaintext | Only `bytes32 ciphertext` in all Events — verified by CI lint rule |
| Reentrancy in refund | `claimRefund()` before state update | State (`hasWithdrawn = true`) updated before ETH transfer |
| Session key theft | `localStorage` key storage | ERC-4337 Ephemeral Keys — 24h TTL, memory-only |
| Sequencer manipulation | Fixed timeout exploitation | `Moving Time Average × 1.5` dynamic threshold |
| Fake AVS result | Corrupt operator output | EigenLayer Fraud Proof required before `submitResolution()` |
| Race condition in keepers | Multiple keepers competing | `nonce`/`blockhash` gating on `triggerFinalize()` |
| Upgrade manipulation | Unauthorized proxy upgrade | `UUPSUpgradeable` — only owner can call `upgradeToAndCall` |
| Gas exhaustion via loops | Push-based payouts | Batch queue max 10/block; all refunds are Pull-based |

### Emergency Protocol — Funds Over Privacy

In case of critical `@cofhe/sdk` vulnerability or `EigenLayer` network failure, `EmergencyHalt` activates:

```
Step 1: Freeze new FHE encryption
Step 2: Open public claimRefund() path (no FHE required)
Step 3: Return NFT to seller
Step 4: Emit EmergencyHaltActivated event

→ Funds are protected before privacy in extreme emergency conditions
```

---

## ✅ Audit Readiness Matrix

### Priority Classification

| Priority | Description | Criteria |
|---|---|---|
| 🔴 P0 | Security-critical | Must be complete before any deployment |
| 🟡 P1 | High importance | Must be complete before Mainnet |
| 🟢 P2 | Enhancement | Target for v2.1 |

### P0 Checklist

- [ ] `UUPS Proxy` isolation — no logic in storage contract, no unauthorized upgrades
- [ ] `CofheAdapter` abstraction — zero direct FHE imports in `FhenixFairMarket.sol`
- [ ] State machine exhaustive — all 6 states reachable, no unauthorized transitions
- [ ] `FHE.lte` solvency check — encrypted bid never exceeds `escrowBalances[msg.sender]`
- [ ] Pull refund pattern — zero `for/while` loops in any payout function
- [ ] Dynamic timeout — `Moving Time Average` not hardcoded block count
- [ ] `triggerFallbackVoid()` — 100% liquidity recovery on activation
- [ ] No plaintext bids — zero bid values in Events or Storage (enforced by CI)
- [ ] AVS Fraud Proof — `submitResolution()` rejects without valid proof
- [ ] ERC-4337 session keys — no `localStorage` or cookie storage (ESLint rule enforced)
- [ ] Sequential deployment scripts — `Adapters → Proxy → Factory` ordering guaranteed
- [ ] Environment secrets — no keys in `hardhat.config.ts` or `next.config.js`

### Verification Stack

| Layer | Tool | Purpose |
|---|---|---|
| Contracts | `slither` + `mythril` | Static analysis, vulnerability detection |
| Contracts | `hardhat-gas-reporter` | Gas profiling per function |
| FHE/CoFHE | `@cofhe/mock-contracts` | Local encryption simulation (zero gas) |
| Frontend | `Playwright` + `axe-core` | E2E tests + accessibility |
| Security | `immunefi-template` | Bug Bounty program setup |
| Monitoring | `OpenZeppelin Defender` | Live event and AVS submission monitoring |
| Load Testing | Tenderly Fork | 50 concurrent auction simulation |

---

## 📜 Smart Contract Reference

### Core Functions

```solidity
// Lock collateral — public, ETH/WETH
function lockEscrow(uint256 auctionId) external payable
    // Guard: nonReentrant

// Submit encrypted bid — O(1) gas
function placeBid(uint256 auctionId, InEuint32 calldata encryptedBid) external
    // Guard: FHE.lte(encryptedBid, escrowBalances[msg.sender])
    // Storage: ciphertext hash only

// Trigger settlement — public, keeper-incentivized
function triggerFinalize(uint256 auctionId) external
    // Reward: 0.2% of auction value to caller
    // Guard: nonce/blockhash for race condition prevention

// Submit off-chain resolution
function submitResolution(uint256 auctionId, bytes32 winnerCiphertext, bytes calldata avsProof) external
    // Guard: EigenLayer AVS Fraud Proof verification

// Individual pull refund
function claimRefund(uint256 auctionId) external
    // Guard: !hasWithdrawn[msg.sender], state ∈ {FINALIZED, CANCELLED, VOIDED}
    // Pattern: state update BEFORE transfer

// Emergency recovery
function triggerFallbackVoid(uint256 auctionId) external
    // Guard: block.timestamp > endTime + _getResolutionTimeout()
    // Effect: 100% escrow recovery, NFT return, FHE engine disabled
```

### Events

```solidity
event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 endTime);
event EscrowLocked(uint256 indexed auctionId, address indexed bidder, uint256 amount);
event BidPlaced(uint256 indexed auctionId, address indexed bidder, bytes32 cipherHash);
event DecryptionRequested(uint256 indexed auctionId, bytes32[] cipherHashes);
event AuctionFinalized(uint256 indexed auctionId, bytes32 winnerCiphertext);
event RefundClaimed(uint256 indexed auctionId, address indexed claimant, uint256 amount);
event EmergencyHaltActivated(uint256 indexed auctionId, uint256 timestamp);

// Note: Zero bid values are broadcast in any event — CI enforced
```

---

## 🛠 Planned Local Development

> These commands are the intended bootstrap flow once the Phase 1 scaffold lands in the repository. They are not runnable against the current tree yet.

### Prerequisites

```bash
node >= 20.0.0
pnpm >= 9.0.0
docker >= 24.0.0
```

### Setup

```bash
git clone https://github.com/your-org/fhenix-fairmarket
cd fhenix-fairmarket
pnpm install
cp .env.example .env
# Fill in: RPC_URL, PRIVATE_KEY, EIGEN_LAYER_RPC
```

### Start Local Environment

```bash
# Start local CoFHE node + Keeper services
docker compose -f packages/keeper/docker-compose.yml up -d

# Deploy to local Hardhat network
pnpm hardhat run packages/contracts/deploy/00_deploy_adapters.ts --network localhost
pnpm hardhat run packages/contracts/deploy/01_deploy_core_proxy.ts --network localhost
pnpm hardhat run packages/contracts/deploy/02_setup_factory.ts --network localhost

# Start frontend
pnpm --filter frontend dev
```

### Interactive CLI Tasks

```bash
# Create a test auction
pnpm hardhat createAuction --nft 0x... --token-id 1 --duration 3600

# Manually trigger finalization
pnpm hardhat triggerFinalize --auction-id 1

# Emergency halt (testing only)
pnpm hardhat emergencyHalt --auction-id 1
```

---

## 🧪 Planned Testing

> The suites below are target coverage and execution plans for the implementation repo. They are documented here so the delivery path is explicit before code lands.

### Test Architecture

```
Unit Tests     → packages/contracts/test/unit/
               EscrowLogic.test.ts     (P0 — escrow and bid validation)
               AsyncResolution.test.ts (P0 — state transitions)
               DynamicTimeout.test.ts  (P0 — emergency threshold)

Integration    → packages/contracts/test/integration/
               CoFHEFlow.test.ts       (full cycle: create→encrypt→close→AVS→withdraw)

E2E (Frontend) → packages/frontend/tests/e2e/
               auction-flow.spec.ts    (Playwright: wallet→bid→track→claim)

Unit (Frontend) → packages/frontend/tests/unit/
               (Vitest — React component tests)
```

### Run Tests

```bash
# Smart contract unit tests
pnpm --filter contracts test

# Contract test coverage report
pnpm --filter contracts coverage

# Integration tests (requires local CoFHE node)
pnpm --filter contracts test:integration

# Frontend E2E
pnpm --filter frontend test:e2e

# All tests
pnpm test
```

### Coverage Requirements

| Test Suite | Required Coverage | Phase |
|---|---|---|
| `EscrowLogic.test.ts` | ≥ 70% | Phase 1 Gate |
| All P0 unit tests | ≥ 90% | Phase 2 Gate |
| `CoFHEFlow.test.ts` | 100% pass | Phase 3 Gate |
| Frontend E2E | 100% pass | Phase 5 Gate |

---

## 🚀 Planned Deployment

> This deployment sequence is the intended release path after the contracts and CI workflows exist in-repo.

### Fhenix Testnet

```bash
# Sequential deployment (order is load-bearing)
pnpm hardhat run packages/contracts/deploy/00_deploy_adapters.ts --network fhenix-testnet
pnpm hardhat run packages/contracts/deploy/01_deploy_core_proxy.ts --network fhenix-testnet
pnpm hardhat run packages/contracts/deploy/02_setup_factory.ts --network fhenix-testnet
```

### Planned CI/CD Pipelines

| Pipeline | Trigger | Checks |
|---|---|---|
| `ci-contracts.yml` | PR to `main` | Solidity compile + unit tests + slither |
| `ci-frontend.yml` | PR to `main` | Next.js build + TypeScript check + E2E |
| `deploy-testnet.yml` | Push to `release/*` | Sequential deploy + smoke test |

### Pre-flight Checklist

Before any deployment, verify:

- [ ] All unit tests ≥ 90% coverage
- [ ] Zero Solidity or TypeScript warnings
- [ ] `DynamicTimeout` works under network interruption simulation
- [ ] ERC-4337 session keys are not stored in `localStorage`
- [ ] `Slither` and `Mythril` run with zero `High` severity findings
- [ ] Rollback plan documented and approved

---

## 📊 Monitoring & KPIs

### Critical Performance Indicators

| KPI | Target | Alert Threshold | Response |
|---|---|---|---|
| Avg CoFHE Resolution Latency | < 120s | > 300s | Add AVS validators |
| Fraud Proof Verification Failure Rate | 0% | Any failure | Activate `EmergencyHalt` immediately |
| `claimRefund()` Success Rate | > 99% | < 99% | Review Bundler `Gas Limit` |
| Keeper Auto-execution Rate | > 95% | < 95% | Raise incentive to 0.3% |
| Failed Decryption Attempts | < 1% | > 5% | FHEOS node health check |

### Alerting Setup

```bash
# Recommended: Tenderly + OpenZeppelin Defender
# Monitors: EmergencyHaltActivated, DecryptionRequested timeout, AVS submission failures

# Slack/PagerDuty integration documented in:
# docs/operations/monitoring-kpis.md
```

---

## ⚖️ Governance

- **Proxy Pattern:** `UUPS` — logic fully separated from funds
- **Upgrade Delay:** 48-hour `Timelock` mandatory before any upgrade execution
- **Governance Council:** 9 members (5-of-9 multisig required)
  - Core dev team
  - External security auditor
  - Community representative
  - AVS node operator
  - Legal/compliance advisor
- **Vulnerability Disclosure:** `Immunefi` Bug Bounty program — see `docs/security-model.md`

---

## 🤝 Ethics Charter

1. **Privacy is a fundamental right** — never sacrificed for convenience
2. **Integrity is mathematical** — not a promise from an intermediary
3. **Transparency in costs and risks** — disclosed before any interaction
4. **Immediate vulnerability disclosure** — fair Bug Bounty rewards via `Immunefi`
5. **Funds over privacy in extremis** — `EmergencyHalt` prioritizes capital recovery

---

## 📋 Contributing

Please read [CONTRIBUTING.md](docs/CONTRIBUTING.md) before submitting PRs.

**Branch naming:** `phase-N/description` (e.g., `phase-2/dynamic-timeout`)

**PR requirements:**
- All Audit Gate checks for your phase must pass
- Changelog entry linking changes to Audit Matrix items
- Coverage report attached
- Reviewer: minimum 2 approvals + `security-lead` for any `security`-labeled PR

**Issue templates:** `.github/ISSUE_TEMPLATE/` currently includes bug reports and phase tracker epics. Additional templates can be added as implementation work expands.

---

<div align="center">

**Built for the Fhenix ecosystem** · Powered by CoFHE · Secured by EigenLayer AVS

*Encrypted. Verified. Unstoppable.*

</div>
