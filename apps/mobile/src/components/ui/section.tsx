import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Link, Title } from '@/components/ui/text';
import { T } from '@/constants/theme';

/**
 * Section header: title, an optional text action, and an optional chevron that leads somewhere.
 * Never a filled button — a heading is a signpost, not a control.
 */
export function SectionHeader({ title, action, onPress, accessibilityLabel }: { title: string; action?: { label: string; onPress: () => void }; onPress?: () => void; accessibilityLabel?: string }) {
  return (
    <View style={s.row}>
      <Title>{title}</Title>
      <View style={s.right}>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
            <Link>{action.label}</Link>
          </Pressable>
        ) : null}
        {onPress ? (
          <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `Edit ${title.toLowerCase()}`} hitSlop={10} style={({ pressed }) => (pressed ? s.pressed : null)}>
            <SymbolView name="chevron.right" size={15} tintColor={T.muted} weight="semibold" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.6 },
});
