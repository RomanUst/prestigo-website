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

  it("an unknown mode ('on') is treated as off", async () => {
    state.globals = settingsRow({ card_flow_mode: 'on' })
    expect((await call(bookingData())).body).toEqual({ eligible: false })
  })

  it.each(['round_trip', 'daily'])('%s is never eligible (D-19)', async (tripType) => {
    const { body } = await call(bookingData({ tripType, returnDate: '2027-01-18', returnTime: '10:00' }))
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
    expect(body).toEqual({ eligible: false })
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
        return call(bookingData({ tripType: 'daily' }))
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
