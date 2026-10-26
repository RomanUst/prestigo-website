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
import type { ChatStore, ErasureScopeInput } from '@/lib/chat-store'
import { makeChatStoreDouble } from './helpers/chat-world'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  anonymisePerson,
  completeErasure,
  confirmErasure,
  createErasurePreview,
  deleteAuthUser,
  erasureLog,
  erasureScope,
  loadErasure,
  recordErasureStep,
} from '@/lib/erasure-store'

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
function makeErasure(
  initial: ErasureRequest | null,
  opts: { anonymiseFails?: boolean; onRecord?: (step: ErasureStepName) => void } = {},
) {
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
      opts.onRecord?.(step)
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
  onRecord?: (step: ErasureStepName) => void
  /** Phase 83: the chat registry double; default = an empty one (the sync never reaches Supabase). */
  chat?: ReturnType<typeof makeChatStoreDouble>
}

function harness(o: HarnessOptions = {}) {
  const outbox = makeOutbox({ rows: o.rows, now: o.now })
  const erasure = makeErasure(o.req === undefined ? request() : o.req, { anonymiseFails: o.anonymiseFails, onRecord: o.onRecord })
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
  // Phase 83 (83-09): chat.erase and anonymisePerson append to one event list (call-order assertion).
  const chat = o.chat ?? makeChatStoreDouble()
  const events: string[] = []
  const eraseInputs: ErasureScopeInput[] = []
  const chatStore: ChatStore = {
    ...chat.store,
    async erase(input) {
      events.push('chat_erase')
      eraseInputs.push(input)
      return chat.store.erase(input)
    },
  }
  const realAnonymise = erasure.store.anonymisePerson
  erasure.store.anonymisePerson = async (id) => {
    events.push('anonymise')
    return realAnonymise(id)
  }
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
    chat: chatStore,
  }
  return { outbox, erasure, fakeCw, fakeEspo, publish, deps, now, chat, events, eraseInputs }
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

// ── Task 2: completeness, resume, verify, freeze edges ─────────────────────

const LEAD_BOOKING = 'd00000000000000b1'
const LEAD_INQUIRY = 'd00000000000000b2'
const LEAD_EMAIL = 'd00000000000000b3'
const LEAD_OTHER = 'd00000000000000b4'
const CBOOKING_1 = 'e00000000000000a1'
const CBOOKING_OTHER = 'e00000000000000a2'
const CBOOKING_BY_CONTACT = 'e00000000000000a3'

const notFound = () => new Response('', { status: 404 })

