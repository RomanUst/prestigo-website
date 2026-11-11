// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 91 plan 91-04 (STOP-02, STOP-03, D-05, D-14, D-17): the checkout is the price authority for trips with
// and without stops. Real intent route + real checkout/state modules over the in-memory payments DB and the fake
// Stripe; only Google Routes is mocked.

const { dbHolder, stripeHolder, pricingConfigMock, rateLimitMock, promoState, routeDistanceMock } = vi.hoisted(() => ({
  dbHolder: { client: null as unknown },
  stripeHolder: { stripe: null as unknown },
  pricingConfigMock: vi.fn(),
  rateLimitMock: vi.fn(),
  promoState: { row: null as null | { discount_value: number; max_uses: number | null; current_uses: number; is_active: boolean } },
  routeDistanceMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => dbHolder.client),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } }),
  ),
}))
vi.mock('@/lib/pricing-config', () => ({ getPricingConfig: pricingConfigMock }))
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: routeDistanceMock }))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: rateLimitMock,
}))
vi.mock('@/lib/payments/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => stripeHolder.stripe,
}))

import { POST } from '@/app/api/card-checkout/intent/route'
import { checkoutBookingSchema, priceCheckout, validateCheckoutBooking } from '@/lib/checkout/compute'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { computeCombinedTotalMinor, computeOutboundLegTotal } from '@/lib/server-pricing'
import { computeHoldAt, holdDateIso } from '@/lib/payments/timing'
import { pickupInstantMs } from '@/lib/prague-date'
import type { PricingRates } from '@/lib/pricing-config'

const PRICING: PricingRates = {
  ratePerKm: { business: 2.5, first_class: 3.5, business_van: 3.0 },
  hourlyRate: { business: 20, first_class: 30, business_van: 25 },
  dailyRate: { business: 150, first_class: 250, business_van: 200 },
  minFare: { business: 30, first_class: 50, business_van: 40 },
  waitingRate: { business: 12 },
  globals: {
    airportFee: 10,
    nightCoefficient: 1.3,
    holidayCoefficient: 1.2,
    extraChildSeat: 10,
    extraLuggage: 5,
    holidayDates: [],
    returnDiscountPercent: 10,
    hourlyMinHours: 2,
    hourlyMaxHours: 8,
    notificationFlags: null,
    airportPromoActive: false,
    airportRegularPriceEur: 0,
    airportPromoPriceEur: 0,
  },
}

// Fixed "now": 2027-01-10 09:00Z (10:00 Prague, CET).
const NOW = Date.parse('2027-01-10T09:00:00Z')
const OWNER = 'owner@example.com'
const ATTEMPT = '11111111-1111-4111-8111-111111111111'
const PHONE = '+420725986855'

// Prague centre -> Brno, neither near the airport.
const ORIGIN = { lat: '50.0755', lng: '14.4378' }
const DEST = { lat: '49.1951', lng: '16.6068' }
const STOP_KV = { address: 'Karlovy Vary', lat: 50.2319, lng: 12.8715, waitMinutes: 45 }

let db: FakePaymentsDb
let fake: FakeStripe

/** What the quote / checkout charges for `km` km on business at the fixed pickup, plus an optional waiting add-on. */
function serverAmount(km: number, waitingEur = 0, pickupDate = '2027-01-16', pickupTime = '10:00', promoPct = 0): number {
  const outbound = computeOutboundLegTotal('business', km, 2, 1, 'transfer', pickupDate, pickupTime, false, PRICING)
  return computeCombinedTotalMinor({
    outboundLegEur: outbound,
    extrasEur: waitingEur,
    returnLegEur: 0,
    promoPct,
    currency: 'eur',
  }).stripeAmountMinor
}

