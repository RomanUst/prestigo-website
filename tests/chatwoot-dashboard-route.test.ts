// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { verifyOperatorMock, loadMock, checkRateLimitMock } = vi.hoisted(() => ({
  verifyOperatorMock: vi.fn(),
  loadMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: () => '203.0.113.7',
}))
vi.mock('@/lib/chatwoot-operator', async () => {
  const actual = await vi.importActual<typeof import('@/lib/chatwoot-operator')>('@/lib/chatwoot-operator')
  return { ...actual, verifyOperator: verifyOperatorMock }
})
vi.mock('@/lib/panel-bookings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/panel-bookings')>('@/lib/panel-bookings')
  return { ...actual, createPanelBookingsStore: () => ({ load: loadMock }) }
})

import { POST } from '@/app/api/chatwoot/dashboard-app/route'
import { PanelStoreError } from '@/lib/panel-bookings'

// Obviously fake token (carried as a constant, never a real credential).
const TOKEN = 'cw_op_FAKE_0123'
const EMAIL = 'jane@example.test'
const URL_ = 'https://rideprestigo.com/api/chatwoot/dashboard-app'

function req(opts: { token?: string | null; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers ?? {}) }
  if (opts.token !== null) headers['api-access-token'] = opts.token ?? TOKEN
  const body = opts.raw ?? JSON.stringify(opts.body === undefined ? { conversationId: 42 } : opts.body)
  return new Request(URL_, { method: 'POST', headers, body })
}

const RPC = {
  identity_found: true,
  phone_mismatch: false,
  espo_lead_id: null,
  total: 1,
  trip_count: 1,
  spent_eur: 120,
  rows: [
    {
      id: 'b1',
      booking_reference: 'PRG-1001',
      status: 'confirmed',
      leg: 'outbound',
      trip_type: 'transfer',
      pickup_utc: '2099-01-01T10:00:00Z',
      pickup_date: '2099-01-01',
      pickup_time: '10:00',
      origin_address: 'Prague Airport',
      destination_address: 'Old Town',
      hours: null,
      vehicle_class: 'business',
      passengers: 2,
      luggage: 1,
      amount_eur: 120,
      outbound_amount_czk: null,
      return_amount_czk: null,
      paid_at: '2098-12-01T10:00:00Z',
      payment_link_url: null,
      flight_number: null,
      special_requests: null,
      driver_name: null,
      trip_progress: null,
      trip_progress_updated_at: null,
    },
  ],
}

const OK_VERIFY = {
  ok: true as const,
  agentId: 9,
  contact: { chatwootContactId: 5, email: EMAIL, phone: null, verified: true },
}

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  verifyOperatorMock.mockReset().mockResolvedValue(OK_VERIFY)
  loadMock.mockReset().mockResolvedValue(RPC)
  checkRateLimitMock.mockReset().mockResolvedValue({ allowed: true, remaining: 29, limit: 30 })
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  logSpy.mockRestore()
})

async function expectHardened(res: Response) {
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
}

