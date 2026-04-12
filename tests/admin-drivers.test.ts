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

import { GET, POST } from '@/app/api/admin/drivers/route'
import { PATCH, DELETE } from '@/app/api/admin/drivers/[id]/route'

const mockDriver = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  vehicle_info: 'BMW X5',
  created_at: '2026-01-01T00:00:00Z',
}

const driverId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

function makeGetRequest(): Request {
  return new Request('http://localhost/api/admin/drivers', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatchRequest(id: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/drivers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteRequest(id: string): Request {
  return new Request(`http://localhost/api/admin/drivers/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default to admin user
  supabaseAuthStub.auth.getUser.mockResolvedValue({
    data: { user: { id: '1', app_metadata: { is_admin: true } } },
    error: null,
  })
})

describe('DRIVER-01: GET /api/admin/drivers', () => {
  it('Test 1: returns 401 without auth', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '1', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 200 with driver array when authed as admin', async () => {
    const orderFn = vi.fn().mockResolvedValue({
      data: [mockDriver],
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ order: orderFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('data')
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data).toHaveLength(1)
    expect(json.data[0]).toEqual(mockDriver)
  })
})

describe('DRIVER-01: POST /api/admin/drivers', () => {
  it('Test 4: returns 401 without auth', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await POST(makePostRequest({ name: 'John', email: 'john@example.com' }))
    expect(res.status).toBe(401)
  })

  it('Test 5: returns 400 on invalid payload (missing name)', async () => {
    const res = await POST(makePostRequest({ email: 'john@example.com' }))
    expect(res.status).toBe(400)
  })

  it('Test 6: creates driver — returns 201 with correct fields', async () => {
    const createdDriver = { ...mockDriver }
    const selectFn = vi.fn().mockResolvedValue({
      data: [createdDriver],
      error: null,
    })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })
    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    const res = await POST(
      makePostRequest({
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        vehicle_info: 'BMW X5',
      })
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('data')
  })
})

describe('DRIVER-01: PATCH /api/admin/drivers/[id]', () => {
  it('Test 7: returns 401 without auth', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await PATCH(
      makePatchRequest(driverId, { name: 'Updated' }),
      { params: Promise.resolve({ id: driverId }) }
    )
    expect(res.status).toBe(401)
  })

  it('Test 8: updates driver fields — returns 200', async () => {
    const updatedDriver = { ...mockDriver, name: 'Updated Name' }
    const selectFn = vi.fn().mockResolvedValue({
      data: [updatedDriver],
      error: null,
    })
    const eqFn = vi.fn().mockReturnValue({ select: selectFn })
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValue({ update: updateFn })

    const res = await PATCH(
      makePatchRequest(driverId, { name: 'Updated Name' }),
      { params: Promise.resolve({ id: driverId }) }
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('data')
  })
})

describe('DRIVER-01: DELETE /api/admin/drivers/[id]', () => {
  it('Test 9: returns 401 without auth', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await DELETE(
      makeDeleteRequest(driverId),
      { params: Promise.resolve({ id: driverId }) }
    )
    expect(res.status).toBe(401)
  })

  it('Test 10: returns 409 when driver has active assignment', async () => {
    const limitFn = vi.fn().mockResolvedValue({
      data: [{ id: 'assignment-1' }],
      error: null,
    })
    const inFn = vi.fn().mockReturnValue({ limit: limitFn })
    const eqFn = vi.fn().mockReturnValue({ in: inFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await DELETE(
      makeDeleteRequest(driverId),
      { params: Promise.resolve({ id: driverId }) }
    )

    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/active assignment/i)
  })

  it('Test 11: removes driver — returns 200 with { ok: true }', async () => {
    // First call: assignment check returns empty (no active assignments)
    // Second call: delete the driver
    let callCount = 0
    supabaseServiceStub.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Assignment check
        const limitFn = vi.fn().mockResolvedValue({ data: [], error: null })
        const inFn = vi.fn().mockReturnValue({ limit: limitFn })
        const eqFn = vi.fn().mockReturnValue({ in: inFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else {
        // Delete driver
        const eqFn = vi.fn().mockResolvedValue({ error: null })
        const deleteFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { delete: deleteFn }
      }
    })

    const res = await DELETE(
      makeDeleteRequest(driverId),
      { params: Promise.resolve({ id: driverId }) }
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true })
  })
})
