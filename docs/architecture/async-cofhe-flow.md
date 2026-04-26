# Async CoFHE Settlement Flow

```mermaid
flowchart TD
    Seller[Seller creates auction and locks NFT] --> Active[Auction ACTIVE]
    Bidder[Bidder locks escrow and submits encrypted bid] --> Active
    Active --> Ended[End time reached]
    Ended --> KeeperMonitor[Auction monitor triggers finalize]
    KeeperMonitor --> Request[Market creates resolution request handles]
    Request --> Dispatcher[CoFHE dispatcher batches encrypted bids]
    Dispatcher --> FHEOS[FHEOS / CoFHE coprocessor resolves winner + amount]
    FHEOS --> Artifact[Resolution artifact stored]
    Artifact --> AVS[AVS submitter collects threshold signatures]
    AVS --> MarketSubmit[submitResolution on market]
    MarketSubmit --> Finalized[FINALIZED or VOIDED]
    Finalized --> Claims[Winner claims NFT / seller claims proceeds / losers claim refunds]
```

## Notes

- The market never exposes plaintext bids on-chain.
- `triggerFinalize` creates the request identity and binds it to the market address.
- CoFHE dispatch batches are bounded to reduce keeper-side overload.
- AVS signatures are verified against the market address and request identifier before finalization is accepted.
- Fallback void logic remains available when the async path exceeds the dynamic timeout window.
