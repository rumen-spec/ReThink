/**
 * Push registration (SPEC §13.2). The server pushes through Expo, so all this phone has to do is
 * hand over a token and keep it fresh. Remote push needs a real device and a development build:
 * in Expo Go or a simulator this reports why rather than failing silently.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { log } from '@/lib/log';
import { supabase } from '@/lib/supabase';

const l = log.child('push');

/** Foreground behaviour: a hotspot reminder is worth showing even with the app open. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushState =
  | { status: 'ready'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; reason: string };

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants.easConfig as { projectId?: string } | undefined)?.projectId ?? null;
}

/** Ask for permission, fetch the Expo token and store it against this device row. */
export async function registerForPush(ownerId: string, deviceId: string): Promise<PushState> {
  if (!Device.isDevice) return { status: 'unsupported', reason: 'Push needs a real device, not a simulator.' };
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return { status: 'unsupported', reason: `No push on ${Platform.OS}.` };

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  }
  if (!granted) {
    l.warn('notification permission denied');
    return { status: 'denied' };
  }

  const id = projectId();
  if (!id) return { status: 'error', reason: 'No EAS project id in app.json.' };

  try {
    const end = l.span('get expo push token');
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    end({ token });
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { device_id: deviceId, owner_id: ownerId, expo_push_token: token, updated_at: new Date().toISOString(), invalidated_at: null },
        { onConflict: 'device_id' },
      );
    if (error) return { status: 'error', reason: error.message };
    l.info('push token stored', { deviceId: deviceId.slice(0, 8), token });
    return { status: 'ready', token };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    // The usual cause in Expo Go: remote push was removed there, so the build has no APNs entitlement.
    l.warn('could not get a push token', { reason });
    return { status: 'unsupported', reason };
  }
}
