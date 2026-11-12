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
// The pay-now route builds its own Stripe client from the `stripe` package (cached at module level): hand it a stable
// object that delegates to the fake of the current test.
vi.mock('stripe', () => {
  const delegate = (method: 'create' | 'cancel') => (...args: unknown[]) =>
    (stripeHolder.stripe as { paymentIntents: Record<string, (...a: unknown[]) => unknown> }).paymentIntents[method](...args)
  const stable = { paymentIntents: { create: delegate('create'), cancel: delegate('cancel') } }
  function MockStripe() {
    return stable
  }
  MockStripe.createFetchHttpClient = () => ({})
  return { default: MockStripe }
})

import { POST } from '@/app/api/card-checkout/intent/route'
import { POST as payNowPOST } from '@/app/api/create-payment-intent/route'
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

describe('retries and confirmed bookings (Pitfall 5, T-91-19)', () => {
  it('retry: the same attemptId re-posted with two stops then one stop leaves exactly the second request stop', async () => {
    const first = await call(body(24, { stops: [STOP_KV, STOP_PLZEN] }))
    expect(first.status).toBe(200)
    expect(stopRows()).toHaveLength(2)

    const second = await call(body(0, { stops: [STOP_PLZEN] }))
    expect(second.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(stopRows()).toHaveLength(1)
    expect(stopRows()[0]).toMatchObject({ booking_id: bookings()[0].id, position: 1, address: 'Plzen', wait_minutes: 15, fee_eur: 0 })
  })

  it('retry without stops clears the stops of the earlier attempt', async () => {
    await call(body(24, { stops: [STOP_KV] }))
    expect(stopRows()).toHaveLength(1)
    const again = await call(body(0))
    expect(again.status).toBe(200)
    expect(stopRows()).toHaveLength(0)
  })

  it('confirmed: a re-post for a booking that is no longer unpaid neither deletes nor inserts stops', async () => {
    await call(body(24, { stops: [STOP_KV, STOP_PLZEN] }))
    const before = JSON.stringify(stopRows())
    bookings()[0].status = 'confirmed'

    const again = await call(body(0, { stops: [STOP_PLZEN] }))
    expect(again.status).toBe(200)
    expect(JSON.stringify(stopRows())).toBe(before)
  })

  it('confirmed (lost race): the row leaves unpaid between the lookup and the capture, so stops stay as they were', async () => {
    await call(body(24, { stops: [STOP_KV] }))
    const before = JSON.stringify(stopRows())
    // The lookup (first bookings read) still sees an unpaid row; the capture (second read) sees it confirmed.
    let bookingReads = 0
    const real = db.client
    dbHolder.client = {
      rpc: real.rpc,
      from: (table: string) => {
        if (table === 'bookings') {
          bookingReads += 1
          if (bookingReads === 2) bookings()[0].status = 'confirmed'
        }
        return real.from(table)
      },
    }
    const again = await call(body(0, { stops: [STOP_PLZEN] }))
    expect(again.status).toBe(200)
    expect(bookingReads).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(stopRows())).toBe(before)
  })

  it('a save error propagates: the route answers its 500 and no client secret leaves', async () => {
    const real = db.client
    dbHolder.client = {
      rpc: real.rpc,
      from: (table: string) => {
        if (table === 'booking_stops') {
          const q: unknown = new Proxy(function () {}, {
            get(_t, prop) {
              if (prop === 'then') {
                return (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom Karlovy Vary' } }).then(res)
              }
              return () => q
            },
          })
          return q
        }
        return real.from(table)
      },
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await call(body(24, { stops: [STOP_KV] }))
    expect(out.status).toBe(500)
    expect(out.body.clientSecret).toBeUndefined()
    expect(fake.calls).toHaveLength(0)
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Karlovy')
    spy.mockRestore()
  })
})

/** A client whose queries on `table` end in the given database error (an address inside it proves logs stay clean). */
function failingTableClient(table: string, only?: 'insert') {
  const real = db.client
  const failing = (): unknown => {
    const q: unknown = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom Karlovy Vary' } }).then(res)
        }
        return () => q
      },
    })
    return q
  }
  return {
    rpc: real.rpc,
    from: (name: string) => {
      if (name !== table) return real.from(name)
      if (!only) return failing()
      const query = real.from(name)
      return new Proxy(query, {
        get(target, prop, receiver) {
          if (prop === only) return () => failing()
          const v = Reflect.get(target, prop, receiver)
          return typeof v === 'function' ? v.bind(target) : v
        },
      })
    },
  }
}

function payNowBody(data: Record<string, unknown> = {}) {
  return { bookingData: { ...bookingData(data), currency: 'eur' } }
}

