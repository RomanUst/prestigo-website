// @vitest-environment node
// Phase 93 (plan 93-16; TRIP-04, D-01, D-02, D-05, D-13, D-20, D-22): the shared card checkout validates and prices a tour
// on the server. The tour store is mocked; the pricing config and the routing API must never be touched for a tour.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getTourMock, pricingConfigMock, routeDistanceMock, supabaseServiceStub } = vi.hoisted(() => ({
  getTourMock: vi.fn(),
  pricingConfigMock: vi.fn(),
  routeDistanceMock: vi.fn(),
  supabaseServiceStub: { from: vi.fn() },
}))

vi.mock('@/lib/tours/store', () => ({ getPublishedTourBySlug: getTourMock }))
vi.mock('@/lib/pricing-config', () => ({ getPricingConfig: pricingConfigMock }))
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: routeDistanceMock }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn(() => supabaseServiceStub) }))

import {
  checkoutBookingSchema,
  validateCheckoutBooking,
  priceCheckout,
  type CheckoutBookingData,
  type CheckoutError,
  type PricedCheckout,
  type ValidatedCheckout,
} from '@/lib/checkout/compute'
import { tourFare } from '@/lib/tours/pricing'
import { CARD_FLOW_TRIP_TYPES, isCardFlowEligible, type PaymentSettings } from '@/lib/payments/config'
import type { TourRow, TourSettingsRow } from '@/lib/tours/types'

