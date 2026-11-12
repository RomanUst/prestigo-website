// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 91 plan 91-16 (STOP-01..STOP-05, EXTRA-01): one trip from the quote to the money, through the REAL route
// handlers of the earlier plans. A client asks for a quote with one stop and 45 minutes of waiting, checks out with the
// amount it was shown, the booking is stored with its stop and the server distance, the admin list returns that
// stop, and after the trip an operator charges extra waiting once, off-session, on the saved card.
// Only the outside world is faked: the in-memory payments DB, the fake Stripe, Google Routes, auth and mail.

const { dbHolder, stripeHolder, pricingConfigMock, rateLimitMock, routeDistanceMock, sendEmailMock, adminHolder } = vi.hoisted(
  () => ({
    dbHolder: { client: null as unknown },
    stripeHolder: { stripe: null as unknown },
    pricingConfigMock: vi.fn(),
    rateLimitMock: vi.fn(),
    routeDistanceMock: vi.fn(),
    sendEmailMock: vi.fn(),
    adminHolder: { rpcRows: null as null | (() => Record<string, unknown>[]) },
  }),
)

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => {
    const real = dbHolder.client as {
      from: (t: string) => unknown
      rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown>
    }
    return {
      from: (table: string) => {
        // The quote checks the coverage zones (a public-read table the payments fake does not model): one zone
        // that covers the whole trip, so the zone check runs for real and passes.
        if (table === 'coverage_zones') {
          const zone = {
            id: 1,
            geojson: {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [[[12, 48], [19, 48], [19, 51.5], [12, 51.5], [12, 48]]] },
              properties: {},
            },
          }
          return { select: () => ({ eq: () => Promise.resolve({ data: [zone], error: null }) }) }
        }
        return real.from(table)
      },
      // The admin list is one Postgres function the fake does not carry: answer it with the stored booking rows.
      rpc: (name: string, args?: Record<string, unknown>) => {
        if (name === 'admin_search_bookings' && adminHolder.rpcRows) {
          const rows = adminHolder.rpcRows()
          return Promise.resolve({ data: [{ rows, total_count: rows.length }], error: null })
        }
        return real.rpc(name, args)
      },
    }
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })),
  getAdminUser: vi.fn(async () => ({ user: { id: ADMIN_ID }, error: null })),
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
vi.mock('@/lib/payments/emails/send', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/emails/send')>()),
  sendPaymentEmail: sendEmailMock,
}))

import { POST as calculatePricePOST } from '@/app/api/calculate-price/route'
import { POST as intentPOST } from '@/app/api/card-checkout/intent/route'
import { GET as adminBookingsGET } from '@/app/api/admin/bookings/route'
import { GET as extraGET, POST as extraPOST } from '@/app/api/admin/bookings/[id]/extra/route'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
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

// Fixed "now": 2027-01-10 09:00Z (10:00 Prague, CET). The trip is six days later.
const NOW = Date.parse('2027-01-10T09:00:00Z')
const OWNER = 'owner@example.com'
const ATTEMPT = '11111111-1111-4111-8111-111111111111'
const PHONE = '+420725986855'
const KM = 130
const PRAGUE = { lat: 50.0755, lng: 14.4378 }
const BRNO = { lat: 49.1951, lng: 16.6068 }
const STOP = { address: 'Karlovy Vary', lat: 50.2319, lng: 12.8715, waitMinutes: 45 }

let db: FakePaymentsDb
let fake: FakeStripe

function jsonPost(url: string, payload: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    body: JSON.stringify(payload),
  })
}

type QuoteBody = {
  quoteMode: boolean
  distanceKm: number | null
  prices: Record<string, { base: number; extras: number; total: number; waitingEur?: number | null }>
  waitingUnavailable?: string[]
}

/** Step 1: what the wizard asks the quote endpoint. */
async function quote() {
  const res = await calculatePricePOST(
    jsonPost('http://localhost/api/calculate-price', {
      origin: PRAGUE,
      destination: BRNO,
      tripType: 'transfer',
      pickupDate: '2027-01-16',
      pickupTime: '10:00',
      intermediates: [{ lat: STOP.lat, lng: STOP.lng, waitMinutes: STOP.waitMinutes }],
    }),
  )
  return { status: res.status, body: (await res.json()) as QuoteBody }
}

