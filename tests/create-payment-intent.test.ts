import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories
const { stripeMock, supabaseServiceStub, pricingConfigMock, saveBookingMock } = vi.hoisted(() => {
  const paymentIntentCreateMock = vi.fn()

  const stripeMock = {
    paymentIntents: {
      create: paymentIntentCreateMock,
    },
  }

  const supabaseServiceStub = {
    from: vi.fn(),
    rpc: vi.fn(),
  }

  const pricingConfigMock = vi.fn()
  const saveBookingMock = vi.fn()

  return { stripeMock, supabaseServiceStub, pricingConfigMock, saveBookingMock }
})

vi.mock('stripe', () => {
  function MockStripe() {
    return stripeMock
  }
  MockStripe.createFetchHttpClient = () => ({})
  return {
    default: MockStripe,
  }
})

// Phase 62-02: mock the createClient call itself (the TRUE module boundary),
// not just the `createSupabaseServiceClient` export. `captureUnpaidBooking`
// (kept REAL below, via `...actual`) calls `createSupabaseServiceClient()` as
// an internal same-module reference — overriding only the export does not
// intercept that internal call (a known ESM partial-mock limitation), so it
// must be caught one layer down where there IS no self-reference.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseServiceStub),
}))

// Keep the REAL buildBookingRow/withRetry/captureUnpaidBooking so their
// field-mapping and branch logic (insert vs. update vs. no-op) is exercised
// end-to-end (Phase 62-02 Task 1) — only override the DB-touching exports
// that need custom per-test return values.
vi.mock('@/lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase')>('@/lib/supabase')
  return {
    ...actual,
    createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
    saveBooking: saveBookingMock,
  }
})

// Pre-existing gap (not introduced by Phase 62): the route resolves
// authenticatedUserId via createClient().auth.getUser(), which calls
// next/headers cookies() outside a request scope when unmocked in Vitest.
// This mock was missing before this plan and made every POST() in this
// file 500 regardless of test intent — added per deviation Rule 3
// (blocking-issue auto-fix) to unblock verification of Task 2/3.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
  ),
}))

vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: pricingConfigMock,
}))

vi.mock('@/lib/booking-reference', () => ({
  generateBookingReference: vi.fn(() => 'PRG-20260403-0001'),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, limit: 100 }),
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

import { POST } from '@/app/api/create-payment-intent/route'

const DEFAULT_PRICING = {
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

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// The route enforces a ≥12h-advance business rule against wall-clock "now" —
// a hardcoded calendar date rots as soon as real time catches up to it
// (pre-existing gap, not introduced by Phase 62; fixed per deviation Rule 3
// since it silently 422s every "happy path" test in this file once the
// fixture date is in the past).
function futureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// SEC-01: create-payment-intent VALIDATES a promo via a read
// (from('promo_codes').select(...).eq('code').eq('is_active').maybeSingle())
// and does NOT increment the usage counter here — the claim happens in the
// Stripe webhook after payment_intent.succeeded. These promo tests predate that
// refactor: they mocked rpc('claim_promo_code') and used a past pickupDate, so
// they had rotted red on main. Modernized in Phase 62 to the current read-based
// contract (test-only; no production behavior change). Pass `null` to simulate
// an invalid/exhausted code (no matching active row).
function mockPromoLookup(row: Record<string, unknown> | null) {
  supabaseServiceStub.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
    }),
  })
}

