// The operator's extra charge to a client's saved card (Phase 91, plan 91-08; EXTRA-01, D-09, D-10, D-12, D-13, D-15,
// D-16, Research Pattern 3, Pitfalls C2 / C4 / M8).
//
// After a completed trip the operator may bill waiting beyond what was booked, or another agreed extra, to the saved card
// as a SEPARATE off-session PaymentIntent (kind card_extra). It is never a growth of the original hold (no overcapture)
// and never a change of the booking's own payment:
//   - this file does not call settleBooking and does not write bookings.payment_state or bookings.payment_intent_id; the
//     extra PaymentIntent id lives only on booking_extra_charges and in the ledger (tests/payment-state-writers-gate.test.ts);
//   - the ledger is written only through appendPaymentEvent: an admin_action row BEFORE Stripe is called (T-89-21 style), then
//     extra_charged or extra_failed. Ledger rows carry ids, codes and amounts, never the operator's description (T-91-31);
//   - ONE charging row per booking (partial unique index booking_extra_charges_one_charging): the row is the lock. A second
//     request while a charge runs answers payment_busy; the Stripe key is extra:<chargeId>:<attempt>, never the amount;
//   - nothing is retried automatically. A decline is final for that row (a new click makes a new row); a transient Stripe
//     answer keeps the row charging, and after LEASE_SECONDS the operator may resume the SAME row, which replays the same key
//     and the same amount;
//   - the money outcome has two witnesses: the synchronous Stripe answer and the payment_intent webhook. Both end in
//     the same ledger keys and the same compare-and-set on status charging, so whichever comes first wins and the other is a
//     no-op (finalizeExtraFromWebhook);
//   - no business cap on an 'other' amount (D-13): only Stripe's technical ceiling, enforced by the route schema.
//
// Eligibility needs the stored consent version and the in-flight row, which are not on the booking row, so it lives here and
// not in allowedPaymentActions (the payment GET appends 'charge_extra' from isExtraChargeEligible, plan 91-11).

import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { isPartnerBooking } from '@/lib/booking-status'
import { LEASE_SECONDS } from '@/lib/payments/config'
import { consentCoversExtras } from '@/lib/payments/consent-text'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'
import {
  cardMetadata,
  classifyStripeError,
  getPaymentsStripe,
  isNotTheClientsFault,
  stripeErrorCode,
  stripeKeys,
} from '@/lib/payments/stripe'
import { getPricingConfig } from '@/lib/pricing-config'
import { extraWaitingAmountMinor, extraWaitingBlocks } from '@/lib/stops'
import { createSupabaseServiceClient } from '@/lib/supabase'

type BookingRow = Record<string, unknown>

const TABLE = 'booking_extra_charges'
/** Stripe's technical ceiling for one amount in minor units (8 digits). The only upper bound of an 'other' amount (D-13). */
export const EXTRA_AMOUNT_CEILING_MINOR = 99_999_999
/** Minutes of one waiting extra: 1 minute .. 8 hours (the table CHECK). */
export const EXTRA_MINUTES_MIN = 1
export const EXTRA_MINUTES_MAX = 480
const RECENT_CHARGES = 20
/** A charging row nobody can still be working under: the engine lease (lib/payments/config.ts) covers the longest Stripe chain. */
const EXTRA_LEASE_MS = LEASE_SECONDS * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ExtraCurrency = 'eur' | 'czk'

/** A row of booking_extra_charges (migration 089). */
export interface ExtraChargeRow {
  id: string
  booking_id: string
  kind: 'waiting' | 'other'
  status: 'charging' | 'charged' | 'failed'
  currency: ExtraCurrency
  amount_minor: number
  minutes: number | null
  blocks: number | null
  rate_per_block_eur: number | null
  description: string | null
  attempt: number
  stripe_payment_intent_id: string | null
  last_error_code: string | null
  requested_at: string
  charged_at: string | null
  /** Bumped when the row is taken over by a resume: the lease is measured from it. */
  updated_at?: string
}

