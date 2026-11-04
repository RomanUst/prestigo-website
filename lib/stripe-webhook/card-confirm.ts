// Booking confirmation for the card-on-file flow, driven by Stripe events (Phase 88, plan 88-09;
// HOLD-01, HOLD-03, PAYF-03).
//
// A save-card checkout creates ONE unpaid card_hold booking (lib/payments/checkout.ts) before Stripe talks
// to the browser; its SetupIntent success is what confirms it, in place, here. Nothing in this module
// creates a booking row: the legacy chain (saveBooking and friends) is never called for a card event.
//
// Exactly-once: the status move is a compare-and-set (advanceBookingStatus expectedFrom 'unpaid'), the
// payment move is a compare-and-set with a ledger event_key (applyTransition), and every side effect is
// either gated on "the transition applied for the first time" or keyed in the payment ledger.
//
// applySetupSucceeded / applyHoldNowAuthorized hold the whole effect so the payment tick (plan 88-11) can
// reconcile a missed webhook through the same code with actor 'system'.

import type Stripe from 'stripe'
import { advanceBookingStatus } from '@/lib/booking-status-service'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { applyTransition, type LedgerActor } from '@/lib/payments/state'

export type ConfirmOutcome = 'confirmed' | 'already_confirmed' | 'cancelled'

export const WEBHOOK_ACTOR: LedgerActor = { type: 'webhook', id: null }

type BookingRow = Record<string, unknown> & { id: string }

/** Stripe expandable field -> id string (or null). */
function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  return null
}

function metaString(metadata: Stripe.Metadata | null | undefined, key: string): string | null {
  const v = metadata?.[key]
  return typeof v === 'string' && v ? v : null
}

async function loadBooking(bookingId: string): Promise<BookingRow | null> {
  const { data, error } = await createSupabaseServiceClient()
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) throw new Error('card booking lookup failed')
  return (data as BookingRow | null) ?? null
}

/**
 * Confirm the booking the card checkout created: unpaid -> confirmed through the status service with the
 * 'payment-engine' profile (no side effect of its own). Lost race to another confirmation -> already_confirmed,
 * booking cancelled meanwhile -> cancelled. Any other failure throws so Stripe retries.
 */
export async function confirmCardBooking(
  booking: { id: string },
  source: 'card_setup' | 'card_hold_now',
): Promise<ConfirmOutcome> {
  const result = await advanceBookingStatus({
    bookingId: booking.id,
    to: 'confirmed',
    actor: { type: 'system', id: 'stripe_webhook' },
    source,
    profile: 'payment-engine',
    expectedFrom: 'unpaid',
  })
  if (result.ok) return 'confirmed'
  if (result.code === 'conflict') {
    if (result.currentStatus === 'cancelled') return 'cancelled'
    return 'already_confirmed'
  }
  throw new Error(`card booking confirmation failed: ${result.code}`)
}

/** Booking referenced by a card event, or null (logged with ids only) when there is nothing to act on. */
async function resolveBooking(
  eventLabel: string,
  stripeObjectId: string,
  metadata: Stripe.Metadata | null | undefined,
): Promise<BookingRow | null> {
  const bookingId = metaString(metadata, 'cofBookingId')
  if (!bookingId) {
    console.warn(`[webhook] ${eventLabel} without cofBookingId`, { stripeObjectId })
    return null
  }
  const booking = await loadBooking(bookingId)
  if (!booking) {
    console.warn(`[webhook] ${eventLabel} for an unknown booking`, { stripeObjectId, bookingId })
    return null
  }
  try {
    assertMoneyEligible({ booking_source: booking.booking_source as string | null | undefined })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) {
      console.warn(`[webhook] ${eventLabel} for a partner booking ignored`, { stripeObjectId, bookingId })
      return null
    }
    throw err
  }
  return booking
}

/**
 * SetupIntent succeeded (kind card_setup): confirm the booking once and move the payment
 * checkout_pending -> card_saved with the Customer and PaymentMethod ids. A booking cancelled meanwhile
 * moves checkout_pending -> released instead and is never re-confirmed.
 */
export async function applySetupSucceeded(si: Stripe.SetupIntent, actor: LedgerActor): Promise<void> {
  const booking = await resolveBooking('setup_intent.succeeded', si.id, si.metadata)
  if (!booking) return

  const outcome = await confirmCardBooking(booking, 'card_setup')
  const cancelled = outcome === 'cancelled'

  await applyTransition({
    bookingId: booking.id,
    from: ['checkout_pending'],
    to: cancelled ? 'released' : 'card_saved',
    patch: {
      stripe_customer_id: idOf(si.customer),
      stripe_payment_method_id: idOf(si.payment_method),
      setup_intent_id: si.id,
    },
    event: {
      key: `setup_succeeded:${si.id}`,
      kind: 'setup_succeeded',
      stripeObjectId: si.id,
      actor,
      errorCode: cancelled ? 'booking_cancelled' : undefined,
    },
  })
}

export async function handleSetupSucceeded(event: Stripe.Event): Promise<void> {
  await applySetupSucceeded(event.data.object as Stripe.SetupIntent, WEBHOOK_ACTOR)
}
