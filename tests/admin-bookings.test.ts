import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseAuthStub, supabaseServiceStub } = vi.hoisted(() => {
  const supabaseAuthStub = {
    auth: {
      getUser: vi.fn(),
    },
  }

  const supabaseServiceStub = {
    from: vi.fn(),
    rpc: vi.fn(),
  }

  return { supabaseAuthStub, supabaseServiceStub }
})

const { stripeRefundsStub, MockStripeInvalidRequestError } = vi.hoisted(() => {
  const create = vi.fn()

  class MockStripeInvalidRequestError extends Error {
    type = 'StripeInvalidRequestError'
    constructor(message: string) {
      super(message)
      this.name = 'StripeInvalidRequestError'
    }
  }

  return { stripeRefundsStub: { create }, MockStripeInvalidRequestError }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

vi.mock('@/lib/booking-reference', () => ({
  generateBookingReference: vi.fn(() => 'PRG-20260403-AB12CD'),
}))

vi.mock('@/lib/currency', () => ({
  czkToEur: vi.fn((czk: number) => Math.round(czk * 0.04)),
  eurToCzk: vi.fn((_eur: number) => 1500),
}))

vi.mock('@/lib/server-pricing', () => ({
  computeOutboundLegTotal: vi.fn(() => 60),
}))

vi.mock('@/lib/extras', () => ({
  computeExtrasTotal: vi.fn(() => 0),
}))

vi.mock('stripe', () => {
  const MockStripeDefault = function MockStripe() {
    return { refunds: stripeRefundsStub }
  } as unknown as { (...args: unknown[]): unknown; errors: { StripeInvalidRequestError: typeof MockStripeInvalidRequestError } }
  MockStripeDefault.errors = { StripeInvalidRequestError: MockStripeInvalidRequestError }
  return { default: MockStripeDefault }
})

import { GET, PATCH, POST } from '@/app/api/admin/bookings/route'
import { POST as CANCEL_POST } from '@/app/api/admin/bookings/cancel/route'

function makeRequest(url?: string): Request {
  return new Request(url ?? 'http://localhost/api/admin/bookings', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

function makePatchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCancelRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}


const validPostPayload = {
  trip_type: 'transfer',
  pickup_date: '2026-04-10',
  pickup_time: '14:00',
  origin_address: 'Prague Airport Terminal 1',
  destination_address: 'Hotel Four Seasons Prague',
  vehicle_class: 'business',
  passengers: 2,
  luggage: 3,
  // amount_czk matches eurToCzk mock return value (1500) so price check passes
  amount_czk: 1500,
  distance_km: 20,
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'jan@example.com',
  client_phone: '+420600123456',
}

beforeEach(() => {
  vi.resetAllMocks()

  // Default to admin user
  supabaseAuthStub.auth.getUser.mockResolvedValue({
    data: { user: { id: '1', app_metadata: { is_admin: true } } },
    error: null,
  })

  // Default rpc: returns empty result set (used by GET handler via admin_search_bookings)
  supabaseServiceStub.rpc.mockResolvedValue({
    data: [{ rows: [], total_count: 0 }],
    error: null,
  })

  // Default from() chain: fully chainable so ancillary calls
  // (pricing_globals, email_log) don't throw in PATCH/POST tests.
  const makeChainable = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {}
    const chainFn = () => chain
    chain.select   = vi.fn(chainFn)
    chain.insert   = vi.fn(chainFn)
    chain.update   = vi.fn(chainFn)
    chain.upsert   = vi.fn(chainFn)
    chain.delete   = vi.fn(chainFn)
    chain.eq       = vi.fn(chainFn)
    chain.neq      = vi.fn(chainFn)
    chain.gte      = vi.fn(chainFn)
    chain.lte      = vi.fn(chainFn)
    chain.or       = vi.fn(chainFn)
    chain.order    = vi.fn(chainFn)
    chain.range    = vi.fn(() => Promise.resolve({ data: [], count: 0, error: null }))
    chain.limit    = vi.fn(chainFn)
    chain.single   = vi.fn(() => Promise.resolve({ data: null, error: null }))
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    // Make the chain itself thenable so `await supabase.from(...).insert(...)` resolves
    chain.then     = undefined
    return chain
  }
  supabaseServiceStub.from.mockImplementation(() => makeChainable())
})

describe('/api/admin/bookings', () => {
  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '2', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 200 with { bookings, total, page, limit } for admin', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ bookings: [], total: 0, page: 0, limit: 20 })
  })

  it('Test 4: page=1&limit=5 passes p_offset=5, p_limit=5 to rpc', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?page=1&limit=5'))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_offset: 5, p_limit: 5 }),
    )
  })

  it('Test 5: search=Smith passes p_query="Smith" to rpc', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?search=Smith'))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_query: 'Smith' }),
    )
  })

  it('Test 6: tripType=hourly passes p_trip_type="hourly" to rpc', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?tripType=hourly'))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_trip_type: 'hourly' }),
    )
  })

  it('Test 7: GET calls rpc("admin_search_bookings") with all expected params', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-uid', app_metadata: { is_admin: true } } },
      error: null,
    })

    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [{ id: 'b1', booking_reference: 'PRG-20260401-AA00BB' }], total_count: 1 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?page=0&limit=20'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ total: 1, page: 0, limit: 20 })
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_offset: 0, p_limit: 20, p_query: null }),
    )
  })
})

