// Settle a completed card_hold trip: capture the held amount, or charge the saved card (Phase 88, plan 88-13;
// HOLD-04, D-05, D-06, D-16, D-17).
//
// One function, three entry points (the single Phase 87 completion event, the payment tick's completion sweep,
// the admin "capture" action), all calling settleBooking(bookingId, actor). Nothing else collects client money.
//
// Never twice (T-88-38):
//   1. CAS claim: authorized | expired | card_saved | failed | capturing -> capturing through applyTransition.
//      Exactly one caller wins; a row already in capturing can only be re-claimed after its lease expired (SQL rule).
//   2. Attempt-numbered idempotency keys cap:/chg:/diff:<id>:<charge_attempts>. A transient Stripe error leaves the
//      row in capturing with its lease and the SAME attempt number, so the next sweep replays the same key and
//      Stripe returns the original result. A definitive failure advances charge_attempts inside the transition that
//      records it, so the following attempt gets a fresh key.
//   3. Ledger event keys on every money row (captured:<pi>, difference_charged:<pi>, ...): a replay of the same
//      fact is a no-op.
//   4. Stripe prunes idempotency keys at 24 h: when the attempt started more than LEASE_SEARCH_AFTER_MS ago, a
//      search by booking id + attempt runs before any create and a found succeeded PaymentIntent is reused.
//
// Amounts (T-88-39): the money is the row's CURRENT payment_amount_minor in its payment_currency, never anything a
// client or request supplied. All values are integer minor units of payment_currency; nothing converts EUR <-> CZK.
//   hold == due        one full capture
//   hold <  due (D-16) capture the hold, then a separate off-session charge of the rest (card_difference)
//   hold >  due (D-17) capture min(due, capturable); Stripe releases the rest of the authorization
//   hold gone          off-session charge of the full amount (card_charge)
// No code path collects before the trip is completed.

import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { LEASE_SEARCH_AFTER_MS, LEASE_SECONDS, RETRY_DELAY_MS } from '@/lib/payments/config'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { handlePaymentFailure } from '@/lib/payments/recovery'
import { RECOVERY_LINK_CLEARED, retireRecoveryLink } from '@/lib/payments/recovery-link'
import { alertStripeConfig } from '@/lib/payments/hold'
import {
  appendPaymentEvent,
  applyTransition,
  type LedgerActor,
  type PaymentPatch,
  type PaymentState,
} from '@/lib/payments/state'
import {
  cardMetadata,
  classifyStripeError,
  getPaymentsStripe,
  isNotTheClientsFault,
  stripeErrorCode,
  stripeKeys,
  type StripeErrorClass,
} from '@/lib/payments/stripe'

type BookingRow = Record<string, unknown>

export type SettleOutcome = 'captured' | 'balance_due' | 'failed' | 'transient' | 'busy' | 'noop' | 'skipped'

export interface SettleResult {
  outcome: SettleOutcome
  code?: string
  capturedMinor?: number
  diffMinor?: number
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const attemptsOf = (b: BookingRow): number =>
  typeof b.charge_attempts === 'number' && Number.isInteger(b.charge_attempts) && b.charge_attempts >= 0 ? b.charge_attempts : 0

/**
 * States a settle may claim. 'capturing' and 'placing_hold' are claimable only after their lease expired (SQL lease
 * rule: a leased state never moves to another leased state while the lease is live). 88-REVIEW A-WR-06: a hold placement
 * that died near pickup used to leave the row in placing_hold for good; the settle now adopts it once the lease lapsed
 * (and finds the authorization the dead worker may have created, see findAttemptHold).
 */
const CLAIMABLE: PaymentState[] = ['authorized', 'expired', 'card_saved', 'failed', 'capturing', 'placing_hold']
/** States in which there is nothing left to collect (or nothing a settle may do). */
const SETTLED_STATES: ReadonlySet<string> = new Set(['captured', 'released', 'balance_due'])

/**
 * The trip is over: the status is completed, or the durable completed_at fact is set on a row whose status moved
 * on (a NULL completed_at on a historic completed row still counts through its status). Cancelled and no-show
 * trips are never settled here.
 */
function isCompleted(b: BookingRow): boolean {
  if (b.status === 'completed') return true
  if (b.status === 'cancelled' || b.status === 'no_show') return false
  return typeof b.completed_at === 'string' && b.completed_at.length > 0
}

/** Stripe expandable field -> id string (or null). */
function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  return null
}

