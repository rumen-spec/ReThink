import { parseCadToCents } from '@rethink/shared';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Radius, T, Type } from '@/constants/theme';

const toText = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/**
 * Dollar entry (SPEC §5.3: numeric input, no money sliders). Commits on blur or return; invalid
 * text snaps back to the last good value with an error haptic, and it follows external changes
 * while it is not focused.
 *
 * The field sits a shade *lighter* than the box it is in rather than near-black: on a dark screen a
 * black well reads as a hole, while a lifted slab reads as something you can type into. The sign
 * and the number are one unit, sized together, so "$200" is a figure rather than two glyphs at
 * opposite ends of a box.
 */
export function MoneyInput({ valueCents, onCommit, big = false, suffix, accessibilityLabel }: { valueCents: number; onCommit: (cents: number) => void; big?: boolean; /** Trails the figure, e.g. "/month". Part of the number, not a label. */ suffix?: string; accessibilityLabel: string }) {
  const [text, setText] = useState(toText(valueCents));
  const [focused, setFocused] = useState(false);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setText(toText(valueCents));
  }, [valueCents]);

  const commit = () => {
    isFocused.current = false;
    setFocused(false);
    const cents = parseCadToCents(text);
    if (cents === null) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setText(toText(valueCents));
      return;
    }
    setText(toText(cents));
    if (cents !== valueCents) onCommit(cents);
  };

  return (
    <View style={[s.wrap, big ? s.wrapBig : null, focused ? s.focused : null]}>
      <Text style={[s.prefix, big ? s.prefixBig : null]}>$</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onFocus={() => {
          isFocused.current = true;
          setFocused(true);
        }}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="decimal-pad"
        returnKeyType="done"
        selectTextOnFocus
        keyboardAppearance="dark"
        accessibilityLabel={accessibilityLabel}
        style={[s.input, big ? s.inputBig : null]}
      />
      {suffix ? <Text style={[s.suffix, big ? s.suffixBig : null]}>{suffix}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: T.control, borderRadius: Radius.control, paddingHorizontal: 12, height: 40, minWidth: 92 },
  wrapBig: { alignSelf: 'flex-start', paddingHorizontal: 16, height: 62, borderRadius: 16, gap: 2 },
  focused: { backgroundColor: '#32373D' },
  prefix: { fontSize: Type.body, fontWeight: '600', color: T.muted },
  prefixBig: { fontSize: 30, fontWeight: '600' },
  // Grows with the number instead of stretching across the box, so the sign stays beside the digits.
  input: { fontSize: Type.body, fontWeight: '600', color: T.ink, fontVariant: ['tabular-nums'], paddingVertical: 0, minWidth: 44, textAlign: 'left' },
  inputBig: { fontSize: 38, minWidth: 92, letterSpacing: -0.5 },
  suffix: { fontSize: Type.body, fontWeight: '600', color: T.muted },
  suffixBig: { fontSize: 24, fontWeight: '600', marginBottom: 3 },
});
