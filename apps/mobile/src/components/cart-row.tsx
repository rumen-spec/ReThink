import { cartSubtotalsByCategory, formatCad, getMerchant, getProductCategory, isMerchantKey, isProductCategoryKey } from '@rethink/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Surface } from '@/components/ui/surface';
import { Body, Caption, Money, Secondary } from '@/components/ui/text';
import { T } from '@/constants/theme';
import type { ActiveCart } from '@/lib/owner-state';

/** The cart as one compact row: avatar (dominant category colour) · merchant + items · subtotal. Never shown for an empty cart. */
export function CartRow({ cart, onPress }: { cart: ActiveCart; onPress?: () => void }) {
  const merchant = isMerchantKey(cart.merchantKey) ? getMerchant(cart.merchantKey).label : cart.merchantKey;
  const count = cart.items.reduce((n, i) => n + i.quantity, 0);
  const by = cartSubtotalsByCategory(cart.items);
  const dominant = Object.entries(by).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0];
  const color = dominant && isProductCategoryKey(dominant) ? getProductCategory(dominant).color.dark : T.muted;
  const source = cart.source === 'retailer-detected' ? 'Detected cart' : 'Manually added';

  return (
    <Surface onPress={onPress} accessibilityLabel={`Cart at ${merchant}, ${count} ${count === 1 ? 'item' : 'items'}, subtotal ${cart.subtotalCents === null ? 'partial' : formatCad(cart.subtotalCents)}.`} style={s.surface}>
      <View style={[s.avatar, { backgroundColor: color }]}>
        <Text style={s.initial}>{merchant.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={s.text}>
        <Body>
          {merchant} · {count} {count === 1 ? 'item' : 'items'}
        </Body>
        <Secondary>{source} · nothing recorded as spent</Secondary>
      </View>
      <View style={s.right}>
        <Money>{cart.subtotalCents === null ? 'Partial' : formatCad(cart.subtotalCents)}</Money>
        <Caption>v{cart.version}</Caption>
      </View>
    </Surface>
  );
}

const s = StyleSheet.create({
  surface: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initial: { color: T.canvas, fontSize: 17, fontWeight: '600' },
  text: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
});
