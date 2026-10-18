// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createFakeEspoCRM, type FakeEspoOptions } from './helpers/fake-espocrm'
import { deferDedupSuffix, dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteEspoClient } from '@/lib/espocrm-client'
import { OutboxStoreError, type OutboxRow, type OutboxStore } from '@/lib/outbox-store'
import type { InquiryRow } from '@/lib/lead-mapping'

// ── Fixtures ────────────────────────────────────────────────────────────────

const API_KEY = 'key_SECRET_abcdef0123'
const NOW = new Date('2026-10-18T12:00:00.000Z')
const ID_A = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const ID_B = '1c0a3d2f-6e4b-4f9c-8d8e-2b3c4d5e6f70'
const keyOf = (id: string) => `lead.inquiry:${id}`
const deferId = (attempts: number, delay: number) => `d${attempts}_${NOW.getTime() / 1000 + delay}`

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
    // Booking reads belong to tests/lead-sync-booking.test.ts; inquiry tests never reach them.
    async readBooking() {
      return null
    },
    async readReturnLeg() {
      return null
    },
    async readCaptureStart() {
      return null
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
    // lead.purge became a supported event in 81-10; the row's event_type is what the dispatcher switches on.
    const key = keyOf(ID_A)
    const h = harness({
      rows: [outboxRow(ID_A, { idempotency_key: key, event_type: 'lead.something_else', aggregate_type: 'booking' })],
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

// ── Task 3: existing customer, assignee, idempotent update, phone retry, duplicates ──

const CONTACT_ID = 'c00000000000000a1'
const ASSIGNEE = 'a1b2c3d4e5f6a7b8c'
const writes = (h: Harness) => h.fake.requests.filter((r) => r.method !== 'GET')

describe('dispatchOutboxKey - existing customer (D-11)', () => {
  it('marks a new Lead when a Contact with the same normalized email exists', async () => {
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A, { email: ' Anna@Example.com ' })] },
      { records: { Contact: [{ id: CONTACT_ID, emailAddress: 'anna@example.com' }], Lead: [] } },
    )

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result.outcome).toBe('sent')
    const lead = h.fake.state.records.Lead[0]
    expect(lead.cExistingCustomer).toBe(true)
    expect(lead.cExistingContactId).toBe(CONTACT_ID)
  })

  it('creates the Lead without the mark when the Contact lookup fails', async () => {
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
      { extraRoutes: (req) => (req.path === '/Contact' ? new Response('', { status: 500 }) : undefined) },
    )

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    const lead = h.fake.state.records.Lead[0]
    expect(lead.cExistingCustomer).toBeUndefined()
    expect(lead.cExistingContactId).toBeUndefined()
  })

  it('an auth error on the Contact lookup propagates as a breaker with one request', async () => {
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
      { extraRoutes: (req) => (req.path === '/Contact' ? new Response('', { status: 401 }) : undefined) },
    )

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'breaker', code: 'crm_auth' })
    expect(h.fake.state.records.Lead).toHaveLength(0)
    expect(h.fake.requests.filter((r) => r.path === '/Contact')).toHaveLength(1)
  })

  it('looks the Contact up by the lower-cased email and never creates a Contact', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A, { email: ' Anna@Example.com ' })] })

    await dispatchOutboxKey(keyOf(ID_A), deps(h))

    const lookup = h.fake.requests.find((r) => r.path === '/Contact')
    expect(lookup?.method).toBe('GET')
    expect(decodeURIComponent(lookup!.query)).toContain('where[0][value]=anna@example.com')
    expect(h.fake.requests.some((r) => r.method !== 'GET' && r.path.startsWith('/Contact'))).toBe(false)
  })
})

describe('dispatchOutboxKey - assignee (D-13)', () => {
  it('sends assignedUserId on create when configured', async () => {
    const config = { ...CONFIG, leadAssigneeId: ASSIGNEE }
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] }, {}, config)

    await dispatchOutboxKey(keyOf(ID_A), deps(h))

    const post = h.fake.requests.find((r) => r.method === 'POST' && r.path === '/Lead')
    expect(post?.body.assignedUserId).toBe(ASSIGNEE)
  })

  it('omits assignedUserId when not configured', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })

    await dispatchOutboxKey(keyOf(ID_A), deps(h))

    const post = h.fake.requests.find((r) => r.method === 'POST' && r.path === '/Lead')
    expect(post?.body).not.toHaveProperty('assignedUserId')
  })

  it('never sends assignedUserId on an update', async () => {
    const config = { ...CONFIG, leadAssigneeId: ASSIGNEE }
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
      {
        records: {
          Lead: [{ id: 'f00000000000000a1', cSupabaseRef: `inquiry:${ID_A}`, status: 'New' }],
          Contact: [{ id: CONTACT_ID, emailAddress: 'anna@example.com' }],
        },
      },
      config,
    )

    await dispatchOutboxKey(keyOf(ID_A), deps(h))

    const puts = h.fake.requests.filter((r) => r.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0].body).not.toHaveProperty('assignedUserId')
  })
})

