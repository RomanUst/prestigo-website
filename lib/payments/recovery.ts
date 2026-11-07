// Failure recovery of the card-on-file flow (Phase 88, plan 88-14; HOLD-05, D-13, D-14, D-15, Research Pattern 8,
// Pitfall 12).
//
// A declined scheduled hold, fallback charge or difference charge (including authentication_required) ends here:
//   1. a recovery Payment Link for the outstanding amount (kind card_recovery, stored in recovery_link_id /
//      recovery_link_url, separate from the pay-now payment_link_*),
//   2. the localized payment_failed email with that link (variant auth_required for authentication_required),
//   3. the operator alert to MANAGER_EMAIL (Resend, no VPS dependency).
// Each step is claimed through a ledger event key per phase and attempt, so a replay (webhook backup, re-driven
// sweep) sends nothing twice. Nothing here changes payment_state except the recovery-link self-loop, and nothing
// ever cancels a booking (D-15): the operator decides.
//
// Phase 89 (plan 89-06) adds the phase 'fee': a declined late-cancel / no-show fee, or a cash card charge after the trip.
// It runs the same three steps with the fee variant of the email, link tag f<attempt> and the charge_failed alert, and it
// accepts a cash_guarantee row. Nothing here retries a charge: a person decides (T-89-18).
//
// Pitfall 12: a recovery link is a static URL for one amount. refreshRecoveryLink therefore deactivates the link
// it replaces, so a stale link can never charge an outdated amount.

import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { sendPaymentOperatorAlert, type OperatorAlertKind } from '@/lib/payments/alerts'
import { applyTransition, isLegalTransition, type PaymentState } from '@/lib/payments/state'
import { createRecoveryPaymentLink, deactivateBookingPaymentLink } from '@/lib/stripe-payment-links'

type BookingRow = Record<string, unknown>

export type FailurePhase = 'hold' | 'charge' | 'difference' | 'fee'

export interface PaymentFailureInput {
  phase: FailurePhase
  /** Stripe decline / error code (never a message). */
  code: string
  /** The outstanding amount in minor units of the booking currency (never client-supplied). */
  amountMinor: number
  /** The attempt counter AFTER the failure (hold_attempts / charge_attempts as persisted). */
  attempt: number
  /** Phase 'fee' only: what the amount is for (cancellation fee, no-show fee, or the trip itself on a cash booking). */
  feeLabel?: 'cancellation' | 'no_show' | 'trip'
}

const RECOVERY_ACTOR = { type: 'system', id: 'payment_recovery' } as const

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * The link tag of a failure: the plain attempt number for a hold (key link:<id>:<n>), and a phase prefix for the
 * charge and the difference, so a later charge failure can never collide with the idempotency key of an earlier
 * hold failure that carried a different amount.
 */
function linkTag(phase: FailurePhase, attempt: number): string | number {
  if (phase === 'hold') return attempt
  return `${phase === 'charge' ? 'c' : phase === 'fee' ? 'f' : 'd'}${attempt}`
}

/**
 * Create the recovery link for `amountMinor`, deactivate the one it replaces and persist the new one through a
 * self-loop transition with a recovery_link_created ledger row (key recovery_link:<id>:<tag>).
 * Returns null when no usable link results (creation failed, the booking is not in a payable state or moved
 * meanwhile); never throws.
 */
