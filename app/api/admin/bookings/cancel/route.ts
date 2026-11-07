import { getAdminUser } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'
import type { LedgerActor } from '@/lib/payments/state'
import { cancelBooking, type CancelInitiator, type CancelResult } from '@/lib/payments/cancel'

// D-20: the dialog asks who cancelled and preselects nothing, so the field has no default. A request that does not say
// is refused: a Prestigo cancel must never be charged to the client by omission, nor a client cancel waived by it.
// `leg` is still accepted from a tab opened before this change and ignored: the server derives the leg from the row and
// the shared PaymentIntent (money CR-02), it never trusts the caller to name it.
const cancelSchema = z.object({
  id: z.string().uuid(),
  leg: z.enum(['outbound', 'return']).optional(),
  cancelled_by: z.enum(['client', 'prestigo']),
})

/** Thin mapping of the orchestrator's answer to the route's HTTP responses (guards stay here, money lives in cancel.ts). */
function respond(result: CancelResult): NextResponse {
  switch (result.kind) {
    case 'ok':
      if (result.money === 'refunded') return NextResponse.json({ ok: true, refund_id: result.refundId })
      if (result.money === 'released') return NextResponse.json({ ok: true, released: true })
      if (result.money === 'kept') return NextResponse.json({ ok: true, late: true })
      return NextResponse.json({ ok: true })
    case 'not_found':
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    case 'not_cancellable':
      return NextResponse.json({ error: `Cannot cancel a booking with status '${result.status}'` }, { status: 422 })
    case 'already_cancelled':
      return NextResponse.json({ error: "Cannot cancel a booking with status 'cancelled'" }, { status: 422 })
    case 'leg_amount_missing':
      return NextResponse.json({ error: 'Cannot compute per-leg refund: missing leg amount' }, { status: 422 })
    case 'busy':
      return NextResponse.json({ error: 'payment_busy' }, { status: 409 })
    case 'conflict':
      return NextResponse.json({ error: 'status_conflict', currentStatus: result.currentStatus }, { status: 409 })
    case 'money_failed':
      return NextResponse.json(
        { error: 'refund_failed', cancelled: true, amount_minor: result.amount_minor, currency: result.currency },
        { status: 502 },
      )
    case 'db_failed':
      return NextResponse.json(
        result.cancelled ? { error: 'DB update failed', cancelled: true } : { error: 'DB update failed' },
        { status: 500 },
      )
    // An admin initiator never meets these (they belong to the client's page); kept so the mapping is exhaustive.
    case 'too_late':
    case 'policy_changed':
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tooBig = enforceMaxBody(request, 10_000)
  if (tooBig) return tooBig

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const actor: LedgerActor = { type: 'admin', id: user?.id ?? null }
  const initiator: CancelInitiator = parsed.data.cancelled_by === 'prestigo' ? 'admin_prestigo' : 'admin_client'

  const result = await cancelBooking({
    bookingId: parsed.data.id,
    initiator,
    actor,
  })
  return respond(result)
}
