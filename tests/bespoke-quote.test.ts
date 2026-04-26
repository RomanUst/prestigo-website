import { describe, it, expect, vi, beforeEach } from 'vitest'

const { checkRateLimitMock, sendBespokeEmailsMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  sendBespokeEmailsMock: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: () => '1.2.3.4',
}))
vi.mock('@/lib/email-bespoke', () => ({
  sendBespokeEmails: sendBespokeEmailsMock,
}))

import { POST } from '@/app/api/bespoke-quote/route'

const validPayload = {
  occasion: 'wedding',
  guests: 4,
  date: '2026-06-15',
  time: '14:30',
  specialRequests: 'Champagne please',
  name: 'Jane Doe',
  email: 'jane@example.com',
}

function makeRequest(body: unknown, extraHeaders: Record<string, string> = {}): Request {
  const serialised = JSON.stringify(body)
  return new Request('http://localhost/api/bespoke-quote', {
    method: 'POST',
    body: serialised,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(serialised, 'utf8')),
      ...extraHeaders,
    },
  })
}

describe('POST /api/bespoke-quote', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset()
    sendBespokeEmailsMock.mockReset()
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 4, limit: 5 })
  })

  it('returns 413 when body exceeds 4000 bytes', async () => {
    // Declare a content-length > 4000 bytes
    const req = new Request('http://localhost/api/bespoke-quote', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: {
        'content-type': 'application/json',
        'content-length': '4001',
      },
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
  })

  it('returns 429 when rate limit denies', async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, limit: 5 })
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json).toEqual({ error: 'Too many requests' })
  })

  it('returns 400 on malformed JSON', async () => {
    const req = new Request('http://localhost/api/bespoke-quote', {
      method: 'POST',
      body: '{ invalid json }',
      headers: {
        'content-type': 'application/json',
        'content-length': '16',
      },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when occasion is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { occasion, ...withoutOccasion } = validPayload
    const res = await POST(makeRequest(withoutOccasion))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ error: 'Invalid request' })
  })

  it('returns 400 when occasion is not in enum', async () => {
    const res = await POST(makeRequest({ ...validPayload, occasion: 'birthday' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when guests is out of [1,10] range', async () => {
    const resZero = await POST(makeRequest({ ...validPayload, guests: 0 }))
    expect(resZero.status).toBe(400)

    const resEleven = await POST(makeRequest({ ...validPayload, guests: 11 }))
    expect(resEleven.status).toBe(400)
  })

  it('returns 200 silently and does NOT send email when honeypot website is set', async () => {
    const res = await POST(makeRequest({ ...validPayload, website: 'http://spam.com' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true })
    expect(sendBespokeEmailsMock).not.toHaveBeenCalled()
  })

  it('calls sendBespokeEmails once and returns 200 on valid payload', async () => {
    sendBespokeEmailsMock.mockResolvedValueOnce(undefined)
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true })
    expect(sendBespokeEmailsMock).toHaveBeenCalledTimes(1)
    // Verify occasion enum coverage
    const callArg = sendBespokeEmailsMock.mock.calls[0][0]
    expect(['wedding', 'corporate', 'airport_vip', 'other']).toContain(callArg.occasion ?? validPayload.occasion)
  })

  it('returns 502 when sendBespokeEmails throws', async () => {
    sendBespokeEmailsMock.mockRejectedValueOnce(new Error('SMTP timeout'))
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json).toEqual({ error: 'Email send failed' })
  })
})
