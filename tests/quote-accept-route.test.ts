// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Phase 92 plan 92-16 Task 3 (QUOTE-03, QUOTE-05; D-05, D-08; T-92-49, T-92-52, T-92-53): the public accept and state
 * routes. The routes run for real; acceptQuote and the token resolver are replaced (their own behaviour is covered by
 * tests/quote-accept.test.ts and tests/quote-resolve.test.ts). What is asserted here is the route contract: guard
 * order, strict schema (no amount key), the consent gate, the mapping of every acceptQuote answer, no-store on every
 * answer, and that no token, Stripe text or database detail reaches a body or a log line.
 */

const { acceptMock, resolveMock, rate } = vi.hoisted(() => ({
  acceptMock: vi.fn(),
  resolveMock: vi.fn(),
  rate: { allowed: true, calls: [] as Array<[string, string]> },
}))

vi.mock('@/lib/quotes/accept', () => ({ acceptQuote: acceptMock }))
vi.mock('@/lib/quotes/resolve', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/quotes/resolve')>()),
  resolveQuoteToken: resolveMock,
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async (path: string, ip: string) => {
    rate.calls.push([path, ip])
    return { allowed: rate.allowed, remaining: 1, limit: 10 }
  }),
  getClientIp: () => '203.0.113.9',
}))

import { POST as acceptPOST } from '@/app/api/quote/accept/route'
import { POST as statePOST } from '@/app/api/quote/state/route'

const TOKEN = 'A'.repeat(43)
const BODY = { token: TOKEN, displayedVersionNo: 1, displayedDepositMinor: 9000, consent: true }

function post(url: string, body: unknown, raw?: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'Mozilla/5.0 (route test)', ...headers },
    body: raw ?? JSON.stringify(body),
  })
}
const acceptReq = (body: unknown, raw?: string, headers?: Record<string, string>) => post('/api/quote/accept', body, raw, headers)
const stateReq = (body: unknown, raw?: string) => post('/api/quote/state', body, raw)

