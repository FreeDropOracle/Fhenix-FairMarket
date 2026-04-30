# Vault UI Design Lock

## Purpose

This document freezes the approved visual direction before frontend
implementation begins.

It exists to prevent drift between:

- generated mockups
- UX structure documents
- actual code implementation

The implementation must follow this file together with:

- `vault-ui-direction.md`
- `vault-ui-implementation-plan.md`

---

## 1. Approved Visual Direction

The product is now locked to the following visual identity:

- `digital vault`
- `refined minimalism`
- `monochrome-first premium web app`
- `calm, secure, high-trust financial product`
- `beginner-friendly action-first UX`

This means:

- no neon-heavy crypto styling
- no purple-glow dominance
- no cinematic sci-fi overload
- no dashboard density for primary task screens

The app should feel:

- composed
- expensive
- readable
- serious
- easy to trust

---

## 2. Locked Navigation Model

Top-level sections remain:

- `Overview`
- `Marketplace`
- `Portfolio`
- `Governance`
- `About`

Do not replace these official names with alternate generated labels like:

- `Explore`
- `My Auctions`
- `Dashboard`
- `Resources`
- `Analytics`
- `Digital Vault`
- `Support`

The wallet control remains globally visible in the top bar.

---

## 3. Approved Mockup Mapping

The following generated images are the locked visual references for each page
direction.

### Overview

Reference image:

- `Gemini_Generated_Image_fvgqc6fvgqc6fvgq.png`

Why approved:

- strongest hero composition
- clear trust strip
- excellent first impression
- correct premium vault tone

Notes:

- final implementation should shorten the hero copy slightly
- keep the two main CTAs

### Marketplace

Reference image:

- `Gemini_Generated_Image_sywkrqsywkrqsywk.png`

Why approved:

- clean grid-first browsing model
- simplified filter row
- strong readability
- cards feel approachable

Notes:

- final implementation should simplify each card slightly
- one main CTA per card remains preferred

### Portfolio

Reference image:

- `Gemini_Generated_Image_i4166ai4166ai416.png`

Why approved:

- claim-first hierarchy is correct
- summary strip is simple
- primary action is immediately visible

Notes:

- this is the strongest page direction overall
- use it as the main reference for action prioritization

### Governance

Reference image:

- `Gemini_Generated_Image_svdew8svdew8svde.png`

Why approved:

- governance is framed as transparency, not as a technical control room
- protocol health appears secondary but still visible
- progressive disclosure direction is correct

Notes:

- final implementation should use clearer real copy
- keep technical detail in collapsible areas

### About

Reference image:

- `Gemini_Generated_Image_m869rpm869rpm869.png`

Why approved:

- editorial layout is appropriate
- trust and documentation surfaces are visible
- mission-driven structure works well

Notes:

- final implementation should be a little calmer and less dense
- avoid long blocks of text without scannable structure

### Auction Detail

Reference image:

- `Gemini_Generated_Image_hzon4whzon4whzon.png`

Why approved:

- compact auction header works well
- main action is obvious
- technical details are secondary

Notes:

- keep `Place Private Bid` as the dominant action
- reduce open technical noise

### Create Auction

Reference image:

- `Gemini_Generated_Image_v2vvh2v2vvh2v2vv.png`

Why approved:

- step-by-step wizard direction is correct
- the side summary is useful
- the flow feels controlled and beginner-safe

Notes:

- the real implementation must match actual product fields
- use the wizard model, not a dense raw form

---

## 4. Locked Visual Rules

### Color

Preferred palette:

- background base around `#050505`
- page surface around `#070707`
- cards between `#101010` and `#151515`
- borders around `#27272A`
- primary text `#FFFFFF`
- secondary text around `#A1A1AA`

Accent policy:

- accents are sparse
- accents are semantic
- accents are not decorative

Allowed accent use:

- success
- warning
- error

### Typography

Use three roles:

- serif display for page and section headlines
- clean sans-serif for UI and body content
- monospace for values, addresses, and protocol identifiers

### Layout

Use:

- generous spacing
- strong grouping
- large readable cards
- one obvious next action per screen

Avoid:

- stacked hero plus stats plus filters plus secondary panels on the same screen
- excessive overlay effects
- ornamental panels fighting for attention

---

## 5. What Is Not Locked

These things may still evolve during implementation:

- exact copywriting
- icon set choice
- card density details
- final mobile navigation behavior
- exact table and accordion patterns

But they must evolve inside the approved vault direction, not outside it.

---

## 6. Final Decision

Implementation should now proceed using these visual references as the
practical baseline.

If a future design choice conflicts with these approved mockups, prefer:

1. user clarity
2. vault calmness
3. action-first hierarchy

over decorative complexity.
