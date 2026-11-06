// The payment tick (Phase 88, plan 88-11; HOLD-02, D-08).
//
// One idempotent catch-up pass with two triggers (app/api/cron/payment-tick: the daily Vercel cron and the
// 15-minute QStash schedule). Selection is always "due", never "due exactly now": hold_at <= now() with a
// SKIP LOCKED claim and a lease, so a missed run is caught up by the next one and two overlapping runs can
// never place the same hold twice.
//
// Steps are isolated like the outbox sweep: a step that throws adds its code to `errors` and the next step still
// runs. Registered steps, in order: A (place due holds), B (the one automatic retry of a declined hold / charge,
// D-13), C (settle completed trips, 88-13), D (operator alerts 24 h before pickup and before a hold lapses, D-15),
// E (reconcile stuck checkouts, card and cash) and F (re-drive undelivered failure notices, 88-REVIEW A-WR-10), then
// Phase 89's R (fee cases: one reminder per undecided case, D-15; finish a fee or cash card charge a crash interrupted;
// close a case whose money arrived).
//
// Step R never decides anything: it opens no case, charges nothing a person did not ask for (a re-drive needs the
// charge_requested_at an operator click set, T-89-45), cancels no booking (D-19) and has no code path for a cash booking
// whose driver has not confirmed (D-21).
//
// Nothing here asks whether the client-facing card flow is switched on: bookings that already hold a card keep
// their lifecycle whatever the owner's switch says now (D-09a, tests/payment-state-writers-gate.test.ts).

import type Stripe from 'stripe'
import { CALENDAR_ACTIVE_STATUSES } from '@/lib/booking-status'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import {
  CHECKOUT_RECONCILE_MAX_AGE_MS,
  EXPIRING_HOLD_ALERT_MS,
  HOLD_CLAIM_LIMIT,
  LEASE_SEARCH_AFTER_MS,
  LEASE_SECONDS,
  NO_VALID_HOLD_ALERT_MS,
  STALE_CHECKOUT_MS,
} from '@/lib/payments/config'
import { claimForHold, placeHold } from '@/lib/payments/hold'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { markFeeCharged, unlockFeeAmount, type FeeCaseRow } from '@/lib/payments/fee'
import { handlePaymentFailure, type FailurePhase } from '@/lib/payments/recovery'
import { settleBooking } from '@/lib/payments/settle'
import { claimDueHolds, paymentEventRecorded, type LedgerActor } from '@/lib/payments/state'
import { getPaymentsStripe } from '@/lib/payments/stripe'
import { applyHoldNowAuthorized, applySetupSucceeded } from '@/lib/stripe-webhook/card-confirm'

export type TickStepCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'R'

export type TickCounts = Record<string, number>

export interface TickContext {
  now: Date
  /** A step records a per-row problem here without aborting the rest of its rows. */
  errors: Set<string>
}

export interface TickStep {
  code: TickStepCode
  run: (ctx: TickContext) => Promise<Partial<TickCounts>>
}

export type TickResult = {
  ok: true
  placed: number
  captured: number
  failed: number
  reconciled: number
  errors: string[]
} & Record<
  string,
  number | string[] | true
>

const TICK_ACTOR: LedgerActor = { type: 'system', id: 'payment_tick' }
const RECONCILE_ACTOR: LedgerActor = { type: 'system', id: 'tick_reconcile' }
const SWEEP_ACTOR: LedgerActor = { type: 'system', id: 'tick_sweep' }
const RETRY_ACTOR: LedgerActor = { type: 'system', id: 'payment_retry' }
/**
 * Statuses of a booking whose trip is still ahead: the ones the scheduled-hold claim (migration 085) works on. Derived
 * from the shared vocabulary (tests/booking-status-parity.test.ts forbids a hand-written list): the calendar-active
 * statuses without the trip-in-progress and finished ones.
 */
const ACTIVE_STATUSES: string[] = [...CALENDAR_ACTIVE_STATUSES].filter(
  (s) => s !== 'on_board' && s !== 'completed' && s !== 'no_show',
)
/** A checkout_pending booking this old, inside 24 h of pickup, has no card on file in practice: alert (D-15). */
const PENDING_CHECKOUT_ALERT_AGE_MS = 30 * 60_000
/** Checkouts examined per run (oldest first); the rest wait for the next run. */
const RECONCILE_LIMIT = 50