export interface ExtraContext {
  /** text_version of the latest stored consent of the booking, or null when there is none. */
  consentVersion: string | null
  /** The one row that is charging right now, if any. */
  inFlight: ExtraChargeRow | null
  /** The most recent charges, newest first (at most 20). */
  charges: ExtraChargeRow[]
}

export type ExtraIneligibleReason =
  | 'partner'
  | 'not_completed'
  | 'payment_mode'
  | 'no_saved_card'
  | 'consent_not_covered'
  | 'in_flight'

export type ExtraRequest =
  | { kind: 'waiting'; minutes: number; expectedAmountMinor: number }
  | { kind: 'other'; description: string; amountMinor: number }

export type ExtraChargeResult =
  | { status: 200; outcome: 'charged'; chargeId: string; amountMinor: number; currency: ExtraCurrency }
  | { status: 200; outcome: 'declined'; chargeId: string; code: string }
  /**
   * Stripe did not settle the PaymentIntent and it could not be cancelled, so it may still succeed (CR-01). The row stays
   * charging (it blocks a new charge), the operator is alerted, and nothing may be said about the card being declined.
   */
  | { status: 200; outcome: 'unconfirmed'; chargeId: string }
  | { status: 409; error: 'payment_busy' }
  | { status: 409; error: 'amount_changed'; amountMinor: number }
  | { status: 422; error: 'action_not_allowed' | 'waiting_rate_missing' }

const WEBHOOK_ACTOR: LedgerActor = { type: 'webhook', id: null }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const currencyOf = (v: unknown): ExtraCurrency | null => (v === 'eur' || v === 'czk' ? v : null)
const isMinor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

// ── context and eligibility ──────────────────────────────────────────────────────

