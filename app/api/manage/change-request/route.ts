import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { MANAGE_TOKEN_RE, resolveManageToken } from '@/lib/manage-link'
import { isManageActiveStatus } from '@/lib/manage-view'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { createSupabaseServiceClient } from '@/lib/supabase'

/**
 * Phase 89, plan 89-28 (D-01): the client asks for a change from the secret manage link. A change request edits
 * NOTHING: it reaches the operator as one plain-text email (alert kind `change_request`) and the operator edits the
 * booking in admin and replies.
 *
 * Same guards as the cancel route (own rate-limit key, strict body, token resolved first, one uniform 404). The client's
 * words go to the mail only: HTML-escaped by the alert, capped at 1000 characters here, never written to the payment
 * ledger, the booking, a log or a response (T-89-53).
 *
 * Duplicates: the alert key is per booking, 10-minute bucket and message hash. A double click or a retry of the same
 * text inside the bucket mails once (the second answer is `duplicate`, still a success to the client); a different text
 * is a different request and is mailed, so a correction sent a minute later is not lost.
 */

const MESSAGE_MAX = 1000
const BUCKET_MS = 10 * 60_000

const bodySchema = z
  .object({
    token: z.string().regex(MANAGE_TOKEN_RE),
    message: z.string().max(4000),
  })
  .strict()

const NO_STORE = { 'Cache-Control': 'no-store' } as const

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

const invalidLink = (): NextResponse => json({ error: 'invalid_link' }, 404)

/** Trimmed, CRLF folded to LF, control characters (except newline and tab) removed. */
function cleanMessage(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
}

/** Columns the operator mail needs. No client email or phone: the mail goes to the operator, who has the booking. */
const ALERT_COLUMNS =
  'id, booking_reference, status, client_first_name, client_last_name, pickup_date, pickup_time, payment_currency, payment_amount_minor'

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 8_000)
  if (tooBig) return tooBig

  const { allowed } = await checkRateLimit('/api/manage/change-request', getClientIp(request))
  if (!allowed) return json({ error: 'Too many requests' }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return json({ error: 'Invalid payload' }, 400)

  const message = cleanMessage(parsed.data.message)
  if (message.length < 1 || message.length > MESSAGE_MAX) return json({ error: 'Invalid payload' }, 400)

  const bookingId = await resolveManageToken(parsed.data.token)
  if (!bookingId) return invalidLink()

  const { data, error } = await createSupabaseServiceClient()
    .from('bookings')
    .select(ALERT_COLUMNS)
    .eq('id', bookingId)
    .maybeSingle()
  if (error) return json({ error: 'request_failed' }, 500)
  if (!data) return invalidLink()
  const booking = data as unknown as Record<string, unknown>

  // A cancelled, finished or on-board trip can no longer be changed; the page does not offer the form there.
  if (typeof booking.status !== 'string' || !isManageActiveStatus(booking.status)) {
    return json({ error: 'not_changeable' }, 409)
  }

  const nowMs = Date.now()
  const bucket = Math.floor(nowMs / BUCKET_MS)
  const digest = createHash('sha256').update(message).digest('hex').slice(0, 8)

  let outcome: 'sent' | 'duplicate' | 'failed'
  try {
    outcome = await sendPaymentOperatorAlert('change_request', booking, {
      eventKey: `alert:change_request:${bookingId}:${bucket}:${digest}`,
      message,
      requestedAt: new Date(nowMs).toISOString(),
    })
  } catch {
    console.error('[manage-change-request] alert threw', { bookingId })
    outcome = 'failed'
  }
  if (outcome === 'failed') return json({ error: 'send_failed' }, 502)
  return json({ ok: true })
}
