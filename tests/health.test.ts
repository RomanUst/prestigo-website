import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures these stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseStub, resendStub } = vi.hoisted(() => {
  const supabaseStub = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve({ error: null as null | { message: string } })),
      })),
    })),
  }

  const resendStub = {
    domains: {
      list: vi.fn().mockResolvedValue({ error: null }),
    },
  }

  return { supabaseStub, resendStub }
})

// Mock @/lib/supabase — createSupabaseServiceClient returns our stub
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseStub),
}))

// Mock resend — Resend constructor returns our stub
vi.mock('resend', () => ({
  Resend: vi.fn(() => resendStub),
}))

import { Resend } from 'resend'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { GET } from '@/app/api/health/route'

function makeRequest(token?: string): Request {
  const headers: Record<string, string> = {}
  if (token) headers['authorization'] = `Bearer ${token}`
  return new Request('http://localhost/api/health', { method: 'GET', headers })
}

beforeEach(() => {
  vi.clearAllMocks()

  // Restore env vars to valid defaults before each test
  process.env.HEALTH_SECRET = 'test-secret-value'
  process.env.STRIPE_SECRET_KEY = 'sk_test_abc123'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123'
  process.env.RESEND_API_KEY = 'test-resend-key'

  // Restore mocks to happy-path defaults after vi.clearAllMocks()
  ;(createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(supabaseStub)
  supabaseStub.from.mockImplementation(() => ({
    select: vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve({ error: null })),
    })),
  }))

  ;(Resend as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () { return resendStub })
  resendStub.domains.list.mockResolvedValue({ error: null })
})

describe('/api/health', () => {
  describe('Authorization', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await GET(makeRequest())
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 401 when Bearer token is wrong', async () => {
      const res = await GET(makeRequest('wrong-token'))
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.error).toBe('Unauthorized')
    })
  })

  describe('All services healthy', () => {
    it('returns 200 with status ok when all probes pass', async () => {
      const res = await GET(makeRequest('test-secret-value'))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.status).toBe('ok')
      expect(json.services.supabase.ok).toBe(true)
      expect(json.services.stripe.ok).toBe(true)
      expect(json.services.resend.ok).toBe(true)
    })
  })

  describe('Degraded states', () => {
    it('returns 503 when Supabase probe fails', async () => {
      supabaseStub.from.mockImplementation(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ error: { message: 'connection refused' } })),
        })),
      }))

      const res = await GET(makeRequest('test-secret-value'))
      expect(res.status).toBe(503)
      const json = await res.json()
      expect(json.status).toBe('degraded')
      expect(json.services.supabase.ok).toBe(false)
    })

    it('returns 503 when Stripe keys are invalid', async () => {
      process.env.STRIPE_SECRET_KEY = 'invalid'
      process.env.STRIPE_WEBHOOK_SECRET = 'invalid'

      const res = await GET(makeRequest('test-secret-value'))
      expect(res.status).toBe(503)
      const json = await res.json()
      expect(json.services.stripe.ok).toBe(false)
    })

    it('returns 503 when Resend probe fails', async () => {
      resendStub.domains.list.mockResolvedValue({ error: { message: 'API key invalid' } })

      const res = await GET(makeRequest('test-secret-value'))
      expect(res.status).toBe(503)
      const json = await res.json()
      expect(json.services.resend.ok).toBe(false)
    })
  })
})
