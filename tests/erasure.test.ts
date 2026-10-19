// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createFakeChatwoot, FAKE_ADMIN_TOKEN, FAKE_AGENT_TOKEN, type FakeChatwootOptions } from './helpers/fake-chatwoot'
import { createFakeEspoCRM, type FakeEspoOptions } from './helpers/fake-espocrm'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteChatwootClient, type SiteChatwootConfig } from '@/lib/chatwoot-client'
import { createSiteEspoClient } from '@/lib/espocrm-client'
import type { OutboxRow, OutboxStore } from '@/lib/outbox-store'
import type {
  AnonymiseCounts,
  ErasureRequest,
  ErasureStatus,
  ErasureStepName,
  ErasureStore,
} from '@/lib/erasure-store'
import { OutboxStoreError } from '@/lib/outbox-store'

// Synthetic fixtures only (example/x.test domains, fake names).

const NOW = new Date('2026-10-19T12:00:00.000Z')
const REQ = '3e7d1f20-8a4b-4c6d-9e0f-1a2b3c4d5e6f'
const IDENTITY = '5a1f0c2e-7b3d-4c9a-8e1f-0a1b2c3d4e5f'
const USER_ID = '7c3b2e40-9d5f-4eb1-a031-2c3d4e5f6071'
const BOOKING_1 = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const BOOKING_2 = '1c0a3d2f-6e4b-4f9c-8d8e-2b3c4d5e6f70'
const INQUIRY_1 = '4f8e2a31-9b5c-4d7e-8f1a-3b4c5d6e7f80'
const ADMIN = '9d4c3b21-0e6a-4f8b-a1c2-4d5e6f708192'
const EMAIL = 'anna.novak@x.test'
const PHONE = '+420777900010'
const CONTACT_ID = 'c00000000000000a1'
const CW_CONFIG: SiteChatwootConfig = {
  baseUrl: 'https://chat.example.test',
  accountId: '1',
  token: FAKE_AGENT_TOKEN,
  adminToken: FAKE_ADMIN_TOKEN,
}
const ESPO_CONFIG = { baseUrl: 'https://crm.example.test', apiKey: 'key_SECRET_abcdef0123', leadAssigneeId: null as string | null }

const KEY = `erase.person:${REQ}`

function outboxRow(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    idempotency_key: KEY,
    event_type: 'erase.person',
    aggregate_type: 'person',
    aggregate_id: IDENTITY,
    status: 'pending',
    attempts: 0,
    available_at: new Date(NOW.getTime() - 1000).toISOString(),
    lease_until: null,
    last_error: null,
    ...over,
  }
}