// Phase 62-02: mocks the supabase chain that the REAL (unmocked)
// `captureUnpaidBooking` drives — SELECT (attempt_id, leg) → maybeSingle,
// then either INSERT (no existing row) or UPDATE (existing 'unpaid' row).
// `existing: null` exercises the insert branch; `existing: {...}` the
// update-or-noop branch depending on its `status`.
function mockCaptureChain(existing: { id: string; status: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null })
  const selectEq2 = vi.fn().mockReturnValue({ maybeSingle })
  const selectEq1 = vi.fn().mockReturnValue({ eq: selectEq2 })
  const select = vi.fn().mockReturnValue({ eq: selectEq1 })

  const insertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'new-capture-id' }], error: null })
  const insert = vi.fn().mockReturnValue({ select: insertSelect })

  const updateSelect = vi.fn().mockResolvedValue({ data: [{ id: existing?.id ?? 'updated-id' }], error: null })
  const updateEq2 = vi.fn().mockReturnValue({ select: updateSelect })
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
  const update = vi.fn().mockReturnValue({ eq: updateEq1 })

  supabaseServiceStub.from.mockImplementation((table: string) => {
    if (table === 'bookings') return { select, insert, update }
    // Not exercised by these tests (no promoCode sent) — keep a harmless stub.
    return { select: vi.fn(), insert: vi.fn(), update: vi.fn() }
  })

  return { select, insert, update, insertSelect, updateSelect }
}

function makeBookingData(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    tripType: 'transfer',
    vehicleClass: 'business',
    currency: 'eur',
    distanceKm: '10',
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
    email: 'john@example.com',
    phone: '+420123456789',
    originAddress: 'Prague',
    destinationAddress: 'Brno',
    isAirport: 'false',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Ensure the Stripe lazy-init guard passes — value is irrelevant because the
  // Stripe constructor is replaced by the vi.mock above.
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock'
  pricingConfigMock.mockResolvedValue(DEFAULT_PRICING)
  stripeMock.paymentIntents.create.mockResolvedValue({
    client_secret: 'pi_test_secret',
    id: 'pi_test_id',
  })
  saveBookingMock.mockResolvedValue([{ id: 'unpaid-row-id' }])
})

describe('/api/create-payment-intent', () => {
  describe('PAY-01: PaymentIntent created server-side with calculated amount', () => {
    it.todo('POST creates PaymentIntent with amount in hellers (CZK * 100)')
    it.todo('POST returns clientSecret and bookingReference in response')
    it.todo('bookingReference follows PRG-YYYYMMDD-NNNN format')
    it.todo('POST returns 500 on Stripe error')
  })

  describe('PAY-02: Stripe secret key never sent to client', () => {
    it.todo('response body does not contain STRIPE_SECRET_KEY value')
  })
})

describe('PROMO-04: promo code integration', () => {
  it('Test 1: POST with promoCode validates via a promo_codes read and does NOT claim here (SEC-01)', async () => {
    mockPromoLookup({ discount_value: 15, max_uses: null, current_uses: 0, is_active: true })

    const res = await POST(
      makePostRequest({ bookingData: makeBookingData({ promoCode: 'SUMMER20' }) })
    )

    expect(res.status).toBe(200)
    expect(supabaseServiceStub.from).toHaveBeenCalledWith('promo_codes')
    // Usage counter is incremented in the webhook after payment, never in this endpoint.
    expect(supabaseServiceStub.rpc).not.toHaveBeenCalled()
  })

  it('Test 2: 15% discount on 100 EUR base → PaymentIntent amount is 8500 (85 EUR in cents)', async () => {
    mockPromoLookup({ discount_value: 15, max_uses: null, current_uses: 0, is_active: true })

    // Mock pricing config to yield exactly 100 EUR base:
    // ratePerKm.business = 10.0, distanceKm = 10 → 10 * 10 = 100 EUR
    // nightCoefficient = 1.0, no airport fee, no extras
    pricingConfigMock.mockResolvedValue({
      ...DEFAULT_PRICING,
      ratePerKm: { business: 10.0, first_class: 10.0, business_van: 10.0 },
      globals: { ...DEFAULT_PRICING.globals, nightCoefficient: 1.0 },
    })

    const res = await POST(
      makePostRequest({ bookingData: makeBookingData({ promoCode: 'SUMMER20', distanceKm: '10' }) })
    )

    expect(res.status).toBe(200)
    // 100 EUR * (1 - 15/100) = 85 EUR = 8500 cents
    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 8500,
        currency: 'eur',
      })
    )
  })

  it('Test 3: invalid/exhausted code (no matching active row) returns 400 with specific error', async () => {
    mockPromoLookup(null)

    const res = await POST(
      makePostRequest({ bookingData: makeBookingData({ promoCode: 'EXHAUSTED' }) })
    )

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('invalid, expired, or has reached its usage limit')
  })

  it('Test 4: POST without promoCode creates PaymentIntent with full price (no discount)', async () => {
    const res = await POST(
      makePostRequest({ bookingData: makeBookingData() })
    )

    expect(res.status).toBe(200)
    // rpc should NOT be called
    expect(supabaseServiceStub.rpc).not.toHaveBeenCalled()
  })

  it('Test 5: PaymentIntent metadata includes promoCode and discountPct when promo applied', async () => {
    mockPromoLookup({ discount_value: 20, max_uses: null, current_uses: 0, is_active: true })

    const res = await POST(
      makePostRequest({ bookingData: makeBookingData({ promoCode: 'WINTER20' }) })
    )

    expect(res.status).toBe(200)
    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          promoCode: 'WINTER20',
          discountPct: '20',
        }),
      })
    )
  })
})

