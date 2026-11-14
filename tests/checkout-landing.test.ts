// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 91 plan 91-07 (STOP-05, D-07, D-18): an airport pickup is timed after landing on the server. The checkout
// takes the landing date, time and an offset, derives and validates the pickup in Prague time and stores both.
// Real intent route + real checkout/state modules over the in-memory payments DB and the fake Stripe; only Google
// Routes is mocked.

const { dbHolder, stripeHolder, pricingConfigMock, rateLimitMock, routeDistanceMock, payNowCreate } = vi.hoisted(() => ({
  dbHolder: { client: null as unknown },
  stripeHolder: { stripe: null as unknown },
  pricingConfigMock: vi.fn(),
  rateLimitMock: vi.fn(),
  routeDistanceMock: vi.fn(),
  // The pay-now route's own Stripe client (the `stripe` package): only paymentIntents.create is used.
  payNowCreate: vi.fn(),
}))

vi.mock('stripe', () => {
  function MockStripe() {
    return { paymentIntents: { create: payNowCreate } }
  }
  MockStripe.createFetchHttpClient = () => ({})
  return { default: MockStripe }
})

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
import { POST as payNowPOST } from '@/app/api/create-payment-intent/route'
import { buildBookingRow, buildBookingRows } from '@/lib/supabase'
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
  payNowCreate.mockReset()
  payNowCreate.mockResolvedValue({ id: 'pi_paynow_1', client_secret: 'pi_paynow_1_secret_x' })
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy')
  Object.assign(db.state.pricing_globals[0], {
    card_flow_mode: 'canary',
    card_flow_canary_emails: [OWNER],
    payment_hold_lead_hours: 72,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
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

// ── Task 3: the validation matrix on all flows ──────────────────────────────────────────────────────────────

function expectNoWrites() {
  expect(bookings()).toHaveLength(0)
  expect(db.state.booking_payment_consents).toHaveLength(0)
  expect(db.state.booking_payment_events).toHaveLength(0)
  expect(fake.calls).toHaveLength(0)
}

describe('landing validation (STOP-05, T-91-22, T-91-23)', () => {
  it.each([
    ['landingDate and landingTime without an offset', { pickupOffsetMin: '' }],
    ['only the offset', { landingDate: '', landingTime: '' }],
    ['only the landing date', { landingTime: '', pickupOffsetMin: '' }],
    ['an offset of 10 (not an allowed step)', { pickupOffsetMin: '10' }],
    ['an offset of 120 (three digits)', { pickupOffsetMin: '120' }],
    ['an offset of 5 (one digit, not allowed)', { pickupOffsetMin: '5' }],
    ['an offset that is not a number', { pickupOffsetMin: 'ab' }],
    ['a landing date that does not exist', { landingDate: '2027-02-30' }],
    ['a landing time of 25:00', { landingTime: '25:00' }],
  ])('%s -> 400 INVALID_REQUEST, no write', async (_name, data) => {
    const out = await call(body(data))
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ code: 'INVALID_REQUEST' })
    expectNoWrites()
  })

  it('hourly with landing fields -> 400 LANDING_NOT_ALLOWED', async () => {
    const out = await call(body({ tripType: 'hourly', hours: '3' }))
    expect(out.status).toBe(400)
    expect(out.body).toMatchObject({ code: 'LANDING_NOT_ALLOWED' })
    expectNoWrites()
  })

  it('daily with landing fields -> 400 LANDING_NOT_ALLOWED (pay-now; a daily booking is not a card-flow trip)', async () => {
    const res = await payNowPOST(payNowReq(payNowData({ tripType: 'daily', returnDate: '2027-06-12' })))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'LANDING_NOT_ALLOWED' })
    expect(payNowCreate).not.toHaveBeenCalled()
  })

  it('a city origin with landing fields -> 422 LANDING_NOT_AIRPORT, no write', async () => {
    const out = await call(body({ originLat: '50.0755', originLng: '14.4378', originAddress: 'Prague centre' }))
    expect(out.status).toBe(422)
    expect(out.body).toMatchObject({ code: 'LANDING_NOT_AIRPORT' })
    expectNoWrites()
  })

  it('an airport as the DESTINATION with landing fields -> 422 LANDING_NOT_AIRPORT (landing is for arrivals)', async () => {
    const out = await call(
      body({
        originLat: '49.1951',
        originLng: '16.6068',
        originAddress: 'Brno',
        destinationLat: String(PRG_LAT),
        destinationLng: String(PRG_LNG),
        destinationAddress: 'Vaclav Havel Airport Prague',
      }),
    )
    expect(out.status).toBe(422)
    expect(out.body).toMatchObject({ code: 'LANDING_NOT_AIRPORT' })
    expectNoWrites()
  })

  it('pickupTime 14:45 with landing 14:00 + 30 -> 422 PICKUP_MISMATCH, no write', async () => {
    const out = await call(body({ pickupTime: '14:45' }, { date: '2027-06-10', time: '14:30' }))
    expect(out.status).toBe(422)
    expect(out.body).toMatchObject({ code: 'PICKUP_MISMATCH' })
    expectNoWrites()
  })

  it('pickupDate one day off -> 422 PICKUP_MISMATCH', async () => {
    const out = await call(body({ pickupDate: '2027-06-11' }, { date: '2027-06-10', time: '14:30' }))
    expect(out.status).toBe(422)
    expect(out.body).toMatchObject({ code: 'PICKUP_MISMATCH' })
    expectNoWrites()
  })

  it('empty pickup fields with a landing -> 200 and the derived pickup is stored', async () => {
    const out = await call(body({ pickupDate: '', pickupTime: '' }, { date: '2027-06-10', time: '14:30' }))
    expect(out.status).toBe(200)
    expect(bookings()[0]).toMatchObject({
      pickup_date: '2027-06-10',
      pickup_time: '14:30',
      landing_time: '14:00',
      pickup_offset_min: 30,
    })
  })

  it('23:50 + 30 stores the pickup on the next calendar day (00:20) with the landing kept on its own day', async () => {
    const out = await call(
      body({ landingTime: '23:50', pickupDate: '2027-06-11', pickupTime: '00:20' }, { date: '2027-06-11', time: '00:20' }),
    )
    expect(out.status).toBe(200)
    expect(bookings()[0]).toMatchObject({
      landing_date: '2027-06-10',
      landing_time: '23:50',
      pickup_offset_min: 30,
      pickup_date: '2027-06-11',
      pickup_time: '00:20',
    })
  })

  it('no landing fields keeps today behaviour: the sent pickup is stored and the landing columns are null', async () => {
    const out = await call(
      body(
        { landingDate: '', landingTime: '', pickupOffsetMin: '', pickupTime: '16:15' },
        { date: '2027-06-10', time: '16:15' },
      ),
    )
    expect(out.status).toBe(200)
    expect(bookings()[0]).toMatchObject({
      pickup_time: '16:15',
      landing_date: null,
      landing_time: null,
      pickup_offset_min: null,
    })
  })

  it.each([
    ['0', '14:00'],
    ['15', '14:15'],
    ['45', '14:45'],
    ['60', '15:00'],
    ['90', '15:30'],
  ])('offset %s is accepted and gives pickup %s', async (offset, time) => {
    const out = await call(body({ pickupOffsetMin: offset, pickupTime: time }, { date: '2027-06-10', time }))
    expect(out.status).toBe(200)
    expect(bookings()[0]).toMatchObject({ pickup_offset_min: Number(offset), pickup_time: time })
  })
})

