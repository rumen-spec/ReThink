/**
 * Future Me, inline on Home (SPEC §5.7, revised 2026-11-22: no sheet, no slider). Defaults 10% / 15 years.
 * Static: the plan ("Saving $300 a month") with a small edit button → the Edit page. Interactive: press
 * and hold the graph to scrub it Wealthsimple-style: a crosshair, the value at that month and a haptic
 * tick per month. When the cart overspends a budget the coral path appears. Default framing is "if this
 * became a habit" (every month's contribution reduced), which is dramatic *and* true; "Just this once"
 * is a tap away. Axis starts at 0 and shows both paths in full (§9.2): the gap is real, not a zoomed axis.
 */
import { formatCad, projectSavings, type OverageRecurrence } from '@rethink/shared';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { Chips } from '@/components/ui/chips';
import { Body, Caption, Money, Secondary } from '@/components/ui/text';
import { T } from '@/constants/theme';

export const FUTURE_ME_RATE = 0.1 as const;
export const FUTURE_ME_HORIZON_MONTHS = 180;
const HOLD_MS = 160;

function compact(cents: number): string {
  const d = cents / 100;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
  if (d >= 1_000) return `$${Math.round(d / 1_000)}k`;
  return `$${Math.round(d)}`;
}

/** "Mar 2034 · 7y 4m" for the scrubbed month; "Now" for month 0. */
function monthLabel(index: number): string {
  if (index === 0) return 'Now';
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + index, 1);
  const y = Math.floor(index / 12);
  const m = index % 12;
  const span = `${y ? `${y}y` : ''}${y && m ? ' ' : ''}${m ? `${m}m` : ''}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} · ${span}`;
}

export function FutureMe({
  openingBalanceCents,
  planContributionCents,
  overageCents,
  overName,
  onEdit,
}: {
  openingBalanceCents: number;
  planContributionCents: number;
  /** Sum of the cart's over-budget portions across budgets; 0 when within budget. */
  overageCents: number;
  overName: string | null;
  onEdit: () => void;
}) {
  const [recurrence, setRecurrence] = useState<OverageRecurrence>('monthly');
  const [scrub, setScrub] = useState<number | null>(null);

  const f = useMemo(
    () =>
      projectSavings({
        openingBalanceCents,
        monthlyContributionCents: planContributionCents,
        annualRate: FUTURE_ME_RATE,
        horizonMonths: FUTURE_ME_HORIZON_MONTHS,
        overageFundedFromSavingsCents: overageCents,
        overageRecurrence: recurrence,
      }),
    [openingBalanceCents, planContributionCents, overageCents, recurrence],
  );
  const years = FUTURE_ME_HORIZON_MONTHS / 12;
  const showScenario = f.deltaAtHorizonCents > 0;
  const at = f.points[scrub ?? f.points.length - 1]!;

  const sentence = showScenario
    ? recurrence === 'monthly'
      ? `Overspend ${overName ?? 'a budget'} by ${formatCad(f.reducedFirstContributionCents)} every month and Future Me has ${formatCad(f.deltaAtHorizonCents)} less in ${years} years.`
      : `${formatCad(f.reducedFirstContributionCents)} from this month's savings → ${formatCad(f.deltaAtHorizonCents)} less in ${years} years.`
    : `At ${Math.round(FUTURE_ME_RATE * 100)}% a year, illustrative. Hold the graph to see any month.`;

  return (
    <View style={s.wrap}>
      <View style={s.headline}>
        <View>
          <Caption>{scrub === null ? `In ${years} years at ${Math.round(FUTURE_ME_RATE * 100)}%, illustrative` : monthLabel(scrub)}</Caption>
          <Money style={s.big} color={T.accent}>
            {formatCad(at.plannedCents)}
          </Money>
        </View>
        {showScenario ? (
          <View style={s.right}>
            <Caption>If bought</Caption>
            <Money color={T.coral}>{formatCad(at.scenarioCents)}</Money>
          </View>
        ) : null}
      </View>

      <Graph planned={f.points.map((p) => p.plannedCents)} scenario={showScenario ? f.points.map((p) => p.scenarioCents) : null} years={years} scrub={scrub} onScrub={setScrub} />

      <View style={s.planRow}>
        <Body>
          Saving <Body style={s.bold}>{formatCad(planContributionCents)}</Body> a month
        </Body>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit savings plan and budgets" hitSlop={8} style={({ pressed }) => [s.editButton, pressed ? s.pressed : null]}>
          <SymbolView name="pencil" size={15} tintColor={T.ink} weight="semibold" />
        </Pressable>
      </View>

      {showScenario ? (
        <Chips
          options={[
            { value: 'monthly', label: 'If it became a habit' },
            { value: 'once', label: 'Just this once' },
          ]}
          value={recurrence}
          onChange={setRecurrence}
          accessibilityLabel="How to model the overspend"
        />
      ) : null}
      <Secondary>{sentence}</Secondary>
    </View>
  );
}

