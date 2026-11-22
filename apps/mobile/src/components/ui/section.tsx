import { Pressable, StyleSheet, View } from 'react-native';

import { Link, Title } from '@/components/ui/text';

/** Section header: title + optional text action. Never a button. */
export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={s.row}>
      <Title>{title}</Title>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
          <Link>{action.label}</Link>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({ row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' } });