export async function refreshRecoveryLink(
  booking: BookingRow,
  amountMinor: number,
  tag: string | number,
): Promise<{ url: string; id: string } | null> {
  const bookingId = str(booking.id)
  const currency = booking.payment_currency === 'czk' ? 'czk' : booking.payment_currency === 'eur' ? 'eur' : null
  const state = str(booking.payment_state) as PaymentState
  const oldLinkId = str(booking.recovery_link_id)

  const deactivate = async (linkId: string): Promise<void> => {
    try {
      await deactivateBookingPaymentLink(linkId)
    } catch {
      console.error('[recovery] stale recovery link not deactivated', { bookingId })
    }
  }

  if (!bookingId || !currency || !Number.isInteger(amountMinor) || amountMinor <= 0 || !isLegalTransition([state], state)) {
    console.error('[recovery] no recovery link for this booking', { bookingId })
    return null
  }

  let link: { url: string; id: string }
  try {
    // The create is idempotent per tag: a replay returns the same link, never a second one.
    link = await createRecoveryPaymentLink({
      bookingId,
      bookingReference: str(booking.booking_reference),
      amountMinor,
      currency,
      tag,
    })
  } catch {
    console.error('[recovery] recovery link creation failed', { bookingId })
    // The old link belongs to an earlier amount: it must not stay payable (Pitfall 12).
    if (oldLinkId) await deactivate(oldLinkId)
    return null
  }

  if (oldLinkId && oldLinkId !== link.id) await deactivate(oldLinkId)

  try {
    const moved = await applyTransition({
      bookingId,
      from: [state],
      to: state,
      patch: { recovery_link_id: link.id, recovery_link_url: link.url },
      event: {
        key: `recovery_link:${bookingId}:${tag}`,
        kind: 'recovery_link_created',
        stripeObjectId: link.id,
        amountMinor,
        currency,
        actor: RECOVERY_ACTOR,
      },
    })
    if (!moved.applied && moved.duplicate !== true) {
      // The booking left the state meanwhile (for example the client paid an earlier link): do not send this one.
      await deactivate(link.id)
      return null
    }
  } catch {
    // The link is valid at Stripe and goes to the client; only the stored copy is missing (admin can re-send).
    console.error('[recovery] recovery link not persisted', { bookingId })
  }
  return link
}

const ALERT_KIND: Record<FailurePhase, OperatorAlertKind> = {
  hold: 'hold_failed',
  charge: 'charge_failed',
  difference: 'balance_unpaid',
  fee: 'charge_failed',
}

/**
 * A hold, charge or difference was declined: link -> client email -> operator alert, each exactly once per phase
 * and attempt. `booking` is the row AFTER the failure transition (state failed | balance_due, retry fields set).
 * Never throws; a problem in one step never skips the next one, in particular a failed link still alerts the operator.
 */
export async function handlePaymentFailure(booking: BookingRow, input: PaymentFailureInput): Promise<void> {
  const bookingId = str(booking.id)
  // Money-eligibility gate (assumption-delta invariant): a partner booking has no Prestigo money flow and only a
  // card_hold booking has a recovery link; nothing below (Stripe link, client email) runs for any other booking.
  try {
    assertMoneyEligible({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) {
      console.warn('[recovery] partner booking skipped', { bookingId })
      return
    }
    throw err
  }
  // A cash_guarantee booking reaches the recovery flow only through the fee phase (a fee, or the trip after it ended).
  if (booking.payment_mode !== 'card_hold' && !(input.phase === 'fee' && booking.payment_mode === 'cash_guarantee')) return
  const kind = ALERT_KIND[input.phase]
  const tag = linkTag(input.phase, input.attempt)

  let link: { url: string; id: string } | null = null
  try {
    link = await refreshRecoveryLink(booking, input.amountMinor, tag)
  } catch {
    console.error('[recovery] recovery link step failed', { bookingId })
  }

  if (link) {
    try {
      await sendPaymentEmail({
        kind: 'payment_failed',
        variant: input.phase === 'fee' ? 'fee' : input.code === 'authentication_required' ? 'auth_required' : 'declined',
        // The email shows the outstanding amount (a difference, or the full amount), not the booking total.
        booking: { ...booking, payment_amount_minor: input.amountMinor },
        eventKey: `email:payment_failed:${bookingId}:${input.phase}:${input.attempt}`,
        payUrl: link.url,
        ...(input.phase === 'fee' ? { feeMinor: input.amountMinor, feeLabel: input.feeLabel ?? 'cancellation' } : {}),
      })
    } catch {
      console.error('[recovery] payment_failed email failed', { bookingId })
    }
  }

  // The retry instant only counts while the one automatic retry is still unused (D-13).
  const retryAtIso =
    input.phase !== 'difference' &&
    input.phase !== 'fee' &&
    (typeof booking.payment_retry_count === 'number' ? booking.payment_retry_count : 0) === 0 &&
    typeof booking.payment_retry_at === 'string'
      ? booking.payment_retry_at
      : null

  try {
    await sendPaymentOperatorAlert(kind, booking, {
      eventKey: `alert:${kind}:${bookingId}:${input.attempt}`,
      code: input.code,
      amountMinor: input.amountMinor,
      retryAtIso,
      ...(input.phase === 'difference' ? { diffMinor: input.amountMinor } : {}),
      ...(link ? {} : { note: 'link_failed' }),
    })
  } catch {
    console.error('[recovery] operator alert failed', { bookingId, kind })
  }
}