describe('the cash flow stores the landing too', () => {
  it('payment cash with landing 14:00 + 30 -> 200, a cash_guarantee row with the landing columns and the 14:30 pickup', async () => {
    const out = await call(body({}, undefined, { payment: 'cash' }))
    expect(out.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0]).toMatchObject({
      payment_mode: 'cash_guarantee',
      landing_date: '2027-06-10',
      landing_time: '14:00',
      pickup_offset_min: 30,
      pickup_date: '2027-06-10',
      pickup_time: '14:30',
    })
  })

  it('a mismatching pickup is 422 PICKUP_MISMATCH on the cash flow as well', async () => {
    const out = await call(body({ pickupTime: '15:00' }, { date: '2027-06-10', time: '14:30' }, { payment: 'cash' }))
    expect(out.status).toBe(422)
    expect(out.body).toMatchObject({ code: 'PICKUP_MISMATCH' })
    expectNoWrites()
  })
})

// ── pay-now ──────────────────────────────────────────────────────────────────────────────────────────────

function payNowData(over: Record<string, unknown> = {}) {
  return { ...bookingData(), ...over }
}

function payNowReq(data: Record<string, unknown>): Request {
  return new Request('http://localhost/api/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ bookingData: data }),
  })
}

// "Now" is 2027-01-10 09:00Z = 10:00 Prague. 11 h 50 min ahead is 21:50 Prague the same day.
describe('LEAD_TIME runs on the derived pickup, not on the landing (T-91-22)', () => {
  const LANDING = { landingDate: '2027-01-10', landingTime: '21:50' }

  it('intent: landing 11 h 50 min ahead with offset 0 -> 422 LEAD_TIME', async () => {
    const out = await call(
      body(
        { ...LANDING, pickupOffsetMin: '0', pickupDate: '2027-01-10', pickupTime: '21:50' },
        undefined,
        { mode: 'hold_now' },
      ),
    )
    expect(out.status).toBe(422)
    expect(out.body).toMatchObject({ code: 'LEAD_TIME' })
    expectNoWrites()
  })

  it('intent: the same landing with offset 30 (pickup 12 h 20 min ahead) passes the lead check', async () => {
    const out = await call(
      body(
        { ...LANDING, pickupOffsetMin: '30', pickupDate: '2027-01-10', pickupTime: '22:20' },
        undefined,
        { mode: 'hold_now' },
      ),
    )
    expect(out.body.code).not.toBe('LEAD_TIME')
    expect(out.status).toBe(200)
    expect(bookings()[0]).toMatchObject({ pickup_date: '2027-01-10', pickup_time: '22:20', landing_time: '21:50' })
  })

  it('pay-now: landing 11 h 50 min ahead with offset 0 -> 422 LEAD_TIME, Stripe never called', async () => {
    const res = await payNowPOST(
      payNowReq(payNowData({ ...LANDING, pickupOffsetMin: '0', pickupDate: '', pickupTime: '' })),
    )
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'LEAD_TIME' })
    expect(payNowCreate).not.toHaveBeenCalled()
  })

  it('pay-now: the same landing with offset 30 (pickup 12 h 20 min ahead) is accepted', async () => {
    const res = await payNowPOST(
      payNowReq(payNowData({ ...LANDING, pickupOffsetMin: '30', pickupDate: '', pickupTime: '' })),
    )
    expect(res.status).toBe(200)
    expect(payNowCreate).toHaveBeenCalledTimes(1)
    expect(payNowCreate.mock.calls[0][0].metadata).toMatchObject({ pickupDate: '2027-01-10', pickupTime: '22:20' })
  })
})

