// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.CRON_SECRET = 'test-cron-secret'

// ── vi.hoisted stubs (declared before the vi.mock factories) ────────────────

const { mockExpired, mockPurge, mockDue, mockPublish } = vi.hoisted(() => ({
  mockExpired: vi.fn(),
  mockPurge: vi.fn(),
  mockDue: vi.fn(),
  mockPublish: vi.fn(),
}))

vi.mock('@/lib/outbox-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outbox-store')>()
  return {
    ...actual,
    enqueueExpiredUnpaid: mockExpired,
    enqueueAbandonedPurge: mockPurge,
    dueKeys: mockDue,
  }
})

vi.mock('@/lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outbox')>()
  return { ...actual, publishOutboxDispatch: mockPublish }
})

import { GET, maxDuration } from '@/app/api/cron/outbox-sweep/route'
import { createFakeEspoCRM } from './helpers/fake-espocrm'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteEspoClient } from '@/lib/espocrm-client'
import type { BookingRecord, OutboxRow, OutboxStore } from '@/lib/outbox-store'
import { readFileSync } from 'fs'
import { join } from 'path'

// ── Helpers ─────────────────────────────────────────────────────────────────

const SECRET = 'test-cron-secret'
const req = (auth?: string) =>
  new Request('https://example.test/api/cron/outbox-sweep', {
    headers: auth === undefined ? {} : { authorization: auth },
  })
const ok = () => req(`Bearer ${SECRET}`)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  mockExpired.mockResolvedValue(0)
  mockPurge.mockResolvedValue(0)
  mockDue.mockResolvedValue([])
  mockPublish.mockResolvedValue(true)
})

// ── Auth guard (T-81-30) ────────────────────────────────────────────────────

describe('GET /api/cron/outbox-sweep - auth', () => {
  it('401 without an Authorization header, and does no work', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(mockExpired).not.toHaveBeenCalled()
    expect(mockPurge).not.toHaveBeenCalled()
    expect(mockDue).not.toHaveBeenCalled()
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('401 with a wrong bearer (same length and different length)', async () => {
    expect((await GET(req('Bearer test-cron-secreX'))).status).toBe(401)
    expect((await GET(req('Bearer nope'))).status).toBe(401)
    expect((await GET(req(SECRET))).status).toBe(401)
    expect(mockExpired).not.toHaveBeenCalled()
  })

  it('401 (fail closed) when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req('Bearer undefined'))
    expect(res.status).toBe(401)
    expect(mockExpired).not.toHaveBeenCalled()
  })

  it('exports maxDuration 300', () => {
    expect(maxDuration).toBe(300)
  })
})

// ── Steps ───────────────────────────────────────────────────────────────────