describe('erasure completeness: lead, cbooking', () => {
  function leadHarness(over: Partial<HarnessOptions> = {}) {
    return harness({
      req: request({ inquiryIds: [INQUIRY_1] }),
      espo: {
        records: {
          Contact: [{ id: CONTACT_ID, firstName: 'Anna', lastName: 'Novak', emailAddress: EMAIL }],
          Lead: [
            { id: LEAD_BOOKING, firstName: 'Anna', lastName: 'Novak', cSupabaseRef: `booking:${BOOKING_1}`, emailAddress: null },
            { id: LEAD_INQUIRY, firstName: 'Anna', lastName: 'N', cSupabaseRef: `inquiry:${INQUIRY_1}`, description: 'my message' },
            { id: LEAD_EMAIL, firstName: 'Anna', lastName: 'N', emailAddress: EMAIL, cSupabaseRef: 'inquiry:99999999-0000-4000-8000-000000000000' },
            { id: LEAD_OTHER, firstName: 'Bob', lastName: 'Other', emailAddress: 'bob@x.test', cSupabaseRef: 'booking:88888888-0000-4000-8000-000000000000' },
          ],
        },
      },
      ...over,
    })
  }

  it('lead: Leads matched by email and by inquiry:/booking: reference are each PUT blank then DELETEd; others are kept', async () => {
    const h = leadHarness()

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })

    for (const id of [LEAD_BOOKING, LEAD_INQUIRY, LEAD_EMAIL]) {
      const put = h.fakeEspo.requests.findIndex((r) => r.method === 'PUT' && r.path === `/Lead/${id}`)
      const del = h.fakeEspo.requests.findIndex((r) => r.method === 'DELETE' && r.path === `/Lead/${id}`)
      expect(put, id).toBeGreaterThan(-1)
      expect(del, id).toBeGreaterThan(put)
      expect(h.fakeEspo.requests[put].body).toMatchObject({ firstName: '', lastName: 'Erased', description: '', emailAddress: null })
    }
    expect(espoRecords(h, 'Lead').map((l) => l.id)).toEqual([LEAD_OTHER])
    expect(espoRecords(h, 'Lead')[0].firstName).toBe('Bob')
    expect(h.erasure.calls.complete[0].counts).toMatchObject({ espo_leads_deleted: 3, espo_contacts_deleted: 1 })
  })

  it('lead: a 404 on DELETE counts as done', async () => {
    const h = leadHarness({
      espo: {
        records: {
          Contact: [],
          Lead: [{ id: LEAD_EMAIL, firstName: 'Anna', lastName: 'N', emailAddress: EMAIL }],
        },
        extraRoutes: (req) => (req.method === 'DELETE' && req.path === `/Lead/${LEAD_EMAIL}` ? notFound() : undefined),
      },
    })

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })
    expect(espoReqs(h, 'DELETE', '/Lead/')).toHaveLength(1)
  })

  it('lead: a scrub the instance refuses twice stops the run before anything is deleted unscrubbed', async () => {
    const h = leadHarness({
      espo: {
        records: { Lead: [{ id: LEAD_EMAIL, firstName: 'Anna', lastName: 'N', emailAddress: EMAIL }] },
        extraRoutes: (req) => (req.method === 'PUT' && req.path === `/Lead/${LEAD_EMAIL}` ? new Response('', { status: 400 }) : undefined),
      },
    })

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toMatchObject({ outcome: 'failed', code: 'crm_400' })
    expect(espoReqs(h, 'PUT', '/Lead/')).toHaveLength(2) // full body, then the minimal one
    expect(espoReqs(h, 'DELETE', '/Lead/')).toHaveLength(0)
    expect(h.erasure.calls.anonymise).toBe(0)
  })

  it("cbooking: the person's CBookings are anonymised in place, never deleted", async () => {
    const h = harness({
      espo: {
        records: {
          Contact: [{ id: CONTACT_ID, firstName: 'Anna', lastName: 'Novak', emailAddress: EMAIL }],
          CBooking: [
            { id: CBOOKING_1, name: 'PRG-1', supabaseBookingId: BOOKING_1, passengerName: 'Anna Novak', flightNumber: 'OK123', pickup: 'Airport', dropoff: 'Hotel', contactId: CONTACT_ID, amount: 45 },
            { id: CBOOKING_BY_CONTACT, name: 'PRG-3', supabaseBookingId: 'aaaaaaaa-0000-4000-8000-000000000003', passengerName: 'Anna', flightNumber: '', pickup: 'A', dropoff: 'B', contactId: CONTACT_ID, amount: 10 },
            { id: CBOOKING_OTHER, name: 'PRG-2', supabaseBookingId: BOOKING_2, passengerName: 'Bob Other', flightNumber: 'LH1', pickup: 'C', dropoff: 'D', contactId: 'c00000000000000b9', amount: 60 },
          ],
        },
      },
    })

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })

    expect(espoReqs(h, 'DELETE', '/CBooking')).toHaveLength(0)
    const cb = espoRecords(h, 'CBooking')
    expect(cb).toHaveLength(3)
    for (const id of [CBOOKING_1, CBOOKING_BY_CONTACT]) {
      expect(cb.find((c) => c.id === id)).toMatchObject({ passengerName: '', flightNumber: '', pickup: '', dropoff: '', contactId: null })
    }
    // Accounting history stays; another person's record is untouched.
    expect(cb.find((c) => c.id === CBOOKING_1)).toMatchObject({ name: 'PRG-1', amount: 45, supabaseBookingId: BOOKING_1 })
    expect(cb.find((c) => c.id === CBOOKING_OTHER)).toMatchObject({ passengerName: 'Bob Other', pickup: 'C', contactId: 'c00000000000000b9' })
    expect(h.erasure.calls.complete[0].counts).toMatchObject({ espo_cbookings_anonymised: 2 })
  })
})

