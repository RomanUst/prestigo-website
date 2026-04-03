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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

vi.mock('@/lib/booking-reference', () => ({
  generateBookingReference: vi.fn(() => 'PRG-20260403-1234'),
}))

vi.mock('@/lib/currency', () => ({
  czkToEur: vi.fn((czk: number) => Math.round(czk * 0.04)),
}))

import { GET, PATCH, POST } from '@/app/api/admin/bookings/route'

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
      data: { id: 'test-id', booking_reference: 'PRG-20260403-1234' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })
    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    const res = await POST(makePostRequest(validPostPayload))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('booking')
    expect(json.booking).toMatchObject({ id: 'test-id', booking_reference: 'PRG-20260403-1234' })

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
      data: { id: 'test-id', booking_reference: 'PRG-20260403-1234' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })
    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    await POST(makePostRequest(validPostPayload))

    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          booking_reference: expect.stringMatching(/^PRG-\d{8}-\d{4}$/),
        }),
      ])
    )
  })
})
