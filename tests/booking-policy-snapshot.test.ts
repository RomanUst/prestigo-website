// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 89 plan 89-07 (CANC-01, CANC-02, D-18, D-24): the cancellation terms are stored on the booking row
// (cancel_policy_version, cancel_policy) only while the policy is public for the client. Tracer: canary email on the
// pay-now path, create-payment-intent -> checkout metadata -> buildBookingRow -> row columns.

const { stripeMock, supabaseServiceStub, pricingConfigMock, saveBookingMock, settingsState } = vi.hoisted(() => {
  const settingsState: { row: { data: unknown; error: unknown } } = { row: { data: null, error: null } }
  return {
    stripeMock: { paymentIntents: { create: vi.fn() } },
    supabaseServiceStub: { from: vi.fn(), rpc: vi.fn() },
    pricingConfigMock: vi.fn(),
    saveBookingMock: vi.fn(),
    settingsState,
  }
})

const { routeDistanceMock } = vi.hoisted(() => ({ routeDistanceMock: vi.fn() }))
// Phase 91 (STOP-02): the checkout prices on the server's Google Routes distance. These fixtures used to send
// distanceKm; the mock returns the same distance so the assertions stay unchanged.
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: routeDistanceMock }))

vi.mock('stripe', () => {
  function MockStripe() {
    return stripeMock
  }
  MockStripe.createFetchHttpClient = () => ({})
  return { default: MockStripe }
})
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabaseServiceStub) }))
vi.mock('@/lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase')>('@/lib/supabase')
  return {
    ...actual,
    createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
    saveBooking: saveBookingMock,
  }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } }),
  ),
}))
vi.mock('@/lib/pricing-config', () => ({ getPricingConfig: pricingConfigMock }))
vi.mock('@/lib/booking-reference', () => {
  let n = 0
  return { generateBookingReference: vi.fn(() => `PRG-20270101-${String(++n).padStart(4, '0')}`) }
})
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, limit: 100 }),
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

import { POST } from '@/app/api/create-payment-intent/route'
import { buildBookingRow, buildBookingRows, parseCancelPolicyMeta } from '@/lib/supabase'
import { buildCheckoutMeta } from '@/lib/checkout/compute'
import { buildPolicySnapshot } from '@/lib/cancellation-settings'
import { DEFAULT_POLICY } from '@/lib/cancellation-policy'
import { getPaymentSettings, isCardFlowEligible, isPolicyPublic } from '@/lib/payments/config'
import type { PaymentSettings } from '@/lib/payments/config'

const OWNER = 'owner@example.com'

const PRICING = {
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
  },
}

function settingsRow(over: Record<string, unknown> = {}) {
  return {
    data: {
      payment_hold_lead_hours: 72,
      card_flow_mode: 'off',
      card_flow_canary_emails: [OWNER],
      cancel_free_km_threshold: 80,
      cancel_free_hours_short: 2,
      cancel_free_hours_long: 24,
      cancel_free_hours_hourly: 6,
      cancel_fee_percent: 50,
      ...over,
    },
    error: null,
  }
}

const EXPECTED_SNAPSHOT = {
  version: '2026-11-1',
  kmThreshold: 80,
  freeHoursShort: 2,
  freeHoursLong: 24,
  freeHoursHourly: 6,
  feePercent: 50,
}

function futureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function bookingData(over: Record<string, string> = {}): Record<string, string> {
  return {
    tripType: 'transfer',
    vehicleClass: 'business',
    currency: 'eur',
    distanceKm: '10',
    originLat: '50.0755',
    originLng: '14.4378',
    destinationLat: '49.1951',
    destinationLng: '16.6068',
    pickupDate: futureDate(30),
    pickupTime: '10:00',
    passengers: '2',
    luggage: '1',
    hours: '2',
    extraChildSeat: 'false',
    extraMeetGreet: 'false',
    extraLuggage: 'false',
    firstName: 'John',
    lastName: 'Doe',
    email: OWNER,
    phone: '+420123456789',
    originAddress: 'Prague',
    destinationAddress: 'Brno',
    isAirport: 'false',
    ...over,
  }
}

function postRequest(data: Record<string, string>): Request {
  return new Request('http://localhost/api/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingData: data }),
  })
}

