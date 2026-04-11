import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseAuthStub, supabaseServiceStub, revalidateTagMock } = vi.hoisted(() => {
  const supabaseAuthStub = {
    auth: {
      getUser: vi.fn(),
    },
  }

  const supabaseServiceStub = {
    from: vi.fn(),
  }

  const revalidateTagMock = vi.fn()

  return { supabaseAuthStub, supabaseServiceStub, revalidateTagMock }
})

// Mock @/lib/supabase/server — createClient returns supabaseAuthStub
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
}))

// Mock @/lib/supabase — createSupabaseServiceClient returns supabaseServiceStub
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

// Mock next/cache — revalidateTag as vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
  unstable_cache: vi.fn((fn: () => unknown) => fn),
}))

import { GET, PUT } from '@/app/api/admin/pricing/route'

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/admin/pricing', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

const validPutBody = {
  config: [
    { vehicle_class: 'business', rate_per_km: 3.00, hourly_rate: 60, daily_rate: 350, min_fare: 0 },
    { vehicle_class: 'first_class', rate_per_km: 4.50, hourly_rate: 90, daily_rate: 500, min_fare: 0 },
    { vehicle_class: 'business_van', rate_per_km: 3.80, hourly_rate: 75, daily_rate: 420, min_fare: 0 },
  ],
  globals: {
    airport_fee: 10,
    night_coefficient: 1.2,
    holiday_coefficient: 1.5,
    extra_child_seat: 20,
    extra_meet_greet: 30,
    extra_luggage: 25,
    return_discount_percent: 10,
    holiday_dates: [],
    hourly_min_hours: 2,
    hourly_max_hours: 8,
  },
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default: unauthenticated
  supabaseAuthStub.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'No session' },
  })

  // Default from() chain: select, eq, single, upsert all succeed
  supabaseServiceStub.from.mockImplementation(() => ({
    select: vi.fn(() => Promise.resolve({ data: [], error: null })),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    upsert: vi.fn(() => Promise.resolve({ error: null })),
  }))
})

