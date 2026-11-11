// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 88 plan 88-06 (PAYF-05, D-09, D-10, D-11, D-12, D-19): POST /api/card-checkout/init.

const { fromMock, pricingConfigMock, rateLimitMock, state } = vi.hoisted(() => {
  const state: { globals: { data: unknown; error: unknown }; queried: string[] } = {
    globals: { data: null, error: null },
    queried: [],
  }
  const fromMock = vi.fn((table: string) => {
    state.queried.push(table)
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: () => Promise.resolve(state.globals),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }
    return builder
  })
  return { fromMock, pricingConfigMock: vi.fn(), rateLimitMock: vi.fn(), state }
})

const { routeDistanceMock } = vi.hoisted(() => ({ routeDistanceMock: vi.fn() }))
// Phase 91 (STOP-02): the checkout prices on the server's Google Routes distance. These fixtures used to send
// distanceKm; the mock returns the same distance so the assertions stay unchanged.
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: routeDistanceMock }))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: fromMock })),
}))
vi.mock('@/lib/pricing-config', () => ({ getPricingConfig: pricingConfigMock }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: rateLimitMock,
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

import { POST } from '@/app/api/card-checkout/init/route'
import { computeCombinedTotalMinor, computeOutboundLegTotal } from '@/lib/server-pricing'
import type { PricingRates } from '@/lib/pricing-config'

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

// Fixed "now": 2027-01-10 09:00Z (10:00 Prague, CET).
const NOW = Date.parse('2027-01-10T09:00:00Z')
const OWNER = 'owner@example.com'

function settingsRow(over: Record<string, unknown> = {}) {
  return {
    data: {
      payment_hold_lead_hours: 72,
      card_flow_mode: 'canary',
      card_flow_canary_emails: [OWNER],
      ...over,
    },
    error: null,
  }
}

function bookingData(over: Record<string, string> = {}) {
  return {
    tripType: 'transfer',
    vehicleClass: 'business',
    distanceKm: '50',
    originLat: '50.0755',
    originLng: '14.4378',
    destinationLat: '49.1951',
    destinationLng: '16.6068',
    pickupDate: '2027-01-16',
    pickupTime: '10:00',
    passengers: '2',
    firstName: 'Anna',
    lastName: 'Novak',
    email: ' Owner@Example.com ',
    phone: '+420725986855',
    ...over,
  }
}

function req(body: unknown, raw?: string): Request {
  return new Request('http://localhost/api/card-checkout/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
}

async function call(data: Record<string, string>, currency: 'eur' | 'czk' = 'eur') {
  const res = await POST(req({ bookingData: data, currency }))
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  routeDistanceMock.mockReset()
  routeDistanceMock.mockResolvedValue({ ok: true, distanceKm: 50, durationMin: 40 })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  fromMock.mockClear()
  pricingConfigMock.mockReset()
  pricingConfigMock.mockResolvedValue(PRICING)
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 29, limit: 30 })
  state.globals = settingsRow()
  state.queried = []
})
afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/card-checkout/init: eligible', () => {
  it('canary + allowlisted trimmed / mixed-case email + transfer 6 days out -> setup with the exact hold date and server amount', async () => {
    const { status, body } = await call(bookingData())
    expect(status).toBe(200)

    const outbound = computeOutboundLegTotal('business', 50, 2, 1, 'transfer', '2027-01-16', '10:00', false, PRICING)
    const expected = computeCombinedTotalMinor({
      outboundLegEur: outbound,
      extrasEur: 0,
      returnLegEur: 0,
      promoPct: 0,
      currency: 'eur',
    }).stripeAmountMinor

    expect(body).toEqual({
      eligible: true,
      mode: 'setup',
      // pickup 2027-01-16 10:00 Prague = 09:00Z; minus 72 h = 2027-01-13 09:00Z = 10:00 Prague
      holdAtIso: '2027-01-13T09:00:00.000Z',
      holdDateIso: '2027-01-13',
      amountMinor: expected,
      currency: 'eur',
      // Phase 89: the policy preview for a client for whom the terms are public (defaults: 100 km, 1 h short, 100%)
      policy: {
        version: '2026-11-1',
        freeUntilIso: '2027-01-16T08:00:00.000Z',
        freeUntilPassed: false,
        hours: 1,
        percent: 100,
        feeMinor: expected,
        waitMin: 30,
      },
      // Phase 89 D-08: pay cash to the driver is offered wherever the card flow is.
      cashAvailable: true,
    })
    expect(Number.isInteger(body.amountMinor)).toBe(true)
    expect(body.amountMinor).toBeGreaterThan(0)
  })

  it('pickup 50 hours out -> hold_now with null hold fields', async () => {
    // now 2027-01-10 09:00Z + 50 h = 2027-01-12 11:00Z = 12:00 Prague
    const { status, body } = await call(bookingData({ pickupDate: '2027-01-12', pickupTime: '12:00' }))
    expect(status).toBe(200)
    expect(body).toMatchObject({ eligible: true, mode: 'hold_now', holdAtIso: null, holdDateIso: null, currency: 'eur' })
  })

  it('hourly trips are eligible; czk is priced in czk minor units', async () => {
    const { body } = await call(bookingData({ tripType: 'hourly', hours: '3', distanceKm: '' }), 'czk')
    expect(body.eligible).toBe(true)
    expect(body.currency).toBe('czk')
    expect(Number.isInteger(body.amountMinor)).toBe(true)
  })

  it('a hold that would land at 23:30 Prague or later moves to the next Prague midnight (D-12)', async () => {
    // pickup 2027-01-16 23:45 Prague; minus 72 h = 2027-01-13 23:45 Prague -> next midnight 2027-01-14 00:00 Prague
    const { body } = await call(bookingData({ pickupTime: '23:45' }))
    expect(body.mode).toBe('setup')
    expect(body.holdAtIso).toBe('2027-01-13T23:00:00.000Z')
    expect(body.holdDateIso).toBe('2027-01-14')
  })

  it('uses the configured lead hours', async () => {
    state.globals = settingsRow({ payment_hold_lead_hours: 24 })
    const { body } = await call(bookingData())
    expect(body.holdAtIso).toBe('2027-01-15T09:00:00.000Z')
  })
})

