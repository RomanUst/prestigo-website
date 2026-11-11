import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import {
  EXTRA_AMOUNT_CEILING_MINOR,
  isExtraChargeEligible,
  loadExtraContext,
  runExtraCharge,
  type ExtraChargeResult,
  type ExtraRequest,
} from '@/lib/payments/extra'
import type { LedgerActor } from '@/lib/payments/state'

// The operator's extra charge to a client's saved card (Phase 91, plan 91-08; EXTRA-01, D-09, D-10, D-12, D-13, D-15, D-16).
//
//   GET  ?minutes=N                                                   the waiting amount the operator will confirm
//   POST { kind: 'waiting', minutes, expected_amount_minor }          charge ceil(minutes / 15) blocks of the class rate
//   POST { kind: 'other', description, amount_minor }                 charge an agreed amount (no business cap, D-13)
//   -> 200 { outcome: 'charged', charge_id, amount_minor, currency } | 200 { outcome: 'declined', charge_id, code }
//      | 409 { error: 'payment_busy' | 'amount_changed', amount_minor? } | 422 { error: 'action_not_allowed', reason? | 'waiting_rate_missing' }
//
// Like the fee route this is a deliberate place where a person's amount enters (an 'other' extra), and it is safe for the
// same reasons: the amount is the only money field of the request, the currency NEVER comes from the request (it is the
// booking's payment currency; a currency, a booking id or any unknown key is a 400), a waiting amount is computed on the server
// and must equal what the operator saw (409 amount_changed), and the Stripe key derives from the charge row, never the amount.
//
// Guard order (project API patterns): enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400) -> JSON
// parse (400) -> strict schema (400) -> booking (404) -> eligibility (422, 409 while another extra charges) -> engine.

const MAX_BODY_BYTES = 8_192

const idSchema = z.string().uuid()

/** One line: no control character, no line or paragraph separator. */
const isSingleLine = (s: string): boolean =>
  ![...s].some((ch) => {
    const c = ch.codePointAt(0) ?? 0
    return c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029
  })

const bodySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('waiting'),
    minutes: z.number().int().min(1).max(480),
    expected_amount_minor: z.number().int().min(1).max(EXTRA_AMOUNT_CEILING_MINOR),
  }),
  z.strictObject({
    kind: z.literal('other'),
    description: z.string().trim().min(3).max(200).refine(isSingleLine, 'single line'),
    amount_minor: z.number().int().min(1).max(EXTRA_AMOUNT_CEILING_MINOR),
  }),
])

type ExtraBody = z.infer<typeof bodySchema>

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

async function loadBooking(bookingId: string): Promise<{ booking: Record<string, unknown> | null; failed: boolean }> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (error) return { booking: null, failed: true }
  return { booking: (data as Record<string, unknown> | null) ?? null, failed: false }
}

/** engine answer -> HTTP answer. */
function respond(result: ExtraChargeResult): NextResponse {
  if (result.status === 200) {
    return result.outcome === 'charged'
      ? NextResponse.json({
          outcome: 'charged',
          charge_id: result.chargeId,
          amount_minor: result.amountMinor,
          currency: result.currency,
        })
      : NextResponse.json({ outcome: 'declined', charge_id: result.chargeId, code: result.code })
  }
  if (result.status === 409) {
    return result.error === 'amount_changed'
      ? NextResponse.json({ error: 'amount_changed', amount_minor: result.amountMinor }, { status: 409 })
      : NextResponse.json({ error: 'payment_busy' }, { status: 409 })
  }
  return NextResponse.json({ error: result.error }, { status: 422 })
}

function toRequest(body: ExtraBody): ExtraRequest {
  return body.kind === 'waiting'
    ? { kind: 'waiting', minutes: body.minutes, expectedAmountMinor: body.expected_amount_minor }
    : { kind: 'other', description: body.description, amountMinor: body.amount_minor }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Admin guard first (T-91-25): nothing about the booking is read before it.
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id: bookingId } = await params
  if (!idSchema.safeParse(bookingId).success) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
  }
  void request

  // The waiting preview arrives with the waiting amount (plan 91-08, task 2).
  return NextResponse.json({ error: 'action_not_allowed' }, { status: 422, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // 1. Body size: the header check, then the real length (a chunked body carries no content-length).
  const bodyCheck = enforceMaxBody(request, MAX_BODY_BYTES)
  if (bodyCheck) return bodyCheck

  // 2. Admin guard (T-91-25): before the body is parsed.
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  // 3. Booking id
  const { id: bookingId } = await params
  if (!idSchema.safeParse(bookingId).success) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
  }

  // 4. JSON parse (400), then the strict schema (400)
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  // 5. Booking (404)
  const { booking, failed } = await loadBooking(bookingId)
  if (failed) return NextResponse.json({ error: 'Failed to load booking' }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const actor: LedgerActor = { type: 'admin', id: user.id }

  // 6. Eligibility on a fresh context (422; 409 while another extra is charging), then the engine. Ids and codes only in the
  // log: never the operator's description, a name or a provider message.
  try {
    const ctx = await loadExtraContext(bookingId)
    const verdict = isExtraChargeEligible(booking, ctx)
    if (!verdict.ok) {
      if (verdict.reason === 'in_flight') return NextResponse.json({ error: 'payment_busy' }, { status: 409 })
      return NextResponse.json({ error: 'action_not_allowed', reason: verdict.reason }, { status: 422 })
    }
    return respond(await runExtraCharge({ booking, request: toRequest(body), actor }))
  } catch {
    console.error('[admin/bookings/[id]/extra] action failed', { bookingId, kind: body.kind })
    return NextResponse.json({ error: 'Payment action failed' }, { status: 500 })
  }
}
