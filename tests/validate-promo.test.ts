import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories
const { supabaseServiceStub } = vi.hoisted(() => {
  const supabaseServiceStub = {
    from: vi.fn(),
  }
  return { supabaseServiceStub }
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

import { GET } from '@/app/api/validate-promo/route'

function makeGetRequest(url: string): Request {
  return new Request(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/validate-promo', () => {
  it('Test 1: valid active code returns { valid: true, discountPct }', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({
      data: { discount_value: 15, max_uses: 100, current_uses: 5 },
      error: null,
    })
    const orFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eqIsActiveFn = vi.fn().mockReturnValue({ or: orFn })
    const eqCodeFn = vi.fn().mockReturnValue({ eq: eqIsActiveFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqCodeFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeGetRequest('http://localhost/api/validate-promo?code=SUMMER20'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ valid: true, discountPct: 15 })
  })

  it('Test 2: expired/inactive code returns { valid: false, error: "Code not found, expired, or inactive." }', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    })
    const orFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eqIsActiveFn = vi.fn().mockReturnValue({ or: orFn })
    const eqCodeFn = vi.fn().mockReturnValue({ eq: eqIsActiveFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqCodeFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeGetRequest('http://localhost/api/validate-promo?code=EXPIRED'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ valid: false, error: 'Code not found, expired, or inactive.' })
  })

  it('Test 3: exhausted code (current_uses >= max_uses) returns { valid: false, error: "...usage limit." }', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({
      data: { discount_value: 10, max_uses: 10, current_uses: 10 },
      error: null,
    })
    const orFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eqIsActiveFn = vi.fn().mockReturnValue({ or: orFn })
    const eqCodeFn = vi.fn().mockReturnValue({ eq: eqIsActiveFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqCodeFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeGetRequest('http://localhost/api/validate-promo?code=MAXED'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ valid: false, error: 'This promo code has reached its usage limit.' })
  })

  it('Test 4: missing code param returns { valid: false, error: "No code provided." }', async () => {
    const res = await GET(makeGetRequest('http://localhost/api/validate-promo'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ valid: false, error: 'No code provided.' })
  })
})
