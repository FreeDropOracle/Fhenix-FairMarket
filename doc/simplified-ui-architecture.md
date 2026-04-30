# Simplified UI Architecture

Goal:

- keep all current site sections
- reduce friction for normal users
- preserve the premium brand direction
- move advanced protocol concepts into progressive disclosure instead of making
  them the first thing users must process

Current sections to preserve:

- `Overview`
- `Marketplace`
- `Portfolio`
- `Governance`
- `About`

---

## 1. Core UX Position

This product should feel:

- premium
- private
- trustworthy
- simple to start using

It should not feel:

- protocol-heavy on first contact
- governance-first
- dashboard-dense before the user understands the main action

The main shift is:

- from `architecture-first UI`
- to `user-task-first UI`

---

## 2. Navigation Strategy

Keep all sections, but do not give them equal visual weight.

Recommended desktop navigation:

```text
[Logo]  Overview  Marketplace  Portfolio            Governance  About   [Wallet]
```

Priority model:

- primary:
  - `Overview`
  - `Marketplace`
  - `Portfolio`
- secondary:
  - `Governance`
  - `About`

Why:

- new users mainly need to understand the product, browse auctions, and manage
  their own activity
- governance and about matter, but they should not compete with the core path

Recommended mobile navigation:

```text
[Overview] [Market] [Portfolio] [More]
```

Inside `More`:

- `Governance`
- `About`

This preserves all sections without forcing five top-level tabs into a cramped
 mobile layout.

---

## 3. Top-Level User Journeys

The UI should optimize for three journeys first:

1. `Understand the product`
2. `Browse or join an auction`
3. `Track and claim outcomes`

Everything else should support those three journeys, not compete with them.

---

## 4. Section-by-Section Simplification

## Overview

Purpose:

- explain what the platform is
- explain why privacy matters
- move the user toward a first action

Recommended structure:

1. simple hero
2. one-sentence value proposition
3. two primary actions:
   - `Explore Auctions`
   - `Launch an Auction`
4. short trust strip:
   - `Private bids`
   - `On-chain settlement`
   - `Sepolia live`
5. compact feature cards
6. optional deeper explanation below the fold

What to avoid:

- long technical hero copy
- too many stats before context
- multiple competing CTAs

Rule:

- one main screen, one main decision

---

## Marketplace

Purpose:

- help people discover auctions quickly
- reduce decision fatigue

Recommended structure:

1. compact page header
2. one simple filter row
3. clean auction grid
4. card-level clarity:
   - title
   - end time
   - status
   - starting price
   - privacy mode
   - one clear CTA

Recommended default filters only:

- `All`
- `Live`
- `Ending Soon`
- `My Activity`

Optional advanced filters go behind:

- `More filters`

What to avoid:

- hero block on internal listing page
- too many sort/filter controls visible at once
- decorative density that competes with auction data

Rule:

- the listing page should feel more like a clean market board than a product
  brochure

---

## Portfolio

Purpose:

- help users understand what they own, what they bid on, and what they can
  claim next

Recommended structure:

1. short header
2. compact summary strip:
   - active auctions
   - bids placed
   - pending claims
3. simplified tabs:
   - `My Auctions`
   - `My Bids`
   - `Claims`
   - `Activity`
4. each tab shows one dominant action where relevant

Recommended behavior:

- show what is actionable first
- surface claims prominently
- avoid finance-dashboard overload

What to avoid:

- large "portfolio value" framing if the real product is actions, not asset
  valuation
- too many summary cards before useful information
- protocol health widgets for casual users

Rule:

- portfolio should answer: `What can I do right now?`

---

## Governance

Purpose:

- transparency
- protocol status
- recovery and administrative explanation

Recommended structure:

1. plain-language introduction
2. protocol decisions / governance notes
3. recovery or admin explanation
4. advanced protocol details in collapsible sections

Recommended tone:

- calm
- transparent
- non-intimidating

What to avoid:

- putting governance UX on the same visual urgency level as marketplace actions
- exposing advanced control concepts too early to new users

Rule:

- governance should feel like a transparency center, not a first-use workflow

---

## About

Purpose:

- explain the story, thesis, and technical ambition of the product

Recommended structure:

1. mission
2. why sealed-bid privacy matters
3. architecture in approachable language
4. links to docs and GitHub

What to avoid:

- repeating too much of the Overview page
- long dense text before scannable summaries

Rule:

- About should build confidence, not increase cognitive load

---

## 5. Cross-Page UX Rules

Apply these rules everywhere:

### One primary CTA per screen

Every screen should have one obvious main action.

Examples:

- Overview: `Explore Auctions`
- Marketplace: `View Auction`
- Auction Detail: `Place Bid`
- Portfolio: `Claim`
- Create Auction: `Create Auction`

### Progressive disclosure

Show the simple path first.
Reveal advanced protocol details only when needed.

Use:

- accordions
- expandable "Learn more"
- advanced mode sections

### Plain-language labels

Prefer:

- `Private Bid`
- `Claim Funds`
- `Auction History`

Over raw protocol language when possible:

- `Shielded`
- `Recovery`
- `Governance primitives`

Technical wording can still appear in helper text or docs.

### Fewer layers on internal pages

Internal pages should not stack all of these together unless truly necessary:

- hero panel
- sidebar
- breadcrumbs
- sticky header
- sticky filter bar
- secondary summary cards

Use only the minimum layout chrome required for clarity.

### Trust through clarity, not density

Users trust a financial product when:

- they understand what is happening
- they know what action is expected
- status changes are visible
- errors and pending states are explained simply

Not when:

- the screen is dense
- every block looks important
- the interface feels more luxurious than understandable

---

## 6. Recommended Visual Direction

Keep the premium feeling, but simplify the execution.

Recommended direction:

- dark charcoal, not pure black
- refined serif only for hero or section headlines
- clean sans-serif for all operational UI
- restrained glow
- stronger spacing discipline
- fewer ornamental containers on task screens

Translation:

- `Overview` can be dramatic
- `Marketplace`, `Portfolio`, and action flows should be calmer

---

## 7. Immediate UI Decisions

If we start redesigning now, make these decisions first:

1. Keep all five sections
2. Make `Overview`, `Marketplace`, and `Portfolio` visually primary
3. Demote `Governance` and `About` visually without removing them
4. Remove large internal-page hero sections where they are not helping action
5. Simplify marketplace filters
6. Make portfolio action-first, not dashboard-first
7. Use progressive disclosure for privacy and protocol depth

---

## 8. Final Verdict

The existing layout study is strong as a premium visual system, but it is too
heavy for mainstream-first usability.

The right move is not to discard it.

The right move is to:

- keep its brand quality
- keep all current sections
- simplify hierarchy
- reduce simultaneous complexity
- let normal users succeed before asking them to understand the protocol