describe('pay-now (create-payment-intent) carries the landing in the PaymentIntent metadata', () => {
  it('landing 2027-06-10 14:00 + 30 -> metadata landingDate, landingTime, pickupOffsetMin and pickupTime 14:30', async () => {
    const res = await payNowPOST(payNowReq(payNowData()))
    expect(res.status).toBe(200)
    expect(payNowCreate).toHaveBeenCalledTimes(1)
    expect(payNowCreate.mock.calls[0][0].metadata).toMatchObject({
      landingDate: '2027-06-10',
      landingTime: '14:00',
      pickupOffsetMin: '30',
      pickupDate: '2027-06-10',
      pickupTime: '14:30',
    })
  })

  it('the unpaid capture row stores the landing columns', async () => {
    const res = await payNowPOST(payNowReq(payNowData()))
    expect(res.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0]).toMatchObject({
      landing_date: '2027-06-10',
      landing_time: '14:00',
      pickup_offset_min: 30,
      pickup_time: '14:30',
    })
  })

  it('without landing the metadata key set is unchanged (no landing keys)', async () => {
    const withLanding = await payNowPOST(payNowReq(payNowData()))
    expect(withLanding.status).toBe(200)
    const keysWith = Object.keys(payNowCreate.mock.calls[0][0].metadata)

    payNowCreate.mockClear()
    const without = await payNowPOST(
      payNowReq(
        payNowData({
          landingDate: '',
          landingTime: '',
          pickupOffsetMin: '',
          attemptId: '22222222-2222-4222-8222-222222222222',
        }),
      ),
    )
    expect(without.status).toBe(200)
    const keysWithout = Object.keys(payNowCreate.mock.calls[0][0].metadata)
    expect(keysWithout).not.toContain('landingDate')
    expect(keysWithout).not.toContain('landingTime')
    expect(keysWithout).not.toContain('pickupOffsetMin')
    expect(keysWith.filter((k) => !keysWithout.includes(k)).sort()).toEqual([
      'landingDate',
      'landingTime',
      'pickupOffsetMin',
    ])
  })

  it.each([
    ['PICKUP_MISMATCH', 422, { pickupTime: '14:45' }],
    ['LANDING_NOT_AIRPORT', 422, { originLat: '50.0755', originLng: '14.4378', originAddress: 'Prague centre' }],
    ['LANDING_NOT_ALLOWED', 400, { tripType: 'hourly', hours: '3' }],
    ['INVALID_REQUEST', 400, { pickupOffsetMin: '' }],
  ])('pay-now refuses %s with %i and never calls Stripe', async (code, status, data) => {
    const res = await payNowPOST(payNowReq(payNowData(data)))
    expect(res.status).toBe(status)
    expect(await res.json()).toMatchObject({ code })
    expect(payNowCreate).not.toHaveBeenCalled()
  })
})

