import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { allowedPaymentActions, runPaymentAction, toPaymentFacts } from '@/lib/payments/actions'
import { feeLockIsLive, isMoneyCollected, loadFeeCase, REFUND_RESOLVED, type FeeCaseRow } from '@/lib/payments/fee'
import { payNowCaseMissing } from '@/lib/payments/fee-reopen'
import { LEASE_SECONDS } from '@/lib/payments/config'
import { isExtraChargeEligible, loadExtraContext, type ExtraContext } from '@/lib/payments/extra'
import { appendPaymentEvent } from '@/lib/payments/state'

// Admin payment API of a card-hold booking (Phase 88, plan 88-15; HOLD-07, PAYF-01), the data source and the action
// endpoint of components/admin/PaymentPanel.tsx (contract: plan 88-07).
//
//   GET   -> { payment, allowed_actions, refund_failed, events, events_total, fee_case, cash, extra }
//         (Phase 91-11: allowed_actions also names charge_extra when isExtraChargeEligible says so; extra = { eligible, reason,
//         in_flight, charges } for the "Add extra charge" dialog and list. It is executed by POST /extra.)
//         (Phase 89: fee_case = the late-cancel / no-show case with the operator's reason and contact note, cash = the
//         cash facts and notes of a cash booking. This route is admin-only, so operator text may appear here and nowhere
//         else: never in the ledger rows above, never on a client page or mail. allowed_actions also names the five
//         Phase 89 decisions; they are executed by POST /api/admin/bookings/[id]/fee, and this route's POST schema still
//         refuses them and every amount.)
//   POST  { action } -> 200 { outcome: 'ok' | 'declined' } | 409 { error: 'payment_busy' } | 422 { error: 'action_not_allowed' }
//   POST  { action: 'resolve_refund' } -> 200 { outcome: 'ok' } | 422: the operator confirms an open refund failure was
//         handled by hand in Stripe (88-REVIEW C-WR-05). Any payment mode; it moves no money, it writes one audit row.
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
  z.strictObject({ action: z.literal('resolve_refund') }),
])


/**
 * A refund failure is open when the newest refund_failed row is newer than the newest "refund resolved" admin row.
 * The ledger is append-only, so a resolution is a later row, never a deletion (created_at, then id, decides).
 */
async function refundFailureOpen(bookingId: string): Promise<boolean> {
  const supabase = createSupabaseServiceClient()
  const newest = (kind: string, errorCode?: string) => {
    let q = supabase.from('booking_payment_events').select('id, created_at').eq('booking_id', bookingId).eq('kind', kind)
    if (errorCode) q = q.eq('error_code', errorCode)
    return q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1)
  }
  const [failed, resolved] = await Promise.all([newest('refund_failed'), newest('admin_action', REFUND_RESOLVED)])
  if (failed.error || resolved.error) throw new Error('refund ledger read failed')
  type Row = { id?: number; created_at?: string }
  const lastFailed = (Array.isArray(failed.data) ? failed.data[0] : null) as Row | null
  if (!lastFailed) return false
  const lastResolved = (Array.isArray(resolved.data) ? resolved.data[0] : null) as Row | null
  if (!lastResolved) return true
  const f = Date.parse(lastFailed.created_at ?? '')
  const r = Date.parse(lastResolved.created_at ?? '')
  if (Number.isFinite(f) && Number.isFinite(r) && r !== f) return f > r
  return (lastFailed.id ?? 0) > (lastResolved.id ?? 0)
}

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

/** The fee case as the panel needs it. Operator text (reason, contact note) is admin-only, see the header. */
function toFeeCaseFacts(c: FeeCaseRow) {
  return {
    kind: c.kind,
    status: c.status,
    currency: c.currency,
    proposed_minor: c.proposed_minor,
    base_minor: c.base_minor,
    // The amount actually charged: only once the case is charged (decided_minor is also the lock of a charge in flight).
    charged_minor: c.status === 'charged' ? c.decided_minor : null,
    // A lock whose request can no longer be running is no charge in flight: the waive takes it over (money CR-04).
    charge_in_flight: c.status === 'pending' && feeLockIsLive(c),
    free_until: c.free_until,
    opened_at: c.opened_at,
    decided_by: c.decided_by,
    decided_at: c.decided_at,
    reason: c.reason,
    contact_note: c.contact_note,
    evidence: c.evidence ?? {},
  }
}

/**
 * The extra charges of the booking as the panel needs them (Phase 91-11, EXTRA-01), built field by field: no Stripe id, no
 * requester id, no row spill. The description is the operator's text and the client's receipt line, shown here to admins only.
 * `resumable` mirrors the engine's lease (lib/payments/extra.ts measures it from updated_at, which a resume bumps).
 */
function toExtraFacts(booking: Record<string, unknown>, ctx: ExtraContext | null) {
  if (!ctx) return { eligible: false, reason: null, in_flight: null, charges: [] }
  const verdict = isExtraChargeEligible(booking, ctx)
  const inFlight = ctx.inFlight
  const touched = inFlight ? Date.parse(inFlight.updated_at ?? inFlight.requested_at) : NaN
  return {
    eligible: verdict.ok,
    reason: verdict.ok ? null : verdict.reason,
    in_flight: inFlight
      ? {
          id: inFlight.id,
          kind: inFlight.kind,
          amount_minor: inFlight.amount_minor,
          currency: inFlight.currency,
          requested_at: inFlight.requested_at,
          resumable: Number.isFinite(touched) && Date.now() - touched >= LEASE_SECONDS * 1000,
        }
      : null,
    charges: ctx.charges.map((c) => ({
      id: c.id,
      kind: c.kind,
      status: c.status,
      amount_minor: c.amount_minor,
      currency: c.currency,
      minutes: c.minutes ?? null,
      description: c.description ?? null,
      requested_at: c.requested_at,
      charged_at: c.charged_at ?? null,
      last_error_code: c.last_error_code ?? null,
    })),
  }
}