type Collected =
  | { kind: 'ok'; pi: Stripe.PaymentIntent; capturedMinor: number }
  /** The hold can not be captured (lapsed, released, never placed): the saved card is charged instead. */
  | { kind: 'gone' }
  /** Retry later with the same keys. `configCode`: Stripe refused our key (88-REVIEW A-WR-02), the operator is alerted. */
  | { kind: 'transient'; configCode?: string }
  | { kind: 'failed'; code: string; paymentIntentId: string | null }

/**
 * A Stripe error that is not a decline (busy 409 key, network, rate limit, 5xx, our own key refused, a key reused with
 * other parameters): never a client failure, never an attempt used up (88-REVIEW A-WR-01, A-WR-02).
 */
function notTheClients(err: unknown, errorClass: StripeErrorClass = classifyStripeError(err)): Collected | null {
  if (!isNotTheClientsFault(errorClass)) return null
  if (errorClass === 'idempotency') console.error('[settle] idempotency key reused with other parameters', { code: stripeErrorCode(err) })
  return errorClass === 'config' ? { kind: 'transient', configCode: stripeErrorCode(err) } : { kind: 'transient' }
}

/** The authorization lapsed at the card network although Stripe has not cancelled it yet (88-REVIEW A-WR-09). */
function authorizationLapsed(ctx: Ctx, pi: Stripe.PaymentIntent | null, err: unknown): boolean {
  if (stripeErrorCode(err) === 'charge_expired_for_capture') return true
  if (!pi || pi.status !== 'requires_capture') return false
  const before = typeof ctx.booking.capture_before === 'string' ? Date.parse(ctx.booking.capture_before) : NaN
  return Number.isFinite(before) && before <= Date.now()
}

interface Ctx {
  booking: BookingRow
  bookingId: string
  attempt: number
  dueMinor: number
  currency: 'eur' | 'czk'
  actor: LedgerActor
  /** The attempt started more than LEASE_SEARCH_AFTER_MS ago: Stripe may have pruned its idempotency keys. */
  searchFirst: boolean
}

/** Capture the held PaymentIntent for min(due, capturable), or reconcile one that is already captured. */
async function collectFromHold(ctx: Ctx, holdId: string): Promise<Collected> {
  const stripe = getPaymentsStripe()

  let pi: Stripe.PaymentIntent
  try {
    pi = (await stripe.paymentIntents.retrieve(holdId)) as Stripe.PaymentIntent
  } catch (err) {
    const busy = notTheClients(err)
    if (busy) return busy
    if (stripeErrorCode(err) === 'resource_missing') return { kind: 'gone' }
    return { kind: 'failed', code: stripeErrorCode(err), paymentIntentId: holdId }
  }

  if (pi.status === 'succeeded') {
    // A previous attempt captured but its response (or the state write) was lost: reconcile, never capture again.
    return { kind: 'ok', pi, capturedMinor: pi.amount_received }
  }
  if (pi.status === 'processing') return { kind: 'transient' }

  if (pi.status === 'requires_capture') {
    const toCapture = Math.min(ctx.dueMinor, pi.amount_capturable)
    try {
      const captured = (await stripe.paymentIntents.capture(
        pi.id,
        { amount_to_capture: toCapture },
        { idempotencyKey: stripeKeys.capture(ctx.bookingId, ctx.attempt) },
      )) as Stripe.PaymentIntent
      return { kind: 'ok', pi: captured, capturedMinor: captured.amount_received }
    } catch (err) {
      const busy = notTheClients(err)
      if (busy) return busy
      // A concurrent path may have captured it, or the hold lapsed in between: look once more before failing.
      let again: Stripe.PaymentIntent | null = null
      try {
        again = (await stripe.paymentIntents.retrieve(pi.id)) as Stripe.PaymentIntent
        if (again.status === 'succeeded') return { kind: 'ok', pi: again, capturedMinor: again.amount_received }
        if (again.status === 'canceled') return { kind: 'gone' }
      } catch {
        // fall through to the original failure
      }
      // A-WR-09 (HOLD-04): an authorization that lapsed before Stripe cancelled it is a gone hold, not a decline: void
      // it (best effort, it holds nothing any more) and charge the saved card instead.
      if (authorizationLapsed(ctx, again, err)) {
        try {
          await stripe.paymentIntents.cancel(pi.id, {}, { idempotencyKey: stripeKeys.voidHoldNow(pi.id) })
        } catch {
          console.error('[settle] lapsed authorization not voided', { bookingId: ctx.bookingId, stripeObjectId: pi.id })
        }
        return { kind: 'gone' }
      }
      return { kind: 'failed', code: stripeErrorCode(err), paymentIntentId: pi.id }
    }
  }

  // canceled (expired / released), or never authorized (requires_payment_method / requires_action / ...).
  return { kind: 'gone' }
}

