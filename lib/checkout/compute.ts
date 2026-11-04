// Shared, server-authoritative checkout validation + pricing (Phase 88, plan 88-02).
//
// Extracted verbatim from app/api/create-payment-intent/route.ts so the pay-now
// flow and the card-on-file flow (/api/card-checkout/init, /intent) recompute
// the amount with exactly the same code. No client amount is ever an input of
// priceCheckout: the price is derived from pricing_config + the promo table only.
//
// This module is free of Stripe and of any write. The legacy 12-hour lead-time
// check (month-based Prague offset) deliberately stays inside the
// create-payment-intent route and is NOT exported here, so the card flow cannot
// inherit it.

import { z } from 'zod'
import { normalizeSiteLocale } from '@/i18n/locales'
import { dateDiffDays, VEHICLE_CLASSES } from '@/lib/pricing'
import { getPricingConfig } from '@/lib/pricing-config'
import { computeExtrasTotal } from '@/lib/extras'
import { eurToCzk } from '@/lib/currency'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NO_LINE_BREAKS } from '@/lib/request-guards'
import {
  computeOutboundLegTotal,
  computeReturnLegTotal,
  computeCombinedTotalMinor,
} from '@/lib/server-pricing'
import type { TripType, VehicleClass } from '@/types/booking'
import { VEHICLE_CONFIG } from '@/types/booking'
import { normalizePhone } from '@/lib/phone'

const TRIP_TYPES: TripType[] = ['transfer', 'hourly', 'daily', 'round_trip']

// Defense-in-depth zod schema — validates primitives BEFORE any RPC or pricing call.
// Uses .catchall() with a bounded string to allow PII + extras fields without
// enumerating each one, while still enforcing a hard per-field length cap so a
// client can't blow up memory with a single 10 MB field that passes .passthrough().
// Amount-shaped fields (combinedTotal, amountEur, etc.) are tolerated but never
// read — the server always recomputes.
//
// NO_LINE_BREAKS is enforced on email/name/phone/flight/terminal below to block
// SMTP header injection downstream. Address fields and specialRequests allow
// newlines (they're only embedded in HTML-escaped email bodies, not headers).
const BOUNDED_STRING = z.string().max(2000)

export const checkoutBookingSchema = z.object({
  bookingData: z.object({
    tripType: z.enum(['transfer', 'hourly', 'daily', 'round_trip']),
    vehicleClass: z.enum(['business', 'first_class', 'business_van']),
    currency: z.string().max(10).optional(),
    distanceKm: z.string().max(20).optional(),
    hours: z.string().max(5).optional(),
    pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    pickupTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    returnTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    quoteMode: z.string().max(10).optional(),
    // PII fields — strict length + anti header injection on single-line fields
    firstName:   z.string().max(100).regex(NO_LINE_BREAKS).optional(),
    lastName:    z.string().max(100).regex(NO_LINE_BREAKS).optional(),
    email:       z.string().email().max(200).regex(NO_LINE_BREAKS).optional(),
    phone:       z.string().max(30).regex(NO_LINE_BREAKS).optional(),
    flightNumber: z.string().max(20).regex(NO_LINE_BREAKS).optional(),
    terminal:     z.string().max(50).regex(NO_LINE_BREAKS).optional(),
    passengers:   z.string().regex(/^\d{1,2}$/).optional().or(z.literal('')),
    // Phase 62 D-06/ASVS-V5: client-generated per-attempt dedup key — must be
    // a well-formed UUID before it is ever used as a DB query key.
    attemptId: z.string().uuid().optional(),
  }).catchall(BOUNDED_STRING), // anything else must be string ≤ 2000 chars
})

/** The parsed `bookingData` object (SEC-16: inferred Zod type, no cast). */
export type CheckoutBookingData = z.infer<typeof checkoutBookingSchema>['bookingData']

export type CheckoutError = {
  ok: false
  status: 400 | 422 | 503
  code: string
  error: string
}

export type ValidatedCheckout = {
  ok: true
  tripType: TripType
  vehicleClass: VehicleClass
  distanceKm: number | null
  hours: number
  days: number
  phone: string
}

