/**
 * Home (SPEC §5.5): one loud number → the cart → the two most pressing budgets, side by side →
 * Future Me. Nothing explains itself in a sentence: a budget the cart pushes over turns coral, and
 * the graph grows a coral path. All money from @rethink/shared.
 */
import { cartSubtotalsByCategory, computeBudgetConsequence, findBudgetCategoryFor, formatCad, isProductCategoryKey, sortPressingBudgets } from '@rethink/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BudgetCard } from '@/components/budget-card';
import { CartRow } from '@/components/cart-row';
import { FutureMe } from '@/components/future-me';
import { Hero } from '@/components/hero';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section';
import { Surface } from '@/components/ui/surface';
import { Body, Caption, Title } from '@/components/ui/text';
// Caption still carries the sync status in the header.
import { BottomTabInset, Spacing, T, Type } from '@/constants/theme';
import { useOwnerActions, useOwnerState } from '@/lib/owner-state';

export default function HomeScreen() {
  const s = useOwnerState();
  const a = useOwnerActions();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const enabled = s.categories.filter((c) => c.enabled);
  const byCategory = useMemo(() => (s.cart ? cartSubtotalsByCategory(s.cart.items) : {}), [s.cart]);
  const proposedFor = (key?: string) => (key && isProductCategoryKey(key) ? (byCategory[key] ?? 0) : 0);

  // The one over-budget element: the budget the cart pushes furthest over (if any), and the total overage.
  const { over, overageCents } = useMemo(() => {
    let worst: { id: string; name: string; overCents: number } | null = null;
    let total = 0;
    for (const [key, cents] of Object.entries(byCategory)) {
      if (cents === null || !isProductCategoryKey(key)) continue;
      const budget = findBudgetCategoryFor(enabled, key);
      if (!budget) continue;
      const o = computeBudgetConsequence(budget, cents).cartOverageCents ?? 0;
      total += o;
      if (o > 0 && (!worst || o > worst.overCents)) worst = { id: budget.id, name: budget.name, overCents: o };
    }
    return { over: worst, overageCents: total };
  }, [byCategory, enabled]);
  const availableCents = enabled.reduce((n, c) => n + Math.max(0, c.allocatedCents - c.confirmedSpentCents), 0);

  const pressing = sortPressingBudgets(enabled);
  const rows = showAll ? pressing : pressing.slice(0, 2);
  const sync = s.realtime === 'live' ? 'Live' : s.realtime === 'connecting' ? 'Connecting…' : 'Offline';

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.header}>
          <Title style={st.greeting}>Hey, {s.displayName ?? '…'}</Title>
          <Caption>
            {sync}
            {s.syncedAt ? ` · ${s.syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </Caption>
        </View>

        {!s.loading && !s.periodId ? (
          <Surface>
            <Title>No budgets yet</Title>
            <Body>Load the demo profile to see Home with real numbers.</Body>
            <Button
              label="Load demo data"
              variant="primary"
              busy={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await a.loadDemo();
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Surface>
        ) : null}

        {s.periodId ? <Hero label="Available this month" value={formatCad(availableCents)} /> : null}

        {s.cart ? <CartRow cart={s.cart} /> : null}

        {pressing.length > 0 ? (
          <View style={st.section}>
            <SectionHeader
              title="Budgets"
              action={pressing.length > 2 ? { label: showAll ? 'Fewer' : `All ${pressing.length}`, onPress: () => setShowAll((v) => !v) } : undefined}
              onPress={() => router.push('/edit')}
              accessibilityLabel="Edit budgets"
            />
            <View style={st.grid}>
              {rows.map((c) => (
                <BudgetCard key={c.id} category={c} proposedCents={proposedFor(c.productCategory)} />
              ))}
            </View>
          </View>
        ) : null}

        {s.savingsPlan ? (
          <Surface tone="high">
            <FutureMe
              openingBalanceCents={s.savingsPlan.openingBalanceCents}
              planContributionCents={s.savingsPlan.monthlyContributionCents}
              overageCents={overageCents}
              overName={over?.name ?? null}
              onEdit={() => router.push('/edit')}
            />
          </Surface>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.canvas },
  content: { paddingHorizontal: Spacing.gutter, paddingTop: Spacing.two, gap: Spacing.six, paddingBottom: BottomTabInset + Spacing.five },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  // Bigger than a section title, still well clear of the 48pt figure below it.
  greeting: { fontSize: Type.greeting, lineHeight: 36, letterSpacing: -0.3 },
  section: { gap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
});