describe('PAY26-RT: round-trip server-side recomputation', () => {
  function makeRoundTripBookingData(overrides: Record<string, string> = {}): Record<string, string> {
    return makeBookingData({
      tripType: 'round_trip',
      pickupDate: futureDate(30),
      pickupTime: '10:00',
      returnDate: futureDate(34),
      returnTime: '15:00',
      originLat: '50.0755',
      originLng: '14.4378',
      destinationLat: '49.1951',
      destinationLng: '16.6068',
      quoteMode: 'false',
      ...overrides,
    })
  }

  it('PAY26-RT-AMOUNT-01: creates PaymentIntent with outbound + return amount (no promo)', async () => {
    const res = await POST(
      makePostRequest({ bookingData: makeRoundTripBookingData({ distanceKm: '10' }) })
    )
    expect(res.status).toBe(200)
    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: expect.any(Number),
        currency: 'eur',
      })
    )
    const call = stripeMock.paymentIntents.create.mock.calls[0][0]
    expect(call.amount).toBeGreaterThan(0)
    // Combined amount should exceed outbound-only (return leg adds ~90% of outbound due to 10% discount)
    expect(call.amount).toBeGreaterThan(2500) // sanity lower bound vs one-way
  })

  it('PAY26-RT-AMOUNT-02: ignores client-sent combinedTotal field', async () => {
    const res = await POST(
      makePostRequest({
        bookingData: makeRoundTripBookingData({ distanceKm: '10', combinedTotal: '1', amountEur: '1' }),
      })
    )
    expect(res.status).toBe(200)
    const call = stripeMock.paymentIntents.create.mock.calls[0][0]
    // Amount MUST NOT be 100 cents (falsified value) — must be the server-recomputed value
    expect(call.amount).not.toBe(100)
    expect(call.amount).toBeGreaterThan(1000)
  })

  it('PAY26-RT-PROMO: applies promo once on combined, not per leg (rounding regression)', async () => {
    mockPromoLookup({ discount_value: 15, max_uses: null, current_uses: 0, is_active: true })
    // Use ratePerKm that produces exactly outbound=150, return=135 (post-10%-discount), extras=10
    // With default night/holiday coefficients = 1.0 during daytime
    pricingConfigMock.mockResolvedValue({
      ...DEFAULT_PRICING,
      ratePerKm: { business: 15.0, first_class: 15.0, business_van: 15.0 }, // 10 km * 15 = 150
      globals: {
        ...DEFAULT_PRICING.globals,
        returnDiscountPercent: 10, // 150 * 0.9 = 135
        nightCoefficient: 1.0,
        holidayCoefficient: 1.0,
        airportFee: 0,
        extraChildSeat: 10, // extras = 10
      },
      minFare: { business: 0, first_class: 0, business_van: 0 },
    })
    const res = await POST(
      makePostRequest({
        bookingData: makeRoundTripBookingData({
          distanceKm: '10',
          extraChildSeat: 'true',
          promoCode: 'SUMMER15',
        }),
      })
    )
    expect(res.status).toBe(200)
    const call = stripeMock.paymentIntents.create.mock.calls[0][0]
    // computeExtrasTotal always returns 0 (extras prices are all 0 in lib/extras.ts)
    // so combined = 150 + 0 + 135 = 285; Math.round(285 * 0.85) = Math.round(242.25) = 242 EUR → 24200 cents
    expect(call.amount).toBe(24200)
    // Per-leg anti-pattern would give: round(150*0.85)+round(0*0.85)+round(135*0.85)
    //                                = 128 + 0 + 115 = 243 → 24300 cents — prove we don't do this
    expect(call.amount).not.toBe(24300)
  })

  it('PAY26-RT-PROMO-ORDER: claim_promo_code NOT called on zod validation failure', async () => {
    const res = await POST(
      makePostRequest({
        bookingData: makeRoundTripBookingData({ returnDate: 'not-a-date', promoCode: 'SUMMER15' }),
      })
    )
    expect(res.status).toBe(400)
    expect(supabaseServiceStub.rpc).not.toHaveBeenCalled()
  })

  it('PAY26-RT-VAL-01: missing returnDate → 400', async () => {
    const res = await POST(
      makePostRequest({ bookingData: makeRoundTripBookingData({ returnDate: '' }) })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/return/i)
  })

  it('PAY26-RT-VAL-02: missing returnTime → 400', async () => {
    const res = await POST(
      makePostRequest({ bookingData: makeRoundTripBookingData({ returnTime: '' }) })
    )
    expect(res.status).toBe(400)
  })

  it('PAY26-RT-VAL-03: return datetime before pickup datetime → 400', async () => {
    const res = await POST(
      makePostRequest({
        bookingData: makeRoundTripBookingData({
          pickupDate: '2026-06-05',
          pickupTime: '15:00',
          returnDate: '2026-06-01',
          returnTime: '10:00',
        }),
      })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/after pickup/i)
  })

  it('PAY26-RT-QUOTEMODE: quoteMode=true → 400 and no Stripe call', async () => {
    const res = await POST(
      makePostRequest({
        bookingData: makeRoundTripBookingData({ quoteMode: 'true' }),
      })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/quote/i)
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled()
  })

  it('PAY26-RT-CZK: czk currency returns stripe amount in hellers', async () => {
    const res = await POST(
      makePostRequest({
        bookingData: makeRoundTripBookingData({ distanceKm: '10', currency: 'czk' }),
      })
    )
    expect(res.status).toBe(200)
    const call = stripeMock.paymentIntents.create.mock.calls[0][0]
    expect(call.currency).toBe('czk')
    // hellers = CZK * 100
    expect(call.amount % 100).toBe(0) // sanity check on haler rounding
  })

  it('PAY26-RT-ONE-WAY-REGRESSION: transfer tripType still works (no round-trip code path)', async () => {
    const res = await POST(
      makePostRequest({ bookingData: makeBookingData() }) // default tripType='transfer'
    )
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).not.toHaveBeenCalled()
  })
})

