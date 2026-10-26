// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createFakeChatwoot, FAKE_ADMIN_TOKEN, FAKE_AGENT_TOKEN, type FakeChatwootOptions } from './helpers/fake-chatwoot'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteChatwootClient, type SiteChatwootConfig } from '@/lib/chatwoot-client'
import { CHATWOOT_SYNCED_ATTRIBUTE_KEYS } from '@/lib/chatwoot-mapping'
import { contactFingerprint, isSiteEcho, SITE_SYNC_FP_ATTRIBUTE } from '@/lib/sync-origin'
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
    // The seven owned attributes plus the HOOK-04 origin tag (not an owned attribute).
    expect(Object.keys(contact.custom_attributes).sort()).toEqual([...CHATWOOT_SYNCED_ATTRIBUTE_KEYS, 'site_sync_fp'].sort())
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

// ── Task 3: find, adopt, merge and the 422 ladders ──────────────────────────

const allBodies = (h: Harness) => JSON.stringify(h.fake.requests.map((r) => [r.path, r.query, r.body]))
const puts = (h: Harness) => h.fake.requests.filter((r) => r.method === 'PUT')
const emptyFilter = () => new Response(JSON.stringify({ payload: [], meta: { count: 0 } }), { status: 200 })

describe('sync.chatwoot adopt: D-03 fill-only-when-empty', () => {
  it('D-03: an operator-set name and phone are never overwritten; only the owned attributes are sent', async () => {
    const linked = person()
    linked.identity.espo_contact_id = 'c00000000000000a1'
    const h = harness(
      { rows: [personRow()], persons: [linked] },
      {
        contacts: [
          {
            id: 4,
            name: 'VIP Jan',
            email: 'a@x.test',
            phone_number: '+420602111222',
            custom_attributes: { site_locale: 'ru', operator_note: 'keep' },
          },
        ],
      },
    )

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(h.fake.writes()).toHaveLength(1)
    const body = puts(h)[0].body as Record<string, unknown>
    expect(Object.keys(body)).toEqual(['custom_attributes'])
    expect(Object.keys(body.custom_attributes as object).sort()).toEqual([...CHATWOOT_SYNCED_ATTRIBUTE_KEYS, 'site_sync_fp'].sort())
    const contact = contacts(h)[0]
    expect(contact).toMatchObject({ name: 'VIP Jan', phone_number: '+420602111222', email: 'a@x.test' })
    // Attributes the site does not own survive (shallow merge, owned keys only).
    expect(contact.custom_attributes).toMatchObject({ site_locale: 'ru', operator_note: 'keep', trip_count: '1' })
    expect(h.ids.calls.setChatwootContact).toEqual([{ id: IDENTITY, contactId: 4 }])
  })

  it('D-03: an empty name is filled, an existing email and phone are kept', async () => {
    // Found through its phone; its own (different) email stays.
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { contacts: [{ id: 6, name: '', email: 'operator-set@x.test', phone_number: '+420777900010' }] },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    const contact = contacts(h)[0]
    expect(contact.name).toBe('Anna Novak')
    expect(contact.email).toBe('operator-set@x.test')
    expect(contact.phone_number).toBe('+420777900010')
  })

  it('D-03: an empty phone is filled from the person; an existing name is kept', async () => {
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { contacts: [{ id: 2, name: 'Anna', email: 'a@x.test', phone_number: null }] },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(contacts(h)[0].phone_number).toBe('+420777900010')
    expect(contacts(h)[0].name).toBe('Anna')
  })

  it('sends only the attribute keys whose value changed', async () => {
    const first = harness({ rows: [personRow()], persons: [person()] })
    await dispatchOutboxKey(cwKey(IDENTITY), deps(first))
    const attrs = { ...contacts(first)[0].custom_attributes, trip_count: '99' }

    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { contacts: [{ id: 1, name: 'Anna Novak', email: 'a@x.test', phone_number: '+420777900010', custom_attributes: attrs }] },
    )
    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(puts(h)).toHaveLength(1)
    // Only the changed attribute plus the origin tag of the unchanged identity fields.
    expect(puts(h)[0].body).toEqual({
      custom_attributes: {
        trip_count: '1',
        site_sync_fp: contactFingerprint({
          name: 'Anna Novak',
          email: 'a@x.test',
          phone_number: '+420777900010',
          identifier: null,
        }),
      },
    })
  })
})