describe('POST /api/card-checkout/init: every other case is exactly { eligible: false }', () => {
  it('flag off -> ineligible, and neither pricing nor any bookings query runs', async () => {
    state.globals = settingsRow({ card_flow_mode: 'off' })
    const { status, body } = await call(bookingData())
    expect(status).toBe(200)
    expect(body).toEqual({ eligible: false })
    expect(pricingConfigMock).not.toHaveBeenCalled()
    expect(state.queried).toEqual(['pricing_globals'])
  })

  it("an unknown mode is treated as off", async () => {
    state.globals = settingsRow({ card_flow_mode: 'bogus' })
    expect((await call(bookingData())).body).toEqual({ eligible: false })
  })

  it('init stays opaque: a canary client who is not on the list gets exactly { eligible: false } and no pricing runs', async () => {
    const { body } = await call(bookingData({ email: 'stranger@example.com' }))
    expect(body).toEqual({ eligible: false })
    expect(Object.keys(body)).toEqual(['eligible'])
    expect(pricingConfigMock).not.toHaveBeenCalled()
    expect(state.queried).toEqual(['pricing_globals'])
  })

  it.each(['round_trip', 'daily'])('%s is never card-eligible (D-19), a listed client only gets the policy', async (tripType) => {
    const { body } = await call(bookingData({ tripType, returnDate: '2027-01-18', returnTime: '10:00' }))
    expect(body.eligible).toBe(false)
    expect(Object.keys(body).sort()).toEqual(['eligible', 'policy'])
    expect(body.policy.version).toBe('2026-11-1')
  })

  it.each(['round_trip', 'daily'])('%s for a client who is not on the list: exactly { eligible: false }, no pricing', async (tripType) => {
    const { body } = await call(
      bookingData({ tripType, email: 'stranger@example.com', returnDate: '2027-01-18', returnTime: '10:00' }),
    )
    expect(body).toEqual({ eligible: false })
    expect(pricingConfigMock).not.toHaveBeenCalled()
  })

  it.each(['owner@example.com.evil', 'xowner@example.com', 'owner@example.co'])(
    'email %j is not on the allowlist',
    async (email) => {
      expect((await call(bookingData({ email }))).body).toEqual({ eligible: false })
    }
  )

  it('no email at all -> ineligible', async () => {
    const { email: _e, ...rest } = bookingData()
    void _e
    expect((await call(rest as Record<string, string>)).body).toEqual({ eligible: false })
  })

  it('empty allowlist -> ineligible', async () => {
    state.globals = settingsRow({ card_flow_canary_emails: [] })
    expect((await call(bookingData())).body).toEqual({ eligible: false })
  })

  it('missing settings row -> ineligible', async () => {
    state.globals = { data: null, error: null }
    expect((await call(bookingData())).body).toEqual({ eligible: false })
  })

  it('settings read error -> ineligible', async () => {
    state.globals = { data: null, error: { message: 'boom' } }
    expect((await call(bookingData())).body).toEqual({ eligible: false })
  })

  it('validation error (bad phone) -> ineligible', async () => {
    expect((await call(bookingData({ phone: '12345' }))).body).toEqual({ eligible: false })
  })

  it('pricing error -> ineligible', async () => {
    pricingConfigMock.mockRejectedValue(new Error('db down'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await call(bookingData())).body).toEqual({ eligible: false })
    errSpy.mockRestore()
  })

  it('pickup 11 hours out -> ineligible (12 h card-flow lead rule)', async () => {
    // now 09:00Z + 11 h = 20:00Z = 21:00 Prague
    const { body } = await call(bookingData({ pickupDate: '2027-01-10', pickupTime: '21:00' }))
    expect(body.eligible).toBe(false)
    expect(Object.keys(body).sort()).toEqual(['eligible', 'policy'])
  })

  it('pickup exactly 12 hours out is allowed (boundary)', async () => {
    // now 09:00Z + 12 h = 21:00Z = 22:00 Prague
    const { body } = await call(bookingData({ pickupDate: '2027-01-10', pickupTime: '22:00' }))
    expect(body.eligible).toBe(true)
  })

  it('missing pickup date -> ineligible', async () => {
    const { pickupDate: _d, ...rest } = bookingData()
    void _d
    expect((await call(rest as Record<string, string>)).body).toEqual({ eligible: false })
  })

  it('leaks no reason: every ineligible body deep-equals { eligible: false } with only that key', async () => {
    const cases: Array<() => Promise<{ body: Record<string, unknown> }>> = [
      async () => {
        state.globals = settingsRow({ card_flow_mode: 'off' })
        return call(bookingData())
      },
      async () => {
        state.globals = settingsRow()
        return call(bookingData({ email: 'stranger@example.com' }))
      },
      async () => {
        state.globals = settingsRow()
        return call(bookingData({ tripType: 'daily', email: 'stranger@example.com' }))
      },
    ]
    for (const run of cases) {
      const { body } = await run()
      expect(Object.keys(body)).toEqual(['eligible'])
      expect(body).toStrictEqual({ eligible: false })
    }
  })
})

