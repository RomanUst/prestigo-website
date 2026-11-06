import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { allowedPaymentActions } from '@/lib/payments/actions'
import { loadFeeCase, runFeeCharge, type FeeChargeResult } from '@/lib/payments/fee'
import type { LedgerActor } from '@/lib/payments/state'

// Operator decisions on money of a cancelled or no-show booking, and the cash decisions of a cash booking
// (Phase 89, plan 89-12; CASH-03, CASH-04, D-05, D-10, D-13, D-14, D-21, D-22).
//
//   POST { action: 'charge', amount_minor, reason?, contact_note? }   charge a fee case (any amount 1..base)
//   POST { action: 'waive', reason }                                 waive a fee case
//   POST { action: 'charge_saved_card', note }                       charge the saved card of a cash booking
//   POST { action: 'mark_cash_settled' }                              the client paid the driver in cash
//   POST { action: 'reopen_cash', note }                             reverse a cash confirmation
//   -> 200 { outcome: 'ok' | 'declined' } | 409 { error: 'amount_locked' | 'payment_busy' }
//      | 422 { error: 'amount_above_cap' | 'note_required' | 'action_not_allowed' } | 502 { error: 'refund_failed' }
//
// THIS IS THE DELIBERATE EXCEPTION to the rule of lib/payments/actions.ts ("no function here takes an amount") and of
// POST /api/admin/bookings/[id]/payment (a strict object where an amount is a 400): a person chooses the amount of a
// fee here (D-14). It is safe because
//   - the amount is the ONLY field of the request that carries money; the currency never does, it comes from the case
//     row (D-14), and so does the cap (100% of what was booked or paid, base_minor);
//   - the schema is strict, so an unknown field (a currency in particular) is a 400;
//   - the amount is locked on the case at the first click (lib/payments/fee.ts lockFeeAmount), and the Stripe keys derive
//     from the case id and the attempt, never from the amount.
//
// Guard order (project API patterns): enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400)
// -> JSON parse (400) -> strict schema (400) -> booking (404) -> business rules (422) -> engine (409 while busy).

const MAX_BODY_BYTES = 8_192
const NOTE_MIN_NO_SHOW = 10

const idSchema = z.string().uuid()

const bodySchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('charge'),
    amount_minor: z.number().int().positive(),
    reason: z.string().max(500).optional(),
    contact_note: z.string().max(1000).optional(),
  }),
  z.strictObject({ action: z.literal('waive'), reason: z.string().trim().min(1).max(500) }),
  z.strictObject({ action: z.literal('charge_saved_card'), note: z.string().trim().min(1).max(500) }),
  z.strictObject({ action: z.literal('mark_cash_settled') }),
  z.strictObject({ action: z.literal('reopen_cash'), note: z.string().trim().min(1).max(500) }),
])

type FeeBody = z.infer<typeof bodySchema>

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })
const notAllowed = () => NextResponse.json({ error: 'action_not_allowed' }, { status: 422 })

async function loadBooking(bookingId: string): Promise<{ booking: Record<string, unknown> | null; failed: boolean }> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (error) return { booking: null, failed: true }
  return { booking: (data as Record<string, unknown> | null) ?? null, failed: false }
}

/** engine answer -> HTTP answer. */
function respond(result: FeeChargeResult | { error: 'refund_failed' }): NextResponse {
  if ('outcome' in result) return NextResponse.json({ outcome: result.outcome })
  switch (result.error) {
    case 'amount_locked':
    case 'payment_busy':
      return NextResponse.json({ error: result.error }, { status: 409 })
    case 'refund_failed':
      return NextResponse.json({ error: 'refund_failed' }, { status: 502 })
    default:
      return notAllowed()
  }
}

async function handleCharge(
  booking: Record<string, unknown>,
  bookingId: string,
  body: Extract<FeeBody, { action: 'charge' }>,
  actor: LedgerActor,
): Promise<NextResponse> {
  if (!allowedPaymentActions(booking).includes('charge_fee')) return notAllowed()
  const caseRow = await loadFeeCase(bookingId)
  if (!caseRow || caseRow.status !== 'pending') return notAllowed()

  // D-14: the cap and the currency come from the case row, never from the request.
  if (body.amount_minor > caseRow.base_minor) {
    return NextResponse.json({ error: 'amount_above_cap' }, { status: 422 })
  }
  // D-13: a no-show is charged only after the operator tried to reach the client, and wrote it down.
  const contactNote = body.contact_note?.trim() ?? ''
  if (caseRow.kind === 'no_show' && contactNote.length < NOTE_MIN_NO_SHOW) {
    return NextResponse.json({ error: 'note_required' }, { status: 422 })
  }
  const reason = body.reason?.trim()

  const result = await runFeeCharge({
    booking,
    caseRow,
    amountMinor: body.amount_minor,
    actor,
    ...(reason ? { reason } : {}),
    ...(contactNote ? { contactNote } : {}),
  })
  return respond(result)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // 1. Body size: the header check, then the real length (a chunked body carries no content-length).
  const bodyCheck = enforceMaxBody(request, MAX_BODY_BYTES)
  if (bodyCheck) return bodyCheck

  // 2. Admin guard
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

  // 5. Booking (404). Rules that need the case or the row follow (422).
  const { booking, failed } = await loadBooking(bookingId)
  if (failed) return NextResponse.json({ error: 'Failed to load booking' }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const actor: LedgerActor = { type: 'admin', id: user.id }

  // 6. Engine (409 while busy). Ids only in the log: no names, notes or provider messages.
  try {
    switch (body.action) {
      case 'charge':
        return await handleCharge(booking, bookingId, body, actor)
      default:
        return notAllowed()
    }
  } catch {
    console.error('[admin/bookings/[id]/fee] action failed', { bookingId, action: body.action })
    return NextResponse.json({ error: 'Payment action failed' }, { status: 500 })
  }
}
