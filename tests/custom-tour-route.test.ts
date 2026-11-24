import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 93 (plan 93-32; TRIP-06; D-17, D-18): POST /api/custom-tour.

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, limit: 5 }),
  getClientIp: () => '127.0.0.1',
}))

vi.mock('@/lib/inquiries', () => ({
  storeInquiry: vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111'),
}))

vi.mock('@/lib/outbox', () => ({
  dispatchAfterResponse: vi.fn(),
  inquiryOutboxKey: (id: string) => `lead.inquiry:${id}`,
}))

vi.mock('@/lib/custom-tour-enqueue', () => ({
  enqueueCustomTourAlert: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/email', () => ({
  sendCustomTourOperatorAlert: vi.fn().mockResolvedValue(true),
  sendCustomTourClientAck: vi.fn().mockResolvedValue(undefined),
}))

import { checkRateLimit } from '@/lib/rate-limit'
import { storeInquiry } from '@/lib/inquiries'
import { dispatchAfterResponse } from '@/lib/outbox'
import { enqueueCustomTourAlert } from '@/lib/custom-tour-enqueue'
import { sendCustomTourOperatorAlert, sendCustomTourClientAck } from '@/lib/email'
import { getPragueTodayISO, shiftIsoDate } from '@/lib/prague-date'
import { POST } from '@/app/api/custom-tour/route'

const INQUIRY_ID = '11111111-1111-4111-8111-111111111111'

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    where: 'Karlstejn castle and a wine cellar',
    date: shiftIsoDate(getPragueTodayISO(), 10),
    people: 4,
    wishes: 'Child seat please',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+420 123 456 789',
    locale: 'ru',
    website: '',
    ...over,
  }
}

function makeRequest(body: unknown, raw?: string): Request {
  return new Request('http://localhost/api/custom-tour', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, limit: 5 })
  vi.mocked(storeInquiry).mockResolvedValue(INQUIRY_ID)
  vi.mocked(enqueueCustomTourAlert).mockResolvedValue(undefined)
  vi.mocked(sendCustomTourOperatorAlert).mockResolvedValue(true)
  vi.mocked(sendCustomTourClientAck).mockResolvedValue(undefined)
})

