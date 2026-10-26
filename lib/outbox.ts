import { after } from 'next/server'
import { Client } from '@upstash/qstash'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Outbox helpers (Phase 81). Rows carry ids only — never PII. Delivery to the
// CRM happens in the QStash-invoked dispatcher; this module only schedules the
// push and is the single TypeScript write path into the outbox.

export type OutboxEventType =
  | 'lead.inquiry'
  | 'lead.booking'
  | 'lead.purge'
  | 'sync.booking'
  | 'sync.signup'
  | 'sync.espo'
  | 'sync.chatwoot'
  | 'erase.person'
  | 'hook.chat_intake'
  | 'hook.chat_resolve'
  | 'hook.chat_label'
  | 'hook.chat_contact'
  | 'hook.espo_contact'
export type OutboxLeadStatus = 'new' | 'in_process' | 'converted' | 'dead'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const INQUIRY_KEY = new RegExp(`^lead\\.inquiry:(${UUID})$`)
const PURGE_KEY = new RegExp(`^lead\\.purge:(${UUID})$`)
const BOOKING_KEY = new RegExp(`^lead\\.booking:(${UUID}):(new|in_process|converted|dead)$`)

// Phase 82: 'sync.<kind>:<uuid>:<bucket tag>' (the tag keeps a later change from colliding with an earlier row).
const SYNC_KEY = new RegExp(`^(sync\\.(?:booking|signup|espo|chatwoot)):(${UUID}):([a-z0-9]{1,24})$`)
const ERASE_KEY = new RegExp(`^erase\\.person:(${UUID})$`)
// Phase 83: inbound webhook rows. Ids only; the tag shapes are parsed by parseHookTag:
//   c<n> (intake, label) | c<n>r<epoch> (resolve) | c<n>b<bucket> (chat contact) | b<bucket>m<1-7> (espo contact)
const HOOK_KEY = new RegExp(
  `^(hook\\.(?:chat_intake|chat_resolve|chat_label|chat_contact|espo_contact)):(${UUID}):([a-z0-9]{1,24})$`,
)

const MAX_DELAY_SECONDS = 604_800 // QStash free plan max delay: 7 days

export interface ParsedOutboxKey {
  eventType: OutboxEventType
  aggregateId: string
  leadStatus: OutboxLeadStatus | null
  /** Phase 82 sync keys only: the bucket tag (null for erase.person). Absent on lead.* keys. */
  tag?: string | null
}

export function parseOutboxKey(key: string): ParsedOutboxKey | null {
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
  m = SYNC_KEY.exec(key)
  if (m) return { eventType: m[1] as OutboxEventType, aggregateId: m[2], leadStatus: null, tag: m[3] }
  m = ERASE_KEY.exec(key)
  if (m) return { eventType: 'erase.person', aggregateId: m[1], leadStatus: null, tag: null }
  m = HOOK_KEY.exec(key)
  if (m) return { eventType: m[1] as OutboxEventType, aggregateId: m[2], leadStatus: null, tag: m[3] }
  return null
}

export interface ParsedHookTag {
  conversationId?: number
  contactId?: number
  resolveEpoch?: number
  bucket?: number
  mask?: number
}

/** Parses a hook.* tag; null for any shape that is not one of the four the receiver emits. */
export function parseHookTag(tag: string | null | undefined): ParsedHookTag | null {
  if (typeof tag !== 'string') return null
  let m = /^c(\d{1,12})r(\d{9,12})$/.exec(tag)
  if (m) return { conversationId: Number(m[1]), resolveEpoch: Number(m[2]) }
  m = /^c(\d{1,12})b(\d{1,12})$/.exec(tag)
  if (m) return { contactId: Number(m[1]), bucket: Number(m[2]) }
  m = /^b(\d{1,12})m([1-7])$/.exec(tag)
  if (m) return { bucket: Number(m[1]), mask: Number(m[2]) }
  m = /^c(\d{1,12})$/.exec(tag)
  if (m) return { conversationId: Number(m[1]) }
  return null
}

/**
 * Bucketed key for a per-person / per-booking sync row. The row only becomes available when its
 * bucket has closed, so every change made inside the bucket is read by the one delivery, and a
 * change in the next bucket gets a row of its own (a plain key would swallow it).
 */
export function syncBucketKey(
  eventType: 'sync.espo' | 'sync.chatwoot',
  id: string,
  nowMs: number,
  bucketSeconds = 30,
): { key: string; availableAt: Date } {
  const tag = Math.floor(nowMs / 1000 / bucketSeconds)
  return {
    key: `${eventType}:${id}:${tag}`,
    availableAt: new Date((tag + 1) * bucketSeconds * 1000),
  }
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
 * Like dispatchAfterResponse, for rows that are not due immediately (hook.* rows carry their own
 * availability). Never throws: a lost publish is re-armed by the daily sweep.
 */
export function publishAfterResponse(
  key: string,
  opts: { delaySeconds?: number; dedupSuffix?: string } = {},
): void {
  try {
    after(() => publishOutboxDispatch(key, opts))
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