beforeEach(() => {
  vi.clearAllMocks()
  rate.allowed = true
  rate.calls = []
  acceptMock.mockResolvedValue({ ok: true, clientSecret: 'pi_1_secret_x', amountMinor: 9000, currency: 'eur' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/quote/accept (tracer)', () => {
  it('passes the token, the displayed values, the client IP and the user agent to acceptQuote and answers the secret', async () => {
    const res = await acceptPOST(acceptReq(BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clientSecret: 'pi_1_secret_x', amountMinor: 9000, currency: 'eur' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(acceptMock).toHaveBeenCalledTimes(1)
    expect(acceptMock).toHaveBeenCalledWith({
      token: TOKEN,
      displayedVersionNo: 1,
      displayedDepositMinor: 9000,
      ip: '203.0.113.9',
      userAgent: 'Mozilla/5.0 (route test)',
    })
    expect(rate.calls).toEqual([['/api/quote/accept', '203.0.113.9']])
  })
})

describe('POST /api/quote/accept: guard order', () => {
  it('a body over 2_000 bytes is 413 (declared) before the rate limit, with no-store', async () => {
    const res = await acceptPOST(acceptReq(BODY, undefined, { 'content-length': '2001' }))
    expect(res.status).toBe(413)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(rate.calls).toEqual([])
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it('a body over 2_000 bytes with no declared length is 413 as well', async () => {
    const res = await acceptPOST(acceptReq(null, JSON.stringify({ ...BODY, pad: 'x'.repeat(2_100) })))
    expect(res.status).toBe(413)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it('a denied rate limit is 429 before the body is read', async () => {
    rate.allowed = false
    const res = await acceptPOST(acceptReq(BODY))
    expect(res.status).toBe(429)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it('invalid JSON is 400', async () => {
    const res = await acceptPOST(acceptReq(null, '{nope'))
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it('T-92-49: an amount key in the body is 400 and nothing is accepted (any spelling)', async () => {
    for (const key of ['amountMinor', 'amount', 'depositMinor', 'currency', 'text', 'consentText']) {
      const res = await acceptPOST(acceptReq({ ...BODY, [key]: 1 }))
      expect(res.status, key).toBe(400)
    }
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it('a wrong shape is 400: bad token, version below 1, deposit zero or fractional, consent not a boolean, missing field', async () => {
    const bad: unknown[] = [
      { ...BODY, token: 'short' },
      { ...BODY, token: 42 },
      { ...BODY, displayedVersionNo: 0 },
      { ...BODY, displayedVersionNo: 1.5 },
      { ...BODY, displayedDepositMinor: 0 },
      { ...BODY, displayedDepositMinor: -5 },
      { ...BODY, displayedDepositMinor: 90.5 },
      { ...BODY, displayedDepositMinor: '9000' },
      { ...BODY, consent: 'true' },
      { token: TOKEN, displayedVersionNo: 1, consent: true },
      { token: TOKEN, displayedVersionNo: 1, displayedDepositMinor: 9000 },
      [],
      null,
    ]
    for (const body of bad) {
      const res = await acceptPOST(acceptReq(body))
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it('consent false is 422 CONSENT_REQUIRED and nothing is accepted', async () => {
    const res = await acceptPOST(acceptReq({ ...BODY, consent: false }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'CONSENT_REQUIRED' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(acceptMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/quote/accept: every acceptQuote answer', () => {
  const cases: Array<[string, number, Record<string, unknown>]> = [
    ['invalid_link', 404, { error: 'invalid_link' }],
    ['quote_changed', 409, { error: 'quote_changed' }],
    ['already_paid', 409, { error: 'already_paid' }],
    ['already_paying', 409, { error: 'already_paying' }],
    ['busy', 409, { error: 'busy' }],
    ['stripe_error', 502, { error: 'payment_unavailable' }],
  ]
  for (const [code, status, body] of cases) {
    it(`${code} is ${status} ${JSON.stringify(body)}`, async () => {
      acceptMock.mockResolvedValue({ ok: false, code })
      const res = await acceptPOST(acceptReq(BODY))
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual(body)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
    })
  }

  it('D-05: the dead-link answer carries no price data', async () => {
    acceptMock.mockResolvedValue({ ok: false, code: 'invalid_link' })
    const res = await acceptPOST(acceptReq(BODY))
    expect(Object.keys(await res.json())).toEqual(['error'])
  })

  it('an unexpected throw is a generic 502 with no detail in the body or the log, and no token anywhere', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    acceptMock.mockRejectedValue(new Error(`duplicate key value ${TOKEN} sk_live_secret detail`))
    const res = await acceptPOST(acceptReq(BODY))
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ error: 'payment_unavailable' })
    expect(text).not.toContain('sk_live_secret')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const logged = JSON.stringify(err.mock.calls)
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain('sk_live_secret')
    expect(logged).not.toContain('duplicate key')
  })

  it('a success body has exactly clientSecret, amountMinor and currency', async () => {
    const res = await acceptPOST(acceptReq(BODY))
    expect(Object.keys(await res.json()).sort()).toEqual(['amountMinor', 'clientSecret', 'currency'])
  })
})

describe('POST /api/quote/state', () => {
  const resolved = (over: Record<string, unknown> = {}) => ({
    quote: { status: 'accepted' },
    state: 'offer',
    bookings: [],
    ...over,
  })

  it('answers accepted while the deposit is pending, with no references', async () => {
    resolveMock.mockResolvedValue(resolved())
    const res = await statePOST(stateReq({ token: TOKEN }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ state: 'accepted', bookingReferences: [] })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(rate.calls).toEqual([['/api/quote/state', '203.0.113.9']])
  })

  it('answers offer for a quote not yet accepted', async () => {
    resolveMock.mockResolvedValue(resolved({ quote: { status: 'viewed' } }))
    const res = await statePOST(stateReq({ token: TOKEN }))
    expect(await res.json()).toEqual({ state: 'offer', bookingReferences: [] })
  })

  it('answers paid with the booking references and nothing else', async () => {
    resolveMock.mockResolvedValue(
      resolved({
        quote: { status: 'paid', client_email: 'secret@example.com' },
        state: 'paid',
        bookings: [
          { booking_reference: 'PR-9001', quote_line_id: 'l1', status: 'confirmed', payment_mode: 'card_hold', paid_at: null },
          { booking_reference: 'PR-9002', quote_line_id: 'l2', status: 'confirmed', payment_mode: 'card_hold', paid_at: null },
        ],
      }),
    )
    const res = await statePOST(stateReq({ token: TOKEN }))
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ state: 'paid', bookingReferences: ['PR-9001', 'PR-9002'] })
    expect(text).not.toContain('secret@example.com')
  })

  it('answers 404 invalid_link for a token that does not resolve', async () => {
    resolveMock.mockResolvedValue(null)
    const res = await statePOST(stateReq({ token: TOKEN }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'invalid_link' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('guards: 413, 429, bad JSON, strict schema', async () => {
    expect((await statePOST(post('/api/quote/state', { token: TOKEN }, undefined, { 'content-length': '2001' }))).status).toBe(413)
    expect(resolveMock).not.toHaveBeenCalled()

    rate.allowed = false
    expect((await statePOST(stateReq({ token: TOKEN }))).status).toBe(429)
    rate.allowed = true

    expect((await statePOST(stateReq(null, '{nope'))).status).toBe(400)
    expect((await statePOST(stateReq({ token: TOKEN, extra: 1 }))).status).toBe(400)
    expect((await statePOST(stateReq({ token: 'short' }))).status).toBe(400)
    expect((await statePOST(stateReq({}))).status).toBe(400)
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('an unexpected resolver failure is a generic 502 (never a detail, never the token)', async () => {
    resolveMock.mockRejectedValue(new Error('db detail'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await statePOST(stateReq({ token: TOKEN }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'unavailable' })
    expect(JSON.stringify(err.mock.calls)).not.toContain(TOKEN)
  })
})

describe('source hygiene', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

  it('the accept route has the rate-limit key, the consent code, no-store and never reads an amount from the body', () => {
    const src = read('app/api/quote/accept/route.ts')
    expect(src).toContain("checkRateLimit('/api/quote/accept'")
    expect(src).toContain('CONSENT_REQUIRED')
    expect(src).toContain('no-store')
    expect(src).not.toMatch(/amountMinor\s*[:=]\s*(body|parsed)/)
  })

  it('neither route logs a token, a request body or a thrown message', () => {
    for (const p of ['app/api/quote/accept/route.ts', 'app/api/quote/state/route.ts']) {
      const src = read(p)
      const logLines = src.split('\n').filter((l) => /console\.(log|error|warn|info)/.test(l))
      for (const line of logLines) {
        // Only a fixed string literal: the text after the console call must not mention (or interpolate) request data.
        const args = line.trim().replace(/console\.(log|error|warn|info)/, '')
        expect(args, p).toMatch(/^\('\[quote-[a-z-]+\] [a-z ]+'\)$/)
      }
    }
  })
})
