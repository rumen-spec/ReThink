import { StyleSheet, View } from 'react-native';

import { Caption, Hero as HeroText } from '@/components/ui/text';
import { T } from '@/constants/theme';

/**
 * The one loud number, on the bare canvas. No glow and no commentary under it: whether a cart puts
 * a budget over is said by the budget cards going red, which is the same fact in fewer words.
 * `over` is for the month as a whole being overspent, when the figure itself is the bad news.
 */
export function Hero({ label, value, tone = 'plain' }: { label: string; value: string; tone?: 'plain' | 'over' }) {
  return (
    <View style={s.wrap}>
      <Caption color={tone === 'over' ? T.coral : undefined}>{label}</Caption>
      <HeroText accessibilityLabel={`${value} ${label}`} color={tone === 'over' ? T.coral : undefined}>
        {value}
      </HeroText>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 2, paddingVertical: 8 },
});