/**
 * Step A: claim the due holds ONE AT A TIME and place them one after the other (sequential Stripe calls, T-88-34).
 * 88-REVIEW A-WR-01: each claim takes its own fresh lease right before its own Stripe calls. A booking that comes back
 * in the same run (a transient / configuration problem returned it to card_saved, so it is due again at once) is left
 * in its new lease and skipped: the next claim passes it by (its lease is live) and a later run retries it with the
 * same idempotency key once the lease lapses.
 */
const stepA: TickStep = {
  code: 'A',
  async run(ctx) {
    let placed = 0
    let failed = 0
    let processed = 0
    const seen = new Set<string>()
    for (let i = 0; i < HOLD_CLAIM_LIMIT * 2 && processed < HOLD_CLAIM_LIMIT; i += 1) {
      const [row] = await claimDueHolds(1, LEASE_SECONDS)
      if (!row) break
      const rowId = typeof row.id === 'string' ? row.id : ''
      if (seen.has(rowId)) continue
      seen.add(rowId)
      processed += 1
      try {
        const result = await placeHold(row, TICK_ACTOR, ctx.now)
        if (result.outcome === 'authorized') placed += 1
        else if (result.outcome === 'failed') failed += 1
      } catch {
        // One booking's problem never stops the others; its lease expires and the next run re-claims it.
        console.error('[payment-tick] hold failed unexpectedly', { bookingId: typeof row.id === 'string' ? row.id : null })
        ctx.errors.add('A')
      }
    }
    return { placed, failed }
  },
}

/**
 * Step E: a checkout_pending booking (card or cash guarantee) older than STALE_CHECKOUT_MS and younger than CHECKOUT_RECONCILE_MAX_AGE_MS
 * is looked up in Stripe; when the SetupIntent succeeded (or the hold-now PaymentIntent reached requires_capture)
 * the booking is confirmed by the very code the webhook runs. Covers a webhook that never arrived.
 */
const stepE: TickStep = {
  code: 'E',
  async run(ctx) {
    const nowMs = ctx.now.getTime()
    const { data, error } = await createSupabaseServiceClient()
      .from('bookings')
      .select('id, setup_intent_id, hold_payment_intent_id, created_at')
      .eq('payment_state', 'checkout_pending')
      // Phase 89 (89-10 hand-off): a cash booking's SetupIntent is confirmed by the very same code as a card booking's.
      .in('payment_mode', ['card_hold', 'cash_guarantee'])
      .lt('created_at', new Date(nowMs - STALE_CHECKOUT_MS).toISOString())
      .gt('created_at', new Date(nowMs - CHECKOUT_RECONCILE_MAX_AGE_MS).toISOString())
      .order('created_at', { ascending: true })
      .limit(RECONCILE_LIMIT)
    if (error) throw new Error('checkout reconcile lookup failed')

    const rows = (Array.isArray(data) ? data : []) as Array<{
      id: string
      setup_intent_id?: string | null
      hold_payment_intent_id?: string | null
    }>

    let reconciled = 0
    for (const row of rows) {
      try {
        const stripe = getPaymentsStripe()
        if (row.hold_payment_intent_id) {
          const pi = (await stripe.paymentIntents.retrieve(row.hold_payment_intent_id)) as Stripe.PaymentIntent
          if (pi.status === 'requires_capture') {
            await applyHoldNowAuthorized(pi, RECONCILE_ACTOR)
            reconciled += 1
            continue
          }
        }
        if (row.setup_intent_id) {
          const si = (await stripe.setupIntents.retrieve(row.setup_intent_id)) as Stripe.SetupIntent
          if (si.status === 'succeeded') {
            await applySetupSucceeded(si, RECONCILE_ACTOR)
            reconciled += 1
          }
        }
      } catch {
        console.error('[payment-tick] checkout reconcile failed', { bookingId: row.id })
        ctx.errors.add('E')
      }
    }
    return { reconciled }
  },
}

/**
 * Step C: the durable backstop of the completion event (Phase 87 hand-off). after() can die, so every card_hold
 * booking whose trip is completed (completed_at IS NOT NULL, never the status alone) and that is still authorized,
 * expired or card_saved is settled here, plus capturing / placing_hold rows whose lease expired (a settle or a hold
 * placement that died mid-flight).
 * A `failed` row is selected only for its FIRST post-trip settle (88-REVIEW A-WR-08): a pre-trip hold failure whose
 * retry was used, or that had no retry left (pickup too close), used to depend on the completion event alone, and
 * after() can die. Such a row is settled here once, when the ledger has no capture_started at or after completed_at;
 * any later retry of a failed charge belongs to step B. settleBooking claims each row first, so this sweep, the
 * completion event and the admin capture can never collect twice.
 */
