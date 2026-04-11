import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseServiceStub } = vi.hoisted(() => ({
  supabaseServiceStub: { from: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

import { GET } from '@/app/api/hourly-config/route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/hourly-config', () => {
  it('returns configured min/max when DB succeeds', async () => {
    supabaseServiceStub.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({ data: { hourly_min_hours: 3, hourly_max_hours: 6 }, error: null })
      ),
    }))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ min: 3, max: 6 })
  })

  it('returns fallback {min:2,max:8} on DB error', async () => {
    supabaseServiceStub.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({ data: null, error: { message: 'DB down' } })
      ),
    }))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ min: 2, max: 8 })
  })

  it('returns configured min/max for default row (2,8)', async () => {
    supabaseServiceStub.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({ data: { hourly_min_hours: 2, hourly_max_hours: 8 }, error: null })
      ),
    }))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ min: 2, max: 8 })
  })

  it('response body has exactly two keys: min and max', async () => {
    supabaseServiceStub.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({ data: { hourly_min_hours: 2, hourly_max_hours: 8 }, error: null })
      ),
    }))
    const res = await GET()
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['max', 'min'])
  })
})