/** The latest consent version, the charging row and the recent charges of one booking. */
export async function loadExtraContext(bookingId: string): Promise<ExtraContext> {
  const db = createSupabaseServiceClient()

  const consent = await db
    .from('booking_payment_consents')
    .select('text_version, accepted_at')
    .eq('booking_id', bookingId)
    .order('accepted_at', { ascending: false })
    .limit(1)
  if (consent.error) throw new Error('extra consent lookup failed')
  const consentRows = Array.isArray(consent.data) ? (consent.data as Array<{ text_version?: unknown }>) : []
  const consentVersion = typeof consentRows[0]?.text_version === 'string' ? consentRows[0].text_version : null

  const recent = await db
    .from(TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .order('requested_at', { ascending: false })
    .limit(RECENT_CHARGES)
  if (recent.error) throw new Error('extra charges lookup failed')
  const charges = Array.isArray(recent.data) ? (recent.data as ExtraChargeRow[]) : []

  const charging = await db.from(TABLE).select('*').eq('booking_id', bookingId).eq('status', 'charging').maybeSingle()
  if (charging.error) throw new Error('extra charges lookup failed')
  const inFlight = (charging.data as ExtraChargeRow | null) ?? null

  return { consentVersion, inFlight, charges }
}

/** Payment states of a cash_guarantee booking whose saved card may be billed an extra (D-15). */
const CASH_EXTRA_STATES: ReadonlySet<string> = new Set(['card_saved', 'cash_settled', 'captured', 'failed'])

/**
 * D-15 / D-12: may the operator bill an extra to this booking right now? A completed, non-partner booking that is card_hold
 * with payment_state captured, or cash_guarantee with a saved card in card_saved, cash_settled, captured or failed; the latest
 * stored consent must cover extras (consentCoversExtras); and no other extra may be charging.
 */
export function isExtraChargeEligible(
  booking: BookingRow,
  ctx: Pick<ExtraContext, 'consentVersion' | 'inFlight'>,
): { ok: true } | { ok: false; reason: ExtraIneligibleReason } {
  if (isPartnerBooking({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })) {
    return { ok: false, reason: 'partner' }
  }
  if (booking.status !== 'completed') return { ok: false, reason: 'not_completed' }

  const state = str(booking.payment_state)
  const modeOk =
    (booking.payment_mode === 'card_hold' && state === 'captured') ||
    (booking.payment_mode === 'cash_guarantee' && CASH_EXTRA_STATES.has(state))
  if (!modeOk) return { ok: false, reason: 'payment_mode' }
  if (!str(booking.stripe_customer_id) || !str(booking.stripe_payment_method_id)) return { ok: false, reason: 'no_saved_card' }

  if (!consentCoversExtras(ctx.consentVersion)) return { ok: false, reason: 'consent_not_covered' }
  if (ctx.inFlight) return { ok: false, reason: 'in_flight' }
  return { ok: true }
}

// ── Stripe and the shared outcome handling ───────────────────────────────────────

type Collected =
  | { kind: 'ok'; pi: Stripe.PaymentIntent }
  /** A definitive decline: the PaymentIntent is dead (declined by the card, or cancelled here), so it can never succeed. */
  | { kind: 'declined'; code: string; paymentIntentId: string | null }
  | { kind: 'transient' }
  /** The PaymentIntent is not settled and could not be cancelled: it may still succeed. */
  | { kind: 'unresolved'; code: string; paymentIntentId: string }

const idOf = (v: unknown): string | null => {
  if (typeof v === 'string' && v) return v
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id
  return null
}

/** One off-session create. The key is the row id + attempt and the parameters are the row's own: a replay is exact. */
async function chargeSavedCard(booking: BookingRow, charge: ExtraChargeRow): Promise<Collected> {
  const customer = str(booking.stripe_customer_id)
  const paymentMethod = str(booking.stripe_payment_method_id)
  if (!customer || !paymentMethod) return { kind: 'declined', code: 'missing_payment_details', paymentIntentId: null }

  try {
    const pi = (await getPaymentsStripe().paymentIntents.create(
      {
        amount: charge.amount_minor,
        currency: charge.currency,
        customer,
        payment_method: paymentMethod,
        payment_method_types: ['card'],
        off_session: true,
        confirm: true,
        metadata: cardMetadata('card_extra', {
          bookingId: str(booking.id),
          attempt: charge.attempt,
          bookingReference: str(booking.booking_reference),
          extraChargeId: charge.id,
        }),
      },
      { idempotencyKey: stripeKeys.extra(charge.id, charge.attempt) },
    )) as Stripe.PaymentIntent
    if (pi.status === 'succeeded') return { kind: 'ok', pi }
    // requires_action, processing or anything unexpected: the PaymentIntent is NOT dead, so it is cancelled before the row
    // may be called declined (CR-01).
    return await closeUnfinished(charge, pi.id, pi.status === 'requires_action' ? 'authentication_required' : 'unexpected_status')
  } catch (err) {
    const errorClass = classifyStripeError(err)
    // An answer that says nothing about the card (network, rate limit, a 5xx, a broken key, a busy key): the row stays
    // charging, the same click may be repeated after the lease and replays the same key.
    if (isNotTheClientsFault(errorClass)) {
      console.error('[extra] stripe answered without a result', { chargeId: charge.id, errorClass })
      return { kind: 'transient' }
    }
    const code = errorClass === 'auth_required' ? 'authentication_required' : stripeErrorCode(err)
    const attached = (err as { payment_intent?: unknown } | null)?.payment_intent
    const piId = idOf(attached)
    const piStatus = attached && typeof attached === 'object' ? (attached as { status?: unknown }).status : undefined
    // A plain decline leaves the PaymentIntent requires_payment_method (nobody holds its client secret, it cannot be paid
    // later). An authentication_required one stays requires_action: it is cancelled like any other unfinished answer.
    if (piId && piStatus !== 'requires_payment_method' && piStatus !== 'canceled') return closeUnfinished(charge, piId, code)
    return { kind: 'declined', code, paymentIntentId: piId }
  }
}

/**
 * A PaymentIntent that did not succeed on the off-session confirm is cancelled, so it cannot succeed later (CR-01). Declined
 * only when it is dead. If the cancel itself fails, Stripe is asked what the PaymentIntent is now: succeeded -> the money
 * moved (ok), dead -> declined, anything else -> unresolved (the row stays charging and blocks a new charge).
 */
async function closeUnfinished(charge: ExtraChargeRow, piId: string, code: string): Promise<Collected> {
  const stripe = getPaymentsStripe()
  try {
    await stripe.paymentIntents.cancel(piId, undefined, { idempotencyKey: stripeKeys.extraVoid(charge.id, charge.attempt) })
    return { kind: 'declined', code, paymentIntentId: piId }
  } catch (cancelErr) {
    try {
      const now = (await stripe.paymentIntents.retrieve(piId)) as Stripe.PaymentIntent
      if (now.status === 'succeeded') return { kind: 'ok', pi: now }
      if (now.status === 'canceled' || now.status === 'requires_payment_method') return { kind: 'declined', code, paymentIntentId: piId }
    } catch {
      // unknown: handled as unresolved below
    }
    console.error('[extra] unfinished PaymentIntent could not be cancelled', {
      chargeId: charge.id,
      errorClass: classifyStripeError(cancelErr),
    })
    return { kind: 'unresolved', code, paymentIntentId: piId }
  }
}

/**
 * charging -> charged (or, for the repair of a row wrongly recorded as declined, failed -> charged), conditional on the
 * status we read: true only for the one writer that flips it.
 */
async function markCharged(chargeId: string, paymentIntentId: string, from: 'charging' | 'failed' = 'charging'): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await createSupabaseServiceClient()
    .from(TABLE)
    .update({
      status: 'charged',
      stripe_payment_intent_id: paymentIntentId,
      last_error_code: null,
      charged_at: now,
      updated_at: now,
    })
    .eq('id', chargeId)
    .eq('status', from)
    .select('id')
  if (error) throw new Error('extra charge close failed')
  return Array.isArray(data) && data.length > 0
}