/**
 * A-WR-08: the failed, completed rows that never had a settle after their trip (no capture_started ledger row created at
 * or after completed_at). A ledger read failure selects nothing (the next run tries again); never settles blind twice.
 */
async function failedWithoutPostTripSettle(rows: Array<{ id: string; completed_at?: string | null }>): Promise<string[]> {
  const candidates = rows.filter((r) => typeof r.id === 'string' && typeof r.completed_at === 'string')
  if (candidates.length === 0) return []
  const { data, error } = await createSupabaseServiceClient()
    .from('booking_payment_events')
    .select('booking_id, created_at')
    .in('booking_id', candidates.map((r) => r.id))
    .eq('kind', 'capture_started')
  if (error) throw new Error('settle sweep ledger lookup failed')
  const started = (Array.isArray(data) ? data : []) as Array<{ booking_id?: unknown; created_at?: unknown }>
  return candidates
    .filter((r) => {
      const doneMs = Date.parse(r.completed_at as string)
      return !started.some(
        (e) => e.booking_id === r.id && typeof e.created_at === 'string' && Date.parse(e.created_at) >= doneMs,
      )
    })
    .map((r) => r.id)
}

const stepC: TickStep = {
  code: 'C',
  async run(ctx) {
    const supabase = createSupabaseServiceClient()
    const base = () =>
      supabase
        .from('bookings')
        .select('id, completed_at')
        .eq('payment_mode', 'card_hold')
        .not('completed_at', 'is', null)
        .neq('status', 'cancelled')
        .neq('status', 'no_show')

    const nowIso = ctx.now.toISOString()
    const [waiting, stuck, stuckPlacing, failedDone] = await Promise.all([
      base().in('payment_state', ['authorized', 'expired', 'card_saved']).order('completed_at', { ascending: true }).limit(HOLD_CLAIM_LIMIT),
      base().eq('payment_state', 'capturing').lt('payment_lease_until', nowIso).order('completed_at', { ascending: true }).limit(HOLD_CLAIM_LIMIT),
      // 88-REVIEW A-WR-06: a hold placement that died near pickup (the scheduled claim only re-takes it before pickup).
      base().eq('payment_state', 'placing_hold').lt('payment_lease_until', nowIso).order('completed_at', { ascending: true }).limit(HOLD_CLAIM_LIMIT),
      base().eq('payment_state', 'failed').order('completed_at', { ascending: true }).limit(HOLD_CLAIM_LIMIT),
    ])
    if (waiting.error || stuck.error || stuckPlacing.error || failedDone.error) throw new Error('settle sweep lookup failed')
    const neverSettled = await failedWithoutPostTripSettle(
      (failedDone.data ?? []) as Array<{ id: string; completed_at?: string | null }>,
    )

    const ids: string[] = []
    for (const r of [
      ...((waiting.data ?? []) as Array<{ id: string }>),
      ...((stuck.data ?? []) as Array<{ id: string }>),
      ...((stuckPlacing.data ?? []) as Array<{ id: string }>),
      ...neverSettled.map((id) => ({ id })),
    ]) {
      if (typeof r.id === 'string' && !ids.includes(r.id)) ids.push(r.id)
    }

    let captured = 0
    let failed = 0
    for (const id of ids.slice(0, HOLD_CLAIM_LIMIT)) {
      try {
        const result = await settleBooking(id, SWEEP_ACTOR)
        if (result.outcome === 'captured') captured += 1
        else if (result.outcome === 'failed' || result.outcome === 'balance_due') failed += 1
      } catch {
        // One booking's problem never stops the others; its lease expires and the next run picks it up again.
        console.error('[payment-tick] settle failed unexpectedly', { bookingId: id })
        ctx.errors.add('C')
      }
    }
    return { captured, failed }
  },
}


/**
 * Step B (D-13): the ONE automatic retry. A card_hold booking in `failed` with payment_retry_count 0 and a
 * payment_retry_at that has passed is retried exactly once: before the trip a new hold (claimForHold + placeHold), after
 * the trip a new settle. The retry is marked used (payment_retry_count 1, payment_retry_at null) in the very
 * transition that claims the row, so two overlapping ticks can not retry twice, and a retry that fails again leaves
 * no further retry behind. A client who paid the recovery link meanwhile is `captured` (not `failed`) and is never
 * selected; a row without a retry instant (pickup too close) is never selected either. After this retry only the
 * admin Retry / Send payment link actions remain. Nothing here changes bookings.status (D-15).
 */