interface NoteRow {
  kind: string
  note: string
  created_by: string | null
  created_at: string
}

/**
 * The cash facts of a cash booking (UI-SPEC Surface 5). `unconfirmed` is information only: a completed trip whose cash
 * nobody confirmed (D-21: nothing happens automatically because of it). `confirmed_by` is read from the newest
 * cash_settled ledger row while the booking is settled: the driver tap (system actor driver_trip) or an operator.
 */
async function loadCashFacts(booking: Record<string, unknown>, bookingId: string) {
  const supabase = createSupabaseServiceClient()
  const settled = booking.payment_state === 'cash_settled'
  const [confirmation, notes] = await Promise.all([
    settled
      ? supabase
          .from('booking_payment_events')
          .select('actor_type, actor_id, created_at')
          .eq('booking_id', bookingId)
          .eq('kind', 'cash_settled')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('booking_payment_notes')
      .select('kind, note, created_by, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true }),
  ])
  if (confirmation.error || notes.error) throw new Error('cash facts read failed')

  const last = (Array.isArray(confirmation.data) ? confirmation.data[0] : null) as
    | { actor_type?: string; actor_id?: string | null; created_at?: string }
    | null
  const confirmedBy = !last ? null : last.actor_type === 'admin' ? 'admin' : last.actor_id === 'driver_trip' ? 'driver' : 'system'
  return {
    unconfirmed: booking.status === 'completed' && booking.payment_state === 'card_saved',
    confirmed_by: confirmedBy,
    confirmed_at: last?.created_at ?? null,
    notes: ((Array.isArray(notes.data) ? notes.data : []) as unknown as NoteRow[]).map((n) => ({
      kind: n.kind,
      note: n.note,
      created_by: n.created_by ?? null,
      created_at: n.created_at,
    })),
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
  // Asked separately: a refund failure older than the 100 newest rows must still raise the flag (D-20); a later
  // "refund resolved" row clears it (C-WR-05).
  const isCash = booking.payment_mode === 'cash_guarantee'
  const [events, refundOpen, feeCase, cash, extraCtx] = await Promise.all([
    supabase
      .from('booking_payment_events')
      .select(EVENT_COLUMNS, { count: 'exact' })
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(EVENT_LIMIT),
    refundFailureOpen(bookingId).catch(() => null),
    loadFeeCase(bookingId).catch(() => undefined),
    isCash ? loadCashFacts(booking, bookingId).catch(() => undefined) : Promise.resolve(null),
    // Phase 91-11: a failed extras read must not take the whole panel down; it only hides the extra action (null).
    loadExtraContext(bookingId).catch(() => {
      console.error('[admin/bookings/[id]/payment] extra context read failed', { bookingId })
      return null
    }),
  ])
  if (events.error || refundOpen === null || feeCase === undefined || cash === undefined) {
    console.error('[admin/bookings/[id]/payment] ledger read failed', { bookingId })
    return NextResponse.json({ error: 'Failed to load payment history' }, { status: 500 })
  }

  const rows = (Array.isArray(events.data) ? events.data : []) as unknown as LedgerRow[]
  const allowed = allowedPaymentActions(booking)
  // Money CR-04: a failed refund of a pending case can be closed once the operator settled it by hand.
  const closable = refundOpen && feeCase?.status === 'pending' && allowed.includes('waive_fee') && isMoneyCollected(booking, feeCase)
  // Money WR-02: a cancelled or no-show pay-now row whose case failed to open. Its alert is the marker: any other closed pay-now
  // row was refunded or holds nothing, and offering a fee there would only be noise (money review 2, IN-01).
  const caseMissing = !feeCase && (await payNowCaseMissing(booking))
  // Phase 91-11 (D-15): the operator's extra charge is offered only when the engine's own eligibility says so.
  const extra = toExtraFacts(booking, extraCtx)
  return NextResponse.json({
    payment: toPaymentFacts(booking),
    allowed_actions: [
      ...allowed,
      ...(closable ? ['close_refunded'] : []),
      ...(caseMissing ? ['open_fee_case'] : []),
      ...(extra.eligible ? ['charge_extra'] : []),
    ],
    refund_failed: refundOpen,
    events: rows.map(toEvent),
    events_total: typeof events.count === 'number' ? events.count : rows.length,
    fee_case: feeCase ? toFeeCaseFacts(feeCase) : null,
    cash,
    extra,
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

  // C-WR-05: the operator closes a refund failure they handled in the Stripe Dashboard. Any payment mode (a pay-now
  // refund can fail too); allowed only while a failure is open; one admin_action audit row, no money moves.
  if (action === 'resolve_refund') {
    try {
      if (!(await refundFailureOpen(bookingId))) return NextResponse.json({ error: 'action_not_allowed' }, { status: 422 })
      await appendPaymentEvent(bookingId, {
        key: `refund_resolved:${bookingId}:${Date.now()}`,
        kind: 'admin_action',
        errorCode: REFUND_RESOLVED,
        actor: { type: 'admin', id: user.id },
      })
      return NextResponse.json({ outcome: 'ok' })
    } catch {
      console.error('[admin/bookings/[id]/payment] refund resolution failed', { bookingId })
      return NextResponse.json({ error: 'Payment action failed' }, { status: 500 })
    }
  }

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
