// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createFakeEspoCRM, type FakeEspoOptions } from './helpers/fake-espocrm'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteEspoClient } from '@/lib/espocrm-client'
import type { OutboxRow, OutboxStore } from '@/lib/outbox-store'
import type { CrmBookingRecord, IdentityStore, PersonRecord } from '@/lib/identity-store'

// Synthetic fixtures only (example/x.test domains, fake names).

const API_KEY = 'key_SECRET_abcdef0123'
const NOW = new Date('2026-10-19T12:00:00.000Z')
const IDENTITY = '5a1f0c2e-7b3d-4c9a-8e1f-0a1b2c3d4e5f'
const IDENTITY_2 = '6b2a1d3f-8c4e-4dab-9f20-1b2c3d4e5f60'
const BOOKING_1 = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const BOOKING_2 = '1c0a3d2f-6e4b-4f9c-8d8e-2b3c4d5e6f70'
const BOOKING_3 = '2d1b4e30-7f5c-4a0d-9e9f-3c4d5e6f7081'
const CONFIG = { baseUrl: 'https://crm.example.test', apiKey: API_KEY, leadAssigneeId: null as string | null }

const espoKey = (id: string, tag: string | number = '100') => `sync.espo:${id}:${tag}`

function booking(id: string, over: Partial<CrmBookingRecord> = {}): CrmBookingRecord {
  return {
    id,
    booking_reference: `PRG-${id.slice(0, 4).toUpperCase()}`,
    status: 'confirmed',
    booking_source: 'online',
    lead_channel: null,
    leg: 'outbound',
    trip_type: 'transfer',
    payment_intent_id: 'pi_test_123',
    payment_link_id: null,
    invoice_number: null,
    pickup_utc: '2026-12-01T09:00:00.000Z',
    pickup_date: '2026-12-01',
    pickup_time: '10:00',
    origin_address: 'Prague Airport',
    destination_address: 'Prague Old Town',
    vehicle_class: 'business',
    passengers: 2,
    hours: null,
    amount_eur: 45,
    amount_czk: null,
    outbound_amount_czk: null,
    return_amount_czk: null,
    client_first_name: 'Anna',
    client_last_name: 'Novak',
    client_email: 'a@x.test',
    client_phone: '+420777900001',
    flight_number: 'OK123',
    driver_name: null,
    user_id: null,
    anonymised_at: null,
    created_at: '2026-10-18T10:00:00.000Z',
    abandoned: false,
    ...over,
  }
}

function person(over: Partial<PersonRecord> = {}, id = IDENTITY): PersonRecord {
  return {
    identity: { id, user_id: null, espo_contact_id: null, chatwoot_contact_id: null, erasing_at: null },
    emails: [{ email: 'a@x.test', basis: 'booking', via_phone: null }],
    phones: [],
    profile: null,
    bookings: [booking(BOOKING_1)],
    ...over,
  }
}

function outboxRow(key: string, aggregate: { type: 'person' | 'booking'; id: string }, over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    idempotency_key: key,
    event_type: 'sync.espo',
    aggregate_type: aggregate.type,
    aggregate_id: aggregate.id,
    status: 'pending',
    attempts: 0,
    available_at: new Date(NOW.getTime() - 1000).toISOString(),
    lease_until: null,
    last_error: null,
    ...over,
  }
}