/**
 * Off-session charge of the saved card: the fallback for a gone hold (card_charge, key chg:<id>:<attempt>) and the
 * price difference (card_difference, key diff:<id>:<attempt>). A search that fails is treated as transient: a
 * PaymentIntent is never created blind when the idempotency keys may have been pruned.
 */
async function chargeSavedCard(ctx: Ctx, kind: 'card_charge' | 'card_difference', amountMinor: number): Promise<Collected> {
  const customer = str(ctx.booking.stripe_customer_id)
  const paymentMethod = str(ctx.booking.stripe_payment_method_id)
  if (!customer || !paymentMethod) return { kind: 'failed', code: 'missing_payment_details', paymentIntentId: null }

  const stripe = getPaymentsStripe()

  if (ctx.searchFirst) {
    try {
      const found = await stripe.paymentIntents.search({
        query: `metadata['cofBookingId']:'${ctx.bookingId}' AND metadata['attempt']:'${ctx.attempt}' AND metadata['kind']:'${kind}'`,
        limit: 10,
      })
      const done = found.data.find((p) => p.status === 'succeeded')
      if (done) return { kind: 'ok', pi: done, capturedMinor: done.amount_received || amountMinor }
    } catch {
      return { kind: 'transient' }
    }
  }

  const key = kind === 'card_charge' ? stripeKeys.charge(ctx.bookingId, ctx.attempt) : stripeKeys.difference(ctx.bookingId, ctx.attempt)
  try {
    const pi = (await stripe.paymentIntents.create(
      {
        amount: amountMinor,
        currency: ctx.currency,
        customer,
        payment_method: paymentMethod,
        payment_method_types: ['card'],
        off_session: true,
        confirm: true,
        metadata: cardMetadata(kind, {
          bookingId: ctx.bookingId,
          attempt: ctx.attempt,
          bookingReference: str(ctx.booking.booking_reference),
        }),
      },
      { idempotencyKey: key },
    )) as Stripe.PaymentIntent
    if (pi.status === 'succeeded') return { kind: 'ok', pi, capturedMinor: pi.amount_received || amountMinor }
    const code = pi.status === 'requires_action' ? 'authentication_required' : 'unexpected_status'
    return { kind: 'failed', code, paymentIntentId: pi.id }
  } catch (err) {
    const errorClass = classifyStripeError(err)
    const busy = notTheClients(err, errorClass)
    if (busy) return busy
    const code = errorClass === 'auth_required' ? 'authentication_required' : stripeErrorCode(err)
    return { kind: 'failed', code, paymentIntentId: idOf((err as { payment_intent?: unknown } | null)?.payment_intent) }
  }
}

/** True when this attempt's first capture_started is older than LEASE_SEARCH_AFTER_MS (or can not be read). */
async function attemptIsStale(bookingId: string, attempt: number, nowMs: number): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from('booking_payment_events')
    .select('event_key, created_at')
    .eq('booking_id', bookingId)
    .eq('kind', 'capture_started')
  if (error) return true
  const prefix = `capture_started:${attempt}:`
  const startedMs = (Array.isArray(data) ? (data as Array<{ event_key?: unknown; created_at?: unknown }>) : [])
    .filter((r) => typeof r.event_key === 'string' && r.event_key.startsWith(prefix))
    .map((r) => (typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN))
    .filter((t) => Number.isFinite(t))
  if (startedMs.length === 0) return false
  return nowMs - Math.min(...startedMs) > LEASE_SEARCH_AFTER_MS
}

