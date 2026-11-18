// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 93 plan 93-17 (TRIP-04, D-11, D-12; T-93-45..48): a tour books through the REAL init and intent routes and the
 * Phase 88/89 payment engine. The only doubles are the outside world (Stripe, the database, the tour store, rate limit)
 * and a virtual clock. Tracer: a tour intent stores a 'tour' booking with the tour columns and a 'tour-' policy snapshot.
 */

const { world, rateLimitMock, pricingConfigMock, routeDistanceMock, getTourMock } = vi.hoisted(() => ({
  world: { client: null as unknown, stripe: null as unknown },
  rateLimitMock: vi.fn(),
  pricingConfigMock: vi.fn(),
  routeDistanceMock: vi.fn(),
  getTourMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => world.client) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })),
}))
vi.mock('@/lib/pricing-config', () => ({ getPricingConfig: pricingConfigMock }))
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: routeDistanceMock }))
vi.mock('@/lib/tours/store', () => ({ getPublishedTourBySlug: getTourMock }))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: rateLimitMock,
}))
vi.mock('@/lib/payments/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))

import { POST as initPOST } from '@/app/api/card-checkout/init/route'
import { POST as intentPOST } from '@/app/api/card-checkout/intent/route'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { computeCombinedTotalMinor, computeOutboundLegTotal } from '@/lib/server-pricing'
import { tourFare } from '@/lib/tours/pricing'
import { freeHoursFor, policyFromSnapshot } from '@/lib/cancellation-policy'
import type { PricingRates } from '@/lib/pricing-config'
import type { TourRow, TourSettingsRow } from '@/lib/tours/types'

const PRICING: PricingRates = {
  ratePerKm: { business: 2.5, first_class: 3.5, business_van: 3.0 },
  hourlyRate: { business: 20, first_class: 30, business_van: 25 },
  dailyRate: { business: 150, first_class: 250, business_van: 200 },
  minFare: { business: 30, first_class: 50, business_van: 40 },
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

const TOUR: TourRow = {
  id: '7c1d3a52-0b1e-4f0a-9d6c-5e2b8f9a1c33',
  slug: 'dresden-day-trip',
  status: 'published',
  sort_order: 0,
  hours_included: 8,
  drive_minutes_each_way: 120,
  start_time_min: '07:00',
  start_time_max: '10:00',
  price_e_eur: 420,
  price_s_eur: 480,
  price_v_eur: 520,
  destination_label: 'Dresden',
  first_published_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// 36 h on purpose: neither the transfer defaults (1 / 12 h) nor the tour default (24 h), so a wrong source shows.
const SETTINGS: TourSettingsRow = {
  id: 1,
  extra_hour_e_eur: 40,
  extra_hour_s_eur: 45,
  extra_hour_v_eur: 55,
  free_cancel_hours: 36,
  pickup_radius_km: 15,
  updated_at: '2026-01-01T00:00:00Z',
}

// Pickup 2027-01-16 08:00 Prague (07:00Z); the 36 h free window ends 2027-01-14 19:00Z.
const NOW0 = Date.parse('2027-01-10T09:00:00Z')
const PICKUP_MS = Date.parse('2027-01-16T07:00:00Z')
const FREE_UNTIL_ISO = new Date(PICKUP_MS - 36 * 3_600_000).toISOString()
const HOUR = 3_600_000
const OWNER = 'owner@example.com'
const ATTEMPT = '22222222-2222-4222-8222-222222222222'

let db: FakePaymentsDb
let fake: FakeStripe

function tourData(over: Record<string, string> = {}) {
  return {
    tripType: 'tour',
    tourSlug: 'dresden-day-trip',
    extraHours: '1',
    vehicleClass: 'first_class',
    // Prague Old Town
    originLat: '50.0875',
    originLng: '14.4213',
    originAddress: 'Staromestske namesti 1, Praha',
    pickupDate: '2027-01-16',
    pickupTime: '08:00',
    passengers: '2',
    firstName: 'Anna',
    lastName: 'Novak',
    email: OWNER,
    phone: '+420725986855',
    locale: 'en',
    attemptId: ATTEMPT,
    ...over,
  }
}

/** The server amount of the default tour body: first class, one extra hour. */
function tourAmount(): number {
  const fare = tourFare(TOUR, SETTINGS, 'first_class', 1)
  return computeCombinedTotalMinor({ outboundLegEur: fare, extrasEur: 0, returnLegEur: 0, promoPct: 0, currency: 'eur' }).stripeAmountMinor
}

function jsonRequest(url: string, payload: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Mozilla/5.0 (tour)' },
    body: JSON.stringify(payload),
  })
}

interface InitOut {
  eligible: boolean
  reason?: string
  mode?: string
  amountMinor?: number
  cashAvailable?: boolean
  policy?: { version: string; hours: number; percent: number; freeUntilIso: string; freeUntilPassed: boolean }
}

async function init(data: Record<string, string> = tourData()) {
  const res = await initPOST(jsonRequest('http://localhost/api/card-checkout/init', { bookingData: data, currency: 'eur' }))
  return (await res.json()) as InitOut
}

function intentBody(initOut: InitOut, payment: 'card' | 'cash', over: Record<string, unknown> = {}, data = tourData()) {
  return {
    bookingData: data,
    currency: 'eur',
    mode: initOut.mode,
    payment,
    consent: true,
    displayedAmountMinor: tourAmount(),
    displayedHoldDateIso: '2027-01-13',
    displayedFreeUntilIso: initOut.policy?.freeUntilIso,
    displayedFreeUntilPassed: initOut.policy?.freeUntilPassed,
    ...over,
  }
}

async function intent(payload: unknown) {
  const res = await intentPOST(jsonRequest('http://localhost/api/card-checkout/intent', payload))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const rows = () => db.state.bookings

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW0)
  fake = createFakeStripe({ nowSec: () => Math.floor(Date.now() / 1000) })
  world.stripe = fake.stripe
  db = createFakePaymentsDb({ nowMs: NOW0 })
  Object.assign(db.state.pricing_globals[0], {
    card_flow_mode: 'canary',
    card_flow_canary_emails: [OWNER],
    payment_hold_lead_hours: 72,
  })
  world.client = db.client
  pricingConfigMock.mockResolvedValue(PRICING)
  routeDistanceMock.mockResolvedValue({ ok: true, distanceKm: 50, durationMin: 40 })
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  getTourMock.mockResolvedValue({ tour: TOUR, enTitle: 'Dresden day trip', settings: SETTINGS })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('tracer: a saved-card tour intent stores a tour booking with its own terms (TRIP-04, D-11, D-12)', () => {
  it('creates the unpaid card_hold row with the tour columns and a tour- policy snapshot', async () => {
    const initOut = await init()
    expect(initOut).toMatchObject({ eligible: true, mode: 'setup' })

    const { status, body } = await intent(intentBody(initOut, 'card'))
    expect(status).toBe(200)
    expect(body).toMatchObject({ payment: 'card', mode: 'setup', amountMinor: tourAmount(), currency: 'eur' })
    expect(body.clientSecret).toMatch(/_secret_/)

    expect(rows()).toHaveLength(1)
    const b = rows()[0]
    expect(b).toMatchObject({
      status: 'unpaid',
      payment_mode: 'card_hold',
      trip_type: 'tour',
      vehicle_class: 'first_class',
      tour_id: TOUR.id,
      tour_title: 'Dresden day trip',
      tour_extra_hours: 1,
      hours: TOUR.hours_included + 1,
      origin_address: 'Staromestske namesti 1, Praha',
      destination_address: 'Dresden',
      distance_km: null,
      payment_amount_minor: tourAmount(),
    })
    expect(String(b.cancel_policy_version).startsWith('tour-')).toBe(true)
    // The stored snapshot is what is enforced: its free window is the tour settings value, the fee is 100 %.
    const stored = policyFromSnapshot(b.cancel_policy)
    expect(freeHoursFor(stored, { tripType: 'tour', distanceKm: null })).toBe(SETTINGS.free_cancel_hours)
    expect(stored.feePercent).toBe(100)
    // Nothing is charged and the route distance service is never asked for a tour.
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(fake.callsTo('setupIntents.create')).toHaveLength(1)
    expect(routeDistanceMock).not.toHaveBeenCalled()
  })

  it('books a tour with cash and a card guarantee: cash_guarantee row with the same tour columns', async () => {
    const initOut = await init()
    expect(initOut.cashAvailable).toBe(true)
    const { status, body } = await intent(intentBody(initOut, 'cash'))
    expect(status).toBe(200)
    expect(body).toMatchObject({ payment: 'cash', mode: 'setup' })
    expect(rows()[0]).toMatchObject({
      payment_mode: 'cash_guarantee',
      trip_type: 'tour',
      tour_id: TOUR.id,
      tour_title: 'Dresden day trip',
      tour_extra_hours: 1,
      hours: 9,
      destination_address: 'Dresden',
    })
    expect(String(rows()[0].cancel_policy_version).startsWith('tour-')).toBe(true)
  })

  it('books a tour with no extra hours: tour_extra_hours is 0, not null', async () => {
    const data = tourData({ extraHours: '0' })
    const initOut = await init(data)
    const fare = tourFare(TOUR, SETTINGS, 'first_class', 0)
    const amount = computeCombinedTotalMinor({ outboundLegEur: fare, extrasEur: 0, returnLegEur: 0, promoPct: 0, currency: 'eur' }).stripeAmountMinor
    const { status } = await intent(intentBody(initOut, 'card', { displayedAmountMinor: amount }, data))
    expect(status).toBe(200)
    expect(rows()[0]).toMatchObject({ tour_extra_hours: 0, hours: TOUR.hours_included })
  })

  it('stores the consent text with the tour free-until moment (the terms the client ticked are the terms enforced)', async () => {
    const initOut = await init()
    expect(initOut.policy?.freeUntilIso).toBe(FREE_UNTIL_ISO)
    const { status } = await intent(intentBody(initOut, 'card'))
    expect(status).toBe(200)
    expect(db.state.booking_payment_consents).toHaveLength(1)
  })

  it('a transfer intent stores a row with no tour keys at all and the transfer policy', async () => {
    const data = {
      tripType: 'transfer',
      vehicleClass: 'business',
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
      phone: '+420725986855',
      locale: 'en',
      originAddress: 'Prague Old Town',
      destinationAddress: 'Hotel Aria',
      attemptId: ATTEMPT,
    }
    const initRes = await initPOST(jsonRequest('http://localhost/api/card-checkout/init', { bookingData: data, currency: 'eur' }))
    const initOut = (await initRes.json()) as InitOut
    expect(initOut.eligible).toBe(true)
    const outbound = computeOutboundLegTotal('business', 50, 2, 1, 'transfer', '2027-01-16', '10:00', false, PRICING)
    const amount = computeCombinedTotalMinor({ outboundLegEur: outbound, extrasEur: 0, returnLegEur: 0, promoPct: 0, currency: 'eur' }).stripeAmountMinor
    const { status } = await intent({
      bookingData: data,
      currency: 'eur',
      mode: initOut.mode,
      payment: 'card',
      consent: true,
      displayedAmountMinor: amount,
      displayedHoldDateIso: '2027-01-13',
      displayedFreeUntilIso: initOut.policy?.freeUntilIso,
      displayedFreeUntilPassed: initOut.policy?.freeUntilPassed,
    })
    expect(status).toBe(200)
    const b = rows()[0]
    expect(b.trip_type).toBe('transfer')
    expect(b.cancel_policy_version).not.toMatch(/^tour-/)
    // The fake DB defaults the three columns to null; the route sent none of them.
    expect(b).toMatchObject({ tour_id: null, tour_title: null, tour_extra_hours: null })
    expect(getTourMock).not.toHaveBeenCalled()
  })
})

describe('init: tour terms and states (D-12, T-93-45, T-93-46)', () => {
  it('previews the tour policy for a valid tour 3 days ahead', async () => {
    vi.setSystemTime(PICKUP_MS - 3 * 24 * HOUR)
    db.state.nowMs = Date.now()
    const out = await init()
    expect(out).toMatchObject({ eligible: true, cashAvailable: true, amountMinor: tourAmount() })
    expect(out.reason).toBeUndefined()
    expect(out.policy).toMatchObject({ hours: SETTINGS.free_cancel_hours, percent: 100, freeUntilPassed: false })
    expect(out.policy?.version.startsWith('tour-')).toBe(true)
  })

  it('answers PICKUP_OUT_OF_AREA for a pickup 20 km out (Kladno)', async () => {
    expect(await init(tourData({ originLat: '50.1473', originLng: '14.1028', originAddress: 'Kladno' }))).toEqual({
      eligible: false,
      reason: 'PICKUP_OUT_OF_AREA',
    })
  })

  it('answers AIRPORT_PICKUP for an airport pickup', async () => {
    expect(await init(tourData({ originLat: '50.1008', originLng: '14.26', originAddress: 'Prague Airport (PRG)' }))).toEqual({
      eligible: false,
      reason: 'AIRPORT_PICKUP',
    })
  })

  it('answers TOUR_UNAVAILABLE for an unpublished or unknown tour', async () => {
    getTourMock.mockResolvedValue(null)
    expect(await init()).toEqual({ eligible: false, reason: 'TOUR_UNAVAILABLE' })
  })

  it('answers LEAD_TIME with the tour policy when the pickup is 6 hours away', async () => {
    vi.setSystemTime(PICKUP_MS - 6 * HOUR)
    db.state.nowMs = Date.now()
    const out = await init()
    expect(out).toMatchObject({ eligible: false, reason: 'LEAD_TIME' })
    expect(out.policy).toMatchObject({ hours: SETTINGS.free_cancel_hours, percent: 100 })
    expect(out.policy?.version.startsWith('tour-')).toBe(true)
  })

  it('stays opaque for a client for whom payments are closed: exactly { eligible: false }, no reason key', async () => {
    Object.assign(db.state.pricing_globals[0], { card_flow_mode: 'off' })
    expect(await init()).toEqual({ eligible: false })
    getTourMock.mockResolvedValue(null)
    expect(await init()).toEqual({ eligible: false })
    // Not on the canary list is closed as well.
    Object.assign(db.state.pricing_globals[0], { card_flow_mode: 'canary', card_flow_canary_emails: ['someone@else.com'] })
    expect(await init(tourData({ attemptId: ATTEMPT }))).toEqual({ eligible: false })
  })

  it('keeps every other tour refusal opaque (a bad extra-hours count names no reason)', async () => {
    expect(await init(tourData({ extraHours: '99' }))).toEqual({ eligible: false })
    expect(await init(tourData({ originLat: '', originLng: '' }))).toEqual({ eligible: false })
  })

  it('a non-tour request never gets a reason, even when it fails the same way', async () => {
    const { tourSlug: _slug, extraHours: _extra, ...rest } = tourData({
      tripType: 'transfer',
      originLat: '50.1008',
      originLng: '14.26',
      originAddress: 'Prague Airport (PRG)',
      destinationLat: '49.1951',
      destinationLng: '16.6068',
      destinationAddress: 'Hotel Aria',
    })
    void _slug
    void _extra
    getTourMock.mockResolvedValue(null)
    const out = await init(rest)
    expect(out).not.toHaveProperty('reason')
  })
})

describe('intent: the amount is the server amount (T-93-47)', () => {
  it('answers 409 PRICE_CHANGED for a displayed amount one cent off, and creates no row', async () => {
    const initOut = await init()
    const { status, body } = await intent(intentBody(initOut, 'card', { displayedAmountMinor: tourAmount() + 1 }))
    expect(status).toBe(409)
    expect(body).toMatchObject({ code: 'PRICE_CHANGED', amountMinor: tourAmount() })
    expect(rows()).toHaveLength(0)
    expect(fake.callsTo('setupIntents.create')).toHaveLength(0)
  })

  it('a client-sent amount in the body changes nothing (the server prices the tour)', async () => {
    const initOut = await init()
    const data = { ...tourData(), amountEur: '1', combinedTotal: '1', price: '1' }
    const { status } = await intent(intentBody(initOut, 'card', {}, data as unknown as ReturnType<typeof tourData>))
    expect(status).toBe(200)
    expect(rows()[0].payment_amount_minor).toBe(tourAmount())
  })

  it('answers 409 POLICY_CHANGED when the displayed free-until is the transfer window, not the tour one', async () => {
    const initOut = await init()
    const { status, body } = await intent(
      intentBody(initOut, 'card', { displayedFreeUntilIso: new Date(PICKUP_MS - HOUR).toISOString() }),
    )
    expect(status).toBe(409)
    expect(body.code).toBe('POLICY_CHANGED')
    expect((body.policy as { version: string; hours: number }).hours).toBe(SETTINGS.free_cancel_hours)
    expect((body.policy as { version: string }).version.startsWith('tour-')).toBe(true)
    expect(rows()).toHaveLength(0)
  })

  it('refuses a tour intent for a client for whom payments are closed', async () => {
    Object.assign(db.state.pricing_globals[0], { card_flow_mode: 'off' })
    const { status, body } = await intent(intentBody({ eligible: true, mode: 'setup', policy: { version: 'x', hours: 1, percent: 1, freeUntilIso: FREE_UNTIL_ISO, freeUntilPassed: false } }, 'card'))
    expect(status).toBe(422)
    expect(body.code).toBe('NOT_ELIGIBLE')
    expect(rows()).toHaveLength(0)
  })
})
