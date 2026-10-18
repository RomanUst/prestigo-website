import { after } from 'next/server'
import { Client } from '@upstash/qstash'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Outbox helpers (Phase 81). Rows carry ids only — never PII. Delivery to the
// CRM happens in the QStash-invoked dispatcher; this module only schedules the
// push and is the single TypeScript write path into the outbox.

export type OutboxEventType = 'lead.inquiry' | 'lead.booking' | 'lead.purge'
export type OutboxLeadStatus = 'new' | 'in_process' | 'converted' | 'dead'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const INQUIRY_KEY = new RegExp(`^lead\\.inquiry:(${UUID})$`)
const PURGE_KEY = new RegExp(`^lead\\.purge:(${UUID})$`)
const BOOKING_KEY = new RegExp(`^lead\\.booking:(${UUID}):(new|in_process|converted|dead)$`)

const MAX_DELAY_SECONDS = 604_800 // QStash free plan max delay: 7 days

export function parseOutboxKey(
  key: string,
): { eventType: OutboxEventType; aggregateId: string; leadStatus: OutboxLeadStatus | null } | null {
  if (typeof key !== 'string') return null
  let m = INQUIRY_KEY.exec(key)
  if (m) return { eventType: 'lead.inquiry', aggregateId: m[1], leadStatus: null }
  m = PURGE_KEY.exec(key)
  if (m) return { eventType: 'lead.purge', aggregateId: m[1], leadStatus: null }
  m = BOOKING_KEY.exec(key)
  if (m) {
    return {
      eventType: 'lead.booking',
      aggregateId: m[1],
      leadStatus: m[2] as OutboxLeadStatus,
    }
  }
  return null
}

export function inquiryOutboxKey(inquiryId: string): string {
  return `lead.inquiry:${inquiryId}`
}

// Lazy initialisation — avoids module-load crash when QSTASH_TOKEN is absent
let _qstash: Client | null = null
function getQStash(): Client {
  if (!_qstash) {
    _qstash = new Client({ token: process.env.QSTASH_TOKEN ?? '' })
  }
  return _qstash
}

/**
 * Publish `{ key }` to the dispatcher. Never throws; returns false (and logs a
 * payload-free line) when the site URL is missing or the publish fails.
 */
export async function publishOutboxDispatch(
  key: string,
  opts: { delaySeconds?: number; dedupSuffix?: string } = {},
): Promise<boolean> {
  // trim(): a stray newline in the env value changes the signed URL (QStash 401).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!siteUrl) {
    console.error('[outbox] publish skipped code=no_site_url')
    return false
  }

  const delay = Math.min(
    Math.max(Math.floor(Number.isFinite(opts.delaySeconds) ? (opts.delaySeconds as number) : 0), 0),
    MAX_DELAY_SECONDS,
  )

  try {
    await getQStash().publishJSON({
      url: `${siteUrl}/api/integrations/dispatch`,
      body: { key },
      ...(delay > 0 ? { delay } : {}),
      ...(opts.dedupSuffix
        ? { deduplicationId: `${key}:${opts.dedupSuffix}`.replace(/[^A-Za-z0-9._-]/g, '_') }
        : {}),
    })
    return true
  } catch (err) {
    // Status and error class only (QstashError carries the HTTP status); never
    // the message, which can echo the request body or the key.
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 'none'
    const name = err instanceof Error ? err.name.replace(/[^A-Za-z]/g, '').slice(0, 40) : 'unknown'
    console.error(`[outbox] publish failed code=publish_error status=${status} error=${name}`)
    return false
  }
}

/**
 * Schedule the publish to run after the response is sent. `after()` throws when
 * there is no request scope; that must never reach a route — the daily sweep
 * re-publishes any row that stays pending.
 */
export function dispatchAfterResponse(key: string): void {
  try {
    after(() => publishOutboxDispatch(key, { dedupSuffix: 'p' }))
  } catch {
    console.warn('[outbox] after() unavailable, sweep will re-arm')
  }
}

/**
 * The only TypeScript write path into the outbox (through the outbox_enqueue
 * RPC). Never throws; returns false on any error or when no row was inserted.
 */
export async function enqueueOutboxEvent(input: {
  eventType: string
  aggregateType: string
  aggregateId: string
  idempotencyKey: string
  availableAt?: Date
}): Promise<boolean> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase.rpc('outbox_enqueue', {
      p_event_type: input.eventType,
      p_aggregate_type: input.aggregateType,
      p_aggregate_id: input.aggregateId,
      p_key: input.idempotencyKey,
      p_available_at: (input.availableAt ?? new Date()).toISOString(),
    })
    if (error) {
      console.error('[outbox] enqueue failed code=rpc_error')
      return false
    }
    return data === true
  } catch {
    console.error('[outbox] enqueue failed code=exception')
    return false
  }
}