describe('POST /api/custom-tour: happy path', () => {
  it('stores a custom_tour inquiry, queues CRM + Chatwoot and answers { ok: true }', async () => {
    const res = await POST(makeRequest(validBody({ tourSlug: 'karlstejn-day-trip' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(storeInquiry).toHaveBeenCalledTimes(1)
    const [kind, input] = vi.mocked(storeInquiry).mock.calls[0]
    expect(kind).toBe('custom_tour')
    expect(input.email).toBe('ada@example.com')
    expect(input.name).toBe('Ada Lovelace')
    expect(input.phone).toBe('+420123456789')
    expect(input.payload).toEqual({
      where: 'Karlstejn castle and a wine cellar',
      date: validBody().date,
      people: 4,
      wishes: 'Child seat please',
      tourSlug: 'karlstejn-day-trip',
      locale: 'ru',
    })
    expect(dispatchAfterResponse).toHaveBeenCalledWith(`lead.inquiry:${INQUIRY_ID}`)
    expect(enqueueCustomTourAlert).toHaveBeenCalledWith(INQUIRY_ID)
  })

  it('accepts the exact payload the form sends: empty wishes, no tourSlug, empty honeypot', async () => {
    const res = await POST(makeRequest(validBody({ wishes: '' })))
    expect(res.status).toBe(200)
    const [, input] = vi.mocked(storeInquiry).mock.calls[0]
    expect(input.payload.wishes).toBeNull()
    expect(input.payload.tourSlug).toBeNull()
  })

  it('accepts today (Prague) as the date and an omitted wishes field', async () => {
    const body = validBody({ date: getPragueTodayISO() })
    delete body.wishes
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(200)
  })

  it('an unknown locale is stored as en', async () => {
    const res = await POST(makeRequest(validBody({ locale: 'xx' })))
    expect(res.status).toBe(200)
    expect(vi.mocked(storeInquiry).mock.calls[0][1].payload.locale).toBe('en')
  })

  it('answers 200 when storeInquiry resolves null and dispatches nothing', async () => {
    vi.mocked(storeInquiry).mockResolvedValueOnce(null)
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(dispatchAfterResponse).not.toHaveBeenCalled()
    expect(enqueueCustomTourAlert).not.toHaveBeenCalled()
  })
})

describe('POST /api/custom-tour: guards', () => {
  it('returns 413 for a body over 10 KB', async () => {
    const big = JSON.stringify(validBody({ wishes: 'x'.repeat(11_000) }))
    const res = await POST(
      new Request('http://localhost/api/custom-tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'content-length': String(big.length) },
        body: big,
      }),
    )
    expect(res.status).toBe(413)
    expect(storeInquiry).not.toHaveBeenCalled()
  })

  it('returns 429 with Retry-After when the rate limit trips (limiter keyed on /api/custom-tour)', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 5 })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(vi.mocked(checkRateLimit).mock.calls[0][0]).toBe('/api/custom-tour')
    expect(storeInquiry).not.toHaveBeenCalled()
  })

  it('rate limit runs before body parsing (garbage body still answers 429)', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 5 })
    const res = await POST(makeRequest(null, '{not json'))
    expect(res.status).toBe(429)
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(makeRequest(null, '{not json'))
    expect(res.status).toBe(400)
  })

  it('returns 400 with fieldErrors for an unknown key', async () => {
    const res = await POST(makeRequest(validBody({ extra: 'nope' })))
    expect(res.status).toBe(400)
    expect(storeInquiry).not.toHaveBeenCalled()
  })

  it('returns 400 for a name with a newline (header injection)', async () => {
    const res = await POST(makeRequest(validBody({ name: 'Ada\r\nBcc: evil@example.com' })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(Object.keys(body.fieldErrors)).toContain('name')
  })

  it('returns 400 for an email with a newline', async () => {
    const res = await POST(makeRequest(validBody({ email: 'ada@example.com\nBcc: evil@example.com' })))
    expect(res.status).toBe(400)
  })

  it('returns 400 keyed on date for yesterday (Prague) and for an impossible date', async () => {
    for (const date of [shiftIsoDate(getPragueTodayISO(), -1), '2030-02-31', '10/12/2030']) {
      const res = await POST(makeRequest(validBody({ date })))
      expect(res.status).toBe(400)
      expect(Object.keys((await res.json()).fieldErrors)).toContain('date')
    }
  })

  it.each([0, 51, 2.5, '4'])('returns 400 keyed on people for %s', async (people) => {
    const res = await POST(makeRequest(validBody({ people })))
    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).fieldErrors)).toContain('people')
  })

  it('returns 400 keyed on where for empty and over-long text', async () => {
    for (const where of ['   ', 'w'.repeat(1001)]) {
      const res = await POST(makeRequest(validBody({ where })))
      expect(res.status).toBe(400)
      expect(Object.keys((await res.json()).fieldErrors)).toContain('where')
    }
  })

  it('returns 400 for wishes over 1000 characters', async () => {
    const res = await POST(makeRequest(validBody({ wishes: 'w'.repeat(1001) })))
    expect(res.status).toBe(400)
  })

  it("returns 400 for tourSlug 'abc'", async () => {
    const res = await POST(makeRequest(validBody({ tourSlug: 'abc' })))
    expect(res.status).toBe(400)
  })

  it('returns 422 INVALID_PHONE for a phone without a usable country code', async () => {
    const res = await POST(makeRequest(validBody({ phone: '12345' })))
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('INVALID_PHONE')
    expect(storeInquiry).not.toHaveBeenCalled()
  })

  it('honeypot filled: silent 200 { ok: true }, nothing stored, nothing sent', async () => {
    const res = await POST(makeRequest(validBody({ website: 'http://spam.example' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(storeInquiry).not.toHaveBeenCalled()
    expect(dispatchAfterResponse).not.toHaveBeenCalled()
    expect(enqueueCustomTourAlert).not.toHaveBeenCalled()
    expect(sendCustomTourOperatorAlert).not.toHaveBeenCalled()
    expect(sendCustomTourClientAck).not.toHaveBeenCalled()
  })
})

describe('POST /api/custom-tour: emails', () => {
  it('sends the operator alert (with the inquiry id) and the client ack in the request locale', async () => {
    const res = await POST(makeRequest(validBody({ tourSlug: 'karlstejn-day-trip' })))
    expect(res.status).toBe(200)
    expect(sendCustomTourOperatorAlert).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendCustomTourOperatorAlert).mock.calls[0][0]).toMatchObject({
      inquiryId: INQUIRY_ID,
      locale: 'ru',
      tourSlug: 'karlstejn-day-trip',
      email: 'ada@example.com',
    })
    expect(sendCustomTourClientAck).toHaveBeenCalledTimes(1)
    const ackArg = vi.mocked(sendCustomTourClientAck).mock.calls[0][0]
    expect(ackArg).toMatchObject({ locale: 'ru', name: 'Ada Lovelace', email: 'ada@example.com', people: 4 })
    // the client sees their own request (owner decision 2026-11-23); lib/email caps and escapes it
    expect(ackArg).toHaveProperty('where')
    expect(ackArg).toHaveProperty('wishes')
  })

  it('CR-01: the ack is limited per recipient on /api/custom-tour#ack, keyed on a hash of the normalised address', async () => {
    await POST(makeRequest(validBody({ email: 'Ada+promo@Example.com' })))
    const ackCall = vi.mocked(checkRateLimit).mock.calls.find((c) => c[0] === '/api/custom-tour#ack')
    expect(ackCall).toBeDefined()
    expect(ackCall![1]).toMatch(/^[0-9a-f]{32}$/)
    await POST(makeRequest(validBody({ email: 'ada@example.com' })))
    const keys = vi
      .mocked(checkRateLimit)
      .mock.calls.filter((c) => c[0] === '/api/custom-tour#ack')
      .map((c) => c[1])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('CR-01: over the per-recipient limit only the ack is skipped; the request is stored, alerted and answered 200', async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (route: string) =>
      route === '/api/custom-tour#ack'
        ? { allowed: false, remaining: 0, limit: 3 }
        : { allowed: true, remaining: 4, limit: 5 },
    )
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(storeInquiry).toHaveBeenCalledTimes(1)
    expect(enqueueCustomTourAlert).toHaveBeenCalledWith(INQUIRY_ID)
    expect(sendCustomTourOperatorAlert).toHaveBeenCalledTimes(1)
    expect(sendCustomTourClientAck).not.toHaveBeenCalled()
  })

  it('WR-03: nothing stored and no operator mail sent answers 500 (the form shows its error), no false success', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(storeInquiry).mockResolvedValueOnce(null)
    vi.mocked(sendCustomTourOperatorAlert).mockResolvedValueOnce(false)
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to submit custom tour request' })
    err.mockRestore()
  })

  it('WR-03: nothing stored and the operator alert rejecting answers 500', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(storeInquiry).mockResolvedValueOnce(null)
    vi.mocked(sendCustomTourOperatorAlert).mockRejectedValueOnce(new Error('resend down'))
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(500)
    err.mockRestore()
  })

  it('WR-03: stored but the operator mail failed still answers 200 (the request is in the admin)', async () => {
    vi.mocked(sendCustomTourOperatorAlert).mockResolvedValueOnce(false)
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(200)
  })

  it('IN-03: NUL characters are stripped from the free text before it is stored', async () => {
    const res = await POST(makeRequest(validBody({ where: 'Kar\u0000lstejn', wishes: 'a\u0000b' })))
    expect(res.status).toBe(200)
    const [, input] = vi.mocked(storeInquiry).mock.calls[0]
    expect(input.payload.where).toBe('Karlstejn')
    expect(input.payload.wishes).toBe('ab')
  })

  it('IN-03: a where made only of NUL characters is empty and rejected', async () => {
    const res = await POST(makeRequest(validBody({ where: '\u0000\u0000' })))
    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).fieldErrors)).toContain('where')
  })

  it('the alert gets no inquiry id when nothing was stored (the alert went out, so the request still answers 200)', async () => {
    vi.mocked(storeInquiry).mockResolvedValueOnce(null)
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(200)
    expect(vi.mocked(sendCustomTourOperatorAlert).mock.calls[0][0].inquiryId).toBeNull()
  })

  it('a rejected send of a stored request still answers 200 { ok: true }', async () => {
    vi.mocked(sendCustomTourOperatorAlert).mockRejectedValueOnce(new Error('resend down'))
    vi.mocked(sendCustomTourClientAck).mockRejectedValueOnce(new Error('resend down'))
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('LIMITS entry', () => {
  it("'/api/custom-tour#ack' allows 3 per recipient per 24 h, the 4th is denied (real limiter, in-memory path)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    const real = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit')
    vi.useFakeTimers()
    try {
      const key = 'recipient-hash-ack-test'
      for (let i = 0; i < 3; i++) expect((await real.checkRateLimit('/api/custom-tour#ack', key)).allowed).toBe(true)
      expect((await real.checkRateLimit('/api/custom-tour#ack', key)).allowed).toBe(false)
      // still denied after the default 60 s window, free again after 24 h
      vi.advanceTimersByTime(2 * 60 * 60 * 1000)
      expect((await real.checkRateLimit('/api/custom-tour#ack', key)).allowed).toBe(false)
      vi.advanceTimersByTime(23 * 60 * 60 * 1000)
      expect((await real.checkRateLimit('/api/custom-tour#ack', key)).allowed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("'/api/custom-tour' allows 5 requests a minute, the 6th is denied (real limiter, in-memory path)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    const real = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit')
    const ip = '203.0.113.93'
    for (let i = 0; i < 5; i++) {
      expect((await real.checkRateLimit('/api/custom-tour', ip)).allowed).toBe(true)
    }
    expect((await real.checkRateLimit('/api/custom-tour', ip)).allowed).toBe(false)
  })
})

describe('POST /api/custom-tour: logging', () => {
  let spies: ReturnType<typeof vi.spyOn>[]
  beforeEach(() => {
    spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ]
  })
  afterEach(() => spies.forEach((s) => s.mockRestore()))

  it('never logs the email, phone or name, on success or failure', async () => {
    vi.mocked(sendCustomTourClientAck).mockRejectedValueOnce(new Error('resend down'))
    await POST(makeRequest(validBody()))
    await POST(makeRequest(validBody({ phone: '12345' })))
    await POST(makeRequest(validBody({ people: 0 })))
    vi.mocked(storeInquiry).mockRejectedValueOnce(new Error('db down ada@example.com'))
    await POST(makeRequest(validBody()))
    const out = JSON.stringify(spies.flatMap((s) => s.mock.calls))
    expect(out).not.toContain('ada@example.com')
    expect(out).not.toContain('Ada Lovelace')
    expect(out).not.toContain('123 456')
    expect(out).not.toContain('123456789')
  })
})