function bookingData(over: Record<string, unknown> = {}) {
  return {
    tripType: 'transfer',
    vehicleClass: 'business',
    distanceKm: '1', // a tampered browser distance: it must never matter
    originLat: ORIGIN.lat,
    originLng: ORIGIN.lng,
    destinationLat: DEST.lat,
    destinationLng: DEST.lng,
    pickupDate: '2027-01-16',
    pickupTime: '10:00',
    passengers: '2',
    firstName: 'Anna',
    lastName: 'Novak',
    email: OWNER,
    phone: PHONE,
    locale: 'en',
    originAddress: 'Prague',
    destinationAddress: 'Brno',
    attemptId: ATTEMPT,
    ...over,
  }
}

/** The free-until moment the client's consent shows for a trip of `km` km (default policy: 100 km, 1 h short, 12 h long). */
function shownFreeUntil(km: number, pickupDate: string, pickupTime: string) {
  const g = db.state.pricing_globals[0] as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
  const hours =
    km <= num(g.cancel_free_km_threshold, 100) ? num(g.cancel_free_hours_short, 1) : num(g.cancel_free_hours_long, 12)
  const pickupMs = pickupInstantMs({ pickup_utc: null, pickup_date: pickupDate, pickup_time: pickupTime }) as number
  const ms = pickupMs - Math.round(hours * 3_600_000)
  return { iso: new Date(ms).toISOString(), passed: Date.now() > ms }
}

/** A complete intent body whose displayed amount and free-until are those of a `km` km trip with `waitingEur` waiting. */
function body(km: number, waitingEur: number, data: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  const bd = bookingData(data)
  const pickupDate = bd.pickupDate as string
  const pickupTime = bd.pickupTime as string
  const free = shownFreeUntil(km, pickupDate, pickupTime)
  const pickupMs = pickupInstantMs({ pickup_utc: null, pickup_date: pickupDate, pickup_time: pickupTime }) as number
  return {
    bookingData: bd,
    currency: 'eur',
    mode: 'setup',
    consent: true,
    displayedAmountMinor: serverAmount(km, waitingEur, pickupDate, pickupTime),
    displayedHoldDateIso: holdDateIso(computeHoldAt(pickupMs, 72).holdAtMs),
    displayedFreeUntilIso: free.iso,
    displayedFreeUntilPassed: free.passed,
    ...over,
  }
}

function req(payload: unknown): Request {
  return new Request('http://localhost/api/card-checkout/intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    body: JSON.stringify(payload),
  })
}

