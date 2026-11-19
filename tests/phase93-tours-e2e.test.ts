// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 93 plan 93-28 (TRIP-01..TRIP-05; T-93-62..64): one tour from its page data to a stored booking and its emails,
 * through the REAL modules of the earlier plans. Tracer: the box values become the checkout URL, the URL is parsed, the
 * init route calls the tour eligible with the tour policy, the intent route stores a 'tour' booking (tour columns and a
 * 'tour-' snapshot), the checkout leaves the confirmation snapshot, and the confirmation email, the operator alert and
 * the calendar link read as a day trip.
 *
 * Only the outside world is doubled: Stripe, the in-memory payments database, the tour store (it returns the page
 * data fixture), the tariffs, the rate limiter, Resend, the route distance service, and sessionStorage.
 */

const { world, rateLimitMock, pricingConfigMock, routeDistanceMock, getTourMock, mockResendSend } = vi.hoisted(() => ({
  world: { client: null as unknown, stripe: null as unknown },
  rateLimitMock: vi.fn(),
  pricingConfigMock: vi.fn(),
  routeDistanceMock: vi.fn(),
  getTourMock: vi.fn(),
  mockResendSend: vi.fn(),
}))

process.env.RESEND_API_KEY = 're_test'
process.env.MANAGER_EMAIL = 'owner@example.com'
process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'

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
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockResendSend }
  },
}))

import { POST as initPOST } from '@/app/api/card-checkout/init/route'
import { POST as intentPOST } from '@/app/api/card-checkout/intent/route'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { computeCombinedTotalMinor } from '@/lib/server-pricing'
import { lowestFittingPrice, tourFare } from '@/lib/tours/pricing'
import { buildTourCheckoutHref, parseTourCheckoutQuery } from '@/lib/tours/checkout-query'
import { readTourConfirmation, writeTourConfirmation } from '@/lib/tours/confirmation-snapshot'
import { freeHoursFor, policyFromSnapshot } from '@/lib/cancellation-policy'
import { sendClientConfirmation, sendManagerAlert, buildGoogleCalendarUrl } from '@/lib/email'
import { bookingEmailDataFromRow } from '@/lib/payments/emails/send'
import { formatMinor } from '@/lib/payments/money'
import type { PricingRates } from '@/lib/pricing-config'
import type { TourPageData } from '@/lib/tours/store'

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

const TOUR_ID = '7c1d3a52-0b1e-4f0a-9d6c-5e2b8f9a1c33'

/** The tour page data (what getTourPageData returns for the published Dresden tour). */
const PAGE: TourPageData = {
  tour: {
    id: TOUR_ID,
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
    first_published_at: '2026-11-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  translation: {
    tour_id: TOUR_ID,
    locale: 'en',
    title: 'Dresden day trip',
    short_description: 'Baroque Dresden and back in a day',
    description: 'A private day trip from Prague to Dresden.',
    pickup_info: 'Pickup at your Prague address',
    important_info: 'Free cancellation is set in the tour settings.',
    seo_title: 'Dresden day trip from Prague',
    seo_description: 'Private chauffeur day trip to Dresden',
    highlights: ['Zwinger', 'Frauenkirche'],
    itinerary: [],
    includes: ['Chauffeur', 'Fuel'],
    excludes: ['Tickets'],
    faq: [],
    is_complete: true,
    updated_at: '2026-01-01T00:00:00Z',
  },
  completeLocales: ['en'],
  photos: [],
  settings: {
    id: 1,
    extra_hour_e_eur: 40,
    extra_hour_s_eur: 45,
    extra_hour_v_eur: 55,
    // 36 h on purpose: neither the transfer defaults nor the tour default, so a wrong policy source shows.
    free_cancel_hours: 36,
    pickup_radius_km: 15,
    updated_at: '2026-01-01T00:00:00Z',
  },
}

// Pickup 2027-01-16 08:00 Prague (07:00Z).
const NOW0 = Date.parse('2027-01-10T09:00:00Z')
const PICKUP_MS = Date.parse('2027-01-16T07:00:00Z')
const OWNER = 'owner@example.com'
const ATTEMPT = '22222222-2222-4222-8222-222222222222'
const PICKUP_ADDRESS = 'Staromestske namesti 1, Praha'

let db: FakePaymentsDb
let fake: FakeStripe
const storage = new Map<string, string>()

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

/** The box: the guest picks a car, passengers, date, start time and extra hours; the page data prices and links it. */
function boxCheckoutHref(car: 'business' | 'first_class' | 'business_van', xh: number): string {
  return buildTourCheckoutHref({ tour: PAGE.tour.slug, date: '2027-01-16', time: '08:00', pax: 2, car, xh })
}