/** charging -> failed with the decline code, conditional on charging. */
async function markFailed(chargeId: string, code: string, paymentIntentId: string | null): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from(TABLE)
    .update({
      status: 'failed',
      last_error_code: code.slice(0, 60),
      updated_at: new Date().toISOString(),
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
    })
    .eq('id', chargeId)
    .eq('status', 'charging')
    .select('id')
  if (error) throw new Error('extra charge fail failed')
  return Array.isArray(data) && data.length > 0
}

/** The receipt, sent once (the ledger key behind eventKey makes a replay a no-op). A mail problem never undoes the money. */
async function sendReceipt(booking: BookingRow, charge: ExtraChargeRow): Promise<void> {
  let result: Awaited<ReturnType<typeof sendPaymentEmail>> | 'threw' = 'threw'
  try {
    result = await sendPaymentEmail({
      kind: 'extra_charged',
      variant: charge.kind,
      // The receipt speaks the currency of the charge.
      booking: { ...booking, payment_currency: charge.currency },
      eventKey: `email:extra_charged:${charge.id}`,
      feeMinor: charge.amount_minor,
      ...(charge.kind === 'waiting' && charge.minutes ? { extraMinutes: charge.minutes } : {}),
      ...(charge.kind === 'other' && charge.description ? { extraItem: charge.description } : {}),
    })
  } catch {
    // reported below
  }
  if (result === 'threw' || result === 'failed') {
    console.error('[extra] receipt email failed', { bookingId: str(booking.id), chargeId: charge.id })
  }
}

/**
 * The money moved. Order: the ledger row first (it is true the moment Stripe says succeeded, and its key makes it
 * exactly-once across the synchronous path and the webhook), then the compare-and-set of the row; only the writer that flips
 * the row sends the receipt, so the client is mailed once.
 */