describe('round trip from the airport: the landing is stored on the outbound row only', () => {
  const RT = { tripType: 'round_trip', returnDate: '2027-06-12', returnTime: '10:00' }

  it('pay-now round trip: outbound row has the three columns, the return row has them null', async () => {
    const res = await payNowPOST(payNowReq(payNowData(RT)))
    expect(res.status).toBe(200)
    expect(bookings()).toHaveLength(2)
    const outbound = bookings().find((b) => b.leg === 'outbound')
    const ret = bookings().find((b) => b.leg === 'return')
    expect(outbound).toMatchObject({
      landing_date: '2027-06-10',
      landing_time: '14:00',
      pickup_offset_min: 30,
      pickup_date: '2027-06-10',
      pickup_time: '14:30',
    })
    expect(ret).toMatchObject({
      landing_date: null,
      landing_time: null,
      pickup_offset_min: null,
      pickup_date: '2027-06-12',
      pickup_time: '10:00',
    })
  })

  it('the return must still be after the DERIVED pickup: a return 14:10 on the pickup day is 400 RETURN_BEFORE_PICKUP', async () => {
    const res = await payNowPOST(payNowReq(payNowData({ ...RT, returnDate: '2027-06-10', returnTime: '14:10' })))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'RETURN_BEFORE_PICKUP' })
  })

  it('a round trip with empty pickup fields and a landing derives the pickup (no ROUND_TRIP_DATES error)', async () => {
    const res = await payNowPOST(payNowReq(payNowData({ ...RT, pickupDate: '', pickupTime: '' })))
    expect(res.status).toBe(200)
    expect(payNowCreate.mock.calls[0][0].metadata).toMatchObject({ pickupDate: '2027-06-10', pickupTime: '14:30' })
  })

  it('buildBookingRows: the outbound row carries the landing, the return row has the three columns null', () => {
    const meta = {
      bookingReference: 'PRG-1',
      returnBookingReference: 'PRG-2',
      tripType: 'round_trip',
      pickupDate: '2027-06-10',
      pickupTime: '14:30',
      returnDate: '2027-06-12',
      returnTime: '10:00',
      landingDate: '2027-06-10',
      landingTime: '14:00',
      pickupOffsetMin: '30',
      vehicleClass: 'business',
    }
    const { outbound, return: returnRow } = buildBookingRows(meta, 'pi_1')
    expect(outbound).toMatchObject({ landing_date: '2027-06-10', landing_time: '14:00', pickup_offset_min: 30 })
    expect(returnRow).toMatchObject({ landing_date: null, landing_time: null, pickup_offset_min: null })
  })

  it('buildBookingRow without landing meta -> the three columns null; pickup_utc is never part of the row', () => {
    const row = buildBookingRow(
      {
        bookingReference: 'PRG-1',
        tripType: 'transfer',
        pickupDate: '2027-06-10',
        pickupTime: '14:30',
        vehicleClass: 'business',
      },
      'pi_1',
      'confirmed',
    )
    expect(row).toMatchObject({ landing_date: null, landing_time: null, pickup_offset_min: null })
    expect(row).not.toHaveProperty('pickup_utc')
  })
})
