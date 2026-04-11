import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  saveBooking,
  withRetry,
  buildBookingRow,
  buildBookingRows,
  saveRoundTripBookings,
  createSupabaseServiceClient,
} from '@/lib/supabase'
import {
  sendClientConfirmation,
  sendManagerAlert,
  sendEmergencyAlert,
  sendRoundTripClientConfirmation,
  sendRoundTripManagerAlert,
} from '@/lib/email'
import type { BookingEmailData, RoundTripEmailData } from '@/lib/email'
import { buildIcs, type IcsEvent } from '@/lib/ics'
import { safePiiSummary } from '@/lib/request-guards'

// Lazy init — STRIPE_SECRET_KEY is Production-only; avoid module-load crash in Preview
// NOTE: the env-var guard is intentionally placed AFTER new Stripe() so the test mock
// (which replaces the Stripe constructor entirely) can intercept without needing the key.
let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  }
  return _stripe
}

export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature')
  const body = await request.text() // MUST be .text() — NOT .json()

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  // ── MED-1: Event-level idempotency via stripe_processed_events ──
  // payment_intent.succeeded is already idempotent via the
  // (payment_intent_id, leg) UNIQUE on bookings, but charge.refunded
  // and any future event types are not. This insert uses the PRIMARY
  // KEY on event_id to atomically claim the event: on first delivery
  // we insert and continue; on every subsequent retry Stripe will
  // retry until we return 2xx, and the 23505 short-circuit here
  // makes the retry a cheap no-op rather than re-running the handler.
  {
    const supabase = createSupabaseServiceClient()
    const { error: claimErr } = await supabase
      .from('stripe_processed_events')
      .insert({ event_id: event.id, event_type: event.type })
    if (claimErr) {
      const code = (claimErr as { code?: string }).code
      if (code === '23505') {
        // Duplicate event — already processed, respond 2xx so Stripe stops retrying.
        return NextResponse.json({ received: true, duplicate: true })
      }
      // Transient DB error — let Stripe retry the whole event later.
      console.error('[webhook] stripe_processed_events insert failed:', claimErr.message)
      return NextResponse.json({ error: 'Transient DB error' }, { status: 500 })
    }
  }

  if (event.type === 'charge.refunded') {
    await handleChargeRefunded(event.data.object as Stripe.Charge)
    return NextResponse.json({ received: true })
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const meta = (paymentIntent.metadata ?? {}) as Record<string, string>

    // Reconciled D-01: Phase 26 emits tripType='round_trip' + returnBookingReference (non-empty)
    // for round-trip charges. No isRoundTrip key is emitted. Signal is tripType + non-empty ref.
    const isRoundTrip =
      meta.tripType === 'round_trip' &&
      typeof meta.returnBookingReference === 'string' &&
      meta.returnBookingReference.length > 0

    if (isRoundTrip) {
      // D-04: sibling if-block — new round-trip branch, one-way branch left untouched
      await handleRoundTripSucceeded(paymentIntent, meta)
      return NextResponse.json({ received: true })
    }

    // Inconsistent metadata (tripType set but no return ref, or vice versa) — log + fall through.
    // Routed through safePiiSummary so the log line cannot leak firstName/email/phone/address
    // even if someone expands this call site later to include more context.
    if (meta.tripType === 'round_trip' || (meta.returnBookingReference && meta.returnBookingReference.length > 0)) {
      console.error(
        'payment_intent.succeeded: inconsistent round-trip metadata; falling back to one-way',
        {
          ...safePiiSummary(meta),
          hasReturnRef: Boolean(meta.returnBookingReference),
        }
      )
    }

    await handleOneWaySucceeded(paymentIntent, meta)
    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}

// ─────────────────────────────────────────────────────────────────────────
// ONE-WAY HANDLER — extracted from original route.ts lines 53-124, unchanged (D-04)
// ─────────────────────────────────────────────────────────────────────────