describe('sync.chatwoot idempotency and cached id', () => {
  it('idempotent: a second dispatch of an unchanged person creates one contact and sends no write', async () => {
    const h = harness({ rows: [personRow(IDENTITY, '100'), personRow(IDENTITY, '101')], persons: [person()] })

    await dispatchOutboxKey(cwKey(IDENTITY, '100'), deps(h))
    const writesAfterFirst = h.fake.writes().length
    const again = await dispatchOutboxKey(cwKey(IDENTITY, '101'), deps(h))

    expect(again).toEqual({ outcome: 'sent' })
    expect(contacts(h)).toHaveLength(1)
    expect(writesAfterFirst).toBe(1)
    expect(h.fake.writes()).toHaveLength(1)
    // The repeat run is a single GET of the cached contact (no filter scan).
    expect(h.fake.requests.slice(-1)).toMatchObject([{ method: 'GET', path: `/contacts/${contacts(h)[0].id}` }])
    expect(h.ids.calls.setChatwootContact).toHaveLength(1)
  })

  it('idempotent after an adopt: the second run sends no write either', async () => {
    const h = harness(
      { rows: [personRow(IDENTITY, '100'), personRow(IDENTITY, '101')], persons: [person()] },
      { contacts: [{ id: 3, name: 'Anna', email: 'a@x.test', phone_number: '+420777900010' }] },
    )
    await dispatchOutboxKey(cwKey(IDENTITY, '100'), deps(h))
    const writes = h.fake.writes().length

    await dispatchOutboxKey(cwKey(IDENTITY, '101'), deps(h))

    expect(h.fake.writes()).toHaveLength(writes)
  })

  it('a cached id that answers 404 is forgotten, then the contact is found by email', async () => {
    const p = person()
    p.identity.chatwoot_contact_id = 999
    const h = harness({ rows: [personRow()], persons: [p] }, { contacts: [{ id: 5, name: 'Anna', email: 'a@x.test' }] })

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(h.ids.calls.setChatwootContact).toEqual([
      { id: IDENTITY, contactId: null },
      { id: IDENTITY, contactId: 5 },
    ])
    expect(contacts(h)).toHaveLength(1)
  })

  it('a deleted contact with a stale cached id and no other match is re-created', async () => {
    const p = person()
    p.identity.chatwoot_contact_id = 999
    const h = harness({ rows: [personRow()], persons: [p] })

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(contacts(h)).toHaveLength(1)
    expect(h.ids.calls.setChatwootContact.map((c) => c.contactId)).toEqual([null, contacts(h)[0].id])
  })
})

