// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createFakeEspoCRM, type FakeEspoOptions } from './helpers/fake-espocrm'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteEspoClient } from '@/lib/espocrm-client'
import type { OutboxRow, OutboxStore } from '@/lib/outbox-store'
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
  const crm = createSiteEspoClient({ config, fetchImpl: fake.fetchImpl as unknown as typeof fetch, timeoutMs: 1000 })
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