const stepB: TickStep = {
  code: 'B',
  async run(ctx) {
    const { data, error } = await createSupabaseServiceClient()
      .from('bookings')
      .select('id, status, completed_at')
      .eq('payment_mode', 'card_hold')
      .eq('payment_state', 'failed')
      .eq('payment_retry_count', 0)
      .lte('payment_retry_at', ctx.now.toISOString())
      .order('payment_retry_at', { ascending: true })
      .limit(HOLD_CLAIM_LIMIT)
    if (error) throw new Error('payment retry lookup failed')

    const rows = (Array.isArray(data) ? data : []) as Array<{ id: string; status?: string | null; completed_at?: string | null }>
    const used = { payment_retry_count: 1, payment_retry_at: null }

    let retried = 0
    let placed = 0
    let captured = 0
    let failed = 0
    for (const row of rows) {
      const completed =
        row.status === 'completed' ||
        (row.status !== 'cancelled' && row.status !== 'no_show' && typeof row.completed_at === 'string' && row.completed_at.length > 0)
      try {
        if (completed) {
          const result = await settleBooking(row.id, RETRY_ACTOR, { claimPatch: used })
          if (result.outcome === 'busy' || result.outcome === 'noop' || result.outcome === 'skipped') continue
          retried += 1
          if (result.outcome === 'captured') captured += 1
          else if (result.outcome === 'failed' || result.outcome === 'balance_due') failed += 1
        } else if (ACTIVE_STATUSES.includes(row.status ?? '')) {
          const claim = await claimForHold(row.id, RETRY_ACTOR, used)
          if (!claim.applied || !claim.booking) continue
          retried += 1
          const result = await placeHold(claim.booking, RETRY_ACTOR, ctx.now)
          if (result.outcome === 'authorized') placed += 1
          else if (result.outcome === 'failed') failed += 1
        }
      } catch {
        // One booking's problem never stops the others; the retry mark keeps it from being retried again.
        console.error('[payment-tick] retry failed unexpectedly', { bookingId: row.id })
        ctx.errors.add('B')
      }
    }
    return { retried, placed, captured, failed }
  },
}


/**
 * Step D (D-15): nothing cancels an unpaid card booking automatically; the operator is warned instead, once each.
 *   - pickup within NO_VALID_HOLD_ALERT_MS (24 h) and no valid hold or payment (card_saved, failed, expired,
 *     placing_hold, or checkout_pending older than 30 min): alert key alert:no_valid_hold_24h:<id>
 *   - an authorized hold whose capture_before is within EXPIRING_HOLD_ALERT_MS (12 h) on a trip that is not completed:
 *     alert key alert:hold_expiring:<id>:<hold PaymentIntent> (a replacement hold has its own PaymentIntent, so it can alert again)
 * The pickup is read through the live generated column pickup_utc (D-22). sendPaymentOperatorAlert records the ledger key
 * once the alert is delivered, so a tick that sees the same booking again sends nothing, and one whose send failed sends
 * it on the next run.
 */
const stepD: TickStep = {
  code: 'D',
  async run(ctx) {
    const supabase = createSupabaseServiceClient()
    const nowMs = ctx.now.getTime()
    const nowIso = ctx.now.toISOString()
    const horizonIso = new Date(nowMs + NO_VALID_HOLD_ALERT_MS).toISOString()

    const soon = () =>
      supabase
        .from('bookings')
        .select('*')
        .eq('payment_mode', 'card_hold')
        .in('status', ACTIVE_STATUSES)
        .gt('pickup_utc', nowIso)
        .lte('pickup_utc', horizonIso)

    const [open, pending, expiring] = await Promise.all([
      soon().in('payment_state', ['card_saved', 'failed', 'expired', 'placing_hold']).order('pickup_utc', { ascending: true }).limit(HOLD_CLAIM_LIMIT),
      soon()
        .eq('payment_state', 'checkout_pending')
        .lt('created_at', new Date(nowMs - PENDING_CHECKOUT_ALERT_AGE_MS).toISOString())
        .order('pickup_utc', { ascending: true })
        .limit(HOLD_CLAIM_LIMIT),
      supabase
        .from('bookings')
        .select('*')
        .eq('payment_mode', 'card_hold')
        .eq('payment_state', 'authorized')
        .is('completed_at', null)
        .neq('status', 'cancelled')
        .neq('status', 'no_show')
        .lte('capture_before', new Date(nowMs + EXPIRING_HOLD_ALERT_MS).toISOString())
        .order('capture_before', { ascending: true })
        .limit(HOLD_CLAIM_LIMIT),
    ])
    if (open.error || pending.error || expiring.error) throw new Error('payment alert lookup failed')

    type Row = Record<string, unknown> & { id: string }
    const asRows = (d: unknown): Row[] => (Array.isArray(d) ? (d as Row[]) : [])

    let alerts = 0
    const alertOne = async (kind: 'no_valid_hold_24h' | 'hold_expiring', row: Row, eventKey: string) => {
      try {
        const result = await sendPaymentOperatorAlert(kind, row, {
          eventKey,
          code: typeof row.last_payment_error === 'string' && row.last_payment_error ? row.last_payment_error : undefined,
        })
        if (result === 'sent') alerts += 1
      } catch {
        console.error('[payment-tick] operator alert failed unexpectedly', { bookingId: row.id, kind })
        ctx.errors.add('D')
      }
    }

    for (const row of [...asRows(open.data), ...asRows(pending.data)]) {
      await alertOne('no_valid_hold_24h', row, `alert:no_valid_hold_24h:${row.id}`)
    }
    for (const row of asRows(expiring.data)) {
      const holdPi = typeof row.hold_payment_intent_id === 'string' ? row.hold_payment_intent_id : 'none'
      await alertOne('hold_expiring', row, `alert:hold_expiring:${row.id}:${holdPi}`)
    }
    return { alerts }
  },
}