export type PricedCheckout = {
  ok: true
  combined: ReturnType<typeof computeCombinedTotalMinor>
  outboundLegEur: number
  returnLegEur: number
  extrasTotalEur: number
  appliedPromoPct: number
  promoCode: string
  returnDiscountPercent: number
}

function fail(status: CheckoutError['status'], code: string, error: string): CheckoutError {
  return { ok: false, status, code, error }
}

/**
 * Every check that runs before the (legacy) lead-time check: phone, trip type,
 * vehicle class, seat limit, distance, round-trip dates / ordering / custom
 * quote. Same order, same codes and strings as the original route.
 *
 * Side effect (kept from the original route): on success `bookingData.phone`
 * is replaced by its normalised E.164 form, because that normalised value is
 * what gets stored, sent to drivers and put in the booking meta.
 */
export function validateCheckoutBooking(
  bookingData: CheckoutBookingData
): ValidatedCheckout | CheckoutError {
  // Business rule: every booking needs a contact phone with a country code
  // (E.164). The wizard always collects one (step 5 requires it), so a missing,
  // empty or whitespace-only value is a crafted request and is refused like any
  // other invalid number. The normalised form is what gets stored and sent to drivers.
  const phoneE164 = normalizePhone(bookingData.phone)
  if (!phoneE164) {
    return fail(422, 'INVALID_PHONE', 'Phone must include the country code')
  }
  bookingData.phone = phoneE164

  const tripType = bookingData.tripType as TripType
  const vehicleClass = bookingData.vehicleClass as VehicleClass

  if (!TRIP_TYPES.includes(tripType)) {
    return fail(400, 'INVALID_REQUEST', 'Invalid tripType')
  }
  if (!VEHICLE_CLASSES.includes(vehicleClass)) {
    return fail(400, 'INVALID_REQUEST', 'Invalid vehicleClass')
  }
  // Seat limit per class (E/S-Class 3, V-Class 6) — the step-5 stepper caps
  // this client-side; enforce it here so a crafted request can't exceed it.
  if (bookingData.passengers) {
    const pax = parseInt(bookingData.passengers, 10)
    const maxPax = VEHICLE_CONFIG.find((v) => v.key === vehicleClass)?.maxPassengers ?? 0
    if (!(pax >= 1 && pax <= maxPax)) {
      return fail(400, 'TOO_MANY_PASSENGERS', 'Too many passengers for the selected vehicle')
    }
  }

  const distanceKm = bookingData.distanceKm ? parseFloat(bookingData.distanceKm) : null
  const hours = bookingData.hours ? parseInt(bookingData.hours) : 2
  const days =
    bookingData.pickupDate && bookingData.returnDate
      ? dateDiffDays(bookingData.pickupDate, bookingData.returnDate)
      : 1

  if (tripType === 'transfer' && (distanceKm === null || !isFinite(distanceKm) || distanceKm <= 0)) {
    return fail(400, 'INVALID_REQUEST', 'Invalid distanceKm for transfer')
  }

  // Round-trip specific validation (T-26-01, T-26-06, T-26-09)
  if (tripType === 'round_trip') {
    if (distanceKm === null || !isFinite(distanceKm) || distanceKm <= 0) {
      return fail(400, 'INVALID_REQUEST', 'Invalid distanceKm for round_trip')
    }
    if (!bookingData.returnDate || !bookingData.returnTime) {
      return fail(400, 'ROUND_TRIP_DATES', 'Round trip requires returnDate and returnTime')
    }
    if (!bookingData.pickupDate || !bookingData.pickupTime) {
      return fail(400, 'ROUND_TRIP_DATES', 'Round trip requires pickupDate and pickupTime')
    }
    // Strict ordering: return datetime must be AFTER pickup datetime (ISO string compare)
    const pickupDT = `${bookingData.pickupDate}T${bookingData.pickupTime}`
    const returnDT = `${bookingData.returnDate}T${bookingData.returnTime}`
    if (returnDT <= pickupDT) {
      return fail(400, 'RETURN_BEFORE_PICKUP', 'Return datetime must be after pickup datetime')
    }
    // T-26-06: quoteMode bypass defense — require client to explicitly set quoteMode='false'
    if (bookingData.quoteMode === 'true') {
      return fail(400, 'CUSTOM_QUOTE_REQUIRED', 'This route requires a custom quote.')
    }
  }

  return { ok: true, tripType, vehicleClass, distanceKm, hours, days, phone: phoneE164 }
}

