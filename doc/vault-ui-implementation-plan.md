# Vault UI Implementation Plan

## Purpose

This document converts the high-level `vault-ui-direction.md` guidance into a
practical implementation plan tied to the current frontend codebase.

It answers three questions:

1. what is already structurally sound
2. what currently conflicts with the vault direction
3. in what order the redesign should be implemented

---

## 1. Current State Summary

The frontend already has a strong routing foundation.

Existing top-level routes:

- `Overview`
- `Marketplace`
- `Portfolio`
- `Governance`
- `About`

Current route files:

- `packages/frontend/src/app/page.tsx`
- `packages/frontend/src/app/marketplace/page.tsx`
- `packages/frontend/src/app/marketplace/[auctionId]/page.tsx`
- `packages/frontend/src/app/marketplace/create/page.tsx`
- `packages/frontend/src/app/portfolio/page.tsx`
- `packages/frontend/src/app/governance/page.tsx`
- `packages/frontend/src/app/about/page.tsx`

Current shell and navigation:

- `packages/frontend/src/components/app-shell.tsx`
- `packages/frontend/src/lib/app-config.ts`

Conclusion:

- the information architecture does not need to be rebuilt
- the main work is visual simplification, hierarchy cleanup, and action-first
  page restructuring

---

## 2. What Is Already Good

These parts are already aligned enough to preserve:

### Stable route structure

The current app router layout already maps cleanly to the desired product
sections.

### Top navigation model

The current shell already uses a single global top bar instead of a heavy
sidebar model.

### Overview page direction

The `Overview` page already behaves like a lightweight orientation layer more
than a dense dashboard.

### About page simplicity

The `About` page is already relatively calm and compact compared with the rest
of the app.

### Wallet integration placement

The wallet connection entry point is already in the correct place from a
product perspective: globally accessible rather than buried.

---

## 3. Main Gaps Against the Vault Direction

### Gap 1: visual system is still too luminous and protocol-styled

Primary file:

- `packages/frontend/src/app/globals.css`

Current issues:

- violet and blue accents dominate too many surfaces
- repeated glow and beam effects add noise
- decorative gradients compete with content
- internal task screens look more cinematic than trustworthy

Target:

- monochrome-first vault palette
- fewer layered backgrounds
- restrained borders
- quieter surfaces
- only sparse semantic accents for success, warning, and error

### Gap 2: Marketplace is still too layered

Primary files:

- `packages/frontend/src/app/marketplace/page.tsx`
- `packages/frontend/src/components/auction-card.tsx`

Current issues:

- large internal hero block
- visible stats before the user reaches the grid
- two visible filter systems at once
- card visuals still feel like premium promos instead of clear market entries

Target:

- compact header
- one simple visible filter row
- cleaner auction cards
- one main decision per card

### Gap 3: Portfolio is still desk-heavy

Primary file:

- `packages/frontend/src/app/portfolio/page.tsx`

Current issues:

- hero, stats, claims, activity, created auctions, and participations all
  compete at once
- the page is still framed as an operations surface
- actionable claims are not visually dominant enough

Target:

- claim-first structure
- simple summary strip
- lighter personal activity presentation
- clearer separation between claims and passive records

### Gap 4: Governance is serving recovery UX, not governance UX

Primary files:

- `packages/frontend/src/app/governance/page.tsx`
- `packages/frontend/src/components/reliability-console.tsx`

Current issues:

- governance route currently behaves like a reliability or support route
- recovery and governance are blended together
- protocol transparency is present, but not framed as governance

Target:

- make `Governance` a transparency center
- keep protocol health and recovery guidance, but reorganize them under a
  calmer governance structure
- avoid first-use operational overload

### Gap 5: Auction detail and create flow still need action simplification

Primary files:

- `packages/frontend/src/app/marketplace/[auctionId]/page.tsx`
- `packages/frontend/src/app/marketplace/create/page.tsx`
- `packages/frontend/src/components/create-auction-form.tsx`

Current issues:

- detail page still opens with a dramatic visual hero
- technical and operational sections are all visible together
- create flow is still a classic form, not a guided flow

Target:

- reduce theatrical presentation
- make the next action obvious
- move advanced details behind progressive disclosure
- gradually evolve create flow toward a wizard

---

## 4. Implementation Order

The redesign should be done in this order.

### Phase 1: global visual reset

Files:

