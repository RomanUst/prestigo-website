import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { logEmail } from '@/lib/email-log'
import { sendPaymentRequestEmail } from '@/lib/email'
import { createBookingPaymentLink } from '@/lib/stripe-payment-links'

// D-05 attach-later route: generate (or resend) a Stripe Payment Link for an
// already-saved booking. Mirrors [id]/assign/route.ts's structure exactly —
// enforceMaxBody -> getAdminUser guard -> await params -> zod parse -> service
// client. This route sets `status` DIRECTLY (bypassing VALID_TRANSITIONS,
// which has no pending->unpaid edge — 64-RESEARCH.md Pitfall 2), the same way
// [id]/assign/route.ts sets driver_id/status directly for its own concerns.
const paymentLinkSchema = z.object({
  resend: z.boolean().optional(),
})

interface PaymentLinkBookingRow {
  id: string
  booking_reference: string
  status: string
  amount_eur: number
  leg: 'outbound' | 'return' | null
  payment_intent_id: string | null
  payment_link_url: string | null
  payment_link_id: string | null
  client_email: string
  client_first_name: string
  client_last_name: string
  origin_address: string
  destination_address: string | null
  pickup_date: string
  pickup_time: string
  vehicle_class: string
  flight_number: string | null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Enforce max body size
  const bodyCheck = enforceMaxBody(request, 5_000)
  if (bodyCheck) return bodyCheck

  // 2. Auth guard
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 3. Extract booking ID from params
  const { id: bookingId } = await params

  // 4. Zod parse body (tolerate an empty/omitted body — { resend } is optional)
  let body: unknown = {}
  try {
    const raw = await request.text()
    if (raw) body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = paymentLinkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // 5. Fetch the booking — full field set needed for both the link (amount)
  // and the payment-request email (trip summary).
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select(
      'id, booking_reference, status, amount_eur, leg, payment_intent_id, payment_link_url, payment_link_id, client_email, client_first_name, client_last_name, origin_address, destination_address, pickup_date, pickup_time, vehicle_class, flight_number'
    )
    .eq('id', bookingId)
    .single()

  if (bookingError || !bookingData) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const booking = bookingData as unknown as PaymentLinkBookingRow

  // ── RESEND path (D-07/Pitfall 5): its own code path — calls
  // sendPaymentRequestEmail directly, bypassing logEmail's dedup window by
  // design. An operator clicking resend within 10 minutes must never be
  // silently swallowed. ──
  if (parsed.data.resend === true) {
    if (!booking.payment_link_url) {
      return NextResponse.json({ error: 'No payment link exists for this booking yet' }, { status: 422 })
    }

    await sendPaymentRequestEmail({
      bookingReference: booking.booking_reference,
      clientEmail: booking.client_email,
      clientFirstName: booking.client_first_name,
      clientLastName: booking.client_last_name,
      originAddress: booking.origin_address,
      destinationAddress: booking.destination_address ?? null,
      pickupDate: booking.pickup_date,
      pickupTime: booking.pickup_time,
      vehicleClass: booking.vehicle_class,
      amountEur: booking.amount_eur,
      paymentLinkUrl: booking.payment_link_url,
      flightNumber: booking.flight_number ?? null,
    })

    return NextResponse.json({ resent: true })
  }

  // ── GENERATE path ──

  // Guard: only unpaid/pending bookings are eligible — a paid booking never
  // gets a fresh payable link.
  if (booking.status !== 'unpaid' && booking.status !== 'pending') {
    return NextResponse.json({ error: 'Booking is not eligible for a payment link' }, { status: 409 })
  }

  // Guard: one link per booking (D-04) — never mint a second, different URL.
  if (booking.payment_link_url) {
    return NextResponse.json({ error: 'A payment link already exists for this booking' }, { status: 409 })
  }

  // Round-trip sibling detection (64-RESEARCH.md Pitfall 3): key on the
  // shared (stale) payment_intent_id — linked_booking_id is never populated
  // by any insert path in this codebase.
  let linkedBookingId: string | null = null
  if ((booking.leg === 'outbound' || booking.leg === 'return') && booking.payment_intent_id) {
    const { data: sibling } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_intent_id', booking.payment_intent_id)
      .neq('leg', booking.leg)
      .eq('status', 'unpaid')
      .maybeSingle()
    if (sibling) linkedBookingId = (sibling as { id: string }).id
  }

  let link: { url: string; id: string }
  try {
    link = await createBookingPaymentLink({
      bookingId: booking.id,
      bookingReference: booking.booking_reference,
      amountEur: booking.amount_eur,
      leg: booking.leg,
      ...(linkedBookingId ? { linkedBookingId } : {}),
    })
  } catch (err) {
    // Stripe failure — leave the booking row untouched (status/link
    // unpersisted) so it remains queryable for retry (ANEW-02 edge: link-fails).
    console.error('[admin/bookings/[id]/payment-link] Stripe link creation failed:', err)
    return NextResponse.json({ error: 'Failed to create payment link' }, { status: 502 })
  }

  // Persist link + set status directly to 'unpaid' (bypasses VALID_TRANSITIONS
  // — same as [id]/assign/route.ts sets driver fields directly). Applies
  // uniformly whether the source status was 'unpaid' or 'pending'.
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ payment_link_url: link.url, payment_link_id: link.id, status: 'unpaid' })
    .eq('id', booking.id)

  if (updateError) {
    console.error('[admin/bookings/[id]/payment-link] failed to persist payment link:', updateError.message)
    return NextResponse.json({ error: 'Failed to persist payment link' }, { status: 500 })
  }

  const allowed = await logEmail({
    bookingId: booking.id,
    emailType: 'payment_request',
    recipient: booking.client_email,
  })
  if (allowed) {
    await sendPaymentRequestEmail({
      bookingReference: booking.booking_reference,
      clientEmail: booking.client_email,
      clientFirstName: booking.client_first_name,
      clientLastName: booking.client_last_name,
      originAddress: booking.origin_address,
      destinationAddress: booking.destination_address ?? null,
      pickupDate: booking.pickup_date,
      pickupTime: booking.pickup_time,
      vehicleClass: booking.vehicle_class,
      amountEur: booking.amount_eur,
      paymentLinkUrl: link.url,
      flightNumber: booking.flight_number ?? null,
    })
  }

  return NextResponse.json({ paymentLinkUrl: link.url, linkedBookingId: linkedBookingId ?? null })
}