describe('sync.chatwoot identifier adoption (SYNC-02)', () => {
  const account = () => {
    const p = person()
    p.identity.user_id = USER_ID
    return p
  }

  it('identifier: a contact pre-created by email is adopted on signup and gets identifier = user id once', async () => {
    const h = harness(
      { rows: [personRow()], persons: [account()] },
      { contacts: [{ id: 8, name: 'Anna', email: 'a@x.test', phone_number: '+420777900010' }] },
    )

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(contacts(h)).toHaveLength(1)
    expect(contacts(h)[0].identifier).toBe(USER_ID)
    expect((puts(h)[0].body as Record<string, unknown>).identifier).toBe(USER_ID)
  })

  it('identifier: the user id is looked up first', async () => {
    const h = harness(
      { rows: [personRow()], persons: [account()] },
      { contacts: [{ id: 8, name: 'Anna', email: 'a@x.test', identifier: USER_ID, phone_number: '+420777900010' }] },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    const filters = h.fake.requests.filter((r) => r.path === '/contacts/filter')
    expect(filters[0].body.payload[0].attribute_key).toBe('identifier')
    expect(contacts(h)[0].identifier).toBe(USER_ID)
    expect(contacts(h)).toHaveLength(1)
  })

  it('identifier: a contact whose identifier is already set is never changed', async () => {
    const p = account()
    p.identity.chatwoot_contact_id = 8
    const h = harness(
      { rows: [personRow()], persons: [p] },
      { contacts: [{ id: 8, name: 'Anna', email: 'a@x.test', identifier: USER_ID, phone_number: '+420777900010' }] },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    for (const req of puts(h)) expect(req.body).not.toHaveProperty('identifier')
    expect(contacts(h)[0].identifier).toBe(USER_ID)
  })

  it('identifier: a contact signed in as somebody else is ambiguous, nothing is written', async () => {
    const h = harness(
      { rows: [personRow()], persons: [account()] },
      { contacts: [{ id: 8, name: 'Other', email: 'a@x.test', identifier: 'someone-else-id' }] },
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

      expect(result).toEqual({ outcome: 'failed', code: 'cw_ambiguous' })
      expect(h.fake.writes()).toHaveLength(0)
      expect(contacts(h)[0].identifier).toBe('someone-else-id')
    } finally {
      err.mockRestore()
    }
  })

  it('identifier: a person without an account never gets one invented', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] }, { contacts: [{ id: 8, name: 'Anna', email: 'a@x.test' }] })

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(contacts(h)[0].identifier).toBeNull()
  })
})

