// Operator payment actions for a card-hold booking (Phase 88, plan 88-15; HOLD-07, PAYF-01, D-04, D-13, D-14).
//
// One server-side action matrix (allowedPaymentActions) feeds the admin GET (so the PaymentPanel renders buttons
// from it and never re-implements it) and is re-checked by the admin POST. runPaymentAction runs one action through
// the engine with the admin actor. Server-only: the caller (the admin payment route) authenticates first.
//
// Money safety (T-88-47, T-88-49):
//   - no function here takes an amount: every amount is derived from the booking row by the engine;
//   - every action first appends an admin_action ledger row (the audit trail survives an engine failure);
//   - capture / retry go through the engine's CAS claim, so a double click or a race with the completion consumer or
//     the tick sweep produces one Stripe call and the loser answers 409 payment_busy.

import { isPartnerBooking } from '@/lib/booking-status'
import { pickupInstantMs } from '@/lib/prague-date'
import { claimForHold, placeHold, releaseHold } from '@/lib/payments/hold'
import { refreshRecoveryLink } from '@/lib/payments/recovery'
import { settleBooking, type SettleResult } from '@/lib/payments/settle'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'

type BookingRow = Record<string, unknown>

export type PaymentAction = 'capture' | 'retry' | 'release' | 'waive' | 'send_link'

export type PaymentActionResult =
  | { status: 200; outcome: 'ok' | 'declined' }
  | { status: 409; error: 'payment_busy' }
  | { status: 422; error: 'action_not_allowed' }
  | { status: 502; error: 'link_failed' | 'email_failed' }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const CAPTURE_STATES: ReadonlySet<string> = new Set(['authorized', 'expired', 'failed', 'card_saved'])
const RETRY_STATES: ReadonlySet<string> = new Set(['card_saved', 'expired', 'failed'])
const RELEASE_STATES: ReadonlySet<string> = new Set(['card_saved', 'authorized', 'failed', 'expired', 'checkout_pending'])
const LINK_STATES: ReadonlySet<string> = new Set(['failed', 'balance_due'])
const LINK_STATES_COMPLETED: ReadonlySet<string> = new Set(['expired', 'card_saved', 'authorized'])

/** The trip is over for the operator's purposes: its status is completed. */
const isCompleted = (booking: BookingRow): boolean => booking.status === 'completed'

/**
 * The single action matrix (UI-SPEC "Actions", Research Pattern 12):
 *   capture    a completed trip in authorized | expired | failed | card_saved
 *   retry      card_saved | expired | failed (place the hold now before completion, re-run the charge after it)
 *   release    before completion, in card_saved | authorized | failed | expired | checkout_pending
 *   waive      balance_due
 *   send_link  failed | balance_due, or a completed trip in expired | card_saved | authorized
 * Nothing while a worker holds the lease (placing_hold, capturing), nothing after captured / released, and
 * nothing for a booking that is not a card hold (pay-now, partner bookings have no Prestigo money flow).
 */
export function allowedPaymentActions(booking: BookingRow): PaymentAction[] {
  if (booking.payment_mode !== 'card_hold') return []
  if (isPartnerBooking({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })) return []

  const state = str(booking.payment_state)
  const completed = isCompleted(booking)
  const actions: PaymentAction[] = []

  if (completed && CAPTURE_STATES.has(state)) actions.push('capture')
  if (RETRY_STATES.has(state)) actions.push('retry')
  if (!completed && RELEASE_STATES.has(state)) actions.push('release')
  if (state === 'balance_due') actions.push('waive')
  if (LINK_STATES.has(state) || (completed && LINK_STATES_COMPLETED.has(state))) actions.push('send_link')
  return actions
}

/** The `payment` object of the admin GET (the plan 88-07 contract). Built field by field: the raw row never leaves. */
export function toPaymentFacts(booking: BookingRow) {
  const pickupMs = pickupInstantMs({
    pickup_utc: typeof booking.pickup_utc === 'string' ? booking.pickup_utc : null,
    pickup_date: str(booking.pickup_date),
    pickup_time: str(booking.pickup_time),
  })
  const currency = booking.payment_currency === 'czk' ? 'czk' : booking.payment_currency === 'eur' ? 'eur' : null
  return {
    mode: str(booking.payment_mode) || 'pay_now',
    state: str(booking.payment_state) || 'none',
    currency,
    amount_minor: num(booking.payment_amount_minor),
    hold_amount_minor: num(booking.hold_amount_minor),
    captured_amount_minor: num(booking.captured_amount_minor) ?? 0,
    hold_at: str(booking.hold_at) || null,
    capture_before: str(booking.capture_before) || null,
    card_saved: str(booking.stripe_payment_method_id).length > 0,
    last_payment_error: str(booking.last_payment_error) || null,
    payment_retry_at: str(booking.payment_retry_at) || null,
    payment_retry_count: num(booking.payment_retry_count) ?? 0,
    recovery_link_url: str(booking.recovery_link_url) || null,
    pickup_at: pickupMs === null ? null : new Date(pickupMs).toISOString(),
    status: str(booking.status),
    completed: isCompleted(booking),
    booking_reference: str(booking.booking_reference),
    client_email: str(booking.client_email) || null,
  }
}