/** What TourCheckout.buildBookingData sends: the parsed query plus the guest's details and picked pickup. */
function bookingDataFromQuery(
  query: NonNullable<ReturnType<typeof parseTourCheckoutQuery>>,
  pickup: { address: string; lat: number; lng: number },
): Record<string, string> {
  return {
    attemptId: ATTEMPT,
    tripType: 'tour',
    tourSlug: query.tour,
    extraHours: String(query.xh),
    vehicleClass: query.car,
    passengers: String(query.pax),
    pickupDate: query.date,
    pickupTime: query.time,
    originAddress: pickup.address,
    originLat: String(pickup.lat),
    originLng: String(pickup.lng),
    firstName: 'Anna',
    lastName: 'Novak',
    email: OWNER,
    phone: '+420725986855',
    specialRequests: 'Please stop at a bakery',
    locale: 'en',
  }
}

const OLD_TOWN = { address: PICKUP_ADDRESS, lat: 50.0875, lng: 14.4213 }
const AIRPORT = { address: 'Prague Airport (PRG)', lat: 50.1008, lng: 14.26 }

async function init(data: Record<string, string>) {
  const res = await initPOST(jsonRequest('http://localhost/api/card-checkout/init', { bookingData: data, currency: 'eur' }))
  return (await res.json()) as InitOut
}

