import { NextResponse, after } from 'next/server'
import Stripe from 'stripe'
import {
  saveBooking,
  withRetry,
  buildBookingRow,
  buildBookingRows,
  saveRoundTripBookings,
  reconcileBookingToConfirmed,
  reconcileRoundTripToConfirmed,
  reconcileBookingByIdToConfirmed,
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
import { scheduleQStashReminder } from '@/lib/qstash'
import { sendGa4Purchase } from '@/lib/analytics-server'

const VEHICLE_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

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

  // ── charge.refunded (SEC-10 / WR-02): run the side effect FIRST, claim the
  // idempotency row AFTER — same ordering as payment_intent.succeeded below.
  // Claiming before handling means a crash between the claim and the handler
  // permanently drops the refund's booking-cancel (a marked-processed event is
  // never retried). Read-check first to short-circuit obvious re-deliveries;
  // handleChargeRefunded is idempotent (re-cancelling a cancelled booking is a no-op).
  if (event.type === 'charge.refunded') {
    {
      const supabase = createSupabaseServiceClient()
      const { data: existing } = await supabase
        .from('stripe_processed_events')
        .select('event_id')
        .eq('event_id', event.id)
        .maybeSingle()
      if (existing) return NextResponse.json({ received: true, duplicate: true })
    }

    await handleChargeRefunded(event.data.object as Stripe.Charge)

    // Mark processed AFTER the refund side effect. Ignore 23505 (concurrent delivery).
    {
      const supabase = createSupabaseServiceClient()
      const { error: claimErr } = await supabase
        .from('stripe_processed_events')
        .insert({ event_id: event.id, event_type: event.type })
      if (claimErr) {
        const code = (claimErr as { code?: string }).code
        if (code !== '23505') {
          console.error('[webhook] post-refund stripe_processed_events insert failed:', claimErr.message)
        }
      }
    }
    return NextResponse.json({ received: true })
  }

  if (event.type === 'payment_intent.succeeded') {
    // SEC-10: booking is saved FIRST, stripe_processed_events is written AFTER.
    // Rationale: if we claim the event before saving the booking and the process crashes
    // between those two operations, the booking is permanently lost (Stripe stops retrying
    // on 23505). With reversed order, a crash before the events insert causes Stripe to
    // retry; saveBooking / saveRoundTripBookings are idempotent (ON CONFLICT DO NOTHING)
    // so the retry sees inserted.length === 0, marks the event processed, and returns 2xx
    // safely — booking row already exists, emails skipped on retry (acceptable trade-off).
    //
    // Duplicate detection: read-check before processing to short-circuit obvious re-delivers.
    {
      const supabase = createSupabaseServiceClient()
      const { data: existing } = await supabase
        .from('stripe_processed_events')
        .select('event_id')
        .eq('event_id', event.id)
        .maybeSingle()
      if (existing) return NextResponse.json({ received: true, duplicate: true })
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const meta = (paymentIntent.metadata ?? {}) as Record<string, string>

    // Reconciled D-01: Phase 26 emits tripType='round_trip' + returnBookingReference (non-empty)
    // for round-trip charges. No isRoundTrip key is emitted. Signal is tripType + non-empty ref.
    const isRoundTrip =
      meta.tripType === 'round_trip' &&
      typeof meta.returnBookingReference === 'string' &&
      meta.returnBookingReference.length > 0

    // Inconsistent metadata (tripType set but no return ref, or vice versa) — log + fall through.
    if (meta.tripType === 'round_trip' || (meta.returnBookingReference && meta.returnBookingReference.length > 0)) {
      if (!isRoundTrip) {
        console.error(
          'payment_intent.succeeded: inconsistent round-trip metadata; falling back to one-way',
          { ...safePiiSummary(meta), hasReturnRef: Boolean(meta.returnBookingReference) }
        )
      }
    }

    if (isRoundTrip) {
      await handleRoundTripSucceeded(paymentIntent, meta)
    } else {
      await handleOneWaySucceeded(paymentIntent, meta)
    }

    // Mark event processed AFTER booking confirmed saved (SEC-10).
    // Ignore 23505 here: concurrent delivery is extremely rare; booking is idempotent either way.
    {
      const supabase = createSupabaseServiceClient()
      const { error: claimErr } = await supabase
        .from('stripe_processed_events')
        .insert({ event_id: event.id, event_type: event.type })
      if (claimErr) {
        const code = (claimErr as { code?: string }).code
        if (code !== '23505') {
          console.error('[webhook] post-save stripe_processed_events insert failed:', claimErr.message)
        }
      }
    }

    return NextResponse.json({ received: true })
  }

  // ── checkout.session.completed (Phase 64 ANEW-04): the only path that can
  // flip a payment-link `unpaid` booking to `confirmed`. New branch, same
  // file, same signature-verified block, same `stripe_processed_events`
  // idempotency table (event_id is generic across event types) and
  // side-effect-first/claim-after ordering as payment_intent.succeeded above.
  if (event.type === 'checkout.session.completed') {
    {
      const supabase = createSupabaseServiceClient()
      const { data: existing } = await supabase
        .from('stripe_processed_events')
        .select('event_id')
        .eq('event_id', event.id)
        .maybeSingle()
      if (existing) return NextResponse.json({ received: true, duplicate: true })
    }

    // data.object here is a Checkout Session, NOT a PaymentIntent — Payment
    // Link metadata is copied to the session as a one-time snapshot, but is
    // NOT automatically copied to the resulting PaymentIntent. Read
    // session.metadata, never a PaymentIntent's own metadata (Pitfall 1).
    const session = event.data.object as Stripe.Checkout.Session
    const meta = (session.metadata ?? {}) as Record<string, string>
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null

    // Stripe recommends this guard even on checkout.session.completed —
    // delayed payment methods can complete the SESSION before the PAYMENT
    // clears. payment_method_types is restricted to ['card'] at link-creation
    // time (lib/stripe-payment-links.ts), making this effectively always
    // true, but keep the check as defense in depth.
    if (session.payment_status === 'paid' && meta.bookingId && paymentIntentId) {
      await handlePaymentLinkSucceeded(meta.bookingId, meta.linkedBookingId ?? null, paymentIntentId)
    }

    // Claim AFTER side effects (SEC-10 ordering). Ignore 23505 (concurrent delivery).
    {
      const supabase = createSupabaseServiceClient()
      const { error: claimErr } = await supabase
        .from('stripe_processed_events')
        .insert({ event_id: event.id, event_type: event.type })
      if (claimErr) {
        const code = (claimErr as { code?: string }).code
        if (code !== '23505') {
          console.error('[webhook] post-payment-link stripe_processed_events insert failed:', claimErr.message)
        }
      }
    }
    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}

// ─────────────────────────────────────────────────────────────────────────
// PAYMENT-LINK HANDLER — Phase 64 ANEW-02/03/04 (checkout.session.completed)
// ─────────────────────────────────────────────────────────────────────────

type PaymentLinkReconciledRow = {
  id: string
  booking_reference: string
  trip_type?: string | null
  origin_address?: string | null
  destination_address?: string | null
  pickup_date?: string | null
  pickup_time?: string | null
  return_date?: string | null
  vehicle_class?: string | null
  passengers?: number | null
  luggage?: number | null
  hours?: number | null
  distance_km?: number | null
  amount_czk?: number | null
  amount_eur?: number | null
  extra_child_seat?: boolean | null
  extra_meet_greet?: boolean | null
  extra_luggage?: boolean | null
  client_first_name?: string | null
  client_last_name?: string | null
  client_email?: string | null
  client_phone?: string | null
  flight_number?: string | null
  terminal?: string | null
  special_requests?: string | null
  pickup_utc?: string | null
}

/**
 * Reconcile a payment-link booking to `confirmed` and fire the same
 * confirmation side-effect suite `handleOneWaySucceeded` fires — sourced from
 * the reconciled DB row (a full `bookings` row via `select('*')`), not from
 * thin Payment Link metadata.
 *
 * Phase 64 Plan 02 (T-64-03): when `linkedBookingId` is present (a payment
 * link generated for one leg of a Phase-62-captured round-trip pair —
 * 64-RESEARCH.md Pitfall 3), the SIBLING leg is ALSO reconciled to
 * `confirmed` with the same `paymentIntentId` — two explicit by-id calls,
 * each independently status-gated (`WHERE status = 'unpaid'`) so a Stripe
 * retry is a no-op on whichever leg(s) already flipped. The confirmation
 * side-effect suite (client confirmation + manager alert + GA4 purchase)
 * fires ONCE for the pair — never two client emails, matching how
 * `handleRoundTripSucceeded` emits a single round-trip confirmation — while
 * the QStash reminder is scheduled PER reconciled leg that carries its own
 * `pickup_utc` (outbound and return have different pickup times).
 */
async function handlePaymentLinkSucceeded(
  bookingId: string,
  linkedBookingId: string | null,
  paymentIntentId: string
): Promise<void> {
  let primaryReconciled: Record<string, unknown>[] = []
  try {
    primaryReconciled = await withRetry(() => reconcileBookingByIdToConfirmed(bookingId, paymentIntentId), 3, 1000)
  } catch (err) {
    console.error(
      'reconcileBookingByIdToConfirmed (primary) failed after 3 retries:',
      err instanceof Error ? err.message : 'Unknown error'
    )
    return
  }

  let siblingReconciled: Record<string, unknown>[] = []
  if (linkedBookingId) {
    try {
      siblingReconciled = await withRetry(
        () => reconcileBookingByIdToConfirmed(linkedBookingId, paymentIntentId),
        3,
        1000
      )
    } catch (err) {
      console.error(
        'reconcileBookingByIdToConfirmed (linked sibling) failed after 3 retries:',
        err instanceof Error ? err.message : 'Unknown error'
      )
      return
    }
  }

  // Union of both calls determines "newly reconciled". Empty union = already
  // handled (Stripe retry / duplicate delivery, or an already-confirmed row
  // or pair) — skip all side-effects, never mutate again.
  const reconciledRows = [...primaryReconciled, ...siblingReconciled] as PaymentLinkReconciledRow[]
  if (reconciledRows.length === 0) return

  // Build the ONE combined confirmation from whichever row(s) succeeded —
  // the primary row when it reconciled, else the sibling (e.g. a retry where
  // the primary was already confirmed but the sibling had not yet flipped).
  const row = reconciledRows[0]

  const emailData: BookingEmailData = {
    bookingReference: row.booking_reference,
    tripType: row.trip_type || '',
    originAddress: row.origin_address || '',
    destinationAddress: row.destination_address || '',
    pickupDate: row.pickup_date || '',
    pickupTime: row.pickup_time || '',
    returnDate: row.return_date ?? undefined,
    vehicleClass: row.vehicle_class || '',
    passengers: row.passengers ?? 1,
    luggage: row.luggage ?? 0,
    hours: row.hours ?? undefined,
    distanceKm: row.distance_km ?? undefined,
    amountCzk: row.amount_czk ?? Math.round(row.amount_eur ? row.amount_eur / 0.04 : 0),
    extraChildSeat: row.extra_child_seat ?? false,
    extraMeetGreet: row.extra_meet_greet ?? false,
    extraLuggage: row.extra_luggage ?? false,
    firstName: row.client_first_name || '',
    lastName: row.client_last_name || '',
    email: row.client_email || '',
    phone: row.client_phone || '',
    flightNumber: row.flight_number ?? undefined,
    terminal: row.terminal ?? undefined,
    specialRequests: row.special_requests ?? undefined,
  }

  try { await sendClientConfirmation(emailData) } catch (err) {
    console.error('sendClientConfirmation unexpected error (payment-link):', err)
  }
  try { await sendManagerAlert(emailData) } catch (err) {
    console.error('sendManagerAlert unexpected error (payment-link):', err)
  }

  // Phase 41-style QStash reminder — PER reconciled leg with its own
  // pickup_utc (outbound and return differ). The reconciled row(s) already
  // carry pickup_utc from the `select('*')` in reconcileBookingByIdToConfirmed,
  // so no extra lookup query is needed (unlike handleOneWaySucceeded).
  for (const reconciledRow of reconciledRows) {
    if (reconciledRow.pickup_utc) {
      const legId = reconciledRow.id
      const pickupUtc = reconciledRow.pickup_utc
      after(() => scheduleQStashReminder(legId, new Date(pickupUtc).getTime()))
    }
  }

  // ONE GA4 purchase event for the pair — combined amount across whichever
  // leg(s) newly reconciled (mirrors handleRoundTripSucceeded's combined
  // value), sourced from the reconciled row(s) rather than thin metadata.
  const valueEur = reconciledRows.reduce((sum, r) => sum + (r.amount_eur ?? 0), 0)
  const vehicleClass = row.vehicle_class || 'transfer'
  after(() => sendGa4Purchase({
    transactionId: row.booking_reference,
    valueEur,
    currency: 'EUR',
    items: [
      {
        item_id: vehicleClass,
        item_name: VEHICLE_LABELS[vehicleClass] ?? 'Chauffeur Transfer',
        item_category: row.trip_type || 'transfer',
        item_variant: row.trip_type || 'transfer',
        price: valueEur,
        quantity: 1,
      },
    ],
  }))
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

  // Phase 62 D-11: reconcile a pre-captured `unpaid` row to `confirmed` FIRST —
  // this is now the primary exactly-once gate (status-gated UPDATE), replacing
  // the old `inserted.length > 0` ignoreDuplicates-upsert gate for the common
  // case where checkout already captured the row (Plan 62-01/62-02).
  let reconciled: { id: string }[] = []
  try {
    reconciled = await withRetry(() => reconcileBookingToConfirmed(paymentIntent.id, 'outbound'), 3, 1000)
  } catch (err) {
    console.error(
      'reconcileBookingToConfirmed failed after 3 retries:',
      err instanceof Error ? err.message : 'Unknown error'
    )
    await sendEmergencyAlert(bookingReference, bookingRow)
    return
  }

  // Defensive fallback: no matching `unpaid` row (lost capture, or a booking
  // predating Phase 62's pre-capture) — fall back to the original insert-time
  // idempotency path (ignoreDuplicates upsert on (payment_intent_id, leg)).
  let inserted: { id: string }[] = []
  if (reconciled.length === 0) {
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
  }

  // The confirmed row from whichever path produced one — used below both as
  // the side-effect gate (D-11) and as the id for the QStash pickup_utc lookup.
  const confirmedRows = reconciled.length > 0 ? reconciled : inserted

  // Neither a fresh reconciliation nor a fresh insert — row was already
  // `confirmed` (Stripe retry / duplicate delivery). Skip all side-effects.
  if (confirmedRows.length === 0) return

  // SEC-01: claim the promo code NOW that payment is confirmed (not at PI creation).
  // Failure here is non-fatal — log and continue, booking is already saved.
  if (meta.promoCode) {
    const supabaseService = createSupabaseServiceClient()
    const { error: claimErr } = await supabaseService.rpc('claim_promo_code', { p_code: meta.promoCode })
    if (claimErr) console.error('[webhook] claim_promo_code failed:', claimErr.message)
  }

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

  // Phase 41 D-01: Schedule 2h QStash reminder (fire-and-forget).
  // Phase 62: id comes from whichever path produced the confirmed row
  // (reconciled unpaid→confirmed, or a fresh defensive insert).
  if (confirmedRows.length > 0) {
    const confirmedId = confirmedRows[0].id
    const supabase = createSupabaseServiceClient()
    const { data: savedBooking } = await supabase
      .from('bookings')
      .select('pickup_utc')
      .eq('id', confirmedId)
      .single()
    if (savedBooking?.pickup_utc) {
      after(() => scheduleQStashReminder(confirmedId, new Date(savedBooking.pickup_utc).getTime()))
    }
  }

  // Server-side GA4 purchase event — authoritative fallback that does not
  // depend on client JS, consent timing, or sessionStorage surviving the
  // Stripe redirect. Dedupes with the client event by transaction_id.
  const amountEurFromMeta = meta.amountEur ? parseFloat(meta.amountEur) : null
  const valueEur = amountEurFromMeta ?? Math.round(paymentIntent.amount / 100)
  const currency = (paymentIntent.currency || 'eur').toUpperCase()
  const vehicleClass = meta.vehicleClass || 'transfer'
  after(() => sendGa4Purchase({
    transactionId: bookingReference,
    valueEur,
    currency,
    items: [
      {
        item_id: vehicleClass,
        item_name: VEHICLE_LABELS[vehicleClass] ?? 'Chauffeur Transfer',
        item_category: meta.tripType || 'transfer',
        item_variant: meta.tripType || 'transfer',
        price: valueEur,
        quantity: 1,
      },
    ],
  }))
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

  // Phase 62 D-07/D-11: reconcile pre-captured `unpaid` legs FIRST — a single
  // atomic UPDATE flips BOTH legs at once since they share payment_intent_id.
  // This is now the primary exactly-once gate, replacing the `pair !== null`
  // ignoreDuplicates-RPC gate for the common case where checkout already
  // captured both rows (Plan 62-02).
  let reconciledIds: { id: string; leg: string }[] = []
  try {
    reconciledIds = await withRetry(() => reconcileRoundTripToConfirmed(paymentIntent.id), 3, 1000)
  } catch (err) {
    console.error(
      'reconcileRoundTripToConfirmed failed after 3 retries:',
      err instanceof Error ? err.message : 'Unknown error'
    )
    await sendEmergencyAlert(outboundRef, outboundRow as unknown as Record<string, unknown>)
    return
  }

  // Confirmed leg ids from whichever path(s) produced them — used below as the
  // side-effect gate (D-11) and for the per-leg QStash pickup_utc lookup.
  const freshLegIds: string[] = reconciledIds.map((row) => row.id)

  if (reconciledIds.length === 0) {
    // No matching `unpaid` legs — either a fully lost capture (both legs never
    // written) or a booking predating Phase 62's pre-capture. Fall back to the
    // atomic RPC insert of BOTH legs. D-02: returns IDs on insert, or null on
    // 23505 when a Stripe retry already inserted them (→ skip side-effects).
    let pair: { outbound_id: string; return_id: string } | null = null
    try {
      pair = await withRetry(() => saveRoundTripBookings(outboundRow, returnRow), 3, 1000)
    } catch (err) {
      console.error(
        'saveRoundTripBookings failed after 3 retries:',
        err instanceof Error ? err.message : 'Unknown error'
      )
      await sendEmergencyAlert(outboundRef, outboundRow as unknown as Record<string, unknown>)
      return
    }
    if (pair) freshLegIds.push(pair.outbound_id, pair.return_id)
  } else if (reconciledIds.length === 1) {
    // CR-01: PARTIAL capture — exactly one leg was pre-captured and just
    // reconciled to `confirmed`; the other leg was never captured (or carries a
    // stale payment_intent_id from an abandoned attempt). The customer was
    // charged the combined (outbound + return) amount, so BOTH legs must end
    // confirmed. Backfill ONLY the missing leg: saveRoundTripBookings can't —
    // it is all-or-nothing and would 23505 on the leg that already exists.
    // saveBooking upserts on (payment_intent_id, leg) with ignoreDuplicates, so
    // it inserts the missing leg and no-ops if a concurrent delivery beat us.
    const missingLegRow = reconciledIds[0].leg === 'outbound' ? returnRow : outboundRow
    try {
      const inserted = await withRetry(() => saveBooking(missingLegRow), 3, 1000)
      freshLegIds.push(...inserted.map((r) => r.id))
    } catch (err) {
      console.error(
        'round-trip missing-leg backfill (saveBooking) failed after 3 retries:',
        err instanceof Error ? err.message : 'Unknown error'
      )
      await sendEmergencyAlert(outboundRef, outboundRow as unknown as Record<string, unknown>)
      return
    }
  }

  // No fresh reconciliation and no fresh insert — both legs were already
  // `confirmed` (Stripe retry / duplicate delivery). Skip all side-effects.
  if (freshLegIds.length === 0) return

  // SEC-01: claim the promo code NOW that payment is confirmed (not at PI creation).
  if (meta.promoCode) {
    const supabaseService = createSupabaseServiceClient()
    const { error: claimErr } = await supabaseService.rpc('claim_promo_code', { p_code: meta.promoCode })
    if (claimErr) console.error('[webhook] claim_promo_code (round-trip) failed:', claimErr.message)
  }

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

  // Phase 41 D-01/D-02: Schedule 2h QStash reminder for EACH leg (fire-and-forget).
  // Phase 62: leg ids come from whichever path produced the confirmed rows
  // (reconciled unpaid→confirmed, or a fresh defensive RPC insert).
  {
    const supabase = createSupabaseServiceClient()
    const { data: legs } = await supabase
      .from('bookings')
      .select('id, pickup_utc')
      .in('id', freshLegIds)
    for (const leg of legs ?? []) {
      if (leg.pickup_utc) {
        after(() => scheduleQStashReminder(leg.id, new Date(leg.pickup_utc).getTime()))
      }
    }
  }

  // Server-side GA4 purchase event — combined amount for both legs. Uses the
  // outbound booking reference as transaction_id to match the client-side event.
  const combinedValueEur = meta.amountEur
    ? parseFloat(meta.amountEur)
    : Math.round(paymentIntent.amount / 100)
  const currency = (paymentIntent.currency || 'eur').toUpperCase()
  const vehicleClass = meta.vehicleClass || 'transfer'
  after(() => sendGa4Purchase({
    transactionId: outboundRef,
    valueEur: combinedValueEur,
    currency,
    items: [
      {
        item_id: vehicleClass,
        item_name: VEHICLE_LABELS[vehicleClass] ?? 'Chauffeur Transfer',
        item_category: 'round_trip',
        item_variant: 'round_trip',
        price: combinedValueEur,
        quantity: 1,
      },
    ],
  }))
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
