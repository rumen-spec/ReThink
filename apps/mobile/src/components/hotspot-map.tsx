/**
 * The hotspot map (SPEC §5.8) — the main thing on the Hotspots screen. Apple Maps, dark, showing
 * each watched place at the radius iOS actually monitors, so what you see is what is registered.
 *
 * Pins say one thing: is this fence live. A live one (enabled and the pin confirmed) is a coral dot
 * with a slow pulse around it; anything else is a plain white dot that sits still. While placing a
 * new pin the map takes a tap anywhere and the pin can be dragged.
 *
 * With permission, iOS draws the familiar blue dot for where you are, so you can see a pin in
 * relation to yourself. That dot is drawn by the system on this screen only: ReThink does not read
 * it, store it or send it anywhere. The only location that ever leaves the phone is which hotspot
 * was entered.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_DEFAULT, type LatLng, type Region } from 'react-native-maps';

import { Secondary } from '@/components/ui/text';
import { Radius, T } from '@/constants/theme';
import type { Hotspot } from '@/lib/owner-state';

/** Degrees of latitude per metre, near enough at Canadian latitudes for framing a circle. */
const M_PER_DEG = 111_320;
/** Where the map opens when there is nothing to show yet: London, Ontario. */
const FALLBACK: Region = { latitude: 42.9849, longitude: -81.2453, latitudeDelta: 0.09, longitudeDelta: 0.09 };

function frame(hotspots: Hotspot[]): Region {
  if (hotspots.length === 0) return FALLBACK;
  const lats = hotspots.map((h) => h.latitude);
  const lngs = hotspots.map((h) => h.longitude);
  const latitude = (Math.min(...lats) + Math.max(...lats)) / 2;
  const longitude = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  // Fit every circle with a margin, and never zoom closer than roughly a kilometre across.
  const widest = Math.max(...hotspots.map((h) => h.radiusM)) * 3;
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), widest / M_PER_DEG, 0.012);
  const spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), widest / (M_PER_DEG * Math.cos((latitude * Math.PI) / 180)), 0.012);
  return { latitude, longitude, latitudeDelta: spanLat * 1.4, longitudeDelta: spanLng * 1.4 };
}

const isLive = (h: Hotspot): boolean => h.enabled && h.verified;

/**
 * A live pin: coral dot with a ring that swells and fades, once every two seconds. The marker is
 * rasterised from these views, so the pulse has to run on the JS driver and keep
 * `tracksViewChanges` on — affordable because a person watches a handful of places, not hundreds.
 */
function LivePin() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  return (
    <View style={s.pinBox}>
      <Animated.View
        style={[
          s.pulse,
          {
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.55, 0.18, 0] }),
          },
        ]}
      />
      <View style={[s.dot, s.dotLive]} />
    </View>
  );
}

/**
 * Anything not being watched: a plain white dot, perfectly still.
 *
 * It carries the same full-width halo as the live pin, at a fraction of the opacity. That is partly
 * design — the two pins then share one geometry — and partly necessity: iOS rasterises a marker
 * from its visible content, so a small dot floating in a transparent box gets trimmed and re-hung,
 * which walks the dot off the centre of its circle as you zoom out. Painting the full box keeps the
 * raster the size we declared, so the anchor means what it says.
 */
function QuietPin() {
  return (
    <View style={s.pinBox}>
      <View style={[s.pulse, s.haloQuiet]} />
      <View style={[s.dot, s.dotQuiet]} />
    </View>
  );
}

export interface HotspotMapHandle {
  /** Where the map is looking right now — the drop point for a new pin. */
  center(): LatLng;
  /** Slide the map to a coordinate, for the locate button. */
  goTo(coord: LatLng, spanM?: number): void;
}

export const HotspotMap = forwardRef<
  HotspotMapHandle,
  {
    hotspots: Hotspot[];
    height: number;
    /** When set, a draggable pin is shown and taps on the map move it. */
    placing?: LatLng | null;
    onPlace?: (coord: LatLng) => void;
    placingRadiusM?: number;
    /** Draw the system's blue dot. Only pass true once foreground permission is granted. */
    showsUser?: boolean;
  }