const H = 200;
const PAD = { top: 10, right: 12, bottom: 22, left: 40 };

/**
 * Axes, gridlines, teal area, coral dashed scenario with the gap filled between the paths.
 * Hold to scrub: a pan that only activates after a short hold, so the page still scrolls when you
 * swipe through it; while active the ScrollView stays put. A selection haptic fires per month crossed.
 */
function Graph({ planned, scenario, years, scrub, onScrub }: { planned: number[]; scenario: number[] | null; years: number; scrub: number | null; onScrub: (index: number | null) => void }) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const nRef = useRef(planned.length);
  nRef.current = planned.length;
  const lastIndex = useRef<number | null>(null);

  const n = planned.length;
  const maxY = Math.max(1, ...planned);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / maxY) * innerH;
  const pts = (arr: number[]) => arr.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = n > 1 ? `M${x(0)},${y(planned[0]!)} ${planned.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z` : '';
  const band =
    scenario && n > 1
      ? `M${x(0)},${y(planned[0]!)} ${planned.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} ${[...scenario].reverse().map((v, k) => `L${x(n - 1 - k)},${y(v)}`).join(' ')} Z`
      : '';
  const yTicks = [0, 1 / 3, 2 / 3, 1].map((f) => maxY * f);
  const xTicks = years >= 10 ? [0, 5, 10, 15].filter((yr) => yr <= years) : [0, Math.round(years / 2), years];

  const indexAt = (px: number) => {
    const w = Math.max(1, widthRef.current - PAD.left - PAD.right);
    const count = nRef.current;
    return Math.max(0, Math.min(count - 1, Math.round(((px - PAD.left) / w) * (count - 1))));
  };
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(HOLD_MS)
        .shouldCancelWhenOutside(false)
        .runOnJS(true)
        .onStart((e) => {
          const i = indexAt(e.x);
          lastIndex.current = i;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onScrub(i);
        })
        .onUpdate((e) => {
          const i = indexAt(e.x);
          if (i === lastIndex.current) return;
          lastIndex.current = i;
          void Haptics.selectionAsync();
          onScrub(i);
        })
        .onFinalize(() => {
          lastIndex.current = null;
          onScrub(null);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onScrub],
  );

  const cursor = scrub !== null && n > 1 ? { x: x(scrub), yp: y(planned[scrub]!), ys: scenario ? y(scenario[scrub]!) : null } : null;

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        style={{ height: H }}
        accessible
        accessibilityLabel="Savings projection graph"
        accessibilityHint="Press and hold, then drag to read any month">
        {width > 0 && n > 1 ? (
          <Svg width={width} height={H}>
            <Defs>
              <LinearGradient id="pathFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={T.accent} stopOpacity={0.18} />
                <Stop offset="1" stopColor={T.accent} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            {yTicks.map((v, i) => (
              <Line key={i} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={T.hairline} strokeWidth={1} />
            ))}
            {yTicks.map((v, i) => (
              <SvgText key={`y${i}`} x={PAD.left - 6} y={y(v) + 4} fill={T.muted} fontSize={11} textAnchor="end">
                {compact(v)}
              </SvgText>
            ))}
            {xTicks.map((yr) => (
              <SvgText key={`x${yr}`} x={x(Math.round((yr / years) * (n - 1)))} y={H - 6} fill={T.muted} fontSize={11} textAnchor={yr === 0 ? 'start' : yr === years ? 'end' : 'middle'}>
                {yr === 0 ? 'now' : `${yr}y`}
              </SvgText>
            ))}
            <Path d={area} fill="url(#pathFill)" />
            {band ? <Path d={band} fill={T.coral} fillOpacity={0.22} /> : null}
            {scenario ? <Polyline points={pts(scenario)} fill="none" stroke={T.coral} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" /> : null}
            <Polyline points={pts(planned)} fill="none" stroke={T.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {cursor ? (
              <>
                <Rect x={cursor.x} y={PAD.top} width={Math.max(0, width - PAD.right - cursor.x)} height={innerH} fill={T.canvas} fillOpacity={0.55} />
                <Line x1={cursor.x} x2={cursor.x} y1={PAD.top} y2={PAD.top + innerH} stroke={T.ink} strokeOpacity={0.4} strokeWidth={1} />
                {cursor.ys !== null ? <Circle cx={cursor.x} cy={cursor.ys} r={5} fill={T.coral} stroke={T.canvas} strokeWidth={2} /> : null}
                <Circle cx={cursor.x} cy={cursor.yp} r={5.5} fill={T.accent} stroke={T.canvas} strokeWidth={2} />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12 },
  headline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  right: { alignItems: 'flex-end' },
  big: { fontSize: 28, lineHeight: 34 },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  bold: { fontWeight: '600' },
  editButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: T.control, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
