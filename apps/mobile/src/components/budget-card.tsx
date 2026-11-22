import { colorForBudget, computeBudgetConsequence, formatCad, type BudgetCategory } from '@rethink/shared';
import { StyleSheet, View } from 'react-native';

import { Surface } from '@/components/ui/surface';
import { Caption, Money, Secondary } from '@/components/ui/text';
import { T } from '@/constants/theme';

/**
 * One budget as a card, sized to sit two-up on Home. The category colour identifies it; going over
 * replaces that colour with coral on the dot, the bar and the figure, so an over-budget card reads
 * as red at a glance rather than as "the purple one".
 *
 * All money is derived by `computeBudgetConsequence`, never recomputed here.
 */
export function BudgetCard({ category, proposedCents = 0 }: { category: BudgetCategory; proposedCents?: number }) {
  const c = computeBudgetConsequence(category, proposedCents);
  const projected = c.projectedRemainingCents;
  const over = (projected ?? c.remainingCents) < 0;
  const color = over ? T.coral : colorForBudget(category);

  const alloc = category.allocatedCents;
  const spentRatio = alloc > 0 ? Math.min(1, category.confirmedSpentCents / alloc) : category.confirmedSpentCents > 0 ? 1 : 0;
  const proposedRatio = alloc > 0 ? Math.max(0, Math.min(1 - spentRatio, proposedCents / alloc)) : 0;

  const headline = over ? `${formatCad(-(projected ?? c.remainingCents))} over` : `${formatCad(projected ?? c.remainingCents)} left`;
  const detail = proposedCents > 0 ? `${formatCad(proposedCents)} in your cart` : `${formatCad(category.confirmedSpentCents)} of ${formatCad(alloc)}`;

  return (
    <Surface style={s.card} accessibilityLabel={`${category.name}, ${headline}. ${detail}.`}>
      <View style={s.name}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Caption numberOfLines={1}>{category.name}</Caption>
      </View>
      <Money style={s.figure} color={over ? T.coral : T.ink}>
        {headline}
      </Money>
      <View style={s.track}>
        <View style={[s.fill, { width: `${spentRatio * 100}%`, backgroundColor: color }]} />
        {proposedRatio > 0 ? <View style={[s.fill, { left: `${spentRatio * 100}%`, width: `${proposedRatio * 100}%`, backgroundColor: color, opacity: 0.45 }]} /> : null}
      </View>
      <Secondary numberOfLines={1}>{detail}</Secondary>
    </Surface>
  );
}

const s = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: '47%', gap: 8, padding: 14 },
  name: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  figure: { fontSize: 20, lineHeight: 25 },
  track: { height: 6, backgroundColor: T.hairline, borderRadius: 3, overflow: 'hidden', position: 'relative' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 3 },
});