describe('dispatchOutboxKey - idempotent update', () => {
  const LEAD_ID = 'f00000000000000a1'
  const existingLead = (over: Record<string, unknown> = {}) => ({
    id: LEAD_ID,
    cSupabaseRef: `inquiry:${ID_A}`,
    status: 'In Process',
    description: 'owner edited',
    lastName: 'Edited',
    source: 'Other',
    assignedUserId: 'owner0000000000a1',
    ...over,
  })

  it('an existing Lead with no matching Contact gets no POST and no write at all', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] }, { records: { Lead: [existingLead()], Contact: [] } })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(writes(h)).toHaveLength(0)
    expect(h.fake.state.records.Lead).toHaveLength(1)
  })

  it('adds only the existing-customer mark when a Contact matches, leaving owner-edited fields alone', async () => {
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
      { records: { Lead: [existingLead()], Contact: [{ id: CONTACT_ID, emailAddress: 'anna@example.com' }] } },
    )

    await dispatchOutboxKey(keyOf(ID_A), deps(h))

    const ws = writes(h)
    expect(ws).toHaveLength(1)
    expect(ws[0].method).toBe('PUT')
    expect(ws[0].path).toBe(`/Lead/${LEAD_ID}`)
    expect(ws[0].body).toEqual({ cExistingCustomer: true, cExistingContactId: CONTACT_ID })
    const lead = h.fake.state.records.Lead[0]
    expect(lead.description).toBe('owner edited')
    expect(lead.lastName).toBe('Edited')
    expect(lead.assignedUserId).toBe('owner0000000000a1')
  })

  it('does not look up the Contact again when the mark is already set', async () => {
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
      { records: { Lead: [existingLead({ cExistingCustomer: true, cExistingContactId: CONTACT_ID })], Contact: [] } },
    )

    await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(h.fake.requests.filter((r) => r.path === '/Contact')).toHaveLength(0)
    expect(writes(h)).toHaveLength(0)
  })

  it('a 409 on create because another worker just created the Lead converges without a second Lead', async () => {
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
      {
        extraRoutes: (req, state) => {
          if (req.method === 'POST' && req.path === '/Lead') {
            state.records.Lead.push({ id: LEAD_ID, cSupabaseRef: `inquiry:${ID_A}`, status: 'New' })
            return new Response('', { status: 409 })
          }
          return undefined
        },
      },
    )

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(h.fake.state.records.Lead).toHaveLength(1)
    expect(h.fake.requests.filter((r) => r.method === 'POST')).toHaveLength(1)
  })

  it('a 409 with no Lead found afterwards is failed crm_409', async () => {
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
      { extraRoutes: (req) => (req.method === 'POST' && req.path === '/Lead' ? new Response('', { status: 409 }) : undefined) },
    )

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'failed', code: 'crm_409' })
  })
})

describe('dispatchOutboxKey - phone retry', () => {
  it('retries once without the phone number when the CRM answers 400 to it', async () => {
    const h = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
      {
        extraRoutes: (req) =>
          req.method === 'POST' && req.path === '/Lead' && req.body?.phoneNumber ? new Response('', { status: 400 }) : undefined,
      },
    )

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    const posts = h.fake.requests.filter((r) => r.method === 'POST' && r.path === '/Lead')
    expect(posts).toHaveLength(2)
    expect(posts[0].body.phoneNumber).toBeTruthy()
    expect(posts[1].body).not.toHaveProperty('phoneNumber')
    expect(posts[1].headers['x-skip-duplicate-check']).toBe('true')
    expect(h.fake.state.records.Lead).toHaveLength(1)
    expect(h.fake.state.records.Lead[0]).not.toHaveProperty('phoneNumber')
  })
})

