import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { allowedPaymentActions, runPaymentAction, toPaymentFacts } from '@/lib/payments/actions'

// Admin payment API of a card-hold booking (Phase 88, plan 88-15; HOLD-07, PAYF-01), the data source and the action
// endpoint of components/admin/PaymentPanel.tsx (contract: plan 88-07).
//
//   GET   -> { payment, allowed_actions, refund_failed, events, events_total }
//   POST  { action } -> 200 { outcome: 'ok' | 'declined' } | 409 { error: 'payment_busy' } | 422 { error: 'action_not_allowed' }
//
// Guard order (project API patterns): enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400)
// -> JSON parse (400) -> strict schema on the action (400) -> booking (404) -> action allowed (422) -> engine
// (409 while busy). The request never carries an amount: the engine derives every amount from the booking row.

const MAX_BODY_BYTES = 2_048
const EVENT_LIMIT = 100

const idSchema = z.string().uuid()

// Strict objects: { action } is the whole body, an extra field (an amount in particular) is a 400.
const actionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('capture') }),
  z.strictObject({ action: z.literal('retry') }),
  z.strictObject({ action: z.literal('release') }),
  z.strictObject({ action: z.literal('waive') }),
  z.strictObject({ action: z.literal('send_link') }),
])

const EVENT_COLUMNS = 'id, created_at, kind, amount_minor, currency, actor_type, actor_id, error_code'

interface LedgerRow {
  id: number
  created_at: string
  kind: string
  amount_minor: number | null
  currency: string | null
  actor_type: 'system' | 'webhook' | 'admin'
  actor_id: string | null
  error_code: string | null
}

/** Only the contract fields of a ledger row: event keys and Stripe object ids never reach the browser. */
function toEvent(r: LedgerRow) {
  return {
    id: r.id,
    created_at: r.created_at,
    kind: r.kind,
    amount_minor: r.amount_minor ?? null,
    currency: r.currency ?? null,
    actor_type: r.actor_type,
    actor_id: r.actor_id ?? null,
    error_code: r.error_code ?? null,
  }
}

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

async function loadBooking(bookingId: string): Promise<{ booking: Record<string, unknown> | null; failed: boolean }> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (error) return { booking: null, failed: true }
  return { booking: (data as Record<string, unknown> | null) ?? null, failed: false }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()

  const { id: bookingId } = await params
  if (!idSchema.safeParse(bookingId).success) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
  }

  const { booking, failed } = await loadBooking(bookingId)
  if (failed) return NextResponse.json({ error: 'Failed to load booking' }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const supabase = createSupabaseServiceClient()
  const [events, refundFailed] = await Promise.all([
    supabase
      .from('booking_payment_events')
      .select(EVENT_COLUMNS, { count: 'exact' })
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(EVENT_LIMIT),
    // Asked separately: a refund failure older than the 100 newest rows must still raise the flag (D-20).
    supabase.from('booking_payment_events').select('id').eq('booking_id', bookingId).eq('kind', 'refund_failed').limit(1),
  ])
  if (events.error || refundFailed.error) {
    console.error('[admin/bookings/[id]/payment] ledger read failed', { bookingId })
    return NextResponse.json({ error: 'Failed to load payment history' }, { status: 500 })
  }

  const rows = (Array.isArray(events.data) ? events.data : []) as unknown as LedgerRow[]
  return NextResponse.json({
    payment: toPaymentFacts(booking),
    allowed_actions: allowedPaymentActions(booking),
    refund_failed: Array.isArray(refundFailed.data) && refundFailed.data.length > 0,
    events: rows.map(toEvent),
    events_total: typeof events.count === 'number' ? events.count : rows.length,
  })
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

  // 4. JSON parse (400), then the strict action schema (400)
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }
  const { action } = parsed.data

  // 5. Booking (404), then the server-side action matrix (422)
  const { booking, failed } = await loadBooking(bookingId)
  if (failed) return NextResponse.json({ error: 'Failed to load booking' }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  if (!allowedPaymentActions(booking).includes(action)) {
    return NextResponse.json({ error: 'action_not_allowed' }, { status: 422 })
  }

  // 6. Engine (admin_action ledger row first, then the CAS-guarded money step). 409 while a worker holds the row.
  try {
    const result = await runPaymentAction(booking, action, { id: user.id })
    if (result.status === 200) return NextResponse.json({ outcome: result.outcome })
    return NextResponse.json({ error: result.error }, { status: result.status })
  } catch {
    // Ids only: no names, emails or provider messages in the log.
    console.error('[admin/bookings/[id]/payment] action failed', { bookingId, action })
    return NextResponse.json({ error: 'Payment action failed' }, { status: 500 })
  }
}