describe('sync.chatwoot merge and ambiguous', () => {
  const account = () => {
    const p = person()
    p.identity.user_id = USER_ID
    return p
  }

  it('merge: two candidates (identifier + email) merge through the admin client into the identifier contact', async () => {
    const h = harness(
      { rows: [personRow()], persons: [account()] },
      {
        contacts: [
          { id: 1, name: 'Signed In', email: 'old@x.test', identifier: USER_ID, custom_attributes: { site_locale: 'fr' }, conversations: 2 },
          { id: 2, name: 'From Booking', email: 'a@x.test', conversations: 1 },
        ],
      },
    )

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(h.fake.merges).toEqual([{ base: 1, mergee: 2 }])
    expect(contacts(h)).toHaveLength(1)
    expect(contacts(h)[0]).toMatchObject({ id: 1, conversations: 3 })
    expect(contacts(h)[0].custom_attributes).toMatchObject({ site_locale: 'fr', trip_count: '1' })
    expect(h.ids.calls.setChatwootContact).toEqual([{ id: IDENTITY, contactId: 1 }])
    // The merge itself used the administrator token, everything else the normal one.
    const mergeReq = h.fake.requests.find((r) => r.path === '/actions/contact_merge')
    expect(mergeReq?.headers['api-access-token']).toBe(FAKE_ADMIN_TOKEN)
    expect(h.fake.requests.filter((r) => r !== mergeReq).every((r) => r.headers['api-access-token'] === FAKE_AGENT_TOKEN)).toBe(true)
  })

  it('merge: without identifiers the contact holding the primary email is the base, even if the other is older', async () => {
    const p = person({
      emails: [
        { email: 'a@x.test', basis: 'booking', via_phone: null },
        { email: 'b@x.test', basis: 'booking', via_phone: null },
      ],
    })
    const h = harness(
      { rows: [personRow()], persons: [p] },
      {
        contacts: [
          { id: 2, name: 'Older', email: 'b@x.test' },
          { id: 7, name: 'Primary', email: 'a@x.test' },
        ],
      },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(h.fake.merges).toEqual([{ base: 7, mergee: 2 }])
  })

  it('merge: with no preference the older contact (smaller id) is the base', async () => {
    // Both are found through the person's own non-primary keys (second email, phone), so they rank equal.
    const p = person({
      emails: [
        { email: 'a@x.test', basis: 'booking', via_phone: null },
        { email: 'b@x.test', basis: 'booking', via_phone: null },
      ],
    })
    const h = harness(
      { rows: [personRow()], persons: [p] },
      {
        contacts: [
          { id: 9, name: 'Newer', email: 'other@x.test', phone_number: '+420777900010' },
          { id: 3, name: 'Older', email: 'b@x.test' },
        ],
      },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(h.fake.merges).toEqual([{ base: 3, mergee: 9 }])
  })

  it('ambiguous: two candidates without an admin client -> failed cw_ambiguous, nothing is written', async () => {
    const h = harness(
      { rows: [personRow()], persons: [account()] },
      {
        contacts: [
          { id: 1, name: 'Signed In', email: 'old@x.test', identifier: USER_ID },
          { id: 2, name: 'From Booking', email: 'a@x.test' },
        ],
      },
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h, { chatwootAdmin: null }))

      expect(result).toEqual({ outcome: 'failed', code: 'cw_ambiguous' })
      expect(h.fake.writes()).toHaveLength(0)
      expect(contacts(h)).toHaveLength(2)
      expect(h.rows.get(cwKey(IDENTITY))).toMatchObject({ status: 'failed', last_error: 'cw_ambiguous' })
      expect(err.mock.calls.map((c) => String(c[0])).join('\n')).toContain('code=cw_ambiguous')
    } finally {
      err.mockRestore()
    }
  })

  it('ambiguous: three candidates -> failed cw_ambiguous even with an admin client', async () => {
    const p = person({
      emails: [
        { email: 'a@x.test', basis: 'booking', via_phone: null },
        { email: 'b@x.test', basis: 'booking', via_phone: null },
        { email: 'c@x.test', basis: 'booking', via_phone: null },
      ],
    })
    const h = harness(
      { rows: [personRow()], persons: [p] },
      {
        contacts: [
          { id: 1, email: 'a@x.test' },
          { id: 2, email: 'b@x.test' },
          { id: 3, email: 'c@x.test' },
        ],
      },
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

      expect(result).toEqual({ outcome: 'failed', code: 'cw_ambiguous' })
      expect(h.fake.merges).toHaveLength(0)
      expect(contacts(h)).toHaveLength(3)
    } finally {
      err.mockRestore()
    }
  })

  it('ambiguous: two contacts signed in as different accounts are never merged', async () => {
    const p = person({
      emails: [
        { email: 'a@x.test', basis: 'booking', via_phone: null },
        { email: 'b@x.test', basis: 'booking', via_phone: null },
      ],
    })
    const h = harness(
      { rows: [personRow()], persons: [p] },
      {
        contacts: [
          { id: 1, email: 'a@x.test', identifier: 'user-one' },
          { id: 2, email: 'b@x.test', identifier: 'user-two' },
        ],
      },
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'failed', code: 'cw_ambiguous' })
      expect(h.fake.merges).toHaveLength(0)
    } finally {
      err.mockRestore()
    }
  })

  it('ambiguous: an administrator token that is refused does not trip the breaker for every sync', async () => {
    const h = harness(
      { rows: [personRow()], persons: [account()] },
      {
        contacts: [
          { id: 1, email: 'old@x.test', identifier: USER_ID },
          { id: 2, email: 'a@x.test' },
        ],
        tokens: { [FAKE_AGENT_TOKEN]: 'agent', [FAKE_ADMIN_TOKEN]: 'agent' },
      },
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'failed', code: 'cw_ambiguous' })
      expect(contacts(h)).toHaveLength(2)
    } finally {
      err.mockRestore()
    }
  })
})

