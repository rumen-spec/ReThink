/**
 * Hotspots (SPEC §5.8, §14). The map is the screen: the places being watched, drawn at the radius
 * iOS actually monitors. Plus drops a new pin. Alerts and background-location permissions live on
 * the Me tab with the other device settings.
 *
 * What the phone does: registers an iOS geofence per verified hotspot and tells the server "I
 * entered <id>". What it never does: track position on a timer, store coordinates, or watch a place
 * the user did not add. A simulated entry is always labelled as one.
 */
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, useWindowDimensions, View } from 'react-native';
import type { LatLng } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HotspotMap, type HotspotMapHandle } from '@/components/hotspot-map';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { SectionHeader } from '@/components/ui/section';
import { Divider, Surface } from '@/components/ui/surface';
import { Body, Caption, Secondary, Title } from '@/components/ui/text';
import { BottomTabInset, Radius, Spacing, T } from '@/constants/theme';
import { locateMe, permissionState, reportEntry, syncGeofences, type GeofenceState } from '@/lib/geofence';
import { useOwnerActions, useOwnerState, type Hotspot } from '@/lib/owner-state';
import { clearTriggerPairing, getTriggerPairing, pairAsTrigger, triggerHotspots, type TriggerPairing } from '@/lib/trigger';

const RADII = [100, 250, 500];
/** Where the pin lands when the map has never been moved and there is nothing to centre on. */
const FALLBACK_COORD: LatLng = { latitude: 42.9849, longitude: -81.2453 };

