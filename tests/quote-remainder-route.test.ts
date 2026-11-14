// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Phase 92 plan 92-23 Task 1 (QUOTE-04; D-16, D-22; T-92-73): POST /api/quote/remainder. The route runs for real;
 * createRemainderIntent is replaced (its own behaviour is covered by tests/quote-remainder.test.ts). What is asserted here
 * is the route contract: guard order, the strict schema (a client-sent amount other than the displayed cross-check is a
 * 400), the mapping of every createRemainderIntent answer, no-store on every answer and that no token, Stripe text or
 * database detail reaches a body or a log line.
 */

const { createMock, rate } = vi.hoisted(() => ({
  createMock: vi.fn(),
  rate: { allowed: true, calls: [] as Array<[string, string]> },
}))

vi.mock('@/lib/quotes/remainder', () => ({ createRemainderIntent: createMock }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async (path: string, ip: string) => {
    rate.calls.push([path, ip])
    return { allowed: rate.allowed, remaining: 1, limit: 10 }
  }),
  getClientIp: () => '203.0.113.9',
}))

import { POST } from '@/app/api/quote/remainder/route'

const TOKEN = 'A'.repeat(43)
const BODY = { token: TOKEN, displayedAmountMinor: 21000 }

function req(body: unknown, raw?: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/quote/remainder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw ?? JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  rate.allowed = true
  rate.calls = []
  createMock.mockResolvedValue({ ok: true, clientSecret: 'pi_1_secret_x', amountMinor: 21000, currency: 'eur' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/quote/remainder (tracer)', () => {
  it('passes the token and the displayed amount and answers the client secret, the amount and the currency', async () => {
    const res = await POST(req(BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clientSecret: 'pi_1_secret_x', amountMinor: 21000, currency: 'eur' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock).toHaveBeenCalledWith({ token: TOKEN, displayedAmountMinor: 21000 })
    expect(rate.calls).toEqual([['/api/quote/remainder', '203.0.113.9']])
  })

  it('a success body has exactly clientSecret, amountMinor and currency', async () => {
    const res = await POST(req(BODY))
    expect(Object.keys(await res.json()).sort()).toEqual(['amountMinor', 'clientSecret', 'currency'])
  })
})

describe('POST /api/quote/remainder: guard order', () => {
  it('a body over 2_000 bytes is 413 (declared) before the rate limit, with no-store', async () => {
    const res = await POST(req(BODY, undefined, { 'content-length': '2001' }))
    expect(res.status).toBe(413)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(rate.calls).toEqual([])
    expect(createMock).not.toHaveBeenCalled()
  })

  it('a body over 2_000 bytes with no declared length is 413 as well', async () => {
    const res = await POST(req(null, JSON.stringify({ ...BODY, pad: 'x'.repeat(2_100) })))
    expect(res.status).toBe(413)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('a denied rate limit is 429 before the body is read', async () => {
    rate.allowed = false
    const res = await POST(req(BODY))
    expect(res.status).toBe(429)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('invalid JSON is 400', async () => {
    const res = await POST(req(null, '{nope'))
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('T-92-73: any amount-like key beyond the displayed cross-check is a 400 and nothing is created', async () => {
    for (const key of ['amountMinor', 'amount', 'remainderMinor', 'dueMinor', 'currency', 'quoteId', 'bookingIds']) {
      const res = await POST(req({ ...BODY, [key]: 1 }))
      expect(res.status, key).toBe(400)
    }
    expect(createMock).not.toHaveBeenCalled()
  })

  it('a wrong shape is 400: bad token, amount zero, negative, fractional or text, missing field', async () => {
    const bad: unknown[] = [
      { ...BODY, token: 'short' },
      { ...BODY, token: 42 },
      { ...BODY, displayedAmountMinor: 0 },
      { ...BODY, displayedAmountMinor: -5 },
      { ...BODY, displayedAmountMinor: 90.5 },
      { ...BODY, displayedAmountMinor: '21000' },
      { token: TOKEN },
      { displayedAmountMinor: 21000 },
      [],
      null,
    ]
    for (const body of bad) {
      const res = await POST(req(body))
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/quote/remainder: every createRemainderIntent answer', () => {
  const cases: Array<[string, number, Record<string, unknown>]> = [
    ['invalid_link', 404, { error: 'invalid_link' }],
    ['not_payable', 422, { error: 'not_payable' }],
    ['nothing_due', 422, { error: 'nothing_due' }],
    ['amount_changed', 409, { error: 'amount_changed' }],
    ['already_paying', 409, { error: 'already_paying' }],
    ['busy', 409, { error: 'busy' }],
    ['stripe_error', 502, { error: 'payment_unavailable' }],
  ]
  for (const [code, status, body] of cases) {
    it(`${code} is ${status} ${JSON.stringify(body)}`, async () => {
      createMock.mockResolvedValue({ ok: false, code })
      const res = await POST(req(BODY))
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual(body)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
    })
  }

  it('every refusal carries the error key only: no amount, no price data', async () => {
    for (const [code] of cases) {
      createMock.mockResolvedValue({ ok: false, code })
      const res = await POST(req(BODY))
      expect(Object.keys(await res.json()), code).toEqual(['error'])
    }
  })

  it('an unexpected throw is a generic 502 with no detail in the body or the log, and no token anywhere', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    createMock.mockRejectedValue(new Error(`duplicate key value ${TOKEN} sk_live_secret detail`))
    const res = await POST(req(BODY))
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
})

describe('source hygiene', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

  it('the route has the rate-limit key and no-store, and never takes an amount from the body except the displayed value', () => {
    const src = read('app/api/quote/remainder/route.ts')
    expect(src).toContain("checkRateLimit('/api/quote/remainder'")
    expect(src).toContain('no-store')
    expect(src).toContain('.strict()')
    expect(src).not.toMatch(/amountMinor\s*[:=]\s*(body|parsed)/)
  })

  it('the route logs a fixed string only, never a token, a body or a thrown message', () => {
    const src = read('app/api/quote/remainder/route.ts')
    const logLines = src.split('\n').filter((l) => /console\.(log|error|warn|info)/.test(l))
    expect(logLines.length).toBeGreaterThan(0)
    for (const line of logLines) {
      const args = line.trim().replace(/console\.(log|error|warn|info)/, '')
      expect(args).toMatch(/^\('\[quote-[a-z-]+\] [a-z ]+'\)$/)
    }
  })
})