/** capturing -> failed with the attempt counter advanced and the Stripe code (never a message) kept. */
async function recordFailure(
  ctx: Ctx,
  info: { code: string; paymentIntentId: string | null },
  nowMs: number,
): Promise<SettleResult> {
  const code = info.code.slice(0, 60)
  // D-13: one automatic retry 12 h after the failure (the trip is over, so no pickup clamp); none once it was used.
  const retriesUsed = typeof ctx.booking.payment_retry_count === 'number' ? ctx.booking.payment_retry_count : 0
  const moved = await applyTransition({
    bookingId: ctx.bookingId,
    from: ['capturing'],
    to: 'failed',
    patch: {
      charge_attempts: ctx.attempt + 1,
      last_payment_error: code,
      payment_failed_at: new Date(nowMs).toISOString(),
      payment_retry_at: retriesUsed >= 1 ? null : new Date(nowMs + RETRY_DELAY_MS).toISOString(),
      payment_lease_until: null,
    },
    event: {
      key: `charge_failed:${info.paymentIntentId ?? 'none'}:${ctx.attempt}`,
      kind: 'charge_failed',
      stripeObjectId: info.paymentIntentId ?? undefined,
      amountMinor: ctx.dueMinor,
      currency: ctx.currency,
      errorCode: code,
      actor: ctx.actor,
    },
  })
  // HOLD-05, D-13, D-14: recovery link for what is still owed, the client email and the operator alert, once per
  // attempt. Only the writer that moved the row does it; a recovery problem never changes the settle outcome.
  if (moved.applied) {
    const capturedSoFar = typeof ctx.booking.captured_amount_minor === 'number' ? ctx.booking.captured_amount_minor : 0
    try {
      await handlePaymentFailure(
        { ...ctx.booking, ...(moved.booking ?? {}) },
        { phase: 'charge', code, amountMinor: Math.max(ctx.dueMinor - capturedSoFar, 0), attempt: ctx.attempt + 1 },
      )
    } catch {
      console.error('[settle] failure recovery step failed', { bookingId: ctx.bookingId })
    }
  }
  return { outcome: 'failed', code }
}

/**
 * The main amount is collected but the difference was declined: capturing -> balance_due with the main
 * PaymentIntent and the amount already collected recorded (the client still owes the rest), attempt advanced.
 */
async function recordDifferenceFailure(
  ctx: Ctx,
  mainPi: Stripe.PaymentIntent,
  mainMinor: number,
  info: { code: string; paymentIntentId: string | null },
  nowMs: number,
): Promise<SettleResult> {
  const code = info.code.slice(0, 60)
  // The capture itself happened: keep it visible in the ledger. 88-REVIEW A-WR-07: its own key (main_captured:), never
  // the key of the final captured transition, so a later successful settle of this row can not mistake this row for
  // its own (the event key is checked before the state, so a shared key made a capture that never moved the row look
  // like a success).
  await appendPaymentEvent(ctx.bookingId, {
    key: `main_captured:${mainPi.id}`,
    kind: 'captured',
    stripeObjectId: mainPi.id,
    amountMinor: mainMinor,
    currency: ctx.currency,
    actor: ctx.actor,
  })
  const moved = await applyTransition({
    bookingId: ctx.bookingId,
    from: ['capturing'],
    to: 'balance_due',
    patch: {
      payment_intent_id: mainPi.id,
      captured_amount_minor: mainMinor,
      captured_at: new Date(nowMs).toISOString(),
      charge_attempts: ctx.attempt + 1,
      last_payment_error: code,
      payment_failed_at: new Date(nowMs).toISOString(),
      // No automatic retry for a declined difference: balance_due is settled for the engine (SETTLED_STATES); the
      // client pays the recovery link or the operator acts.
      payment_retry_at: null,
      payment_lease_until: null,
    },
    event: {
      key: `difference_failed:${info.paymentIntentId ?? 'none'}:${ctx.attempt}`,
      kind: 'difference_failed',
      stripeObjectId: info.paymentIntentId ?? undefined,
      amountMinor: ctx.dueMinor - mainMinor,
      currency: ctx.currency,
      errorCode: code,
      actor: ctx.actor,
    },
  })
  // HOLD-05, D-13, D-14: the link, the email and the alert are for the difference only (the main amount is paid).
  // The recovery payment gets its own ledger key (recovery_paid:<pi>).
  if (moved.applied) {
    try {
      await handlePaymentFailure(
        { ...ctx.booking, ...(moved.booking ?? {}) },
        { phase: 'difference', code, amountMinor: ctx.dueMinor - mainMinor, attempt: ctx.attempt + 1 },
      )
    } catch {
      console.error('[settle] failure recovery step failed', { bookingId: ctx.bookingId })
    }
  }
  return { outcome: 'balance_due', code, capturedMinor: mainMinor, diffMinor: 0 }
}

