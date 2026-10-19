// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createFakeChatwoot, FAKE_ADMIN_TOKEN, FAKE_AGENT_TOKEN, type FakeChatwootOptions } from './helpers/fake-chatwoot'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteChatwootClient, type SiteChatwootConfig } from '@/lib/chatwoot-client'
import { CHATWOOT_SYNCED_ATTRIBUTE_KEYS } from '@/lib/chatwoot-mapping'
import type { OutboxRow, OutboxStore } from '@/lib/outbox-store'
import type { CrmBookingRecord, IdentityStore, PersonRecord } from '@/lib/identity-store'

// Synthetic fixtures only (example/x.test domains, fake names).

const NOW = new Date('2026-10-19T12:00:00.000Z')
const IDENTITY = '5a1f0c2e-7b3d-4c9a-8e1f-0a1b2c3d4e5f'
const USER_ID = '7c3b2e40-9d5f-4eb1-a031-2c3d4e5f6071'
const BOOKING_1 = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const BOOKING_2 = '1c0a3d2f-6e4b-4f9c-8d8e-2b3c4d5e6f70'
const CW_CONFIG: SiteChatwootConfig = {
  baseUrl: 'https://chat.example.test',
  accountId: '1',
  token: FAKE_AGENT_TOKEN,
  adminToken: FAKE_ADMIN_TOKEN,
}
const ESPO_CONFIG = { baseUrl: 'https://crm.example.test', apiKey: 'key_SECRET_abcdef0123', leadAssigneeId: null as string | null }

const cwKey = (id: string, tag: string | number = '100') => `sync.chatwoot:${id}:${tag}`

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
    client_phone: '+420777900010',
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
    phones: ['+420777900010'],
    profile: null,
    bookings: [booking(BOOKING_1)],
    ...over,
  }
}

