import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 93 plan 06 (TRIP-04, T-93-15): a tour booking has a fixed catalogue price. The admin PATCH must never
// recompute it with the transfer/hourly/daily pricing engine; a price-affecting edit needs override_price and then
// stores the operator's amount as entered. The dispatch GET accepts trip_type=tour.

const { authGetUser, supabaseFrom, mockComputeOutbound, mockGetPricingConfig } = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  supabaseFrom: vi.fn(),
  mockComputeOutbound: vi.fn(() => 60),
  mockGetPricingConfig: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } } }
})

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    const { data: { user }, error } = await authGetUser()
    if (error || !user) return { user: null, error: '401' as const }
    return { user, error: null }
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: supabaseFrom, rpc: vi.fn() })),
}))

vi.mock('@/lib/booking-stops', () => ({
  loadStopsByBookingIds: vi.fn(async () => new Map()),
  attachStops: vi.fn(async (rows: unknown[]) => rows),
}))

vi.mock('@/lib/currency', () => ({
  czkToEur: vi.fn((czk: number) => Math.round(czk * 0.04)),
  eurToCzk: vi.fn((eur: number) => Math.round(eur * 25)),
}))
vi.mock('@/lib/server-pricing', () => ({ computeOutboundLegTotal: mockComputeOutbound }))
vi.mock('@/lib/pricing-config', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/pricing-config')>()
  return { ...actual, getPricingConfig: mockGetPricingConfig }
})
vi.mock('@/lib/extras', () => ({ computeExtrasTotal: vi.fn(() => 0) }))
vi.mock('@/lib/email-log', () => ({ logEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/email', () => ({
  sendStatusConfirmedEmail: vi.fn(),
  sendBookingChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentRequestEmail: vi.fn(),
}))
vi.mock('@/lib/stripe-payment-links', () => ({
  createBookingPaymentLink: vi.fn(),
  deactivateBookingPaymentLink: vi.fn().mockResolvedValue(undefined),
}))

import { PATCH } from '@/app/api/admin/bookings/route'

const ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

function patchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** A confirmed tour booking (fixed price 5000 CZK / 200 EUR). */
const tourBooking = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID,
  status: 'confirmed',
  booking_source: 'online',
  linked_booking_id: null,
  leg: null,
  payment_intent_id: null,
  trip_type: 'tour',
  pickup_date: '2026-12-20',
  pickup_time: '09:00',
  return_date: null,
  origin_address: 'Prague, Old Town Square',
  destination_address: 'Cesky Krumlov',
  distance_km: null,
  vehicle_class: 'business',
  hours: 10,
  is_airport: false,
  amount_czk: 5000,
  amount_eur: 200,
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'jan@example.com',
  client_phone: '+420600123456',
  flight_number: null,
  special_requests: null,
  operator_notes: null,
  payment_mode: null,
  payment_state: null,
  payment_link_url: null,
  ...over,
})

let selects: Array<Record<string, unknown> | null>
let updates: Array<Record<string, unknown>>

function wire(current: Record<string, unknown>) {
  selects = [current, current]
  updates = []
  supabaseFrom.mockImplementation((table: string) => {
    if (table === 'bookings') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: selects.shift() ?? null, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload)
          return { eq: async () => ({ error: null }) }
        },
      }
    }
    return {
      insert: async () => ({ error: null }),
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', app_metadata: { is_admin: true } } }, error: null })
  mockGetPricingConfig.mockRejectedValue(new Error('pricing config must not be read for a tour'))
})

describe('PATCH admin booking — tour bookings never re-price (T-93-15)', () => {
  it.each([
    ['vehicle class', { vehicle_class: 'first_class', amount_czk: 5000 }],
    ['pickup address', { origin_address: 'Prague Airport', amount_czk: 5000 }],
    ['drop-off address', { destination_address: 'Karlstejn', amount_czk: 5000 }],
    ['distance', { distance_km: 180, amount_czk: 5000 }],
  ])('a %s edit without override_price answers 422 TOUR_PRICE_FIXED and writes nothing', async (_name, edit) => {
    wire(tourBooking())
    const res = await PATCH(patchRequest({ id: ID, ...edit }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      code: 'TOUR_PRICE_FIXED',
      error: 'Tour prices are fixed. Use Override price to change this booking.',
    })
    expect(updates).toHaveLength(0)
    expect(mockComputeOutbound).not.toHaveBeenCalled()
  })

  it('with override_price the operator amount is stored as entered and the engine never runs', async () => {
    wire(tourBooking())
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'business_van', amount_czk: 5400, override_price: true }))
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ vehicle_class: 'business_van', amount_czk: 5400, amount_eur: 216 })
    expect(mockComputeOutbound).not.toHaveBeenCalled()
    expect(mockGetPricingConfig).not.toHaveBeenCalled()
  })

  it('an override within the old non-tour tolerance is still stored exactly as entered', async () => {
    wire(tourBooking())
    const res = await PATCH(patchRequest({ id: ID, origin_address: 'Prague Airport', amount_czk: 5010, override_price: true }))
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ origin_address: 'Prague Airport', amount_czk: 5010 })
    expect(mockComputeOutbound).not.toHaveBeenCalled()
  })

  it('a pickup date edit alone does not touch the price and is not refused', async () => {
    wire(tourBooking())
    const res = await PATCH(patchRequest({ id: ID, pickup_date: '2026-12-22' }))
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ pickup_date: '2026-12-22' })
    expect(updates[0]).not.toHaveProperty('amount_czk')
    expect(mockComputeOutbound).not.toHaveBeenCalled()
  })

  it('operator_notes on a tour booking works as before', async () => {
    wire(tourBooking())
    const res = await PATCH(patchRequest({ id: ID, operator_notes: 'Driver speaks German' }))
    expect(res.status).toBe(200)
    expect(mockComputeOutbound).not.toHaveBeenCalled()
  })

  it('a non-tour booking is still re-priced by the engine (guard is tour-only)', async () => {
    mockGetPricingConfig.mockResolvedValue({ globals: { extraChildSeat: 0, extraLuggage: 0 } })
    wire(tourBooking({ trip_type: 'transfer', distance_km: 20 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 1500 }))
    expect(mockComputeOutbound).toHaveBeenCalledTimes(1)
    expect([200, 422]).toContain(res.status)
  })
})
