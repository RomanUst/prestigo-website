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

import { GET, POST, PATCH, DELETE } from '@/app/api/admin/promo-codes/route'

function makeGetRequest(url?: string): Request {
  return new Request(url ?? 'http://localhost/api/admin/promo-codes', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/promo-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/promo-codes', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteRequest(id?: string): Request {
  const url = id
    ? `http://localhost/api/admin/promo-codes?id=${id}`
    : 'http://localhost/api/admin/promo-codes'
  return new Request(url, {
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

describe('POST /api/admin/promo-codes', () => {
  it('Test 1: creates promo code — returns 201 and insert called with correct data', async () => {
    const selectFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        code: 'SUMMER20',
        discount_value: 15,
        is_active: true,
      },
      error: null,
    })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })
    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    const res = await POST(
      makePostRequest({
        code: 'SUMMER20',
        discount_value: 15,
        expiry_date: '2026-12-31',
        max_uses: 100,
      })
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('data')

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SUMMER20',
        discount_value: 15,
        is_active: true,
      })
    )
  })

  it('Test 2: duplicate code returns 400 with "Code already exists."', async () => {
    const selectFn = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })
    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    const res = await POST(
      makePostRequest({
        code: 'SUMMER20',
        discount_value: 15,
      })
    )

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Code already exists.')
  })

  it('Test 3: POST without auth returns 401', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await POST(
      makePostRequest({ code: 'SUMMER20', discount_value: 15 })
    )
    expect(res.status).toBe(401)
  })
})

describe('GET /api/admin/promo-codes', () => {
  it('Test 4: returns 200 with array of promo codes', async () => {
    const orderFn = vi.fn().mockResolvedValue({
      data: [
        { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', code: 'SUMMER20', discount_value: 15, is_active: true },
      ],
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ order: orderFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data).toHaveLength(1)
  })
})

describe('PATCH /api/admin/promo-codes', () => {
  it('Test 5: deactivates promo — returns 200 and calls .update with is_active false', async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValue({ update: updateFn })

    const res = await PATCH(
      makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', is_active: false })
    )

    expect(res.status).toBe(200)
    expect(updateFn).toHaveBeenCalledWith({ is_active: false })
  })
})

describe('DELETE /api/admin/promo-codes', () => {
  it('Test 6: deletes promo code — returns 200 and calls .delete', async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: null })
    const deleteFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValue({ delete: deleteFn })

    const res = await DELETE(makeDeleteRequest('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'))
    expect(res.status).toBe(200)
    expect(deleteFn).toHaveBeenCalled()
  })

  it('Test 7: DELETE without id returns 400', async () => {
    const res = await DELETE(makeDeleteRequest())
    expect(res.status).toBe(400)
  })
})
