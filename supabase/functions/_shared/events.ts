import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventSource, SpendingEventType } from '@rethink/shared';

export interface EmitInput {
  eventId: string;
  ownerId: string;
  deviceId: string | null;
  source: EventSource;
  type: SpendingEventType;
  payload: Record<string, unknown>;
  isSimulated: boolean;
  occurredAt: string;
}

export interface EmitResult {
  /** DB row id (not the client eventId). */
  id: string;
  /** false when this eventId was already recorded: callers must not repeat side effects. */
  inserted: boolean;
}

/** Idempotent insert keyed by (owner_id, event_id). §13.3. */
export async function emitEvent(admin: SupabaseClient, e: EmitInput): Promise<EmitResult> {
  const { data: existing } = await admin
    .from('spending_events')
    .select('id')
    .eq('owner_id', e.ownerId)
    .eq('event_id', e.eventId)
    .maybeSingle();
  if (existing) return { id: existing.id, inserted: false };

  const { data, error } = await admin
    .from('spending_events')
    .insert({
      event_id: e.eventId,
      owner_id: e.ownerId,
      device_id: e.deviceId,
      source: e.source,
      type: e.type,
      payload: e.payload,
      is_simulated: e.isSimulated,
      occurred_at: e.occurredAt,
    })
    .select('id')
    .single();
  if (error) {
    // Lost a race with a retry of the same event: treat as duplicate.
    if (error.code === '23505') {
      const { data: again } = await admin
        .from('spending_events')
        .select('id')
        .eq('owner_id', e.ownerId)
        .eq('event_id', e.eventId)
        .single();
      return { id: again!.id, inserted: false };
    }
    throw error;
  }
  return { id: data.id, inserted: true };
}