async function finishCharged(
  booking: BookingRow,
  charge: ExtraChargeRow,
  pi: Stripe.PaymentIntent,
  actor: LedgerActor,
): Promise<void> {
  await appendPaymentEvent(charge.booking_id, {
    key: `extra_charged:${charge.id}`,
    kind: 'extra_charged',
    stripeObjectId: pi.id,
    amountMinor: charge.amount_minor,
    currency: charge.currency,
    actor,
  })
  if (await markCharged(charge.id, pi.id)) await sendReceipt(booking, charge)
}

/** A definitive failure: the row becomes failed and the ledger says why (a code, never a message). No email, no retry. */
async function finishFailed(
  charge: ExtraChargeRow,
  code: string,
  paymentIntentId: string | null,
  actor: LedgerActor,
): Promise<void> {
  await markFailed(charge.id, code, paymentIntentId)
  await appendPaymentEvent(charge.booking_id, {
    key: `extra_failed:${charge.id}:${charge.attempt}`,
    kind: 'extra_failed',
    ...(paymentIntentId ? { stripeObjectId: paymentIntentId } : {}),
    amountMinor: charge.amount_minor,
    currency: charge.currency,
    errorCode: code.slice(0, 60),
    actor,
  })
}

/** Create-or-replay the Stripe charge of a row and settle the row from the answer. */
async function collect(booking: BookingRow, charge: ExtraChargeRow, actor: LedgerActor): Promise<ExtraChargeResult> {
  const result = await chargeSavedCard(booking, charge)
  switch (result.kind) {
    case 'ok':
      await finishCharged(booking, charge, result.pi, actor)
      return { status: 200, outcome: 'charged', chargeId: charge.id, amountMinor: charge.amount_minor, currency: charge.currency }
    case 'declined':
      await finishFailed(charge, result.code, result.paymentIntentId, actor)
      return { status: 200, outcome: 'declined', chargeId: charge.id, code: result.code.slice(0, 60) }
    case 'transient':
      return { status: 409, error: 'payment_busy' }
    case 'unresolved': {
      // The row stays charging: that blocks a new charge, and the webhook (succeeded / failed) or a resume settles it.
      await sendPaymentOperatorAlert(
        'ops_attention',
        { ...booking, payment_currency: charge.currency },
        {
          eventKey: `alert:extra_unresolved:${charge.id}`,
          code: result.code,
          amountMinor: charge.amount_minor,
          note: 'extra_unresolved',
        },
      )
      return { status: 200, outcome: 'unconfirmed', chargeId: charge.id }
    }
  }
}

/** The click is on record before anything can fail (T-89-21 style): a short code and the amount, never a description. */
async function recordClick(
  bookingId: string,
  code: 'extra_charge' | 'extra_resume',
  amountMinor: number,
  currency: ExtraCurrency,
  actor: LedgerActor,
): Promise<void> {
  await appendPaymentEvent(bookingId, {
    key: `admin:${code}:${bookingId}:${Date.now()}:${randomUUID().slice(0, 8)}`,
    kind: 'admin_action',
    errorCode: code,
    amountMinor,
    currency,
    actor,
  })
}

/** requested_by is a uuid column: only a real uuid is stored. */
const requestedBy = (actor: LedgerActor): string | null => (actor.id && UUID_RE.test(actor.id) ? actor.id : null)

/** Re-check the rules on a fresh context (T-91-25): the route checked them once already; this is the engine's own guard. */
async function guard(
  booking: BookingRow,
  opts: { ignoreInFlight: boolean },
): Promise<{ ok: true } | { ok: false; result: ExtraChargeResult }> {
  const ctx = await loadExtraContext(str(booking.id))
  const verdict = isExtraChargeEligible(booking, {
    consentVersion: ctx.consentVersion,
    inFlight: opts.ignoreInFlight ? null : ctx.inFlight,
  })
  if (verdict.ok) return { ok: true }
  return {
    ok: false,
    result: verdict.reason === 'in_flight' ? { status: 409, error: 'payment_busy' } : { status: 422, error: 'action_not_allowed' },
  }
}

