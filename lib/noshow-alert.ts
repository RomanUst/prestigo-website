import type { OutboxRow } from '@/lib/outbox-store'
import { OutboxStoreError } from '@/lib/outbox-store'
import { skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import { loadChatwootOpsConversationId } from '@/lib/chatwoot-client'
import { parseOutboxKey } from '@/lib/outbox'
import type { DispatchDeps } from '@/lib/lead-sync'
import { createSupabaseServiceClient } from '@/lib/supabase'

/**
 * alert.no_show handler (Phase 87, plan 87-06, D-16 b). Runs ONLY inside the QStash-invoked outbox
 * dispatcher: reachable only from lib/lead-sync.ts, never from a page render or a booking / payment /
 * contact / driver request path (Pitfall 8). The driver's no-show request inserts an ids-only outbox
 * row (plan 87-09); this handler turns it into a Chatwoot message for the operator.
 *
 * Operators only: the note is always PRIVATE (`private: true`), so Chatwoot never shows it to the
 * passenger and never sends it out on the passenger's channel. No client-visible message, WhatsApp or
 * email is ever sent from here.
 *
 * State-convergent: the key only says "a no-show was requested at second N". The handler re-reads the
 * booking and posts nothing when the request is stale. Logs carry the key (ids only), outcome and code;
 * never a name, email, phone, amount or message body. The content holds the booking reference, the
 * pickup date and time and the driver's name only.
 */

export interface NoShowAlertContext {
  status: string
  /** bookings.no_show_requested_at (ISO), null when no request is pending. */
  noShowRequestedAt: string | null
  bookingReference: string
  pickupDate: string
  pickupTime: string
  driverName: string | null
  /** The passenger's most recently updated Chatwoot conversation, null when there is none. */
  conversationId: number | null
}

export interface NoShowAlertStore {
  /** null when the booking no longer exists. Throws OutboxStoreError('db_error') on a database error. */
  load(bookingId: string): Promise<NoShowAlertContext | null>
}

export interface NoShowAlertDeps {
  store?: NoShowAlertStore
  /** Operations conversation used when the passenger has none; null = not configured. */
  opsConversationId?: number | null
}

const DEFAULT_SITE_URL = 'https://rideprestigo.com'

function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return (raw ? raw : DEFAULT_SITE_URL).replace(/\/+$/, '')
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Supabase-backed store. The service client is created inside load, never at module level. */
export function createNoShowAlertStore(): NoShowAlertStore {
  return {
    async load(bookingId) {
      try {
        const db = createSupabaseServiceClient()

        const { data: booking, error } = await db
          .from('bookings')
          .select('status,no_show_requested_at,booking_reference,pickup_date,pickup_time,driver_id')
          .eq('id', bookingId)
          .maybeSingle()
        if (error) throw new Error('read')
        if (!booking) return null

        let driverName: string | null = null
        if (booking.driver_id) {
          const { data: driver, error: driverErr } = await db
            .from('drivers')
            .select('name')
            .eq('id', booking.driver_id)
            .maybeSingle()
          if (driverErr) throw new Error('read')
          driverName = typeof driver?.name === 'string' && driver.name !== '' ? driver.name : null
        }

        let conversationId: number | null = null
        const { data: link, error: linkErr } = await db
          .from('booking_identity')
          .select('identity_id')
          .eq('booking_id', bookingId)
          .maybeSingle()
        if (linkErr) throw new Error('read')
        if (link?.identity_id) {
          const { data: conv, error: convErr } = await db
            .from('chat_conversations')
            .select('conversation_id')
            .eq('identity_id', link.identity_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (convErr) throw new Error('read')
          const id = Number(conv?.conversation_id)
          conversationId = Number.isInteger(id) && id > 0 ? id : null
        }

        return {
          status: str(booking.status),
          noShowRequestedAt: typeof booking.no_show_requested_at === 'string' ? booking.no_show_requested_at : null,
          bookingReference: str(booking.booking_reference),
          pickupDate: str(booking.pickup_date),
          pickupTime: str(booking.pickup_time),
          driverName,
          conversationId,
        }
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },
  }
}

/** HH:MM:SS -> HH:MM; anything else is shown as stored. */
function shortTime(time: string): string {
  const m = /^(\d{2}:\d{2}):\d{2}/.exec(time)
  return m ? m[1] : time
}

/** English operator text. Booking reference, pickup, driver and the admin link; no client data. */
export function buildNoShowNote(ctx: NoShowAlertContext): string {
  const driver = ctx.driverName ? ctx.driverName : 'the driver'
  return [
    `No-show requested: ${driver} says the passenger did not show up.`,
    `Booking ${ctx.bookingReference}, pickup ${ctx.pickupDate} ${shortTime(ctx.pickupTime)}.`,
    `Review and decide in the admin: ${siteUrl()}/admin/bookings`,
  ].join('\n')
}

export async function deliverNoShowAlert(
  row: OutboxRow,
  d: DispatchDeps,
  deps: NoShowAlertDeps = {},
): Promise<DispatchResult> {
  const result = await run(row, d, deps)
  console.log(`[noshow-alert] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? '-'}`)
  return result
}

/** A request stamped within this window after the key's whole second is the same request. */
const SAME_REQUEST_WINDOW_MS = 1000

/**
 * The booking must still be waiting at the pickup (on_location) with a pending request that is not
 * newer than the one the key was built for. The key floors the request time to whole seconds, so the
 * stored value may sit up to a second above it.
 */
function isStale(ctx: NoShowAlertContext, keyEpochSeconds: number | null): boolean {
  if (ctx.status !== 'on_location') return true
  if (!ctx.noShowRequestedAt) return true
  const requestedMs = Date.parse(ctx.noShowRequestedAt)
  if (!Number.isFinite(requestedMs)) return true
  return keyEpochSeconds !== null && requestedMs - keyEpochSeconds * 1000 > SAME_REQUEST_WINDOW_MS
}

async function run(row: OutboxRow, d: DispatchDeps, deps: NoShowAlertDeps): Promise<DispatchResult> {
  const client = d.chatwoot
  const store = deps.store ?? createNoShowAlertStore()

  const ctx = await store.load(row.aggregate_id)
  if (!ctx) return skip(row, d, 'booking_gone')

  const tag = parseOutboxKey(row.idempotency_key)?.tag ?? null
  const keySeconds = tag && /^r\d+$/.test(tag) ? Number(tag.slice(1)) : null
  if (isStale(ctx, keySeconds)) return skip(row, d, 'stale_request')

  // Passenger conversation first, then the optional operations conversation; with neither, the admin
  // banner and the operator email are the alert.
  const opsId = deps.opsConversationId === undefined ? loadChatwootOpsConversationId() : deps.opsConversationId
  const conversationId = ctx.conversationId ?? opsId
  if (conversationId === null || !client) return skip(row, d, 'no_conversation')

  await client.post(`/conversations/${conversationId}/messages`, {
    content: buildNoShowNote(ctx),
    message_type: 'outgoing',
    private: true,
  })

  await d.store.complete(row.idempotency_key, 'sent', null)
  return { outcome: 'sent' }
}