/**
 * Server-side price: pricing config -> extras -> legs -> promo lookup ->
 * computeCombinedTotalMinor. The client never supplies an amount.
 */
export async function priceCheckout(input: {
  bookingData: CheckoutBookingData
  validated: ValidatedCheckout
  currency: 'eur' | 'czk'
}): Promise<PricedCheckout | CheckoutError> {
  const { bookingData, validated, currency } = input
  const { tripType, vehicleClass, distanceKm, hours, days } = validated

  let rates
  try {
    rates = await getPricingConfig()
  } catch (err) {
    console.error('Failed to load pricing config:', err)
    return fail(503, 'PRICING_UNAVAILABLE', 'Pricing configuration unavailable')
  }

  const extrasTotalEur = computeExtrasTotal(
    {
      infantSeat: false,
      childSeat: bookingData.extraChildSeat === 'true',
      boosterSeat: false,
      meetAndGreet: bookingData.extraMeetGreet === 'true',
      extraLuggage: bookingData.extraLuggage === 'true',
    },
    {
      infantSeat: 0,
      childSeat: rates.globals.extraChildSeat,
      boosterSeat: 0,
      meetAndGreet: 0,
      extraLuggage: rates.globals.extraLuggage,
    }
  )

  const isAirport = bookingData.isAirport === 'true'
  const pickupTimeOrNull = bookingData.pickupTime || null
  const pickupDateOrNull = bookingData.pickupDate || null

  let returnLegEur: number = 0

  const outboundLegEur = computeOutboundLegTotal(
    vehicleClass,
    distanceKm,
    hours,
    days,
    tripType === 'round_trip' ? 'transfer' : tripType,
    pickupDateOrNull,
    pickupTimeOrNull,
    isAirport,
    rates,
  )
  if (tripType === 'round_trip') {
    returnLegEur = computeReturnLegTotal(
      vehicleClass,
      distanceKm as number, // guarded in validateCheckoutBooking
      bookingData.returnDate ?? '',
      bookingData.returnTime ?? '',
      isAirport,
      rates,
    )
  }

  const totalEur = outboundLegEur + extrasTotalEur + returnLegEur

  if (totalEur <= 0) {
    return fail(400, 'INVALID_REQUEST', 'Computed amount must be positive')
  }

  // Promo code validation (PROMO-04 / T-26-09: after input validation and combined-total computation)
  const promoCode = bookingData.promoCode?.trim().toUpperCase() || null
  let appliedPromoPct = 0

  if (promoCode) {
    // SEC-01: validate without incrementing current_uses — counter is claimed in
    // the webhook after payment_intent.succeeded confirms the charge. This prevents
    // an attacker from exhausting a limited-use code by creating PaymentIntents
    // without completing payment.
    const supabaseService = createSupabaseServiceClient()
    const { data: promoRow, error: promoError } = await supabaseService
      .from('promo_codes')
      .select('discount_value, max_uses, current_uses, is_active')
      .eq('code', promoCode)
      .eq('is_active', true)
      .maybeSingle()

    if (promoError || !promoRow) {
      return fail(400, 'PROMO_INVALID', 'Promo code is invalid, expired, or has reached its usage limit.')
    }
    if (promoRow.max_uses !== null && promoRow.current_uses >= promoRow.max_uses) {
      return fail(400, 'PROMO_INVALID', 'Promo code is invalid, expired, or has reached its usage limit.')
    }
    appliedPromoPct = Number(promoRow.discount_value)
  }

  // Single call site for combined-total computation + promo rounding + Stripe amount minor unit (T-26-03)
  const combined = computeCombinedTotalMinor({
    outboundLegEur,
    extrasEur: extrasTotalEur,
    returnLegEur,
    promoPct: appliedPromoPct,
    currency,
  })

  return {
    ok: true,
    combined,
    outboundLegEur,
    returnLegEur,
    extrasTotalEur,
    appliedPromoPct,
    promoCode: promoCode || '',
    returnDiscountPercent: rates.globals.returnDiscountPercent,
  }
}