// ── the operator's request ───────────────────────────────────────────────────────

/**
 * Charge one extra to the booking's saved card. Answers:
 *   charged          the money is collected, the row is charged, the ledger and the client receipt are done
 *   declined         a definitive decline: the row is failed, nothing is retried (a new click is a new charge)
 *   payment_busy     another extra is charging, or Stripe answered transiently (the row stays charging; resume after the lease)
 *   action_not_allowed  the booking, the consent or the request is not acceptable (nothing written)
 */
export async function runExtraCharge(input: {
  booking: BookingRow
  request: ExtraRequest
  actor: LedgerActor
}): Promise<ExtraChargeResult> {
  const { booking, request, actor } = input
  const bookingId = str(booking.id)
  const currency = currencyOf(booking.payment_currency)
  if (!bookingId || !currency) return { status: 422, error: 'action_not_allowed' }

  const checked = await guard(booking, { ignoreInFlight: false })
  if (!checked.ok) return checked.result

  if (request.kind === 'waiting') return runWaiting(booking, request, currency, actor)

  // D-13: no business cap, only a positive integer within Stripe's ceiling. The amount is taken as typed, never re-rounded.
  const description = request.description.trim()
  if (
    !isMinor(request.amountMinor) ||
    request.amountMinor > EXTRA_AMOUNT_CEILING_MINOR ||
    description.length < 3 ||
    description.length > 200
  ) {
    return { status: 422, error: 'action_not_allowed' }
  }

  const charge: ExtraChargeRow = {
    id: randomUUID(),
    booking_id: bookingId,
    kind: 'other',
    status: 'charging',
    currency,
    amount_minor: request.amountMinor,
    minutes: null,
    blocks: null,
    rate_per_block_eur: null,
    description,
    attempt: 1,
    stripe_payment_intent_id: null,
    last_error_code: null,
    requested_at: new Date().toISOString(),
    charged_at: null,
  }
  return openAndCollect(booking, charge, actor)
}

/**
 * D-16: the waiting amount the operator will confirm. ceil(minutes / 15) blocks of the booking class's admin rate, no free
 * deduction, rounded to whole EUR once and converted to the booking's payment currency (the currency comes from the row, never
 * from a request). A class without an admin rate answers waiting_rate_missing (paid waiting is not offered).
 */
export async function previewWaitingExtra(
  booking: BookingRow,
  minutes: number,
): Promise<
  | { ok: true; amountMinor: number; currency: ExtraCurrency; blocks: number; ratePerBlockEur: number }
  | { ok: false; error: 'waiting_rate_missing' | 'action_not_allowed' }
> {
  const currency = currencyOf(booking.payment_currency)
  if (!currency || isPartnerBooking({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })) {
    return { ok: false, error: 'action_not_allowed' }
  }
  if (!Number.isInteger(minutes) || minutes < EXTRA_MINUTES_MIN || minutes > EXTRA_MINUTES_MAX) {
    return { ok: false, error: 'action_not_allowed' }
  }
  const rate = (await getPricingConfig()).waitingRate?.[str(booking.vehicle_class)]
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return { ok: false, error: 'waiting_rate_missing' }

  const amountMinor = extraWaitingAmountMinor(minutes, rate, currency)
  // A positive rate that rounds to nothing is no rate an operator can bill.
  if (!isMinor(amountMinor)) return { ok: false, error: 'waiting_rate_missing' }
  return { ok: true, amountMinor, currency, blocks: extraWaitingBlocks(minutes), ratePerBlockEur: rate }
}