/** Step 2: the checkout request with the amount the client was shown; `browserDistance` must never matter. */
async function checkout(displayedEur: number, browserDistance: string) {
  const pickupMs = pickupInstantMs({ pickup_utc: null, pickup_date: '2027-01-16', pickup_time: '10:00' }) as number
  const freeMs = pickupMs - 12 * 3_600_000
  const res = await intentPOST(
    jsonPost('http://localhost/api/card-checkout/intent', {
      bookingData: {
        tripType: 'transfer',
        vehicleClass: 'business',
        distanceKm: browserDistance,
        originLat: String(PRAGUE.lat),
        originLng: String(PRAGUE.lng),
        destinationLat: String(BRNO.lat),
        destinationLng: String(BRNO.lng),
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
        stops: [STOP],
      },
      currency: 'eur',
      mode: 'setup',
      consent: true,
      displayedAmountMinor: Math.round(displayedEur * 100),
      displayedHoldDateIso: holdDateIso(computeHoldAt(pickupMs, 72).holdAtMs),
      displayedFreeUntilIso: new Date(freeMs).toISOString(),
      displayedFreeUntilPassed: Date.now() > freeMs,
    }),
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const bookings = () => db.state.bookings
const stopRows = () => db.state.booking_stops
const ledger = (id: string, kind?: string) =>
  db.state.booking_payment_events.filter((e) => e.booking_id === id && (kind ? e.kind === kind : true))
const charges = (id: string) => db.state.booking_extra_charges.filter((c) => c.booking_id === id)

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  db = createFakePaymentsDb({ nowMs: NOW })
  fake = createFakeStripe({ nowSec: () => Math.floor(NOW / 1000) })
  dbHolder.client = db.client
  stripeHolder.stripe = fake.stripe
  adminHolder.rpcRows = () => bookings()
  pricingConfigMock.mockReset()
  pricingConfigMock.mockResolvedValue(PRICING)
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  routeDistanceMock.mockReset()
  routeDistanceMock.mockResolvedValue({ ok: true, distanceKm: KM, durationMin: 150 })
  sendEmailMock.mockReset()
  sendEmailMock.mockResolvedValue('sent')
  Object.assign(db.state.pricing_globals[0], {
    card_flow_mode: 'canary',
    card_flow_canary_emails: [OWNER],
    payment_hold_lead_hours: 72,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe.each([
  ['the browser sends the real distance', '130'],
  ['the browser sends a tampered distance of 1 km', '1'],
])('phase 91 end to end: %s', (_label, browserDistance) => {
  it('quote with one stop -> checkout -> stored stop and server distance -> admin list -> completed -> waiting extra charged once', async () => {
    // 1. Quote: 130 km through one stop that waits 45 minutes = 2 paid blocks of 12 EUR.
    const q = await quote()
    expect(q.status).toBe(200)
    expect(q.body.quoteMode).toBe(false)
    expect(q.body.distanceKm).toBe(KM)
    expect(routeDistanceMock).toHaveBeenCalledWith({
      origin: PRAGUE,
      destination: BRNO,
      intermediates: [{ lat: STOP.lat, lng: STOP.lng }],
    })
    expect(q.body.prices.business.waitingEur).toBe(24)
    expect(q.body.prices.business.base).toBeGreaterThan(24)
    expect(q.body.waitingUnavailable).toEqual(['first_class', 'business_van'])
    const quotedEur = q.body.prices.business.base as number

    // 2. Checkout with exactly the quoted amount: the server prices the same trip the same way.
    const out = await checkout(quotedEur, browserDistance)
    expect(out.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    const booking = bookings()[0]
    expect(booking).toMatchObject({ status: 'unpaid', payment_mode: 'card_hold', attempt_id: ATTEMPT, vehicle_class: 'business' })
    // The booking carries the server's distance, never the browser's.
    expect(Number(booking.distance_km)).toBe(KM)
    expect(booking.payment_amount_minor).toBe(Math.round(quotedEur * 100))

    // 3. The stop is stored with its waiting snapshot.
    expect(stopRows()).toHaveLength(1)
    expect(stopRows()[0]).toMatchObject({
      booking_id: booking.id,
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

    // 4. Admin list: the row arrives with its stop.
    const list = await adminBookingsGET(new Request('http://localhost/api/admin/bookings?page=0&limit=20'))
    expect(list.status).toBe(200)
    const listed = (await list.json()) as { bookings: Array<{ id: string; stops: Array<Record<string, unknown>> }>; total: number }
    expect(listed.total).toBe(1)
    expect(listed.bookings[0].id).toBe(booking.id)
    expect(listed.bookings[0].stops).toEqual([
      {
        position: 1,
        address: 'Karlovy Vary',
        lat: 50.2319,
        lng: 12.8715,
        waitMinutes: 45,
        freeMinutes: 15,
        blocks: 2,
        feePerBlockEur: 12,
        feeEur: 24,
      },
    ])

    // 5. The trip happens: completed, captured, the saved card is on the booking. The checkout itself stored the
    // client's consent to the current card-on-file text, which is what an extra charge needs.
    const id = String(booking.id)
    Object.assign(booking, {
      status: 'completed',
      booking_source: 'online',
      payment_state: 'captured',
      payment_currency: 'eur',
      captured_amount_minor: booking.payment_amount_minor,
      payment_intent_id: 'pi_original_capture',
      hold_payment_intent_id: 'pi_original_hold',
      stripe_customer_id: 'cus_1',
      stripe_payment_method_id: 'pm_ok',
    })
    expect(db.state.booking_payment_consents.filter((c) => c.booking_id === id).map((c) => c.text_version)).toEqual(['2026-11-3'])

    // 6. The operator asks what 30 more minutes cost: 2 blocks x 12 EUR = 24.00.
    const preview = await extraGET(new Request(`http://localhost/api/admin/bookings/${id}/extra?minutes=30`), params(id))
    expect(preview.status).toBe(200)
    expect(await preview.json()).toEqual({ amount_minor: 2400, currency: 'eur', blocks: 2, rate_per_block_eur: 12 })

    // 7. ... and confirms it. One off-session charge, ledgered, the booking's own payment untouched.
    const res = await extraPOST(
      new Request(`http://localhost/api/admin/bookings/${id}/extra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'waiting', minutes: 30, expected_amount_minor: 2400 }),
      }),
      params(id),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ outcome: 'charged', amount_minor: 2400, currency: 'eur' })

    const creates = fake.callsTo('paymentIntents.create').filter((c) => (c.params as { metadata?: { kind?: string } }).metadata?.kind === 'card_extra')
    expect(creates).toHaveLength(1)
    expect(creates[0].params).toMatchObject({
      amount: 2400,
      currency: 'eur',
      customer: 'cus_1',
      payment_method: 'pm_ok',
      off_session: true,
      confirm: true,
    })

    expect(ledger(id).map((e) => e.kind).filter((k) => k === 'admin_action' || k === 'extra_charged')).toEqual(['admin_action', 'extra_charged'])
    expect(charges(id)).toHaveLength(1)
    expect(charges(id)[0]).toMatchObject({ kind: 'waiting', status: 'charged', amount_minor: 2400, minutes: 30, blocks: 2, rate_per_block_eur: 12 })
    expect(booking.payment_intent_id).toBe('pi_original_capture')
    expect(booking.hold_payment_intent_id).toBe('pi_original_hold')
    expect(booking.status).toBe('completed')
    expect(booking.payment_state).toBe('captured')
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ kind: 'extra_charged', variant: 'waiting', feeMinor: 2400 })
  })
})

describe('classes without a waiting rate (D-05)', () => {
  it('a class with no waiting rate is listed as unavailable in the quote and has no waitingEur', async () => {
    const q = await quote()
    expect(q.body.prices.first_class.waitingEur).toBeNull()
    expect(q.body.prices.business_van.waitingEur).toBeNull()
  })
})
