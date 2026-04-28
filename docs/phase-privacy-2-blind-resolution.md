# Privacy Phase 2: Blind Resolution

`Privacy Phase 2` extends the commitment-based escrow introduced in Phase 1 into a blind sealed-bid flow that keeps shielded bidders and shielded winners out of the public address-based settlement path.

## What changed

- `placeShieldedBid(...)` lets bidders attach encrypted bids to `commitmentHash` escrow notes instead of the public `address => bid` registry.
- `submitShieldedResolution(...)` finalizes the winning bid using a shielded identity witness attested by the AVS layer.
- `ShieldedEscrowVault.settleWinningCommitment(...)` moves only the winning amount into the market for seller settlement while leaving residual winner refund and losing refunds inside the shielded vault.
- `claimShieldedAsset(...)` lets the winning note holder reclaim the NFT without a winner wallet address ever being written into the auction record during settlement.
- The keeper pipeline can now dispatch and submit a mixed batch of public bids and shielded bids, marking the resolution as `public`, `shielded`, or `none`.

## Security properties gained

- Shielded bidders do not enter `getBidders()` and therefore do not appear in the public bidder roster.
- Shielded winner settlement no longer depends on a public winner wallet address.
- Losing shielded bids can be refunded without revealing a bidder address through the market’s address-keyed refund map.
- Seller payout still receives the actual winning amount, so auction economics stay intact even when the winner path is blind.

## What is still visible

This phase improves privacy materially, but it is not “absolute privacy” yet:

- transaction senders are still visible on-chain
- total escrow aggregates are still derivable
- shielded claim witnesses are still revealed at claim time
- the keeper / AVS settlement flow still exposes winner-linked metadata through attested calldata, even though the winner wallet is hidden

## What Phase 3 should target

- alias-based shielded identities that avoid exposing raw commitment hashes during settlement
- reduced leakage of escrow aggregates
- claim paths that avoid revealing reusable witness material in calldata
- eventual proof-based or private execution settlement that minimizes linkability between bid note, settlement, and claim
