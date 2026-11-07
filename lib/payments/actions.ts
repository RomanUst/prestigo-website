// Operator payment actions for a card-hold booking (Phase 88, plan 88-15; HOLD-07, PAYF-01, D-04, D-13, D-14).
//
// One server-side action matrix (allowedPaymentActions) feeds the admin GET (so the PaymentPanel renders buttons
// from it and never re-implements it) and is re-checked by the admin POST. runPaymentAction runs one action through
// the engine with the admin actor. Server-only: the caller (the admin payment route) authenticates first.
//
// Money safety (T-88-47, T-88-49):
//   - no function here takes an amount: every amount is derived from the booking row by the engine. The one deliberate
//     exception lives elsewhere: POST /api/admin/bookings/[id]/fee (Phase 89, D-14) takes an amount from an operator,
//     validated against the fee case. The five Phase 89 names of PaymentAction below (charge_fee, waive_fee,
//     charge_saved_card, mark_cash_settled, reopen_cash) are DISPLAY names for that route: runPaymentAction does not
//     run them and the payment route's schema does not accept them;
//   - every action first appends an admin_action ledger row (the audit trail survives an engine failure);
//   - capture / retry go through the engine's CAS claim, so a double click or a race with the completion consumer or
//     the tick sweep produces one Stripe call and the loser answers 409 payment_busy.

import { isPartnerBooking } from '@/lib/booking-status'
import { CASH_TRIP_STATUSES } from '@/lib/payments/cash'
import { pickupInstantMs } from '@/lib/prague-date'
import { isFeeEligible } from '@/lib/payments/fee'
import { claimForHold, leaseLapsed, placeHold, releaseHold } from '@/lib/payments/hold'
import { refreshRecoveryLink } from '@/lib/payments/recovery'
import { settleBooking, type SettleResult } from '@/lib/payments/settle'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'

type BookingRow = Record<string, unknown>

/** The actions runPaymentAction executes (the payment route's schema accepts exactly these). */
export type ExecutablePaymentAction = 'capture' | 'retry' | 'release' | 'waive' | 'send_link'
/** Phase 89 decisions: shown by the matrix, executed by the fee route (they may carry an amount or a note). */
export type FeeRouteAction =
  | 'charge_fee'
  | 'waive_fee'
  | 'charge_saved_card'
  | 'mark_cash_settled'
  | 'reopen_cash'
  | 'close_refunded'
  | 'open_fee_case'
export type PaymentAction = ExecutablePaymentAction | FeeRouteAction

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
// 88-REVIEW T2 (A-CR-02, C-WR-03): a payment link is offered only for a debt the engine will NOT collect by itself
// and that the recovery webhook can close (failed, balance_due). A completed trip in authorized / card_saved / expired
// is still settled automatically (tick step C, the completion event): the operator action there is capture, never a
// link the client could pay on top of the capture.
const LINK_STATES: ReadonlySet<string> = new Set(['failed', 'balance_due'])
/** Terminal trip statuses: no hold is placed, no money is asked for; only a hold that is still live can be released. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'no_show'])

/** The trip is over for the operator's purposes: its status is completed. */
const isCompleted = (booking: BookingRow): boolean => booking.status === 'completed'

/** A cash trip that is on or done (CASH_TRIP_STATUSES: cash can be collected, the saved card charged). */
const isTripStatus = (status: string): boolean => CASH_TRIP_STATUSES.includes(status)

