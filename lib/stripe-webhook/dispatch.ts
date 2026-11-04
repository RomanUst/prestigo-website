// Stripe webhook routing by purpose for the card-on-file flow (Phase 88, plan 88-09; PAYF-03).
//
// app/api/webhooks/stripe/route.ts calls dispatchPaymentEvent(event) right after the signature check.
// Every card-flow event is answered here and never reaches the legacy chain; every other event falls
// through to the legacy chain untouched. The legacy chain builds BOOKINGS from payment events
// (payment_intent.succeeded -> saveBooking), so a card object that slipped into it would create a
// duplicate booking: card objects therefore carry `kind` (card_*) and `cofBookingId` and never the
// legacy booking-id key (lib/payments/stripe.ts cardMetadata), and this module routes on `kind`.
//
// Rules:
//   - a card event NEVER creates a booking row; it only confirms, in place, the row the checkout made;
//   - an unknown card_ kind, a card event without cofBookingId and a missing booking are logged with ids
//     only and acknowledged 200 without a write (Stripe must not retry what no retry can fix);
//   - replays: SEC-10 order (read-check -> side effect -> claim) on stripe_processed_events, plus the
//     payment ledger event_key inside every handler;
//   - logs carry the event id, the kind and the booking id only.
//
// This file lives in lib/stripe-webhook/ (not lib/webhook-*): tests/webhook-isolation-guard.test.ts
// scans the lib/webhook-* prefix, and tests/payment-state-writers-gate.test.ts keeps this folder free
// of payment RPC names and of the card-flow canary setting.

import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { appendPaymentEvent } from '@/lib/payments/state'
import { handleHoldNowAuthorized, handleSetupFailed, handleSetupSucceeded } from '@/lib/stripe-webhook/card-confirm'
import { handleCardChargeFailed, handleCardChargeSucceeded } from '@/lib/stripe-webhook/charge-events'
import { handleHoldAuthorized, handleHoldCanceled, handleHoldFailed } from '@/lib/stripe-webhook/hold-events'
import { handleDispute, handleRecoveryPaid } from '@/lib/stripe-webhook/recovery-events'

/** The six event types the card flow adds to the endpoint (infra/stripe/webhook-events.mjs REQUIRED_EVENTS). */
export const CARD_EVENT_TYPES = [
  'setup_intent.succeeded',
  'setup_intent.setup_failed',
  'payment_intent.amount_capturable_updated',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.dispute.created',
] as const

export type PaymentRoute =
  | 'setup_succeeded'
  | 'setup_failed'
  | 'hold_now_authorized'
  | 'hold_authorized'
  | 'pi_failed'
  | 'pi_canceled'
  | 'charge_succeeded'
  | 'recovery_paid'
  | 'dispute'
  | 'refund_observe'
  | 'unrouted'

export interface PaymentEventClass {
  route: PaymentRoute
  kind: string | null
  bookingId: string | null
}

type EventHandler = (event: Stripe.Event) => Promise<void>

/** payment_intent.payment_failed: the scheduled hold (card_hold) or an off-session charge / difference (88-13). */
async function handlePaymentFailed(event: Stripe.Event): Promise<void> {
  const kind = metadataOf(event).kind
  if (kind === 'card_charge' || kind === 'card_difference') return handleCardChargeFailed(event)
  return handleHoldFailed(event)
}

/**
 * Route -> handler. 88-09 registered the three confirmation routes; 88-11 adds the hold lifecycle routes
 * (hold_authorized, pi_canceled, pi_failed); 88-13 adds charge_succeeded and chains the charge / difference
 * failures into pi_failed; 88-14 adds recovery_paid and dispute.
 * A classified route without a handler is logged and acknowledged.
 */
export const ROUTES: Partial<Record<PaymentRoute, EventHandler>> = {
  setup_succeeded: handleSetupSucceeded,
  setup_failed: handleSetupFailed,
  hold_now_authorized: handleHoldNowAuthorized,
  hold_authorized: handleHoldAuthorized,
  pi_canceled: handleHoldCanceled,
  pi_failed: handlePaymentFailed,
  charge_succeeded: handleCardChargeSucceeded,
  // 88-14: a paid recovery link closes the failed booking (session and PaymentIntent events share one ledger key);
  // a dispute on a card booking alerts the operator. Both route here before the legacy chain.
  recovery_paid: handleRecoveryPaid,
  dispute: handleDispute,
}

function metadataOf(event: Stripe.Event): Record<string, unknown> {
  const object = (event.data as { object?: unknown } | undefined)?.object
  const metadata = object && typeof object === 'object' ? (object as { metadata?: unknown }).metadata : undefined
  return metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}
}

/**
 * null = not a card event: the legacy chain handles it exactly as before. A card event is an object whose
 * metadata.kind starts with `card_`, plus the dispute and refund events (their objects carry no metadata,
 * so the booking is found through the charge's PaymentIntent by the later handlers).
 */