describe('PAY26-META: round-trip metadata contract', () => {
  function makeRoundTripBookingData(overrides: Record<string, string> = {}): Record<string, string> {
    return makeBookingData({
      tripType: 'round_trip',
      pickupDate: futureDate(30),
      pickupTime: '10:00',
      returnDate: futureDate(34),
      returnTime: '15:00',
      originLat: '50.0755',
      originLng: '14.4378',
      destinationLat: '49.1951',
      destinationLng: '16.6068',
      quoteMode: 'false',
      ...overrides,
    })
  }

  it('PAY26-META-KEYS: metadata includes all Phase 27 required round-trip fields', async () => {
    const res = await POST(
      makePostRequest({ bookingData: makeRoundTripBookingData({ distanceKm: '10' }) })
    )
    expect(res.status).toBe(200)
    const call = stripeMock.paymentIntents.create.mock.calls[0][0]
    const md = call.metadata
    for (const key of [
      'bookingReference', 'returnBookingReference', 'tripType',
      'returnDate', 'returnTime', 'outboundAmountCzk', 'returnAmountCzk',
      'returnDiscountPct', 'originLat', 'originLng', 'destinationLat', 'destinationLng',
    ]) {
      expect(md).toHaveProperty(key)
      expect(typeof md[key]).toBe('string')
    }
    expect(md.tripType).toBe('round_trip')
    expect(md.returnBookingReference).toMatch(/^PRG-\d{8}-\d{4}$/)
    expect(md.bookingReference).toMatch(/^PRG-\d{8}-\d{4}$/)
  })

  it('PAY26-META-LIMITS: ≤ 50 keys and each value ≤ 500 chars with 490-char specialRequests', async () => {
    const longRequests = 'x'.repeat(490)
    const res = await POST(
      makePostRequest({
        bookingData: makeRoundTripBookingData({ distanceKm: '10', specialRequests: longRequests }),
      })
    )
    expect(res.status).toBe(200)
    const call = stripeMock.paymentIntents.create.mock.calls[0][0]
    const md = call.metadata
    expect(Object.keys(md).length).toBeLessThanOrEqual(50)
    for (const v of Object.values(md)) {
      expect(String(v).length).toBeLessThanOrEqual(500)
    }
  })

  it('PAY26-META-REF-PAIR: outbound and return booking refs differ', async () => {
    // Override the mock to return different values on sequential calls
    const { generateBookingReference } = await import('@/lib/booking-reference')
    const genMock = vi.mocked(generateBookingReference)
    genMock.mockImplementationOnce(() => 'PRG-20260403-0001')
    genMock.mockImplementationOnce(() => 'PRG-20260403-0002')

    const res = await POST(
      makePostRequest({ bookingData: makeRoundTripBookingData({ distanceKm: '10' }) })
    )
    expect(res.status).toBe(200)
    const call = stripeMock.paymentIntents.create.mock.calls[0][0]
    expect(call.metadata.bookingReference).toBe('PRG-20260403-0001')
    expect(call.metadata.returnBookingReference).toBe('PRG-20260403-0002')
    expect(call.metadata.bookingReference).not.toBe(call.metadata.returnBookingReference)
  })

  it('PAY26-META-ONE-WAY: returnBookingReference is empty string for transfer tripType', async () => {
    const res = await POST(
      makePostRequest({ bookingData: makeBookingData() }) // default tripType='transfer'
    )
    expect(res.status).toBe(200)
    const call = stripeMock.paymentIntents.create.mock.calls[0][0]
    expect(call.metadata.returnBookingReference).toBe('')
  })

  it('PAY26-META-TRIP-TYPE-ENUM: round_trip accepted, invalid rejected', async () => {
    const res1 = await POST(
      makePostRequest({ bookingData: makeRoundTripBookingData({ distanceKm: '10' }) })
    )
    expect(res1.status).toBe(200)

    const res2 = await POST(
      makePostRequest({ bookingData: makeBookingData({ tripType: 'invalid' as unknown as string }) })
    )
    expect(res2.status).toBe(400)
  })
})