/**
 * The single action matrix (UI-SPEC "Actions", Research Pattern 12):
 *   capture    a completed trip in authorized | expired | failed | card_saved
 *   retry      card_saved | expired | failed (place the hold now before completion, re-run the charge after it)
 *   release    before completion, in card_saved | authorized | failed | expired | checkout_pending
 *   waive      balance_due
 *   send_link  failed | balance_due (never where the engine still collects by itself)
 * Nothing while a worker holds the lease (placing_hold, capturing; a placing_hold whose lease lapsed gets release, and
 * capture after the trip), nothing after captured / released, and
 * nothing for a booking that is not a card hold (pay-now, partner bookings have no Prestigo money flow).
 *
 * Phase 89 (display names, executed by the fee route):
 *   charge_fee, waive_fee   a cancelled or no-show booking with a PENDING fee case whose money can still be taken or was
 *                           collected (isFeeEligible). Release is NOT offered next to them: it would destroy the fee. A pending
 *                           case with nothing left to take (a card released under it) keeps waive_fee, which closes it with
 *                           no money step: no case may stay pending for good (money WR-03).
 *                           A closed booking with no case keeps release (to free a hold or card that is still there) and,
 *                           where a fee could still be taken, open_fee_case: the case failed to open (money WR-02). The fee
 *                           route decides from the row whether that cancel was late at all. A cancelled pay-now row gets it
 *                           from the admin GET, only after the case_missing alert: most of those were simply refunded.
 *   cash booking            card_saved | failed on a trip that is on or done: charge_saved_card and mark_cash_settled
 *                           (a failed card during the trip is paid to the driver in cash, D-21); cash_settled:
 *                           reopen_cash (D-22); release only once the booking is closed, or for a checkout nobody finished:
 *                           released is terminal, so on a live trip it would remove the driver's cash step (money WR-07). A
 *                           failed row keeps send_link only after the trip (during it, nothing is sent to the passenger).
 * The admin POST re-checks this matrix on a fresh row before running any action (server-side, not only the UI).
 */
export function allowedPaymentActions(booking: BookingRow): PaymentAction[] {
  if (isPartnerBooking({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })) return []

  const mode = booking.payment_mode
  if (mode !== 'card_hold' && mode !== 'cash_guarantee' && mode !== 'pay_now') return []

  const state = str(booking.payment_state)
  const status = str(booking.status)
  // 88-REVIEW A-WR-06: a hold placement whose lease lapsed (its worker died) is no longer busy: it can be released, and
  // after the trip captured (the settle adopts the row and finds the authorization the dead worker may have created).
  const stalePlacement = state === 'placing_hold' && leaseLapsed(booking)
  const closed = CLOSED_STATUSES.has(status)

  // Phase 89: a pending fee case on a closed booking is decided by a person; nothing else is offered next to it.
  if (closed && booking.fee_case_status === 'pending') {
    const busy = state === 'capturing' || (state === 'placing_hold' && !stalePlacement)
    if (busy) return []
    return isFeeEligible(booking) ? ['charge_fee', 'waive_fee'] : ['waive_fee']
  }

  const openable: PaymentAction[] =
    closed && !booking.fee_case_status && isFeeEligible(booking) && state !== 'capturing' ? ['open_fee_case'] : []

  if (mode === 'pay_now') return status === 'no_show' ? openable : []

  if (mode === 'cash_guarantee') {
    if (state === 'cash_settled') return ['reopen_cash']
    if (closed) return [...openable, ...(RELEASE_STATES.has(state) ? (['release'] as const) : [])]
    const cashActions: PaymentAction[] = []
    const completed = isCompleted(booking)
    if ((state === 'card_saved' || state === 'failed') && isTripStatus(status)) {
      cashActions.push('charge_saved_card', 'mark_cash_settled')
    }
    if (!completed && state !== 'card_saved' && state !== 'failed' && RELEASE_STATES.has(state)) cashActions.push('release')
    if (completed && state === 'failed') cashActions.push('send_link')
    return cashActions
  }

  if (closed) return [...openable, ...(RELEASE_STATES.has(state) || stalePlacement ? (['release'] as const) : [])]

  const completed = isCompleted(booking)
  const actions: PaymentAction[] = []

  if (stalePlacement) return completed ? ['capture', 'release'] : ['release']
  if (completed && CAPTURE_STATES.has(state)) actions.push('capture')
  if (RETRY_STATES.has(state)) actions.push('retry')
  if (!completed && RELEASE_STATES.has(state)) actions.push('release')
  if (state === 'balance_due') actions.push('waive')
  if (LINK_STATES.has(state)) actions.push('send_link')
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
  action: ExecutablePaymentAction,
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