describe('sync.chatwoot 422 ladders and shared phones', () => {
  /** The phone filter sees nothing (a number normalised differently), so uniqueness is only found by the write. */
  const blindPhoneFilter: FakeChatwootOptions['intercept'] = (req) =>
    req.path === '/contacts/filter' && req.body?.payload?.[0]?.attribute_key === 'phone_number' ? emptyFilter() : undefined

  it('422: a create refused for a taken phone is retried once without phone_number', async () => {
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { contacts: [{ id: 50, name: 'Hotel Desk', email: 'desk@x.test', phone_number: '+420777900010' }], intercept: blindPhoneFilter },
    )

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    const posts = h.fake.requests.filter((r) => r.method === 'POST' && r.path === '/contacts')
    expect(posts).toHaveLength(2)
    expect(posts[0].body).toHaveProperty('phone_number')
    expect(posts[1].body).not.toHaveProperty('phone_number')
    expect(contacts(h)).toHaveLength(2)
    expect(contacts(h)[0].phone_number).toBe('+420777900010') // the desk contact keeps its number
    expect(contacts(h)[1].phone_number).toBeNull()
  })

  it('422: a create refused because the contact appeared meanwhile re-finds it and adopts', async () => {
    let first = true
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      {
        contacts: [{ id: 60, name: 'Raced', email: 'a@x.test' }],
        // The first email filter does not see the contact yet; the create then hits the email uniqueness.
        intercept: (req) => {
          if (first && req.path === '/contacts/filter' && req.body?.payload?.[0]?.attribute_key === 'email') {
            first = false
            return emptyFilter()
          }
          return undefined
        },
      },
    )

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(contacts(h)).toHaveLength(1)
    expect(h.fake.requests.filter((r) => r.method === 'POST' && r.path === '/contacts')).toHaveLength(1)
    expect(h.ids.calls.setChatwootContact).toEqual([{ id: IDENTITY, contactId: 60 }])
  })

  it('422: a create that stays refused is failed cw_unprocessable', async () => {
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { intercept: (req) => (req.method === 'POST' && req.path === '/contacts' ? new Response('{}', { status: 422 }) : undefined) },
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'failed', code: 'cw_unprocessable' })
      expect(h.rows.get(cwKey(IDENTITY))).toMatchObject({ status: 'failed', last_error: 'cw_unprocessable' })
    } finally {
      err.mockRestore()
    }
  })

  it('422: with no phone to drop, a refused create fails at once', async () => {
    const h = harness(
      { rows: [personRow()], persons: [person({ phones: [] })] },
      { intercept: (req) => (req.method === 'POST' && req.path === '/contacts' ? new Response('{}', { status: 422 }) : undefined) },
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'failed', code: 'cw_unprocessable' })
      expect(h.fake.requests.filter((r) => r.method === 'POST' && r.path === '/contacts')).toHaveLength(1)
    } finally {
      err.mockRestore()
    }
  })

  it('422: an adopted contact whose phone update is refused drops the phone and the sync still succeeds', async () => {
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      {
        contacts: [
          { id: 70, name: 'Anna', email: 'a@x.test', phone_number: null },
          { id: 71, name: 'Hotel Desk', email: 'desk@x.test', phone_number: '+420777900010' },
        ],
        intercept: blindPhoneFilter,
      },
    )

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(puts(h)).toHaveLength(2)
    expect(puts(h)[0].body).toHaveProperty('phone_number')
    expect(puts(h)[1].body).not.toHaveProperty('phone_number')
    expect(contacts(h).find((c) => c.id === 70)?.phone_number).toBeNull()
    expect(contacts(h).find((c) => c.id === 70)?.custom_attributes).toMatchObject({ trip_count: '1' })
  })

  it('shared phone: a number the identity excluded never appears in any request', async () => {
    const SHARED = '+420777900099'
    const p = person({
      phones: [], // identity_person excluded the shared desk number
      profile: { email: 'a@x.test', full_name: 'Anna Profile', phone: SHARED },
      bookings: [booking(BOOKING_1, { client_phone: SHARED })],
    })
    const h = harness({ rows: [personRow()], persons: [p] })

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(h.fake.requests.length).toBeGreaterThan(0)
    expect(allBodies(h)).not.toContain(SHARED)
    expect(allBodies(h)).not.toContain('900099')
    expect(contacts(h)[0].phone_number).toBeNull()
  })

  it('shared phone: a contact that only holds the desk number is not found through it', async () => {
    const SHARED = '+420777900099'
    const h = harness(
      { rows: [personRow()], persons: [person({ phones: [] })] },
      { contacts: [{ id: 80, name: 'Hotel Desk', email: 'desk@x.test', phone_number: SHARED }] },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(contacts(h)).toHaveLength(2)
    expect(contacts(h).find((c) => c.id === 80)?.custom_attributes).toEqual({})
  })
})

