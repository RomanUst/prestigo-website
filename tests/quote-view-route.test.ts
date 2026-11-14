// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { countingClient, seedPublicQuote, type PublicQuoteSeed } from './helpers/quote-public-fixture'
import { hashQuoteToken, newQuoteToken } from '@/lib/quotes/token'

/**
 * Phase 92 plan 92-09 Task 3 (QUOTE-02; D-10; T-92-29, T-92-30, T-92-32): POST /api/quote/view records "viewed" once.
 * The real route, resolver and event writer run against the in-memory payments database; only the rate limiter is
 * replaced.
 */

const { world, rate } = vi.hoisted(() => ({
  world: { client: null as null | { from: (t: string) => unknown } },
  rate: { allowed: true, calls: [] as Array<[string, string]> },
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ from: (table: string) => world.client!.from(table) }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async (path: string, ip: string) => {
    rate.calls.push([path, ip])
    return { allowed: rate.allowed, remaining: 1, limit: 20 }
  }),
  getClientIp: () => '203.0.113.9',
}))

import { POST } from '@/app/api/quote/view/route'

let db: FakePaymentsDb
let counter: ReturnType<typeof countingClient>

function req(body: unknown, raw?: string, extraHeaders: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/quote/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: raw ?? JSON.stringify(body),
  })
}

async function seed(over: PublicQuoteSeed = {}) {
  const fx = await seedPublicQuote(db, { pickupDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10), ...over })
  counter.writes.count = 0
  return fx
}

beforeEach(() => {
  db = createFakePaymentsDb()
  counter = countingClient(db)
  world.client = counter
  rate.allowed = true
  rate.calls = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/quote/view: guard order', () => {
  it('a body over 2_000 bytes is 413 before anything else, with no-store', async () => {
    const fx = await seed()
    const res = await POST(req({ token: fx.token }, undefined, { 'content-length': '2001' }))
    expect(res.status).toBe(413)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(rate.calls).toEqual([])
  })

  it('a denied rate limit is 429 before the body is read', async () => {
    const fx = await seed()
    rate.allowed = false
    const res = await POST(req({ token: fx.token }))
    expect(res.status).toBe(429)
    expect(rate.calls).toEqual([['/api/quote/view', '203.0.113.9']])
    expect(db.state.quotes[0].status).toBe('sent')
  })

  it('malformed JSON is 400', async () => {
    const res = await POST(req(null, '{not json'))
    expect(res.status).toBe(400)
  })

  it('an unknown key is 400 (strict schema)', async () => {
    const fx = await seed()
    const res = await POST(req({ token: fx.token, status: 'paid' }))
    expect(res.status).toBe(400)
    expect(db.state.quotes[0].status).toBe('sent')
  })

  it.each([[{}], [{ token: 42 }], [{ token: 'short' }], [{ token: 'A'.repeat(44) }], [[]], ['text']])(
    'a missing or malformed token %j is 400 and never reaches the database',
    async (body) => {
      const res = await POST(req(body))
      expect(res.status).toBe(400)
      expect(counter.writes.count).toBe(0)
    },
  )

  it('an unknown, revoked, superseded, voided, draft or past-pickup token is the same 404 body', async () => {
    const bodies: string[] = []
    const cases: Array<PublicQuoteSeed | 'unknown'> = [
      'unknown',
      { revokeLink: true },
      { supersede: true },
      { status: 'voided' },
      { status: 'draft' },
      { pickupDate: '2026-01-01' },
    ]
    for (const c of cases) {
      db = createFakePaymentsDb()
      counter = countingClient(db)
      world.client = counter
      const fx = await seed(c === 'unknown' ? {} : c)
      const token = c === 'unknown' ? newQuoteToken() : fx.token
      const res = await POST(req({ token }))
      expect(res.status).toBe(404)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      bodies.push(await res.text())
      expect(db.state.quote_events).toHaveLength(0)
    }
    expect(new Set(bodies)).toEqual(new Set([JSON.stringify({ error: 'invalid_link' })]))
  })
})

describe('POST /api/quote/view: viewed once', () => {
  it('a sent quote becomes viewed with one viewed event', async () => {
    const fx = await seed({ status: 'sent' })
    const res = await POST(req({ token: fx.token }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(db.state.quotes[0].status).toBe('viewed')
    expect(db.state.quote_events).toHaveLength(1)
    expect(db.state.quote_events[0]).toMatchObject({
      quote_id: fx.quoteId,
      kind: 'viewed',
      event_key: `viewed:${fx.versionId}`,
      actor_type: 'client',
    })
  })

  it('a second POST answers 200 and adds nothing', async () => {
    const fx = await seed({ status: 'sent' })
    await POST(req({ token: fx.token }))
    const stateAfterFirst = JSON.stringify(db.state)
    const res = await POST(req({ token: fx.token }))
    expect(res.status).toBe(200)
    expect(JSON.stringify(db.state)).toBe(stateAfterFirst)
    expect(db.state.quote_events).toHaveLength(1)
    expect(db.state.quotes[0].status).toBe('viewed')
  })

  it.each(['viewed', 'accepted', 'paid'] as const)('a %s quote answers 200 and stays unchanged', async (status) => {
    const fx = await seed({ status })
    const res = await POST(req({ token: fx.token }))
    expect(res.status).toBe(200)
    expect(db.state.quotes[0].status).toBe(status)
    expect(db.state.quote_events).toHaveLength(0)
  })

  it('every answer has Cache-Control no-store', async () => {
    const fx = await seed()
    const answers = [
      await POST(req({ token: fx.token })),
      await POST(req({ token: newQuoteToken() })),
      await POST(req({}, '{bad')),
      await POST(req({ nope: 1 })),
    ]
    for (const res of answers) expect(res.headers.get('Cache-Control')).toBe('no-store')
    rate.allowed = false
    expect((await POST(req({ token: fx.token }))).headers.get('Cache-Control')).toBe('no-store')
  })

  it('a database failure while recording still answers 200 and logs neither the token nor its hash', async () => {
    const fx = await seed({ status: 'sent' })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    // Reads work, the compare-and-set write fails with a message that echoes a value.
    world.client = {
      from: (table: string) => {
        const q = counter.from(table) as Record<string, unknown>
        if (table === 'quotes') {
          q.update = () => {
            throw new Error(`write failed for ${fx.token}`)
          }
        }
        return q
      },
    }
    const res = await POST(req({ token: fx.token }))
    expect(res.status).toBe(200)
    const output = JSON.stringify([...errors.mock.calls, ...warns.mock.calls, ...logs.mock.calls])
    expect(output).not.toContain(fx.token)
    expect(output).not.toContain(hashQuoteToken(fx.token))
  })
})

describe('route source', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/quote/view/route.ts'), 'utf8')

  it('uses the /api/quote/view rate-limit key and no-store', () => {
    expect(source).toContain("checkRateLimit('/api/quote/view'")
    expect(source).toContain('no-store')
  })

  it('never writes the token to a log', () => {
    const consoleLines = source.split('\n').filter((l) => /console\./.test(l))
    for (const line of consoleLines) expect(line).not.toMatch(/token|body|parsed/i)
  })
})