describe('erasure resilience: 422, resume, deadline', () => {
  it('422: an online Chatwoot contact is rescheduled, then deleted on the retry without repeating finished steps', async () => {
    let t = NOW
    const h = harness({
      now: () => t,
      cw: { contacts: [{ id: 1, email: EMAIL, identifier: USER_ID, online: true }] },
    })

    const first = await dispatchOutboxKey(KEY, h.deps)

    expect(first).toEqual({ outcome: 'rescheduled', code: 'cw_http_422' })
    expect(h.erasure.calls.recorded).toEqual([]) // chatwoot is not recorded until the contact is gone
    expect(h.fakeEspo.requests).toHaveLength(0)
    expect(h.outbox.rows.get(KEY)?.status).toBe('pending')

    h.fakeCw.state.contacts[0].online = false
    t = new Date(NOW.getTime() + 3_600_000)
    const second = await dispatchOutboxKey(KEY, h.deps)

    expect(second).toEqual({ outcome: 'sent' })
    expect(h.fakeCw.requests.filter((r) => r.method === 'DELETE')).toHaveLength(2)
    expect(h.erasure.calls.recorded).toEqual(['chatwoot', 'espocrm', 'verify', 'supabase', 'auth'])
  })

  it('422: a retry after the chatwoot step was recorded resumes at the espocrm step (chatwoot is not repeated)', async () => {
    let t = NOW
    const h = harness({
      now: () => t,
      espo: {
        records: { Contact: [{ id: CONTACT_ID, emailAddress: EMAIL, lastName: 'N' }] },
        // The CRM is down during the first attempt only.
        extraRoutes: (req) => (req.method === 'GET' && req.path === '/Contact' && t === NOW ? new Response('', { status: 503 }) : undefined),
      },
    })

    const first = await dispatchOutboxKey(KEY, h.deps)
    expect(first).toMatchObject({ outcome: 'rescheduled', code: 'crm_503' })
    expect(h.erasure.calls.recorded).toEqual(['chatwoot'])
    const cwDeletes = h.fakeCw.requests.filter((r) => r.method === 'DELETE').length

    t = new Date(NOW.getTime() + 3_600_000)
    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })
    expect(h.fakeCw.requests.filter((r) => r.method === 'DELETE')).toHaveLength(cwDeletes)
    expect(h.erasure.calls.recorded).toEqual(['chatwoot', 'espocrm', 'verify', 'supabase', 'auth'])
  })

  it('resume: with chatwoot and espocrm recorded the run starts at verify', async () => {
    const h = harness({
      req: request({
        steps: { chatwoot: { chatwoot_contacts_deleted: 1 }, espocrm: { espo_contacts_deleted: 1 } },
        status: 'running',
      }),
      cw: { contacts: [] },
      espo: { records: {} },
    })

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })

    expect(h.fakeCw.requests.filter((r) => r.method === 'DELETE')).toHaveLength(0)
    expect(h.fakeEspo.requests.filter((r) => r.method !== 'GET')).toHaveLength(0)
    expect(h.erasure.calls.recorded).toEqual(['verify', 'supabase', 'auth'])
    // Counts of the earlier steps survive in the audit counts.
    expect(h.erasure.calls.complete[0].counts).toMatchObject({ chatwoot_contacts_deleted: 1, espo_contacts_deleted: 1 })
  })

  it('resume: with the supabase step recorded the run only deletes the auth user and completes, with no CRM configured', async () => {
    const h = harness({
      req: request({
        identity: null,
        steps: {
          chatwoot: { chatwoot_contacts_deleted: 1 },
          espocrm: { espo_contacts_deleted: 1 },
          verify: { verified: true, verify_remaining: 0 },
          supabase: { bookings_anonymised: 1 },
        },
        status: 'running',
      }),
    })
    const deps = { ...h.deps, crm: null, config: null, chatwootAdmin: null, chatwoot: null, chatwootConfig: null }

    expect(await dispatchOutboxKey(KEY, deps)).toEqual({ outcome: 'sent' })

    expect(h.fakeCw.requests).toHaveLength(0)
    expect(h.fakeEspo.requests).toHaveLength(0)
    expect(h.erasure.calls.anonymise).toBe(0)
    expect(h.erasure.calls.deleteAuth).toEqual([USER_ID])
    expect(h.erasure.calls.order).toEqual(['auth', 'record:auth', 'complete:completed'])
    expect(h.erasure.calls.complete[0].counts).toMatchObject({ bookings_anonymised: 1 })
  })

  it('deadline: an invocation past 45 s before the supabase step is rescheduled and Supabase is not called', async () => {
    let late = false
    const h = harness({
      now: () => (late ? new Date(NOW.getTime() + 50_000) : NOW),
      onRecord: (step) => {
        if (step === 'verify') late = true
      },
    })

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'rescheduled', code: 'deadline' })
    expect(h.erasure.calls.anonymise).toBe(0)
    expect(h.erasure.calls.deleteAuth).toEqual([])
    expect(h.outbox.calls.reschedule[0]).toMatchObject({ key: KEY, code: 'deadline' })
    expect(h.publish).toHaveBeenCalledWith(KEY, { delaySeconds: 5, dedupSuffix: 'dl1' })
  })

  it('a Supabase outage during the anonymise call is a retry (db_error), never a completed request', async () => {
    const h = harness({ anonymiseFails: true })

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'rescheduled', code: 'db_error' })
    expect(h.erasure.calls.complete).toHaveLength(0)
    expect(h.erasure.calls.deleteAuth).toEqual([])
  })
})

