// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 92 plan 92-08 (QUOTE-01; D-04, Phase 91 rule): suggestLinePrice prices one quote line on the server from the
 * live tariffs - distance through ALL stops from computeRouteDistance, airport flag from the coordinates, per-class
 * waiting rate with the first 15 minutes free, one total that includes the waiting. The route-distance module and the
 * tariffs are mocked; the real pricing maths runs.
 */

const { computeRouteDistanceMock } = vi.hoisted(() => ({ computeRouteDistanceMock: vi.fn() }))

vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: computeRouteDistanceMock }))

import { computeExtrasTotal } from '@/lib/extras'
import { suggestLinePrice } from '@/lib/quotes/pricing'
import type { QuotePricingLine } from '@/lib/quotes/pricing'
import type { PricingRates } from '@/lib/pricing-config'

function makeRates(over: { waitingRate?: Record<string, number>; ratePerKm?: Record<string, number> } = {}): PricingRates {
  return {
    ratePerKm: over.ratePerKm ?? { business: 2, first_class: 3, business_van: 2.5 },
    hourlyRate: { business: 50, first_class: 70, business_van: 60 },
    dailyRate: { business: 200, first_class: 280, business_van: 240 },
    minFare: { business: 10, first_class: 10, business_van: 10 },
    waitingRate: over.waitingRate ?? { business: 12 },
    globals: {
      airportFee: 5,
      nightCoefficient: 1.2,
      holidayCoefficient: 1.3,
      extraChildSeat: 10,
      extraLuggage: 7,
      holidayDates: [],
      returnDiscountPercent: 10,
      hourlyMinHours: 2,
      hourlyMaxHours: 8,
      notificationFlags: null,
      airportPromoActive: false,
      airportRegularPriceEur: 69,
      airportPromoPriceEur: 59,
    },
  }
}

const PRAGUE = { address: 'Wenceslas Square, Prague', lat: 50.0813, lng: 14.4284 }
const VIENNA = { address: 'Stephansplatz, Vienna', lat: 48.2085, lng: 16.3721 }
const BRNO = { address: 'Brno', lat: 49.1951, lng: 16.6068 }
const AIRPORT = { address: 'Prague Airport', lat: 50.1008, lng: 14.26 }

function line(over: Partial<QuotePricingLine> = {}): QuotePricingLine {
  return {
    trip_type: 'transfer',
    pickup_date: '2027-05-10',
    pickup_time: '12:00',
    origin: PRAGUE,
    destination: VIENNA,
    stops: [],
    vehicle_class: 'business',
    hours: null,
    return_date: null,
    extra_child_seat: false,
    extra_meet_greet: false,
    extra_luggage: false,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  computeRouteDistanceMock.mockResolvedValue({ ok: true, distanceKm: 130, durationMin: 90 })
})

describe('tracer: a transfer with one stop is priced on the server through all stops (D-04)', () => {
  it('distance comes from computeRouteDistance with the stops in order; one total includes the waiting', async () => {
    const result = await suggestLinePrice(
      line({ stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 45 }] }),
      { rates: makeRates(), currency: 'eur' },
    )
    expect(computeRouteDistanceMock).toHaveBeenCalledTimes(1)
    expect(computeRouteDistanceMock).toHaveBeenCalledWith({
      origin: { lat: PRAGUE.lat, lng: PRAGUE.lng },
      destination: { lat: VIENNA.lat, lng: VIENNA.lng },
      intermediates: [{ lat: BRNO.lat, lng: BRNO.lng }],
    })
    // 130 km x 2 = 260 EUR; 45 min wait = 2 paid blocks x 12 = 24 EUR; one total 284 EUR in cents.
    expect(result).toEqual({ ok: true, distanceKm: 130, suggestedMinor: 28400, waitingUnavailable: false })
  })
})

describe('currency', () => {
  it('czk converts the whole total once with the lib/currency rate, in hundredths', async () => {
    const result = await suggestLinePrice(
      line({ stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 45 }] }),
      { rates: makeRates(), currency: 'czk' },
    )
    // 284 EUR x 25 = 7100 CZK = 710000 hundredths.
    expect(result).toEqual({ ok: true, distanceKm: 130, suggestedMinor: 710000, waitingUnavailable: false })
  })
})