/** The waiting path: the server's amount must equal the one the operator saw (D-10), checked before any write. */
async function runWaiting(
  booking: BookingRow,
  request: Extract<ExtraRequest, { kind: 'waiting' }>,
  currency: ExtraCurrency,
  actor: LedgerActor,
): Promise<ExtraChargeResult> {
  const preview = await previewWaitingExtra(booking, request.minutes)
  if (!preview.ok) return { status: 422, error: preview.error }
  if (preview.amountMinor !== request.expectedAmountMinor) {
    return { status: 409, error: 'amount_changed', amountMinor: preview.amountMinor }
  }
  const charge: ExtraChargeRow = {
    id: randomUUID(),
    booking_id: str(booking.id),
    kind: 'waiting',
    status: 'charging',
    currency,
    amount_minor: preview.amountMinor,
    minutes: request.minutes,
    blocks: preview.blocks,
    rate_per_block_eur: preview.ratePerBlockEur,
    description: null,
    attempt: 1,
    stripe_payment_intent_id: null,
    last_error_code: null,
    requested_at: new Date().toISOString(),
    charged_at: null,
  }
  return openAndCollect(booking, charge, actor)
}

/**
 * Replay a charge whose Stripe answer was lost (a transient error left the row charging). Allowed only once the engine lease
 * has passed since the row was created or last taken over; the replay uses the SAME key and the SAME amount, so Stripe
 * returns the original result and nothing can be charged twice. Never automatic: it is the operator's second click.
 */
export async function resumeExtraCharge(input: {
  booking: BookingRow
  chargeId: string
  actor: LedgerActor
}): Promise<ExtraChargeResult> {
  const { booking, chargeId, actor } = input
  const bookingId = str(booking.id)
  if (!bookingId) return { status: 422, error: 'action_not_allowed' }

  // The row being resumed is the in-flight one, so it must not count against the booking here.
  const checked = await guard(booking, { ignoreInFlight: true })
  if (!checked.ok) return checked.result

  const db = createSupabaseServiceClient()
  const { data, error } = await db.from(TABLE).select('*').eq('id', chargeId).eq('booking_id', bookingId).maybeSingle()
  if (error) throw new Error('extra charge lookup failed')
  const charge = (data as ExtraChargeRow | null) ?? null
  if (!charge || charge.status !== 'charging') return { status: 422, error: 'action_not_allowed' }

  const lastTouched = charge.updated_at ?? charge.requested_at
  if (!(Date.now() - Date.parse(lastTouched) >= EXTRA_LEASE_MS)) return { status: 409, error: 'payment_busy' }

  await recordClick(bookingId, 'extra_resume', charge.amount_minor, charge.currency, actor)

  // Take the row over: conditional on the timestamp we read, so two clicks resume once and the other answers busy.
  const taken = await db
    .from(TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chargeId)
    .eq('status', 'charging')
    .eq('updated_at', lastTouched)
    .select('id')
  if (taken.error) throw new Error('extra charge take-over failed')
  if (!Array.isArray(taken.data) || taken.data.length === 0) return { status: 409, error: 'payment_busy' }

  return collect(booking, charge, actor)
}

/**
 * The webhook witness of an extra PaymentIntent (payment_intent.succeeded / payment_failed with kind card_extra). The same
 * ledger keys and the same compare-and-set on status charging as the synchronous path, so whichever arrives first wins and
 * the other changes nothing (no second extra_charged row, no second receipt). The booking's own payment is never touched here.
 */