const FAILURE_ALERT_KIND: Record<FailurePhase, 'hold_failed' | 'charge_failed' | 'balance_unpaid'> = {
  hold: 'hold_failed',
  charge: 'charge_failed',
  difference: 'balance_unpaid',
  // Never read from the ledger here (a fee failure is handled by its own writer, see stepF); the map is total for the type.
  fee: 'charge_failed',
}

/** The phase and attempt of the failure that put the row where it is (null when the ledger can not tell). */
async function lastFailure(row: Record<string, unknown> & { id: string }): Promise<{ phase: FailurePhase; attempt: number } | null> {
  const counter = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0)
  if (row.payment_state === 'balance_due') return { phase: 'difference', attempt: counter(row.charge_attempts) }
  const { data, error } = await createSupabaseServiceClient()
    .from('booking_payment_events')
    .select('kind, created_at')
    .eq('booking_id', row.id)
    .in('kind', ['hold_failed', 'charge_failed'])
    .eq('to_state', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error('failure ledger lookup failed')
  const latest = (Array.isArray(data) ? data[0] : null) as { kind?: unknown } | null
  if (!latest) return null
  return latest.kind === 'hold_failed'
    ? { phase: 'hold', attempt: counter(row.hold_attempts) }
    : { phase: 'charge', attempt: counter(row.charge_attempts) }
}

/**
 * Step F (88-REVIEW A-WR-10): the failure notices of D-13 / D-14 are durable. The recovery step (link, client email,
 * operator alert) runs once, inside the failure transition's writer; a Resend outage there used to lose the email and
 * the alert for good. For a card booking still failed / balance_due whose failure is recent (inside the window in which
 * the recovery link create still replays at Stripe), the notices of that failure are looked up by their ledger keys; if
 * one of them was never delivered the recovery step runs again. It is idempotent: the link create replays the same
 * link, delivered notices are skipped by their keys, only the missing one goes out.
 */
const stepF: TickStep = {
  code: 'F',
  async run(ctx) {
    const nowMs = ctx.now.getTime()
    const { data, error } = await createSupabaseServiceClient()
      .from('bookings')
      .select('*')
      .eq('payment_mode', 'card_hold')
      .in('payment_state', ['failed', 'balance_due'])
      .neq('status', 'cancelled')
      .neq('status', 'no_show')
      // Phase 89: a row with a fee case failed on a fee (or on a cash charge) whose notices are keyed by phase 'fee'; the
      // ledger can not tell that from a trip charge, so a re-drive here would send the wrong notice for the wrong amount.
      .is('fee_case_status', null)
      .gte('payment_failed_at', new Date(nowMs - LEASE_SEARCH_AFTER_MS).toISOString())
      .order('payment_failed_at', { ascending: true })
      .limit(HOLD_CLAIM_LIMIT)
    if (error) throw new Error('failure notice lookup failed')

    let redriven = 0
    for (const row of (Array.isArray(data) ? data : []) as Array<Record<string, unknown> & { id: string }>) {
      try {
        const failure = await lastFailure(row)
        if (!failure) continue
        const kind = FAILURE_ALERT_KIND[failure.phase]
        const [emailDone, alertDone] = await Promise.all([
          paymentEventRecorded(row.id, `email:payment_failed:${row.id}:${failure.phase}:${failure.attempt}`),
          paymentEventRecorded(row.id, `alert:${kind}:${row.id}:${failure.attempt}`),
        ])
        if (emailDone && alertDone) continue
        const due = typeof row.payment_amount_minor === 'number' ? row.payment_amount_minor : 0
        const captured = typeof row.captured_amount_minor === 'number' ? row.captured_amount_minor : 0
        await handlePaymentFailure(row, {
          phase: failure.phase,
          code: typeof row.last_payment_error === 'string' && row.last_payment_error ? row.last_payment_error : 'unknown',
          amountMinor: failure.phase === 'hold' ? due : Math.max(due - captured, 0),
          attempt: failure.attempt,
        })
        redriven += 1
      } catch {
        console.error('[payment-tick] failure notice re-drive failed', { bookingId: row.id })
        ctx.errors.add('F')
      }
    }
    return { notices_redriven: redriven }
  },
}