describe('/api/admin/pricing', () => {
  describe('Auth guard', () => {
    it('returns 401 when getUser returns no session', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'No session' },
      })

      const res = await GET(makeRequest('GET'))
      expect(res.status).toBe(401)
    })

    it('returns 403 when user is not admin (is_admin missing from app_metadata)', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: { id: '1', app_metadata: {} } },
        error: null,
      })

      const res = await GET(makeRequest('GET'))
      expect(res.status).toBe(403)
    })
  })

  describe('GET', () => {
    it('returns 200 with { config, globals } for admin user', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: { id: '1', app_metadata: { is_admin: true } } },
        error: null,
      })

      const configData = [
        { vehicle_class: 'business', rate_per_km: '2.80', hourly_rate: '55.00', daily_rate: '320.00' },
      ]
      const globalsData = {
        id: 1,
        airport_fee: '0.00',
        night_coefficient: '1.0000',
        holiday_coefficient: '1.0000',
        extra_child_seat: '15.00',
        extra_meet_greet: '25.00',
        extra_luggage: '20.00',
      }

      supabaseServiceStub.from.mockImplementation((table: string) => {
        if (table === 'pricing_config') {
          return {
            select: vi.fn(() => Promise.resolve({ data: configData, error: null })),
          }
        }
        if (table === 'pricing_globals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: globalsData, error: null })),
              })),
            })),
          }
        }
      })

      const res = await GET(makeRequest('GET'))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toHaveProperty('config')
      expect(json).toHaveProperty('globals')
    })
  })

  describe('PUT', () => {
    beforeEach(() => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: { id: '1', app_metadata: { is_admin: true } } },
        error: null,
      })
    })

    it('returns 400 when body is missing required fields', async () => {
      const res = await PUT(makeRequest('PUT', { config: [] }))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json).toHaveProperty('issues')
    })

    it('calls upsert on pricing_config and pricing_globals with valid body', async () => {
      const configUpsert = vi.fn(() => Promise.resolve({ error: null }))
      const globalsUpsert = vi.fn(() => Promise.resolve({ error: null }))

      supabaseServiceStub.from.mockImplementation((table: string) => {
        if (table === 'pricing_config') return { upsert: configUpsert }
        if (table === 'pricing_globals') return { upsert: globalsUpsert }
      })

      const res = await PUT(makeRequest('PUT', validPutBody))
      expect(res.status).toBe(200)
      expect(configUpsert).toHaveBeenCalledWith(validPutBody.config)
      expect(globalsUpsert).toHaveBeenCalledWith(
        { id: 1, ...validPutBody.globals },
        { onConflict: 'id' }
      )
    })

    it('calls revalidateTag("pricing-config") after successful upsert', async () => {
      supabaseServiceStub.from.mockImplementation(() => ({
        upsert: vi.fn(() => Promise.resolve({ error: null })),
      }))

      await PUT(makeRequest('PUT', validPutBody))
      expect(revalidateTagMock).toHaveBeenCalledWith('pricing-config', 'max')
    })

    it('returns 500 when DB upsert returns error', async () => {
      supabaseServiceStub.from.mockImplementation((table: string) => {
        if (table === 'pricing_config') {
          return { upsert: vi.fn(() => Promise.resolve({ error: { message: 'DB error' } })) }
        }
        if (table === 'pricing_globals') {
          return { upsert: vi.fn(() => Promise.resolve({ error: null })) }
        }
      })

      const res = await PUT(makeRequest('PUT', validPutBody))
      expect(res.status).toBe(500)
    })

    describe('PRICING-07 + PRICING-08: Extended PUT payload', () => {
      it('returns 200 when holiday_dates and min_fare per class are provided', async () => {
        const configUpsert = vi.fn(() => Promise.resolve({ error: null }))
        const globalsUpsert = vi.fn(() => Promise.resolve({ error: null }))

        supabaseServiceStub.from.mockImplementation((table: string) => {
          if (table === 'pricing_config') return { upsert: configUpsert }
          if (table === 'pricing_globals') return { upsert: globalsUpsert }
        })

        const bodyWithNewFields = {
          config: [
            { vehicle_class: 'business', rate_per_km: 3.00, hourly_rate: 60, daily_rate: 350, min_fare: 15 },
            { vehicle_class: 'first_class', rate_per_km: 4.50, hourly_rate: 90, daily_rate: 500, min_fare: 15 },
            { vehicle_class: 'business_van', rate_per_km: 3.80, hourly_rate: 75, daily_rate: 420, min_fare: 15 },
          ],
          globals: {
            airport_fee: 10,
            night_coefficient: 1.2,
            holiday_coefficient: 1.5,
            extra_child_seat: 20,
            extra_meet_greet: 30,
            extra_luggage: 25,
            return_discount_percent: 10,
            holiday_dates: ['2026-12-25', '2026-12-31'],
            hourly_min_hours: 2,
            hourly_max_hours: 8,
          },
        }

        const res = await PUT(makeRequest('PUT', bodyWithNewFields))
        expect(res.status).toBe(200)
        expect(configUpsert).toHaveBeenCalledWith(bodyWithNewFields.config)
        expect(globalsUpsert).toHaveBeenCalledWith(
          { id: 1, ...bodyWithNewFields.globals },
          { onConflict: 'id' }
        )
      })

      it('returns 400 when holiday_dates contains invalid date format', async () => {
        const invalidBody = {
          ...validPutBody,
          globals: {
            ...validPutBody.globals,
            holiday_dates: ['25-12-2026'], // wrong format — should be YYYY-MM-DD
          },
        }

        const res = await PUT(makeRequest('PUT', invalidBody))
        expect(res.status).toBe(400)
        const json = await res.json()
        expect(json).toHaveProperty('issues')
      })

      it('returns 400 when min_fare is negative', async () => {
        const invalidBody = {
          ...validPutBody,
          config: [
            { vehicle_class: 'business', rate_per_km: 3.00, hourly_rate: 60, daily_rate: 350, min_fare: -5 },
          ],
        }

        const res = await PUT(makeRequest('PUT', invalidBody))
        expect(res.status).toBe(400)
        const json = await res.json()
        expect(json).toHaveProperty('issues')
      })
    })
  })
})

