// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 91 plan 91-06 (STOP-04, T-91-19, T-91-20): the stops a client booked are stored with the captured unpaid
// booking. Real intent route + real checkout/state modules over the in-memory payments DB and the fake Stripe;
// only Google Routes is mocked.

const { dbHolder, stripeHolder, pricingConfigMock, rateLimitMock, routeDistanceMock } = vi.hoisted(() => ({
  dbHolder: { client: null as unknown },
  stripeHolder: { stripe: null as unknown },
  pricingConfigMock: vi.fn(),
  rateLimitMock: vi.fn(),
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
const KM = 130

const STOP_KV = { address: 'Karlovy Vary', lat: 50.2319, lng: 12.8715, waitMinutes: 45 }
const STOP_PLZEN = { address: 'Plzen', lat: 49.7384, lng: 13.3736, waitMinutes: 15 }

let db: FakePaymentsDb
let fake: FakeStripe

/** What the checkout charges for KM km on business at the fixed pickup plus `waitingEur` of waiting. */
function serverAmount(waitingEur: number): number {
  const outbound = computeOutboundLegTotal('business', KM, 2, 1, 'transfer', '2027-01-16', '10:00', false, PRICING)
  return computeCombinedTotalMinor({
    outboundLegEur: outbound,
    extrasEur: waitingEur,
    returnLegEur: 0,
    promoPct: 0,
    currency: 'eur',
  }).stripeAmountMinor
}

function bookingData(over: Record<string, unknown> = {}) {
  return {
    tripType: 'transfer',
    vehicleClass: 'business',
    distanceKm: '1', // a browser value that must never matter
    originLat: '50.0755',
    originLng: '14.4378',
    destinationLat: '49.1951',
    destinationLng: '16.6068',
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

/** A complete intent body for a KM km trip with `waitingEur` of waiting (default policy: over 100 km frees 12 h). */
function body(waitingEur: number, data: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  const bd = bookingData(data)
  const pickupMs = pickupInstantMs({ pickup_utc: null, pickup_date: '2027-01-16', pickup_time: '10:00' }) as number
  const freeMs = pickupMs - 12 * 3_600_000
  return {
    bookingData: bd,
    currency: 'eur',
    mode: 'setup',
    consent: true,
    displayedAmountMinor: serverAmount(waitingEur),
    displayedHoldDateIso: holdDateIso(computeHoldAt(pickupMs, 72).holdAtMs),
    displayedFreeUntilIso: new Date(freeMs).toISOString(),
    displayedFreeUntilPassed: Date.now() > freeMs,
    ...over,
  }
}

async function call(payload: unknown) {
  const res = await POST(
    new Request('http://localhost/api/card-checkout/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
      body: JSON.stringify(payload),
    }),
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const bookings = () => db.state.bookings
const stopRows = () => db.state.booking_stops

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  db = createFakePaymentsDb({ nowMs: NOW })
  fake = createFakeStripe({ nowSec: () => Math.floor(NOW / 1000) })
  dbHolder.client = db.client
  stripeHolder.stripe = fake.stripe
  pricingConfigMock.mockReset()
  pricingConfigMock.mockResolvedValue(PRICING)
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  routeDistanceMock.mockReset()
  routeDistanceMock.mockResolvedValue({ ok: true, distanceKm: KM, durationMin: 150 })
  Object.assign(db.state.pricing_globals[0], {
    card_flow_mode: 'canary',
    card_flow_canary_emails: [OWNER],
    payment_hold_lead_hours: 72,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tracer: a card checkout with one stop stores that stop on the captured booking (STOP-04)', () => {
  it('leaves one booking_stops row with the waiting snapshot, linked to the unpaid booking', async () => {
    const out = await call(body(24, { stops: [STOP_KV] }))
    expect(out.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0]).toMatchObject({ status: 'unpaid', payment_mode: 'card_hold', attempt_id: ATTEMPT })

    expect(stopRows()).toHaveLength(1)
    expect(stopRows()[0]).toMatchObject({
      booking_id: bookings()[0].id,
      position: 1,
      address: 'Karlovy Vary',
      lat: 50.2319,
      lng: 12.8715,
      wait_minutes: 45,
      free_minutes: 15,
      blocks: 2,
      fee_per_block_eur: 12,
      fee_eur: 24,
    })
  })

  it('a booking without stops leaves no stop row', async () => {
    const out = await call(body(0))
    expect(out.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(stopRows()).toHaveLength(0)
  })

  it('stores the stops in driving order, one row per stop', async () => {
    const out = await call(body(24, { stops: [STOP_KV, STOP_PLZEN] }))
    expect(out.status).toBe(200)
    expect(stopRows().map((r) => [r.position, r.address])).toEqual([
      [1, 'Karlovy Vary'],
      [2, 'Plzen'],
    ])
  })
})
