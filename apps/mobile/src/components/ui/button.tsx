import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius, T } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';

/**
 * Pill button, solid and flat — no shadow, so it is always easy to see on a dark screen.
 * primary = ink fill with canvas text (one per screen) · ghost = solid grey · danger = coral,
 * reserved for "I bought this" / "Reset demo data".
 */
export function Button({ label, onPress, variant = 'ghost', busy = false, disabled = false, small = false }: { label: string; onPress: () => void; variant?: ButtonVariant; busy?: boolean; disabled?: boolean; small?: boolean }) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [s.base, small ? s.small : null, s[variant], pressed && !off ? s.pressed : null, off ? s.off : null]}>
      <Text style={[s.text, small ? s.textSmall : null, variant === 'ghost' ? s.textGhost : null]}>{busy ? '…' : label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: { minHeight: 44, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  small: { minHeight: 38, paddingHorizontal: 16, paddingVertical: 7 },
  primary: { backgroundColor: T.accent },
  ghost: { backgroundColor: T.control },
  danger: { backgroundColor: T.coral },
  pressed: { opacity: 0.72 },
  off: { opacity: 0.45 },
  text: { fontSize: 17, fontWeight: '600', color: T.canvas },
  textSmall: { fontSize: 15 },
  textGhost: { color: T.ink },
});