/** from(): pricing_globals answers the settings row; bookings is the capture chain and records every insert. */
function wireDb() {
  const inserted: Record<string, unknown>[] = []
  supabaseServiceStub.from.mockImplementation((table: string) => {
    if (table === 'pricing_globals') {
      const b = { select: () => b, eq: () => b, single: () => Promise.resolve(settingsState.row) }
      return b
    }
    if (table === 'bookings') {
      const sel = { eq: () => sel, maybeSingle: () => Promise.resolve({ data: null, error: null }) }
      return {
        select: () => sel,
        insert: (rows: Record<string, unknown>[]) => {
          inserted.push(...rows)
          return { select: () => Promise.resolve({ data: [{ id: 'new-capture-id' }], error: null }) }
        },
        update: () => ({ eq: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }) }),
      }
    }
    return { select: vi.fn(), insert: vi.fn(), update: vi.fn() }
  })
  return inserted
}

beforeEach(() => {
  routeDistanceMock.mockReset()
  routeDistanceMock.mockResolvedValue({ ok: true, distanceKm: 10, durationMin: 40 })
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock'
  pricingConfigMock.mockResolvedValue(PRICING)
  stripeMock.paymentIntents.create.mockResolvedValue({ client_secret: 'pi_secret', id: 'pi_test_id' })
  saveBookingMock.mockResolvedValue([{ id: 'unpaid-row-id' }])
  settingsState.row = settingsRow({ card_flow_mode: 'canary' })
  wireDb()
})

describe('tracer: pay-now path with a canary email', () => {
  it('the unpaid row carries cancel_policy_version and the settings snapshot, and Stripe metadata carries cancelPolicy', async () => {
    const res = await POST(postRequest(bookingData()))
    expect(res.status).toBe(200)

    expect(saveBookingMock).toHaveBeenCalledTimes(1)
    const row = saveBookingMock.mock.calls[0][0]
    expect(row.cancel_policy_version).toBe('2026-11-1')
    expect(row.cancel_policy).toEqual(EXPECTED_SNAPSHOT)

    const meta = stripeMock.paymentIntents.create.mock.calls[0][0].metadata as Record<string, string>
    expect(JSON.parse(meta.cancelPolicy)).toEqual(EXPECTED_SNAPSHOT)
    expect(meta.cancelPolicy.length).toBeLessThanOrEqual(500)
  })

  it('a listed email with different case and spaces is still public (normalised)', async () => {
    settingsState.row = settingsRow({ card_flow_mode: 'canary', card_flow_canary_emails: ['Owner@Example.com '] })
    await POST(postRequest(bookingData()))
    expect(saveBookingMock.mock.calls[0][0].cancel_policy_version).toBe('2026-11-1')
  })
})

