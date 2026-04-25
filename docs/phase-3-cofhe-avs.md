# Phase 3: CoFHE and EigenLayer AVS

## Scope

Phase 3 converts auction finalization from a direct owner-set resolution into an asynchronous settlement flow:

- `triggerFinalize()` now emits a projectable decryption request and moves the auction into `RESOLVING`.
- The market tracks a pending request id plus synthetic `winnerHandle` / `amountHandle` identifiers.
- Resolution submission now requires an AVS-backed proof before the auction can move to `FINALIZED`.
- Invalid or tampered proofs do not finalize the auction and instead trigger symbolic slashing on the mock AVS.

## Contract Changes

### Async request lifecycle

The market contract now exposes:

- `FinalizationTriggered(uint256 auctionId, bytes32 requestId)`
- `DecryptionRequested(uint256 auctionId, bytes32 requestId, bytes32 winnerHandle, bytes32 amountHandle)`
- `getResolutionRequest(uint256 auctionId)`
- `getBidders(uint256 auctionId)`

Bidder addresses are tracked the first time an encrypted bid is submitted so the keeper layer can replay the encrypted orderbook without storing plaintext values on-chain.
The new Phase 3 storage is appended after the legacy Phase 2 slots so the UUPS proxy layout remains upgrade-safe.

### Settlement engine expansion

`SettlementEngine.sol` still owns timeout and payout math, but now also:

- derives deterministic request metadata via `prepareResolutionRequest(...)`
- delegates AVS proof verification via `verifyResolutionProof(...)`
- stores the active AVS verifier address with owner-controlled rotation
- binds request ids and AVS verification digests to the market address so proofs cannot be replayed across sibling markets that share the same engine or AVS

### Mock EigenLayer AVS

`MockEigenLayerAVS.sol` simulates threshold-attested settlement with:

- operator allowlisting
- threshold checks
- ECDSA-based attestations over the settlement digest
- symbolic slashing when a submitter tries to finalize with a proof envelope that does not match the submitted payload

## Keeper Package

`packages/keeper` now contains three implementation-oriented modules:

- `services/auctionMonitor.ts`: identifies expired auctions and extracts pending request metadata
- `services/cofheDispatcher.ts`: reconstructs the encrypted orderbook and produces a local CoFHE-style resolution candidate
- `services/avsSubmitter.ts`: collects threshold signatures from AVS operators and packages the proof envelope

These modules are dependency-light on purpose so the contract integration tests can exercise the same orchestration logic locally.

## Test Coverage

Phase 3 is validated by:

- `test/integration/CoFHEFlow.test.ts`: full end-to-end async path
- `test/unit/AsyncResolution.test.ts`: valid settlement and tampering rejection
- updated Phase 1/2 regression suites to use AVS-backed `submitResolution(...)`

The local test matrix now proves:

- `ACTIVE -> RESOLVING -> FINALIZED` state transitions
- proof-gated settlement acceptance
- fallback void behavior when no valid resolution arrives
- symbolic slashing on tampered AVS submissions
