/**
 * Home (SPEC §5.5) in the Sleek twist: hero → one state line → cart row → Future Me inline
 * (hold-to-scrub graph + pencil to the Edit page) → two pressing budgets → activity. Coral on exactly
 * one element besides the graph's scenario path. All money from @rethink/shared.
 */
import { cartSubtotalsByCategory, computeBudgetConsequence, findBudgetCategoryFor, formatCad, getProductCategory, isProductCategoryKey, sortPressingBudgets } from '@rethink/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BudgetRow } from '@/components/budget-row';
import { CartRow } from '@/components/cart-row';
import { FutureMe } from '@/components/future-me';
import { Hero } from '@/components/hero';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section';
import { Divider, Surface } from '@/components/ui/surface';
import { Body, Caption, Title } from '@/components/ui/text';
import { BottomTabInset, Spacing, T } from '@/constants/theme';
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
  const unbudgeted = Object.keys(byCategory).filter(isProductCategoryKey).filter((k) => !findBudgetCategoryFor(enabled, k));

  const availableCents = enabled.reduce((n, c) => n + Math.max(0, c.allocatedCents - c.confirmedSpentCents), 0);
  const state = !s.cart
    ? { text: 'Nothing in your cart right now.', tone: 'muted' as const }
    : over
      ? { text: `Your cart would put ${over.name} ${formatCad(over.overCents)} over.`, tone: 'over' as const }
      : unbudgeted.length
        ? { text: `Set a ${getProductCategory(unbudgeted[0]!).label} budget to see this cart's impact.`, tone: 'muted' as const }
        : { text: 'Your cart fits your budgets.', tone: 'good' as const };

  const pressing = sortPressingBudgets(enabled);
  const rows = showAll ? pressing : pressing.slice(0, 2);
  const sync = s.realtime === 'live' ? 'Live' : s.realtime === 'connecting' ? 'Connecting…' : 'Offline';

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.header}>
          <Title>Hey, {s.displayName ?? '…'}</Title>
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

        {s.periodId ? <Hero label="Available this month" value={formatCad(availableCents)} state={state.text} tone={state.tone} /> : null}

        {s.cart ? <CartRow cart={s.cart} /> : null}

        {s.savingsPlan ? (
          <View style={st.section}>
            <SectionHeader title="Future Me" />
            <Surface tone="high">
              <FutureMe
                openingBalanceCents={s.savingsPlan.openingBalanceCents}
                planContributionCents={s.savingsPlan.monthlyContributionCents}
                overageCents={overageCents}
                overName={over?.name ?? null}
                onEdit={() => router.push('/edit')}
              />
            </Surface>
          </View>
        ) : null}

        {pressing.length > 0 ? (
          <View style={st.section}>
            <SectionHeader title="Budgets" action={{ label: showAll ? 'Fewer' : `All ${pressing.length}`, onPress: () => setShowAll((v) => !v) }} />
            <Surface inset>
              {rows.map((c, i) => (
                <View key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <BudgetRow category={c} proposedCents={proposedFor(c.productCategory)} coral={false} />
                </View>
              ))}
            </Surface>
          </View>
        ) : null}

        {s.notes.length > 0 ? (
          <View style={st.section}>
            <SectionHeader title="Activity" />
            <Surface>
              {s.notes.slice(0, 3).map((n, i) => (
                <Caption key={i}>{n}</Caption>
              ))}
            </Surface>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.canvas },
  content: { paddingHorizontal: Spacing.gutter, paddingTop: Spacing.two, gap: Spacing.six, paddingBottom: BottomTabInset + Spacing.five },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  section: { gap: Spacing.three },
});