/** A pending fee case is reminded about once it has been undecided this long (D-15), earlier when its hold ends sooner. */
const FEE_PENDING_REMINDER_MS = 24 * 60 * 60_000
/** Pending fee cases examined per run (oldest pickup first). One operator, so this is far above any real backlog. */
const FEE_CASE_LIMIT = 100

type BookingRow = Record<string, unknown> & { id: string }
interface PendingFee {
  booking: BookingRow
  caseRow: FeeCaseRow
}

/**
 * The bookings that carry a pending fee case (bookings.fee_case_status is the database mirror of the case status) paired
 * with their case through a second query by booking id. A booking without a readable pending case is dropped.
 */
async function loadPendingFees(): Promise<PendingFee[]> {
  const db = createSupabaseServiceClient()
  const { data, error } = await db
    .from('bookings')
    .select('*')
    .eq('fee_case_status', 'pending')
    .order('pickup_utc', { ascending: true })
    .limit(FEE_CASE_LIMIT)
  if (error) throw new Error('fee case booking lookup failed')
  const bookings = (Array.isArray(data) ? data : []) as BookingRow[]
  if (bookings.length === 0) return []

  const cases = await db
    .from('booking_fee_cases')
    .select('*')
    .in('booking_id', bookings.map((b) => b.id))
    .eq('status', 'pending')
  if (cases.error) throw new Error('fee case lookup failed')
  const byBooking = new Map<string, FeeCaseRow>()
  for (const c of (Array.isArray(cases.data) ? cases.data : []) as FeeCaseRow[]) byBooking.set(c.booking_id, c)

  const out: PendingFee[] = []
  for (const booking of bookings) {
    const caseRow = byBooking.get(booking.id)
    if (caseRow) out.push({ booking, caseRow })
  }
  return out
}

const evidenceNumber = (c: FeeCaseRow, key: string): number | undefined => {
  const v = (c.evidence as Record<string, unknown> | null)?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
const evidenceInstant = (c: FeeCaseRow, key: string): string | undefined => {
  const v = (c.evidence as Record<string, unknown> | null)?.[key]
  return typeof v === 'string' && v ? v : undefined
}

/** D-15: undecided for 24 h, or the hold of the booking ends within the expiring-hold window, whichever comes first. */
function reminderDue({ booking, caseRow }: PendingFee, nowMs: number): boolean {
  const openedMs = Date.parse(caseRow.opened_at)
  if (Number.isFinite(openedMs) && openedMs <= nowMs - FEE_PENDING_REMINDER_MS) return true
  // A hold that is still live ends at capture_before; a row that holds nothing has no earlier deadline.
  if (booking.payment_state !== 'authorized' || typeof booking.capture_before !== 'string') return false
  const endsMs = Date.parse(booking.capture_before)
  return Number.isFinite(endsMs) && endsMs <= nowMs + EXPIRING_HOLD_ALERT_MS
}

const isMinor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
const isLapsedLease = (b: BookingRow, nowMs: number): boolean =>
  typeof b.payment_lease_until === 'string' && Date.parse(b.payment_lease_until) < nowMs

async function reloadBooking(fallback: BookingRow): Promise<BookingRow> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', fallback.id).maybeSingle()
  return !error && data ? (data as BookingRow) : fallback
}

