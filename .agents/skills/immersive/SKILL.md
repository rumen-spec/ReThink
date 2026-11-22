---
name: "immersive"
description: "An immersive, interactive, exhibit-style interface that blends storytelling, animation, and gamified elements to create a playful, experience-driven journey. The entire app sits on a single continuous brand-colored canvas (deep green)"
metadata:
  author: typeui.sh
---

> **SUPERSEDED 2026-11-22** by `.agents/skills/sleek` (the exhibit look read as cluttered and alarming on a phone). Kept for history; do not apply.

<!-- TYPEUI_SH_MANAGED_START -->
# Immersive Design System Skill (Cursor)

## Mission
You are an expert design-system guideline author for Immersive.
Create practical, implementation-ready guidance that can be directly used by engineers and designers.

## Brand
An immersive, interactive, exhibit-style interface that blends storytelling, animation, and gamified elements to create a playful, experience-driven journey. The entire app sits on a single continuous brand-colored canvas (deep green) — there is no alternation between section backgrounds. Crisp white cards with thick black borders, hard offset block shadows, and oversized condensed display typography (Oswald) punch off that canvas. Buttons are skewed white blocks with hard black shadows that grow on hover, like posters or arcade signs reacting to the player. Decorative geometric blocks in brand-tertiary (cobalt blue) and brand-quaternary (hot pink) layer behind cards to add depth without breaking the brand-color continuity. The result feels less like browsing a website and more like exploring a digital exhibit.

## Style Foundations
- Visual style: modern, clean, high-contrast
- Typography scale: 12/14/16/20/24/32 | Fonts: primary=Oswald, sans-serif, display=Oswald, sans-serif, mono=JetBrains Mono | weights=100, 200, 300, 400, 500, 600, 700, 800, 900
- Color palette: primary, neutral, success, warning, danger | Tokens: primary=#00592B, secondary=#0023D1, success=#16A34A, warning=#D97706, danger=#DC2626, surface=#FFFFFF, text=#111827
- Spacing scale: 4/8/12/16/24/32

## Accessibility
WCAG 2.2 AA, keyboard-first interactions, visible focus states

## Writing Tone
concise, confident, helpful

## Rules: Do
- prefer semantic tokens over raw values
- preserve visual hierarchy
- keep interaction states explicit

## Rules: Don't
- avoid low contrast text
- avoid inconsistent spacing rhythm
- avoid ambiguous labels

## Expected Behavior
- Follow the foundations first, then component consistency.
- When uncertain, prioritize accessibility and clarity over novelty.
- Provide concrete defaults and explain trade-offs when alternatives are possible.
- Keep guidance opinionated, concise, and implementation-focused.

## Guideline Authoring Workflow
1. Restate the design intent in one sentence before proposing rules.
2. Define tokens and foundational constraints before component-level guidance.
3. Specify component anatomy, states, variants, and interaction behavior.
4. Include accessibility acceptance criteria and content-writing expectations.
5. Add anti-patterns and migration notes for existing inconsistent UI.
6. End with a QA checklist that can be executed in code review.

## Required Output Structure
When generating design-system guidance, use this structure:
- Context and goals
- Design tokens and foundations
- Component-level rules (anatomy, variants, states, responsive behavior)
- Accessibility requirements and testable acceptance criteria
- Content and tone standards with examples
- Anti-patterns and prohibited implementations
- QA checklist

## Component Rule Expectations
- Define required states: default, hover, focus-visible, active, disabled, loading, error (as relevant).
- Describe interaction behavior for keyboard, pointer, and touch.
- State spacing, typography, and color-token usage explicitly.
- Include responsive behavior and edge cases (long labels, empty states, overflow).

## Quality Gates
- No rule should depend on ambiguous adjectives alone; anchor each rule to a token, threshold, or example.
- Every accessibility statement must be testable in implementation.
- Prefer system consistency over one-off local optimizations.
- Flag conflicts between aesthetics and accessibility, then prioritize accessibility.

## Example Constraint Language
- Use "must" for non-negotiable rules and "should" for recommendations.
- Pair every do-rule with at least one concrete don't-example.
- If introducing a new pattern, include migration guidance for existing components.

<!-- TYPEUI_SH_MANAGED_END -->

# ReThink twist — overrides the managed block wherever they conflict

Keep the Immersive *style* (one continuous canvas, hard offset block shadows, thick borders, skewed poster buttons, oversized condensed display type, decorative geometric blocks). Replace its *colours* with ReThink's design tokens (`DESIGN.md` in this folder; mirrored in `docs/PLAN.md` Block 4). ReThink is **dark-first**: the canvas is deep charcoal-teal, never pure black and never the managed block's deep green.

