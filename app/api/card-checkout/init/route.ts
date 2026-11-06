import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import {
  checkoutBookingSchema,
  validateCheckoutBooking,
  priceCheckout,
  type CheckoutBookingData,
  type PricedCheckout,
  type ValidatedCheckout,
} from '@/lib/checkout/compute'
import { getPaymentSettings, isCardFlowEligible, isPolicyPublic } from '@/lib/payments/config'
import { computeHoldAt, decideHoldMode, holdDateIso, meetsBookingLeadTime } from '@/lib/payments/timing'
import { pickupInstantMs } from '@/lib/prague-date'
import { evaluateCancellation, freeHoursFor, proposedFeeMinor } from '@/lib/cancellation-policy'
import { getCancellationPolicy } from '@/lib/cancellation-settings'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getNoShowThresholds, isAirportPickup } from '@/lib/no-show'

// POST /api/card-checkout/init (Phase 88, plan 88-06; PAYF-05, D-09, D-10, D-11, D-12, D-19).
//
// Side-effect free: no booking row, no Stripe call, no ledger row. It only answers "may this client see
// the card flow, in which mode, with which exact hold date and amount". Every reason a client is NOT
// eligible (flag off, email not on the allowlist, trip type, bad data, too close to pickup, a pricing
// or settings error) gets the same opaque { eligible: false }, so the endpoint reveals neither the
// flag state nor allowlist membership (T-88-13). The intent route (88-08) re-evaluates everything.
//
// Phase 89 (plan 89-07; D-18, D-24): a client for whom the cancellation policy is public (isPolicyPublic) also gets a
// policy preview, in the eligible answer and in { eligible: false, policy } when only the card flow is closed to them
// (round trip, daily, inside the lead rule). A client for whom nothing is public gets exactly the old answer.

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

const asNumber = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * The terms the client would book under, from the same policy read the intent route stores. The base of the fee is
 * the priced amount; for a round trip it is the outbound leg's share and the deadline is the outbound pickup
 * (D-24: the policy applies per leg row). waitMin is the free waiting time at this pickup (airport or city).
 */
async function buildPolicyPreview(input: {
  bookingData: CheckoutBookingData
  validated: ValidatedCheckout
  priced: PricedCheckout
  pickupMs: number
  nowMs: number
}) {
  const { bookingData, validated, priced, pickupMs, nowMs } = input
  const policy = await getCancellationPolicy()
  const facts = { tripType: validated.tripType, distanceKm: validated.distanceKm, pickupMs }
  const outcome = evaluateCancellation(policy, facts, nowMs)

  let baseMinor = priced.combined.stripeAmountMinor
  if (validated.tripType === 'round_trip') {
    const outbound = priced.outboundLegEur + priced.extrasTotalEur
    const total = outbound + priced.returnLegEur
    if (total > 0) baseMinor = Math.max(1, Math.round((baseMinor * outbound) / total))
  }

  const thresholds = await getNoShowThresholds(createSupabaseServiceClient())
  const airport = isAirportPickup({
    origin_lat: asNumber(bookingData.originLat),
    origin_lng: asNumber(bookingData.originLng),
    origin_address: bookingData.originAddress ?? null,
  })

  return {
    version: policy.version,
    freeUntilIso: new Date(outcome.freeUntilMs).toISOString(),
    freeUntilPassed: outcome.kind !== 'free',
    hours: freeHoursFor(policy, facts),
    percent: policy.feePercent,
    feeMinor: proposedFeeMinor(baseMinor, policy.feePercent),
    waitMin: airport ? thresholds.airportMin : thresholds.cityMin,
  }
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
    // Eligibility first: when nothing is public for this client nothing below (pricing, promo lookup) runs.
    const settings = await getPaymentSettings()
    const email = bookingData.email ?? ''
    const cardEligible = isCardFlowEligible(settings, { email, tripType: bookingData.tripType })
    if (!cardEligible && !isPolicyPublic(settings, email)) {
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
    if (pickupMs === null) return ineligible()

    const priced = await priceCheckout({ bookingData, validated, currency })
    if (!priced.ok) return ineligible()

    // The policy is public for this client (card eligibility implies it), so the preview is always built here.
    const policy = await buildPolicyPreview({ bookingData, validated, priced, pickupMs, nowMs })

    if (!cardEligible || !meetsBookingLeadTime(pickupMs, nowMs)) {
      return NextResponse.json({ eligible: false, policy })
    }

    const { holdAtMs, rawHoldAtMs } = computeHoldAt(pickupMs, settings.leadHours)
    const mode = decideHoldMode(rawHoldAtMs, nowMs)

    return NextResponse.json({
      eligible: true,
      mode,
      holdAtIso: mode === 'setup' ? new Date(holdAtMs).toISOString() : null,
      holdDateIso: mode === 'setup' ? holdDateIso(holdAtMs) : null,
      amountMinor: priced.combined.stripeAmountMinor,
      currency,
      policy,
    })
  } catch (err) {
    console.error('card-checkout/init failed:', err instanceof Error ? err.message : 'unknown')
    return ineligible()
  }
}