describe('POST /api/card-checkout/init: transport', () => {
  it('malformed JSON -> 400 INVALID_REQUEST', async () => {
    const res = await POST(req(null, '{not json'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('schema failure (missing currency) -> 400 INVALID_REQUEST', async () => {
    const res = await POST(req({ bookingData: bookingData() }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('rate limited -> 429 RATE_LIMITED, before any settings read', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, limit: 30 })
    const res = await POST(req({ bookingData: bookingData(), currency: 'eur' }))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ code: 'RATE_LIMITED' })
    expect(fromMock).not.toHaveBeenCalled()
    expect(rateLimitMock).toHaveBeenCalledWith('/api/card-checkout/init', '127.0.0.1')
  })

  it('oversized body -> 413', async () => {
    const r = new Request('http://localhost/api/card-checkout/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'content-length': '20000' },
      body: '{}',
    })
    expect((await POST(r)).status).toBe(413)
  })

  it('is side-effect free: only pricing_globals is read (no bookings / ledger access)', async () => {
    await call(bookingData())
    expect(new Set(state.queried)).toEqual(new Set(['pricing_globals']))
  })
})

describe('POST /api/card-checkout/init: policy preview (Phase 89, D-18, D-24)', () => {
  it('mode on: a client who is not on any list is eligible and gets the preview', async () => {
    state.globals = settingsRow({ card_flow_mode: 'on', card_flow_canary_emails: [] })
    const { body } = await call(bookingData({ email: 'stranger@example.com' }))
    expect(body.eligible).toBe(true)
    expect(body.policy).toMatchObject({ version: '2026-11-1', hours: 1, percent: 100, waitMin: 30 })
  })

  it('uses the configured numbers: long window above the km threshold, percent, and the fee on the priced amount', async () => {
    state.globals = settingsRow({
      cancel_free_km_threshold: 40,
      cancel_free_hours_short: 2,
      cancel_free_hours_long: 24,
      cancel_fee_percent: 50,
    })
    const { body } = await call(bookingData()) // 50 km > 40 km threshold -> long window
    expect(body.policy).toMatchObject({
      hours: 24,
      percent: 50,
      // pickup 2027-01-16 09:00Z minus 24 h
      freeUntilIso: '2027-01-15T09:00:00.000Z',
      freeUntilPassed: false,
      feeMinor: Math.round(body.amountMinor / 2),
    })
  })

  it('hourly trips use the hourly window', async () => {
    state.globals = settingsRow({ cancel_free_hours_hourly: 6 })
    const { body } = await call(bookingData({ tripType: 'hourly', hours: '3', distanceKm: '' }))
    expect(body.policy).toMatchObject({ hours: 6, freeUntilIso: '2027-01-16T03:00:00.000Z' })
  })

  it('an airport pickup uses the airport waiting time, a city pickup the city one', async () => {
    state.globals = settingsRow({ noshow_wait_city_min: 20, noshow_wait_airport_min: 75 })
    const city = await call(bookingData())
    expect(city.body.policy.waitMin).toBe(20)
    const airport = await call(bookingData({ originAddress: 'Prague Airport Terminal 2' }))
    expect(airport.body.policy.waitMin).toBe(75)
  })

  it('freeUntilPassed is true when the free window has already closed', async () => {
    // pickup 2027-01-10 19:00 Prague = 18:00Z (9 h out), 150 km -> 12 h long window closed at 06:00Z
    routeDistanceMock.mockResolvedValueOnce({ ok: true, distanceKm: 150, durationMin: 120 })
    const { body } = await call(bookingData({ pickupDate: '2027-01-10', pickupTime: '19:00', distanceKm: '150' }))
    expect(body.eligible).toBe(false)
    expect(body.policy).toMatchObject({ freeUntilIso: '2027-01-10T06:00:00.000Z', freeUntilPassed: true, hours: 12 })
  })

  it('STOP-02: the free-cancellation window follows the server route distance, not the browser distanceKm', async () => {
    // The browser says 1 km (a 1 h short window); Google says 130 km through the stop (the 12 h long window).
    routeDistanceMock.mockResolvedValueOnce({ ok: true, distanceKm: 130, durationMin: 150 })
    const { body } = await call(
      bookingData({
        pickupDate: '2027-01-10',
        pickupTime: '19:00',
        distanceKm: '1',
        stops: [{ address: 'Karlovy Vary', lat: 50.23, lng: 12.87, waitMinutes: 0 }] as unknown as string,
      }),
    )
    expect(routeDistanceMock).toHaveBeenCalledTimes(1)
    expect(routeDistanceMock.mock.calls[0][0].intermediates).toEqual([{ lat: 50.23, lng: 12.87 }])
    expect(body.policy).toMatchObject({ freeUntilIso: '2027-01-10T06:00:00.000Z', hours: 12 })
  })

  it('D-17: when Google routing fails the answer is the existing opaque { eligible: false }, nothing is priced', async () => {
    routeDistanceMock.mockResolvedValueOnce({ ok: false, reason: 'timeout' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { status, body } = await call(bookingData({ distanceKm: '1' }))
    errSpy.mockRestore()
    expect(status).toBe(200)
    expect(body).toEqual({ eligible: false })
  })

  it('a round trip previews the outbound leg: its deadline and its share of the price', async () => {
    const { body } = await call(
      bookingData({ tripType: 'round_trip', returnDate: '2027-01-18', returnTime: '10:00' }),
    )
    expect(body.eligible).toBe(false)
    expect(body.policy.freeUntilIso).toBe('2027-01-16T08:00:00.000Z')
    expect(body.policy.feeMinor).toBeGreaterThan(0)
  })

  it('validation or pricing failure for a public client is still exactly { eligible: false }', async () => {
    expect((await call(bookingData({ phone: '12345' }))).body).toEqual({ eligible: false })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    pricingConfigMock.mockRejectedValue(new Error('db down'))
    expect((await call(bookingData())).body).toEqual({ eligible: false })
    errSpy.mockRestore()
  })

  it('stays side-effect free: only pricing_globals is read', async () => {
    await call(bookingData({ tripType: 'round_trip', returnDate: '2027-01-18', returnTime: '10:00' }))
    expect(new Set(state.queried)).toEqual(new Set(['pricing_globals']))
  })
})