export default function HotspotsScreen() {
  const s = useOwnerState();
  const a = useOwnerActions();
  const { height } = useWindowDimensions();
  const map = useRef<HotspotMapHandle>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  const [geo, setGeo] = useState<GeofenceState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [placing, setPlacing] = useState<LatLng | null>(null);
  const [name, setName] = useState('');
  const [radius, setRadius] = useState(250);
  /** The system draws the blue dot only once foreground permission is in hand. */
  const [showUser, setShowUser] = useState(false);
  /** Set when this phone is acting as someone else's trigger: it watches their places, not its own. */
  const [trigger, setTrigger] = useState<TriggerPairing | null>(null);
  const [triggerSpots, setTriggerSpots] = useState<Hotspot[]>([]);
  const [code, setCode] = useState('');

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    try {
      const r = await fn();
      setStatus(typeof r === 'string' ? r : '');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /** In trigger mode the fences come from the owner's account, read with the device token. */
  const loadTrigger = useCallback(async (p: TriggerPairing) => {
    const spots = await triggerHotspots(p);
    setTriggerSpots(
      spots.map((h) => ({ id: h.id, name: h.name, latitude: h.latitude, longitude: h.longitude, radiusM: h.radius_m, enabled: true, verified: true, categoryId: null, lastEnteredAt: null })),
    );
  }, []);

  useEffect(() => {
    void getTriggerPairing().then((p) => {
      setTrigger(p);
      if (p) void loadTrigger(p).catch(() => undefined);
    });
  }, [loadTrigger]);

  const watchedSpots = trigger ? triggerSpots : s.hotspots;

  const resync = useCallback(async () => {
    const state = await permissionState();
    // Re-checked here, not only on mount: permission is usually granted on the Me tab, and the map
    // would otherwise keep hiding the blue dot until the screen was rebuilt.
    setShowUser(state !== 'denied');
    if (state !== 'granted') return;
    setGeo(await syncGeofences(watchedSpots));
  }, [watchedSpots]);

  // Keep the registered fences in step with the list whenever it changes.
  useEffect(() => {
    void resync();
  }, [resync]);

  // If location is already allowed, show the dot without asking again.
  useEffect(() => {
    void permissionState().then((p) => setShowUser(p !== 'denied'));
  }, []);

  const locate = () =>
    run('locate', async () => {
      const r = await locateMe();
      if ('error' in r) return r.error;
      setShowUser(true);
      map.current?.goTo(r.coord);
      return '';
    });

  const startPlacing = () => {
    setPlacing(map.current?.center() ?? FALLBACK_COORD);
    setName('');
    setRadius(250);
    setStatus('');
  };

  const watched = watchedSpots.filter((h) => h.enabled && h.verified).length;
  // The map gives up half its height while you are naming a place, so the form clears the keyboard.
  const mapHeight = placing ? Math.max(200, Math.round(height * 0.26)) : Math.max(320, Math.round(height * 0.5));

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView ref={scroller} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <View style={st.header}>
          <View>
            <Title>Hotspots</Title>
            <Caption color={geo?.status === 'off' && geo.reason === 'unsupported' ? T.coral : undefined}>
              {trigger ? `Trigger for ${trigger.ownerDisplayName ?? 'another account'}` : `${watched} watched`}
              {geo?.status === 'watching' ? ' · fences live' : ''}
              {/* Simulators routinely refuse region monitoring; say so rather than look broken. */}
              {geo?.status === 'off' && geo.reason === 'unsupported' ? ' · this device can’t watch places' : ''}
            </Caption>
          </View>
          {trigger ? null : (
            <Pressable
              onPress={() => (placing ? setPlacing(null) : startPlacing())}
              accessibilityRole="button"
              accessibilityLabel={placing ? 'Cancel adding a place' : 'Add a place'}
              hitSlop={8}
              style={({ pressed }) => [st.plus, pressed ? st.pressed : null]}>
              <SymbolView name={placing ? 'xmark' : 'plus'} size={17} tintColor={T.canvas} weight="semibold" />
            </Pressable>
          )}
        </View>

        <View>
          <HotspotMap ref={map} hotspots={watchedSpots} height={mapHeight} placing={placing} onPlace={setPlacing} placingRadiusM={radius} showsUser={showUser} />
          <Pressable onPress={() => void locate()} accessibilityRole="button" accessibilityLabel="Show where I am" hitSlop={8} style={({ pressed }) => [st.locate, pressed ? st.pressed : null]}>
            <SymbolView name="location.fill" size={16} tintColor={T.ink} weight="semibold" />
          </Pressable>
        </View>

        {placing ? (
          // Bring the form up as soon as it lays out, so the keyboard opens below it, not over it.
          <View onLayout={(e) => scroller.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 8), animated: true })}>
            <Surface tone="high">
              <Body>New place</Body>
              <Secondary>Tap the map or drag the pin to move it.</Secondary>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Name, like Masonville Place"
                placeholderTextColor={T.muted}
                maxLength={60}
                autoFocus
                returnKeyType="done"
                keyboardAppearance="dark"
                style={st.input}
                accessibilityLabel="Name of this place"
              />
              <Chips options={RADII.map((r) => ({ value: r, label: `${r} m` }))} value={radius} onChange={setRadius} accessibilityLabel="How close you have to be" />
              <View style={st.actions}>
                <Button
                  label="Add place"
                  variant="primary"
                  small
                  busy={busy === 'add'}
                  disabled={name.trim().length === 0}
                  onPress={() =>
                    run('add', async () => {
                      await a.addHotspot({ name: name.trim(), latitude: placing.latitude, longitude: placing.longitude, radiusM: radius });
                      setPlacing(null);
                      return `Watching ${name.trim()}`;
                    })
                  }
                />
                <Button label="Cancel" small onPress={() => setPlacing(null)} />
              </View>
            </Surface>
          </View>
        ) : null}

        {status ? <Secondary>{status}</Secondary> : null}

        {trigger ? (
          <View style={st.section}>
            <SectionHeader title="Watching for them" />
            <Surface inset>
              {triggerSpots.length === 0 ? (
                <View style={st.row}>
                  <Secondary>No places shared with this trigger yet.</Secondary>
                </View>
              ) : null}
              {triggerSpots.map((h, i) => (
                <View key={h.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={st.row}>
                    <View style={st.grow}>
                      <Body>{h.name}</Body>
                      <Secondary>{h.radiusM} m</Secondary>
                    </View>
                    <Button label="Simulate entry" small busy={busy === `sim-${h.id}`} onPress={() => run(`sim-${h.id}`, () => reportEntry(h.id, true).then(() => 'Reported'))} />
                  </View>
                </View>
              ))}
            </Surface>
            <Secondary>
              This phone only knows where these places are. It cannot see budgets, carts or spending, and {trigger.ownerDisplayName ?? 'the owner'} can revoke it at any time.
            </Secondary>
            <View style={st.actions}>
              <Button
                label="Stop being a trigger"
                small
                busy={busy === 'untrigger'}
                onPress={() =>
                  run('untrigger', async () => {
                    await clearTriggerPairing();
                    setTrigger(null);
                    setTriggerSpots([]);
                    return 'No longer a trigger';
                  })
                }
              />
            </View>
          </View>
        ) : null}

        {trigger ? null : (
        <View style={st.section}>
          <SectionHeader title="Places" />
          <Surface inset>
            {s.hotspots.length === 0 ? (
              <View style={st.row}>
                <Secondary>Nothing watched yet.</Secondary>
              </View>
            ) : null}
            {s.hotspots.map((h, i) => (
              <View key={h.id}>
                {i > 0 ? <Divider /> : null}
                <View style={st.row}>
                  <View style={st.grow}>
                    <Body>{h.name}</Body>
                    <Secondary>
                      {h.radiusM} m{h.verified ? '' : ' · pin unconfirmed'}
                      {h.lastEnteredAt ? ` · last ${new Date(h.lastEnteredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Secondary>
                  </View>
                  <Switch
                    value={h.enabled}
                    onValueChange={(on) => run(`hs-${h.id}`, () => a.setHotspotEnabled(h.id, on))}
                    trackColor={{ true: T.accent, false: T.control }}
                    thumbColor={h.enabled ? T.canvas : T.ink}
                    ios_backgroundColor={T.control}
                    accessibilityLabel={`Watch ${h.name}`}
                  />
                </View>
                <View style={st.actions}>
                  <Button label="Simulate entry" small busy={busy === `sim-${h.id}`} onPress={() => run(`sim-${h.id}`, () => a.reportHotspotEntry(h.id, true))} />
                  {!h.verified ? <Button label="Pin looks right" small busy={busy === `ver-${h.id}`} onPress={() => run(`ver-${h.id}`, () => a.setHotspotVerified(h.id, true))} /> : null}
                  <Button label="Remove" small busy={busy === `del-${h.id}`} onPress={() => run(`del-${h.id}`, () => a.removeHotspot(h.id))} />
                </View>
              </View>
            ))}
          </Surface>
        </View>
        )}

        {/* Pairing form: this phone becomes someone else's trigger, e.g. a simulator with spoofed GPS. */}
        {trigger ? null : (
          <View style={st.section}>
            <SectionHeader title="Act as a trigger" />
            <Surface>
              <Secondary>Enter a trigger code from another phone to watch their places and tell them when you arrive.</Secondary>
              <View style={st.actions}>
                <TextInput
                  value={code}
                  onChangeText={(t) => setCode(t.toUpperCase())}
                  placeholder="ABC234"
                  placeholderTextColor={T.muted}
                  maxLength={8}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  keyboardAppearance="dark"
                  style={[st.input, st.code]}
                  accessibilityLabel="Trigger pairing code"
                />
                <Button
                  label="Pair"
                  variant="primary"
                  small
                  disabled={code.trim().length < 6}
                  busy={busy === 'pair'}
                  onPress={() =>
                    run('pair', async () => {
                      const p = await pairAsTrigger(code);
                      setTrigger(p);
                      setCode('');
                      await loadTrigger(p);
                      return `Paired with ${p.ownerDisplayName ?? 'their account'}`;
                    })
                  }
                />
              </View>
            </Surface>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.canvas },
  content: { paddingHorizontal: Spacing.gutter, paddingTop: Spacing.two, gap: Spacing.four, paddingBottom: BottomTabInset + Spacing.five },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  locate: { position: 'absolute', right: 12, bottom: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: T.control, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  section: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two, paddingBottom: Spacing.three },
  grow: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tag: { backgroundColor: T.coralTint, borderRadius: Radius.control, paddingHorizontal: 6, paddingVertical: 2 },
  input: { backgroundColor: T.field, borderRadius: Radius.control, paddingHorizontal: 12, minHeight: 42, color: T.ink, fontSize: 17 },
  code: { flex: 1, letterSpacing: 4, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
