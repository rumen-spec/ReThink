---
name: Sleek — ReThink
colors:
  primary: "#2FB8A2"
  secondary: "#8FA09B"
  success: "#2FB8A2"
  warning: "#F07A74"
  danger: "#F07A74"
  surface: "#0B100F"
  text: "#E8EFEC"
  neutral: "#172320"
typography:
  h1:
    fontFamily: "System"
    fontSize: 1.375rem
    fontWeight: 600
  hero:
    fontFamily: "System"
    fontSize: 3rem
    fontWeight: 600
    fontFeatureSettings: "tnum"
  body-md:
    fontFamily: "System"
    fontSize: 1.0625rem
  secondary:
    fontFamily: "System"
    fontSize: 0.9375rem
  caption:
    fontFamily: "System"
    fontSize: 0.8125rem
  weights: "400, 600"
rounded:
  surface: 16px
  control: 10px
  pill: 999px
spacing:
  gutter: 20px
  section: 24px
  inner: 12px
  sourceScale: "4/8/12/16/24/32"
---

## RETIRED 2026-11-22 — do not apply

Kept as a record of the teal-era design. Live tokens: `apps/mobile/src/constants/theme.ts` and `docs/PLAN.md` Block 4.

## Overview

Quiet by default, one loud number. Dark-first on a charcoal-teal canvas; no frames, no shadows; a single system typeface; colour from the budget categories and a teal accent; the over-budget colour on exactly one element per screen. Replaces the Immersive twist (2026-11-22) after it proved cluttered and alarming on a phone.

These values are the source of truth for `apps/mobile/src/constants/theme.ts` and the extension overlay CSS, mirrored in `docs/PLAN.md` Block 4.

## Colors

| Token | Hex | Role |
|---|---|---|
| canvas (`neutral`) | `#172320` | background; never pure black; the lightest ground on screen |
| surface | `#0B100F` | box fill, cut darker into the canvas: cart row, Future Me, row lists |
| hairline | `#243330` | dividers, bar tracks, chip outlines |
| ink (`text`) | `#E8EFEC` | titles, body, money |
| muted (`secondary`) | `#8FA09B` | secondary text, captions, Other, dashboard-only budgets |
| teal (`primary`, `success`) | `#2FB8A2` | one primary action, planned path, within-budget |
| teal tint | `#163B35` | selected chip |
| coral (`warning`, `danger`) | `#F07A74` | the one over-budget element, scenario path, "I bought this" |
| coral tint | `#3A1F1E` | SIMULATED tag |

Status has two values, teal and coral, always paired with words. Amber and green below are category colours and must never read as status.

## Categories

Validated 2026-11-21 (dataviz palette checker, dark band, CVD + normal-vision separation in this order, ≥ 3:1 on canvas and surface). Used as the dot before a budget name, the fill of its bar, and the cart avatar. Never alone: the name sits beside it.

| Category | Dark | Light (reference, re-validate if light mode is ever built) |
|---|---|---|
| Clothing | `#9085E9` violet | `#6250D6` |
| Beauty | `#D55181` magenta | `#E87BA4` |
| Home | `#0CA30C` green | `#008300` |
| Electronics | `#3987E5` blue | `#2A78D6` |
| Entertainment | `#C98500` yellow | `#EDA100` |
| Other | `#8FA09B` muted | `#66787D` |

Pie/donut: at most three coloured slices + Other, or direct-label every slice.

## Surfaces and effects

- Boxes (revised 2026-11-22): rounded 16, cut **darker** than the canvas. Vertical gradient `#090D0C` → `#0C1211` (dark at the top lip where the edge shades it, a step lighter at the floor) and a 1px ink-9% line along the **bottom** lip, which is how an inset reads. `deep` variant, one per screen, for the box that matters most: `#070A09` → `#0D1312`, bottom line ink 13%. No borders, no drop shadows, no colour wash. Hero unboxed.
- No glow behind the hero: the figure sits on the bare canvas.
- Future Me area fill: vertical gradient teal 28% → 2%.
- Motion: number count-up ≤ 250ms; nothing else; honours reduced motion.
