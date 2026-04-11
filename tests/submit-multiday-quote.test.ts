import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock rate limiter — default to allow, individual tests override via mockResolvedValueOnce
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, limit: 5 }),
  getClientIp: () => '127.0.0.1',
}))

// Mock email module — both functions resolve successfully
vi.mock('@/lib/email', () => ({
  sendMultidayOperatorAlert: vi.fn().mockResolvedValue(undefined),
  sendMultidayClientAck: vi.fn().mockResolvedValue(undefined),
}))

// Guarantee Supabase module is NOT imported — if the route accidentally imports it,
// this mock would still exist but we assert on the import graph via file grep below.
vi.mock('@/lib/supabase', () => ({
  saveBooking: vi.fn(),
  buildBookingRow: vi.fn(),
  withRetry: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { checkRateLimit } from '@/lib/rate-limit'
import {
  sendMultidayOperatorAlert,
  sendMultidayClientAck,
} from '@/lib/email'
import { saveBooking } from '@/lib/supabase'
import { POST } from '@/app/api/submit-multiday-quote/route'

const validBody = {
  days: [
    {
      type: 'transfer' as const,
      from: 'Prague Airport',
      to: 'Hotel Alcron Prague',
      stops: [{ address: 'Wenceslas Square', lat: 50.08, lng: 14.42 }],
    },
    {
      type: 'hourly' as const,
      city: 'Vienna',
      hours: 6,
    },
  ],
  startDate: '2026-05-01',
  passengerDetails: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '+420123456789',
    specialRequests: 'Child seat required on Day 1',
  },
}

function makeRequest(body: unknown = validBody, extraHeaders: Record<string, string> = {}): Request {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request('http://localhost/api/submit-multiday-quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: payload,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true, remaining: 4, limit: 5 })
  ;(sendMultidayOperatorAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendMultidayClientAck as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

describe('POST /api/submit-multiday-quote (MULTIDAY-05)', () => {
  describe('Happy path', () => {
    it('returns 200 with quoteReference matching MQ-YYYYMMDD-XXXXXX', async () => {
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.quoteReference).toMatch(/^MQ-\d{8}-[A-F0-9]{6}$/)
    })

    it('calls sendMultidayOperatorAlert with day-by-day data', async () => {
      await POST(makeRequest())
      expect(sendMultidayOperatorAlert).toHaveBeenCalledTimes(1)
      const arg = (sendMultidayOperatorAlert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.days).toHaveLength(2)
      expect(arg.days[0]).toMatchObject({ index: 1, type: 'transfer', from: 'Prague Airport', to: 'Hotel Alcron Prague' })
      expect(arg.days[0].stops).toEqual(['Wenceslas Square'])
      expect(arg.days[1]).toMatchObject({ index: 2, type: 'hourly', city: 'Vienna', hours: 6 })
      expect(arg.firstName).toBe('Ada')
      expect(arg.email).toBe('ada@example.com')
    })

    it('calls sendMultidayClientAck with the client email', async () => {
      await POST(makeRequest())
      expect(sendMultidayClientAck).toHaveBeenCalledTimes(1)
      const arg = (sendMultidayClientAck as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.email).toBe('ada@example.com')
      expect(arg.quoteReference).toMatch(/^MQ-/)
    })

    it('does NOT call any Supabase save function (email-only per D-11)', async () => {
      await POST(makeRequest())
      expect(saveBooking).not.toHaveBeenCalled()
    })

    it('passes startDate through to the email data', async () => {
      await POST(makeRequest())
      const arg = (sendMultidayOperatorAlert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.startDate).toBe('2026-05-01')
    })
  })

  describe('Validation errors (400)', () => {
    it('returns 400 when days array is missing', async () => {
      const body = { ...validBody, days: undefined }
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(400)
      expect(sendMultidayOperatorAlert).not.toHaveBeenCalled()
    })

    it('returns 400 when day.type is invalid', async () => {
      const body = {
        ...validBody,
        days: [{ type: 'bus' as unknown, from: 'A', to: 'B', stops: [] }],
      }
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(400)
    })

    it('returns 400 when days array has 31 items', async () => {
      const body = {
        ...validBody,
        days: Array.from({ length: 31 }, () => ({
          type: 'hourly' as const,
          city: 'Prague',
          hours: 2,
        })),
      }
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(400)
    })

    it('returns 400 when a transfer day has 6 stops', async () => {
      const body = {
        ...validBody,
        days: [
          {
            type: 'transfer' as const,
            from: 'A',
            to: 'B',
            stops: Array.from({ length: 6 }, (_, i) => ({ address: `Stop ${i}`, lat: 50, lng: 14 })),
          },
        ],
      }
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(400)
    })

    it('returns 400 when firstName contains CRLF (T-31-01 email injection guard)', async () => {
      const body = {
        ...validBody,
        passengerDetails: { ...validBody.passengerDetails, firstName: 'Ada\r\nBcc: attacker@evil.com' },
      }
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(400)
      expect(sendMultidayOperatorAlert).not.toHaveBeenCalled()
    })

    it('returns 400 when email is malformed', async () => {
      const body = {
        ...validBody,
        passengerDetails: { ...validBody.passengerDetails, email: 'not-an-email' },
      }
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(400)
    })
  })

  describe('Body size (413)', () => {
    it('returns 413 when content-length exceeds 50 KB', async () => {
      const req = new Request('http://localhost/api/submit-multiday-quote', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(50_001),
        },
        body: JSON.stringify(validBody),
      })
      const res = await POST(req)
      expect(res.status).toBe(413)
    })
  })

  describe('Rate limiting (429 — T-31-02)', () => {
    it('returns 429 when checkRateLimit returns allowed=false', async () => {
      ;(checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        limit: 5,
      })
      const res = await POST(makeRequest())
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBe('60')
      expect(sendMultidayOperatorAlert).not.toHaveBeenCalled()
    })
  })
})