describe('dispatchOutboxKey - duplicate submissions and deliveries', () => {
  it('two inquiries from the same email become two Leads (D-10)', async () => {
    const h = harness({
      rows: [outboxRow(ID_A), outboxRow(ID_B)],
      inquiries: [inquiry(ID_A), inquiry(ID_B)],
    })

    const a = await dispatchOutboxKey(keyOf(ID_A), deps(h))
    const b = await dispatchOutboxKey(keyOf(ID_B), deps(h))

    expect([a.outcome, b.outcome]).toEqual(['sent', 'sent'])
    expect(h.fake.state.records.Lead.map((l) => l.cSupabaseRef).sort()).toEqual([`inquiry:${ID_A}`, `inquiry:${ID_B}`].sort())
    // Without the header the fake would have answered 409 for the second one.
    expect(h.fake.requests.filter((r) => r.method === 'POST').every((r) => r.headers['x-skip-duplicate-check'] === 'true')).toBe(true)
  })

  it('two concurrent dispatches of one key produce one Lead; the loser defers 30 s', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })

    const [r1, r2] = await Promise.all([
      dispatchOutboxKey(keyOf(ID_A), deps(h)),
      dispatchOutboxKey(keyOf(ID_A), deps(h)),
    ])

    expect([r1.outcome, r2.outcome].sort()).toEqual(['deferred', 'sent'])
    expect(h.fake.state.records.Lead).toHaveLength(1)
    expect(h.publish).toHaveBeenCalledTimes(1)
    expect(h.publish).toHaveBeenCalledWith(keyOf(ID_A), { delaySeconds: 30, dedupSuffix: deferId(1, 30) })
  })

  it('a pending row that is not due yet is re-published with the remaining delay', async () => {
    const due = new Date(NOW.getTime() + 120_000).toISOString()
    const h = harness({ rows: [outboxRow(ID_A, { available_at: due, attempts: 2 })], inquiries: [inquiry(ID_A)] })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'deferred' })
    expect(h.publish).toHaveBeenCalledWith(keyOf(ID_A), { delaySeconds: 120, dedupSuffix: deferId(2, 120) })
    expect(h.fake.requests).toHaveLength(0)
    expect(h.rows.get(keyOf(ID_A))?.status).toBe('pending')
  })

  it('an aggregate that is busy elsewhere defers 30 s', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] })
    h.store.claim = async () => null

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'deferred' })
    expect(h.publish).toHaveBeenCalledWith(keyOf(ID_A), { delaySeconds: 30, dedupSuffix: deferId(0, 30) })
  })

  it('two consecutive deferrals of a blocked row publish two different dedup ids (WR-01)', async () => {
    // A crashed worker holds the lease, so attempts stays 1 across both deferrals.
    const lease = new Date(NOW.getTime() + 90_000).toISOString()
    const h = harness({ rows: [outboxRow(ID_A, { status: 'processing', attempts: 1, lease_until: lease })], inquiries: [inquiry(ID_A)] })
    let t = NOW.getTime()

    const first = await dispatchOutboxKey(keyOf(ID_A), deps(h, { now: () => new Date(t) }))
    t += 30_000 // the first deferred message arrives; the row is still blocked
    const second = await dispatchOutboxKey(keyOf(ID_A), deps(h, { now: () => new Date(t) }))

    expect([first.outcome, second.outcome]).toEqual(['deferred', 'deferred'])
    const ids = h.publish.mock.calls.map((c) => (c as unknown as [string, { dedupSuffix: string }])[1].dedupSuffix)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
    expect(h.rows.get(keyOf(ID_A))?.attempts).toBe(1)
  })

  it('deferDedupSuffix: same target instant collapses, a later target is a new id (WR-01)', () => {
    const t0 = NOW.getTime()
    expect(deferDedupSuffix(1, t0, 30)).toBe(deferDedupSuffix(1, t0 + 10_000, 20))
    expect(deferDedupSuffix(1, t0, 30)).not.toBe(deferDedupSuffix(1, t0 + 30_000, 30))
    expect(deferDedupSuffix(1, t0, 30)).toMatch(/^d1_\d+$/)
  })

  it('dispatching B then A yields the same Leads as A then B', async () => {
    const run = async (order: string[]) => {
      const h = harness({ rows: [outboxRow(ID_A), outboxRow(ID_B)], inquiries: [inquiry(ID_A), inquiry(ID_B, { email: 'b@example.com', name: 'Bob Stone' })] })
      for (const id of order) await dispatchOutboxKey(keyOf(id), deps(h))
      return h.fake.state.records.Lead.map(({ id: _id, ...rest }) => rest).sort((x, y) => String(x.cSupabaseRef).localeCompare(String(y.cSupabaseRef)))
    }

    const forward = await run([ID_A, ID_B])
    const reverse = await run([ID_B, ID_A])

    expect(reverse).toEqual(forward)
    expect(forward).toHaveLength(2)
  })
})

describe('dispatchOutboxKey - CRM scope (D-09, D-12)', () => {
  it('never touches Account or CBooking and never converts, across create, update and mark paths', async () => {
    const h1 = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A, { kind: 'corporate', company: 'Acme s.r.o.' })] },
      { records: { Contact: [{ id: CONTACT_ID, emailAddress: 'anna@example.com' }], Lead: [] } },
    )
    await dispatchOutboxKey(keyOf(ID_A), deps(h1))
    const h2 = harness(
      { rows: [outboxRow(ID_A)], inquiries: [inquiry(ID_A)] },
      { records: { Lead: [{ id: 'f00000000000000a1', cSupabaseRef: `inquiry:${ID_A}` }], Contact: [{ id: CONTACT_ID, emailAddress: 'anna@example.com' }] } },
    )
    await dispatchOutboxKey(keyOf(ID_A), deps(h2))

    for (const h of [h1, h2]) {
      for (const r of h.fake.requests) {
        expect(r.path).not.toMatch(/^\/(Account|CBooking)/)
        expect(r.path.toLowerCase()).not.toContain('convert')
        if (r.method !== 'GET') expect(r.path).toMatch(/^\/Lead/)
      }
    }
    expect(h1.fake.state.records.Lead[0].accountName).toBe('Acme s.r.o.')
  })
})