async function handleOneWaySucceeded(
  paymentIntent: Stripe.PaymentIntent,
  meta: Record<string, string>
): Promise<void> {
  const bookingReference = meta.bookingReference || 'UNKNOWN'
  const bookingRow = buildBookingRow(meta, paymentIntent.id, 'confirmed')

  let inserted: { id: string }[] = []
  try {
    inserted = await withRetry(() => saveBooking(bookingRow), 3, 1000)
  } catch (err) {
    console.error(
      'Supabase save failed after 3 retries:',
      err instanceof Error ? err.message : 'Unknown error'
    )
    await sendEmergencyAlert(bookingReference, bookingRow)
    return
  }

  // Duplicate event — row already existed, emails already sent
  if (inserted.length === 0) return

  const emailData: BookingEmailData = {
    bookingReference,
    tripType: meta.tripType || '',
    originAddress: meta.originAddress || meta.origin || '',
    destinationAddress: meta.destinationAddress || meta.destination || '',
    pickupDate: meta.pickupDate || '',
    pickupTime: meta.pickupTime || '',
    returnDate: meta.returnDate || undefined,
    vehicleClass: meta.vehicleClass || '',
    passengers: parseInt(meta.passengers) || 1,
    luggage: parseInt(meta.luggage) || 0,
    hours: meta.hours ? parseInt(meta.hours) : undefined,
    distanceKm: meta.distanceKm ? parseFloat(meta.distanceKm) : undefined,
    amountCzk: parseInt(meta.amountCzk) || Math.round(paymentIntent.amount / 100),
    extraChildSeat: meta.extraChildSeat === 'true',
    extraMeetGreet: meta.extraMeetGreet === 'true',
    extraLuggage: meta.extraLuggage === 'true',
    firstName: meta.firstName || '',
    lastName: meta.lastName || '',
    email: meta.email || '',
    phone: meta.phone || '',
    flightNumber: meta.flightNumber || undefined,
    terminal: meta.terminal || undefined,
    specialRequests: meta.specialRequests || undefined,
  }

  try { await sendClientConfirmation(emailData) } catch (err) {
    console.error('sendClientConfirmation unexpected error:', err)
  }
  try { await sendManagerAlert(emailData) } catch (err) {
    console.error('sendManagerAlert unexpected error:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ROUND-TRIP HANDLER — Phase 27
// ─────────────────────────────────────────────────────────────────────────

async function handleRoundTripSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  meta: Record<string, string>
): Promise<void> {
  const outboundRef = meta.bookingReference || 'UNKNOWN'
  // D-03: buildBookingRows returns BOTH rows in one call
  const { outbound: outboundRow, return: returnRow } = buildBookingRows(meta, paymentIntent.id)

  let pair: { outbound_id: string; return_id: string } | null = null
  try {
    // D-02: saveRoundTripBookings returns IDs only; null on 23505 (idempotent retry)
    pair = await withRetry(() => saveRoundTripBookings(outboundRow, returnRow), 3, 1000)
  } catch (err) {
    console.error(
      'saveRoundTripBookings failed after 3 retries:',
      err instanceof Error ? err.message : 'Unknown error'
    )
    await sendEmergencyAlert(outboundRef, outboundRow as unknown as Record<string, unknown>)
    return
  }

  if (!pair) return // Idempotent retry — emails already sent on first delivery

  // Build email data from authoritative metadata
  const combinedAmountCzk = parseInt(meta.amountCzk) || Math.round(paymentIntent.amount / 100)
  const outboundAmountCzk = meta.outboundAmountCzk ? parseInt(meta.outboundAmountCzk) : 0
  const returnAmountCzk = meta.returnAmountCzk ? parseInt(meta.returnAmountCzk) : 0
  const returnDiscountPct = meta.returnDiscountPct ? parseInt(meta.returnDiscountPct) : 0
  const promoDiscountPct = meta.discountPct ? parseInt(meta.discountPct) : 0

  const emailData: RoundTripEmailData = {
    outboundBookingReference: outboundRef,
    returnBookingReference: meta.returnBookingReference,
    tripType: 'round_trip',
    originAddress: meta.originAddress || meta.origin || '',
    destinationAddress: meta.destinationAddress || meta.destination || '',
    outboundPickupDate: meta.pickupDate || '',
    outboundPickupTime: meta.pickupTime || '',
    returnPickupDate: meta.returnDate || '',
    returnPickupTime: meta.returnTime || '',
    vehicleClass: meta.vehicleClass || '',
    passengers: parseInt(meta.passengers) || 1,
    luggage: parseInt(meta.luggage) || 0,
    distanceKm: meta.distanceKm ? parseFloat(meta.distanceKm) : undefined,
    outboundAmountCzk,
    returnAmountCzk,
    combinedAmountCzk,
    returnDiscountPct,
    extraChildSeat: meta.extraChildSeat === 'true',
    extraMeetGreet: meta.extraMeetGreet === 'true',
    extraLuggage: meta.extraLuggage === 'true',
    promoCode: meta.promoCode || undefined,
    promoDiscountPct: promoDiscountPct > 0 ? promoDiscountPct : undefined,
    firstName: meta.firstName || '',
    lastName: meta.lastName || '',
    email: meta.email || '',
    phone: meta.phone || '',
    flightNumber: meta.flightNumber || undefined,
    terminal: meta.terminal || undefined,
    specialRequests: meta.specialRequests || undefined,
  }

  // Build 2-VEVENT ICS using Plan 27-01 shape (date + time, NOT start + startTime)
  const outboundOrigin = emailData.originAddress
  const outboundDest = emailData.destinationAddress
  const icsEvents: IcsEvent[] = [
    {
      uid: `${emailData.outboundBookingReference}-outbound@prestigo.cz`,
      date: emailData.outboundPickupDate,
      time: emailData.outboundPickupTime,
      durationMinutes: 60,
      summary: `PRESTIGO Transfer — ${emailData.outboundBookingReference} (Outbound)`,
      description: `Pickup: ${outboundOrigin}\nDropoff: ${outboundDest}\nRef: ${emailData.outboundBookingReference}`,
      location: outboundOrigin,
    },
    {
      uid: `${emailData.returnBookingReference}-return@prestigo.cz`,
      date: emailData.returnPickupDate,
      time: emailData.returnPickupTime,
      durationMinutes: 60,
      summary: `PRESTIGO Transfer — ${emailData.returnBookingReference} (Return)`,
      description: `Pickup: ${outboundDest}\nDropoff: ${outboundOrigin}\nRef: ${emailData.returnBookingReference}`,
      location: outboundDest,
    },
  ]
  const ics = buildIcs(icsEvents)

  try { await sendRoundTripClientConfirmation(emailData, ics) } catch (err) {
    console.error('sendRoundTripClientConfirmation unexpected error:', err)
  }
  try { await sendRoundTripManagerAlert(emailData) } catch (err) {
    console.error('sendRoundTripManagerAlert unexpected error:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// REFUND HANDLER — rewritten per D-16/D-17/D-18/D-19
// ─────────────────────────────────────────────────────────────────────────

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  if (!charge.payment_intent || !charge.refunded) return
  const pi = charge.payment_intent as string

  const supabase = createSupabaseServiceClient()
  const { data: rows, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, leg, amount_czk, outbound_amount_czk, return_amount_czk, status')
    .eq('payment_intent_id', pi)

  if (fetchErr) {
    console.error('charge.refunded: fetch bookings failed:', fetchErr.message)
    return
  }
  if (!rows || rows.length === 0) {
    console.error('charge.refunded: no bookings found for payment_intent', pi)
    return
  }

  // D-19 fall-through: one-way (single row) — cancel it regardless of partial/full
  if (rows.length === 1) {
    const { error: updErr } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', rows[0].id)
    if (updErr) console.error('charge.refunded one-way: update failed:', updErr.message)
    return
  }

  // Round-trip: two rows. Detect full vs partial.
  const isFullRefund = charge.amount_refunded >= charge.amount

  if (isFullRefund) {
    // D-17 'both' equivalent — bulk update on PI
    const { error: updErr } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('payment_intent_id', pi)
    if (updErr) console.error('charge.refunded full: bulk update failed:', updErr.message)
    return
  }

  // Partial refund path
  const latestRefund = charge.refunds?.data?.[0]
  const legFromMeta = (latestRefund?.metadata?.leg as 'outbound' | 'return' | 'both' | undefined) ?? undefined

  // D-17 explicit 'both' signal
  if (legFromMeta === 'both') {
    const { error: updErr } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('payment_intent_id', pi)
    if (updErr) console.error('charge.refunded partial "both": bulk update failed:', updErr.message)
    return
  }

  let targetLeg: 'outbound' | 'return' | null =
    legFromMeta === 'outbound' || legFromMeta === 'return' ? legFromMeta : null

  // D-18 fallback: amount-matching when metadata.leg missing
  if (!targetLeg) {
    const outboundRow = rows.find((r: { leg: string }) => r.leg === 'outbound')
    const returnRow = rows.find((r: { leg: string }) => r.leg === 'return')
    if (!outboundRow || !returnRow) {
      console.error('charge.refunded partial: missing outbound or return row for PI', pi)
      return
    }
    // Both rows carry outbound_amount_czk + return_amount_czk (Plan 27-02 buildBookingRows
    // writes both columns on both rows). Read from returnRow as it's guaranteed to have them
    // for round-trip.
    const outAmount = (returnRow as { outbound_amount_czk: number | null }).outbound_amount_czk ?? 0
    const retAmount = (returnRow as { return_amount_czk: number | null }).return_amount_czk ?? 0
    const combinedPreCzk = outAmount + retAmount
    const totalChargedCzk = Math.round(charge.amount / 100)
    const refundedMinor = latestRefund?.amount ?? charge.amount_refunded
    const refundedCzk = Math.round(refundedMinor / 100)

    if (combinedPreCzk > 0) {
      const ratio = totalChargedCzk / combinedPreCzk
      const effectiveOutboundCzk = Math.round(outAmount * ratio)
      const effectiveReturnCzk = Math.round(retAmount * ratio)
      const TOLERANCE_CZK = 2

      const matchesOutbound = Math.abs(refundedCzk - effectiveOutboundCzk) <= TOLERANCE_CZK
      const matchesReturn = Math.abs(refundedCzk - effectiveReturnCzk) <= TOLERANCE_CZK

      // Unambiguous single-leg match
      if (matchesOutbound && !matchesReturn) targetLeg = 'outbound'
      else if (matchesReturn && !matchesOutbound) targetLeg = 'return'
      // Ambiguous (both legs same amount OR no match) → D-18 safe default: cancel both
      else {
        console.warn('charge.refunded: partial refund with unresolvable leg', {
          paymentIntentId: pi,
          amountRefunded: charge.amount_refunded,
          outboundAmount: outAmount,
          returnAmount: retAmount,
        })
        const { error: updErr } = await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('payment_intent_id', pi)
        if (updErr) console.error('charge.refunded ambiguous: bulk update failed:', updErr.message)
        return
      }
    } else {
      // No amount data to match against — warn and cancel both as safe default (D-18)
      console.warn('charge.refunded: partial refund with unresolvable leg (no amount data)', {
        paymentIntentId: pi,
      })
      const { error: updErr } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('payment_intent_id', pi)
      if (updErr) console.error('charge.refunded no-data: bulk update failed:', updErr.message)
      return
    }
  }

  // Cancel only the matched single leg
  const targetRow = (rows as Array<{ id: string; leg: string }>).find((r) => r.leg === targetLeg)
  if (!targetRow) {
    console.error('charge.refunded partial: target leg row missing', { pi, targetLeg })
    return
  }
  const { error: updErr } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', targetRow.id)
  if (updErr) console.error('charge.refunded partial: update failed:', updErr.message)
}