describe('sync.chatwoot guards, failures and the contact-only prohibition', () => {
  it('an erasing person is skipped identity_erasing with zero requests', async () => {
    const p = person()
    p.identity.erasing_at = '2026-10-19T11:00:00.000Z'
    const h = harness({ rows: [personRow()], persons: [p] })

    expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'skipped', code: 'identity_erasing' })
    expect(h.fake.requests).toHaveLength(0)
  })

  it('a person without a usable email is skipped no_email', async () => {
    const h = harness({ rows: [personRow()], persons: [person({ emails: [] })] })

    expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'skipped', code: 'no_email' })
    expect(h.fake.requests).toHaveLength(0)
  })

  it('Chatwoot 503 -> rescheduled cw_http_503 (retry with backoff)', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] }, { intercept: () => new Response('{}', { status: 503 }) })

    expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'rescheduled', code: 'cw_http_503' })
    expect(h.rows.get(cwKey(IDENTITY))?.status).toBe('pending')
    expect(h.publish).toHaveBeenCalledTimes(1)
  })

  it('Chatwoot 429 -> rescheduled cw_http_429', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] }, { intercept: () => new Response('{}', { status: 429 }) })

    expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'rescheduled', code: 'cw_http_429' })
  })

  it('a network failure -> rescheduled cw_network', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })
    const broken = createSiteChatwootClient({
      config: CW_CONFIG,
      fetchImpl: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    })

    expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h, { chatwoot: broken }))).toEqual({
      outcome: 'rescheduled',
      code: 'cw_network',
    })
  })

  it('Chatwoot 401 -> 6 h breaker chatwoot_auth', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })
    const rejected = createSiteChatwootClient({
      config: { ...CW_CONFIG, token: 'wrong_token_value' },
      fetchImpl: h.fake.fetchImpl as unknown as typeof fetch,
    })

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h, { chatwoot: rejected }))

    expect(result).toEqual({ outcome: 'breaker', code: 'chatwoot_auth' })
    expect(h.calls.reschedule[0].availableAt.getTime() - NOW.getTime()).toBe(21_600_000)
  })

  it('the 45 s deadline passes before the write -> rescheduled with code deadline', async () => {
    let late = false
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      {
        intercept: (req) => {
          if (req.path === '/contacts/filter') late = true
          return undefined
        },
      },
    )
    const now = () => (late ? new Date(NOW.getTime() + 46_000) : NOW)

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h, { now }))

    expect(result).toEqual({ outcome: 'rescheduled', code: 'deadline' })
    expect(contacts(h)).toHaveLength(0)
    expect(h.calls.reschedule[0].code).toBe('deadline')
    expect(h.publish).toHaveBeenCalledWith(cwKey(IDENTITY), expect.objectContaining({ delaySeconds: 5, dedupSuffix: 'dl1' }))
  })

  it('a refused update that is not a 422 is failed with its cw_http code', async () => {
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      {
        contacts: [{ id: 3, name: 'Anna', email: 'a@x.test', phone_number: '+420777900010' }],
        intercept: (req) => (req.method === 'PUT' ? new Response('{}', { status: 400 }) : undefined),
      },
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(await dispatchOutboxKey(cwKey(IDENTITY), deps(h))).toEqual({ outcome: 'failed', code: 'cw_http_400' })
    } finally {
      err.mockRestore()
    }
  })

  it('only contact records are touched: no message, conversation or automation endpoint is ever called', async () => {
    const p = person()
    p.identity.user_id = USER_ID
    const h = harness(
      { rows: [personRow()], persons: [p] },
      {
        contacts: [
          { id: 1, email: 'old@x.test', identifier: USER_ID },
          { id: 2, email: 'a@x.test' },
        ],
      },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(h.fake.requests.length).toBeGreaterThan(0)
    for (const req of h.fake.requests) {
      expect(req.path).toMatch(/^\/(contacts(\/filter|\/\d+)?|actions\/contact_merge)$/)
    }
  })

  it('no currency symbol reaches any request body', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    // lifetime_value carries a plain "<amount> EUR" total by design (D-02); no symbol.
    expect(allBodies(h)).not.toContain('€')
  })

  it('a second booking for the same person is reflected in repeat_customer on the next sync', async () => {
    const p = person({ bookings: [booking(BOOKING_1), booking(BOOKING_2, { pickup_utc: '2026-12-10T09:00:00.000Z', pickup_date: '2026-12-10' })] })
    const h = harness({ rows: [personRow()], persons: [p] })

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(contacts(h)[0].custom_attributes).toMatchObject({ trip_count: '2', repeat_customer: 'yes', lifetime_value: '90.00 EUR' })
  })
})