describe('waiting', () => {
  it('the first 15 minutes at a stop are free and cost nothing', async () => {
    const result = await suggestLinePrice(
      line({ stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 15 }] }),
      { rates: makeRates(), currency: 'eur' },
    )
    expect(result).toEqual({ ok: true, distanceKm: 130, suggestedMinor: 26000, waitingUnavailable: false })
  })

  it('a class without a waiting rate and a 45-minute wait: waitingUnavailable true, suggestion without paid waiting', async () => {
    const result = await suggestLinePrice(
      line({
        vehicle_class: 'first_class',
        stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 45 }],
      }),
      { rates: makeRates(), currency: 'eur' },
    )
    // 130 km x 3 = 390 EUR, no waiting fee.
    expect(result).toEqual({ ok: true, distanceKm: 130, suggestedMinor: 39000, waitingUnavailable: true })
  })

  it('a class without a waiting rate and only free waiting is not "unavailable"', async () => {
    const result = await suggestLinePrice(
      line({
        vehicle_class: 'first_class',
        stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 15 }],
      }),
      { rates: makeRates(), currency: 'eur' },
    )
    expect(result).toMatchObject({ ok: true, waitingUnavailable: false })
  })
})

describe('airport and extras', () => {
  it('the airport fee comes from the coordinates', async () => {
    const result = await suggestLinePrice(line({ origin: AIRPORT }), { rates: makeRates(), currency: 'eur' })
    expect(result).toMatchObject({ ok: true, suggestedMinor: 26500 })
  })

  it('extras go through computeExtrasTotal, the same function the manual booking uses', async () => {
    const rates = makeRates()
    const extras = computeExtrasTotal(
      { infantSeat: false, childSeat: true, boosterSeat: false, meetAndGreet: false, extraLuggage: true },
      { infantSeat: 0, childSeat: rates.globals.extraChildSeat, boosterSeat: 0, meetAndGreet: 0, extraLuggage: rates.globals.extraLuggage },
    )
    const result = await suggestLinePrice(line({ extra_child_seat: true, extra_luggage: true }), { rates, currency: 'eur' })
    // 130 km x 2 = 260 EUR plus whatever the site currently charges for the two extras.
    expect(result).toMatchObject({ ok: true, suggestedMinor: (260 + extras) * 100 })
  })
})

describe('other trip types never ask Google for a distance', () => {
  it('hourly: hours x the hourly rate', async () => {
    const result = await suggestLinePrice(line({ trip_type: 'hourly', destination: null, hours: 3 }), {
      rates: makeRates(),
      currency: 'eur',
    })
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, distanceKm: null, suggestedMinor: 15000, waitingUnavailable: false })
  })

  it('daily: the days between pickup and return x the daily rate', async () => {
    const result = await suggestLinePrice(
      line({ trip_type: 'daily', destination: null, return_date: '2027-05-12' }),
      { rates: makeRates(), currency: 'eur' },
    )
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, distanceKm: null, suggestedMinor: 40000, waitingUnavailable: false })
  })
})

describe('failures are answered, never guessed (Phase 91 rule)', () => {
  it('a route that cannot be computed is route_unavailable, with no fallback distance', async () => {
    computeRouteDistanceMock.mockResolvedValue({ ok: false, reason: 'timeout' })
    const result = await suggestLinePrice(line(), { rates: makeRates(), currency: 'eur' })
    expect(result).toEqual({ ok: false, reason: 'route_unavailable' })
  })

  it('a class with no tariff at all is pricing_unavailable', async () => {
    const result = await suggestLinePrice(line(), { rates: makeRates({ ratePerKm: {} }), currency: 'eur' })
    expect(result).toEqual({ ok: false, reason: 'pricing_unavailable' })
  })

  it('a transfer without a destination cannot be priced', async () => {
    const result = await suggestLinePrice(line({ destination: null }), { rates: makeRates(), currency: 'eur' })
    expect(result).toEqual({ ok: false, reason: 'pricing_unavailable' })
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
  })
})