describe('erasure verify pass', () => {
  it('verify: a Chatwoot contact recreated between the steps is found and deleted again', async () => {
    const holder: { h?: Harness } = {}
    const h = harness({
      espo: {
        records: { Contact: [{ id: CONTACT_ID, emailAddress: EMAIL, lastName: 'N' }] },
        // An in-flight sync recreates the chat contact right after the CRM Contact went.
        extraRoutes: (req) => {
          if (req.method === 'DELETE' && req.path === `/Contact/${CONTACT_ID}`) {
            holder.h?.fakeCw.seed({ id: 9, email: EMAIL, name: 'Anna' })
          }
          return undefined
        },
      },
    })
    holder.h = h

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })

    expect(h.fakeCw.requests.filter((r) => r.method === 'DELETE').map((r) => r.path)).toEqual(['/contacts/1', '/contacts/9'])
    expect(h.fakeCw.state.contacts).toHaveLength(0)
    expect(h.erasure.calls.complete[0]).toMatchObject({ verified: true, status: 'completed' })
    expect(h.erasure.calls.complete[0].counts).toMatchObject({ verify_redeleted: 1, verify_remaining: 0 })
  })

  it('verify: a record that survives the second pass fails the request with erasure_unverified and leaves Supabase alone', async () => {
    const holder: { h?: Harness } = {}
    const h = harness({
      cw: {
        contacts: [{ id: 1, email: EMAIL, identifier: USER_ID }],
        // A contact that cannot be removed: DELETE answers 200 but nothing changes.
        intercept: (req) => (req.method === 'DELETE' && req.path === '/contacts/9' ? new Response('', { status: 200 }) : undefined),
      },
      espo: {
        records: { Contact: [{ id: CONTACT_ID, emailAddress: EMAIL, lastName: 'N' }] },
        extraRoutes: (req) => {
          if (req.method === 'DELETE' && req.path === `/Contact/${CONTACT_ID}`) {
            holder.h?.fakeCw.seed({ id: 9, email: EMAIL })
          }
          return undefined
        },
      },
    })
    holder.h = h
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'failed', code: 'erasure_unverified' })
    expect(h.erasure.calls.complete).toHaveLength(1)
    expect(h.erasure.calls.complete[0]).toMatchObject({ verified: false, status: 'failed' })
    expect(h.erasure.calls.complete[0].counts).toMatchObject({ verify_remaining: 1 })
    expect(h.erasure.calls.anonymise).toBe(0)
    expect(h.erasure.calls.deleteAuth).toEqual([])
    expect(h.outbox.rows.get(KEY)).toMatchObject({ status: 'failed', last_error: 'erasure_unverified' })
    const logged = error.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logged).toContain('erasure_unverified')
    expect(logged).not.toContain(EMAIL)
  })

  it('verify: a recorded but unverified verify step is run again on a retry, never skipped', async () => {
    const h = harness({
      req: request({
        status: 'running',
        steps: { chatwoot: { a: 1 }, espocrm: { b: 1 }, verify: { verified: false, verify_remaining: 1 } },
      }),
      cw: { contacts: [] },
      espo: { records: {} },
    })

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })
    expect(h.erasure.calls.recorded).toEqual(['verify', 'supabase', 'auth'])
  })
})

describe('erasure scope: inquiry-only person', () => {
  it('inquiry-only: emails from the request drive the Chatwoot and EspoCRM lookups; no account is deleted', async () => {
    const h = harness({
      req: request({ identity: null, userId: null, bookingIds: [], inquiryIds: [INQUIRY_1] }),
      cw: { contacts: [{ id: 4, email: EMAIL, name: 'Anna' }, { id: 5, email: 'other@x.test' }] },
      espo: {
        records: {
          Lead: [{ id: LEAD_INQUIRY, lastName: 'N', cSupabaseRef: `inquiry:${INQUIRY_1}`, emailAddress: null }],
        },
      },
    })

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })

    expect(h.fakeCw.state.contacts.map((c) => c.id)).toEqual([5])
    expect(espoRecords(h, 'Lead')).toHaveLength(0)
    expect(h.erasure.calls.anonymise).toBe(1)
    expect(h.erasure.calls.deleteAuth).toEqual([])
    expect(h.erasure.calls.complete[0].counts).toMatchObject({ inquiries_deleted: 1, identity_deleted: 0 })
    // No identity, no bookings, no Contact: no CBooking request at all.
    expect(h.fakeEspo.requests.filter((r) => r.path.startsWith('/CBooking'))).toHaveLength(0)
  })

  it('a shared phone never reaches Chatwoot: only the request phones (non-shared) are looked up', async () => {
    const h = harness({
      req: request({ phones: [PHONE] }),
      cw: {
        contacts: [
          { id: 1, email: EMAIL, identifier: USER_ID },
          { id: 7, email: 'desk@x.test', phone_number: '+420222333444' }, // a shared desk number, not in the request
        ],
      },
    })

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })
    expect(h.fakeCw.state.contacts.map((c) => c.id)).toEqual([7])
    const phoneLookups = h.fakeCw.requests.filter(
      (r) => r.path === '/contacts/filter' && r.body.payload[0].attribute_key === 'phone_number',
    )
    expect(phoneLookups.length).toBeGreaterThan(0)
    expect(phoneLookups.every((r) => r.body.payload[0].values[0] === PHONE)).toBe(true)
  })
})

