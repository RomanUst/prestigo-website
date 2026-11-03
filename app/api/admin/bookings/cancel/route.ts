import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { czkToEur } from '@/lib/currency'
import { advanceBookingStatus } from '@/lib/booking-status-service'

function getStripe() {
   
  const opts: Record<string, unknown> = { maxNetworkRetries: 0 }
  if (typeof (Stripe as unknown as { createFetchHttpClient?: () => unknown }).createFetchHttpClient === 'function') {
    opts.httpClient = Stripe.createFetchHttpClient()
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY!, opts)
}

const cancelSchema = z.object({
  id: z.string().uuid(),
  leg: z.enum(['outbound', 'return']).optional(),
})

// no_show is terminal (D-09) like completed and cancelled.
const NON_CANCELLABLE_STATUSES = ['cancelled', 'completed', 'no_show']

export async function POST(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload' },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServiceClient()

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, status, payment_intent_id, outbound_amount_czk, return_amount_czk')
    .eq('id', parsed.data.id)
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  if (NON_CANCELLABLE_STATUSES.includes(booking.status)) {
    return NextResponse.json(
      { error: `Cannot cancel a booking with status '${booking.status}'` },
      { status: 422 }
    )
  }

  // Phase 87 D-01: the status write goes through the status service; this
  // profile runs no side effects (today's behaviour).
  const cancelThroughService = () =>
    advanceBookingStatus({
      bookingId: parsed.data.id,
      to: 'cancelled',
      actor: { type: 'admin', id: user?.id ?? null },
      source: 'admin_cancel',
      profile: 'cancel-route',
      current: booking,
      // Compare-and-set against the status this route validated; it also covers the
      // Stripe refund window below (a driver or the webhook may move the booking meanwhile).
      expectedFrom: booking.status as string,
    })

  // If online booking with Stripe payment, issue refund first
  if (booking.payment_intent_id) {
    // Build refund params: per-leg partial for round-trip, full for one-way
    let refundParams: Stripe.RefundCreateParams = {
      payment_intent: booking.payment_intent_id,
    }

    if (parsed.data.leg) {
      // Round-trip partial refund path (D-13)
      const legAmountCzk = parsed.data.leg === 'outbound'
        ? booking.outbound_amount_czk
        : booking.return_amount_czk

      if (legAmountCzk === null || legAmountCzk === undefined) {
        return NextResponse.json(
          { error: 'Cannot compute per-leg refund: missing leg amount' },
          { status: 422 }
        )
      }

      const legAmountCents = Math.round(czkToEur(legAmountCzk) * 100)

      refundParams = {
        payment_intent: booking.payment_intent_id,
        amount: legAmountCents,
        metadata: { leg: parsed.data.leg }, // Phase 27 webhook contract
      }
    }

    let refund
    try {
      const stripe = getStripe()
      refund = await stripe.refunds.create(refundParams)
    } catch (stripeError) {
      // D-14: Stripe over-refund / already-refunded → 422, not 502
      if (stripeError instanceof Stripe.errors.StripeInvalidRequestError) {
        return NextResponse.json(
          { error: 'Refund amount exceeds remaining refundable balance. Contact Stripe support.' },
          { status: 422 }
        )
      }
      const msg = stripeError instanceof Error ? stripeError.message : 'Stripe refund failed'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    // D-13: the status write is scoped to `id` ONLY (inside the service) — never to
    // payment_intent_id — so the paired leg is untouched.
    const refundResult = await cancelThroughService()

    if (!refundResult.ok) {
      if (refundResult.code === 'conflict') {
        // The refund already went out but the booking moved first (e.g. the driver completed the
        // trip). Refund-first order is kept for parity; surface the refund so the office can act.
        console.error('[cancel] refund issued but status changed', {
          bookingId: parsed.data.id,
          refundId: refund.id,
          currentStatus: refundResult.currentStatus,
        })
        return NextResponse.json(
          { error: 'status_conflict', currentStatus: refundResult.currentStatus, refund_id: refund.id },
          { status: 409 }
        )
      }
      // Otherwise the only failure reachable after the NON_CANCELLABLE_STATUSES gate is the write.
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, refund_id: refund.id })
  }

  // Manual booking — no Stripe, just update status
  const result = await cancelThroughService()

  if (!result.ok) {
    if (result.code === 'conflict') {
      return NextResponse.json(
        { error: 'status_conflict', currentStatus: result.currentStatus },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
