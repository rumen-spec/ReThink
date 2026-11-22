/**
 * This phone's own `devices` row (SPEC §12.4). The owner's phone is a device like any other, except
 * that it authenticates with the session rather than a minted token — RLS allows the client to
 * insert only `role: 'owner'` rows with a null token hash.
 *
 * Push delivery looks up `devices` where `role = 'owner'`, so without this row a notification has
 * nowhere to go. The id is kept locally so a reinstall creates one row rather than one per launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

import { log } from '@/lib/log';
import { supabase } from '@/lib/supabase';

const l = log.child('device');
const KEY = 'rethink.ownerDeviceId';

function label(): string {
  const name = Device.deviceName?.trim();
  if (name) return name.slice(0, 60);
  const model = Device.modelName ?? 'iPhone';
  return `My ${model}`.slice(0, 60);
}

/** The row id for this phone, creating or re-adopting it as needed. */
export async function ensureOwnerDevice(ownerId: string): Promise<string> {
  const stored = await AsyncStorage.getItem(KEY);
  if (stored) {
    const { data } = await supabase.from('devices').select('id, revoked_at').eq('id', stored).eq('owner_id', ownerId).maybeSingle();
    if (data && !data.revoked_at) {
      await supabase.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id);
      return data.id;
    }
    l.info('stored device row is gone or revoked; registering again', { previous: stored.slice(0, 8) });
  }

  const end = l.span('register owner device');
  const { data, error } = await supabase
    .from('devices')
    .insert({
      owner_id: ownerId,
      device_label: label(),
      role: 'owner',
      platform: 'ios',
      consented_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) {
    end({ error: error?.message ?? 'no row' });
    throw error ?? new Error('Could not register this phone');
  }
  await AsyncStorage.setItem(KEY, data.id);
  end({ deviceId: data.id.slice(0, 8), label: label() });
  return data.id;
}
