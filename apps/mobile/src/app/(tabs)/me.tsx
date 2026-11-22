/**
 * Me (SPEC §5.9): identity, plan, alerts and location permissions, connected devices (revoke),
 * pair a device, privacy, demo tools, logs. Rows and hairlines, no cards.
 */
import { formatCad, formatLogEntry, getRecentLogs } from '@rethink/shared';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section';
import { Divider, Surface } from '@/components/ui/surface';
import { Body, Caption, Hero, Secondary, Title } from '@/components/ui/text';
import { BottomTabInset, Spacing, T } from '@/constants/theme';
import { permissionState, requestPermissions, syncGeofences } from '@/lib/geofence';
import { useOwnerActions, useOwnerState } from '@/lib/owner-state';
import { registerForPush } from '@/lib/push';

const ROLE_LABEL = { owner: 'Owner', browser: 'Browser', trigger: 'Hotspot trigger' } as const;
type LocationState = 'granted' | 'foreground-only' | 'denied' | 'unknown';

export default function MeScreen() {
  const s = useOwnerState();
  const a = useOwnerActions();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pair, setPair] = useState<{ code: string; role: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [alerts, setAlerts] = useState<'on' | 'off' | 'unknown'>('unknown');
  const [loc, setLoc] = useState<LocationState>('unknown');

  // Read the current permissions without prompting; prompts happen only on a tap.
  useEffect(() => {
    void (async () => {
      const p = await Notifications.getPermissionsAsync();
      setAlerts(p.granted ? 'on' : 'off');
      setLoc(await permissionState());
    })();
  }, []);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const r = await fn();
      setStatus(typeof r === 'string' ? r : '');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const createCode = (role: 'browser' | 'trigger') =>
    run(`pair-${role}`, async () => {
      setPair({ ...(await a.createPairCode(role)), role });
    });

  const clothing = s.categories.find((c) => c.productCategory === 'clothing');
  const logs = getRecentLogs();

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content}>
        <View>
          <Title>{s.displayName ?? '…'}</Title>
          <Caption>Demo profile · anonymous session {s.userId ? s.userId.slice(0, 8) : ''}</Caption>
        </View>

        <View style={st.section}>
          <SectionHeader title="Plan" action={{ label: 'Edit', onPress: () => router.push('/edit') }} />
          <Surface>
            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Body>{s.savingsPlan ? `Saving ${formatCad(s.savingsPlan.monthlyContributionCents)} a month` : 'No savings plan yet'}</Body>
                <Secondary>
                  {s.categories.filter((c) => c.enabled).length} budgets on{s.periodLabel ? ` · ${s.periodLabel}` : ''}
                </Secondary>
              </View>
            </View>
          </Surface>
        </View>

        <View style={st.section}>
          <SectionHeader title="Alerts and location" />
          <Surface inset>
            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Body>Alerts</Body>
                <Secondary>{alerts === 'on' ? 'This phone can receive reminders.' : 'Needed for hotspot reminders and test notifications.'}</Secondary>
              </View>
              {alerts === 'on' ? null : (
                <Button
                  label="Turn on"
                  small
                  busy={busy === 'push'}
                  onPress={() =>
                    run('push', async () => {
                      if (!s.userId || !s.deviceId) return 'This phone has not registered yet. Try again in a moment.';
                      const r = await registerForPush(s.userId, s.deviceId);
                      setAlerts(r.status === 'ready' ? 'on' : 'off');
                      return r.status === 'ready'
                        ? 'Alerts are on'
                        : r.status === 'denied'
                          ? 'Allow notifications in iOS Settings'
                          : `Not available: ${r.reason}`;
                    })
                  }
                />
              )}
            </View>
            <Divider />
            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Body>Background location</Body>
                <Secondary>
                  {loc === 'granted'
                    ? 'Hotspots work with the app closed.'
                    : loc === 'foreground-only'
                      ? 'Set Location to "Always" so a hotspot still works with the app closed.'
                      : 'Needed to notice when you arrive at a hotspot.'}
                </Secondary>
              </View>
              {loc === 'granted' ? null : (
                <Button
                  label="Allow"
                  small
                  busy={busy === 'loc'}
                  onPress={() =>
                    run('loc', async () => {
                      const r = await requestPermissions();
                      setLoc(await permissionState());
                      if (!r.granted) return r.detail ?? 'Not allowed';
                      await syncGeofences(s.hotspots);
                      return 'Location allowed';
                    })
                  }
                />
              )}
            </View>
          </Surface>
        </View>

        <View style={st.section}>
          <SectionHeader title="Devices" />
          <Surface inset>
            {s.devices.length === 0 ? (
              <View style={st.row}>
                <Secondary>No devices yet. Pair Chrome below.</Secondary>
              </View>
            ) : null}
            {s.devices.map((d, i) => (
              <View key={d.id}>
                {i > 0 ? <Divider /> : null}
                <View style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Body>{d.label}</Body>
                    <Secondary>
                      {d.revokedAt ? 'Revoked' : ROLE_LABEL[d.role]} · {d.lastSeenAt ? `seen ${new Date(d.lastSeenAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'never seen'}
                    </Secondary>
                  </View>
                  {!d.revokedAt && d.role !== 'owner' ? <Button label="Revoke" small onPress={() => run(`revoke-${d.id}`, () => a.revokeDevice(d.id))} busy={busy === `revoke-${d.id}`} /> : null}
                </View>
              </View>
            ))}
          </Surface>
        </View>

        <View style={st.section}>
          <SectionHeader title="Pair a device" />
          <Surface tone="high">
            <Secondary>Codes are one-time and expire after 10 minutes. Share one only with a device you trust.</Secondary>
            <View style={st.wrap}>
              <Button label="Pair Chrome" variant="primary" onPress={() => createCode('browser')} busy={busy === 'pair-browser'} />
              <Button label="Pair hotspot phone" onPress={() => createCode('trigger')} busy={busy === 'pair-trigger'} />
            </View>
            {pair ? (
              <View>
                <Caption>{pair.role === 'browser' ? 'Chrome' : 'Hotspot trigger'} · expires {new Date(pair.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Caption>
                <Hero style={st.code} accessibilityLabel={`Pairing code ${pair.code.split('').join(' ')}`}>
                  {pair.code}
                </Hero>
              </View>
            ) : null}
          </Surface>
        </View>

        <View style={st.section}>
          <SectionHeader title="Privacy" />
          <Surface>
            <Secondary>
              Stored: your budget choices, cart summaries, device registrations and hotspot entry events. No bank connection. Your position is never stored or sent: the blue dot on the map is drawn by iOS while you are looking at it, and the only thing a hotspot reports is which place was entered.
            </Secondary>
          </Surface>
        </View>

        <View style={st.section}>
          <SectionHeader title="Demo tools" />
          <Surface>
          <Secondary>For the demo only. Anything created here is labelled as such.</Secondary>
          <View style={st.wrap}>
            <Button label="Test notification" small onPress={() => run('notify', () => a.sendTestNotification())} busy={busy === 'notify'} />
            {clothing ? (
              <>
                <Button label="−$50 Clothing" small onPress={() => run('alloc', () => a.setAllocation(clothing.id, Math.max(0, clothing.allocatedCents - 5000)))} busy={busy === 'alloc'} />
                <Button label="+$50 Clothing" small onPress={() => run('alloc', () => a.setAllocation(clothing.id, clothing.allocatedCents + 5000))} busy={busy === 'alloc'} />
              </>
            ) : null}
            {confirmReset ? (
              <>
                <Button
                  label="Yes, reset"
                  variant="danger"
                  small
                  busy={busy === 'reset'}
                  onPress={() =>
                    run('reset', async () => {
                      setConfirmReset(false);
                      await a.loadDemo();
                      return 'Demo data reset';
                    })
                  }
                />
                <Button label="Cancel" small onPress={() => setConfirmReset(false)} />
              </>
            ) : (
              <Button label="Reset demo data" small onPress={() => setConfirmReset(true)} />
            )}
          </View>
          {confirmReset ? <Secondary>Resets budgets, carts and events to the seeded state. Devices stay paired.</Secondary> : null}
          {status ? <Secondary>{status}</Secondary> : null}
          </Surface>
        </View>

        <View style={st.section}>
          <SectionHeader title={`Logs · ${logs.length}`} action={{ label: showLogs ? 'Hide' : 'Show', onPress: () => setShowLogs((v) => !v) }} />
          {showLogs ? (
            <Surface>
              <Button label="Share logs" small onPress={() => void Share.share({ message: logs.map(formatLogEntry).join('\n') })} />
              {logs.length === 0 ? <Secondary>Nothing logged yet.</Secondary> : [...logs].reverse().slice(0, 40).map((e, i) => <Caption key={i} color={e.level === 'error' ? T.coral : e.level === 'warn' ? T.ink : T.muted}>{formatLogEntry(e)}</Caption>)}
            </Surface>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.canvas },
  content: { paddingHorizontal: Spacing.gutter, paddingTop: Spacing.two, gap: Spacing.six, paddingBottom: BottomTabInset + Spacing.five },
  section: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  code: { fontSize: 40, lineHeight: 48, letterSpacing: 6 },
});
