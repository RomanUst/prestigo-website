// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createFakeEspoCRM, type FakeEspoOptions } from './helpers/fake-espocrm'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteEspoClient } from '@/lib/espocrm-client'
import { OutboxStoreError, type OutboxRow, type OutboxStore } from '@/lib/outbox-store'
import type { InquiryRow } from '@/lib/lead-mapping'

// ── Fixtures ────────────────────────────────────────────────────────────────

const API_KEY = 'key_SECRET_abcdef0123'
const NOW = new Date('2026-10-18T12:00:00.000Z')
const ID_A = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const ID_B = '1c0a3d2f-6e4b-4f9c-8d8e-2b3c4d5e6f70'
const keyOf = (id: string) => `lead.inquiry:${id}`

const CONFIG = { baseUrl: 'https://crm.example.test', apiKey: API_KEY, leadAssigneeId: null as string | null }

function inquiry(id: string, over: Partial<InquiryRow> = {}): InquiryRow {
  return {
    id,
    kind: 'contact',
    email: 'Anna@Example.com',
    name: 'Anna Novak',
    phone: '+420 725 986 855',
    company: null,
    payload: { service: 'Airport transfer', message: 'Hello there' },
    created_at: '2026-10-18T11:00:00.000Z',
    ...over,
  }
}

function outboxRow(id: string, over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    idempotency_key: keyOf(id),
    event_type: 'lead.inquiry',
    aggregate_type: 'inquiry',
    aggregate_id: id,
    status: 'pending',
    attempts: 0,
    available_at: new Date(NOW.getTime() - 1000).toISOString(),
    lease_until: null,
    last_error: null,
    ...over,
  }
}

/** In-memory OutboxStore with the claim semantics of migration 064. */
function makeStore(opts: { rows?: OutboxRow[]; inquiries?: InquiryRow[]; now?: () => Date } = {}) {
  const now = opts.now ?? (() => NOW)
  const rows = new Map<string, OutboxRow>((opts.rows ?? []).map((r) => [r.idempotency_key, { ...r }]))
  const inquiries = new Map<string, InquiryRow>((opts.inquiries ?? []).map((i) => [i.id, i]))
  const calls = {
    claim: [] as string[],
    complete: [] as Array<{ key: string; status: string; code: string | null }>,
    reschedule: [] as Array<{ key: string; availableAt: Date; code: string }>,
    readInquiry: [] as string[],
  }
  const store: OutboxStore = {
    async claim(key) {
      calls.claim.push(key)
      const row = rows.get(key)
      if (!row) return null
      const due = Date.parse(row.available_at) <= now().getTime()
      const leaseLive = row.lease_until !== null && Date.parse(row.lease_until) > now().getTime()
      if (due && (row.status === 'pending' || (row.status === 'processing' && !leaseLive))) {
        row.status = 'processing'
        row.attempts += 1
        row.lease_until = new Date(now().getTime() + 120_000).toISOString()
        return { ...row }
      }
      return null
    },
    async getByKey(key) {
      const row = rows.get(key)
      return row ? { ...row } : null
    },
    async complete(key, status, code) {
      calls.complete.push({ key, status, code })
      const row = rows.get(key)
      if (!row || row.status !== 'processing') return false
      row.status = status
      row.last_error = code
      row.lease_until = null
      return true
    },
    async reschedule(key, availableAt, code) {
      calls.reschedule.push({ key, availableAt, code })
      const row = rows.get(key)
      if (!row || row.status !== 'processing') return false
      row.status = 'pending'
      row.available_at = availableAt.toISOString()
      row.last_error = code
      row.lease_until = null
      return true
    },
    async readInquiry(id) {
      calls.readInquiry.push(id)
      return inquiries.get(id) ?? null
    },
  }
  return { store, rows, inquiries, calls }
}

/** Fake EspoCRM that also models the 409-unless-X-Skip-Duplicate-Check rule of the real instance. */
function makeCrm(options: FakeEspoOptions = {}, config = CONFIG) {
  const fake = createFakeEspoCRM({
    ...options,
    records: { Lead: [], Contact: [], ...(options.records ?? {}) },
    extraRoutes: async (req, state) => {
      if (
        req.method === 'POST' &&
        req.path === '/Lead' &&
        req.headers['x-skip-duplicate-check'] !== 'true' &&
        req.body?.emailAddress &&
        state.records.Lead.some((l) => l.emailAddress === req.body.emailAddress)
      ) {
        return new Response('', { status: 409 })
      }
      return options.extraRoutes?.(req, state)
    },
  })
  const crm = createSiteEspoClient({ config, fetchImpl: fake.fetchImpl as unknown as typeof fetch, timeoutMs: 200 })
  return { fake, crm, config }
}

