import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseAuthStub, supabaseServiceStub, revalidateTagMock, revalidatePathMock } = vi.hoisted(() => {
  const supabaseAuthStub = {
    auth: {
      getUser: vi.fn(),
    },
  }

  const supabaseServiceStub = {
    from: vi.fn(),
  }

  const revalidateTagMock = vi.fn()
  const revalidatePathMock = vi.fn()

  return { supabaseAuthStub, supabaseServiceStub, revalidateTagMock, revalidatePathMock }
})

// Mock @/lib/supabase/server — createClient returns supabaseAuthStub
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
}))

// Mock @/lib/supabase — createSupabaseServiceClient returns supabaseServiceStub
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

// Mock next/cache — revalidateTag + revalidatePath + unstable_cache
vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
  revalidatePath: revalidatePathMock,
  unstable_cache: vi.fn((fn: () => unknown) => fn),
}))

import { GET, PUT } from '@/app/api/admin/promo/route'

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/admin/promo', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

const adminUser = { id: 'u1', app_metadata: { is_admin: true } }
const nonAdminUser = { id: 'u2', app_metadata: {} }
const validPutBody = { active: true, regularPriceEur: 69, promoPriceEur: 59 }
const invalidPutBody = { active: true, regularPriceEur: 69, promoPriceEur: 80 } // promo > regular

beforeEach(() => {
  vi.clearAllMocks()

  // Default: unauthenticated
  supabaseAuthStub.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'No session' },
  })

  // Default from() chain for promo queries
  supabaseServiceStub.from.mockImplementation(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: {
              airport_promo_active: true,
              airport_regular_price_eur: 69,
              airport_promo_price_eur: 59,
            },
            error: null,
          })
        ),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    })),
  }))
})

describe('/api/admin/promo', () => {
  it('GET returns 401 when unauthenticated', async () => {
    const res = await GET()
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json).toHaveProperty('error', 'Unauthorized')
  })

  it('GET returns 403 when authenticated but not admin', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: nonAdminUser },
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json).toHaveProperty('error', 'Forbidden')
  })

  it('GET returns 200 with active/regularPriceEur/promoPriceEur for admin', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: adminUser },
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({
      active: true,
      regularPriceEur: 69,
      promoPriceEur: 59,
    })
  })

  it('PUT returns 401 when unauthenticated', async () => {
    const res = await PUT(makeRequest('PUT', validPutBody))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json).toHaveProperty('error', 'Unauthorized')
  })

  it('PUT returns 403 when authenticated but not admin', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: nonAdminUser },
      error: null,
    })

    const res = await PUT(makeRequest('PUT', validPutBody))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json).toHaveProperty('error', 'Forbidden')
  })

  it('PUT returns 400 for invalid body', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: adminUser },
      error: null,
    })

    const res = await PUT(makeRequest('PUT', { active: true, regularPriceEur: 'abc' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('error', 'Invalid payload')
    expect(json).toHaveProperty('issues')
  })

  it('PUT returns 422 when promo > regular', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: adminUser },
      error: null,
    })

    const res = await PUT(makeRequest('PUT', invalidPutBody))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain('Promo price must not exceed regular price.')
  })

  it('PUT returns 200 and calls revalidatePath 3 times on success', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: adminUser },
      error: null,
    })

    const res = await PUT(makeRequest('PUT', validPutBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('ok', true)

    expect(revalidatePathMock).toHaveBeenCalledTimes(3)
    expect(revalidatePathMock).toHaveBeenCalledWith('/services/airport-transfer')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
    expect(revalidatePathMock).toHaveBeenCalledWith('/services')
  })
})