/** In-memory OutboxStore with the claim semantics (incl. the per-aggregate mutex) of migration 064. */
function makeStore(opts: { rows?: OutboxRow[]; now?: () => Date } = {}) {
  const now = opts.now ?? (() => NOW)
  const rows = new Map<string, OutboxRow>((opts.rows ?? []).map((r) => [r.idempotency_key, { ...r }]))
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
      const siblingBusy = [...rows.values()].some(
        (x) =>
          x !== row &&
          x.aggregate_type === row.aggregate_type &&
          x.aggregate_id === row.aggregate_id &&
          x.status === 'processing' &&
          x.lease_until !== null &&
          Date.parse(x.lease_until) > t,
      )
      if (due && !siblingBusy && (row.status === 'pending' || (row.status === 'processing' && !leaseLive))) {
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

/** Identity double: only the methods crm-sync uses. A real read yields, so concurrent runs overlap. */
function makeIdentity(opts: { persons?: PersonRecord[]; bookings?: CrmBookingRecord[]; owners?: Record<string, string> } = {}) {
  const persons = new Map<string, PersonRecord>((opts.persons ?? []).map((p) => [p.identity.id, p]))
  const orphans = new Map<string, CrmBookingRecord>((opts.bookings ?? []).map((b) => [b.id, b]))
  const owners = new Map<string, string>(Object.entries(opts.owners ?? {}))
  const calls = {
    setEspoContact: [] as Array<{ id: string; contactId: string | null }>,
    enqueue: [] as Array<{ eventType: string; aggregateType: string; aggregateId: string; key: string }>,
  }
  const identity = {
    async person(id: string) {
      await new Promise((r) => setTimeout(r, 1))
      return persons.get(id) ?? null
    },
    async crmBooking(id: string) {
      await new Promise((r) => setTimeout(r, 1))
      return orphans.get(id) ?? null
    },
    async emailOwners(emails: string[]) {
      return new Map(emails.filter((e) => owners.has(e)).map((e) => [e, owners.get(e) as string]))
    },
    async setEspoContact(id: string, contactId: string | null) {
      calls.setEspoContact.push({ id, contactId })
      const p = persons.get(id)
      if (p) p.identity.espo_contact_id = contactId
      return true
    },
    async enqueueSync(input: { eventType: string; aggregateType: string; aggregateId: string; key: string }) {
      calls.enqueue.push(input)
      return true
    },
  } as unknown as IdentityStore
  return { identity, persons, orphans, owners, calls }
}

function makeCrm(options: FakeEspoOptions = {}) {
  const fake = createFakeEspoCRM({
    ...options,
    records: { Contact: [], CBooking: [], ...(options.records ?? {}) },
  })
  const crm = createSiteEspoClient({ config: CONFIG, fetchImpl: fake.fetchImpl as unknown as typeof fetch, timeoutMs: 200 })
  return { fake, crm }
}

function harness(
  o: { rows?: OutboxRow[]; persons?: PersonRecord[]; bookings?: CrmBookingRecord[]; owners?: Record<string, string>; now?: () => Date } = {},
  crmOpts: FakeEspoOptions = {},
) {
  const s = makeStore({ rows: o.rows, now: o.now })
  const i = makeIdentity({ persons: o.persons, bookings: o.bookings, owners: o.owners })
  const c = makeCrm(crmOpts)
  const publish = vi.fn(async () => true)
  return { ...s, ...c, ids: i, publish, now: o.now ?? (() => NOW) }
}
type Harness = ReturnType<typeof harness>

function deps(h: Harness, over: Partial<DispatchDeps> = {}): Partial<DispatchDeps> {
  return {
    store: h.store,
    crm: h.crm,
    config: CONFIG,
    publish: h.publish as unknown as DispatchDeps['publish'],
    now: h.now,
    identity: h.ids.identity,
    ...over,
  }
}

const personRow = (id = IDENTITY, tag: string | number = '100') =>
  outboxRow(espoKey(id, tag), { type: 'person', id })
const posts = (h: Harness, path: string) => h.fake.requests.filter((r) => r.method === 'POST' && r.path === path)
const puts = (h: Harness, prefix: string) => h.fake.requests.filter((r) => r.method === 'PUT' && r.path.startsWith(prefix))
const contacts = (h: Harness) => h.fake.state.records.Contact
const cbookings = (h: Harness) => h.fake.state.records.CBooking

// ── Task 1: tracer ──────────────────────────────────────────────────────────

describe('sync.espo tracer: person with one booking -> Contact -> linked CBooking -> id stored', () => {
  it('creates the Contact (duplicate check skipped), the linked CBooking and stores the Contact id', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })

    const result = await dispatchOutboxKey(espoKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(contacts(h)).toHaveLength(1)
    const contact = contacts(h)[0]
    expect(contact.emailAddress).toBe('a@x.test')
    expect(contact.lastName).toBe('Novak')
    expect(posts(h, '/Contact')[0].headers['x-skip-duplicate-check']).toBe('true')

    expect(cbookings(h)).toHaveLength(1)
    const cb = cbookings(h)[0]
    expect(cb.supabaseBookingId).toBe(BOOKING_1)
    expect(cb.contactId).toBe(contact.id)
    expect(cb.status).toBe('confirmed')
    expect(cb.amount).toBe(45)
    expect(cb.paymentMethod).toBe('Stripe')
    expect(cb.pickupAt).toBe('2026-12-01 09:00:00')
    expect(cb.passengerName).toBe('Anna Novak')

    expect(h.ids.calls.setEspoContact).toEqual([{ id: IDENTITY, contactId: contact.id }])
    expect(h.ids.calls.enqueue.map((e) => e.eventType)).toEqual(['sync.chatwoot'])
    expect(h.ids.calls.enqueue[0]).toMatchObject({ aggregateType: 'person', aggregateId: IDENTITY })
    expect(h.ids.calls.enqueue[0].key).toMatch(new RegExp(`^sync\\.chatwoot:${IDENTITY}:\\d+$`))
    expect(h.rows.get(espoKey(IDENTITY))?.status).toBe('sent')
  })

  it('a second run with the stored Contact id issues no write and enqueues no Chatwoot refresh', async () => {
    const h = harness({ rows: [personRow(IDENTITY, '100'), personRow(IDENTITY, '101')], persons: [person()] })
    await dispatchOutboxKey(espoKey(IDENTITY, '100'), deps(h))
    const writes = h.fake.requests.filter((r) => r.method !== 'GET').length

    const again = await dispatchOutboxKey(espoKey(IDENTITY, '101'), deps(h))

    expect(again).toEqual({ outcome: 'sent' })
    expect(h.fake.requests.filter((r) => r.method !== 'GET')).toHaveLength(writes)
    expect(h.ids.calls.enqueue).toHaveLength(1)
    expect(contacts(h)).toHaveLength(1)
    expect(cbookings(h)).toHaveLength(1)
  })

  it('missing CRM config: breaker crm_unconfigured and zero requests', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })

    const result = await dispatchOutboxKey(espoKey(IDENTITY), deps(h, { crm: null, config: null }))

    expect(result).toEqual({ outcome: 'breaker', code: 'crm_unconfigured' })
    expect(h.fake.requests).toHaveLength(0)
  })

  it('a missing identity is skipped identity_missing', async () => {
    const h = harness({ rows: [personRow()], persons: [] })

    const result = await dispatchOutboxKey(espoKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'skipped', code: 'identity_missing' })
    expect(h.fake.requests).toHaveLength(0)
  })
})