type Harness = ReturnType<typeof makeStore> & ReturnType<typeof makeCrm> & { publish: ReturnType<typeof vi.fn> }

function harness(
  storeOpts: Parameters<typeof makeStore>[0] = {},
  crmOpts: FakeEspoOptions = {},
  config = CONFIG,
): Harness {
  const s = makeStore(storeOpts)
  const c = makeCrm(crmOpts, config)
  const publish = vi.fn(async () => true)
  return { ...s, ...c, publish }
}

function deps(h: Harness, over: Partial<DispatchDeps> = {}): Partial<DispatchDeps> {
  return {
    store: h.store,
    crm: h.crm,
    config: h.config,
    publish: h.publish as unknown as DispatchDeps['publish'],
    now: () => NOW,
    ...over,
  }
}

const leadRequests = (h: Harness) => h.fake.requests.filter((r) => r.path.startsWith('/Lead'))

// ── Task 1: tracer ──────────────────────────────────────────────────────────

describe('dispatchOutboxKey - tracer (inquiry -> Lead)', () => {
  it('creates exactly one Lead from the inquiry and marks the row sent', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(h.fake.state.records.Lead).toHaveLength(1)
    const lead = h.fake.state.records.Lead[0]
    expect(lead.cSupabaseRef).toBe(`inquiry:${ID_A}`)
    expect(lead.source).toBe('Contact form')
    expect(lead.status).toBe('New')
    expect(lead.emailAddress).toBe('anna@example.com')
    const post = h.fake.requests.find((r) => r.method === 'POST' && r.path === '/Lead')
    expect(post?.headers['x-skip-duplicate-check']).toBe('true')
    expect(post?.headers['x-api-key']).toBe(API_KEY)
    expect(h.rows.get(keyOf(ID_A))?.status).toBe('sent')
  })

  it('a second dispatch of the same key is already_done and sends no request', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })
    await dispatchOutboxKey(keyOf(ID_A), deps(h))
    const before = h.fake.requests.length

    const again = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(again.outcome).toBe('already_done')
    expect(h.fake.requests.length).toBe(before)
    expect(h.fake.state.records.Lead).toHaveLength(1)
  })

  it('a missing inquiry row is skipped with source_missing and no CRM request', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [] })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'skipped', code: 'source_missing' })
    expect(h.fake.requests).toHaveLength(0)
    expect(h.rows.get(keyOf(ID_A))?.status).toBe('skipped')
  })

  it('a malformed key is unknown_key and never touches the store', async () => {
    const h = harness()

    const result = await dispatchOutboxKey('lead.inquiry:not-a-uuid', deps(h))

    expect(result.outcome).toBe('unknown_key')
    expect(h.calls.claim).toHaveLength(0)
    expect(h.fake.requests).toHaveLength(0)
  })

  it('a well-formed key with no outbox row is unknown_key', async () => {
    const h = harness()

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result.outcome).toBe('unknown_key')
    expect(h.fake.requests).toHaveLength(0)
  })

  it('an unsupported event type is failed unsupported_event', async () => {
    const key = `lead.purge:${ID_A}`
    const h = harness({
      rows: [outboxRow(ID_A, { idempotency_key: key, event_type: 'lead.purge', aggregate_type: 'booking' })],
    })

    const result = await dispatchOutboxKey(key, deps(h))

    expect(result).toEqual({ outcome: 'failed', code: 'unsupported_event' })
    expect(h.fake.requests).toHaveLength(0)
  })
})

// ── Task 2: VPS-down resilience ─────────────────────────────────────────────

const status = (code: number) => (req: { path: string }) =>
  req.path.startsWith('/Lead') ? new Response('', { status: code }) : undefined

const rejectingFetch = (async () => {
  throw new TypeError('fetch failed')
}) as unknown as typeof fetch

