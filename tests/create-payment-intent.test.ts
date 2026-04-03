import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories
const { stripeMock, supabaseServiceStub, pricingConfigMock } = vi.hoisted(() => {
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

  return { stripeMock, supabaseServiceStub, pricingConfigMock }
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

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: pricingConfigMock,
}))

vi.mock('@/lib/booking-reference', () => ({
  generateBookingReference: vi.fn(() => 'PRG-20260403-0001'),
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
    extraMeetGreet: 15,
    extraLuggage: 5,
    holidayDates: [],
  },
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeBookingData(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    tripType: 'transfer',
    vehicleClass: 'business',
    currency: 'eur',
    distanceKm: '10',
    pickupDate: '2026-06-01',
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
  pricingConfigMock.mockResolvedValue(DEFAULT_PRICING)
  stripeMock.paymentIntents.create.mockResolvedValue({
    client_secret: 'pi_test_secret',
    id: 'pi_test_id',
  })
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
  it('Test 1: POST with promoCode calls supabaseService.rpc("claim_promo_code")', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', discount_value: 15 }],
      error: null,
    })

    const res = await POST(
      makePostRequest({ bookingData: makeBookingData({ promoCode: 'SUMMER20' }) })
    )

    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith('claim_promo_code', { p_code: 'SUMMER20' })
  })

  it('Test 2: 15% discount on 100 EUR base → PaymentIntent amount is 8500 (85 EUR in cents)', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', discount_value: 15 }],
      error: null,
    })

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

  it('Test 3: exhausted code (empty claim result) returns 400 with specific error', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [],
      error: null,
    })

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
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', discount_value: 20 }],
      error: null,
    })

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
