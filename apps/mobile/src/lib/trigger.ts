/**
 * Trigger mode (SPEC §5.10, §12.4). A second phone — or an iOS simulator with spoofed coordinates —
 * paired to someone else's account purely to say "I walked into hotspot X".
 *
 * It authenticates with the device token minted at pairing, never with a session, so this device
 * can read the hotspots it is meant to watch and nothing else: no budgets, no carts, no spending
 * (§1.4 rule 6). The owner can revoke it from their phone at any moment.
 *
 * Push does not work on an iOS simulator, which is exactly why the simulator is the trigger and
 * never the receiver: the alert lands on the owner's real phone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

import { log } from '@/lib/log';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase';
import { newEventId } from '@/lib/uuid';

const l = log.child('trigger');
const KEY = 'rethink.triggerPairing';

export interface TriggerPairing {
  deviceId: string;
  deviceToken: string;
  ownerDisplayName: string | null;
  pairedAt: string;
}

/** A hotspot as a trigger device sees it: where it is, and nothing about money. */
export interface TriggerHotspot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
}

let cached: TriggerPairing | null | undefined;

export async function getTriggerPairing(): Promise<TriggerPairing | null> {
  if (cached !== undefined) return cached;
  const raw = await AsyncStorage.getItem(KEY);
  cached = raw ? (JSON.parse(raw) as TriggerPairing) : null;
  return cached;
}

export async function clearTriggerPairing(): Promise<void> {
  cached = null;
  await AsyncStorage.removeItem(KEY);
  l.info('trigger pairing cleared');
}

async function callWithToken<T>(name: string, body: Record<string, unknown>, token: string): Promise<T> {
  const end = l.span(`fn:${name}`);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, 'x-rethink-device-token': token },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) {
    end({ error: json.error ?? `HTTP ${res.status}`, status: res.status });
    throw Object.assign(new Error(json.error ?? `HTTP ${res.status}`), { code: json.code, status: res.status });
  }
  end({ status: res.status });
  return json;
}

/** Redeem a six-character code from the owner's phone and become their trigger. */
export async function pairAsTrigger(code: string, label?: string): Promise<TriggerPairing> {
  const deviceLabel = (label?.trim() || Device.deviceName?.trim() || `${Device.modelName ?? 'iPhone'} trigger`).slice(0, 60);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pair-redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ code: code.trim().toUpperCase(), deviceLabel, platform: 'ios', consent: true }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; deviceId?: string; deviceToken?: string; role?: string; ownerDisplayName?: string | null };
  if (!res.ok || !json.deviceId || !json.deviceToken) throw new Error(json.error ?? `Pairing failed (${res.status})`);
  if (json.role !== 'trigger') throw new Error(`That code is for a ${json.role} device, not a hotspot trigger.`);

  const pairing: TriggerPairing = {
    deviceId: json.deviceId,
    deviceToken: json.deviceToken,
    ownerDisplayName: json.ownerDisplayName ?? null,
    pairedAt: new Date().toISOString(),
  };
  cached = pairing;
  await AsyncStorage.setItem(KEY, JSON.stringify(pairing));
  // The logger scrubs `deviceToken`; it is never written in clear.
  l.info('paired as trigger', { deviceId: pairing.deviceId, deviceToken: pairing.deviceToken, owner: pairing.ownerDisplayName, deviceLabel });
  return pairing;
}

/** The hotspots this trigger is meant to watch. Coordinates only — no budget data is returned. */
export async function triggerHotspots(p: TriggerPairing): Promise<TriggerHotspot[]> {
  const r = await callWithToken<{ hotspots: TriggerHotspot[] }>('get-snapshot', {}, p.deviceToken);
  return r.hotspots ?? [];
}

/** Report an entry as the trigger. The owner's phone is what receives the alert. */
export async function reportAsTrigger(p: TriggerPairing, hotspotId: string, simulated: boolean): Promise<{ suppressed: string | null }> {
  return callWithToken<{ suppressed: string | null }>(
    'report-hotspot',
    { hotspotId, eventId: newEventId(), occurredAt: new Date().toISOString(), isSimulated: simulated },
    p.deviceToken,
  );
}