async function call(payload: unknown) {
  const res = await POST(req(payload))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

function loggingClient(client: FakePaymentsDb['client']) {
  return {
    rpc: (name: string, args?: Record<string, unknown>) => client.rpc(name, args),
    from: (table: string) => {
      if (table === 'promo_codes') {
        const row = promoState.row
        const b = {
          select: () => b,
          eq: () => b,
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }
        return b
      }
      return client.from(table)
    },
  }
}

const bookings = () => db.state.bookings

function expectNoWrites() {
  expect(bookings()).toHaveLength(0)
  expect(db.state.booking_payment_consents).toHaveLength(0)
  expect(db.state.booking_payment_events).toHaveLength(0)
  expect(fake.calls).toHaveLength(0)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  db = createFakePaymentsDb({ nowMs: NOW })
  fake = createFakeStripe({ nowSec: () => Math.floor(NOW / 1000) })
  dbHolder.client = loggingClient(db.client)
  stripeHolder.stripe = fake.stripe
  promoState.row = null
  pricingConfigMock.mockReset()
  pricingConfigMock.mockResolvedValue(PRICING)
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  routeDistanceMock.mockReset()
  routeDistanceMock.mockResolvedValue({ ok: true, distanceKm: 130, durationMin: 150 })
  Object.assign(db.state.pricing_globals[0], {
    card_flow_mode: 'canary',
    card_flow_canary_emails: [OWNER],
    payment_hold_lead_hours: 72,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tracer: the card checkout prices one stop on the server route distance (STOP-02)', () => {
  it('calls Google once through the stop and prices 130 km plus 2 paid blocks of waiting (24 EUR)', async () => {
    const out = await call(body(130, 24, { stops: [STOP_KV] }))
    expect(out.status).toBe(200)
    expect(routeDistanceMock).toHaveBeenCalledTimes(1)
    const arg = routeDistanceMock.mock.calls[0][0]
    expect(arg.origin).toEqual({ lat: 50.0755, lng: 14.4378 })
    expect(arg.destination).toEqual({ lat: 49.1951, lng: 16.6068 })
    expect(arg.intermediates).toEqual([{ lat: STOP_KV.lat, lng: STOP_KV.lng }])
    expect(out.body.amountMinor).toBe(serverAmount(130, 24))
  })

  it('stores the server distance on the booking row, not the 1 km the browser sent', async () => {
    const out = await call(body(130, 24, { stops: [STOP_KV] }))
    expect(out.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0].distance_km).toBe(130)
  })

  it('a displayed amount computed from the tampered 1 km answers 409 PRICE_CHANGED with the server amount, no write', async () => {
    const out = await call(body(130, 24, { stops: [STOP_KV] }, { displayedAmountMinor: serverAmount(1) }))
    expect(out.status).toBe(409)
    expect(out.body).toMatchObject({ code: 'PRICE_CHANGED', amountMinor: serverAmount(130, 24) })
    expectNoWrites()
  })

  it('the cancellation window follows the server distance: a 130 km route needs the long-trip free hours', async () => {
    // body(130, ...) carries the 12 h long-trip free-until; with the tampered 1 km the server would have shown 1 h.
    const ok = await call(body(130, 24, { stops: [STOP_KV] }))
    expect(ok.status).toBe(200)
    const stale = await call(
      body(130, 24, { stops: [STOP_KV] }, { displayedFreeUntilIso: shownFreeUntil(1, '2027-01-16', '10:00').iso }),
    )
    expect(stale.status).toBe(409)
    expect(stale.body).toMatchObject({ code: 'POLICY_CHANGED' })
    expect((stale.body.policy as { hours: number }).hours).toBe(12)
  })
})

describe('ROUTING_UNAVAILABLE: Google routing down fails closed (D-17, T-91-13)', () => {
  it('the intent route answers 503 ROUTING_UNAVAILABLE, writes nothing and never prices the tampered 1 km', async () => {
    routeDistanceMock.mockResolvedValue({ ok: false, reason: 'timeout' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The browser even shows the (cheap) amount of its own 1 km: a fallback to it would let the booking through.
    const out = await call(body(1, 0, { stops: [STOP_KV] }))
    expect(out.status).toBe(503)
    expect(out.body).toMatchObject({ code: 'ROUTING_UNAVAILABLE' })
    expectNoWrites()
    // Logs carry the reason code only: no address, no coordinates.
    const logged = JSON.stringify(errSpy.mock.calls)
    expect(logged).not.toContain('Karlovy')
    expect(logged).not.toContain('50.2319')
    expect(logged).not.toContain('50.0755')
    errSpy.mockRestore()
  })
})

describe('WAITING_NOT_AVAILABLE: a class without a waiting rate (D-05)', () => {
  it('a stop waiting 45 minutes on first_class answers 422 and nothing is stored', async () => {
    const out = await call(body(130, 0, { vehicleClass: 'first_class', stops: [STOP_KV] }))
    expect(out.status).toBe(422)
    expect(out.body).toMatchObject({ code: 'WAITING_NOT_AVAILABLE' })
    expect(routeDistanceMock).not.toHaveBeenCalled() // refused before spending routing quota
    expectNoWrites()
  })

  it('the same stop waiting only the free 15 minutes is priced with a waiting fee of 0', async () => {
    const bd = bookingData({ vehicleClass: 'first_class', stops: [{ ...STOP_KV, waitMinutes: 15 }] })
    const parsed = checkoutBookingSchema.parse({ bookingData: bd })
    const validated = validateCheckoutBooking(parsed.bookingData)
    if (!validated.ok) throw new Error(validated.code)
    const priced = await priceCheckout({ bookingData: parsed.bookingData, validated, currency: 'eur' })
    expect(priced.ok).toBe(true)
    if (!priced.ok) return
    expect(priced.waitingFeeEur).toBe(0)
    expect(priced.stops).toHaveLength(1)
    expect(priced.stops[0]).toMatchObject({ waitMinutes: 15, blocks: 0, feeEur: 0 })
  })
})

describe('stop validation (STOP-01, T-91-14)', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ address: `Stop ${i}`, lat: 50 + i / 100, lng: 14, waitMinutes: 0 }))

  it.each([
    ['six stops', { stops: six }],
    ['a wait of 20 minutes (not a 15-minute step)', { stops: [{ ...STOP_KV, waitMinutes: 20 }] }],
    ['a wait of 135 minutes (above 120)', { stops: [{ ...STOP_KV, waitMinutes: 135 }] }],
    ['an address with a line break', { stops: [{ ...STOP_KV, address: 'Karlovy\nVary' }] }],
    ['a 501-character address', { stops: [{ ...STOP_KV, address: 'a'.repeat(501) }] }],
    ['a stop without lng', { stops: [{ address: 'Karlovy Vary', lat: 50.23, waitMinutes: 0 }] }],
    ['a stop with an unknown key', { stops: [{ ...STOP_KV, extra: 'x' }] }],
    ['a latitude out of range', { stops: [{ ...STOP_KV, lat: 91 }] }],
  ])('%s -> 400 INVALID_REQUEST, no routing call, no write', async (_name, data) => {
    const out = await call(body(130, 0, data))
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(routeDistanceMock).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('a transfer without originLat -> 400 INVALID_REQUEST "Invalid coordinates"', async () => {
    const out = await call(body(130, 0, { originLat: undefined }))
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ code: 'INVALID_REQUEST', error: 'Invalid coordinates' })
    expect(routeDistanceMock).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('hourly with a stop -> 400 STOPS_NOT_ALLOWED through the intent route', async () => {
    const out = await call(body(130, 0, { tripType: 'hourly', hours: '3', stops: [{ ...STOP_KV, waitMinutes: 0 }] }))
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ code: 'STOPS_NOT_ALLOWED' })
    expectNoWrites()
  })

  it.each(['round_trip', 'hourly', 'daily'])('validateCheckoutBooking: %s with one stop -> 400 STOPS_NOT_ALLOWED', (tripType) => {
    const parsed = checkoutBookingSchema.parse({
      bookingData: bookingData({
        tripType,
        returnDate: '2027-01-18',
        returnTime: '10:00',
        stops: [{ ...STOP_KV, waitMinutes: 0 }],
      }),
    })
    const result = validateCheckoutBooking(parsed.bookingData)
    expect(result).toMatchObject({ ok: false, status: 400, code: 'STOPS_NOT_ALLOWED' })
  })
})

