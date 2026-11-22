import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, T } from '@/constants/theme';

/** Pill chips, solid and flat: unselected is grey, selected is ink with canvas text. No outlines, no shadows. */
export function Chips<V extends string | number>({ options, value, onChange, accessibilityLabel }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; accessibilityLabel: string }) {
  return (
    <View style={s.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [s.chip, on ? s.on : null, pressed ? s.pressed : null]}>
            <Text style={[s.text, on ? s.textOn : null]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { backgroundColor: T.control, borderRadius: Radius.pill, paddingHorizontal: 16, paddingVertical: 8, minHeight: 38, justifyContent: 'center' },
  on: { backgroundColor: T.accent },
  pressed: { opacity: 0.75 },
  text: { fontSize: 15, color: T.ink, fontVariant: ['tabular-nums'] },
  textOn: { color: T.canvas, fontWeight: '600' },
});