describe('ABND-01/02/05: Phase 62 unpaid capture — no attemptId fallback (62-01 path)', () => {
  it('a valid one-way POST without attemptId captures exactly one unpaid row keyed to the PaymentIntent', async () => {
    const res = await POST(
      makePostRequest({ bookingData: makeBookingData() })
    )
    expect(res.status).toBe(200)
    expect(saveBookingMock).toHaveBeenCalledTimes(1)
    const row = saveBookingMock.mock.calls[0][0]
    expect(row.status).toBe('unpaid')
    expect(row.payment_intent_id).toBe('pi_test_id')
    expect(row.client_email).toBe('john@example.com')
    expect(row.client_first_name).toBe('John')
    expect(row.client_last_name).toBe('Doe')
    expect(row.client_phone).toBe('+420123456789')
  })

  it('round-trip POST without attemptId does not capture (no dedup key to key the write on)', async () => {
    const res = await POST(
      makePostRequest({
        bookingData: makeBookingData({
          tripType: 'round_trip',
          distanceKm: '10',
          returnDate: futureDate(34),
          returnTime: '15:00',
          quoteMode: 'false',
        }),
      })
    )
    expect(res.status).toBe(200)
    expect(saveBookingMock).not.toHaveBeenCalled()
  })

  it('a thrown capture failure is caught and the route still returns 200', async () => {
    saveBookingMock.mockRejectedValueOnce(new Error('DB unavailable'))
    const res = await POST(
      makePostRequest({ bookingData: makeBookingData() })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.clientSecret).toBe('pi_test_secret')
    expect(saveBookingMock).toHaveBeenCalledTimes(1)
  })
})

