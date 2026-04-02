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

import { GET } from '@/app/api/admin/bookings/route'

function makeRequest(url?: string): Request {
  return new Request(url ?? 'http://localhost/api/admin/bookings', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
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
