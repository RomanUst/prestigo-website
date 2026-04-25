/**
 * Tests for app/api/quote-email/route.ts
 * Covers LEAD-03 (guard chain), LEAD-04 (DB insert), LEAD-05 (CAPI fan-out).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock rate limiter — allow by default
const mockCheckRateLimit = vi.fn().mockResolvedValue({ allowed: true, remaining: 4, limit: 5 })
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: () => '127.0.0.1',
}))

// Mock Supabase service client
const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn().mockReturnValue({ from: mockFrom }),
}))

// Mock email-quote module
const mockSendQuoteEmail = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email-quote', () => ({
  sendQuoteEmail: mockSendQuoteEmail,
}))

// Mock global fetch for CAPI fan-out
const mockFetch = vi.fn().mockResolvedValue({ ok: true })
vi.stubGlobal('fetch', mockFetch)

import { POST } from '@/app/api/quote-email/route'

const validBody = {
  email: 'test@example.com',
  quote: {
    from: 'Prague Airport',
    to: 'Prague City Centre',
    serviceType: 'transfer',
    date: '2026-05-01',
    time: '10:00',
    vehicleClass: 'business',
    passengers: 2,
    price: 89,
    routeSlug: 'prague-airport-city',
    distanceKm: 25,
  },
  eventId: 'test-event-id-123',
  pageUrl: 'https://rideprestigo.com/calculator',
}

function makeRequest(body: unknown = validBody, extraHeaders: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/quote-email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': JSON.stringify(body).length.toString(),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, limit: 5 })
  mockInsert.mockResolvedValue({ error: null })
  mockSendQuoteEmail.mockResolvedValue(undefined)
  mockFetch.mockResolvedValue({ ok: true })
  mockFrom.mockReturnValue({ insert: mockInsert })
})

describe('POST /api/quote-email', () => {
  it('returns 200 ok on valid request', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })

  it('returns 413 when payload is too large', async () => {
    const oversizedBody = { ...validBody, extra: 'x'.repeat(3000) }
    const req = new Request('http://localhost/api/quote-email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '3500',
      },
      body: JSON.stringify(oversizedBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
  })

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, limit: 5 })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
  })

  it('returns 400 for invalid email', async () => {
    const body = { ...validBody, email: 'not-an-email' }
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new Request('http://localhost/api/quote-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{{{',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns silent 200 when honeypot field is filled', async () => {
    const body = { ...validBody, website: 'http://spam.example.com' }
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    // Should NOT call sendQuoteEmail when honeypot is triggered
    expect(mockSendQuoteEmail).not.toHaveBeenCalled()
  })

  it('inserts a row into quote_leads table', async () => {
    await POST(makeRequest())
    expect(mockFrom).toHaveBeenCalledWith('quote_leads')
    expect(mockInsert).toHaveBeenCalled()
  })

  it('calls sendQuoteEmail with correct email and quote', async () => {
    await POST(makeRequest())
    expect(mockSendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        quote: expect.objectContaining({ price: 89 }),
      })
    )
  })

  it('forwards CAPI Lead event with eventId', async () => {
    await POST(makeRequest())
    // fetch is called for CAPI fan-out (fire-and-forget)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('meta-capi'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Lead'),
      })
    )
    // eventId is echoed
    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body as string)
    expect(body.event_id).toBe('test-event-id-123')
  })

  it('returns 502 when email send fails', async () => {
    mockSendQuoteEmail.mockRejectedValue(new Error('Resend API error'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(502)
  })

  it('continues even if DB insert fails (email still sent)', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'DB error' } })
    const res = await POST(makeRequest())
    // Still returns 200 — email is more important than DB write for UX
    expect(res.status).toBe(200)
    expect(mockSendQuoteEmail).toHaveBeenCalled()
  })
})