describe('POST /api/chatwoot/dashboard-app', () => {
  it('tracer: token + conversationId -> verifyOperator -> panel_bookings -> PanelResponse', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    await expectHardened(res)
    const body = await res.json()
    expect(body.state).toBe('ok')
    expect(body.upcoming).toHaveLength(1)
    expect(Object.keys(body).sort()).toEqual(
      ['contact', 'counters', 'generatedAt', 'leadUrl', 'past', 'pastTruncated', 'state', 'upcoming'].sort(),
    )
    expect(verifyOperatorMock).toHaveBeenCalledWith(TOKEN, 42)
    expect(loadMock).toHaveBeenCalledWith({ email: EMAIL, phone: null, conversationId: 42 })
  })

  it('rate limit is consulted fail-closed for the panel path before anything else', async () => {
    await POST(req())
    expect(checkRateLimitMock).toHaveBeenCalledWith('/api/chatwoot/dashboard-app', '203.0.113.7', {
      failClosed: true,
    })
  })

  describe('token header', () => {
    it('missing header -> 401 invalid_token, verifyOperator never called', async () => {
      const res = await POST(req({ token: null }))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'invalid_token' })
      await expectHardened(res)
      expect(verifyOperatorMock).not.toHaveBeenCalled()
    })

    it('a token with a space -> 401', async () => {
      const res = await POST(req({ token: 'cw op' }))
      expect(res.status).toBe(401)
      expect(verifyOperatorMock).not.toHaveBeenCalled()
    })

    it('a 200 character token -> 401', async () => {
      const res = await POST(req({ token: 'a'.repeat(200) }))
      expect(res.status).toBe(401)
      expect(verifyOperatorMock).not.toHaveBeenCalled()
    })

    it('an Authorization bearer header alone is not accepted', async () => {
      const res = await POST(req({ token: null, headers: { authorization: `Bearer ${TOKEN}` } }))
      expect(res.status).toBe(401)
      expect(verifyOperatorMock).not.toHaveBeenCalled()
    })
  })

  describe('body (D-03: conversationId only)', () => {
    it.each([
      ['an extra email key', '{"conversationId":42,"email":"x@example.test"}'],
      ['an extra phone key', '{"conversationId":42,"phone":"+420123456789"}'],
      ['a string id', '{"conversationId":"42"}'],
      ['zero', '{"conversationId":0}'],
      ['a negative id', '{"conversationId":-3}'],
      ['a fractional id', '{"conversationId":4.5}'],
      ['an id above 2^31-1', '{"conversationId":2147483648}'],
      ['a missing id', '{}'],
      ['an array', '[42]'],
      ['not json', 'not json'],
      ['an empty body', ''],
    ])('%s -> 400 bad_request', async (_name, raw) => {
      const res = await POST(req({ raw }))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad_request' })
      await expectHardened(res)
      expect(verifyOperatorMock).not.toHaveBeenCalled()
      expect(loadMock).not.toHaveBeenCalled()
    })

    it('a body of 3000 bytes -> 413 (no content-length header)', async () => {
      const res = await POST(req({ raw: JSON.stringify({ conversationId: 42, pad: 'x'.repeat(3000) }) }))
      expect(res.status).toBe(413)
      await expectHardened(res)
      expect(verifyOperatorMock).not.toHaveBeenCalled()
    })

    it('a declared content-length over 2000 -> 413', async () => {
      const res = await POST(req({ headers: { 'content-length': '3000' } }))
      expect(res.status).toBe(413)
      await expectHardened(res)
      expect(checkRateLimitMock).not.toHaveBeenCalled()
      expect(verifyOperatorMock).not.toHaveBeenCalled()
    })

    it('accepts the maximum id 2147483647', async () => {
      const res = await POST(req({ body: { conversationId: 2147483647 } }))
      expect(res.status).toBe(200)
      expect(verifyOperatorMock).toHaveBeenCalledWith(TOKEN, 2147483647)
    })
  })

  describe('verifyOperator outcomes', () => {
    it('invalid_token -> 401', async () => {
      verifyOperatorMock.mockResolvedValue({ ok: false, reason: 'invalid_token' })
      const res = await POST(req())
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'invalid_token' })
      await expectHardened(res)
    })

    it('no_access and not_found -> 403 with byte-identical bodies (no oracle)', async () => {
      verifyOperatorMock.mockResolvedValueOnce({ ok: false, reason: 'no_access' })
      const a = await POST(req())
      verifyOperatorMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' })
      const b = await POST(req())
      expect(a.status).toBe(403)
      expect(b.status).toBe(403)
      const [ta, tb] = [await a.text(), await b.text()]
      expect(ta).toBe(tb)
      expect(JSON.parse(ta)).toEqual({ error: 'no_access' })
      await expectHardened(a)
      await expectHardened(b)
      expect(loadMock).not.toHaveBeenCalled()
    })

    it('unavailable -> 502', async () => {
      verifyOperatorMock.mockResolvedValue({ ok: false, reason: 'unavailable' })
      const res = await POST(req())
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'unavailable' })
      await expectHardened(res)
    })

    it('not_configured -> 503', async () => {
      verifyOperatorMock.mockResolvedValue({ ok: false, reason: 'not_configured' })
      const res = await POST(req())
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: 'not_configured' })
      await expectHardened(res)
    })

    it('a thrown verifyOperator -> 502 unavailable', async () => {
      verifyOperatorMock.mockRejectedValue(new Error('boom'))
      const res = await POST(req())
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'unavailable' })
    })
  })

  describe('contact handling', () => {
    it('no email and no phone -> 200 no_contact and the RPC is never called (D-12)', async () => {
      verifyOperatorMock.mockResolvedValue({
        ok: true,
        agentId: 9,
        contact: { chatwootContactId: 5, email: null, phone: null, verified: false },
      })
      const res = await POST(req())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.state).toBe('no_contact')
      expect(body.upcoming).toEqual([])
      expect(loadMock).not.toHaveBeenCalled()
      await expectHardened(res)
    })

    it('a phone-only contact is looked up by phone', async () => {
      verifyOperatorMock.mockResolvedValue({
        ok: true,
        agentId: 9,
        contact: { chatwootContactId: 5, email: null, phone: '+420123456789', verified: false },
      })
      const res = await POST(req())
      expect(res.status).toBe(200)
      expect(loadMock).toHaveBeenCalledWith({ email: null, phone: '+420123456789', conversationId: 42 })
    })

    it('PanelStoreError -> 500 internal', async () => {
      loadMock.mockRejectedValue(new PanelStoreError())
      const res = await POST(req())
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'internal' })
      await expectHardened(res)
    })

    it('any other store failure -> 500 internal as well', async () => {
      loadMock.mockRejectedValue(new Error('unexpected'))
      const res = await POST(req())
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'internal' })
    })
  })

  describe('rate limit', () => {
    it('denied -> 429 rate_limited and verifyOperator never called', async () => {
      checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, limit: 30 })
      const res = await POST(req())
      expect(res.status).toBe(429)
      expect(await res.json()).toEqual({ error: 'rate_limited' })
      await expectHardened(res)
      expect(verifyOperatorMock).not.toHaveBeenCalled()
    })

    it('degraded (limiter down, fail-closed) -> 503 rate_limited', async () => {
      checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, limit: 30, degraded: true })
      const res = await POST(req())
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: 'rate_limited' })
      await expectHardened(res)
      expect(verifyOperatorMock).not.toHaveBeenCalled()
    })
  })

  describe('logging', () => {
    it('logs exactly one PII-free line per request', async () => {
      const cases: Array<() => Promise<Response>> = [
        () => POST(req()),
        () => POST(req({ token: null })),
        () => POST(req({ raw: 'not json' })),
        () => POST(req({ body: { conversationId: 42, email: EMAIL } })),
      ]
      for (const run of cases) {
        logSpy.mockClear()
        await run()
        expect(logSpy).toHaveBeenCalledTimes(1)
        const line = String(logSpy.mock.calls[0].join(' '))
        expect(line).toMatch(/^\[panel\] outcome=\S+ code=\d{3}$/)
        expect(line).not.toContain(TOKEN)
        expect(line).not.toContain(EMAIL)
        expect(line).not.toContain('42')
      }
    })
  })

  it('exports no GET, PUT, PATCH or DELETE handler', async () => {
    const mod = (await import('@/app/api/chatwoot/dashboard-app/route')) as Record<string, unknown>
    for (const m of ['GET', 'PUT', 'PATCH', 'DELETE']) expect(mod[m]).toBeUndefined()
    expect(mod.runtime).toBe('nodejs')
    expect(mod.dynamic).toBe('force-dynamic')
    expect(mod.maxDuration).toBe(10)
  })
})
