import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { checkoutBookingSchema, validateCheckoutBooking, priceCheckout } from '@/lib/checkout/compute'
import { getPaymentSettings, isCardFlowEligible } from '@/lib/payments/config'
import { computeHoldAt, decideHoldMode, holdDateIso, meetsBookingLeadTime } from '@/lib/payments/timing'
import { pickupInstantMs } from '@/lib/prague-date'

// POST /api/card-checkout/init (Phase 88, plan 88-06; PAYF-05, D-09, D-10, D-11, D-12, D-19).
//
// Side-effect free: no booking row, no Stripe call, no ledger row. It only answers "may this client see
// the card flow, in which mode, with which exact hold date and amount". Every reason a client is NOT
// eligible (flag off, email not on the allowlist, trip type, bad data, too close to pickup, a pricing
// or settings error) gets the same opaque { eligible: false }, so the endpoint reveals neither the
// flag state nor allowlist membership (T-88-13). The intent route (88-08) re-evaluates everything.

const INELIGIBLE = { eligible: false } as const

const initSchema = checkoutBookingSchema.extend({
  currency: z.enum(['eur', 'czk']),
})

/**
 * The wizard sends the step-5 email as typed; surrounding spaces would fail the strict email format
 * check, so they are trimmed before validation (the allowlist match trims and lower-cases as well).
 */
function trimEmail(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const data = (body as { bookingData?: unknown }).bookingData
  if (!data || typeof data !== 'object') return body
  const email = (data as { email?: unknown }).email
  if (typeof email !== 'string') return body
  return { ...body, bookingData: { ...data, email: email.trim() } }
}

function ineligible() {
  return NextResponse.json({ ...INELIGIBLE })
}

export async function POST(req: Request) {
  const { allowed, remaining, limit } = await checkRateLimit('/api/card-checkout/init', getClientIp(req))
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
        },
      }
    )
  }

  const tooBig = enforceMaxBody(req, 16_384)
  if (tooBig) return tooBig

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_REQUEST' }, { status: 400 })
  }
  const parsed = initSchema.safeParse(trimEmail(rawBody))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_REQUEST' }, { status: 400 })
  }
  const { bookingData, currency } = parsed.data

  try {
    // Eligibility first: with the flag off nothing below (pricing, promo lookup) runs.
    const settings = await getPaymentSettings()
    if (!isCardFlowEligible(settings, { email: bookingData.email ?? '', tripType: bookingData.tripType })) {
      return ineligible()
    }

    const validated = validateCheckoutBooking(bookingData)
    if (!validated.ok) return ineligible()

    // The card flow has its own lead rule on the real pickup instant (Prague wall clock, DST-safe).
    const pickupMs = pickupInstantMs({
      pickup_utc: null,
      pickup_date: bookingData.pickupDate ?? '',
      pickup_time: bookingData.pickupTime ?? '',
    })
    const nowMs = Date.now()
    if (pickupMs === null || !meetsBookingLeadTime(pickupMs, nowMs)) return ineligible()

    const priced = await priceCheckout({ bookingData, validated, currency })
    if (!priced.ok) return ineligible()

    const { holdAtMs, rawHoldAtMs } = computeHoldAt(pickupMs, settings.leadHours)
    const mode = decideHoldMode(rawHoldAtMs, nowMs)

    return NextResponse.json({
      eligible: true,
      mode,
      holdAtIso: mode === 'setup' ? new Date(holdAtMs).toISOString() : null,
      holdDateIso: mode === 'setup' ? holdDateIso(holdAtMs) : null,
      amountMinor: priced.combined.stripeAmountMinor,
      currency,
    })
  } catch (err) {
    console.error('card-checkout/init failed:', err instanceof Error ? err.message : 'unknown')
    return ineligible()
  }
}
