---
name: Immersive — ReThink
colors:
  primary: "#2FB8A2"
  secondary: "#E8EFEC"
  success: "#2FB8A2"
  warning: "#F07A74"
  danger: "#F07A74"
  surface: "#182320"
  text: "#E8EFEC"
  neutral: "#0F1715"
typography:
  h1:
    fontFamily: "Oswald"
    fontSize: 2rem
  body-md:
    fontFamily: "Oswald"
    fontSize: 1rem
  label-caps:
    fontFamily: "JetBrains Mono"
    fontSize: 0.75rem
  money:
    fontFamily: "JetBrains Mono"
    fontSize: 1rem
    fontFeatureSettings: "tnum"
  sourceScale: "12/14/16/20/24/32"
  weights: "400, 500, 700"
rounded:
  sm: 4px
  md: 8px
  sheet: 12px
spacing:
  sm: 4px
  md: 8px
  sourceScale: "4/8/12/16/24/32"
---

## Overview

Exhibit-style interface on a single continuous **dark charcoal-teal** canvas. Hard offset block shadows, thick ink borders, skewed poster buttons and condensed display type — ReThink's "arcade exhibit" feel — with ReThink's own colours. Dark-first; light is a fallback only and is not yet designed.

These values are the source of truth for both apps (`apps/mobile/src/constants/theme.ts`, extension overlay CSS) and are mirrored in `docs/PLAN.md` Block 4. Status rules and the validated category palette come from `docs/PLAN.md`.

## Style Foundations

- **Visual style:** dark, high-contrast, hard-edged, playful in form, calm in copy
- **Typography scale:** 12/14/16/20/24/32
- **Typography fonts:** display + body = Oswald (bundled), mono = JetBrains Mono (bundled); every money value is mono with tabular figures
- **Typography weights:** 400, 500, 700 (nothing lighter on a dark canvas)
- **Color palette:** canvas, card, ink, muted ink, teal (good/primary), coral (over), tints, six category colours
- **Spacing scale:** 4/8/12/16/24/32

## Colors

| Token | Hex | Role |
|---|---|---|
| canvas (`neutral`) | `#0F1715` | the one continuous background; never pure black |
| card (`surface`) | `#182320` | content surfaces; 1px hairline `#243330` + 2px ink border for the exhibit look |
| ink (`text`, `secondary`) | `#E8EFEC` | titles, body, thick borders, default button block |
| muted ink | `#8FA09B` | secondary labels; also the **Other** category |
| teal (`primary`, `success`) | `#2FB8A2` | primary action, planned savings path, within-budget, default hard shadow |
| teal tint | `#163B35` | within-budget fills, decorative blocks on non-category cards |
| coral (`warning`, `danger`) | `#F07A74` | over budget, scenario path, hard shadow on an over-budget card, "I bought this" |
| coral tint | `#3A1F1E` | non-blocking warning fills, the SIMULATED tag |

Status has exactly two values, **good = teal** and **over = coral**, always paired with text and an icon. Amber and green exist only as category colours below and must never read as status.

## Categories

Validated 2026-11-21 (dataviz palette checker: dark lightness band, chroma, CVD and normal-vision separation in this display order, ≥3:1 on card and canvas). Used for the geometric block behind a category card, its progress bar, and chart marks. Identity is never colour alone.

| Category | Dark | Light (reference, re-validate when light mode exists) |
|---|---|---|
| Clothing | `#9085E9` violet | `#6250D6` |
| Beauty | `#D55181` magenta | `#E87BA4` |
| Home | `#0CA30C` green | `#008300` |
| Electronics | `#3987E5` blue | `#2A78D6` |
| Entertainment | `#C98500` yellow | `#EDA100` |
| Other | `#8FA09B` muted ink | `#66787D` |

Pie/donut: at most three coloured slices + Other, or direct-label every slice (blue and violet do not separate for protan readers side by side).

## Shadows and blocks

- Hard offset shadow: `6px 6px 0` teal by default; coral when the card's state is over budget. Grows to `8px 8px 0` with a −2px/−2px translate on hover/press (120ms; none under reduced motion).
- Decorative geometric block: the card's category colour (or teal tint), offset −8px/−8px behind the card, never behind text.
- No soft blur shadows, no gradients.
