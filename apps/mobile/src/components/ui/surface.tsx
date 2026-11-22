import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Elevation, Fill, Radius, Spacing, T } from '@/constants/theme';

export type SurfaceTone = 'plain' | 'high';

/**
 * A box is the canvas, lifted off itself. No outline and almost no fill of its own: it is a shade
 * lighter at the top where the light hits, falls back to canvas at the bottom, and sits on a dark
 * shadow below-right with a faint light one above-left. `high` lifts further, for the one box that
 * leads a screen (Future Me, the pairing code). Pass `inset` for row lists (rows carry their own
 * vertical padding). Pressing a surface sinks it rather than fading it.
 */
export function Surface({
  children,
  tone = 'plain',
  inset = false,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  tone?: SurfaceTone;
  inset?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const box = (pressed: boolean) => (
    <LinearGradient
      colors={tone === 'high' ? Fill.high : Fill.raised}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[s.surface, { boxShadow: pressed ? Elevation.pressed : tone === 'high' ? Elevation.high : Elevation.raised }, inset ? s.inset : null, style]}>
      {children}
    </LinearGradient>
  );
  if (!onPress) return box(false);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {({ pressed }) => box(pressed)}
    </Pressable>
  );
}

/** Engraved divider: a dark score with a light catch under it, so the groove reads without a line of its own. */
export const Divider = () => (
  <View style={s.divider} pointerEvents="none">
    <View style={s.score} />
    <View style={s.catch_} />
  </View>
);

const s = StyleSheet.create({
  surface: { borderRadius: Radius.surface, padding: Spacing.four, gap: Spacing.three, backgroundColor: T.surface },
  inset: { paddingVertical: Spacing.one },
  divider: { height: 2 },
  score: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.45)' },
  catch_: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.045)' },
});