- `packages/frontend/src/app/globals.css`
- `packages/frontend/src/app/layout.tsx`
- `packages/frontend/src/components/app-shell.tsx`

Goals:

- replace the current glow-heavy styling with the vault palette
- reduce ornamental surfaces
- rebalance typography for serif display plus clean operational sans-serif
- visually demote `Governance` and `About` without removing them
- prepare a better mobile nav treatment later if needed

Expected outcome:

- the entire app feels calmer before any page-level redesign begins

### Phase 2: Marketplace first-pass simplification

Files:

- `packages/frontend/src/app/marketplace/page.tsx`
- `packages/frontend/src/components/auction-card.tsx`

Goals:

- remove the large internal hero treatment
- reduce visible control density
- simplify filters to the most human default choices
- make each card easier to scan in three seconds

Expected outcome:

- the most important acquisition flow becomes easier immediately

### Phase 3: Portfolio action-first redesign

Files:

- `packages/frontend/src/app/portfolio/page.tsx`

Goals:

- make claimable actions the dominant surface
- compress secondary analytics
- reduce dashboard framing
- preserve created auctions and participations without giving them equal visual
  urgency

Expected outcome:

- normal users can tell what they should do next without reading the whole page

### Phase 4: Auction detail flow cleanup

Files:

- `packages/frontend/src/app/marketplace/[auctionId]/page.tsx`
- `packages/frontend/src/components/auction-action-console.tsx`
- `packages/frontend/src/components/auction-settlement-controls.tsx`
- `packages/frontend/src/components/seller-auction-controls.tsx`

Goals:

- simplify entry state
- keep the next action obvious
- collapse technical notes and protocol signals behind optional sections
- reduce the dramatic feel of the hero area

Expected outcome:

- entering a single auction feels clearer and more trustworthy

### Phase 5: Create flow guidance upgrade

Files:

- `packages/frontend/src/app/marketplace/create/page.tsx`
- `packages/frontend/src/components/create-auction-form.tsx`

Goals:

- simplify the create page framing
- evolve the form toward a guided sequence
- keep validation and chain constraints readable
- preserve advanced correctness without exposing too much at once

Expected outcome:

- auction creation becomes more approachable for non-expert users

### Phase 6: Governance and About alignment

Files:

- `packages/frontend/src/app/governance/page.tsx`
- `packages/frontend/src/components/reliability-console.tsx`
- `packages/frontend/src/app/about/page.tsx`

Goals:

- split governance meaningfully from pure support/recovery guidance
- keep governance calm, transparent, and secondary
- strengthen About as a trust-building page with docs and GitHub direction

Expected outcome:

- all five sections remain intact, but their intent becomes much clearer

---

## 5. Page-by-Page Target State

## Overview

Keep:

- strong introduction
- two main navigation actions
- route-based orientation

Change:

- simplify hero copy
- remove abstract protocol-heavy wording
- add a small trust strip
- reduce decorative pressure

## Marketplace

Keep:

- route existence
- grid layout as the core browsing model

Change:

- remove internal-page hero weight
- reduce stats prominence
- simplify filters
- simplify cards

## Portfolio

Keep:

- claims
- created auctions
- participations
- activity

Change:

- reorder sections around claim urgency
- simplify summary language
- reduce desk-style framing

## Governance

Keep:

- transparency role
- protocol health relevance
- recovery guidance

Change:

- stop presenting governance as a recovery dashboard first
- restructure it as protocol transparency with progressive detail

## About

Keep:

- calm tone
- concise structure

Change:

- make story, mission, and trust links more explicit
- connect the page more clearly to docs and repository context

---

## 6. Immediate Build Priorities

If implementation starts now, do this first:

1. revise `globals.css`
2. simplify `Marketplace`
3. simplify `AuctionCard`
4. refactor `Portfolio`
5. clean `Auction Detail`
6. improve `Create Auction`
7. reframe `Governance`
8. finish `About`

This order is intentional:

- it starts with the largest visual impact
- then fixes the most user-critical routes
- then handles secondary trust and transparency routes

---

## 7. What This Plan Avoids

This redesign should not:

- remove any of the five current top-level sections
- turn the app into a generic fintech dashboard
- overuse decorative neon or cinematic gradients
- expose protocol terms too early on primary task screens
- replace clarity with luxury styling

---

## 8. Final Rule

At every redesign step, ask one question:

`Does this screen make the next action clearer for a normal user?`

If the answer is no, the screen is still carrying too much protocol weight or
too much visual noise.