describe('dispatchOutboxKey - vps down', () => {
  it('reschedules with backoff when the CRM does not answer, then delivers exactly one Lead once it is back', async () => {
    const clock = { t: NOW }
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)], now: () => clock.t }, { stallPaths: ['/Lead'] })

    const down = await dispatchOutboxKey(keyOf(ID_A), deps(h, { now: () => clock.t }))

    expect(down).toEqual({ outcome: 'rescheduled', code: 'crm_unreachable' })
    expect(h.calls.reschedule).toHaveLength(1)
    expect(h.calls.reschedule[0].availableAt.getTime()).toBe(NOW.getTime() + 60_000)
    expect(h.calls.reschedule[0].code).toMatch(/^crm_/)
    expect(h.publish).toHaveBeenCalledWith(keyOf(ID_A), { delaySeconds: 60, dedupSuffix: 'a1' })
    expect(h.rows.get(keyOf(ID_A))?.status).toBe('pending')
    expect(h.fake.state.records.Lead).toHaveLength(0)

    // The VPS is back and the row is due again.
    clock.t = new Date(NOW.getTime() + 61_000)
    const healthy = makeCrm()
    const up = await dispatchOutboxKey(keyOf(ID_A), deps(h, { crm: healthy.crm, now: () => clock.t }))

    expect(up).toEqual({ outcome: 'sent' })
    expect(healthy.fake.state.records.Lead).toHaveLength(1)
    expect(h.rows.get(keyOf(ID_A))?.status).toBe('sent')
  })

  it('a network error reschedules and a repeat grows the delay', async () => {
    const clock = { t: NOW }
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)], now: () => clock.t })
    const crm = createSiteEspoClient({ config: CONFIG, fetchImpl: rejectingFetch })

    await dispatchOutboxKey(keyOf(ID_A), deps(h, { crm, now: () => clock.t }))
    const secondRun = new Date(NOW.getTime() + 61_000)
    clock.t = secondRun
    await dispatchOutboxKey(keyOf(ID_A), deps(h, { crm, now: () => clock.t }))

    expect(h.calls.reschedule[0].availableAt.getTime() - NOW.getTime()).toBe(60_000)
    expect(h.calls.reschedule[1].availableAt.getTime() - secondRun.getTime()).toBe(300_000)
    expect(h.publish).toHaveBeenNthCalledWith(2, keyOf(ID_A), { delaySeconds: 300, dedupSuffix: 'a2' })
  })

  it('503 and 429 reschedule', async () => {
    for (const code of [503, 429]) {
      const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] }, { extraRoutes: status(code) })
      const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))
      expect(result).toEqual({ outcome: 'rescheduled', code: `crm_${code}` })
      expect(h.rows.get(keyOf(ID_A))?.status).toBe('pending')
    }
  })

  it('the 30th failed attempt becomes failed crm_unreachable_exhausted', async () => {
    const h = harness({ rows: [outboxRow(ID_A, { attempts: 29 })], inquiries: [inquiry(ID_A)] })
    const crm = createSiteEspoClient({ config: CONFIG, fetchImpl: rejectingFetch })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h, { crm }))

    expect(result).toEqual({ outcome: 'failed', code: 'crm_unreachable_exhausted' })
    expect(result.code!.length).toBeLessThanOrEqual(40)
    expect(h.rows.get(keyOf(ID_A))?.status).toBe('failed')
    expect(h.publish).not.toHaveBeenCalled()
  })
})

describe('dispatchOutboxKey - auth', () => {
  it('a 401 makes one request, reschedules 6 h later with crm_auth and is a breaker', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] }, {}, { ...CONFIG, apiKey: 'wrong_key_0000' })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'breaker', code: 'crm_auth' })
    expect(h.fake.requests).toHaveLength(1)
    expect(h.calls.reschedule[0].availableAt.getTime()).toBe(NOW.getTime() + 21_600_000)
    expect(h.calls.reschedule[0].code).toBe('crm_auth')
    expect(h.publish).toHaveBeenCalledWith(keyOf(ID_A), { delaySeconds: 21600, dedupSuffix: 'a1' })
    expect(h.rows.get(keyOf(ID_A))?.status).toBe('pending')
  })

  it('a 403 is also a breaker with one request', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] }, { extraRoutes: status(403) })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'breaker', code: 'crm_auth' })
    expect(h.fake.requests).toHaveLength(1)
  })
})

