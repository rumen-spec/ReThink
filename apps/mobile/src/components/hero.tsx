import { StyleSheet, View } from 'react-native';

import { Body, Caption, Hero as HeroText } from '@/components/ui/text';
import { T } from '@/constants/theme';

export type StateTone = 'muted' | 'good' | 'over';

/** The one loud number on the bare canvas, with a single state line under it. No glow: nothing behind the figure competes with it. */
export function Hero({ label, value, state, tone }: { label: string; value: string; state: string; tone: StateTone }) {
  return (
    <View style={s.wrap}>
      <Caption>{label}</Caption>
      <HeroText accessibilityLabel={`${value} ${label}`}>{value}</HeroText>
      <Body color={tone === 'over' ? T.coral : tone === 'good' ? T.accent : T.muted}>{state}</Body>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 2, paddingVertical: 8 },
});