describe('ABND-06: attempt_id dedup (Phase 62-02 Task 1)', () => {
  const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111'

  it('(a) a new attemptId inserts exactly one unpaid row carrying that attempt_id', async () => {
    const chain = mockCaptureChain(null)

    const res = await POST(
      makePostRequest({ bookingData: makeBookingData({ attemptId: ATTEMPT_ID }) })
    )

    expect(res.status).toBe(200)
    expect(chain.insert).toHaveBeenCalledTimes(1)
    expect(chain.update).not.toHaveBeenCalled()
    const insertedRow = chain.insert.mock.calls[0][0][0]
    expect(insertedRow.status).toBe('unpaid')
    expect(insertedRow.attempt_id).toBe(ATTEMPT_ID)
    expect(insertedRow.payment_intent_id).toBe('pi_test_id')
  })

  it('(b) a second POST with the SAME attemptId issues an UPDATE (not a second insert), overwriting payment_intent_id + booking_reference', async () => {
    const chain = mockCaptureChain({ id: 'existing-row-id', status: 'unpaid' })

    const res = await POST(
      makePostRequest({ bookingData: makeBookingData({ attemptId: ATTEMPT_ID }) })
    )

    expect(res.status).toBe(200)
    expect(chain.insert).not.toHaveBeenCalled()
    expect(chain.update).toHaveBeenCalledTimes(1)
    const updatedRow = chain.update.mock.calls[0][0]
    expect(updatedRow.attempt_id).toBe(ATTEMPT_ID)
    expect(updatedRow.payment_intent_id).toBe('pi_test_id')
    expect(updatedRow.booking_reference).toBe('PRG-20260403-0001')
  })

  it('(c) capture no-ops when a confirmed row already exists for (attempt_id, leg)', async () => {
    const chain = mockCaptureChain({ id: 'existing-row-id', status: 'confirmed' })

    const res = await POST(
      makePostRequest({ bookingData: makeBookingData({ attemptId: ATTEMPT_ID }) })
    )

    expect(res.status).toBe(200)
    expect(chain.insert).not.toHaveBeenCalled()
    expect(chain.update).not.toHaveBeenCalled()
  })

  it('(d) a malformed attemptId (not a UUID) returns 400', async () => {
    const res = await POST(
      makePostRequest({ bookingData: makeBookingData({ attemptId: 'not-a-uuid' }) })
    )
    expect(res.status).toBe(400)
  })
})
