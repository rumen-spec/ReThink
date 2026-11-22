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
import { locateMe, permissionState, syncGeofences, type GeofenceState } from '@/lib/geofence';
import { useOwnerActions, useOwnerState } from '@/lib/owner-state';

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

  const resync = useCallback(async () => {
    if ((await permissionState()) !== 'granted') return;
    setGeo(await syncGeofences(s.hotspots));
  }, [s.hotspots]);

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

  const watched = s.hotspots.filter((h) => h.enabled && h.verified).length;
  // The map gives up half its height while you are naming a place, so the form clears the keyboard.
  const mapHeight = placing ? Math.max(200, Math.round(height * 0.26)) : Math.max(320, Math.round(height * 0.5));

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView ref={scroller} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <View style={st.header}>
          <View>
            <Title>Hotspots</Title>
            <Caption>
              {watched} watched{geo?.status === 'watching' ? ' · fences live' : ''}
            </Caption>
          </View>
          <Pressable
            onPress={() => (placing ? setPlacing(null) : startPlacing())}
            accessibilityRole="button"
            accessibilityLabel={placing ? 'Cancel adding a place' : 'Add a place'}
            hitSlop={8}
            style={({ pressed }) => [st.plus, pressed ? st.pressed : null]}>
            <SymbolView name={placing ? 'xmark' : 'plus'} size={17} tintColor={T.canvas} weight="semibold" />
          </Pressable>
        </View>

        <View>
          <HotspotMap ref={map} hotspots={s.hotspots} height={mapHeight} placing={placing} onPlace={setPlacing} placingRadiusM={radius} showsUser={showUser} />
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

        {s.hotspotEvents.length > 0 ? (
          <View style={st.section}>
            <SectionHeader title="Recent entries" />
            <Surface inset>
              {s.hotspotEvents.map((e, i) => (
                <View key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={st.row}>
                    <View style={st.grow}>
                      <View style={st.titleRow}>
                        <Body>{e.hotspotName}</Body>
                        {e.isSimulated ? (
                          <View style={st.tag}>
                            <Caption color={T.coral}>SIMULATED</Caption>
                          </View>
                        ) : null}
                      </View>
                      <Secondary>
                        {e.deviceLabel} · {new Date(e.occurredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {e.suppressed ? ` · no alert (${e.suppressed})` : ''}
                      </Secondary>
                    </View>
                  </View>
                </View>
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
});