## Intent in one sentence
A calm, nonjudgmental budget companion that feels like a small arcade exhibit: hard edges and bold type, but the only things that ever "shout" are the numbers.

## Token translation (Immersive → ReThink)

| Immersive role | Managed value | ReThink value | Note |
|---|---|---|---|
| Continuous canvas | deep green `#00592B` | **`#0F1715`** canvas | One canvas, no section alternation, same as before |
| Card surface | white `#FFFFFF` | **`#182320`** card | 1px hairline `#243330` *plus* the thick 2px border below |
| Thick card border | black | **`#E8EFEC`** ink | Light border on a dark card gives the same "punch" as black on white |
| Hard offset block shadow | black | **`#2FB8A2`** teal (default) · **`#F07A74`** coral when the card's state is *over budget* | Black is invisible on a dark canvas; the shadow colour now carries status (never alone: the card also says "over" in text + icon) |
| Primary text | `#111827` | **`#E8EFEC`** ink | |
| Secondary text | — | **`#8FA09B`** muted ink | |
| Brand-tertiary / quaternary decorative blocks | cobalt `#0023D1` / hot pink | **the category colour** of what the card is about (`DESIGN.md` → Categories); on non-category cards use teal tint `#163B35` | Blocks stay *behind* cards, never behind text |
| Success / warning / danger | green / amber / red | **good = `#2FB8A2`**, **over = `#F07A74`**; there is no third state | Amber and green are category colours (Entertainment, Home) and must never read as status |
| Skewed button, default | white block, black shadow | **ink `#E8EFEC` block, canvas text `#0F1715`, teal shadow** | |
| Skewed button, primary | — | **teal `#2FB8A2` block, canvas text, ink shadow** | One per screen |
| Button, destructive / "I bought this" | — | coral block, canvas text, ink shadow | Reserved for the two irreversible-feeling actions: record purchase, reset demo |
| Rounded | 4 / 8 | **4 / 8** (hard, arcade) | Overrides SPEC §4.2's 14/18; sheets may use 12 |
| Display font | Oswald | **Oswald** (bundled in both apps, never fetched from Google Fonts at runtime) | Retailer CSPs can block remote fonts inside the extension overlay |
| Mono | JetBrains Mono | **JetBrains Mono for every money value**, tabular figures | `formatCad` output always renders in mono |

## Component rules that change under the twist
- **Hero number** ("Available this month"): Oswald 700, 32pt+, ink; the label above it in mono caps muted ink. Never coloured by status: status lives in the capsule below it.
- **Budget capsule**: card + category-colour geometric block offset −8px/−8px behind; name in Oswald; `remaining` in mono; a 4px progress bar in the category colour on a `#243330` track; the status word ("$42 left" / "$83 over") in ink with a teal/coral dot icon.
- **Financial insight card** (extension overlay): same card recipe inside a shadow root with `all: initial` reset; shadow colour teal when within budget, coral when over; maximum 360px wide; must never cover size selectors or Add to Bag.
- **Future Me graph**: planned path teal 2px, scenario path coral 2px, legend always present, assumption line in muted ink; category colours do not appear here.
- **Hotspot pulse**: coral ring on a fixed pin; one 600ms ease-out expansion on entry; under `prefers-reduced-motion` a static ring. A simulated entry shows a mono "SIMULATED" tag in coral tint `#3A1F1E` with coral text.
- **Source chips** ("Detected cart", "Manually added", "Estimated price", "Simulated"): mono 12px caps, ink on `#243330`; the simulated chip is the only coloured one.
- **Hover / press**: the hard shadow grows from 4px to 6px offset and the block translates −2px/−2px; 120ms; no growth under reduced motion (state change only).
- **Focus-visible**: 2px teal outline offset 2px on every interactive element, both apps.

## Tone guard (the gamified part must stay kind)
Playful in *form*, calm in *copy*. Never "bad purchase", "you failed", red everywhere. Coral appears only for an actual overage or the gap between two explicit scenarios. Copy examples live in `docs/SPEC.md` §4.4.

## QA checklist additions
- [ ] Canvas is `#0F1715` on every screen; no screen uses pure `#000` or the managed green.
- [ ] No status colour other than teal/coral anywhere; no category colour used to mean good/bad.
- [ ] Every money value is mono with tabular figures and comes from `formatCad`.
- [ ] Fonts are bundled assets (`expo-font` / extension `web_accessible_resources`), not remote.
- [ ] Hard shadows are teal or coral, never black; the state they imply is also written in text.
- [ ] Reduced-motion: no shadow growth, no pulse animation, instant state changes.
- [ ] Contrast ≥ 4.5:1 for text on canvas and cards (ink 14:1, muted ink 5.6:1, teal 7.3:1, coral 6.1:1 on canvas).
