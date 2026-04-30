# Vault UI Direction

## Fhenix-FairMarket
## Canonical User Interface Direction

This document is the primary UI reference for the next redesign phase.

It replaces the earlier direction as the main visual and UX baseline because it
better serves normal users while still preserving the product's premium
identity.

---

## 1. Design Philosophy

### The Digital Vault

The platform should no longer feel like a dense technical protocol interface.
It should feel like a calm, secure, high-trust financial vault.

The intended emotional response is:

- protected
- focused
- capable
- confident

The intended product message is:

- your bids are private
- your assets are handled seriously
- the next step is always clear

### Refined Minimalism

The visual language should follow `refined minimalism`:

- strict structure
- restrained motion
- low visual noise
- elegant typography
- quiet authority

This means:

- fewer decorative distractions
- fewer competing interface layers
- stronger typographic hierarchy
- more trust through precision

---

## 2. Product Goals

This UI direction exists to achieve four things:

1. reduce cognitive load for normal users
2. preserve the premium character of the brand
3. keep privacy and trust at the center of the experience
4. simplify action flows without removing important product sections

The redesign must still preserve the existing information architecture:

- `Overview`
- `Marketplace`
- `Portfolio`
- `Governance`
- `About`

---

## 3. Visual System

## 3.1 Color Palette

Use a monochrome-first palette with very restrained accents.

Recommended palette:

- background base: `#050505`
- page background alternative: `#070707`
- card surface low: `#101010`
- card surface high: `#151515`
- primary text: `#FFFFFF`
- secondary text: `#A1A1AA`
- muted dividers and borders: `#27272A`

Why not pure `#000000` everywhere:

- fully pure black can feel harsher than premium
- slightly lifted blacks preserve depth better
- surfaces become easier to distinguish without using noisy color

### Reserved Accent Policy

The interface should remain overwhelmingly monochrome, but one restrained
semantic accent layer is allowed for states:

- success
- warning
- error

These accents should be sparse and functional, not decorative.

---

## 3.2 Typography

Use three clear type families:

### Display

Use a high-contrast serif such as:

- `Playfair Display`
- `Cormorant Garamond`

Use only for:

- hero headlines
- page introductions
- premium section titles

### Body

Use a geometric sans-serif such as:

- `Outfit`
- `Plus Jakarta Sans`

Use for:

- body content
- navigation
- labels
- buttons
- operational UI

### Data

Use a monospace family such as:

- `JetBrains Mono`
- `IBM Plex Mono`

Use for:

- wallet addresses
- bid values
- transaction hashes
- protocol identifiers

### Type Scale

Suggested levels:

- `L1` 72px: hero headline
- `L2` 48px: section title
- `L3` 32px: card or sub-page title
- `L4` 24px: high-priority data heading
- `L5` 18px: intro paragraph
- `L6` 16px: standard body text
- `L7` 14px: buttons and nav
- `L8` 13px: secondary descriptions
- `L9` 12px: metadata
- `L10` 11px uppercase bold: micro labels and badges

---

## 4. Navigation Model

Keep all current sections, but do not make them all equally dominant.

### Desktop Navigation

```text
[Logo]  Overview  Marketplace  Portfolio            Governance  About   [Wallet]
```

### Priority Model

Primary:

- `Overview`
- `Marketplace`
- `Portfolio`

Secondary:

- `Governance`
- `About`

Reason:

- most users first need to understand the product
- then browse auctions
- then manage bids and claims

`Governance` and `About` remain visible, but they should not compete with the
primary journeys.

### Mobile Navigation

```text
[Overview] [Market] [Portfolio] [More]
```

Inside `More`:

- `Governance`
- `About`

This preserves all sections while keeping mobile friction low.

---

## 5. Experience Principles

## 5.1 One Main Action Per Screen

Every page must communicate one dominant next step.

Examples:

- `Overview`: `Explore Auctions`
- `Marketplace`: `Enter Auction`
- `Auction Detail`: `Place Bid`
- `Portfolio`: `Claim Funds`
- `Create Auction`: `Create Auction`

## 5.2 Progressive Disclosure

Advanced protocol concepts must not dominate first contact.

Show simple user-facing information first.

Reveal technical depth through:

- accordions
- "Learn more" blocks
- a `Technical View` toggle

This is especially important for:

- FHE references
- AVS details
- contract-level identifiers
- settlement mechanics

## 5.3 Plain-Language First

Prefer user-facing wording such as:

- `Private Bid`
- `Claim Funds`
- `Auction History`
- `Technical View`