describe('erasure store wrappers', () => {
  const rpcClient = (data: unknown, error: unknown = null) => {
    const rpc = vi.fn(async () => ({ data, error }))
    return { client: { rpc, auth: { admin: { deleteUser: vi.fn() } } } as unknown as SupabaseClient, rpc }
  }
  const okPayload = {
    outcome: 'ok',
    primary_email: EMAIL,
    emails: [EMAIL],
    phones: [PHONE],
    identity_id: IDENTITY,
    user_id: null,
    booking_ids: [BOOKING_1],
    inquiry_ids: [],
    counts: { bookings: 1, upcoming: 1, inquiries: 0, quote_leads: 2, has_account: false },
  }

  it('erasureScope maps the ok payload and the refusal outcomes', async () => {
    const ok = rpcClient(okPayload)
    expect(await erasureScope(EMAIL, null, ok.client)).toEqual({
      outcome: 'ok',
      primaryEmail: EMAIL,
      emails: [EMAIL],
      phones: [PHONE],
      identityId: IDENTITY,
      userId: null,
      bookingIds: [BOOKING_1],
      inquiryIds: [],
      counts: { bookings: 1, upcoming: 1, inquiries: 0, quoteLeads: 2, hasAccount: false },
    })
    expect(ok.rpc).toHaveBeenCalledWith('erasure_scope', { p_email: EMAIL, p_phone: null })
    expect(await erasureScope(null, PHONE, rpcClient({ outcome: 'shared_phone', identities: 2 }).client)).toEqual({
      outcome: 'shared_phone',
      identities: 2,
    })
    expect(await erasureScope(EMAIL, null, rpcClient({ outcome: 'not_found' }).client)).toEqual({ outcome: 'not_found' })
    await expect(erasureScope(EMAIL, null, rpcClient({ outcome: 'weird' }).client)).rejects.toBeInstanceOf(OutboxStoreError)
  })

  it('createErasurePreview sends the scope with snake_case keys and returns the request id', async () => {
    const c = rpcClient(REQ)
    const scope = await erasureScope(EMAIL, null, rpcClient({ ...okPayload, inquiry_ids: [INQUIRY_1] }).client)
    if (scope.outcome !== 'ok') throw new Error('scope')

    const id = await createErasurePreview({ actor: ADMIN, emailHmac: 'b'.repeat(64), scope, ttlSeconds: 600 }, c.client)

    expect(id).toBe(REQ)
    const call = c.rpc.mock.calls[0] as unknown as [string, { p_scope: Record<string, unknown> } & Record<string, unknown>]
    expect(call[0]).toBe('erasure_preview_create')
    expect(call[1]).toMatchObject({ p_actor: ADMIN, p_email_hmac: 'b'.repeat(64), p_ttl_seconds: 600 })
    expect(call[1].p_scope).toMatchObject({ outcome: 'ok', inquiry_ids: [INQUIRY_1], counts: { quote_leads: 2, has_account: false } })
  })

  it('confirmErasure returns the RPC outcome and rejects an unknown one', async () => {
    expect(await confirmErasure(REQ, ADMIN, rpcClient('already_in_progress').client)).toBe('already_in_progress')
    await expect(confirmErasure(REQ, ADMIN, rpcClient('nonsense').client)).rejects.toBeInstanceOf(OutboxStoreError)
  })

  it('loadErasure parses the request, returns null for none and throws db_error on a malformed row', async () => {
    const row = {
      id: REQ,
      status: 'confirmed',
      requested_by: ADMIN,
      email_hmac: 'a'.repeat(64),
      expires_at: NOW.toISOString(),
      identity: { id: IDENTITY, espo_contact_id: CONTACT_ID, chatwoot_contact_id: 12, user_id: USER_ID },
      user_id: USER_ID,
      emails: [EMAIL],
      phones: [],
      booking_ids: [BOOKING_1],
      inquiry_ids: [],
      counts: { upcoming: 0 },
      steps: { chatwoot: { n: 1 } },
    }
    expect(await loadErasure(REQ, rpcClient(row).client)).toMatchObject({
      id: REQ,
      status: 'confirmed',
      identity: { id: IDENTITY, espoContactId: CONTACT_ID, chatwootContactId: 12, userId: USER_ID },
      bookingIds: [BOOKING_1],
      steps: { chatwoot: { n: 1 } },
    })
    expect(await loadErasure(REQ, rpcClient(null).client)).toBeNull()
    await expect(loadErasure(REQ, rpcClient({ id: REQ, status: 'bogus' }).client)).rejects.toBeInstanceOf(OutboxStoreError)
  })

  it('an RPC error becomes OutboxStoreError(db_error) without leaking the message', async () => {
    const c = rpcClient(null, { message: `boom ${EMAIL}` })
    const err = await recordErasureStep(REQ, 'chatwoot', {}, c.client).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OutboxStoreError)
    expect(String((err as Error).message)).not.toContain(EMAIL)
  })

  it('anonymisePerson defaults missing counts to 0; completeErasure passes the status through', async () => {
    const counts = await anonymisePerson(REQ, rpcClient({ bookings_anonymised: 2 }).client)
    expect(counts).toMatchObject({ bookings_anonymised: 2, inquiries_deleted: 0, identity_deleted: 0 })
    const c = rpcClient(null)
    await completeErasure(REQ, true, { a: 1 }, 'completed', c.client)
    expect(c.rpc).toHaveBeenCalledWith('erasure_complete', {
      p_request_id: REQ,
      p_verified: true,
      p_counts: { a: 1 },
      p_status: 'completed',
    })
  })

  it('deleteAuthUser: deleted, already gone (404) and a real failure', async () => {
    const mk = (error: unknown) =>
      ({ auth: { admin: { deleteUser: vi.fn(async () => ({ data: null, error })) } } }) as unknown as SupabaseClient
    expect(await deleteAuthUser(USER_ID, mk(null))).toBe('deleted')
    expect(await deleteAuthUser(USER_ID, mk({ status: 404, code: 'user_not_found' }))).toBe('not_found')
    await expect(deleteAuthUser(USER_ID, mk({ status: 500 }))).rejects.toBeInstanceOf(OutboxStoreError)
  })

  it('erasureLog returns only the PII-free columns and skips malformed rows', async () => {
    const rows = [
      {
        id: REQ,
        reference: 'abcdef0123',
        status: 'completed',
        requested_at: NOW.toISOString(),
        completed_at: NOW.toISOString(),
        steps: { chatwoot: {} },
        verified: true,
      },
      { id: 'x', reference: null, status: 'completed', requested_at: NOW.toISOString() },
    ]
    const log = await erasureLog(10, rpcClient(rows).client)
    expect(log).toEqual([
      {
        id: REQ,
        reference: 'abcdef0123',
        status: 'completed',
        requestedAt: NOW.toISOString(),
        completedAt: NOW.toISOString(),
        steps: { chatwoot: {} },
        verified: true,
      },
    ])
  })
})