describe('PATCH /api/admin/bookings', () => {
  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '2', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 200 for valid transition (pending -> confirmed)', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'pending' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectChainFn })
      .mockReturnValueOnce({ update: updateFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })
  })

  it('Test 4: returns 422 for invalid transition (completed -> pending)', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'completed' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectChainFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'pending' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot transition from 'completed' to 'pending'")
  })

  it('Test 5: returns 422 for invalid transition (cancelled -> confirmed)', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'cancelled' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectChainFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot transition from 'cancelled' to 'confirmed'")
  })

  it('Test 6: returns 404 when booking not found', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectChainFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(404)
  })

  it('Test 7: returns 400 when neither status nor operator_notes provided', async () => {
    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(400)
  })

  it('Test 8: returns 200 for operator_notes update (no status)', async () => {
    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ update: updateFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', operator_notes: 'VIP client' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })
  })
})

describe('POST /api/admin/bookings', () => {
  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await POST(makePostRequest(validPostPayload))
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '2', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await POST(makePostRequest(validPostPayload))
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 400 when required fields missing (no trip_type)', async () => {
    const { trip_type: _omitted, ...payloadWithoutTripType } = validPostPayload
    const res = await POST(makePostRequest(payloadWithoutTripType))
    expect(res.status).toBe(400)
  })

  it('Test 4: returns 400 when amount_czk is zero or negative', async () => {
    const res = await POST(makePostRequest({ ...validPostPayload, amount_czk: 0 }))
    expect(res.status).toBe(400)
  })

  it('Test 5: returns 201 with { booking } for valid payload and correct DB fields', async () => {
    // getPricingConfig() calls pricing_config then pricing_globals in Promise.all
    const pricingConfigSelectFn = vi.fn().mockResolvedValue({
      data: [{ vehicle_class: 'business', rate_per_km: '2', hourly_rate: '50', daily_rate: '400', min_fare: '100' }],
      error: null,
    })
    const pricingGlobalsSingleFn = vi.fn().mockResolvedValue({
      data: {
        airport_fee: '200', night_coefficient: '1.2', holiday_coefficient: '1.5',
        extra_child_seat: '10', extra_meet_greet: '15', extra_luggage: '10',
        holiday_dates: [], return_discount_percent: '10',
        hourly_min_hours: '2', hourly_max_hours: '8', notification_flags: null,
      },
      error: null,
    })
    const pricingGlobalsEqFn = vi.fn().mockReturnValue({ single: pricingGlobalsSingleFn })
    const pricingGlobalsSelectFn = vi.fn().mockReturnValue({ eq: pricingGlobalsEqFn })

    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: pricingConfigSelectFn })
      .mockReturnValueOnce({ select: pricingGlobalsSelectFn })
      .mockReturnValue({ insert: insertFn })

    const res = await POST(makePostRequest(validPostPayload))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('booking')
    expect(json.booking).toMatchObject({ id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' })

    // Verify insert was called with correct booking_source, payment_intent_id, status, booking_type
    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          booking_source: 'manual',
          payment_intent_id: null,
          status: 'pending',
          booking_type: 'confirmed',
        }),
      ])
    )
  })

  it('Test 6: POST generates booking_reference matching PRG-YYYYMMDD-XXXX pattern', async () => {
    // getPricingConfig() calls pricing_config then pricing_globals in Promise.all
    const pricingConfigSelectFn = vi.fn().mockResolvedValue({
      data: [{ vehicle_class: 'business', rate_per_km: '2', hourly_rate: '50', daily_rate: '400', min_fare: '100' }],
      error: null,
    })
    const pricingGlobalsSingleFn = vi.fn().mockResolvedValue({
      data: {
        airport_fee: '200', night_coefficient: '1.2', holiday_coefficient: '1.5',
        extra_child_seat: '10', extra_meet_greet: '15', extra_luggage: '10',
        holiday_dates: [], return_discount_percent: '10',
        hourly_min_hours: '2', hourly_max_hours: '8', notification_flags: null,
      },
      error: null,
    })
    const pricingGlobalsEqFn = vi.fn().mockReturnValue({ single: pricingGlobalsSingleFn })
    const pricingGlobalsSelectFn = vi.fn().mockReturnValue({ eq: pricingGlobalsEqFn })

    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: pricingConfigSelectFn })
      .mockReturnValueOnce({ select: pricingGlobalsSelectFn })
      .mockReturnValue({ insert: insertFn })

    await POST(makePostRequest(validPostPayload))

    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          booking_reference: expect.stringMatching(/^PRG-\d{8}-[A-F0-9]{6}$/),
        }),
      ])
    )
  })
})

