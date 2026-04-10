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

function makeQueryChain(overrides: {
  rangeFn?: ReturnType<typeof vi.fn>
  orFn?: ReturnType<typeof vi.fn>
  eqFn?: ReturnType<typeof vi.fn>
  gteFn?: ReturnType<typeof vi.fn>
  lteFn?: ReturnType<typeof vi.fn>
} = {}) {
  const rangeFn = overrides.rangeFn ?? vi.fn().mockReturnValue(Promise.resolve({ data: [], count: 0, error: null }))
  const orFn = overrides.orFn ?? vi.fn().mockReturnValue({ range: rangeFn })
  const eqFn = overrides.eqFn ?? vi.fn().mockReturnValue({ range: rangeFn, or: orFn })
  const lteFn = overrides.lteFn ?? vi.fn().mockReturnValue({ range: rangeFn, eq: eqFn, or: orFn })
  const gteFn = overrides.gteFn ?? vi.fn().mockReturnValue({ range: rangeFn, lte: lteFn, eq: eqFn, or: orFn })
  const orderFn = vi.fn().mockReturnValue({ range: rangeFn, gte: gteFn, lte: lteFn, eq: eqFn, or: orFn })
  const selectFn = vi.fn().mockReturnValue({ order: orderFn, range: rangeFn, gte: gteFn, lte: lteFn, eq: eqFn, or: orFn })

  return { selectFn, orderFn, rangeFn, orFn, eqFn, gteFn, lteFn }
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
  amount_czk: 1500,
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'jan@example.com',
  client_phone: '+420600123456',
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default to admin user
  supabaseAuthStub.auth.getUser.mockResolvedValue({
    data: { user: { id: '1', app_metadata: { is_admin: true } } },
    error: null,
  })

  // Default chain: returns empty bookings
  const { selectFn } = makeQueryChain()
  supabaseServiceStub.from.mockReturnValue({ select: selectFn })
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
    const rangeFn = vi.fn().mockReturnValue(Promise.resolve({ data: [], count: 0, error: null }))
    const orderFn = vi.fn().mockReturnValue({ range: rangeFn })
    const selectFn = vi.fn().mockReturnValue({ order: orderFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ bookings: [], total: 0, page: 0, limit: 20 })
  })

  it('Test 4: page=1&limit=5 calls .range(5, 9)', async () => {
    const rangeFn = vi.fn().mockReturnValue(Promise.resolve({ data: [], count: 0, error: null }))
    const orderFn = vi.fn().mockReturnValue({ range: rangeFn })
    const selectFn = vi.fn().mockReturnValue({ order: orderFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?page=1&limit=5'))
    expect(res.status).toBe(200)
    expect(rangeFn).toHaveBeenCalledWith(5, 9)
  })

  it('Test 5: search=Smith calls .or() with ilike pattern', async () => {
    const rangeFn = vi.fn().mockReturnValue(Promise.resolve({ data: [], count: 0, error: null }))
    const orFn = vi.fn().mockReturnValue({ range: rangeFn })
    const orderFn = vi.fn().mockReturnValue({ range: rangeFn, or: orFn })
    const selectFn = vi.fn().mockReturnValue({ order: orderFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?search=Smith'))
    expect(res.status).toBe(200)
    expect(orFn).toHaveBeenCalledWith(expect.stringContaining('ilike.%Smith%'))
  })

  it('Test 6: tripType=hourly calls .eq("trip_type", "hourly")', async () => {
    const rangeFn = vi.fn().mockReturnValue(Promise.resolve({ data: [], count: 0, error: null }))
    const eqFn = vi.fn().mockReturnValue({ range: rangeFn })
    const orderFn = vi.fn().mockReturnValue({ range: rangeFn, eq: eqFn })
    const selectFn = vi.fn().mockReturnValue({ order: orderFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?tripType=hourly'))
    expect(res.status).toBe(200)
    expect(eqFn).toHaveBeenCalledWith('trip_type', 'hourly')
  })

  it('Test 7: GET select string includes linked_booking join for RTAD-02 paired-reference', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-uid', app_metadata: { is_admin: true } } },
      error: null,
    })

    // Build a proper chain with order (required by the GET handler after select)
    const rangeFn = vi.fn().mockResolvedValue({ data: [], count: 0, error: null })
    const orderFn = vi.fn().mockReturnValue({ range: rangeFn, gte: vi.fn().mockReturnValue({ range: rangeFn }), lte: vi.fn().mockReturnValue({ range: rangeFn }), eq: vi.fn().mockReturnValue({ range: rangeFn }), or: vi.fn().mockReturnValue({ range: rangeFn }) })
    const captureFn = vi.fn().mockReturnValue({ order: orderFn })
    supabaseServiceStub.from.mockReturnValueOnce({ select: captureFn })

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)

    // Assert the select string contains both '*' and the linked_booking join
    expect(captureFn).toHaveBeenCalledTimes(1)
    const selectArg = captureFn.mock.calls[0][0] as string
    expect(selectArg).toContain('*')
    expect(selectArg).toContain('linked_booking:linked_booking_id(booking_reference)')
    // count: 'exact' option preserved
    const selectOpts = captureFn.mock.calls[0][1]
    expect(selectOpts).toMatchObject({ count: 'exact' })
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
    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })
    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

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
    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })
    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

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
