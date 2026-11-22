/**
 * Geofencing (SPEC §14, GEO-01..03). iOS watches the regions for us and wakes the app on entry,
 * even when it is closed — that is why this is region monitoring and not continuous tracking. We
 * never read a position on a timer and never store coordinates: the only thing that leaves the
 * phone is "I entered hotspot <id>".
 *
 * The task has to be defined at module scope so it exists when iOS relaunches the app in the
 * background; importing this file from the root layout is what guarantees that.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { log } from '@/lib/log';
import { callFunction, ensureSession } from '@/lib/supabase';
import { getTriggerPairing, reportAsTrigger } from '@/lib/trigger';
import { newEventId } from '@/lib/uuid';

const l = log.child('geofence');

export const GEOFENCE_TASK = 'rethink-hotspot-geofence';

/** iOS monitors at most 20 regions per app; we stay well under it. */
const MAX_REGIONS = 20;

export interface HotspotRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  enabled: boolean;
  verified: boolean;
  lastEnteredAt: string | null;
}

/**
 * Tell the server we walked in. Never records spending; it only emits an event and may push.
 * A phone paired as someone else's trigger reports with its device token, so the alert lands on
 * their phone rather than this one.
 */
export async function reportEntry(hotspotId: string, isSimulated: boolean): Promise<{ suppressed: string | null }> {
  const asTrigger = await getTriggerPairing();
  if (asTrigger) return reportAsTrigger(asTrigger, hotspotId, isSimulated);
  await ensureSession();
  return callFunction<{ suppressed: string | null }>('report-hotspot', {
    hotspotId,
    eventId: newEventId(),
    occurredAt: new Date().toISOString(),
    isSimulated,
  });
}

TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    l.error('geofence task error', error);
    return;
  }
  if (!data) return;
  const { eventType, region } = data;
  if (eventType !== Location.GeofencingEventType.Enter) return;
  const hotspotId = region.identifier;
  if (!hotspotId) return;
  l.info('geofence entered', { hotspotId: hotspotId.slice(0, 8), state: region.state });
  try {
    const r = await reportEntry(hotspotId, false);
    l.info('entry reported', { suppressed: r.suppressed });
  } catch (e) {
    l.error('entry report failed', e);
  }
});

export type GeofenceState =
  | { status: 'watching'; count: number }
  | { status: 'off'; reason: 'no-hotspots' | 'permission' | 'unsupported'; detail?: string };

/** Foreground then background permission, in that order — iOS refuses "Always" asked cold. */
export async function requestPermissions(): Promise<{ granted: boolean; detail?: string }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { granted: false, detail: 'Location permission was declined.' };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg.granted) return { granted: false, detail: 'ReThink needs "Always" to notice a hotspot while it is closed.' };
  return { granted: true };
}

/**
 * One reading of where the phone is, for the map's locate button — asked for on a tap, used to
 * move the map, and then forgotten. It is never stored and never sent anywhere.
 */
export async function locateMe(): Promise<{ coord: { latitude: number; longitude: number } } | { error: string }> {
  const current = await Location.getForegroundPermissionsAsync();
  if (!current.granted) {
    if (!current.canAskAgain) return { error: 'Location is off for ReThink in iOS Settings.' };
    const asked = await Location.requestForegroundPermissionsAsync();
    if (!asked.granted) return { error: 'Location permission was declined.' };
  }
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { coord: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function permissionState(): Promise<'granted' | 'foreground-only' | 'denied'> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.granted ? 'granted' : 'foreground-only';
}

/**
 * Register exactly the hotspots that are enabled and verified. Unverified coordinates are never
 * monitored: a fence around the wrong building is worse than no fence (§5.8).
 */
export async function syncGeofences(hotspots: HotspotRow[]): Promise<GeofenceState> {
  const regions = hotspots
    .filter((h) => h.enabled && h.verified)
    .slice(0, MAX_REGIONS)
    .map((h) => ({ identifier: h.id, latitude: h.latitude, longitude: h.longitude, radius: h.radiusM, notifyOnEnter: true, notifyOnExit: false }));

  const already = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK).catch(() => false);

  if (regions.length === 0) {
    if (already) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
    l.info('nothing to watch; geofencing stopped');
    return { status: 'off', reason: 'no-hotspots' };
  }

  const state = await permissionState();
  if (state !== 'granted') {
    if (already) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
    return { status: 'off', reason: 'permission', detail: state === 'denied' ? 'Location is off for ReThink.' : 'Background location is not allowed yet.' };
  }

  try {
    if (already) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    l.info('watching hotspots', {
      count: regions.length,
      // Coordinates included so a rehearsal can drive a simulator across a real fence.
      fences: regions.map((r) => `${r.identifier.slice(0, 8)}@${r.latitude.toFixed(5)},${r.longitude.toFixed(5)}/${r.radius}m`),
    });
    return { status: 'watching', count: regions.length };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    // A device that cannot monitor regions is a fact about the device, not a failure of ours —
    // iOS simulators commonly refuse. Logged as a warning so it never raises a red error overlay
    // over the UI, and reported to the screen so it can say so plainly.
    l.warn('geofencing unavailable on this device', { detail });
    return { status: 'off', reason: 'unsupported', detail };
  }
}

export async function stopGeofencing(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK).catch(() => false)) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
    l.info('geofencing stopped');
  }
}
