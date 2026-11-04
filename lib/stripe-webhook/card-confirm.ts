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

import { after } from 'next/server'
import type Stripe from 'stripe'
import { advanceBookingStatus } from '@/lib/booking-status-service'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { applyTransition, appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'
import { sendPaymentEmail, bookingEmailDataFromRow } from '@/lib/payments/emails/send'
import { sendManagerAlert } from '@/lib/email'
import { scheduleQStashReminder } from '@/lib/qstash'
import { sendGa4Purchase } from '@/lib/analytics-server'
import { pickupInstantMs } from '@/lib/prague-date'

export type ConfirmOutcome = 'confirmed' | 'already_confirmed' | 'cancelled'

export const WEBHOOK_ACTOR: LedgerActor = { type: 'webhook', id: null }

type BookingRow = Record<string, unknown> & { id: string }

const SYSTEM_ACTOR: LedgerActor = { type: 'system', id: null }

const VEHICLE_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

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
 * Effects that must run once per booking confirmation: they run only when this delivery is the one whose
 * transition applied (a replay of the same event, or the tick reconcile after a webhook, applies nothing).
 * Each step is isolated: the booking is already confirmed and charged with nothing, so none may throw.
 */
async function firstTimeEffects(
  row: BookingRow,
  opts: { promoCode: string | null; holdScheduledKey: string | null; actor: LedgerActor },
): Promise<void> {
  // SEC-01: the promo code is claimed only now that the booking is confirmed (same rule as pay-now).
  if (opts.promoCode) {
    try {
      const { error } = await createSupabaseServiceClient().rpc('claim_promo_code', { p_code: opts.promoCode })
      if (error) console.error('[webhook] claim_promo_code failed', { bookingId: row.id })
    } catch {
      console.error('[webhook] claim_promo_code failed', { bookingId: row.id })
    }
  }

  const reference = typeof row.booking_reference === 'string' ? row.booking_reference : ''
  const vehicleClass = (typeof row.vehicle_class === 'string' && row.vehicle_class) || 'transfer'
  const tripType = (typeof row.trip_type === 'string' && row.trip_type) || 'transfer'
  const valueEur = typeof row.amount_eur === 'number' ? row.amount_eur : 0
  try {
    after(() =>
      sendGa4Purchase({
        transactionId: reference,
        valueEur,
        currency: 'EUR',
        items: [
          {
            item_id: vehicleClass,
            item_name: VEHICLE_LABELS[vehicleClass] ?? 'Chauffeur Transfer',
            item_category: tripType,
            item_variant: tripType,
            price: valueEur,
            quantity: 1,
          },
        ],
        siteLocale: typeof row.locale === 'string' ? row.locale : undefined,
      }),
    )
  } catch {
    console.error('[webhook] GA4 purchase not scheduled', { bookingId: row.id })
  }

  const pickupMs = pickupInstantMs({
    pickup_utc: typeof row.pickup_utc === 'string' ? row.pickup_utc : null,
    pickup_date: typeof row.pickup_date === 'string' ? row.pickup_date : '',
    pickup_time: typeof row.pickup_time === 'string' ? row.pickup_time : '',
  })
  if (pickupMs !== null) {
    try {
      const bookingId = row.id
      after(() => scheduleQStashReminder(bookingId, pickupMs))
    } catch {
      console.error('[webhook] reminder not scheduled', { bookingId: row.id })
    }
  }

  if (opts.holdScheduledKey) {
    try {
      await appendPaymentEvent(row.id, {
        key: opts.holdScheduledKey,
        kind: 'hold_scheduled',
        amountMinor: typeof row.payment_amount_minor === 'number' ? row.payment_amount_minor : undefined,
        currency: row.payment_currency === 'czk' ? 'czk' : row.payment_currency === 'eur' ? 'eur' : undefined,
        actor: opts.actor,
      })
    } catch {
      console.error('[webhook] hold_scheduled row not written', { bookingId: row.id })
    }
  }
}

/**
 * Effects that are idempotent by themselves (an update with a null guard, or a ledger event_key claimed
 * before the send), so they also run on a redelivery that finds the transition already applied: if a
 * crash cut a previous delivery short, the retry finishes the job without ever doubling a message.
 */
async function ledgerGuardedEffects(
  row: BookingRow,
  opts: {
    consent: { column: 'setup_intent_id' | 'payment_intent_id'; value: string }
    email: { kind: 'card_saved' | 'hold_placed'; eventKey: string; variant?: 'at_checkout' }
  },
): Promise<void> {
  // The consent the client accepted is now backed by a saved card / placed hold.
  const { error } = await createSupabaseServiceClient()
    .from('booking_payment_consents')
    .update({ confirmed_at: new Date().toISOString() })
    .eq(opts.consent.column, opts.consent.value)
    .is('confirmed_at', null)
  if (error) console.error('[webhook] consent confirmation failed', { bookingId: row.id })

  await sendPaymentEmail({ booking: row, ...opts.email })

  // English operator alert, once per card booking, claimed in the ledger before it is sent.
  const claim = await appendPaymentEvent(row.id, {
    key: `alert:new_booking:${row.id}`,
    kind: 'alert_sent',
    actor: SYSTEM_ACTOR,
  })
  if (claim.inserted) {
    try {
      await sendManagerAlert(bookingEmailDataFromRow(row))
    } catch {
      console.error('[webhook] operator alert failed', { bookingId: row.id })
    }
  }
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

  const moved = await applyTransition({
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

  // A booking cancelled meanwhile gets no email, no analytics and no reminder.
  if (cancelled) return
  // Lost race or a state that already moved on: nothing of ours to finish.
  if (!moved.applied && moved.duplicate !== true) return

  const row: BookingRow = { ...booking, ...(moved.booking ?? {}) }
  if (moved.applied) {
    await firstTimeEffects(row, { promoCode: metaString(si.metadata, 'promoCode'), holdScheduledKey: `hold_scheduled:${si.id}`, actor })
  }
  await ledgerGuardedEffects(row, {
    consent: { column: 'setup_intent_id', value: si.id },
    email: { kind: 'card_saved', eventKey: `email:card_saved:${booking.id}` },
  })
}

export async function handleSetupSucceeded(event: Stripe.Event): Promise<void> {
  await applySetupSucceeded(event.data.object as Stripe.SetupIntent, WEBHOOK_ACTOR)
}
