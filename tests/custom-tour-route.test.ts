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

import { checkRateLimit } from '@/lib/rate-limit'
import { storeInquiry } from '@/lib/inquiries'
import { dispatchAfterResponse } from '@/lib/outbox'
import { enqueueCustomTourAlert } from '@/lib/custom-tour-enqueue'
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
  })
})

describe('LIMITS entry', () => {
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