describe('flag state on the pay-now path', () => {
  it('canary with a client who is not on the list: both columns null, no cancelPolicy key in the Stripe metadata', async () => {
    await POST(postRequest(bookingData({ email: 'stranger@example.com' })))
    const row = saveBookingMock.mock.calls[0][0]
    expect(row.cancel_policy_version).toBeNull()
    expect(row.cancel_policy).toBeNull()
    const meta = stripeMock.paymentIntents.create.mock.calls[0][0].metadata as Record<string, string>
    expect('cancelPolicy' in meta).toBe(false)
  })

  it('mode off: both columns null and the metadata key set is unchanged', async () => {
    settingsState.row = settingsRow({ card_flow_mode: 'off' })
    await POST(postRequest(bookingData()))
    const row = saveBookingMock.mock.calls[0][0]
    expect(row.cancel_policy_version).toBeNull()
    expect(row.cancel_policy).toBeNull()
    const meta = stripeMock.paymentIntents.create.mock.calls[0][0].metadata as Record<string, string>
    expect(Object.keys(meta)).not.toContain('cancelPolicy')
  })

  it('mode on: any email gets the snapshot', async () => {
    settingsState.row = settingsRow({ card_flow_mode: 'on' })
    await POST(postRequest(bookingData({ email: 'anyone@example.com' })))
    expect(saveBookingMock.mock.calls[0][0].cancel_policy).toEqual(EXPECTED_SNAPSHOT)
  })

  it('a settings read failure means no snapshot, and the booking still proceeds on legacy terms', async () => {
    settingsState.row = { data: null, error: { message: 'boom' } }
    const res = await POST(postRequest(bookingData()))
    expect(res.status).toBe(200)
    const row = saveBookingMock.mock.calls[0][0]
    expect(row.cancel_policy_version).toBeNull()
    expect(row.cancel_policy).toBeNull()
  })

  it('a client-supplied policy field is never read (T-89-23)', async () => {
    const res = await POST(
      postRequest(
        bookingData({
          cancelPolicy: JSON.stringify({ ...EXPECTED_SNAPSHOT, freeHoursLong: 0 }),
          cancel_policy_version: 'evil',
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(saveBookingMock.mock.calls[0][0].cancel_policy).toEqual(EXPECTED_SNAPSHOT)
  })
})

describe('round trip: both leg rows carry the terms (D-24)', () => {
  const rtData = () =>
    bookingData({
      tripType: 'round_trip',
      returnDate: futureDate(33),
      returnTime: '10:00',
      attemptId: '11111111-1111-4111-8111-111111111111',
    })

  it('public: outbound and return rows both have the version and the snapshot', async () => {
    const inserted = wireDb()
    const res = await POST(postRequest(rtData()))
    expect(res.status).toBe(200)
    expect(inserted).toHaveLength(2)
    expect(inserted.map((r) => r.leg).sort()).toEqual(['outbound', 'return'])
    for (const r of inserted) {
      expect(r.cancel_policy_version).toBe('2026-11-1')
      expect(r.cancel_policy).toEqual(EXPECTED_SNAPSHOT)
    }
  })

  it('not public: both legs have null columns', async () => {
    settingsState.row = settingsRow({ card_flow_mode: 'off' })
    const inserted = wireDb()
    await POST(postRequest(rtData()))
    expect(inserted).toHaveLength(2)
    for (const r of inserted) {
      expect(r.cancel_policy_version).toBeNull()
      expect(r.cancel_policy).toBeNull()
    }
  })
})

describe('buildBookingRow / buildBookingRows / parseCancelPolicyMeta (also the webhook insert fallback)', () => {
  const meta = {
    bookingReference: 'PRG-1',
    returnBookingReference: 'PRG-2',
    tripType: 'round_trip',
    pickupDate: '2027-02-01',
    pickupTime: '10:00',
    returnDate: '2027-02-03',
    returnTime: '12:00',
    vehicleClass: 'business',
    passengers: '2',
    luggage: '1',
    firstName: 'A',
    lastName: 'B',
    email: 'a@b.com',
    phone: '+420123456789',
    outboundAmountCzk: '1000',
    returnAmountCzk: '900',
    amountCzk: '1900',
  }

  it('a webhook insert from the stored metadata reproduces the same columns', () => {
    const cancelPolicy = JSON.stringify(EXPECTED_SNAPSHOT)
    const one = buildBookingRow({ ...meta, tripType: 'transfer', cancelPolicy }, 'pi_1', 'confirmed')
    expect(one.cancel_policy_version).toBe('2026-11-1')
    expect(one.cancel_policy).toEqual(EXPECTED_SNAPSHOT)
    const { outbound, return: ret } = buildBookingRows({ ...meta, cancelPolicy }, 'pi_1')
    expect(outbound.cancel_policy).toEqual(EXPECTED_SNAPSHOT)
    expect(ret.cancel_policy_version).toBe('2026-11-1')
    expect(ret.cancel_policy).toEqual(EXPECTED_SNAPSHOT)
  })

  it('no cancelPolicy in the metadata (quotes, old PaymentIntents): null columns', () => {
    const one = buildBookingRow({ ...meta, tripType: 'transfer' }, 'pi_1', 'quote')
    expect(one.cancel_policy_version).toBeNull()
    expect(one.cancel_policy).toBeNull()
    const { outbound, return: ret } = buildBookingRows(meta, 'pi_1')
    expect(outbound.cancel_policy).toBeNull()
    expect(ret.cancel_policy).toBeNull()
  })

  it.each([
    ['not json', '{nope'],
    ['an array', '[1,2]'],
    ['out-of-bounds hours', JSON.stringify({ ...EXPECTED_SNAPSHOT, freeHoursLong: 500 })],
    ['a missing field', JSON.stringify({ version: '2026-11-1', kmThreshold: 80 })],
  ])('%s is stored as null, never as a guess', (_label, raw) => {
    expect(parseCancelPolicyMeta(raw)).toEqual({ cancel_policy_version: null, cancel_policy: null })
  })

  it('buildCheckoutMeta adds cancelPolicy only when a snapshot is given', () => {
    const base = {
      bookingData: bookingData() as never,
      priced: {
        ok: true,
        combined: { finalTotalEur: 10, finalTotalCzk: 250, stripeAmountMinor: 1000 },
        outboundLegEur: 10,
        returnLegEur: 0,
        extrasTotalEur: 0,
        appliedPromoPct: 0,
        promoCode: '',
        returnDiscountPercent: 10,
      } as never,
      bookingReference: 'PRG-1',
      returnBookingReference: '',
      authenticatedUserId: null,
    }
    expect('cancelPolicy' in buildCheckoutMeta(base)).toBe(false)
    expect('cancelPolicy' in buildCheckoutMeta({ ...base, cancelPolicy: null })).toBe(false)
    const withPolicy = buildCheckoutMeta({ ...base, cancelPolicy: buildPolicySnapshot(DEFAULT_POLICY) })
    expect(JSON.parse(withPolicy.cancelPolicy)).toMatchObject({ version: '2026-11-1', feePercent: 100 })
  })
})

describe('lib/payments/config: mode on, isPolicyPublic, isCardFlowEligible', () => {
  const s = (mode: PaymentSettings['mode'], emails: string[] = [OWNER]): PaymentSettings => ({
    mode,
    leadHours: 72,
    canaryEmails: emails,
  })

  it('isPolicyPublic: off is false for everyone', () => {
    expect(isPolicyPublic(s('off'), OWNER)).toBe(false)
  })
  it('isPolicyPublic: canary is true only for a listed, normalised email', () => {
    expect(isPolicyPublic(s('canary'), ' Owner@Example.com ')).toBe(true)
    expect(isPolicyPublic(s('canary'), 'owner@example.com.evil')).toBe(false)
    expect(isPolicyPublic(s('canary'), 'stranger@example.com')).toBe(false)
    expect(isPolicyPublic(s('canary'), '')).toBe(false)
    expect(isPolicyPublic(s('canary', []), OWNER)).toBe(false)
  })
  it('isPolicyPublic: on is true for any email', () => {
    expect(isPolicyPublic(s('on'), 'anyone@example.com')).toBe(true)
    expect(isPolicyPublic(s('on', []), 'anyone@example.com')).toBe(true)
  })

  it('isCardFlowEligible on mode on: transfer and hourly with an email yes; round_trip, daily and no email no', () => {
    expect(isCardFlowEligible(s('on', []), { email: 'anyone@example.com', tripType: 'transfer' })).toBe(true)
    expect(isCardFlowEligible(s('on', []), { email: 'anyone@example.com', tripType: 'hourly' })).toBe(true)
    expect(isCardFlowEligible(s('on'), { email: 'anyone@example.com', tripType: 'round_trip' })).toBe(false)
    expect(isCardFlowEligible(s('on'), { email: 'anyone@example.com', tripType: 'daily' })).toBe(false)
    expect(isCardFlowEligible(s('on'), { email: '  ', tripType: 'transfer' })).toBe(false)
  })
  it('isCardFlowEligible canary behaviour is unchanged', () => {
    expect(isCardFlowEligible(s('canary'), { email: OWNER, tripType: 'transfer' })).toBe(true)
    expect(isCardFlowEligible(s('canary'), { email: 'x@example.com', tripType: 'transfer' })).toBe(false)
    expect(isCardFlowEligible(s('off'), { email: OWNER, tripType: 'transfer' })).toBe(false)
  })

  it('getPaymentSettings reads on; an unknown value stays off', async () => {
    settingsState.row = settingsRow({ card_flow_mode: 'on' })
    wireDb()
    expect((await getPaymentSettings()).mode).toBe('on')
    settingsState.row = settingsRow({ card_flow_mode: 'canary' })
    expect((await getPaymentSettings()).mode).toBe('canary')
    settingsState.row = settingsRow({ card_flow_mode: 'bogus' })
    expect((await getPaymentSettings()).mode).toBe('off')
    settingsState.row = settingsRow({ card_flow_mode: 'ON' })
    expect((await getPaymentSettings()).mode).toBe('off')
  })
})
