// Lifetime of the recovery Payment Link (Phase 88, 88-REVIEW T1: A-CR-01, B-CR-02, C-CR-02).
//
// A recovery link lives exactly as long as the debt it was created for. Every transition that secures the money
// another way (a hold is placed, a capture or charge succeeds, the hold is released, the link itself is paid) clears
// the link columns in the SAME compare-and-set (RECOVERY_LINK_CLEARED) and then deactivates the link the row held
// (retireRecoveryLink). A link payment that still slips through (a Checkout Session the client opened before the
// deactivation) is refunded automatically by the recovery webhook and alerted (lib/stripe-webhook/recovery-events.ts).
//
// Its own module so the engine modules can share it without importing the whole recovery step.

import { deactivateBookingPaymentLink } from '@/lib/stripe-payment-links'

type BookingRow = Record<string, unknown>

/** Patch keys that drop the recovery link from the booking row (allow-listed columns of the payment transition). */
export const RECOVERY_LINK_CLEARED = { recovery_link_id: null, recovery_link_url: null } as const

/** Deactivate the recovery link the row held before the transition that cleared it. Never throws. */
export async function retireRecoveryLink(booking: BookingRow): Promise<void> {
  const linkId = typeof booking.recovery_link_id === 'string' ? booking.recovery_link_id : ''
  if (!linkId) return
  try {
    await deactivateBookingPaymentLink(linkId)
  } catch {
    // The webhook refunds a payment on a stale link (handleRecoveryPaid), so this is never a double charge.
    console.error('[recovery] recovery link not deactivated', { bookingId: typeof booking.id === 'string' ? booking.id : null })
  }
}