>(function HotspotMap({ hotspots, height, placing = null, onPlace, placingRadiusM = 250, showsUser = false }, ref) {
  const initial = useRef(frame(hotspots));
  const region = useRef<Region>(initial.current);
  const view = useRef<MapView>(null);

  /**
   * A marker drawn from React views must be re-rastered while it settles, then pinned: leaving
   * `tracksViewChanges` on costs frames during a pan, turning it off too early leaves a blank pin.
   * A pulsing pin is the exception — it tracks for as long as it is alive.
   */
  const [settling, setSettling] = useState(true);
  useEffect(() => {
    setSettling(true);
    const timer = setTimeout(() => setSettling(false), 800);
    return () => clearTimeout(timer);
  }, [hotspots, placing]);

  useImperativeHandle(ref, () => ({
    center: () => ({ latitude: region.current.latitude, longitude: region.current.longitude }),
    goTo: (coord, spanM = 900) => {
      const latitudeDelta = spanM / M_PER_DEG;
      view.current?.animateToRegion({ ...coord, latitudeDelta, longitudeDelta: latitudeDelta / Math.cos((coord.latitude * Math.PI) / 180) }, 450);
    },
  }));

  return (
    <View style={[s.wrap, { height }]}>
      <MapView
        ref={view}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={initial.current}
        onRegionChangeComplete={(r) => {
          region.current = r;
        }}
        onPress={(e) => onPlace?.(e.nativeEvent.coordinate)}
        userInterfaceStyle="dark"
        showsUserLocation={showsUser}
        // Every optional overlay off: the map is here to show the fences and nothing else.
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        showsIndoorLevelPicker={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        accessibilityLabel={`Map of ${hotspots.length} watched ${hotspots.length === 1 ? 'place' : 'places'}`}>
        {hotspots.map((h) => (
          <Circle
            key={`c-${h.id}`}
            center={{ latitude: h.latitude, longitude: h.longitude }}
            radius={h.radiusM}
            strokeWidth={2}
            strokeColor={isLive(h) ? T.coral : 'rgba(240,242,243,0.45)'}
            fillColor={isLive(h) ? 'rgba(240,122,116,0.14)' : 'rgba(240,242,243,0.07)'}
          />
        ))}
        {hotspots.map((h) => {
          const live = isLive(h);
          return (
            <Marker
              key={`m-${h.id}`}
              coordinate={{ latitude: h.latitude, longitude: h.longitude }}
              title={h.name}
              description={live ? `Watching · ${h.radiusM} m` : h.verified ? `Off · ${h.radiusM} m` : `Pin unconfirmed · ${h.radiusM} m`}
              // iOS hangs a custom marker view by its bottom centre unless told otherwise, which
              // puts the dot half its height above the coordinate. Unnoticeable while the circle is
              // large, obvious once you zoom out and the circle shrinks under it. `anchor` sets the
              // point of the view that lands on the coordinate; `centerOffset` pins the residual to
              // zero on builds where anchor alone is ignored.
              anchor={{ x: 0.5, y: 0.5 }}
              centerOffset={{ x: 0, y: 0 }}
              tracksViewChanges={live || settling}>
              {live ? <LivePin /> : <QuietPin />}
            </Marker>
          );
        })}
        {placing ? (
          <>
            <Circle center={placing} radius={placingRadiusM} strokeWidth={2} strokeColor={T.ink} fillColor="rgba(240,242,243,0.14)" />
            <Marker
              coordinate={placing}
              draggable
              onDragEnd={(e) => onPlace?.(e.nativeEvent.coordinate)}
              title="New place"
              description="Drag me, or tap the map"
              anchor={{ x: 0.5, y: 0.5 }}
              centerOffset={{ x: 0, y: 0 }}
              tracksViewChanges={settling}>
              <View style={s.pinBox}>
                <View style={[s.pulse, s.haloQuiet]} />
                <View style={[s.dot, s.dotNew]} />
              </View>
            </Marker>
          </>
        ) : null}
      </MapView>
      {hotspots.length === 0 && !placing ? (
        <View style={s.hint} pointerEvents="none">
          <Secondary>No places yet. Tap + to add one.</Secondary>
        </View>
      ) : null}
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { borderRadius: Radius.surface, overflow: 'hidden', backgroundColor: T.surface },
  hint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  // The box is sized for the pulse at full swell, so the ring is never clipped by the marker bounds.
  pinBox: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: 46, height: 46, borderRadius: 23, backgroundColor: T.coral },
  haloQuiet: { backgroundColor: T.ink, opacity: 0.1 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: T.canvas },
  dotLive: { backgroundColor: T.coral },
  dotQuiet: { backgroundColor: T.ink },
  dotNew: { backgroundColor: T.ink, width: 22, height: 22, borderRadius: 11, borderWidth: 3 },
});
