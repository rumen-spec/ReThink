import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { log } from '@/lib/log';

const l = log.child('supabase');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env');
}
l.debug('client configured', { url });

/** Public values only (RLS protects data). The owner's session is the credential. */
export const supabase = createClient(url, anonKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Refresh the token only while the app is in the foreground (Supabase's recommended RN setup).
AppState.addEventListener('change', (state) => {
  l.debug('app state', { state });
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

supabase.auth.onAuthStateChange((event, session) => {
  l.debug('auth state', { event, user: session?.user.id.slice(0, 8) ?? null });
});

/** The owner session, created by anonymous sign-in on first launch (SPEC §5.1). */
export async function ensureSession(): Promise<Session> {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    l.info('session restored', { user: data.session.user.id.slice(0, 8), expiresAt: data.session.expires_at });
    return data.session;
  }
  const end = l.span('anonymous sign-in');
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.session) {
    end({ error: error?.message ?? 'no session' });
    throw error ?? new Error('Anonymous sign-in failed');
  }
  end({ user: signed.session.user.id.slice(0, 8) });
  return signed.session;
}

/** Call an edge function as the owner; surfaces the function's own error message. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const end = l.span(`fn:${name}`);
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    let message = error.message;
    let code: string | undefined;
    let status: number | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      status = ctx?.status;
      const parsed = ctx ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      if (parsed?.error) message = parsed.error;
      code = parsed?.code;
    } catch {
      /* keep the generic message */
    }
    end({ error: message, code, status });
    throw Object.assign(new Error(message), { code, status });
  }
  end({ status: 200 });
  return data as T;
}