// ── HOOK-04: origin fingerprint on every site write ─────────────────────────

describe('sync.chatwoot HOOK-04 origin fingerprint (site_sync_fp)', () => {
  const posts = (h: Harness) => h.fake.requests.filter((r) => r.method === 'POST' && r.path === '/contacts')
  const attrsOf = (req: { body?: unknown }) =>
    ((req.body as { custom_attributes?: Record<string, unknown> }).custom_attributes ?? {}) as Record<string, unknown>
  const fpOf = (fields: { name?: string | null; email?: string | null; phone_number?: string | null; identifier?: string | null }) =>
    contactFingerprint(fields)
  const blindPhoneFilter: FakeChatwootOptions['intercept'] = (req) =>
    req.path === '/contacts/filter' && req.body?.payload?.[0]?.attribute_key === 'phone_number' ? emptyFilter() : undefined

  /** A contact whose owned attributes are all current (so only identity fields can cause a write). */
  async function currentAttrs() {
    const first = harness({ rows: [personRow()], persons: [person()] })
    await dispatchOutboxKey(cwKey(IDENTITY), deps(first))
    const attrs: Record<string, unknown> = { ...contacts(first)[0].custom_attributes }
    delete attrs[SITE_SYNC_FP_ATTRIBUTE]
    return attrs
  }

  it('create: the POST body carries the fingerprint of its own name, email, phone and identifier, and the round trip is an echo', async () => {
    const h = harness({ rows: [personRow()], persons: [person()] })

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(posts(h)).toHaveLength(1)
    expect(attrsOf(posts(h)[0])[SITE_SYNC_FP_ATTRIBUTE]).toBe(
      fpOf({ name: 'Anna Novak', email: 'a@x.test', phone_number: '+420777900010', identifier: null }),
    )
    // echo round trip: what Chatwoot sends back in contact_updated is recognised by the receiver predicate.
    expect(isSiteEcho(contacts(h)[0])).toBe(true)
  })

  it('create for a signed-in person: the identifier is part of the fingerprint (echo round trip)', async () => {
    const p = person()
    p.identity.user_id = USER_ID
    const h = harness({ rows: [personRow()], persons: [p] })

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(contacts(h)[0].identifier).toBe(USER_ID)
    expect(attrsOf(posts(h)[0])[SITE_SYNC_FP_ATTRIBUTE]).toBe(
      fpOf({ name: 'Anna Novak', email: 'a@x.test', phone_number: '+420777900010', identifier: USER_ID }),
    )
    expect(isSiteEcho(contacts(h)[0])).toBe(true)
  })

  it('create refused for a taken phone: the retried POST carries the fingerprint without the phone (echo round trip)', async () => {
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { contacts: [{ id: 50, name: 'Hotel Desk', email: 'desk@x.test', phone_number: '+420777900010' }], intercept: blindPhoneFilter },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(posts(h)).toHaveLength(2)
    expect(attrsOf(posts(h)[0])[SITE_SYNC_FP_ATTRIBUTE]).toBe(
      fpOf({ name: 'Anna Novak', email: 'a@x.test', phone_number: '+420777900010', identifier: null }),
    )
    expect(attrsOf(posts(h)[1])[SITE_SYNC_FP_ATTRIBUTE]).toBe(fpOf({ name: 'Anna Novak', email: 'a@x.test', identifier: null }))
    const created = contacts(h).find((c) => c.email === 'a@x.test')!
    expect(created.phone_number).toBeNull()
    expect(isSiteEcho(created)).toBe(true)
  })

  it('update that fills an empty name only: the PUT carries the fingerprint of the new name and the live email, phone, identifier', async () => {
    const attrs = await currentAttrs()
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { contacts: [{ id: 2, name: '', email: 'a@x.test', phone_number: '+420777900010', custom_attributes: attrs as Record<string, string> }] },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(puts(h)).toHaveLength(1)
    expect(puts(h)[0].body).toEqual({
      name: 'Anna Novak',
      custom_attributes: {
        [SITE_SYNC_FP_ATTRIBUTE]: fpOf({ name: 'Anna Novak', email: 'a@x.test', phone_number: '+420777900010', identifier: null }),
      },
    })
    expect(isSiteEcho(contacts(h)[0])).toBe(true)
  })

  it('update whose only change is an attribute still carries the fingerprint of the unchanged live fields (echo round trip)', async () => {
    const attrs = await currentAttrs()
    attrs.trip_count = '99'
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { contacts: [{ id: 2, name: 'Operator Name', email: 'a@x.test', phone_number: '+420777900010', custom_attributes: attrs as Record<string, string> }] },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(puts(h)).toHaveLength(1)
    expect(puts(h)[0].body).toEqual({
      custom_attributes: {
        trip_count: '1',
        [SITE_SYNC_FP_ATTRIBUTE]: fpOf({ name: 'Operator Name', email: 'a@x.test', phone_number: '+420777900010', identifier: null }),
      },
    })
    expect(isSiteEcho(contacts(h)[0])).toBe(true)
  })

  it('update refused for a taken phone: the retried PUT carries a fingerprint computed with the live (unchanged) phone', async () => {
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      {
        contacts: [
          { id: 70, name: 'Anna', email: 'a@x.test', phone_number: null },
          { id: 71, name: 'Hotel Desk', email: 'desk@x.test', phone_number: '+420777900010' },
        ],
        intercept: blindPhoneFilter,
      },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(puts(h)).toHaveLength(2)
    expect(attrsOf(puts(h)[0])[SITE_SYNC_FP_ATTRIBUTE]).toBe(
      fpOf({ name: 'Anna', email: 'a@x.test', phone_number: '+420777900010', identifier: null }),
    )
    expect(puts(h)[1].body).not.toHaveProperty('phone_number')
    expect(attrsOf(puts(h)[1])[SITE_SYNC_FP_ATTRIBUTE]).toBe(fpOf({ name: 'Anna', email: 'a@x.test', phone_number: null, identifier: null }))
    const adopted = contacts(h).find((c) => c.id === 70)!
    expect(adopted.phone_number).toBeNull()
    expect(isSiteEcho(adopted)).toBe(true)
  })

  it('an up-to-date contact gets no write at all: no fingerprint-only PUT, even when its stored tag is stale', async () => {
    const attrs = await currentAttrs()
    attrs[SITE_SYNC_FP_ATTRIBUTE] = 'stale-from-an-old-edit'
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { contacts: [{ id: 2, name: 'Anna Novak', email: 'a@x.test', phone_number: '+420777900010', custom_attributes: attrs as Record<string, string> }] },
    )

    const result = await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(h.fake.writes()).toEqual([])
  })

  it("the operator's other attributes survive the stamp (shallow merge) and the tag is not an owned attribute", async () => {
    const attrs = await currentAttrs()
    attrs.trip_count = '99'
    attrs.operator_note = 'keep'
    const h = harness(
      { rows: [personRow()], persons: [person()] },
      { contacts: [{ id: 2, name: 'Anna Novak', email: 'a@x.test', phone_number: '+420777900010', custom_attributes: attrs as Record<string, string> }] },
    )

    await dispatchOutboxKey(cwKey(IDENTITY), deps(h))

    expect(contacts(h)[0].custom_attributes).toMatchObject({ operator_note: 'keep', trip_count: '1' })
    expect(CHATWOOT_SYNCED_ATTRIBUTE_KEYS).toHaveLength(7)
    expect(CHATWOOT_SYNCED_ATTRIBUTE_KEYS as readonly string[]).not.toContain(SITE_SYNC_FP_ATTRIBUTE)
  })
})