async function payNow(payload: unknown) {
  const res = await payNowPOST(
    new Request('http://localhost/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('pay-now stores stops after its capture and fails closed (T-91-20)', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy_for_unit_tests')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('one stop and an attemptId: the unpaid pay-now row is captured and its stop is stored', async () => {
    const out = await payNow(payNowBody({ stops: [STOP_KV] }))
    expect(out.status).toBe(200)
    expect(typeof out.body.clientSecret).toBe('string')
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0]).toMatchObject({ status: 'unpaid', payment_mode: 'pay_now', attempt_id: ATTEMPT })
    expect(stopRows()).toHaveLength(1)
    expect(stopRows()[0]).toMatchObject({
      booking_id: bookings()[0].id,
      position: 1,
      address: 'Karlovy Vary',
      wait_minutes: 45,
      blocks: 2,
      fee_per_block_eur: 12,
      fee_eur: 24,
    })
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
  })

  it('WR-06: the pay-now PaymentIntent carries the stop count (and no address); a trip without stops carries none', async () => {
    await payNow(payNowBody({ stops: [STOP_KV] }))
    const withStops = fake.callsTo('paymentIntents.create')[0].params.metadata as Record<string, string>
    expect(withStops.stopCount).toBe('1')
    expect(JSON.stringify(Object.entries(withStops).filter(([k]) => k === 'stopCount'))).not.toContain('Karlovy')

    await payNow(payNowBody({ attemptId: '22222222-2222-4222-8222-222222222222' }))
    const without = fake.callsTo('paymentIntents.create')[1].params.metadata as Record<string, string>
    expect('stopCount' in without).toBe(false)
  })

  it('stops without an attemptId: 400 INVALID_REQUEST and no PaymentIntent is created', async () => {
    const out = await payNow(payNowBody({ stops: [STOP_KV], attemptId: undefined }))
    expect(out.status).toBe(400)
    expect(out.body.code).toBe('INVALID_REQUEST')
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(bookings()).toHaveLength(0)
    expect(stopRows()).toHaveLength(0)
  })

  it('the stops cannot be saved: the new PaymentIntent is cancelled and the route answers 503 STOPS_NOT_SAVED', async () => {
    dbHolder.client = failingTableClient('booking_stops')
    const out = await payNow(payNowBody({ stops: [STOP_KV] }))
    expect(out.status).toBe(503)
    expect(out.body.code).toBe('STOPS_NOT_SAVED')
    expect(out.body.clientSecret).toBeUndefined()
    const created = fake.callsTo('paymentIntents.create')
    expect(created).toHaveLength(1)
    const cancels = fake.callsTo('paymentIntents.cancel')
    expect(cancels).toHaveLength(1)
    const [piId] = [...fake.state.paymentIntents.keys()]
    expect(cancels[0].targetId).toBe(piId)
    expect(fake.state.paymentIntents.get(piId)!.status).toBe('canceled')
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain('Karlovy')
  })

  it('the capture itself fails for a request with stops: the same cancel and 503', async () => {
    dbHolder.client = failingTableClient('bookings', 'insert')
    const out = await payNow(payNowBody({ stops: [STOP_KV] }))
    expect(out.status).toBe(503)
    expect(out.body.code).toBe('STOPS_NOT_SAVED')
    expect(out.body.clientSecret).toBeUndefined()
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(1)
    expect(stopRows()).toHaveLength(0)
  })

  it('a failing cancel does not change the answer: still 503, the code only is logged', async () => {
    dbHolder.client = failingTableClient('booking_stops')
    const original = fake.stripe.paymentIntents.cancel
    fake.stripe.paymentIntents.cancel = async () => {
      throw Object.assign(new Error('cancel failed for Karlovy Vary'), { code: 'api_connection_error' })
    }
    const out = await payNow(payNowBody({ stops: [STOP_KV] }))
    fake.stripe.paymentIntents.cancel = original
    expect(out.status).toBe(503)
    expect(out.body.code).toBe('STOPS_NOT_SAVED')
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(logged).toContain('api_connection_error')
    expect(logged).not.toContain('Karlovy')
  })

  it('no stops and the capture throws: legacy behaviour, logged, 200 with a clientSecret, nothing cancelled', async () => {
    dbHolder.client = failingTableClient('bookings', 'insert')
    const out = await payNow(payNowBody())
    expect(out.status).toBe(200)
    expect(typeof out.body.clientSecret).toBe('string')
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
  })

  it('the capture affects no row (booking already confirmed): stops untouched, 200 as today', async () => {
    db = createFakePaymentsDb({
      nowMs: NOW,
      bookings: [{ id: 'bx', attempt_id: ATTEMPT, leg: 'outbound', status: 'confirmed', payment_mode: 'pay_now' }],
    })
    dbHolder.client = db.client
    db.state.booking_stops.push({
      id: 's0', booking_id: 'bx', position: 1, address: 'Old stop', lat: 1, lng: 1,
      wait_minutes: 0, free_minutes: 15, blocks: 0, fee_per_block_eur: null, fee_eur: 0,
    })
    const before = JSON.stringify(stopRows())
    const out = await payNow(payNowBody({ stops: [STOP_KV] }))
    expect(out.status).toBe(200)
    expect(JSON.stringify(stopRows())).toBe(before)
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
  })

  it('a retry of the same attempt replaces the stops', async () => {
    await payNow(payNowBody({ stops: [STOP_KV, STOP_PLZEN] }))
    expect(stopRows()).toHaveLength(2)
    const out = await payNow(payNowBody({ stops: [STOP_PLZEN] }))
    expect(out.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(stopRows()).toHaveLength(1)
    expect(stopRows()[0].address).toBe('Plzen')
  })
})

describe('cash flow (payment cash) stores stops as well', () => {
  it('cash: one stop leaves one row on the cash_guarantee booking', async () => {
    const out = await call(body(24, { stops: [STOP_KV] }, { payment: 'cash' }))
    expect(out.status).toBe(200)
    expect(bookings()[0]).toMatchObject({ status: 'unpaid', payment_mode: 'cash_guarantee' })
    expect(stopRows()).toHaveLength(1)
    expect(stopRows()[0]).toMatchObject({ booking_id: bookings()[0].id, position: 1, blocks: 2, fee_eur: 24 })
  })
})