/** A mail problem never undoes collected money; the ledger event key makes a repeat a no-op. */
async function sendReceipt(args: Parameters<typeof sendPaymentEmail>[0]): Promise<void> {
  try {
    await sendPaymentEmail(args)
  } catch {
    console.error('[payment-tick] fee receipt email failed', { bookingId: String(args.booking.id), kind: args.kind })
  }
}

/**
 * The fee is collected: close the case as charged (conditional on pending, so a replay changes nothing) and send the
 * receipt once. Same wording as the operator's own click (lib/payments/fee.ts); the operator who chose the amount is on
 * record in the admin_action ledger row of that click, the sweep only stamps itself as the one that closed the case.
 */
async function closeFeeCase({ booking, caseRow }: PendingFee, amountMinor: number): Promise<void> {
  await markFeeCharged(caseRow.id, { decidedBy: SWEEP_ACTOR.id ?? 'tick_sweep', decidedMinor: amountMinor })
  await sendReceipt({
    kind: 'fee_charged',
    variant: caseRow.kind === 'no_show' ? 'no_show' : 'late_cancel',
    booking: await reloadBooking(booking),
    eventKey: `email:fee_charged:${caseRow.id}`,
    feeMinor: amountMinor,
    ...(caseRow.free_until ? { freeUntil: caseRow.free_until } : {}),
  })
}

/**
 * A fee charge an operator started (the amount is locked on the case: charge_requested_at + decided_minor) whose settle
 * died: the row sits in `capturing` and its lease ran out. The very same settle runs again with the amount from the locked
 * case, so the attempt number and with it the Stripe key (feecap: / fee:<caseId>:<attempt>) are the interrupted attempt's.
 * Returns what happened: 'finished' (collected and closed), 'declined' (the card said no; the amount is unlocked, the
 * failure step of settle has told the client and the operator), or 'waiting' (busy, transient: the next tick repeats it).
 */
async function redriveFee(item: PendingFee): Promise<'finished' | 'declined' | 'waiting'> {
  const { booking, caseRow } = item
  const amountMinor = caseRow.decided_minor as number
  const result = await settleBooking(booking.id, SWEEP_ACTOR, {
    collect: { kind: 'fee', caseId: caseRow.id, amountMinor, feeLabel: caseRow.kind === 'no_show' ? 'no_show' : 'cancellation' },
  })
  switch (result.outcome) {
    case 'captured':
      await closeFeeCase(item, amountMinor)
      return 'finished'
    case 'failed':
    case 'balance_due':
      await unlockFeeAmount(caseRow.id)
      return 'declined'
    case 'noop': {
      // The money arrived in an earlier run whose answer was lost before the case was closed.
      const fresh = await reloadBooking(booking)
      if (result.code === 'captured' && fresh.payment_state === 'captured' && fresh.captured_amount_minor === amountMinor) {
        await closeFeeCase(item, amountMinor)
        return 'finished'
      }
      return 'waiting'
    }
    default:
      return 'waiting'
  }
}

/**
 * A cash booking's card charge (D-21) an operator started and a crash interrupted: the row sits in `capturing` with a
 * lapsed lease and has no fee case. The same settle runs again (the ordinary chg:<id>:<attempt> key) and the receipt goes
 * out once. A cash row nobody started charging is in card_saved / cash_settled and never selected: no code path charges it.
 */
async function redriveCashCard(booking: BookingRow): Promise<boolean> {
  const result = await settleBooking(booking.id, SWEEP_ACTOR, { collect: { kind: 'cash_card' } })
  if (result.outcome !== 'captured') return false
  const fresh = await reloadBooking(booking)
  const completed = fresh.status === 'completed' || (typeof fresh.completed_at === 'string' && fresh.completed_at.length > 0)
  await sendReceipt({
    kind: 'fee_charged',
    variant: completed ? 'cash_unpaid' : 'cash_card',
    booking: fresh,
    eventKey: `email:fee_charged:${booking.id}`,
  })
  return true
}

/**
 * Step R (Phase 89; D-15, D-19, D-21; CASH-03, HOLD-06): the background half of the operator decision on a fee case.
 *   1. a fee charge interrupted mid-flight (case locked by an operator click, row capturing, lease lapsed) is finished with
 *      the same keys; a decline unlocks the amount and nothing is charged again without a person;
 *   2. a case whose money arrived (row captured for exactly the locked fee) but was not closed is closed, no Stripe call;
 *   3. a cash card charge interrupted the same way is finished;
 *   4. one fee_pending_24h reminder per case still pending after 24 h, earlier when the hold ends sooner (key
 *      alert:fee_pending:<caseId>, recorded once delivered). It only tells the operator.
 * Selection of 1, 2 and 4 starts from bookings.fee_case_status, so a booking without a case (an unpaid booking, a
 * completed cash booking the driver never confirmed) is never looked at: no case, no reminder, no status change (D-19, D-21).
 * Each row is isolated; a problem adds 'R' to the errors and the next row still runs.
 */