async function intent(payload: unknown) {
  const res = await intentPOST(jsonRequest('http://localhost/api/card-checkout/intent', payload))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

function amountMinorFor(car: 'business' | 'first_class' | 'business_van', xh: number): number {
  const fare = tourFare(PAGE.tour, PAGE.settings, car, xh)
  return computeCombinedTotalMinor({ outboundLegEur: fare, extrasEur: 0, returnLegEur: 0, promoPct: 0, currency: 'eur' })
    .stripeAmountMinor
}

function intentBody(initOut: InitOut, payment: 'card' | 'cash', data: Record<string, string>, amountMinor: number) {
  return {
    bookingData: data,
    currency: 'eur',
    mode: initOut.mode,
    payment,
    consent: true,
    displayedAmountMinor: amountMinor,
    displayedHoldDateIso: '2027-01-13',
    displayedFreeUntilIso: initOut.policy?.freeUntilIso,
    displayedFreeUntilPassed: initOut.policy?.freeUntilPassed,
  }
}

/** The whole path up to the stored booking. Returns what each hop produced so a test can assert on any of them. */
async function walk(payment: 'card' | 'cash') {
  const href = boxCheckoutHref('first_class', 1)
  const query = parseTourCheckoutQuery(new URL(`https://rideprestigo.com${href}`).searchParams)
  expect(query).not.toBeNull()
  const data = bookingDataFromQuery(query!, OLD_TOWN)
  const initOut = await init(data)
  const amountMinor = amountMinorFor('first_class', 1)
  const result = await intent(intentBody(initOut, payment, data, amountMinor))
  return { href, query: query!, data, initOut, amountMinor, ...result }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW0)
  storage.clear()
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
  })
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
  getTourMock.mockResolvedValue({ tour: PAGE.tour, enTitle: PAGE.translation.title, settings: PAGE.settings })
  mockResendSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('tracer: card booking of a tour, from the page data to the emails (TRIP-01..TRIP-05)', () => {
  it('card: page data -> checkout URL -> parsed query -> init -> intent -> stored booking -> confirmation snapshot -> emails', async () => {
    // 1. The page shows a from-price taken from the tour row, and the box prices the chosen car and extra hours.
    expect(lowestFittingPrice(PAGE.tour, 2)).toBe(420)
    expect(tourFare(PAGE.tour, PAGE.settings, 'first_class', 1)).toBe(480 + 45)

    // 2. The box URL round-trips through the parser unchanged.
    const { href, query, initOut, amountMinor, status, body } = await walk('card')
    expect(href).toBe('/book/tour?tour=dresden-day-trip&date=2027-01-16&time=08%3A00&pax=2&car=first_class&xh=1')
    expect(query).toEqual({ tour: 'dresden-day-trip', date: '2027-01-16', time: '08:00', pax: 2, car: 'first_class', xh: 1 })

    // 3. Init: eligible, setup mode, the amount is the server's, the policy is the tour one (settings hours, 100 %).
    expect(initOut).toMatchObject({ eligible: true, mode: 'setup', cashAvailable: true, amountMinor })
    expect(initOut.policy).toMatchObject({ hours: PAGE.settings.free_cancel_hours, percent: 100, freeUntilPassed: false })
    expect(initOut.policy?.version.startsWith('tour-')).toBe(true)

    // 4. Intent: a card setup, nothing charged, one unpaid card_hold row with the tour columns and the tour snapshot.
    expect(status).toBe(200)
    expect(body).toMatchObject({ payment: 'card', mode: 'setup', amountMinor, currency: 'eur' })
    expect(body.clientSecret).toMatch(/_secret_/)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(fake.callsTo('setupIntents.create')).toHaveLength(1)
    expect(routeDistanceMock).not.toHaveBeenCalled()
    expect(db.state.bookings).toHaveLength(1)
    const row = db.state.bookings[0]
    expect(row).toMatchObject({
      status: 'unpaid',
      payment_mode: 'card_hold',
      trip_type: 'tour',
      vehicle_class: 'first_class',
      tour_id: TOUR_ID,
      tour_title: PAGE.translation.title,
      tour_extra_hours: 1,
      hours: PAGE.tour.hours_included + 1,
      origin_address: PICKUP_ADDRESS,
      destination_address: 'Dresden',
      distance_km: null,
      payment_amount_minor: amountMinor,
    })
    expect(String(row.cancel_policy_version).startsWith('tour-')).toBe(true)
    const stored = policyFromSnapshot(row.cancel_policy)
    expect(freeHoursFor(stored, { tripType: 'tour', distanceKm: null })).toBe(PAGE.settings.free_cancel_hours)
    expect(stored.feePercent).toBe(100)
    expect(db.state.booking_payment_consents).toHaveLength(1)

    // 5. The checkout leaves the confirmation snapshot for the reference the intent returned.
    const ref = String(body.bookingReference)
    expect(ref).toBeTruthy()
    writeTourConfirmation({
      ref,
      title: PAGE.translation.title,
      date: query.date,
      time: query.time,
      pickupAddress: OLD_TOWN.address,
      carLabelKey: query.car,
      hoursIncluded: PAGE.tour.hours_included,
      extraHours: query.xh,
      passengers: query.pax,
      driveMinutes: PAGE.tour.drive_minutes_each_way ?? undefined,
      payment: 'card',
      amountLabel: formatMinor(amountMinor, 'eur'),
    })
    const snap = readTourConfirmation(ref)
    expect(snap).toMatchObject({ ref, title: 'Dresden day trip', extraHours: 1, hoursIncluded: 8, payment: 'card' })
    expect(readTourConfirmation('PRG-OTHER-REF')).toBeNull()

    // 6. Once confirmed, the emails read as a day trip: title, time at the destination, pickup and return.
    row.status = 'confirmed'
    const data = bookingEmailDataFromRow(row as never)
    expect(data).toMatchObject({ tripType: 'tour', tourTitle: PAGE.translation.title, tourExtraHours: 1, hours: 9 })

    mockResendSend.mockClear()
    await sendClientConfirmation(data)
    const client = mockResendSend.mock.calls[0][0] as { html: string; to: string[] }
    expect(client.to).toEqual([OWNER])
    expect(client.html).toContain('>Day trip</td>')
    expect(client.html).toContain('>Dresden day trip</td>')
    expect(client.html).toContain('>Time at the destination</td>')
    expect(client.html).toContain('8 hours included, +1 hour extra')
    expect(client.html).toContain('>Pickup and return</td>')
    expect(client.html).toContain(PICKUP_ADDRESS)
    expect(client.html).not.toContain('>Route</td>')

    mockResendSend.mockClear()
    await sendManagerAlert(data)
    const alert = mockResendSend.mock.calls[0][0] as { text: string }
    expect(alert.text).toContain('Day trip: Dresden day trip')
    expect(alert.text).toContain('Time at the destination: 8 hours included, +1 hour extra')
    expect(alert.text).toContain(`Pickup and return: ${PICKUP_ADDRESS}`)
    expect(alert.text).not.toContain('Route:')

    // 7. The calendar link covers the title and the whole day at the destination.
    const cal = new URL(buildGoogleCalendarUrl(data))
    expect(cal.searchParams.get('text')).toBe('Dresden day trip — Prestigo')
    expect(cal.searchParams.get('dates')).toBe('20270116T080000/20270116T170000')
  })

  it('cash: the same walk stores a cash_guarantee row with the same tour columns and snapshot', async () => {
    const { initOut, status, body, amountMinor } = await walk('cash')
    expect(initOut.cashAvailable).toBe(true)
    expect(status).toBe(200)
    expect(body).toMatchObject({ payment: 'cash', mode: 'setup' })
    expect(db.state.bookings).toHaveLength(1)
    expect(db.state.bookings[0]).toMatchObject({
      payment_mode: 'cash_guarantee',
      trip_type: 'tour',
      tour_id: TOUR_ID,
      tour_title: PAGE.translation.title,
      tour_extra_hours: 1,
      hours: 9,
      destination_address: 'Dresden',
      payment_amount_minor: amountMinor,
    })
    expect(String(db.state.bookings[0].cancel_policy_version).startsWith('tour-')).toBe(true)
    // Nothing is charged for a cash guarantee either.
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('airport: an airport pickup is refused with AIRPORT_PICKUP by init, and the intent stores no booking', async () => {
    const query = parseTourCheckoutQuery(new URL(`https://rideprestigo.com${boxCheckoutHref('first_class', 1)}`).searchParams)!
    const data = bookingDataFromQuery(query, AIRPORT)

    expect(await init(data)).toEqual({ eligible: false, reason: 'AIRPORT_PICKUP' })

    // A client that skips init and posts the intent anyway is refused too: no row, no Stripe object.
    const okInit = await init(bookingDataFromQuery(query, OLD_TOWN))
    const { status, body } = await intent(intentBody(okInit, 'card', data, amountMinorFor('first_class', 1)))
    expect(status).toBe(422)
    expect(body.code).toBe('AIRPORT_PICKUP')
    expect(db.state.bookings).toHaveLength(0)
    expect(fake.callsTo('setupIntents.create')).toHaveLength(0)
    expect(PICKUP_MS).toBeGreaterThan(NOW0)
  })
})
