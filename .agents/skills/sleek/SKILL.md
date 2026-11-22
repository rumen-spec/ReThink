---
name: sleek
description: Modern minimalist aesthetic with clean lines, intentional color palette, subtle interactions, and consistent spacing.
license: MIT
metadata:
  author: typeui.sh
---

<!-- TYPEUI_SH_MANAGED_START -->
# Sleek Design System Skill (Universal)

## Mission
You are an expert design-system guideline author for Sleek.
Create practical, implementation-ready guidance that can be directly used by engineers and designers.

## Brand
Sleek UI/UX design emphasizes a modern, minimalist aesthetic ("less is more") focused on clean lines, high functionality, and reduced cognitive load. Key elements include a limited, intentional color palette (e.g., the 60-30-10 rule), subtle, non-distracting interactions, and consistent spacing.

## Style Foundations
- Visual style: modern, minimal, clean
- Typography scale: desktop-first expressive scale | Fonts: primary=Inter, display=Inter, mono=JetBrains Mono | weights=100, 200, 300, 400, 500, 600, 700, 800, 900
- Color palette: primary, neutral, success, warning, danger | Tokens: primary=#3B82F6, secondary=#8B5CF6, success=#16A34A, warning=#D97706, danger=#DC2626, surface=#FFFFFF, text=#111827
- Spacing scale: 8pt baseline grid


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

# RETIRED 2026-11-22 — do not apply

ReThink no longer uses a style skill. The design moved to a neutral dark palette with no accent hue, elevated boxes and flat controls; the live tokens are `apps/mobile/src/constants/theme.ts` and `docs/PLAN.md` Block 4. Everything below is kept only as a record of the teal-era design.

# ReThink twist — overrides the managed block wherever they conflict

Sleek's brief is right for ReThink: less is more, reduced cognitive load, a limited intentional palette, subtle interactions. Replace its light generic tokens with ReThink's dark-first tokens (`DESIGN.md` in this folder; mirrored in `docs/PLAN.md` Block 4). The product is a calm budget companion; the UI's job is to make **one number** obvious and everything else quiet.

## Intent in one sentence
Quiet by default, one loud number: the screen has a single focal figure, colour comes from the budget categories, and the over-budget colour appears on exactly one element.

## The rules that fix "cluttered but dead"
1. **Grouped boxes, not frames; shade with darkness, never with hue.** Sections sit on rounded surfaces (radius 16) *cut into* the canvas: a vertical gradient from `#090D0C` at the top lip to `#0C1211` at the floor, and a 1px ink-9% line along the **bottom** lip, which is how a real inset catches light. The `deep` variant (`#070A09` → `#0D1312`, bottom line ink 13%) cuts further for the one box that matters most on a screen (Future Me, the pairing code). No borders, no drop shadows, no colour wash, no decorative blocks. The hero is never boxed: it is the focal point, on the bare canvas with nothing glowing behind it. Inside a box, lists are rows separated by hairlines. (Revised 2026-11-22 twice: first after the unboxed version felt too empty, then after the teal-washed boxes read as tint instead of depth.)
2. **One typeface.** System SF (iOS) / system sans. Weights 400 and 600 only. Money uses tabular figures. No mono, no caps labels, no letter-spacing.
3. **Colour budget per screen: 60 / 30 / 10.** Canvas + ink 60, muted 30, accent 10. The accent is teal (one primary action, the planned path). **Coral may appear on exactly one element per screen**: the single line that is over budget (its text, and the overflow tick of its bar). Nothing else changes colour when the user is over.
4. **Pop comes from categories, not status.** Each budget row shows its category colour as a 8px dot before the name and as the fill of its 4px bar. The cart row's avatar circle is the dominant category colour. The Future Me planned path has a teal area gradient under it. That is all the colour a screen gets: the canvas and the boxes carry none.
5. **Future Me lives on Home, no sheet, no slider** (revised 2026-11-22). Fixed, labelled assumptions: 10% illustrative, 15 years. The box is static: the graph, the headline figure, and one line "Saving $300 a month" with a small pencil button that opens the Edit page (an iOS sheet with numeric inputs for the plan and the budgets; no money sliders, SPEC §5.3). The graph itself is the interaction, Wealthsimple-style: press and hold, then drag, to scrub it. A crosshair and dot follow the finger, the months after it dim, the headline swaps to that month's date and value, and a selection haptic ticks once per month crossed. The graph has real axes and gridlines, a teal area fill, and, when the cart overspends a budget, a coral dashed path with the gap shaded between the lines. The gap is made *noticeable honestly*: the default framing is "if it became a habit" (every month's contribution reduced, labelled on screen), with "Just this once" one tap away. The axis always starts at 0 (SPEC §9.2); never zoom to fake a gap.
6. **One sentence of explanation, not three.** Assumptions and disclaimers belong in the sheet; Home gets one short line.
7. **Motion only on numbers.** A changed figure counts to its new value (≤ 250ms). No scale, no shadow growth. Reduced motion → instant.
8. **Copy stays calm** (SPEC §4.4): "Your cart would put Clothing $83 over", never "bad purchase", never red everywhere.

