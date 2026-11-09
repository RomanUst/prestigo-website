// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories
const { supabaseServiceStub, pricingConfigMock } = vi.hoisted(() => ({
  supabaseServiceStub: { from: vi.fn() },
  pricingConfigMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: pricingConfigMock,
}))

import {
  checkoutBookingSchema,
  validateCheckoutBooking,
  priceCheckout,
  buildCheckoutMeta,
  type CheckoutBookingData,
  type CheckoutError,
  type PricedCheckout,
  type ValidatedCheckout,
} from '@/lib/checkout/compute'

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

function futureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function makeBookingData(overrides: Record<string, unknown> = {}): CheckoutBookingData {
  const parsed = checkoutBookingSchema.parse({
    bookingData: {
      tripType: 'transfer',
      vehicleClass: 'business',
      distanceKm: '50',
      pickupDate: futureDate(5),
      pickupTime: '10:00',
      passengers: '2',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+420725986855',
      ...overrides,
    },
  })
  return parsed.bookingData
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

beforeEach(() => {
  vi.clearAllMocks()
  pricingConfigMock.mockResolvedValue(DEFAULT_PRICING)
})

describe('validateCheckoutBooking', () => {
  it('rejects a phone without a country code with 422 INVALID_PHONE', () => {
    const result = expectError(validateCheckoutBooking(makeBookingData({ phone: '725986855' })))
    expect(result.status).toBe(422)
    expect(result.code).toBe('INVALID_PHONE')
    expect(result.error).toBe('Phone must include the country code')
  })

  it('rejects a transfer with distanceKm "0" with 400 INVALID_REQUEST', () => {
    const result = expectError(validateCheckoutBooking(makeBookingData({ distanceKm: '0' })))
    expect(result.status).toBe(400)
    expect(result.code).toBe('INVALID_REQUEST')
  })

  it('rejects passengers above the vehicle capacity with 400 TOO_MANY_PASSENGERS', () => {
    const result = expectError(
      validateCheckoutBooking(makeBookingData({ vehicleClass: 'business', passengers: '4' }))
    )
    expect(result.status).toBe(400)
    expect(result.code).toBe('TOO_MANY_PASSENGERS')
  })

  it('rejects a round trip whose return is before the pickup with RETURN_BEFORE_PICKUP', () => {
    const result = expectError(
      validateCheckoutBooking(
        makeBookingData({
          tripType: 'round_trip',
          pickupDate: futureDate(6),
          pickupTime: '10:00',
          returnDate: futureDate(5),
          returnTime: '10:00',
        })
      )
    )
    expect(result.status).toBe(400)
    expect(result.code).toBe('RETURN_BEFORE_PICKUP')
  })

  it('accepts a valid transfer and normalises the phone to E.164', () => {
    const bookingData = makeBookingData({ phone: '+420 725 986 855' })
    const result = validateCheckoutBooking(bookingData)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tripType).toBe('transfer')
    expect(result.vehicleClass).toBe('business')
    expect(result.distanceKm).toBe(50)
    expect(result.phone).toBe('+420725986855')
    expect(bookingData.phone).toBe('+420725986855')
  })

  it('does not enforce the legacy 12-hour lead time (that stays in the route)', () => {
    const result = validateCheckoutBooking(
      makeBookingData({ pickupDate: '2020-01-01', pickupTime: '10:00' })
    )
    expect(result.ok).toBe(true)
  })
})