describe('hourly and daily checkouts are untouched (no routing, same amounts as before the phase)', () => {
  async function priceDirect(data: Record<string, unknown>) {
    const parsed = checkoutBookingSchema.parse({ bookingData: bookingData(data) })
    const validated = validateCheckoutBooking(parsed.bookingData)
    if (!validated.ok) throw new Error(validated.code)
    const priced = await priceCheckout({ bookingData: parsed.bookingData, validated, currency: 'eur' })
    if (!priced.ok) throw new Error(priced.code)
    return priced
  }

  it('hourly: computeRouteDistance is never called and the leg equals the hourly price', async () => {
    const priced = await priceDirect({ tripType: 'hourly', hours: '3' })
    expect(routeDistanceMock).not.toHaveBeenCalled()
    expect(priced.distanceKm).toBeNull()
    expect(priced.waitingFeeEur).toBe(0)
    expect(priced.outboundLegEur).toBe(
      computeOutboundLegTotal('business', null, 3, 1, 'hourly', '2027-01-16', '10:00', false, PRICING),
    )
  })

  it('daily: computeRouteDistance is never called and the leg equals the daily price', async () => {
    const priced = await priceDirect({ tripType: 'daily', returnDate: '2027-01-19' })
    expect(routeDistanceMock).not.toHaveBeenCalled()
    expect(priced.distanceKm).toBeNull()
    expect(priced.outboundLegEur).toBe(
      computeOutboundLegTotal('business', null, 2, 3, 'daily', '2027-01-16', '10:00', false, PRICING),
    )
  })
})