## Tokens (dark, the only mode designed)
| Token | Hex | Role |
|---|---|---|
| canvas | `#172320` | background everywhere; never pure black; lighter than the boxes |
| surface | `#0B100F` | box fill, cut darker into the canvas |
| hairline | `#243330` | dividers, bar tracks, unselected chip outline |
| ink | `#E8EFEC` | titles, body, money |
| muted | `#8FA09B` | secondary text, captions, Other category, dashboard-only budgets |
| teal | `#2FB8A2` | the primary action, planned path, within-budget state |
| teal tint | `#163B35` | selected chip, within-budget pill |
| coral | `#F07A74` | the one over-budget element; scenario path in the sheet; "I bought this" |
| coral tint | `#3A1F1E` | the SIMULATED tag background |
| categories | see DESIGN.md | dots, bars, avatar circles; never status |

Type scale (pt / weight): hero 48/600 tabular · title 22/600 · body 17/400 · secondary 15/400 muted · caption 13/400 muted. Radius: surface 16, control 10, pill 999. Spacing: 8-pt grid; 20 side gutters; 24 between sections; 12 inside a surface.

## Components
- **Hero**: caption "Available this month" → 48pt tabular figure → one state line (coral only if it reports an overage). Unboxed, on the bare canvas, nothing behind it.
- **Cart row**: avatar circle (category colour, merchant initial) · "Alo · 1 item" + "Manually added" · subtotal right. Not pressable; hidden entirely when the cart is empty.
- **Future Me box** (`deep`): caption + 28pt teal figure (plus a coral "If bought" figure when over) · the scrubbable graph · "Saving $300 a month" + pencil button · habit/once chips only when over · one sentence.
- **Budget row**: dot + name · remaining right (coral text only when this row is the over one) · 4px bar: spent in category colour, proposed in the category colour at 40%, overflow as a coral tick · secondary "spent of allocated".
- **Section header**: title + optional text link on the right ("All", "Details"). No buttons in headers.
- **Chip**: pill, hairline outline, teal tint + ink text when selected. Sheet only.
- **Button**: pill. Primary = teal fill, canvas text (one per screen). Ghost = ink text, no fill. Danger = coral fill, reserved for "I bought this" and "Reset demo data".
- **Edit page**: iOS sheet (`presentation: 'modal'`) on surface; title + "Done"; a `lit` box with the big dollar input for monthly savings; budgets as rows with dot, name, dollar input and an on/off switch. Numeric inputs only, no sliders.

## QA checklist
- [ ] Count coral elements on the screen: at most one (plus the SIMULATED tag if an event is simulated).
- [ ] No border or drop shadow anywhere; boxes are darker than the canvas and carry no colour; the hero is unboxed; at most one `deep` box per screen.
- [ ] Money is tabular, from `formatCad`; single font family.
- [ ] Home's only controls are the Future Me pencil button and the habit/once toggle (shown only when over); the graph answers to press-and-hold, nothing else.
- [ ] Category colours appear only inside the row/avatar they belong to.
- [ ] Reduced motion: no count animation.
- [ ] Contrast ≥ 4.5:1 for text (ink 14:1, muted 5.6:1 on canvas).
