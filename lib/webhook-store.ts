import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { OutboxStoreError } from '@/lib/outbox-store'

// Supabase access for the inbound webhook path (Phase 83, migration 076). Every call is one
// SECURITY DEFINER RPC (webhook_deliveries is deny-all). Deliberately has no CRM import: the
// receivers must stay thin (D-15) and this file is not allowlisted by the VPS isolation guard.
// Any RPC error or unexpected shape becomes OutboxStoreError('db_error'); payloads are never logged.

export type IngestOutcome = 'queued' | 'exists' | 'duplicate' | 'fused' | 'off'
export type EspoIngestOutcome = IngestOutcome | 'unlinked' | 'erasing'

const INGEST_OUTCOMES: ReadonlySet<string> = new Set(['queued', 'exists', 'duplicate', 'fused', 'off'])
const ESPO_OUTCOMES: ReadonlySet<string> = new Set([...INGEST_OUTCOMES, 'unlinked', 'erasing'])

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

export interface IngestEspoInput {
  deliveryId: string
  espoContactId: string
  fuseLimit: number | null
  bucketSeconds: number
  tagSuffix: string
}

export interface IngestEspoResult {
  outcome: EspoIngestOutcome
  key: string | null
  availableAt: Date | null
}

export interface WebhookStore {
  ingest(input: IngestInput): Promise<IngestOutcome>
  ingestEspo(input: IngestEspoInput): Promise<IngestEspoResult>
  purge(input: { chatwootDays: number; espoDays: number }): Promise<number>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

    async ingestEspo(input) {
      const data = await rpc('webhook_ingest_espo', {
        p_delivery_id: input.deliveryId,
        p_espo_contact_id: input.espoContactId,
        p_fuse_limit: input.fuseLimit,
        p_bucket_seconds: input.bucketSeconds,
        p_tag_suffix: input.tagSuffix,
      })
      const row = Array.isArray(data) ? data[0] : data
      if (!isRecord(row) || typeof row.outcome !== 'string' || !ESPO_OUTCOMES.has(row.outcome)) {
        throw new OutboxStoreError('db_error')
      }
      const key = typeof row.idempotency_key === 'string' && row.idempotency_key !== '' ? row.idempotency_key : null
      let availableAt: Date | null = null
      if (typeof row.available_at === 'string') {
        const d = new Date(row.available_at)
        if (Number.isNaN(d.getTime())) throw new OutboxStoreError('db_error')
        availableAt = d
      }
      return { outcome: row.outcome as EspoIngestOutcome, key, availableAt }
    },

    async purge(input) {
      const data = await rpc('webhook_purge', {
        p_chatwoot_days: input.chatwootDays,
        p_espo_days: input.espoDays,
      })
      if (typeof data !== 'number' || !Number.isFinite(data)) throw new OutboxStoreError('db_error')
      return data
    },
  }
}