// ── Phase 83 D-16: erasure covers chat Leads, chat Contacts, history Notes and registry rows ──

const CHAT_LEAD_1 = 'e00000000000000a1'
const CHAT_LEAD_3 = 'e00000000000000a3'
const CHAT_CONTACT_2 = 'c00000000000000b2'
const OTHER_LEAD = 'e00000000000000f9'
const OTHER_EMAIL = 'other.person@x.test'
const noteId = (n: number) => `d${String(n).padStart(16, '0')}`
const NOTE_LEAD_1 = noteId(1)
const NOTE_CONTACT_2 = noteId(2)
const NOTE_OWN_CONTACT = noteId(3)
const NOTE_OTHER = noteId(4)
const NOTE_SYSTEM = noteId(5)
const CHAT_PHONE = '+420777900077'

/** GET /<Lead|Contact>/<id>/stream over the fake's Note records (the fake has no stream route). */
function streamRoute(extra?: FakeEspoOptions['extraRoutes']): NonNullable<FakeEspoOptions['extraRoutes']> {
  return async (req, state) => {
    const stream = /^\/(Lead|Contact)\/([0-9a-f]{17})\/stream$/.exec(req.path)
    if (req.method === 'GET' && stream) {
      const size = Number(new URLSearchParams(req.query).get('maxSize') ?? 20)
      const list = (state.records.Note ?? []).filter((n) => n.parentType === stream[1] && n.parentId === stream[2])
      return new Response(JSON.stringify({ total: list.length, list: [...list].reverse().slice(0, size) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return extra?.(req, state)
  }
}

function chatEspo(over: { extraRoutes?: FakeEspoOptions['extraRoutes']; extraRecords?: Record<string, Array<Record<string, unknown>>> } = {}): FakeEspoOptions {
  return {
    records: {
      Contact: [
        { id: CONTACT_ID, firstName: 'Anna', lastName: 'Novak', emailAddress: EMAIL, phoneNumber: PHONE },
        { id: CHAT_CONTACT_2, firstName: '', lastName: 'Chat visitor', phoneNumber: CHAT_PHONE },
      ],
      Lead: [
        { id: CHAT_LEAD_1, firstName: 'Anna', lastName: 'Novak', cSupabaseRef: 'chat:conv-1', description: 'Chat: I need a ride on the 5th' },
        { id: CHAT_LEAD_3, lastName: 'Chat visitor', cSupabaseRef: 'chat:conv-3' },
        { id: OTHER_LEAD, lastName: 'Other', emailAddress: OTHER_EMAIL, cSupabaseRef: 'chat:conv-9' },
      ],
      Note: [
        { id: NOTE_LEAD_1, type: 'Post', parentType: 'Lead', parentId: CHAT_LEAD_1, post: 'first message: I am Anna' },
        { id: NOTE_CONTACT_2, type: 'Post', parentType: 'Contact', parentId: CHAT_CONTACT_2, post: 'phone chat history' },
        { id: NOTE_OWN_CONTACT, type: 'Post', parentType: 'Contact', parentId: CONTACT_ID, post: 'history on the customer Contact' },
        { id: NOTE_OTHER, type: 'Post', parentType: 'Lead', parentId: OTHER_LEAD, post: 'somebody else' },
        { id: NOTE_SYSTEM, type: 'Create', parentType: 'Lead', parentId: CHAT_LEAD_1, post: null },
      ],
      ...(over.extraRecords ?? {}),
    },
    extraRoutes: streamRoute(over.extraRoutes),
  }
}

/** Registry: a closed chat Lead of the identity, one phone-only row (chat Contact), one Lead found only by ref, another person. */
async function seedRegistry(chat: ReturnType<typeof makeChatStoreDouble>) {
  const l1 = await chat.store.reserveLead({ personKey: `i:${IDENTITY}`, identityId: IDENTITY, chatwootContactId: null, phone: null, leadRef: 'chat:conv-1' })
  await chat.store.setLeadEspo(l1.chatLeadId, CHAT_LEAD_1, null)
  await chat.store.closeLead(l1.chatLeadId, 'converted', BOOKING_1)

  const phoneOnly = await chat.store.reserveLead({ personKey: 'c:900', identityId: null, chatwootContactId: 900, phone: CHAT_PHONE, leadRef: 'chat:conv-2' })
  await chat.store.setLeadEspo(phoneOnly.chatLeadId, null, CHAT_CONTACT_2)

  // Registered by the person's Chatwoot contact id, its EspoCRM Lead is only reachable through cSupabaseRef.
  await chat.store.reserveLead({ personKey: 'c:1', identityId: null, chatwootContactId: 1, phone: null, leadRef: 'chat:conv-3' })

  await chat.store.reserveLead({ personKey: 'i:other-identity', identityId: 'other-identity', chatwootContactId: null, phone: null, leadRef: 'chat:conv-9' })
}

async function chatHarness(o: Partial<HarnessOptions> & { espo?: FakeEspoOptions } = {}) {
  const chat = makeChatStoreDouble()
  await seedRegistry(chat)
  const h = harness({
    req: request({ phones: [CHAT_PHONE] }),
    espo: chatEspo(),
    chat,
    ...o,
  })
  return h
}

describe('D-16 erasure: chat Leads, chat-created Contacts, history Notes and registry rows', () => {
  it('chat Lead and chat Contact found through the registry are scrubbed then deleted, their Notes blanked then deleted', async () => {
    const h = await chatHarness()

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'sent' })
    expect(espoRecords(h, 'Lead').map((r) => r.id)).toEqual([OTHER_LEAD])
    expect(espoRecords(h, 'Contact')).toHaveLength(0)

    // Scrub before delete, for the Lead, the Contact and every Note.
    const idx = (method: string, path: string) => h.fakeEspo.requests.findIndex((r) => r.method === method && r.path === path)
    for (const [entity, id] of [['Lead', CHAT_LEAD_1], ['Contact', CHAT_CONTACT_2], ['Lead', CHAT_LEAD_3]] as const) {
      expect(idx('PUT', `/${entity}/${id}`)).toBeGreaterThan(-1)
      expect(idx('DELETE', `/${entity}/${id}`)).toBeGreaterThan(idx('PUT', `/${entity}/${id}`))
    }
    for (const id of [NOTE_LEAD_1, NOTE_CONTACT_2, NOTE_OWN_CONTACT]) {
      const put = idx('PUT', `/Note/${id}`)
      expect(put).toBeGreaterThan(-1)
      expect(h.fakeEspo.requests[put].body).toEqual({ post: '' })
      expect(idx('DELETE', `/Note/${id}`)).toBeGreaterThan(put)
    }
    // A Post of another person's Lead and a system (non-Post) Note are never touched.
    expect(espoRecords(h, 'Note').map((n) => n.id).sort()).toEqual([NOTE_OTHER, NOTE_SYSTEM].sort())
    expect(espoReqs(h, 'PUT', `/Lead/${OTHER_LEAD}`)).toHaveLength(0)
    expect(espoReqs(h, 'DELETE', `/Lead/${OTHER_LEAD}`)).toHaveLength(0)

    const counts = h.erasure.calls.complete[0].counts
    expect(counts.espo_leads_deleted).toBeGreaterThanOrEqual(2)
    expect(counts.espo_contacts_deleted).toBeGreaterThanOrEqual(2)
    expect(counts.notes_deleted).toBeGreaterThanOrEqual(3)
    expect(counts.notes_skipped).toBe(0)
    expect(counts.verify_remaining).toBe(0)
    expect(h.erasure.calls.complete[0]).toMatchObject({ verified: true, status: 'completed' })
  })

  it('an owner-written Note that answers 403 is notes_skipped and never blocks the erasure', async () => {
    const h = await chatHarness({
      espo: chatEspo({
        extraRoutes: (req) =>
          req.method === 'PUT' && req.path === `/Note/${NOTE_LEAD_1}` ? new Response('', { status: 403 }) : undefined,
      }),
    })

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'sent' })
    const counts = h.erasure.calls.complete[0].counts
    expect(counts.notes_skipped).toBe(1)
    expect(counts.notes_deleted).toBeGreaterThanOrEqual(2)
    expect(espoRecords(h, 'Note').map((n) => n.id)).toContain(NOTE_LEAD_1)
    expect(espoReqs(h, 'DELETE', `/Note/${NOTE_LEAD_1}`)).toHaveLength(0)
    expect(h.erasure.calls.complete[0]).toMatchObject({ verified: true, status: 'completed' })
    expect(h.outbox.rows.get(KEY)?.status).toBe('sent')
  })

  it('a Note that is already gone (404) counts as done', async () => {
    const h = await chatHarness({
      espo: chatEspo({
        extraRoutes: (req) =>
          req.method === 'PUT' && req.path === `/Note/${NOTE_CONTACT_2}` ? new Response('', { status: 404 }) : undefined,
      }),
    })

    expect(await dispatchOutboxKey(KEY, h.deps)).toEqual({ outcome: 'sent' })
    expect(h.erasure.calls.complete[0].counts.notes_skipped).toBe(0)
  })

  it('chat.erase is called once with the person scope, before anonymisePerson, and chat_rows_deleted is in the counts', async () => {
    const h = await chatHarness()

    await dispatchOutboxKey(KEY, h.deps)

    expect(h.events).toEqual(['chat_erase', 'anonymise'])
    expect(h.eraseInputs).toEqual([{ identityId: IDENTITY, chatwootContactIds: [1], phones: [CHAT_PHONE] }])
    expect(h.erasure.calls.complete[0].counts.chat_rows_deleted).toBe(3)
    // The other person's registry row survives.
    expect(h.chat.state.leads.map((l) => l.leadRef)).toEqual(['chat:conv-9'])
  })

  it('the Lead of ANOTHER person (not in the registry scope, other email) is never touched', async () => {
    const h = await chatHarness()

    await dispatchOutboxKey(KEY, h.deps)

    expect(espoRecords(h, 'Lead').find((r) => r.id === OTHER_LEAD)).toMatchObject({ emailAddress: OTHER_EMAIL, lastName: 'Other' })
    expect(h.fakeEspo.requests.filter((r) => r.method !== 'GET' && r.path.includes(OTHER_LEAD))).toHaveLength(0)
    expect(h.fakeEspo.requests.filter((r) => r.path.includes(`/Lead/${OTHER_LEAD}/stream`))).toHaveLength(0)
  })

  it('a Lead found only through the registry cSupabaseRef (no stored espo id) is deleted', async () => {
    const h = await chatHarness()

    await dispatchOutboxKey(KEY, h.deps)

    expect(espoRecords(h, 'Lead').some((r) => r.id === CHAT_LEAD_3)).toBe(false)
  })

  it('the step results and every log line carry counts only: no id, email or phone', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' ')))
    vi.spyOn(console, 'error').mockImplementation((...a) => void lines.push(a.join(' ')))
    const h = await chatHarness()

    await dispatchOutboxKey(KEY, h.deps)

    const dump = JSON.stringify(h.erasure.req?.steps ?? {}) + JSON.stringify(h.erasure.calls.complete) + lines.join('\n')
    for (const secret of [CHAT_LEAD_1, CHAT_LEAD_3, CHAT_CONTACT_2, NOTE_LEAD_1, EMAIL, CHAT_PHONE, PHONE, 'chat:conv-1', 'chat:conv-3']) {
      expect(dump).not.toContain(secret)
    }
    expect(h.erasure.req?.steps.espocrm).toMatchObject({ notes_deleted: expect.any(Number), notes_skipped: expect.any(Number) })
  })

  it('a registry or Note failure retries the row and leaves Supabase untouched', async () => {
    const h = await chatHarness({
      espo: chatEspo({
        extraRoutes: (req) =>
          req.method === 'DELETE' && req.path === `/Note/${NOTE_LEAD_1}` ? new Response('', { status: 500 }) : undefined,
      }),
    })

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result.outcome).toBe('rescheduled')
    expect(h.erasure.calls.anonymise).toBe(0)
    expect(h.events).toEqual([])
    expect(h.chat.state.leads).toHaveLength(4)
  })
})