export function classifyPaymentEvent(event: Stripe.Event): PaymentEventClass | null {
  const meta = metadataOf(event)
  const kind = typeof meta.kind === 'string' && meta.kind ? meta.kind : null
  const bookingId = typeof meta.cofBookingId === 'string' && meta.cofBookingId ? meta.cofBookingId : null
  const isCard = kind !== null && kind.startsWith('card_')
  const make = (route: PaymentRoute): PaymentEventClass => ({ route, kind, bookingId })

  switch (event.type) {
    case 'charge.refunded':
      return make('refund_observe')
    case 'charge.dispute.created':
      return make('dispute')
    case 'setup_intent.succeeded':
      if (!isCard) return null
      return make(kind === 'card_setup' ? 'setup_succeeded' : 'unrouted')
    case 'setup_intent.setup_failed':
      if (!isCard) return null
      return make(kind === 'card_setup' ? 'setup_failed' : 'unrouted')
    case 'payment_intent.amount_capturable_updated':
      if (!isCard) return null
      if (kind === 'card_hold_now') return make('hold_now_authorized')
      if (kind === 'card_hold') return make('hold_authorized')
      return make('unrouted')
    case 'payment_intent.payment_failed':
      return isCard ? make('pi_failed') : null
    case 'payment_intent.canceled':
      return isCard ? make('pi_canceled') : null
    case 'payment_intent.succeeded':
      if (!isCard) return null
      if (kind === 'card_recovery') return make('recovery_paid')
      if (kind === 'card_charge' || kind === 'card_hold' || kind === 'card_hold_now' || kind === 'card_difference') {
        return make('charge_succeeded')
      }
      return make('unrouted')
    case 'checkout.session.completed':
      if (!isCard) return null
      return make(kind === 'card_recovery' ? 'recovery_paid' : 'unrouted')
    default:
      return isCard ? make('unrouted') : null
  }
}

/**
 * SEC-10 helper, the same order as the legacy branches: read-check stripe_processed_events, run the side
 * effect, then claim the event id (ignoring 23505, a concurrent delivery). A crash between the handler and
 * the claim makes Stripe retry, and every handler is idempotent through the payment ledger event_key.
 */
export async function once(event: Stripe.Event, handler: EventHandler): Promise<NextResponse> {
  const supabase = createSupabaseServiceClient()

  if (event.id) {
    const { data: existing } = await supabase
      .from('stripe_processed_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle()
    if (existing) return NextResponse.json({ received: true, duplicate: true })
  }

  await handler(event)

  if (event.id) {
    const { error: claimErr } = await supabase
      .from('stripe_processed_events')
      .insert({ event_id: event.id, event_type: event.type })
    if (claimErr) {
      const code = (claimErr as { code?: string }).code
      if (code !== '23505') {
        console.error('[webhook] card event stripe_processed_events insert failed', { eventId: event.id })
      }
    }
  }
  return NextResponse.json({ received: true })
}

/**
 * charge.refunded on a card_hold booking: one refund_observed ledger row (key refund_observed:<charge>:<amount>,
 * so the same event again adds nothing). Observation only: it never short-circuits the shipped refund handler,
 * which still runs and keeps completed / no_show trips as they are. Errors are logged and swallowed for that reason.
 */
async function observeRefund(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : ((charge.payment_intent as { id?: string } | null)?.id ?? null)
  if (!paymentIntentId || !charge.id) return

  const { data } = await createSupabaseServiceClient()
    .from('bookings')
    .select('id, payment_mode')
    .eq('payment_intent_id', paymentIntentId)
  const rows = Array.isArray(data) ? (data as Array<{ id: string; payment_mode?: string | null }>) : []
  const currency = charge.currency === 'czk' ? 'czk' : charge.currency === 'eur' ? 'eur' : undefined
  for (const row of rows.filter((r) => r.payment_mode === 'card_hold')) {
    await appendPaymentEvent(row.id, {
      key: `refund_observed:${charge.id}:${charge.amount_refunded}`,
      kind: 'refund_observed',
      stripeObjectId: charge.id,
      amountMinor: charge.amount_refunded,
      currency,
      actor: { type: 'webhook', id: null },
    })
  }
}

export async function dispatchPaymentEvent(
  event: Stripe.Event,
): Promise<{ handled: true; response: NextResponse } | { handled: false }> {
  const cls = classifyPaymentEvent(event)
  if (!cls) return { handled: false }

  // A refund is observed for card bookings, but the shipped refund handler still runs afterwards.
  if (cls.route === 'refund_observe') {
    try {
      await observeRefund(event)
    } catch {
      console.error('[webhook] refund observation failed', { eventId: event.id })
    }
    return { handled: false }
  }

  const handler = ROUTES[cls.route]
  if (!handler) {
    console.log('[webhook] card event acknowledged without a handler', {
      eventId: event.id,
      type: event.type,
      route: cls.route,
      kind: cls.kind,
      bookingId: cls.bookingId,
    })
    return { handled: true, response: NextResponse.json({ received: true }) }
  }

  try {
    return { handled: true, response: await once(event, handler) }
  } catch (err) {
    // 500 makes Stripe retry; the handlers are idempotent. Ids and the static error text only.
    console.error('[webhook] card event handler failed', {
      eventId: event.id,
      type: event.type,
      kind: cls.kind,
      bookingId: cls.bookingId,
      error: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    })
    return { handled: true, response: NextResponse.json({ error: 'card event handler failed' }, { status: 500 }) }
  }
}
