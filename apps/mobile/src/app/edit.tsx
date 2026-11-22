/**
 * Edit page (SPEC §5.3 + §5.6, presented as an iOS sheet): the savings plan and this month's budgets.
 * Numeric dollar inputs, no sliders. Every change saves on commit and reaches Chrome through realtime.
 * Future Me's assumptions (10%, 15 years) are fixed and labelled; they are not editable here.
 */
import { colorForBudget } from '@rethink/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FUTURE_ME_HORIZON_MONTHS, FUTURE_ME_RATE } from '@/components/future-me';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/money-input';
import { SectionHeader } from '@/components/ui/section';
import { Divider, Surface } from '@/components/ui/surface';
import { Body, Caption, Secondary } from '@/components/ui/text';
import { Spacing, T } from '@/constants/theme';
import { useOwnerActions, useOwnerState } from '@/lib/owner-state';

export default function EditScreen() {
  const s = useOwnerState();
  const a = useOwnerActions();
  const router = useRouter();
  const [status, setStatus] = useState('');

  const run = (fn: () => Promise<void>) => {
    setStatus('');
    fn().catch((e: unknown) => setStatus(e instanceof Error ? e.message : String(e)));
  };

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {/* No page title: the sheet is already the answer to the tap that opened it. */}
        <View style={st.header}>
          <Button label="Done" small onPress={() => router.back()} />
        </View>

        <View style={st.section}>
          <SectionHeader title="Savings" />
          <Surface tone="high">
            {s.savingsPlan ? (
              <MoneyInput big suffix="/month" valueCents={s.savingsPlan.monthlyContributionCents} onCommit={(cents) => run(() => a.setMonthlyContribution(cents))} accessibilityLabel="Monthly savings in dollars" />
            ) : (
              <Secondary>Load the demo profile on Home first.</Secondary>
            )}
            {/* The one line that has to stay: the projection's assumptions are never implied. */}
            <Caption>
              {Math.round(FUTURE_ME_RATE * 100)}% a year, illustrative · {FUTURE_ME_HORIZON_MONTHS / 12} years
            </Caption>
          </Surface>
        </View>

        <View style={st.section}>
          <SectionHeader title={s.periodLabel ? `Budgets · ${s.periodLabel}` : 'Budgets'} />
          <Surface inset>
            {s.categories.length === 0 ? (
              <View style={st.row}>
                <Secondary>Load the demo profile on Home first.</Secondary>
              </View>
            ) : null}
            {s.categories.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <View style={[st.row, c.enabled ? null : st.rowOff]}>
                  <View style={[st.dot, { backgroundColor: colorForBudget(c) }]} />
                  <Body style={st.name} numberOfLines={1}>
                    {c.name}
                  </Body>
                  {c.enabled ? <MoneyInput valueCents={c.allocatedCents} onCommit={(cents) => run(() => a.setAllocation(c.id, cents))} accessibilityLabel={`${c.name} budget in dollars`} /> : null}
                  <Switch
                    value={c.enabled}
                    onValueChange={(on) => run(() => a.setCategoryEnabled(c.id, on))}
                    trackColor={{ true: T.accent, false: T.control }}
                    thumbColor={c.enabled ? T.canvas : T.ink}
                    ios_backgroundColor={T.control}
                    accessibilityLabel={`${c.name} budget on`}
                  />
                </View>
              </View>
            ))}
          </Surface>
          {status ? <Secondary color={T.coral}>{status}</Secondary> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.canvas },
  content: { paddingHorizontal: Spacing.gutter, paddingTop: Spacing.four, gap: Spacing.six, paddingBottom: Spacing.six * 2 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  section: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  rowOff: { opacity: 0.55 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { flex: 1 },
});
