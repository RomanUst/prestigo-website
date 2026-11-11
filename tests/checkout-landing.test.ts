// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 91 plan 91-07 (STOP-05, D-07, D-18): an airport pickup is timed after landing on the server. The checkout
// takes the landing date, time and an offset, derives and validates the pickup in Prague time and stores both.
// Real intent route + real checkout/state modules over the in-memory payments DB and the fake Stripe; only Google
// Routes is mocked.

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
import { PRG_LAT, PRG_LNG } from '@/lib/airport'
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

let db: FakePaymentsDb
let fake: FakeStripe

/** What the quote / checkout charges for `km` km on business at the given pickup. The airport fee applies. */
function serverAmount(km: number, pickupDate: string, pickupTime: string, isAirport = true): number {
  const outbound = computeOutboundLegTotal('business', km, 2, 1, 'transfer', pickupDate, pickupTime, isAirport, PRICING)
  return computeCombinedTotalMinor({
    outboundLegEur: outbound,
    extrasEur: 0,
    returnLegEur: 0,
    promoPct: 0,
    currency: 'eur',
  }).stripeAmountMinor
}

/** A transfer from Prague airport to Brno with landing 2027-06-10 14:00 + 30 minutes unless overridden. */
function bookingData(over: Record<string, unknown> = {}) {
  return {
    tripType: 'transfer',
    vehicleClass: 'business',
    originLat: String(PRG_LAT),
    originLng: String(PRG_LNG),
    destinationLat: '49.1951',
    destinationLng: '16.6068',
    landingDate: '2027-06-10',
    landingTime: '14:00',
    pickupOffsetMin: '30',
    pickupDate: '2027-06-10',
    pickupTime: '14:30',
    passengers: '2',
    firstName: 'Anna',
    lastName: 'Novak',
    email: OWNER,
    phone: PHONE,
    locale: 'en',
    originAddress: 'Vaclav Havel Airport Prague',
    destinationAddress: 'Brno',
    attemptId: ATTEMPT,
    ...over,
  }
}

/** A complete intent body. `priceAt` is the pickup the browser priced (the derived one). */
function body(data: Record<string, unknown> = {}, priceAt?: { date: string; time: string }, over: Record<string, unknown> = {}) {
  const bd = bookingData(data)
  const pickupDate = priceAt?.date ?? (bd.pickupDate as string)
  const pickupTime = priceAt?.time ?? (bd.pickupTime as string)
  const pickupMs = pickupInstantMs({ pickup_utc: null, pickup_date: pickupDate, pickup_time: pickupTime }) as number
  const g = db.state.pricing_globals[0] as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
  const hours = KM <= num(g.cancel_free_km_threshold, 100) ? num(g.cancel_free_hours_short, 1) : num(g.cancel_free_hours_long, 12)
  const freeMs = pickupMs - Math.round(hours * 3_600_000)
  return {
    bookingData: bd,
    currency: 'eur',
    mode: 'setup',
    consent: true,
    displayedAmountMinor: serverAmount(KM, pickupDate, pickupTime),
    displayedHoldDateIso: holdDateIso(computeHoldAt(pickupMs, 72).holdAtMs),
    displayedFreeUntilIso: new Date(freeMs).toISOString(),
    displayedFreeUntilPassed: Date.now() > freeMs,
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

const bookings = () => db.state.bookings

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

describe('tracer: an airport card checkout stores the landing time and the derived pickup (STOP-05, D-07, D-18)', () => {
  it('landing 2027-06-10 14:00 + 30 -> 200; the row has landing_date, landing_time, pickup_offset_min and the 14:30 pickup', async () => {
    const out = await call(body())
    expect(out.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0]).toMatchObject({
      landing_date: '2027-06-10',
      landing_time: '14:00',
      pickup_offset_min: 30,
      pickup_date: '2027-06-10',
      pickup_time: '14:30',
    })
  })
})