/** A transient settle: the row keeps its lease and attempt; a refused Stripe key also alerts the operator once. */
async function stillTransient(ctx: Ctx, collected: Collected | null): Promise<SettleResult> {
  const configCode = collected?.kind === 'transient' ? collected.configCode : undefined
  if (configCode) await alertStripeConfig(ctx.booking, 'charge', ctx.attempt, configCode)
  return { outcome: 'transient', code: configCode ? 'stripe_config' : 'transient' }
}

/**
 * The authorization a dead hold placement may have created (88-REVIEW A-WR-06): the hold PaymentIntent of the row's
 * current hold attempt, found by its metadata. Returns its id when it can still be captured, null when there is none
 * (the saved card is charged instead), 'unknown' when Stripe could not be searched (retry later, never charge blind).
 */
async function findAttemptHold(bookingId: string, booking: BookingRow): Promise<string | null | 'unknown'> {
  const attempt =
    typeof booking.hold_attempts === 'number' && Number.isInteger(booking.hold_attempts) ? booking.hold_attempts : 0
  try {
    const found = await getPaymentsStripe().paymentIntents.search({
      query: `metadata['cofBookingId']:'${bookingId}' AND metadata['attempt']:'${attempt}' AND metadata['kind']:'card_hold'`,
      limit: 10,
    })
    const live = found.data.find((p) => p.status === 'requires_capture' || p.status === 'succeeded')
    return live ? live.id : null
  } catch {
    console.error('[settle] hold attempt lookup failed', { bookingId })
    return 'unknown'
  }
}

