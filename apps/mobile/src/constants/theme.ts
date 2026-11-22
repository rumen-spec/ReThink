/**
 * ReThink design tokens. Source of truth for the app; mirrored in `docs/PLAN.md` Block 4.
 * (The sleek skill is retired as of 2026-11-22; this file and PLAN.md Block 4 are the reference.)
 *
 * Dark and neutral: no teal anywhere (dropped 2026-11-22). The screen is charcoal, the type is the
 * accent, and coral marks the one thing that is over budget. Category colours are data, not chrome.
 *
 * Depth, not outlines: a box is the canvas lifted off itself — a shade lighter at the top where the
 * light lands, a dark shadow below-right, a faint light one above-left. Controls do NOT float:
 * buttons, chips, inputs and bars are solid flat fills, because a shadowed control is hard to see.
 */
import '@/global.css';

export const T = {
  /** The field everything sits on. Neutral charcoal, never pure black. Boxes are this colour too. */
  canvas: '#141719',
  /** Nominal box fill (navigation chrome, fallbacks). Real boxes use the gradient pairs in `Fill`. */
  surface: '#181C1E',
  /** Solid fill for controls that are not the primary action: visible without any shadow. */
  control: '#272B30',
  /** Field fill: darker than the box it sits in, so an input reads as somewhere to type. */
  field: '#0A0C0D',
  /** Bar tracks, graph gridlines. */
  hairline: '#2C3136',
  ink: '#F0F2F3',
  muted: '#9AA1A7',
  /** The accent is the type itself: primary buttons, the planned savings path, selected chips. */
  accent: '#F0F2F3',
  coral: '#F07A74',
  coralTint: '#3A1F1E',
} as const;

/** Light fallback (SPEC §4.2); unused while userInterfaceStyle is locked to dark. */
export const Colors = {
  light: { text: '#102329', background: '#F6F8F7', backgroundElement: '#FFFFFF', backgroundSelected: '#E5EBE8', textSecondary: '#66787D' },
  dark: { text: T.ink, background: T.canvas, backgroundElement: T.surface, backgroundSelected: T.control, textSecondary: T.muted },
} as const;

/**
 * Box fills. These straddle the canvas rather than sitting above it: a touch lighter at the top lip,
 * a touch darker at the bottom, averaging out to the canvas itself. The box blends in; the shadow,
 * not the fill, is what lifts it.
 */
export const Fill = {
  raised: ['#1C2023', '#0E1012'] as const,
  high: ['#1F2327', '#0C0E10'] as const,
} as const;

/**
 * Elevation for boxes only; controls never use it, because a shadowed control is hard to see.
 * One lamp over the top-left corner, built from four parts so the slab reads as a solid object:
 * a long key shadow below-right, a tight contact shadow that pins it to the canvas, a rim light
 * up-left, and a 1px bevel inside the lip — lit along the top, dark along the bottom.
 */
export const Elevation = {
  raised: [
    { offsetX: 2, offsetY: 18, blurRadius: 34, color: 'rgba(0,0,0,0.82)' },
    { offsetX: 0, offsetY: 5, blurRadius: 10, color: 'rgba(0,0,0,0.55)' },
    { offsetX: -10, offsetY: -11, blurRadius: 26, color: 'rgba(255,255,255,0.06)' },
    { offsetX: 0, offsetY: 1, blurRadius: 1, color: 'rgba(255,255,255,0.09)', inset: true },
    { offsetX: 0, offsetY: -1, blurRadius: 1, color: 'rgba(0,0,0,0.55)', inset: true },
  ],
  high: [
    { offsetX: 3, offsetY: 30, blurRadius: 54, color: 'rgba(0,0,0,0.88)' },
    { offsetX: 0, offsetY: 8, blurRadius: 14, color: 'rgba(0,0,0,0.6)' },
    { offsetX: -14, offsetY: -15, blurRadius: 36, color: 'rgba(255,255,255,0.08)' },
    { offsetX: 0, offsetY: 1, blurRadius: 1, color: 'rgba(255,255,255,0.12)', inset: true },
    { offsetX: 0, offsetY: -1, blurRadius: 1, color: 'rgba(0,0,0,0.6)', inset: true },
  ],
  pressed: [
    { offsetX: 3, offsetY: 5, blurRadius: 10, color: 'rgba(0,0,0,0.65)', inset: true },
    { offsetX: -3, offsetY: -3, blurRadius: 7, color: 'rgba(255,255,255,0.05)', inset: true },
  ],
} as const;

export const Type = { hero: 48, greeting: 30, title: 22, body: 17, secondary: 15, caption: 13 } as const;

export const Radius = { surface: 22, control: 12, pill: 999 } as const;

export const Spacing = { one: 4, two: 8, three: 12, four: 16, five: 24, six: 32, gutter: 20 } as const;

export const BottomTabInset = 96;