describe('POST /api/admin/bookings/cancel', () => {
  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '2', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 404 when booking not found', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(404)
  })

  it("Test 4: returns 422 when booking status is 'cancelled'", async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'cancelled', payment_intent_id: null }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot cancel a booking with status 'cancelled'")
  })

  it("Test 5: returns 422 when booking status is 'completed'", async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'completed', payment_intent_id: null }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot cancel a booking with status 'completed'")
  })

  it('Test 6: returns 200 and sets status=cancelled for manual booking, stripe NOT called', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'pending', payment_intent_id: null }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })
    expect(stripeRefundsStub.create).not.toHaveBeenCalled()
    expect(updateFn).toHaveBeenCalledWith({ status: 'cancelled' })
  })

  it('Test 7: returns 200 and calls stripe.refunds.create for Stripe-paid booking', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed', payment_intent_id: 'pi_xxx' }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    stripeRefundsStub.create.mockResolvedValue({ id: 're_test123' })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, refund_id: 're_test123' })
    expect(stripeRefundsStub.create).toHaveBeenCalledWith({ payment_intent: 'pi_xxx' })
    expect(updateFn).toHaveBeenCalledWith({ status: 'cancelled' })
  })

  it('Test 8: returns 502 when stripe.refunds.create throws, booking status NOT updated', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'pending', payment_intent_id: 'pi_xxx' }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    stripeRefundsStub.create.mockRejectedValue(new Error('charge_already_refunded'))

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(502)
    // DB update should NOT have been called (only 1 supabase.from call for the select)
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })

  it('Test 9: partial refund with leg=outbound — calls Stripe with per-leg amount + metadata.leg', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_xxx',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
      },
      error: null,
    })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    stripeRefundsStub.create.mockResolvedValue({ id: 're_test123' })

    const res = await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'outbound',
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, refund_id: 're_test123' })
    // czkToEur(5000) = 200 EUR -> 200 * 100 = 20000 cents
    expect(stripeRefundsStub.create).toHaveBeenCalledWith({
      payment_intent: 'pi_xxx',
      amount: 20000,
      metadata: { leg: 'outbound' },
    })
    expect(updateFn).toHaveBeenCalledWith({ status: 'cancelled' })
    // DB update scoped to id, not payment_intent_id
    expect(updateEqFn).toHaveBeenCalledWith('id', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')
  })

  it('Test 10: partial refund with leg=return — uses return_amount_czk', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_yyy',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
      },
      error: null,
    })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    stripeRefundsStub.create.mockResolvedValue({ id: 're_test456' })

    const res = await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'return',
    }))
    expect(res.status).toBe(200)
    // czkToEur(4500) = Math.round(4500 * 0.04) = 180 EUR -> 180 * 100 = 18000 cents
    expect(stripeRefundsStub.create).toHaveBeenCalledWith({
      payment_intent: 'pi_yyy',
      amount: 18000,
      metadata: { leg: 'return' },
    })
  })

  it('Test 11: DB update after partial refund is scoped to id, never payment_intent_id', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_shared_round_trip',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
      },
      error: null,
    })
    const fetchEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: fetchEqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    stripeRefundsStub.create.mockResolvedValue({ id: 're_scope' })

    await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'outbound',
    }))

    // CRITICAL regression guard: the .eq() call on the update chain must use 'id', not 'payment_intent_id'
    const allEqCalls = updateEqFn.mock.calls
    expect(allEqCalls.length).toBeGreaterThan(0)
    for (const call of allEqCalls) {
      expect(call[0]).toBe('id')
      expect(call[0]).not.toBe('payment_intent_id')
    }
  })

  it('Test 12: returns 422 (not 502) when Stripe throws StripeInvalidRequestError (over-refund)', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_overrefund',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
      },
      error: null,
    })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    // Throw the mocked error class so route's instanceof check matches
    const overRefundError = new MockStripeInvalidRequestError('Amount exceeds remaining refundable')
    stripeRefundsStub.create.mockRejectedValue(overRefundError)

    const res = await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'outbound',
    }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('Refund amount exceeds remaining refundable balance. Contact Stripe support.')
    // DB update NOT called — only 1 supabase.from call (the select)
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })

  it('Test 13: returns 422 when leg is present but leg amount column is null', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_missing_amount',
        outbound_amount_czk: null,
        return_amount_czk: null,
      },
      error: null,
    })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'outbound',
    }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('Cannot compute per-leg refund: missing leg amount')
    // Stripe NOT called
    expect(stripeRefundsStub.create).not.toHaveBeenCalled()
    // DB update NOT called — only 1 supabase.from call (the select)
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })
})