/** In-memory OutboxStore with the claim semantics of migration 064. */
function makeOutbox(opts: { rows?: OutboxRow[]; now?: () => Date } = {}) {
  const now = opts.now ?? (() => NOW)
  const rows = new Map<string, OutboxRow>((opts.rows ?? [outboxRow()]).map((r) => [r.idempotency_key, { ...r }]))
  const calls = {
    complete: [] as Array<{ key: string; status: string; code: string | null }>,
    reschedule: [] as Array<{ key: string; availableAt: Date; code: string }>,
  }
  const store: OutboxStore = {
    async claim(key) {
      const row = rows.get(key)
      if (!row) return null
      const t = now().getTime()
      const due = Date.parse(row.available_at) <= t
      const leaseLive = row.lease_until !== null && Date.parse(row.lease_until) > t
      if (due && (row.status === 'pending' || (row.status === 'processing' && !leaseLive))) {
        row.status = 'processing'
        row.attempts += 1
        row.lease_until = new Date(t + 120_000).toISOString()
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
    async readInquiry() {
      return null
    },
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
  return { store, rows, calls }
}

function request(over: Partial<ErasureRequest> = {}): ErasureRequest {
  return {
    id: REQ,
    status: 'confirmed',
    requestedBy: ADMIN,
    emailHmac: 'a'.repeat(64),
    expiresAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
    identity: { id: IDENTITY, espoContactId: CONTACT_ID, chatwootContactId: 1, userId: USER_ID },
    userId: USER_ID,
    emails: [EMAIL],
    phones: [],
    bookingIds: [BOOKING_1],
    inquiryIds: [],
    counts: {},
    steps: {},
    ...over,
  }
}

/** In-memory ErasureStore. anonymisePerson records its own 'supabase' step, like the RPC. */
function makeErasure(initial: ErasureRequest | null, opts: { anonymiseFails?: boolean } = {}) {
  const req: ErasureRequest | null = initial ? structuredClone(initial) : null
  const calls = {
    order: [] as string[],
    recorded: [] as ErasureStepName[],
    anonymise: 0,
    deleteAuth: [] as string[],
    complete: [] as Array<{ verified: boolean; counts: Record<string, unknown>; status: string }>,
  }
  const store: ErasureStore = {
    async loadErasure() {
      return req ? structuredClone(req) : null
    },
    async recordErasureStep(_id, step, result) {
      calls.order.push(`record:${step}`)
      calls.recorded.push(step)
      if (req) {
        req.steps[step] = { ...result }
        if (req.status === 'confirmed') req.status = 'running'
      }
    },
    async anonymisePerson() {
      calls.order.push('anonymise')
      calls.anonymise++
      if (opts.anonymiseFails) throw new OutboxStoreError('db_error')
      const counts: AnonymiseCounts = {
        bookings_anonymised: req?.bookingIds.length ?? 0,
        inquiries_deleted: req?.inquiryIds.length ?? 0,
        quote_leads_deleted: 0,
        audit_values_scrubbed: 0,
        email_log_scrubbed: 0,
        gnet_payloads_scrubbed: 0,
        trip_notes_scrubbed: 0,
        identity_deleted: req?.identity ? 1 : 0,
      }
      if (req) {
        req.steps.supabase = { ...counts }
        req.identity = null
      }
      calls.recorded.push('supabase')
      return counts
    },
    async completeErasure(_id, verified, counts, status) {
      calls.order.push(`complete:${status}`)
      calls.complete.push({ verified, counts, status })
      if (req) req.status = status as ErasureStatus
    },
    async deleteAuthUser(userId) {
      calls.order.push('auth')
      calls.deleteAuth.push(userId)
      return 'deleted'
    },
  }
  return { store, calls, get req() { return req } }
}

interface HarnessOptions {
  req?: ErasureRequest | null
  cw?: FakeChatwootOptions
  espo?: FakeEspoOptions
  now?: () => Date
  rows?: OutboxRow[]
  anonymiseFails?: boolean
}

function harness(o: HarnessOptions = {}) {
  const outbox = makeOutbox({ rows: o.rows, now: o.now })
  const erasure = makeErasure(o.req === undefined ? request() : o.req, { anonymiseFails: o.anonymiseFails })
  const fakeCw = createFakeChatwoot(o.cw ?? { contacts: [{ id: 1, email: EMAIL, identifier: USER_ID, name: 'Anna Novak' }] })
  const fakeEspo = createFakeEspoCRM(
    o.espo ?? {
      records: {
        Contact: [{ id: CONTACT_ID, firstName: 'Anna', lastName: 'Novak', emailAddress: EMAIL, phoneNumber: PHONE }],
      },
    },
  )
  const chatwoot = createSiteChatwootClient({ config: CW_CONFIG, fetchImpl: fakeCw.fetchImpl as unknown as typeof fetch, timeoutMs: 200 })
  const chatwootAdmin = createSiteChatwootClient({
    config: CW_CONFIG,
    admin: true,
    fetchImpl: fakeCw.fetchImpl as unknown as typeof fetch,
    timeoutMs: 200,
  })
  const crm = createSiteEspoClient({ config: ESPO_CONFIG, fetchImpl: fakeEspo.fetchImpl as unknown as typeof fetch, timeoutMs: 200 })
  const publish = vi.fn(async () => true)
  const now = o.now ?? (() => NOW)
  const deps: Partial<DispatchDeps> = {
    store: outbox.store,
    crm,
    config: ESPO_CONFIG,
    publish: publish as unknown as DispatchDeps['publish'],
    now,
    chatwoot,
    chatwootAdmin,
    chatwootConfig: CW_CONFIG,
    erasure: erasure.store,
  }
  return { outbox, erasure, fakeCw, fakeEspo, publish, deps, now }
}
type Harness = ReturnType<typeof harness>

const espoRecords = (h: Harness, entity: string) => (h.fakeEspo.state.records[entity] ?? []) as Array<Record<string, unknown>>
const espoReqs = (h: Harness, method: string, pathStart: string) =>
  h.fakeEspo.requests.filter((r) => r.method === method && r.path.startsWith(pathStart))

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Task 1: tracer ──────────────────────────────────────────────────────────

describe('erase.person tracer: confirmed request -> Chatwoot -> EspoCRM -> verify -> Supabase -> auth -> audit', () => {
  it('erases the person in every system in the fixed order and completes the audit row', async () => {
    const h = harness()

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'sent' })
    // Chatwoot: DELETE /contacts/1 with the administrator token only.
    const del = h.fakeCw.requests.filter((r) => r.method === 'DELETE')
    expect(del.map((r) => r.path)).toEqual(['/contacts/1'])
    expect(h.fakeCw.requests.every((r) => r.headers['api-access-token'] === FAKE_ADMIN_TOKEN)).toBe(true)
    expect(h.fakeCw.state.contacts).toHaveLength(0)

    // EspoCRM: the Contact is overwritten with blank personal fields BEFORE it is deleted.
    const put = h.fakeEspo.requests.findIndex((r) => r.method === 'PUT' && r.path === `/Contact/${CONTACT_ID}`)
    const delIdx = h.fakeEspo.requests.findIndex((r) => r.method === 'DELETE' && r.path === `/Contact/${CONTACT_ID}`)
    expect(put).toBeGreaterThan(-1)
    expect(delIdx).toBeGreaterThan(put)
    expect(h.fakeEspo.requests[put].body).toMatchObject({ firstName: '', emailAddress: null, phoneNumber: null })
    expect(espoRecords(h, 'Contact')).toHaveLength(0)

    // Order: chatwoot, espocrm, verify recorded, then Supabase, then the account, then the audit row.
    expect(h.erasure.calls.order).toEqual([
      'record:chatwoot',
      'record:espocrm',
      'record:verify',
      'anonymise',
      'auth',
      'record:auth',
      'complete:completed',
    ])
    expect(h.erasure.calls.recorded).toEqual(['chatwoot', 'espocrm', 'verify', 'supabase', 'auth'])
    expect(h.erasure.calls.deleteAuth).toEqual([USER_ID])
    expect(h.erasure.calls.complete[0]).toMatchObject({ verified: true, status: 'completed' })
    expect(h.erasure.calls.complete[0].counts).toMatchObject({
      chatwoot_contacts_deleted: 1,
      espo_contacts_deleted: 1,
      bookings_anonymised: 1,
      verify_remaining: 0,
    })
    expect(h.outbox.rows.get(KEY)?.status).toBe('sent')
  })

  it('a request that is only previewed is skipped erasure_not_confirmed with zero external requests', async () => {
    const h = harness({ req: request({ status: 'previewed' }) })

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'skipped', code: 'erasure_not_confirmed' })
    expect(h.fakeCw.requests).toHaveLength(0)
    expect(h.fakeEspo.requests).toHaveLength(0)
    expect(h.erasure.calls.order).toEqual([])
    expect(h.outbox.rows.get(KEY)?.status).toBe('skipped')
  })

  it.each<[string, ErasureStatus | null]>([
    ['a missing row (forged key)', null],
    ['an already completed request', 'completed'],
    ['a failed request', 'failed'],
  ])('%s is skipped erasure_not_confirmed and touches nothing', async (_name, status) => {
    const h = harness({ req: status === null ? null : request({ status }) })

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'skipped', code: 'erasure_not_confirmed' })
    expect(h.fakeCw.requests).toHaveLength(0)
    expect(h.fakeEspo.requests).toHaveLength(0)
    expect(h.erasure.calls.order).toEqual([])
  })

  it('logs only key, step, outcome and code: no address, name or phone', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const h = harness()

    await dispatchOutboxKey(KEY, h.deps)

    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[erasure]'))
    expect(lines.length).toBeGreaterThanOrEqual(5)
    for (const line of lines) {
      expect(line).toMatch(/^\[erasure\] key=erase\.person:[0-9a-f-]{36} step=[a-z]+ outcome=[a-z_]+ code=[-a-z_0-9]+$/)
      expect(line).not.toContain(EMAIL)
      expect(line).not.toContain('Novak')
      expect(line).not.toContain(PHONE)
    }
  })

  it('a missing administrator client is a chatwoot_unconfigured breaker with zero requests', async () => {
    const h = harness()
    const deps = { ...h.deps, chatwootAdmin: null }

    expect(await dispatchOutboxKey(KEY, deps)).toEqual({ outcome: 'breaker', code: 'chatwoot_unconfigured' })
    expect(h.fakeCw.requests).toHaveLength(0)
    expect(h.fakeEspo.requests).toHaveLength(0)
    expect(h.erasure.calls.anonymise).toBe(0)
  })

  it('a missing CRM client is a crm_unconfigured breaker and Supabase is never touched', async () => {
    const h = harness()
    const deps = { ...h.deps, crm: null, config: null }

    expect(await dispatchOutboxKey(KEY, deps)).toEqual({ outcome: 'breaker', code: 'crm_unconfigured' })
    expect(h.erasure.calls.anonymise).toBe(0)
    expect(h.fakeEspo.requests).toHaveLength(0)
  })
})