describe('GET /api/cron/outbox-sweep - steps', () => {
  it('200 with counts per step; publishes every due key once with a per-day dedupSuffix', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T04:00:00.000Z'))
    try {
      mockExpired.mockResolvedValue(3)
      mockPurge.mockResolvedValue(1)
      mockDue.mockResolvedValue(['lead.inquiry:a', 'lead.booking:b:dead'])

      const res = await GET(ok())
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual({ ok: true, expired: 3, purge: 1, due: 2, published: 2, errors: [] })
      expect(mockDue).toHaveBeenCalledWith(200)
      expect(mockPublish).toHaveBeenCalledTimes(2)
      expect(mockPublish).toHaveBeenCalledWith('lead.inquiry:a', { dedupSuffix: 's20261018' })
      expect(mockPublish).toHaveBeenCalledWith('lead.booking:b:dead', { dedupSuffix: 's20261018' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('enqueue steps run before the due-keys read, so freshly enqueued rows are published today', async () => {
    const order: string[] = []
    mockExpired.mockImplementation(async () => (order.push('expired'), 1))
    mockPurge.mockImplementation(async () => (order.push('purge'), 0))
    mockDue.mockImplementation(async () => (order.push('due'), []))
    await GET(ok())
    expect(order).toEqual(['expired', 'purge', 'due'])
  })

  it('a failing step reports null + a code and the other steps still run', async () => {
    mockExpired.mockRejectedValue(new Error('boom'))
    mockPurge.mockResolvedValue(2)
    mockDue.mockResolvedValue(['lead.inquiry:a'])

    const res = await GET(ok())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.expired).toBeNull()
    expect(body.errors).toEqual(['expired_failed'])
    expect(body.purge).toBe(2)
    expect(body.published).toBe(1)
    expect(mockPurge).toHaveBeenCalled()
    expect(mockDue).toHaveBeenCalled()
  })

  it('every step failing still answers 200 with all three codes and no payload text', async () => {
    mockExpired.mockRejectedValue(new Error('secret-detail-1'))
    mockPurge.mockRejectedValue(new Error('secret-detail-2'))
    mockDue.mockRejectedValue(new Error('secret-detail-3'))

    const res = await GET(ok())
    const text = await res.text()
    const body = JSON.parse(text)

    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      expired: null,
      purge: null,
      due: null,
      published: null,
      errors: ['expired_failed', 'purge_failed', 'due_failed'],
    })
    expect(text).not.toContain('secret-detail')
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('publishes in batches of at most 10 in flight', async () => {
    const keys = Array.from({ length: 25 }, (_, i) => `lead.inquiry:${i}`)
    mockDue.mockResolvedValue(keys)
    let inFlight = 0
    let maxSeen = 0
    mockPublish.mockImplementation(async () => {
      inFlight++
      maxSeen = Math.max(maxSeen, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return true
    })

    const body = await (await GET(ok())).json()

    expect(body.due).toBe(25)
    expect(body.published).toBe(25)
    expect(maxSeen).toBeLessThanOrEqual(10)
    expect(maxSeen).toBeGreaterThan(1)
  })

  it('counts only publishes that returned true; a publish that throws does not stop the rest', async () => {
    mockDue.mockResolvedValue(['k1', 'k2', 'k3'])
    mockPublish.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('x'))

    const body = await (await GET(ok())).json()

    expect(body.due).toBe(3)
    expect(body.published).toBe(1)
    expect(mockPublish).toHaveBeenCalledTimes(3)
  })
})

// ── Static guards ───────────────────────────────────────────────────────────

describe('outbox-sweep wiring', () => {
  it('the route imports no CRM code (not allowlisted by the VPS isolation guard)', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/cron/outbox-sweep/route.ts'), 'utf8')
    expect(src).not.toMatch(/lead-sync|espocrm/i)
  })

  it('vercel.json keeps the three existing crons and adds the daily sweep', () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>
    }
    expect(cfg.crons).toEqual([
      { path: '/api/cron/flight-refresh', schedule: '0 5 * * *' },
      { path: '/api/cron/reminder-24h', schedule: '0 6 * * *' },
      { path: '/api/cron/indexnow', schedule: '0 7 * * *' },
      { path: '/api/cron/outbox-sweep', schedule: '0 4 * * *' },
    ])
  })
})

// ── Tracer: expired unpaid booking -> sweep -> publish -> dispatch -> Lead Dead ─