Instead of forcing users to decode protocol-first wording everywhere.

Technical vocabulary can still live in:

- docs
- helper text
- expanded details

## 5.4 Fewer Layers, More Clarity

Avoid stacking too many layout systems together on task pages.

Use the fewest possible:

- no unnecessary hero on internal pages
- no sidebar unless it clearly improves action
- no heavy breadcrumbing if page context is already obvious
- no dense dashboard panels before the user understands what matters

---

## 6. Section-by-Section Direction

## Overview

Purpose:

- explain the product clearly
- create immediate trust
- move the user to action fast

Recommended structure:

1. one premium hero
2. concise statement of value
3. two CTAs:
   - `Explore Auctions`
   - `Launch an Auction`
4. short trust strip:
   - `Private bids`
   - `On-chain settlement`
   - `Sepolia live`
5. compact feature cards
6. optional deeper explanation below the fold

Do not:

- overload the first screen with stats
- place technical diagrams before the core value is understood

## Marketplace

Purpose:

- make auction discovery feel effortless

Recommended structure:

1. compact header
2. one visible filter row
3. spacious auction card grid
4. simple, high-clarity card anatomy

Default filters:

- `All`
- `Live`
- `Ending Soon`
- `My Activity`

Advanced filters:

- behind `More filters`

Card information priority:

1. auction title
2. time remaining
3. status
4. starting price
5. privacy mode
6. one clear CTA

Do not:

- show FHE or AVS vocabulary in the core listing surface
- crowd the page with too many controls

## Portfolio

Purpose:

- answer: `What can I do right now?`

Recommended structure:

1. concise header
2. summary strip
3. focused tabs:
   - `My Auctions`
   - `My Bids`
   - `Claims`
   - `Activity`
4. make the most actionable area visually strongest

Important:

- claims should be highly visible
- active commitments should be understandable at a glance
- avoid turning this into a generic trading dashboard

Do not prioritize:

- abstract total valuation over actionable state

## Governance

Purpose:

- show transparency
- show protocol health
- present recovery and administrative pathways calmly

Recommended structure:

1. plain-language intro
2. active proposal list or timeline
3. simple voting actions
4. protocol health stats
5. advanced details in collapsed form

Recommended presentation:

- calm
- factual
- non-intimidating

## About

Purpose:

- establish legitimacy
- explain the mission and architecture accessibly

Recommended structure:

1. mission statement
2. why privacy matters in auctions
3. approachable architecture summary
4. links to docs and GitHub
5. FAQ in accordion form

---

## 7. Interaction Patterns

## 7.1 Wizard-Based Flows

Critical flows should become guided:

- create auction
- place bid
- claim funds

Why:

- normal users perform better in linear flows
- fewer visible inputs at once reduces hesitation
- trust increases when each step is clearly explained

## 7.2 Unified Action Guidance

Use a contextual action prompt that suggests the next logical step.

Examples:

- `Place your first bid`
- `Review claimable funds`
- `Launch your first auction`

On desktop:

- this should be subtle, not intrusive

On mobile:

- a floating action pattern is acceptable if carefully restrained

## 7.3 State Feedback Without Color Noise

Because the product is largely monochrome, active and hover states should rely
on:

- border emphasis
- underline motion
- typography weight changes
- controlled glow
- spacing and contrast shifts

Not on loud color changes.

---

## 8. Motion Direction

Motion should feel:

- precise
- quiet
- expensive

Use:

- slow opacity reveals
- restrained underline slides
- subtle hover elevation
- calm card emphasis

Do not use:

- flashy neon movement
- overly playful micro-interactions
- aggressive scale bouncing

---

## 9. What This Direction Replaces

This direction replaces the earlier premium layout approach when the earlier
approach:

- made internal pages too dense
- elevated protocol complexity too early
- overloaded normal users with too many simultaneous signals

This new direction keeps the ambition, but improves usability.

---

## 10. Implementation Rules

Before redesign begins, commit to these rules:

1. keep all five existing sections
2. visually prioritize `Overview`, `Marketplace`, and `Portfolio`
3. demote `Governance` and `About` without hiding them
4. remove oversized internal-page hero blocks unless they support action
5. simplify marketplace filters
6. make portfolio action-first
7. keep advanced protocol data behind progressive disclosure
8. preserve a premium monochrome identity

---

## 11. Final Verdict

The correct next design step is not to make the product more decorative.

The correct next design step is to make it:

- calmer
- clearer
- more direct
- more trustworthy
- easier for normal users to act inside

This vault direction should be treated as the primary design reference before
any implementation begins.
