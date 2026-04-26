import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkRateLimitMock = vi.fn()
const sendCorporateContactEmailsMock = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: () => '1.2.3.4',
}))
vi.mock('@/lib/email-corporate', () => ({
  sendCorporateContactEmails: sendCorporateContactEmailsMock,
}))

import { POST } from '@/app/api/corporate-contact/route'

const validPayload = {
  company: 'ACME Corp',
  name: 'John Smith, CFO',
  email: 'john@acme.com',
  trips: '6–15',
  notes: 'Recurring Mon morning airport runs',
}

function makeRequest(body: unknown, extraHeaders: Record<string, string> = {}): Request {
  const serialised = JSON.stringify(body)
  return new Request('http://localhost/api/corporate-contact', {
    method: 'POST',
    body: serialised,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(serialised, 'utf8')),
      ...extraHeaders,
    },
  })
}

describe('POST /api/corporate-contact', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset()
    sendCorporateContactEmailsMock.mockReset()
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 4, limit: 5 })
  })

  it('returns 413 when body exceeds 4000 bytes', async () => {
    const req = new Request('http://localhost/api/corporate-contact', {
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
    const req = new Request('http://localhost/api/corporate-contact', {
      method: 'POST',
      body: '{ bad json }',
      headers: {
        'content-type': 'application/json',
        'content-length': '12',
      },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when company is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { company, ...withoutCompany } = validPayload
    const res = await POST(makeRequest(withoutCompany))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ error: 'Invalid request' })
  })

  it('returns 400 when email is missing or invalid', async () => {
    // Missing email
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { email, ...withoutEmail } = validPayload
    const resMissing = await POST(makeRequest(withoutEmail))
    expect(resMissing.status).toBe(400)

    // Invalid email
    const resInvalid = await POST(makeRequest({ ...validPayload, email: 'not-an-email' }))
    expect(resInvalid.status).toBe(400)
  })

  it('returns 200 silently and does NOT send email when honeypot website is set', async () => {
    const res = await POST(makeRequest({ ...validPayload, website: 'http://spam.com' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true })
    expect(sendCorporateContactEmailsMock).not.toHaveBeenCalled()
  })

  it('calls sendCorporateContactEmails once with source tagged as "corporate" and returns 200', async () => {
    sendCorporateContactEmailsMock.mockResolvedValueOnce(undefined)
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true })
    expect(sendCorporateContactEmailsMock).toHaveBeenCalledTimes(1)
    const callArg = sendCorporateContactEmailsMock.mock.calls[0][0]
    // source must be tagged server-side, not client-side
    expect(callArg).toMatchObject({ source: 'corporate' })
  })

  it('returns 502 when sendCorporateContactEmails throws', async () => {
    sendCorporateContactEmailsMock.mockRejectedValueOnce(new Error('SMTP timeout'))
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json).toEqual({ error: 'Email send failed' })
  })
})
