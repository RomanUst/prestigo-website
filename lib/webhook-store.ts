import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { OutboxStoreError } from '@/lib/outbox-store'

// Supabase access for the inbound webhook path (Phase 83, migration 076). Every call is one
// SECURITY DEFINER RPC (webhook_deliveries is deny-all). Deliberately has no CRM import: the
// receivers must stay thin (D-15) and this file is not allowlisted by the VPS isolation guard.
// Any RPC error or unexpected shape becomes OutboxStoreError('db_error'); payloads are never logged.

export type IngestOutcome = 'queued' | 'exists' | 'duplicate' | 'fused' | 'off'

const INGEST_OUTCOMES: ReadonlySet<string> = new Set(['queued', 'exists', 'duplicate', 'fused', 'off'])

export interface IngestInput {
  source: 'chatwoot'
  deliveryId: string
  entityKey: string
  /** Deliveries per entity allowed in 10 minutes; null = no fuse. */
  fuseLimit: number | null
  eventType: string
  aggregateType: string
  aggregateId: string
  key: string
  availableAt: Date
}

export interface WebhookStore {
  ingest(input: IngestInput): Promise<IngestOutcome>
}

export function createWebhookStore(client?: SupabaseClient): WebhookStore {
  // Built lazily inside the try so a missing env var surfaces as db_error, not a crash.
  const db = (): SupabaseClient => client ?? createSupabaseServiceClient()

  async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const { data, error } = await db().rpc(fn, args)
      if (error) throw new Error('rpc')
      return data
    } catch {
      throw new OutboxStoreError('db_error')
    }
  }

  return {
    async ingest(input) {
      const data = await rpc('webhook_ingest', {
        p_source: input.source,
        p_delivery_id: input.deliveryId,
        p_entity_key: input.entityKey,
        p_fuse_limit: input.fuseLimit,
        p_event_type: input.eventType,
        p_aggregate_type: input.aggregateType,
        p_aggregate_id: input.aggregateId,
        p_key: input.key,
        p_available_at: input.availableAt.toISOString(),
      })
      if (typeof data !== 'string' || !INGEST_OUTCOMES.has(data)) throw new OutboxStoreError('db_error')
      return data as IngestOutcome
    },
  }
}