describe('dispatchOutboxKey - unconfigured', () => {
  it('without CRM config it makes zero requests and reschedules 6 h later with crm_unconfigured', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h, { config: null, crm: null }))

    expect(result).toEqual({ outcome: 'breaker', code: 'crm_unconfigured' })
    expect(h.fake.requests).toHaveLength(0)
    expect(h.calls.reschedule[0].availableAt.getTime()).toBe(NOW.getTime() + 21_600_000)
    expect(h.calls.reschedule[0].code).toBe('crm_unconfigured')
    expect(h.publish).toHaveBeenCalledWith(keyOf(ID_A), { delaySeconds: 21600, dedupSuffix: 'a1' })
  })
})

describe('dispatchOutboxKey - permanent errors and internal failures', () => {
  it('a 400 on create without a phone number is failed crm_400', async () => {
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A, { phone: null })] },
      { extraRoutes: (req) => (req.method === 'POST' && req.path === '/Lead' ? new Response('', { status: 400 }) : undefined) },
    )

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'failed', code: 'crm_400' })
    expect(h.rows.get(keyOf(ID_A))?.status).toBe('failed')
    expect(h.publish).not.toHaveBeenCalled()
  })

  it('a store error while reading the source reschedules with db_error', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })
    h.store.readInquiry = async () => {
      throw new OutboxStoreError('db_error')
    }

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'rescheduled', code: 'db_error' })
    expect(h.calls.reschedule[0].code).toBe('db_error')
  })

  it('an unexpected exception reschedules with internal_error', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })
    h.store.readInquiry = async () => {
      throw new Error('kaboom anna@example.com')
    }

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'rescheduled', code: 'internal_error' })
    expect(h.calls.reschedule[0].code).toBe('internal_error')
  })

  it('throws only when even the reschedule cannot reach the store', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })
    h.store.readInquiry = async () => {
      throw new Error('x')
    }
    h.store.reschedule = async () => {
      throw new OutboxStoreError('db_error')
    }

    await expect(dispatchOutboxKey(keyOf(ID_A), deps(h))).rejects.toBeInstanceOf(OutboxStoreError)
  })

  it('a claim that cannot reach the store throws so QStash retries', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })
    h.store.claim = async () => {
      throw new OutboxStoreError('db_error')
    }

    await expect(dispatchOutboxKey(keyOf(ID_A), deps(h))).rejects.toBeInstanceOf(OutboxStoreError)
  })
})

describe('dispatchOutboxKey - logging', () => {
  it('writes no email, name, phone, message or API key to the console in any outcome', async () => {
    const lines: string[] = []
    const capture = (...args: unknown[]) => void lines.push(args.map((a) => String(a)).join(' '))
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(capture),
    )

    try {
      const scenarios: Array<() => Promise<unknown>> = [
        async () => {
          const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })
          return dispatchOutboxKey(keyOf(ID_A), deps(h))
        },
        async () => {
          const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] }, { extraRoutes: status(503) })
          return dispatchOutboxKey(keyOf(ID_A), deps(h))
        },
        async () => {
          const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] }, {}, { ...CONFIG, apiKey: 'wrong_key_0000' })
          return dispatchOutboxKey(keyOf(ID_A), deps(h))
        },
        async () => {
          const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })
          return dispatchOutboxKey(keyOf(ID_A), deps(h, { config: null, crm: null }))
        },
        async () => {
          const h = harness(
            { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
            {
              extraRoutes: (req) =>
                req.method === 'POST' ? new Response('anna@example.com Anna Novak Hello there', { status: 400 }) : undefined,
            },
          )
          return dispatchOutboxKey(keyOf(ID_A), deps(h))
        },
        async () => {
          const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })
          h.store.readInquiry = async () => {
            throw new Error('boom anna@example.com')
          }
          return dispatchOutboxKey(keyOf(ID_A), deps(h))
        },
      ]
      for (const run of scenarios) await run()
    } finally {
      spies.forEach((s) => s.mockRestore())
    }

    expect(lines.length).toBeGreaterThanOrEqual(6)
    const all = lines.join('\n')
    expect(all).not.toContain('@')
    expect(all).not.toContain(API_KEY)
    expect(all).not.toContain('wrong_key')
    expect(all).not.toMatch(/anna|novak|hello|\+420/i)
    for (const line of lines) {
      expect(line).toMatch(/^\[lead-sync\] key=lead\.inquiry:[0-9a-f-]{36} outcome=[a-z_]+ code=[a-z0-9_-]+$/)
    }
  })
})
