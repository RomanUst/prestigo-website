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

// D-07: mocked (not the real in-memory limiter) so the RATE_LIMITED-code test
// below is deterministic and unaffected by the shared in-memory store's state
// across the rest of this file's test runs.
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, limit: 100 }),
  getClientIp: vi.fn(() => '127.0.0.1'),
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

  it('Test 2: expired/inactive code returns uniform { valid: false, error: "Invalid or unavailable code." } (SEC-12 anti-enumeration)', async () => {
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
    expect(json).toEqual({ valid: false, error: 'Invalid or unavailable code.', code: 'PROMO_INVALID' })
  })

  it('Test 3: exhausted code (current_uses >= max_uses) returns uniform { valid: false, error: "Invalid or unavailable code." } (SEC-12 anti-enumeration)', async () => {
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
    expect(json).toEqual({ valid: false, error: 'Invalid or unavailable code.', code: 'PROMO_INVALID' })
  })

  it('Test 4: missing code param returns { valid: false, error: "No code provided." }', async () => {
    const res = await GET(makeGetRequest('http://localhost/api/validate-promo'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ valid: false, error: 'No code provided.', code: 'NO_CODE' })
  })
})

describe('D-07: validate-promo error responses carry a stable machine code', () => {
  it('missing code param -> code NO_CODE', async () => {
    const res = await GET(makeGetRequest('http://localhost/api/validate-promo'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.code).toBe('NO_CODE')
  })

  it('invalid/exhausted code -> code PROMO_INVALID, English error text unchanged', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const orFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eqIsActiveFn = vi.fn().mockReturnValue({ or: orFn })
    const eqCodeFn = vi.fn().mockReturnValue({ eq: eqIsActiveFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqCodeFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeGetRequest('http://localhost/api/validate-promo?code=EXPIRED'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.code).toBe('PROMO_INVALID')
    expect(json.error).toBe('Invalid or unavailable code.')
  })

  it('DB error -> code INTERNAL', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: new Error('db down') })
    const orFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eqIsActiveFn = vi.fn().mockReturnValue({ or: orFn })
    const eqCodeFn = vi.fn().mockReturnValue({ eq: eqIsActiveFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqCodeFn })
    supabaseServiceStub.from.mockReturnValue({ select: selectFn })

    const res = await GET(makeGetRequest('http://localhost/api/validate-promo?code=ANYTHING'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.code).toBe('INTERNAL')
  })

  it('rate limited -> code RATE_LIMITED', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit')
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 10 })
    const res = await GET(makeGetRequest('http://localhost/api/validate-promo?code=ANY'))
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.code).toBe('RATE_LIMITED')
  })
})