function outboxRow(key: string, id: string, over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    idempotency_key: key,
    event_type: 'sync.chatwoot',
    aggregate_type: 'person',
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

/** Identity double: only the methods chatwoot-sync uses. */
function makeIdentity(persons: PersonRecord[]) {
  const byId = new Map<string, PersonRecord>(persons.map((p) => [p.identity.id, p]))
  const calls = { setChatwootContact: [] as Array<{ id: string; contactId: number | null }> }
  const identity = {
    async person(id: string) {
      return byId.get(id) ?? null
    },
    async setChatwootContact(id: string, contactId: number | null) {
      calls.setChatwootContact.push({ id, contactId })
      const p = byId.get(id)
      if (p) p.identity.chatwoot_contact_id = contactId
      return true
    },
  } as unknown as IdentityStore
  return { identity, persons: byId, calls }
}

function harness(
  o: { rows?: OutboxRow[]; persons?: PersonRecord[]; now?: () => Date } = {},
  cwOpts: FakeChatwootOptions = {},
) {
  const s = makeStore({ rows: o.rows, now: o.now })
  const ids = makeIdentity(o.persons ?? [])
  const fake = createFakeChatwoot(cwOpts)
  const chatwoot = createSiteChatwootClient({ config: CW_CONFIG, fetchImpl: fake.fetchImpl as unknown as typeof fetch, timeoutMs: 200 })
  const chatwootAdmin = createSiteChatwootClient({
    config: CW_CONFIG,
    admin: true,
    fetchImpl: fake.fetchImpl as unknown as typeof fetch,
    timeoutMs: 200,
  })
  const publish = vi.fn(async () => true)
  return { ...s, ids, fake, chatwoot, chatwootAdmin, publish, now: o.now ?? (() => NOW) }
}
type Harness = ReturnType<typeof harness>

function deps(h: Harness, over: Partial<DispatchDeps> = {}): Partial<DispatchDeps> {
  return {
    store: h.store,
    crm: null,
    config: ESPO_CONFIG,
    publish: h.publish as unknown as DispatchDeps['publish'],
    now: h.now,
    identity: h.ids.identity,
    chatwoot: h.chatwoot,
    chatwootAdmin: h.chatwootAdmin,
    chatwootConfig: CW_CONFIG,
    ...over,
  }
}

const personRow = (id = IDENTITY, tag: string | number = '100') => outboxRow(cwKey(id, tag), id)
const contacts = (h: Harness) => h.fake.state.contacts

// ── Task 1: tracer ──────────────────────────────────────────────────────────

describe('sync.chatwoot tracer: new person -> exact filters find nothing -> contact created with D-02 attributes', () => {
  it('creates the contact with email, phone and exactly the seven owned attributes, then stores its id', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(contacts(h)).toHaveLength(1)
    const contact = contacts(h)[0]
    expect(contact.email).toBe('a@x.test')
    expect(contact.phone_number).toBe('+420777900010')
    expect(contact.identifier).toBeNull()
    expect(contact.name).toBe('Anna Novak')
    expect(Object.keys(contact.custom_attributes).sort()).toEqual([...CHATWOOT_SYNCED_ATTRIBUTE_KEYS].sort())
    expect(contact.custom_attributes).toMatchObject({
      trip_count: '1',
      repeat_customer: 'no',
      last_trip_date: 'none',
      lifetime_value: '45.00 EUR',
    })
    expect(contact.custom_attributes.next_trip).toMatch(/^2026-12-01 10:00 · Prague Airport → Prague Old Town · PRG-/)
    expect(contact.custom_attributes.admin_bookings_url).toMatch(/\/admin\/bookings\?search=a%40x\.test$/)
    // Every request carried the hyphenated token header (the fake answers 401 otherwise).
    expect(h.fake.requests.length).toBeGreaterThan(0)
    expect(h.fake.requests.every((r) => r.headers['api-access-token'] === FAKE_AGENT_TOKEN)).toBe(true)
    expect(h.ids.calls.setChatwootContact).toEqual([{ id: IDENTITY, contactId: contact.id }])
    expect(h.rows.get(cwKey(IDENTITY))?.status).toBe('sent')
  })

  it('builds the CRM link from the configured EspoCRM base URL and the stored Contact id', async () => {
    const p = person()
    p.identity.espo_contact_id = 'c00000000000000a1'
    const h = harness({ rows: [personRow()], persons: [p] })

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(contacts(h)[0].custom_attributes.crm_contact_url).toBe('https://crm.example.test/#Contact/view/c00000000000000a1')
  })

  it('a person with an account gets identifier = Supabase user id on create (D-01)', async () => {
    const p = person()
    p.identity.user_id = USER_ID
    const h = harness({ rows: [personRow()], persons: [p] })

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(contacts(h)[0].identifier).toBe(USER_ID)
  })

  it('missing Chatwoot config: breaker chatwoot_unconfigured, zero requests, even when EspoCRM is configured', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })

    const result = await dispatchOutboxKey(
      cwKey(IDENTITY),
      deps(h, { chatwoot: null, chatwootAdmin: null, chatwootConfig: null, config: ESPO_CONFIG }),
    )

    expect(result).toEqual({ outcome: 'breaker', code: 'chatwoot_unconfigured' })
    expect(h.fake.requests).toHaveLength(0)
  })

  it('missing EspoCRM config does not block sync.chatwoot', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h, { crm: null, config: null }))

    expect(result).toEqual({ outcome: 'sent' })
    expect(contacts(h)).toHaveLength(1)
    expect(contacts(h)[0].custom_attributes.crm_contact_url).toBe('')
  })

  it('a missing identity is skipped identity_missing', async () => {
    const h = harness({ rows: [personRow()], persons: [] })

    expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'skipped', code: 'identity_missing' })
    expect(h.fake.requests).toHaveLength(0)
  })

  it('the log line carries key, outcome and code only', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      await dispatchOutboxKey(cwKey(IDENTITY), deps(h))
      const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[chatwoot-sync]'))
      expect(lines).toEqual([`[chatwoot-sync] key=${cwKey(IDENTITY)} outcome=sent code=-`])
    } finally {
      log.mockRestore()
    }
  })
})
