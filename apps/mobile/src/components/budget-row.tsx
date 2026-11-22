import { colorForBudget, computeBudgetConsequence, formatCad, type BudgetCategory } from '@rethink/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { Body, Money, Secondary } from '@/components/ui/text';
import { T } from '@/constants/theme';

/**
 * Budget as a row: category dot + name · remaining · 4px bar (spent in the category colour, proposed at 40%).
 * `coral` = this row is THE over-budget element on screen (at most one per screen). Otherwise ink.
 */
export function BudgetRow({ category, proposedCents = 0, coral = false, onPress }: { category: BudgetCategory; proposedCents?: number; coral?: boolean; onPress?: () => void }) {
  const c = computeBudgetConsequence(category, proposedCents);
  const color = colorForBudget(category);
  const alloc = category.allocatedCents;
  const spentRatio = alloc > 0 ? Math.min(1, category.confirmedSpentCents / alloc) : category.confirmedSpentCents > 0 ? 1 : 0;
  const proposedRatio = alloc > 0 ? Math.max(0, Math.min(1 - spentRatio, proposedCents / alloc)) : 0;
  const remaining = c.remainingCents >= 0 ? `${formatCad(c.remainingCents)} left` : `${formatCad(-c.remainingCents)} over`;
  const projected =
    proposedCents > 0 && c.projectedRemainingCents !== null
      ? c.projectedRemainingCents >= 0
        ? `${formatCad(c.projectedRemainingCents)} left if bought`
        : `${formatCad(-c.projectedRemainingCents)} over if bought`
      : `${formatCad(category.confirmedSpentCents)} spent of ${formatCad(alloc)}`;

  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${category.name}, ${remaining}. ${projected}`} style={({ pressed }) => [s.row, pressed ? s.pressed : null]}>
      <View style={s.top}>
        <View style={s.name}>
          <View style={[s.dot, { backgroundColor: color }]} />
          <Body>{category.name}</Body>
        </View>
        <Money color={coral ? T.coral : T.ink}>{remaining}</Money>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${spentRatio * 100}%`, backgroundColor: color }]} />
        {proposedRatio > 0 ? <View style={[s.fill, { left: `${spentRatio * 100}%`, width: `${proposedRatio * 100}%`, backgroundColor: color, opacity: 0.4 }]} /> : null}
      </View>
      <Secondary>{projected}</Secondary>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { paddingVertical: 14, gap: 8 },
  pressed: { opacity: 0.7 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  name: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  track: { height: 4, backgroundColor: T.hairline, borderRadius: 2, overflow: 'hidden', position: 'relative' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2 },
});