describe('return_discount_percent — RTAD-01 regression (Phase 28)', () => {
  it('GET returns globals.return_discount_percent from Supabase', async () => {
    // Arrange: admin auth + supabase stub returns a row with return_discount_percent=15
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-uid', app_metadata: { is_admin: true } } },
      error: null,
    })

    const configSelectFn = vi.fn().mockResolvedValue({ data: [], error: null })
    const globalsSingleFn = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        airport_fee: 0,
        night_coefficient: 1,
        holiday_coefficient: 1,
        extra_child_seat: 0,
        extra_meet_greet: 0,
        extra_luggage: 0,
        holiday_dates: [],
        return_discount_percent: 15,
      },
      error: null,
    })
    const globalsEqFn = vi.fn().mockReturnValue({ single: globalsSingleFn })
    const globalsSelectFn = vi.fn().mockReturnValue({ eq: globalsEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: configSelectFn })
      .mockReturnValueOnce({ select: globalsSelectFn })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.globals.return_discount_percent).toBe(15)
    expect(json.globals).not.toHaveProperty('return_discount_pct')
  })

  it('PUT accepts return_discount_percent and passes it to pricing_globals upsert', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-uid', app_metadata: { is_admin: true } } },
      error: null,
    })

    const configUpsertFn = vi.fn().mockResolvedValue({ error: null })
    const globalsUpsertFn = vi.fn().mockResolvedValue({ error: null })

    supabaseServiceStub.from
      .mockReturnValueOnce({ upsert: configUpsertFn })
      .mockReturnValueOnce({ upsert: globalsUpsertFn })

    const body = {
      config: [
        { vehicle_class: 'business',     rate_per_km: 50, hourly_rate: 1500, daily_rate: 12000, min_fare: 500 },
        { vehicle_class: 'first_class',  rate_per_km: 80, hourly_rate: 2500, daily_rate: 20000, min_fare: 800 },
        { vehicle_class: 'business_van', rate_per_km: 60, hourly_rate: 1800, daily_rate: 15000, min_fare: 600 },
      ],
      globals: {
        airport_fee: 200,
        night_coefficient: 1.3,
        holiday_coefficient: 1.5,
        extra_child_seat: 0,
        extra_meet_greet: 400,
        extra_luggage: 150,
        return_discount_percent: 20,
        holiday_dates: ['2026-12-25'],
        hourly_min_hours: 2,
        hourly_max_hours: 8,
      },
    }

    const res = await PUT(new Request('http://localhost/api/admin/pricing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))

    expect(res.status).toBe(200)
    expect(globalsUpsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, return_discount_percent: 20 }),
      { onConflict: 'id' },
    )
  })

  it('PUT rejects payload that uses the OLD column name return_discount_pct (regression guard)', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-uid', app_metadata: { is_admin: true } } },
      error: null,
    })

    const body = {
      config: [
        { vehicle_class: 'business',     rate_per_km: 50, hourly_rate: 1500, daily_rate: 12000, min_fare: 500 },
        { vehicle_class: 'first_class',  rate_per_km: 80, hourly_rate: 2500, daily_rate: 20000, min_fare: 800 },
        { vehicle_class: 'business_van', rate_per_km: 60, hourly_rate: 1800, daily_rate: 15000, min_fare: 600 },
      ],
      globals: {
        airport_fee: 200,
        night_coefficient: 1.3,
        holiday_coefficient: 1.5,
        extra_child_seat: 0,
        extra_meet_greet: 400,
        extra_luggage: 150,
        return_discount_pct: 20, // ← WRONG NAME — missing required return_discount_percent
        holiday_dates: [],
        hourly_min_hours: 2,
        hourly_max_hours: 8,
      },
    }

    const res = await PUT(new Request('http://localhost/api/admin/pricing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid payload')
    // Zod issue path should mention return_discount_percent as required
    expect(JSON.stringify(json.issues)).toContain('return_discount_percent')
  })
})

describe('PUT /api/admin/pricing — hourly range (HOURLY-01)', () => {
  beforeEach(() => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-uid', app_metadata: { is_admin: true } } },
      error: null,
    })
    supabaseServiceStub.from.mockImplementation(() => ({
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    }))
  })

  it('returns 200 when hourly_min_hours=2 and hourly_max_hours=8 (valid range)', async () => {
    const res = await PUT(makeRequest('PUT', validPutBody))
    expect(res.status).toBe(200)
  })

  it('returns 422 when hourly_min_hours > hourly_max_hours (min=8, max=2)', async () => {
    const body = {
      ...validPutBody,
      globals: { ...validPutBody.globals, hourly_min_hours: 8, hourly_max_hours: 2 },
    }
    const res = await PUT(makeRequest('PUT', body))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(JSON.stringify(json)).toContain('hourly_min_hours')
  })

  it('returns 422 when hourly_min_hours === hourly_max_hours (equal values, min=5 max=5)', async () => {
    const body = {
      ...validPutBody,
      globals: { ...validPutBody.globals, hourly_min_hours: 5, hourly_max_hours: 5 },
    }
    const res = await PUT(makeRequest('PUT', body))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(JSON.stringify(json)).toContain('hourly_min_hours')
  })

  it('returns 400 when hourly_min_hours=0 (fails positive() constraint)', async () => {
    const body = {
      ...validPutBody,
      globals: { ...validPutBody.globals, hourly_min_hours: 0, hourly_max_hours: 8 },
    }
    const res = await PUT(makeRequest('PUT', body))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('issues')
  })

  it('returns 400 when hourly_min_hours=2.5 (fails int() constraint)', async () => {
    const body = {
      ...validPutBody,
      globals: { ...validPutBody.globals, hourly_min_hours: 2.5, hourly_max_hours: 8 },
    }
    const res = await PUT(makeRequest('PUT', body))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('issues')
  })

  it('returns 400 when hourly_min_hours is missing entirely', async () => {
    const { hourly_min_hours: _omit, ...globalsWithout } = validPutBody.globals
    const body = { ...validPutBody, globals: globalsWithout }
    const res = await PUT(makeRequest('PUT', body))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('issues')
  })
})