const NOT_ALLOWED: PaymentActionResult = { status: 422, error: 'action_not_allowed' }
const BUSY: PaymentActionResult = { status: 409, error: 'payment_busy' }

/** settleBooking outcome -> HTTP result: captured is ok; a decline is "declined"; a worker or a transient problem is busy. */
function fromSettle(result: SettleResult): PaymentActionResult {
  switch (result.outcome) {
    case 'captured':
      return { status: 200, outcome: 'ok' }
    case 'failed':
    case 'balance_due':
      return { status: 200, outcome: 'declined' }
    case 'busy':
    case 'transient':
      // A transient settle keeps its lease and attempt number: the sweep finishes it with the same idempotency key.
      return BUSY
    default:
      // noop (already settled meanwhile) / skipped (not completed, not a card hold, partner): nothing to do.
      return NOT_ALLOWED
  }
}

/**
 * Run one operator action. The caller has already checked allowedPaymentActions(booking) for the same row.
 * Never takes an amount. Throws only on infrastructure failures (ledger write, database); the route answers 500.
 */
export async function runPaymentAction(
  booking: BookingRow,
  action: PaymentAction,
  admin: { id: string },
): Promise<PaymentActionResult> {
  const bookingId = str(booking.id)
  const actor: LedgerActor = { type: 'admin', id: admin.id }

  // T-88-48: the audit row comes first, so an operator action is on record even if the engine call fails.
  await appendPaymentEvent(bookingId, {
    key: `admin:${action}:${bookingId}:${Date.now()}`,
    kind: 'admin_action',
    actor,
  })

  switch (action) {
    case 'capture':
      return fromSettle(await settleBooking(bookingId, actor))

    case 'retry': {
      // After the trip: re-run the charge (the settle claims the row with its own CAS and attempt-numbered keys).
      if (isCompleted(booking)) return fromSettle(await settleBooking(bookingId, actor))

      // Before the trip: "place hold now" (D-02). claimForHold is the CAS: a row the tick or another operator already
      // took is not applied and answers busy; placeHold then runs on the claimed row only.
      const claim = await claimForHold(bookingId, actor)
      if (!claim.applied) return BUSY
      const placed = await placeHold({ ...booking, ...(claim.booking ?? {}) }, actor)
      switch (placed.outcome) {
        case 'authorized':
          return { status: 200, outcome: 'ok' }
        case 'failed':
          return { status: 200, outcome: 'declined' }
        case 'transient':
          return BUSY
        default:
          // skipped: the pickup passed or is unknown, partner booking, state moved. Nothing was placed.
          return NOT_ALLOWED
      }
    }

    case 'release':
    case 'waive': {
      // D-04: release is the canary cancel path (no money taken); waive writes off a balance_due.
      const released = await releaseHold(booking, { actor, reason: action === 'waive' ? 'waive' : 'operator' })
      if (released === 'released') return { status: 200, outcome: 'ok' }
      return released === 'busy' ? BUSY : NOT_ALLOWED
    }

    case 'send_link': {
      // The outstanding amount comes from the row only (Pitfall 12: a link is a static URL for one amount).
      const dueMinor = (num(booking.payment_amount_minor) ?? 0) - (num(booking.captured_amount_minor) ?? 0)
      if (!Number.isInteger(dueMinor) || dueMinor <= 0) return NOT_ALLOWED

      const tag = `admin-${Date.now()}`
      const link = await refreshRecoveryLink(booking, dueMinor, tag)
      if (!link) return { status: 502, error: 'link_failed' }

      const sent = await sendPaymentEmail({
        kind: 'payment_failed',
        variant: 'declined',
        // The email shows the outstanding amount, not the booking total (same as the automatic failure email).
        booking: { ...booking, payment_amount_minor: dueMinor },
        eventKey: `email:payment_failed:${bookingId}:admin:${tag}`,
        payUrl: link.url,
      })
      if (sent === 'failed') return { status: 502, error: 'email_failed' }
      return { status: 200, outcome: 'ok' }
    }
  }
}