const stepR: TickStep = {
  code: 'R',
  async run(ctx) {
    const nowMs = ctx.now.getTime()
    const pending = await loadPendingFees()

    let finished = 0
    let repaired = 0
    const closed = new Set<string>()
    for (const item of pending) {
      const { booking, caseRow } = item
      // T-89-45: only a charge a person asked for (amount locked on the case) is ever finished or closed here.
      if (!caseRow.charge_requested_at || !isMinor(caseRow.decided_minor)) continue
      try {
        const collectable = booking.payment_mode === 'card_hold' || booking.payment_mode === 'cash_guarantee'
        if (collectable && booking.payment_state === 'capturing' && isLapsedLease(booking, nowMs)) {
          if ((await redriveFee(item)) === 'finished') {
            finished += 1
            closed.add(caseRow.id)
          }
        } else if (booking.payment_state === 'captured' && booking.captured_amount_minor === caseRow.decided_minor) {
          await closeFeeCase(item, caseRow.decided_minor)
          repaired += 1
          closed.add(caseRow.id)
        }
      } catch {
        console.error('[payment-tick] fee case re-drive failed unexpectedly', { bookingId: booking.id })
        ctx.errors.add('R')
      }
    }

    // The cash card charge has no case; its only marker is the row in `capturing`.
    const cash = await createSupabaseServiceClient()
      .from('bookings')
      .select('*')
      .eq('payment_mode', 'cash_guarantee')
      .eq('payment_state', 'capturing')
      .is('fee_case_status', null)
      .lt('payment_lease_until', ctx.now.toISOString())
      .order('payment_lease_until', { ascending: true })
      .limit(HOLD_CLAIM_LIMIT)
    if (cash.error) throw new Error('cash card charge lookup failed')
    for (const booking of (Array.isArray(cash.data) ? cash.data : []) as BookingRow[]) {
      try {
        if (await redriveCashCard(booking)) finished += 1
      } catch {
        console.error('[payment-tick] cash card charge re-drive failed unexpectedly', { bookingId: booking.id })
        ctx.errors.add('R')
      }
    }

    let reminders = 0
    for (const item of pending) {
      const { booking, caseRow } = item
      try {
        if (closed.has(caseRow.id) || !reminderDue(item, nowMs)) continue
        const noShow = caseRow.kind === 'no_show'
        const result = await sendPaymentOperatorAlert('fee_pending_24h', booking, {
          eventKey: `alert:fee_pending:${caseRow.id}`,
          proposedMinor: caseRow.proposed_minor,
          freeUntil: caseRow.free_until,
          openedAt: caseRow.opened_at,
          ...(noShow
            ? {
                arrivedAt: evidenceInstant(caseRow, 'on_location_at'),
                requestedAt: evidenceInstant(caseRow, 'requested_at'),
                thresholdMin: evidenceNumber(caseRow, 'threshold_min'),
              }
            : { cancelledAt: caseRow.opened_at }),
        })
        if (result === 'sent') reminders += 1
      } catch {
        console.error('[payment-tick] fee reminder failed unexpectedly', { bookingId: booking.id })
        ctx.errors.add('R')
      }
    }
    return { fee_reminders: reminders, fees_finished: finished, fee_cases_repaired: repaired }
  },
}

export const TICK_STEPS: TickStep[] = [stepA, stepB, stepC, stepD, stepE, stepF, stepR]

/** Never throws: every step is isolated and the result always carries the counts and the failed step codes. */
export async function runPaymentTick(now: Date = new Date()): Promise<TickResult> {
  const ctx: TickContext = { now, errors: new Set<string>() }
  const counts: TickCounts = { placed: 0, captured: 0, failed: 0, reconciled: 0 }

  for (const step of TICK_STEPS) {
    try {
      const out = await step.run(ctx)
      for (const [key, value] of Object.entries(out)) {
        if (typeof value === 'number') counts[key] = (counts[key] ?? 0) + value
      }
    } catch {
      console.error('[payment-tick] step failed', { step: step.code })
      ctx.errors.add(step.code)
    }
  }

  return { ok: true, ...counts, errors: [...ctx.errors] } as TickResult
}
