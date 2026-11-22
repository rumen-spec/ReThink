import { parseCadToCents } from '@rethink/shared';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Radius, T, Type } from '@/constants/theme';

const toText = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/**
 * Dollar entry (SPEC §5.3: numeric input, no money sliders). Commits on blur/return; invalid text
 * snaps back to the last good value with an error haptic. Follows external changes while not focused.
 */
export function MoneyInput({ valueCents, onCommit, big = false, accessibilityLabel }: { valueCents: number; onCommit: (cents: number) => void; big?: boolean; accessibilityLabel: string }) {
  const [text, setText] = useState(toText(valueCents));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(toText(valueCents));
  }, [valueCents]);

  const commit = () => {
    focused.current = false;
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
    <View style={[s.wrap, big ? s.wrapBig : null]}>
      <Text style={[s.prefix, big ? s.prefixBig : null]}>$</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onFocus={() => {
          focused.current = true;
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
    </View>
  );
}

const s = StyleSheet.create({
  // Flat and solid, darker than the box around it, so the field is obvious without an outline.
  wrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.field, borderRadius: Radius.control, paddingHorizontal: 12, minHeight: 42, minWidth: 108 },
  wrapBig: { paddingHorizontal: 14, minHeight: 64, alignSelf: 'stretch' },
  prefix: { fontSize: Type.body, color: T.muted, marginRight: 2 },
  prefixBig: { fontSize: 28, marginRight: 4 },
  input: { flex: 1, fontSize: Type.body, fontWeight: '600', color: T.ink, fontVariant: ['tabular-nums'], paddingVertical: 8, textAlign: 'right' },
  inputBig: { fontSize: Type.hero, fontWeight: '600', letterSpacing: -0.5, textAlign: 'left', paddingVertical: 4 },
});