const TOUR: TourRow = {
  id: 'tour-1',
  slug: 'dresden-day-trip',
  status: 'published',
  sort_order: 0,
  hours_included: 8,
  drive_minutes_each_way: 120,
  start_time_min: '07:00',
  start_time_max: '10:00',
  price_e_eur: 420,
  price_s_eur: null,
  price_v_eur: 520,
  destination_label: 'Dresden',
  first_published_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const SETTINGS: TourSettingsRow = {
  id: 1,
  extra_hour_e_eur: 40,
  extra_hour_s_eur: null,
  extra_hour_v_eur: 55,
  free_cancel_hours: 48,
  pickup_radius_km: 15,
  updated_at: '2026-01-01T00:00:00Z',
}

function futureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function tourBody(overrides: Record<string, unknown> = {}): CheckoutBookingData {
  return checkoutBookingSchema.parse({
    bookingData: {
      tripType: 'tour',
      tourSlug: 'dresden-day-trip',
      extraHours: '2',
      vehicleClass: 'business',
      passengers: '2',
      // Prague Old Town
      originLat: '50.0875',
      originLng: '14.4213',
      originAddress: 'Staromestske namesti 1, Praha',
      pickupDate: futureDate(10),
      pickupTime: '08:00',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+420725986855',
      ...overrides,
    },
  }).bookingData
}

function expectError(result: { ok: boolean }): CheckoutError {
  expect(result.ok).toBe(false)
  return result as CheckoutError
}

function validOrThrow(bookingData: CheckoutBookingData): ValidatedCheckout {
  const v = validateCheckoutBooking(bookingData)
  if (!v.ok) throw new Error(`unexpected validation failure: ${v.code}`)
  return v
}

async function price(bookingData: CheckoutBookingData, currency: 'eur' | 'czk' = 'eur') {
  const validated = validateCheckoutBooking(bookingData)
  if (!validated.ok) return validated
  return priceCheckout({ bookingData, validated, currency })
}

beforeEach(() => {
  vi.clearAllMocks()
  getTourMock.mockResolvedValue({ tour: TOUR, enTitle: 'Dresden day trip', settings: SETTINGS })
})

describe('tour checkout: validation and server pricing (tracer)', () => {
  it('validates a tour body and carries the slug and extra hours', () => {
    const v = validOrThrow(tourBody())
    expect(v.tripType).toBe('tour')
    expect(v.tour).toEqual({ slug: 'dresden-day-trip', extraHours: 2 })
    expect(v.origin).toEqual({ lat: 50.0875, lng: 14.4213 })
    expect(v.stops).toEqual([])
    expect(v.landing).toBeNull()
  })

  it('prices a tour with tourFare in minor units, with no transfer pricing and no routing', async () => {
    const priced = (await price(tourBody())) as PricedCheckout
    expect(priced.ok).toBe(true)
    const fare = tourFare(TOUR, SETTINGS, 'business', 2)
    expect(fare).toBe(500)
    expect(priced.combined.stripeAmountMinor).toBe(Math.round(fare * 100))
    expect(priced.outboundLegEur).toBe(fare)
    expect(priced.returnLegEur).toBe(0)
    expect(priced.extrasTotalEur).toBe(0)
    expect(priced.appliedPromoPct).toBe(0)
    expect(priced.distanceKm).toBeNull()
    expect(priced.stops).toEqual([])
    expect(priced.tour).toEqual({
      id: 'tour-1',
      slug: 'dresden-day-trip',
      title: 'Dresden day trip',
      destinationLabel: 'Dresden',
      hoursIncluded: 8,
      extraHours: 2,
      freeCancelHours: 48,
    })
    expect(pricingConfigMock).not.toHaveBeenCalled()
    expect(routeDistanceMock).not.toHaveBeenCalled()
    expect(supabaseServiceStub.from).not.toHaveBeenCalled()
  })

  it('prices the van class from its own columns and treats a missing extraHours as 0', async () => {
    const priced = (await price(tourBody({ vehicleClass: 'business_van', extraHours: undefined, passengers: '5' }))) as PricedCheckout
    expect(priced.combined.stripeAmountMinor).toBe(52000)
    expect(priced.tour?.extraHours).toBe(0)
  })

  it('ignores a client-supplied amountEur / combinedTotal (client amount ignored)', async () => {
    const honest = (await price(tourBody())) as PricedCheckout
    const forged = (await price(tourBody({ amountEur: '1', combinedTotal: '1', stripeAmountMinor: '100', amount: '1' }))) as PricedCheckout
    expect(forged.ok).toBe(true)
    expect(forged.combined.stripeAmountMinor).toBe(honest.combined.stripeAmountMinor)
    expect(forged.combined.stripeAmountMinor).toBe(50000)
  })

  it('opens the card flow for the tour trip type', () => {
    expect(CARD_FLOW_TRIP_TYPES).toContain('tour')
    const s: PaymentSettings = { mode: 'on', leadHours: 72, canaryEmails: [] }
    expect(isCardFlowEligible(s, { email: 'a@b.cz', tripType: 'tour' })).toBe(true)
    expect(isCardFlowEligible(s, { email: 'a@b.cz', tripType: 'round_trip' })).toBe(false)
  })
})

describe('tour checkout: refusals before any database read', () => {
  const syncCases: Array<[string, Record<string, unknown>, number, string]> = [
    ['missing tourSlug', { tourSlug: undefined }, 400, 'INVALID_REQUEST'],
    ['extraHours above 12', { extraHours: '13' }, 400, 'INVALID_EXTRA_HOURS'],
    ['stops on a tour', { stops: [{ address: 'x', lat: 50.1, lng: 14.4, waitMinutes: 0 }] }, 400, 'STOPS_NOT_ALLOWED'],
    ['a landing on a tour', { landingDate: futureDate(10), landingTime: '07:00', pickupOffsetMin: '30' }, 400, 'LANDING_NOT_ALLOWED'],
    ['a return date', { returnDate: futureDate(11) }, 400, 'INVALID_REQUEST'],
    ['a return time', { returnTime: '18:00' }, 400, 'INVALID_REQUEST'],
    ['a promo code', { promoCode: 'X' }, 400, 'PROMO_NOT_ALLOWED'],
    ['passengers above the class maximum', { vehicleClass: 'business', passengers: '4' }, 400, 'TOO_MANY_PASSENGERS'],
    ['missing origin coordinates', { originLat: '', originLng: '' }, 400, 'INVALID_REQUEST'],
    ['missing pickupDate', { pickupDate: '' }, 400, 'INVALID_REQUEST'],
    ['missing pickupTime', { pickupTime: '' }, 400, 'INVALID_REQUEST'],
    ['an airport pickup by coordinates', { originLat: '50.1008', originLng: '14.26', originAddress: 'x' }, 422, 'AIRPORT_PICKUP'],
    ['an airport pickup by address', { originAddress: 'Letiste Vaclava Havla Praha Airport' }, 422, 'AIRPORT_PICKUP'],
  ]

  it.each(syncCases)('refuses %s', async (_name, overrides, status, code) => {
    const err = expectError(await price(tourBody(overrides)))
    expect(err.status).toBe(status)
    expect(err.code).toBe(code)
    expect(getTourMock).not.toHaveBeenCalled()
  })

  it('refuses a slug that is not a tour slug at the schema', () => {
    expect(
      checkoutBookingSchema.safeParse({ bookingData: { tripType: 'tour', vehicleClass: 'business', tourSlug: '../etc' } }).success,
    ).toBe(false)
  })

  it('refuses a fractional or negative extraHours at the schema', () => {
    for (const extraHours of ['1.5', '-1', 'abc', '100']) {
      expect(
        checkoutBookingSchema.safeParse({
          bookingData: { tripType: 'tour', vehicleClass: 'business', tourSlug: 'dresden-day-trip', extraHours },
        }).success,
      ).toBe(false)
    }
  })
})

describe('tour checkout: refusals from the tour rows', () => {
  it('answers 422 TOUR_UNAVAILABLE for an unknown, draft or unreadable tour', async () => {
    getTourMock.mockResolvedValue(null)
    const err = expectError(await price(tourBody()))
    expect(err.status).toBe(422)
    expect(err.code).toBe('TOUR_UNAVAILABLE')
  })

  it('answers 422 TOUR_UNAVAILABLE when the class has no price', async () => {
    const err = expectError(await price(tourBody({ vehicleClass: 'first_class', extraHours: '0' })))
    expect(err.status).toBe(422)
    expect(err.code).toBe('TOUR_UNAVAILABLE')
  })

  it('answers 422 TOUR_UNAVAILABLE when extra hours are asked but the class has no extra-hour price', async () => {
    getTourMock.mockResolvedValue({
      tour: { ...TOUR, price_s_eur: 600 },
      enTitle: 'Dresden day trip',
      settings: SETTINGS,
    })
    const err = expectError(await price(tourBody({ vehicleClass: 'first_class', extraHours: '2' })))
    expect(err.status).toBe(422)
    expect(err.code).toBe('TOUR_UNAVAILABLE')
  })

  it('answers 422 PICKUP_OUT_OF_AREA for a pickup 20 km from the Old Town Square', async () => {
    const err = expectError(await price(tourBody({ originLat: '50.27', originLng: '14.4213', originAddress: 'Somewhere north' })))
    expect(err.status).toBe(422)
    expect(err.code).toBe('PICKUP_OUT_OF_AREA')
  })

  it('uses the radius from tour_settings, not a constant', async () => {
    getTourMock.mockResolvedValue({
      tour: TOUR,
      enTitle: 'Dresden day trip',
      settings: { ...SETTINGS, pickup_radius_km: 30 },
    })
    const priced = await price(tourBody({ originLat: '50.27', originLng: '14.4213', originAddress: 'Somewhere north' }))
    expect(priced.ok).toBe(true)
  })
})

describe('non-tour trips are unchanged', () => {
  it('a transfer body validates with tour: null', () => {
    const data = checkoutBookingSchema.parse({
      bookingData: {
        tripType: 'transfer',
        vehicleClass: 'business',
        originLat: '50.0755',
        originLng: '14.4378',
        destinationLat: '49.1951',
        destinationLng: '16.6068',
        pickupDate: futureDate(5),
        pickupTime: '10:00',
        passengers: '2',
        phone: '+420725986855',
      },
    }).bookingData
    const v = validOrThrow(data)
    expect(v.tour).toBeNull()
  })
})
