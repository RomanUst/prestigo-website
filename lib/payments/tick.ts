// The payment tick (Phase 88, plan 88-11; HOLD-02, D-08).
//
// One idempotent catch-up pass with two triggers (app/api/cron/payment-tick: the daily Vercel cron and the
// 15-minute QStash schedule). Selection is always "due", never "due exactly now": hold_at <= now() with a
// SKIP LOCKED claim and a lease, so a missed run is caught up by the next one and two overlapping runs can
// never place the same hold twice.
//
// Steps are isolated like the outbox sweep: a step that throws adds its code to `errors` and the next step still
// runs. Registered steps, in order: A (place due holds), B (the one automatic retry of a declined hold / charge,
// D-13), C (settle completed trips, 88-13), D (operator alerts 24 h before pickup and before a hold lapses, D-15)
// and E (reconcile stuck checkouts).
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
  LEASE_SECONDS,
  NO_VALID_HOLD_ALERT_MS,
  STALE_CHECKOUT_MS,
} from '@/lib/payments/config'
import { claimForHold, placeHold } from '@/lib/payments/hold'
import { settleBooking } from '@/lib/payments/settle'
import { claimDueHolds, type LedgerActor } from '@/lib/payments/state'
import { getPaymentsStripe } from '@/lib/payments/stripe'
import { applyHoldNowAuthorized, applySetupSucceeded } from '@/lib/stripe-webhook/card-confirm'

export type TickStepCode = 'A' | 'B' | 'C' | 'D' | 'E'

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

/** Step A: claim the due holds and place them one after the other (sequential Stripe calls, T-88-34). */
const stepA: TickStep = {
  code: 'A',
  async run(ctx) {
    const rows = await claimDueHolds(HOLD_CLAIM_LIMIT, LEASE_SECONDS)
    let placed = 0
    let failed = 0
    for (const row of rows) {
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
 * Step E: a checkout_pending booking older than STALE_CHECKOUT_MS and younger than CHECKOUT_RECONCILE_MAX_AGE_MS
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
      .eq('payment_mode', 'card_hold')
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
 * expired or card_saved is settled here, plus capturing rows whose lease expired (a settle that died mid-flight).
 * Failed rows are NOT selected here: their single retry belongs to step B. settleBooking claims
 * each row first, so this sweep, the completion event and the admin capture can never collect twice.
 */
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

    const [waiting, stuck] = await Promise.all([
      base().in('payment_state', ['authorized', 'expired', 'card_saved']).order('completed_at', { ascending: true }).limit(HOLD_CLAIM_LIMIT),
      base().eq('payment_state', 'capturing').lt('payment_lease_until', ctx.now.toISOString()).order('completed_at', { ascending: true }).limit(HOLD_CLAIM_LIMIT),
    ])
    if (waiting.error || stuck.error) throw new Error('settle sweep lookup failed')

    const ids: string[] = []
    for (const r of [...((waiting.data ?? []) as Array<{ id: string }>), ...((stuck.data ?? []) as Array<{ id: string }>)]) {
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
 * The pickup is read through the live generated column pickup_utc (D-22). sendPaymentOperatorAlert claims the ledger key
 * before sending, so a tick that sees the same booking again sends nothing.
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

export const TICK_STEPS: TickStep[] = [stepA, stepB, stepC, stepD, stepE]

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