// Defense-in-depth: truncate every metadata string to 500 chars (T-26-04)
const clamp500 = (s: string) => (s.length > 500 ? s.slice(0, 500) : s)

/**
 * The allow-listed booking-row key map. In the pay-now flow it is sent to
 * Stripe AND reused as the `meta` input of buildBookingRow for the unpaid
 * capture, so the capture row and the PaymentIntent metadata never drift apart.
 * The card flow uses it ONLY as the buildBookingRow input — never as Stripe
 * metadata.
 *
 * Enumerate only the keys the webhook handler and email builder consume.
 * Never spread the full client payload — Stripe has a 50-key / 500-char limit
 * and arbitrary client keys should not reach Stripe.
 * `locale` (D-11): consumed by the webhook's three sendGa4Purchase call
 * sites (siteLocale) — always the normalizeSiteLocale allow-list output,
 * never the raw client value.
 */
export function buildCheckoutMeta(input: {
  bookingData: CheckoutBookingData
  priced: PricedCheckout
  bookingReference: string
  returnBookingReference: string
  authenticatedUserId: string | null
}): Record<string, string> {
  const { bookingData, priced, bookingReference, returnBookingReference, authenticatedUserId } = input

  // Per-leg amounts PRE-promo (for Phase 23 outbound_amount_czk / return_amount_czk columns).
  // Phase 28 refund math: refundRatio = finalTotalCzk / combinedBeforePromoCzk;
  //                       actualRefund = leg_amount_czk * refundRatio.
  const outboundAmountCzk = eurToCzk(priced.outboundLegEur + priced.extrasTotalEur) // extras attributed to outbound
  const returnAmountCzk = eurToCzk(priced.returnLegEur)

  return {
    bookingReference,
    locale: normalizeSiteLocale(bookingData.locale),
    returnBookingReference, // empty string for one-way
    tripType: bookingData.tripType ?? '',
    originAddress: clamp500(bookingData.originAddress ?? ''),
    originLat: bookingData.originLat ?? '',
    originLng: bookingData.originLng ?? '',
    destinationAddress: clamp500(bookingData.destinationAddress ?? ''),
    destinationLat: bookingData.destinationLat ?? '',
    destinationLng: bookingData.destinationLng ?? '',
    pickupDate: bookingData.pickupDate ?? '',
    pickupTime: bookingData.pickupTime ?? '',
    returnDate: bookingData.returnDate ?? '',
    returnTime: bookingData.returnTime ?? '',
    vehicleClass: bookingData.vehicleClass ?? '',
    passengers: bookingData.passengers ?? '',
    luggage: bookingData.luggage ?? '',
    hours: bookingData.hours ?? '',
    distanceKm: bookingData.distanceKm ?? '',
    extraChildSeat: bookingData.extraChildSeat ?? 'false',
    extraMeetGreet: bookingData.extraMeetGreet ?? 'false',
    extraLuggage: bookingData.extraLuggage ?? 'false',
    firstName: clamp500(bookingData.firstName ?? ''),
    lastName: clamp500(bookingData.lastName ?? ''),
    email: clamp500(bookingData.email ?? ''),
    phone: clamp500(bookingData.phone ?? ''),
    flightNumber: clamp500(bookingData.flightNumber ?? ''),
    terminal: clamp500(bookingData.terminal ?? ''),
    specialRequests: clamp500((bookingData.specialRequests ?? '').slice(0, 490)),
    amountEur: String(priced.combined.finalTotalEur),
    amountCzk: String(priced.combined.finalTotalCzk),
    outboundAmountCzk: String(outboundAmountCzk),
    returnAmountCzk: String(returnAmountCzk),
    returnDiscountPct: String(priced.returnDiscountPercent),
    promoCode: priced.promoCode,
    discountPct: String(priced.appliedPromoPct),
    userId: authenticatedUserId ?? '',
  }
}