describe('tracer: daily sweep turns an expired unpaid checkout Dead in the CRM', () => {
  const NOW = new Date('2026-10-18T04:00:00.000Z')
  const ID = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
  const KEY = `lead.booking:${ID}:dead`
  const API_KEY = 'key_SECRET_abcdef0123'
  const CONFIG = { baseUrl: 'https://crm.example.test', apiKey: API_KEY, leadAssigneeId: null as string | null }

  const expiredBooking: BookingRecord = {
    id: ID,
    booking_reference: 'PRG-20261015-0001',
    status: 'unpaid',
    booking_source: 'online',
    lead_channel: null,
    leg: 'outbound',
    trip_type: 'one_way',
    payment_intent_id: null,
    attempt_id: null,
    payment_link_id: null,
    pickup_utc: '2026-10-17T09:00:00.000Z', // yesterday
    pickup_date: '2026-10-17',
    pickup_time: '11:00',
    origin_address: 'Prague Airport',
    destination_address: 'Prague Old Town',
    vehicle_class: 'business',
    passengers: 2,
    hours: null,
    amount_eur: 45,
    client_first_name: 'Anna',
    client_last_name: 'Novak',
    client_email: 'anna@example.com',
    client_phone: '+420 725 986 855',
    created_at: '2026-10-15T10:00:00.000Z',
  }

  it('enqueues :dead, publishes it, and the dispatcher sets the existing New Lead to Dead', async () => {
    const rows = new Map<string, OutboxRow>()
    const publishedKeys: string[] = []

    // The sweep's three store calls, backed by an in-memory outbox with the SQL semantics of 068.
    mockExpired.mockImplementation(async () => {
      let n = 0
      if (expiredBooking.status === 'unpaid' && Date.parse(expiredBooking.pickup_utc!) < NOW.getTime() && !rows.has(KEY)) {
        rows.set(KEY, {
          idempotency_key: KEY,
          event_type: 'lead.booking',
          aggregate_type: 'booking',
          aggregate_id: ID,
          status: 'pending',
          attempts: 0,
          available_at: NOW.toISOString(),
          lease_until: null,
          last_error: null,
        })
        n++
      }
      return n
    })
    mockDue.mockImplementation(async () =>
      [...rows.values()]
        .filter((r) => r.status === 'pending' && Date.parse(r.available_at) <= NOW.getTime())
        .map((r) => r.idempotency_key),
    )
    mockPublish.mockImplementation(async (key: string) => {
      publishedKeys.push(key)
      return true
    })

    // A Lead created when the checkout was captured (New).
    const fake = createFakeEspoCRM({
      records: {
        Lead: [{ id: 'a00000000000000a1', cSupabaseRef: `booking:${ID}`, status: 'New', source: 'Website booking' }],
        Contact: [],
      },
    })
    const crm = createSiteEspoClient({ config: CONFIG, fetchImpl: fake.fetchImpl as unknown as typeof fetch, timeoutMs: 200 })

    // 1. the cron call
    const res = await GET(ok())
    const body = await res.json()
    expect(body.expired).toBe(1)
    expect(body.published).toBe(1)
    expect(publishedKeys).toEqual([KEY])

    // 2. the QStash message reaches the dispatcher
    const store: OutboxStore = {
      async claim(key) {
        const row = rows.get(key)
        if (!row || row.status !== 'pending') return null
        row.status = 'processing'
        row.attempts += 1
        return { ...row }
      },
      async getByKey(key) {
        const row = rows.get(key)
        return row ? { ...row } : null
      },
      async complete(key, status, code) {
        const row = rows.get(key)
        if (!row) return false
        row.status = status
        row.last_error = code
        return true
      },
      async reschedule() {
        return true
      },
      async readInquiry() {
        return null
      },
      async readBooking() {
        return { ...expiredBooking }
      },
      async readReturnLeg() {
        return null
      },
      async readCaptureStart() {
        return new Date('2026-10-01T00:00:00.000Z')
      },
    }

    const result = await dispatchOutboxKey(publishedKeys[0], {
      store,
      crm,
      config: CONFIG,
      publish: mockPublish as unknown as DispatchDeps['publish'],
      now: () => NOW,
    })

    expect(result).toEqual({ outcome: 'sent' })
    expect(fake.state.records.Lead).toHaveLength(1)
    expect(fake.state.records.Lead[0].status).toBe('Dead')
    expect(rows.get(KEY)?.status).toBe('sent')

    // 3. the next day's run enqueues nothing new and finds nothing due
    mockPublish.mockClear()
    const again = await (await GET(ok())).json()
    expect(again.expired).toBe(0)
    expect(again.due).toBe(0)
    expect(mockPublish).not.toHaveBeenCalled()
  })
})
