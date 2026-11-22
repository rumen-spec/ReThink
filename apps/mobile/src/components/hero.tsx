import { StyleSheet, View } from 'react-native';

import { Caption, Hero as HeroText } from '@/components/ui/text';

/**
 * The one loud number, on the bare canvas. No glow and no commentary under it: whether a cart puts
 * a budget over is said by the budget cards going red, which is the same fact in fewer words.
 */
export function Hero({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.wrap}>
      <Caption>{label}</Caption>
      <HeroText accessibilityLabel={`${value} ${label}`}>{value}</HeroText>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 2, paddingVertical: 8 },
});