describe('priceCheckout', () => {
  it('returns 503 PRICING_UNAVAILABLE when the pricing config cannot be loaded', async () => {
    pricingConfigMock.mockRejectedValue(new Error('db down'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bookingData = makeBookingData()
    const result = expectError(
      await priceCheckout({ bookingData, validated: validOrThrow(bookingData), currency: 'eur' })
    )
    errSpy.mockRestore()
    expect(result.status).toBe(503)
    expect(result.code).toBe('PRICING_UNAVAILABLE')
  })

  it('prices a valid transfer in eur: stripeAmountMinor === finalTotalEur * 100', async () => {
    const bookingData = makeBookingData()
    const result = await priceCheckout({
      bookingData,
      validated: validOrThrow(bookingData),
      currency: 'eur',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.combined.finalTotalEur).toBeGreaterThan(0)
    expect(result.combined.stripeAmountMinor).toBe(result.combined.finalTotalEur * 100)
    expect(result.returnLegEur).toBe(0)
    expect(result.promoCode).toBe('')
    expect(result.appliedPromoPct).toBe(0)
    expect(result.returnDiscountPercent).toBe(10)
  })

  it('prices the same input in czk: stripeAmountMinor === finalTotalCzk * 100', async () => {
    const bookingData = makeBookingData()
    const validated = validOrThrow(bookingData)
    const eur = await priceCheckout({ bookingData, validated, currency: 'eur' })
    const czk = await priceCheckout({ bookingData, validated, currency: 'czk' })
    expect(eur.ok && czk.ok).toBe(true)
    if (!eur.ok || !czk.ok) return
    expect(czk.combined.stripeAmountMinor).toBe(czk.combined.finalTotalCzk * 100)
    expect(czk.combined.finalTotalEur).toBe(eur.combined.finalTotalEur)
  })

  it('ignores any client-supplied amount: the price is always recomputed', async () => {
    const baseline = makeBookingData()
    const tampered = makeBookingData({ amountEur: '1', combinedTotal: '1', amountCzk: '1' })
    const a = await priceCheckout({ bookingData: baseline, validated: validOrThrow(baseline), currency: 'eur' })
    const b = await priceCheckout({ bookingData: tampered, validated: validOrThrow(tampered), currency: 'eur' })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.combined.stripeAmountMinor).toBe(a.combined.stripeAmountMinor)
  })

  it('returns 400 PROMO_INVALID for an unknown promo code', async () => {
    mockPromoLookup(null)
    const bookingData = makeBookingData({ promoCode: 'nope' })
    const result = expectError(
      await priceCheckout({ bookingData, validated: validOrThrow(bookingData), currency: 'eur' })
    )
    expect(result.status).toBe(400)
    expect(result.code).toBe('PROMO_INVALID')
  })

  it('returns 400 PROMO_INVALID for an exhausted promo code', async () => {
    mockPromoLookup({ discount_value: 10, max_uses: 5, current_uses: 5, is_active: true })
    const bookingData = makeBookingData({ promoCode: 'FULL' })
    const result = expectError(
      await priceCheckout({ bookingData, validated: validOrThrow(bookingData), currency: 'eur' })
    )
    expect(result.code).toBe('PROMO_INVALID')
  })

  it('applies a valid promo once on the combined total and upper-cases the code', async () => {
    mockPromoLookup({ discount_value: 10, max_uses: null, current_uses: 0, is_active: true })
    const plain = makeBookingData()
    const promo = makeBookingData({ promoCode: ' save10 ' })
    const base = await priceCheckout({ bookingData: plain, validated: validOrThrow(plain), currency: 'eur' })
    const discounted = await priceCheckout({ bookingData: promo, validated: validOrThrow(promo), currency: 'eur' })
    expect(base.ok && discounted.ok).toBe(true)
    if (!base.ok || !discounted.ok) return
    expect(discounted.promoCode).toBe('SAVE10')
    expect(discounted.appliedPromoPct).toBe(10)
    expect(discounted.combined.finalTotalEur).toBe(Math.round(base.combined.finalTotalEur * 0.9))
  })

  it('prices a round trip with a return leg', async () => {
    const bookingData = makeBookingData({
      tripType: 'round_trip',
      pickupDate: futureDate(5),
      pickupTime: '10:00',
      returnDate: futureDate(6),
      returnTime: '10:00',
    })
    const result = await priceCheckout({
      bookingData,
      validated: validOrThrow(bookingData),
      currency: 'eur',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.returnLegEur).toBeGreaterThan(0)
  })
})

describe('buildCheckoutMeta', () => {
  const LEGACY_KEYS = [
    'bookingReference',
    'locale',
    'returnBookingReference',
    'tripType',
    'originAddress',
    'originLat',
    'originLng',
    'destinationAddress',
    'destinationLat',
    'destinationLng',
    'pickupDate',
    'pickupTime',
    'returnDate',
    'returnTime',
    'vehicleClass',
    'passengers',
    'luggage',
    'hours',
    'distanceKm',
    'extraChildSeat',
    'extraMeetGreet',
    'extraLuggage',
    'firstName',
    'lastName',
    'email',
    'phone',
    'flightNumber',
    'terminal',
    'specialRequests',
    'amountEur',
    'amountCzk',
    'outboundAmountCzk',
    'returnAmountCzk',
    'returnDiscountPct',
    'promoCode',
    'discountPct',
    'userId',
  ].sort()

  async function priceOf(bookingData: CheckoutBookingData): Promise<PricedCheckout> {
    const result = await priceCheckout({
      bookingData,
      validated: validOrThrow(bookingData),
      currency: 'eur',
    })
    if (!result.ok) throw new Error(`unexpected pricing failure: ${result.code}`)
    return result
  }

  it('returns exactly the legacy allow-listed key set, all string values', async () => {
    const bookingData = makeBookingData({ unexpectedClientKey: 'must not leak' })
    const meta = buildCheckoutMeta({
      bookingData,
      priced: await priceOf(bookingData),
      bookingReference: 'PRG-20260403-0001',
      returnBookingReference: '',
      authenticatedUserId: null,
    })
    expect(Object.keys(meta).sort()).toEqual(LEGACY_KEYS)
    expect(Object.values(meta).every((v) => typeof v === 'string')).toBe(true)
    expect(meta.bookingReference).toBe('PRG-20260403-0001')
    expect(meta.userId).toBe('')
    expect(meta.phone).toBe('+420725986855')
  })

  it('carries the server-computed amounts and the authenticated user id', async () => {
    const bookingData = makeBookingData({ amountEur: '1' })
    const priced = await priceOf(bookingData)
    const meta = buildCheckoutMeta({
      bookingData,
      priced,
      bookingReference: 'PRG-1',
      returnBookingReference: '',
      authenticatedUserId: 'user-123',
    })
    expect(meta.amountEur).toBe(String(priced.combined.finalTotalEur))
    expect(meta.amountCzk).toBe(String(priced.combined.finalTotalCzk))
    expect(meta.returnDiscountPct).toBe('10')
    expect(meta.userId).toBe('user-123')
  })

  it('clamps a 600-character originAddress to 500 characters', async () => {
    const bookingData = makeBookingData({ originAddress: 'a'.repeat(600) })
    const meta = buildCheckoutMeta({
      bookingData,
      priced: await priceOf(bookingData),
      bookingReference: 'PRG-1',
      returnBookingReference: '',
      authenticatedUserId: null,
    })
    expect(meta.originAddress).toHaveLength(500)
  })

  it('normalises the locale through the allow-list ("xx" -> "en")', async () => {
    const bookingData = makeBookingData({ locale: 'xx' })
    const meta = buildCheckoutMeta({
      bookingData,
      priced: await priceOf(bookingData),
      bookingReference: 'PRG-1',
      returnBookingReference: '',
      authenticatedUserId: null,
    })
    expect(meta.locale).toBe('en')
  })
})
