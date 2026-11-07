import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { MANAGE_TOKEN_RE, resolveManageToken } from '@/lib/manage-link'
import { cancelBooking, type CancelResult } from '@/lib/payments/cancel'

/**
 * Phase 89, plan 89-28 (HOLD-06, CANC-01; D-01 to D-04): the client cancels from the secret manage link.
 *
 * Public, unauthenticated, token-gated POST (the CSRF prefix `/api/manage` and the rate-limit key below exist since
 * plan 89-02). The route only guards, parses and maps: the policy, the status compare-and-set and every money step live
 * in lib/payments/cancel.ts (initiator `client_token`).
 *
 * - The token travels in the body (never a URL, never logged), is checked against MANAGE_TOKEN_RE before any database
 *   call, then resolved. Unknown, revoked, anonymised, partner and long-past tokens all get the same 404 (T-89-50).
 * - GET on the page is read-only (mail scanners prefetch links); the change happens only here, on an explicit POST that
 *   carries `acknowledge`, the outcome the client was shown (T-89-27, T-89-51). The server recomputes it; a stale page
 *   cancels nothing and learns the current outcome (409 POLICY_CHANGED).
 * - D-03: up to the pickup whatever the status, except on board; a repeat cancel is a success.
 */

const bodySchema = z
  .object({
    token: z.string().regex(MANAGE_TOKEN_RE),
    acknowledge: z.enum(['free', 'late']),
  })
  .strict()

const NO_STORE = { 'Cache-Control': 'no-store' } as const

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/** The one answer for every token that does not lead to a cancellable link (a visitor learns nothing). */
function invalidLink(): NextResponse {
  return json({ error: 'invalid_link' }, 404)
}

/** Thin mapping of the orchestrator's answer to HTTP. The client never sees a Stripe or database detail. */
function respond(result: CancelResult): NextResponse {
  switch (result.kind) {
    case 'ok':
      return json({
        ok: true,
        outcome: result.outcome,
        money: result.money,
        ...(result.refundedMinor !== undefined ? { refundedMinor: result.refundedMinor } : {}),
        ...(result.currency ? { currency: result.currency } : {}),
      })
    // A repeat cancel is a success to the client: the page shows the booking as cancelled.
    case 'already_cancelled':
      return json({ ok: true, alreadyCancelled: true })
    case 'busy':
      return json({ error: 'payment_busy' }, 409)
    case 'conflict':
      return json({ error: 'status_conflict', currentStatus: result.currentStatus }, 409)
    case 'not_cancellable':
      return json({ error: 'not_cancellable', currentStatus: result.status }, 409)
    case 'too_late':
      return json({ error: 'too_late' }, 409)
    case 'policy_changed':
      return json({ error: 'POLICY_CHANGED', code: 'POLICY_CHANGED', outcome: result.outcome }, 409)
    // The cancel stands; only the refund needs a person. The client is told it is cancelled (UI-SPEC: no error word).
    case 'money_failed':
      return json({ ok: true, outcome: 'free', money: 'manual' })
    case 'db_failed':
      // The cancel applied but its late-fee case could not be opened: the operator was alerted by cancelBooking.
      if (result.cancelled) return json({ ok: true, outcome: 'late', money: 'kept' })
      return json({ error: 'cancel_failed' }, 500)
    case 'not_found':
      return invalidLink()
    case 'leg_amount_missing':
      return json({ error: 'cancel_failed' }, 500)
  }
}

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 2_000)
  if (tooBig) return tooBig

  const { allowed } = await checkRateLimit('/api/manage/cancel', getClientIp(request))
  if (!allowed) return json({ error: 'Too many requests' }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return json({ error: 'Invalid payload' }, 400)

  const bookingId = await resolveManageToken(parsed.data.token)
  if (!bookingId) return invalidLink()

  let result: CancelResult
  try {
    result = await cancelBooking({
      bookingId,
      initiator: 'client_token',
      actor: { type: 'system', id: 'client_token' },
      acknowledge: parsed.data.acknowledge,
    })
  } catch {
    console.error('[manage-cancel] cancel threw', { bookingId })
    return json({ error: 'cancel_failed' }, 500)
  }
  return respond(result)
}