export async function settleBooking(
  bookingId: string,
  actor: LedgerActor,
  /** Extra columns written in the claim transition (the automatic retry marks payment_retry_count here, D-13). */
  opts: { claimPatch?: PaymentPatch } = {},
): Promise<SettleResult> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (error) throw new Error('settle booking lookup failed')
  const loaded = (data as BookingRow | null) ?? null
  if (!loaded) return { outcome: 'skipped', code: 'not_found' }

  try {
    assertMoneyEligible({ booking_source: typeof loaded.booking_source === 'string' ? loaded.booking_source : null })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) {
      console.warn('[settle] partner booking skipped', { bookingId })
      return { outcome: 'skipped', code: 'partner_booking' }
    }
    throw err
  }
  if (loaded.payment_mode !== 'card_hold') return { outcome: 'skipped', code: 'not_card_hold' }
  if (!isCompleted(loaded)) return { outcome: 'skipped', code: 'not_completed' }

  const loadedState = str(loaded.payment_state)
  if (SETTLED_STATES.has(loadedState)) return { outcome: 'noop', code: loadedState }
  // 88-REVIEW A-IN-08: a checkout the client never finished has no card and no hold; nothing a capture could do.
  if (loadedState === 'checkout_pending' || loadedState === 'none') return { outcome: 'skipped', code: 'not_confirmed' }

  const nowMs = Date.now()
  const claim = await applyTransition({
    bookingId,
    from: CLAIMABLE,
    to: 'capturing',
    patch: { ...(opts.claimPatch ?? {}), payment_lease_until: new Date(nowMs + LEASE_SECONDS * 1000).toISOString() },
    // Unique per claim (a re-claim after a lease expiry is a new row); the attempt number stays in the key.
    event: { key: `capture_started:${attemptsOf(loaded)}:${nowMs}`, kind: 'capture_started', actor },
  })
  if (!claim.applied) {
    return SETTLED_STATES.has(claim.currentState ?? '')
      ? { outcome: 'noop', code: claim.currentState }
      : { outcome: 'busy' }
  }

  // From here this caller owns the row. Work from the claimed row (fresh amounts and counters).
  const booking: BookingRow = { ...loaded, ...(claim.booking ?? {}) }
  const attempt = attemptsOf(booking)
  const due = booking.payment_amount_minor
  const currency = booking.payment_currency === 'czk' ? 'czk' : booking.payment_currency === 'eur' ? 'eur' : null
  const ctx: Ctx = {
    booking,
    bookingId,
    attempt,
    dueMinor: typeof due === 'number' ? due : 0,
    currency: currency ?? 'eur',
    actor,
    searchFirst: false,
  }
  if (typeof due !== 'number' || !Number.isInteger(due) || due <= 0 || !currency) {
    return recordFailure(ctx, { code: 'missing_payment_details', paymentIntentId: null }, nowMs)
  }
  ctx.searchFirst = await attemptIsStale(bookingId, attempt, nowMs)

  // A-WR-06: adopted from a dead hold placement: the authorization it may have created is not on the row yet.
  let holdId = str(booking.hold_payment_intent_id)
  if (!holdId && loadedState === 'placing_hold') {
    const found = await findAttemptHold(bookingId, booking)
    if (found === 'unknown') return stillTransient(ctx, null)
    holdId = found ?? ''
  }
  let collected: Collected = holdId ? await collectFromHold(ctx, holdId) : { kind: 'gone' }
  if (collected.kind === 'gone') collected = await chargeSavedCard(ctx, 'card_charge', ctx.dueMinor)

  if (collected.kind === 'failed') return recordFailure(ctx, collected, nowMs)
  if (collected.kind !== 'ok') return stillTransient(ctx, collected)

  const mainPi = collected.pi
  const mainMinor = collected.capturedMinor

  // D-16: the agreed amount rose after the hold. The held part is captured above; the rest is a separate charge.
  let diffMinor = 0
  const wanted = ctx.dueMinor - mainMinor
  if (wanted > 0) {
    const diff = await chargeSavedCard(ctx, 'card_difference', wanted)
    if (diff.kind === 'failed') return recordDifferenceFailure(ctx, mainPi, mainMinor, diff, nowMs)
    if (diff.kind !== 'ok') return stillTransient(ctx, diff)
    diffMinor = diff.capturedMinor
    await appendPaymentEvent(bookingId, {
      key: `difference_charged:${diff.pi.id}`,
      kind: 'difference_charged',
      stripeObjectId: diff.pi.id,
      amountMinor: diffMinor,
      currency: ctx.currency,
      actor,
    })
  }

  const totalMinor = mainMinor + diffMinor
  const patch: PaymentPatch = {
    payment_intent_id: mainPi.id,
    captured_amount_minor: totalMinor,
    captured_at: new Date().toISOString(),
    payment_lease_until: null,
    last_payment_error: null,
    payment_failed_at: null,
    // 88-REVIEW T1: the money is collected; a recovery link from an earlier decline must not stay payable.
    ...RECOVERY_LINK_CLEARED,
  }
  const moved = await applyTransition({
    bookingId,
    from: ['capturing'],
    to: 'captured',
    patch,
    event: {
      key: `captured:${mainPi.id}`,
      kind: 'captured',
      stripeObjectId: mainPi.id,
      amountMinor: mainMinor,
      currency: ctx.currency,
      actor,
    },
  })
  if (!moved.applied && moved.duplicate !== true) {
    return SETTLED_STATES.has(moved.currentState ?? '') ? { outcome: 'noop', code: moved.currentState } : { outcome: 'busy' }
  }
  // A-WR-07: the ledger key is checked before the state, so a duplicate alone proves nothing. Only a row that really is
  // captured is a success; anything else stays with its lease for the next sweep (and is logged).
  if (moved.duplicate === true && moved.currentState !== 'captured') {
    console.error('[settle] captured key already recorded but the row did not move', { bookingId, state: moved.currentState ?? null })
    return { outcome: 'busy' }
  }
  await retireRecoveryLink(booking)

  try {
    await sendPaymentEmail({
      kind: 'charged',
      booking: { ...booking, ...(moved.booking ?? {}) },
      eventKey: `email:charged:${bookingId}`,
      ...(diffMinor > 0 ? { diffMinor } : {}),
    })
  } catch {
    // The money is collected; a mail problem never undoes it (the send keeps its own ledger claim).
    console.error('[settle] charged email failed', { bookingId })
  }
  return { outcome: 'captured', capturedMinor: totalMinor, diffMinor }
}
