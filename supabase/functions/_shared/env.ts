import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function must(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

// Auto-injected by Supabase for every function. Never forwarded to a client.
export const SUPABASE_URL = must('SUPABASE_URL');
export const SERVICE_ROLE_KEY = must('SUPABASE_SERVICE_ROLE_KEY');

/** Service-role client: bypasses RLS. Every function scopes its own queries by owner_id. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