export async function finalizeExtraFromWebhook(
  bookingId: string,
  pi: Stripe.PaymentIntent,
  outcome: 'succeeded' | 'failed',
): Promise<void> {
  const chargeId = pi.metadata?.extraChargeId
  if (!chargeId || !UUID_RE.test(chargeId)) {
    console.warn('[webhook] card_extra without extraChargeId', { stripeObjectId: pi.id, bookingId })
    return
  }
  const db = createSupabaseServiceClient()
  const found = await db.from(TABLE).select('*').eq('id', chargeId).eq('booking_id', bookingId).maybeSingle()
  if (found.error) throw new Error('extra charge lookup failed')
  const charge = (found.data as ExtraChargeRow | null) ?? null
  if (!charge) {
    console.warn('[webhook] card_extra for an unknown charge', { stripeObjectId: pi.id, bookingId, chargeId })
    return
  }

  if (outcome === 'succeeded') {
    const booked = await db.from('bookings').select('*').eq('id', bookingId).maybeSingle()
    if (booked.error) throw new Error('extra booking lookup failed')
    const bookingRow = (booked.data as BookingRow | null) ?? { id: bookingId }
    if (charge.status === 'failed') {
      // Money moved on a charge recorded as failed (CR-01): repair the row, and make sure a person sees it.
      await repairFailedExtra(bookingRow, charge, pi)
      return
    }
    await finishCharged(bookingRow, charge, pi, WEBHOOK_ACTOR)
    return
  }

  // payment_failed: a charge already settled by the synchronous path stays as it is.
  if (charge.status === 'charged') return
  const err = pi.last_payment_error
  const code = (err?.decline_code || err?.code || 'unknown').slice(0, 60)
  await finishFailed(charge, code, pi.id, WEBHOOK_ACTOR)
}

/**
 * CR-01: Stripe collected an extra that the row records as failed. The ledger row (exactly-once by its key), the compare-and-set
 * failed -> charged, the receipt for the writer that wins it, and an operator alert (exactly-once by its key, sent even when a
 * redelivery finds the row already repaired, so a crash between the repair and the alert cannot hide it). A PaymentIntent other
 * than the one the row recorded is only reported: the row is not rewritten to point at a second payment.
 */
async function repairFailedExtra(booking: BookingRow, charge: ExtraChargeRow, pi: Stripe.PaymentIntent): Promise<void> {
  const sameIntent = !charge.stripe_payment_intent_id || charge.stripe_payment_intent_id === pi.id
  console.error('[webhook] card_extra succeeded on a failed charge', {
    stripeObjectId: pi.id,
    bookingId: charge.booking_id,
    chargeId: charge.id,
    repaired: sameIntent,
  })
  let won = false
  if (sameIntent) {
    await appendPaymentEvent(charge.booking_id, {
      key: `extra_charged:${charge.id}`,
      kind: 'extra_charged',
      stripeObjectId: pi.id,
      amountMinor: charge.amount_minor,
      currency: charge.currency,
      actor: WEBHOOK_ACTOR,
    })
    won = await markCharged(charge.id, pi.id, 'failed')
  }
  await sendPaymentOperatorAlert(
    'ops_attention',
    { ...booking, payment_currency: charge.currency },
    {
      eventKey: `alert:extra_late_success:${charge.id}:${pi.id}`,
      code: sameIntent ? 'extra_late_success' : 'extra_second_payment',
      amountMinor: charge.amount_minor,
      note: sameIntent ? 'extra_late_success' : 'extra_second_payment',
    },
  )
  if (won) await sendReceipt(booking, charge)
}

/** Record the click, take the one-charging-row lock by inserting the row, then charge. */
async function openAndCollect(booking: BookingRow, charge: ExtraChargeRow, actor: LedgerActor): Promise<ExtraChargeResult> {
  await recordClick(charge.booking_id, 'extra_charge', charge.amount_minor, charge.currency, actor)

  const { error } = await createSupabaseServiceClient()
    .from(TABLE)
    .insert({
      id: charge.id,
      booking_id: charge.booking_id,
      kind: charge.kind,
      status: 'charging',
      currency: charge.currency,
      amount_minor: charge.amount_minor,
      minutes: charge.minutes,
      blocks: charge.blocks,
      rate_per_block_eur: charge.rate_per_block_eur,
      description: charge.description,
      attempt: charge.attempt,
      requested_by: requestedBy(actor),
    })
  if (error) {
    // The partial unique index: another extra is charging for this booking (a double click, a second operator).
    if ((error as { code?: string }).code === '23505') return { status: 409, error: 'payment_busy' }
    throw new Error('extra charge row insert failed')
  }
  return collect(booking, charge, actor)
}
