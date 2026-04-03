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
    holiday_dates: [],
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
            holiday_dates: ['2026-12-25', '2026-12-31'],
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
