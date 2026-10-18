// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createFakeEspoCRM, type FakeEspoOptions } from './helpers/fake-espocrm'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteEspoClient } from '@/lib/espocrm-client'
import type { BookingRecord, OutboxRow, OutboxStore } from '@/lib/outbox-store'

// ── Fixtures ────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-18T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const ID = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const KEY = `lead.purge:${ID}`
const API_KEY = 'key_SECRET_abcdef0123'
const CONFIG = { baseUrl: 'https://crm.example.test', apiKey: API_KEY, leadAssigneeId: null as string | null }
const LEAD_ID = 'a00000000000000a1'

const daysBeforeNow = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()

/** An abandoned website checkout: online, unpaid, no payment link, outbound, pickup 91 days ago. */
function booking(over: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: ID,
    booking_reference: 'PRG-20260601-0001',
    status: 'unpaid',
    booking_source: 'online',
    lead_channel: null,
    leg: 'outbound',
    trip_type: 'one_way',
    payment_intent_id: null,
    attempt_id: null,
    payment_link_id: null,
    pickup_utc: daysBeforeNow(91),
    pickup_date: '2026-07-19',
    pickup_time: '12:00',
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
    created_at: '2026-06-01T10:00:00.000Z',
    ...over,
  }
}

function purgeRow(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    idempotency_key: KEY,
    event_type: 'lead.purge',
    aggregate_type: 'booking',
    aggregate_id: ID,
    status: 'pending',
    attempts: 0,
    available_at: new Date(NOW.getTime() - 1000).toISOString(),
    lease_until: null,
    last_error: null,
    ...over,
  }
}

function makeStore(bookings: BookingRecord[], rows: OutboxRow[] = [purgeRow()]) {
  const outbox = new Map<string, OutboxRow>(rows.map((r) => [r.idempotency_key, { ...r }]))
  const bookingMap = new Map<string, BookingRecord>(bookings.map((b) => [b.id, b]))
  const snapshot = JSON.stringify([...bookingMap.values()])
  const store: OutboxStore = {
    async claim(key) {
      const row = outbox.get(key)
      if (!row || row.status !== 'pending' || Date.parse(row.available_at) > NOW.getTime()) return null
      row.status = 'processing'
      row.attempts += 1
      row.lease_until = new Date(NOW.getTime() + 120_000).toISOString()
      return { ...row }
    },
    async getByKey(key) {
      const row = outbox.get(key)
      return row ? { ...row } : null
    },
    async complete(key, status, code) {
      const row = outbox.get(key)
      if (!row || row.status !== 'processing') return false
      row.status = status
      row.last_error = code
      row.lease_until = null
      return true
    },
    async reschedule(key, availableAt, code) {
      const row = outbox.get(key)
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
    async readBooking(id) {
      const b = bookingMap.get(id)
      return b ? { ...b } : null
    },
    async readReturnLeg() {
      return null
    },
    async readCaptureStart() {
      return new Date('2026-05-01T00:00:00.000Z')
    },
  }
  return { store, outbox, bookingsUnchanged: () => JSON.stringify([...bookingMap.values()]) === snapshot }
}

function setup(
  b: BookingRecord | null,
  leads: Array<Record<string, unknown>> = [{ id: LEAD_ID, cSupabaseRef: `booking:${ID}`, status: 'Dead' }],
  crmOpts: FakeEspoOptions = {},
) {
  const s = makeStore(b ? [b] : [])
  const fake = createFakeEspoCRM({ ...crmOpts, records: { Lead: leads, Contact: [] } })
  const crm = createSiteEspoClient({ config: CONFIG, fetchImpl: fake.fetchImpl as unknown as typeof fetch, timeoutMs: 200 })
  const publish = vi.fn(async () => true)
  const deps: Partial<DispatchDeps> = {
    store: s.store,
    crm,
    config: CONFIG,
    publish: publish as unknown as DispatchDeps['publish'],
    now: () => NOW,
  }
  return { ...s, fake, publish, deps }
}

const deletes = (h: ReturnType<typeof setup>) => h.fake.requests.filter((r) => r.method === 'DELETE')

// ── Eligible ────────────────────────────────────────────────────────────────

describe('lead.purge - abandoned online checkout (D-15 / D-20)', () => {
  it('deletes the Dead Lead 91 days after pickup and leaves the booking row untouched', async () => {
    const h = setup(booking())

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'sent' })
    expect(deletes(h)).toHaveLength(1)
    expect(deletes(h)[0].path).toBe(`/Lead/${LEAD_ID}`)
    expect(h.fake.state.records.Lead).toHaveLength(0)
    expect(h.outbox.get(KEY)?.status).toBe('sent')
    expect(h.bookingsUnchanged()).toBe(true)
  })

  it('looks the Lead up by cSupabaseRef (booking:<id>) with id and status only', async () => {
    const h = setup(booking())
    await dispatchOutboxKey(KEY, h.deps)

    const get = h.fake.requests.find((r) => r.method === 'GET' && r.path === '/Lead')
    expect(get).toBeDefined()
    expect(decodeURIComponent(get!.query)).toContain(`booking:${ID}`)
    expect(decodeURIComponent(get!.query)).toContain('select=id,status')
  })

  it('only the matching Lead is deleted; other Leads stay', async () => {
    const h = setup(booking(), [
      { id: LEAD_ID, cSupabaseRef: `booking:${ID}`, status: 'Dead' },
      { id: 'a00000000000000b2', cSupabaseRef: 'booking:other', status: 'Dead' },
    ])
    await dispatchOutboxKey(KEY, h.deps)
    expect(h.fake.state.records.Lead.map((l: { id: string }) => l.id)).toEqual(['a00000000000000b2'])
  })

  it('DELETE answering 404 (already gone) is success', async () => {
    const h = setup(booking(), undefined, {
      extraRoutes: (req) => (req.method === 'DELETE' ? new Response('', { status: 404 }) : undefined),
    })

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'sent' })
    expect(h.outbox.get(KEY)?.status).toBe('sent')
  })

  it('no Lead found: sent, and no DELETE is sent', async () => {
    const h = setup(booking(), [])

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'sent' })
    expect(deletes(h)).toHaveLength(0)
    expect(h.outbox.get(KEY)?.status).toBe('sent')
  })

  it.each(['New', 'In Process', 'Converted', 'Assigned', 'Recycled'])(
    'a re-opened Lead (%s) is kept: skipped purge_lead_not_dead, no DELETE',
    async (status) => {
      const h = setup(booking(), [{ id: LEAD_ID, cSupabaseRef: `booking:${ID}`, status }])

      const result = await dispatchOutboxKey(KEY, h.deps)

      expect(result).toEqual({ outcome: 'skipped', code: 'purge_lead_not_dead' })
      expect(deletes(h)).toHaveLength(0)
      expect(h.fake.state.records.Lead).toHaveLength(1)
      expect(h.outbox.get(KEY)?.status).toBe('skipped')
    },
  )
})

// ── Not eligible ────────────────────────────────────────────────────────────

describe('lead.purge - eligibility is re-checked on the live row (T-81-31)', () => {
  const cases: Array<[string, Partial<BookingRecord>]> = [
    ['manual booking (D-20)', { booking_source: 'manual' }],
    ['payment link set (D-20)', { payment_link_id: 'plink_123' }],
    ['status cancelled', { status: 'cancelled' }],
    ['paid since the event was enqueued', { status: 'confirmed' }],
    ['return leg', { leg: 'return' }],
    ['pickup exactly 90 days ago (boundary)', { pickup_utc: daysBeforeNow(90) }],
    ['pickup 89 days ago', { pickup_utc: daysBeforeNow(89) }],
    ['pickup in the future', { pickup_utc: daysBeforeNow(-5) }],
    ['no pickup instant', { pickup_utc: null }],
  ]

  it.each(cases)('%s: skipped purge_not_eligible, zero CRM requests', async (_name, over) => {
    const h = setup(booking(over))

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'skipped', code: 'purge_not_eligible' })
    expect(h.fake.requests).toHaveLength(0)
    expect(h.fake.state.records.Lead).toHaveLength(1)
    expect(h.outbox.get(KEY)?.status).toBe('skipped')
  })

  it('pickup 90 days and 1 ms ago is eligible (strictly older than 90 days)', async () => {
    const h = setup(booking({ pickup_utc: new Date(NOW.getTime() - 90 * DAY - 1).toISOString() }))
    const result = await dispatchOutboxKey(KEY, h.deps)
    expect(result).toEqual({ outcome: 'sent' })
    expect(deletes(h)).toHaveLength(1)
  })

  it('booking row gone: skipped source_missing, zero CRM requests', async () => {
    const h = setup(null)

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'skipped', code: 'source_missing' })
    expect(h.fake.requests).toHaveLength(0)
  })
})

// ── Failures ────────────────────────────────────────────────────────────────

describe('lead.purge - CRM failures follow the existing classification', () => {
  it('DELETE 503: rescheduled with backoff and re-published, row not completed', async () => {
    const h = setup(booking(), undefined, {
      extraRoutes: (req) => (req.method === 'DELETE' ? new Response('', { status: 503 }) : undefined),
    })

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result.outcome).toBe('rescheduled')
    expect(h.outbox.get(KEY)?.status).toBe('pending')
    expect(Date.parse(h.outbox.get(KEY)!.available_at)).toBeGreaterThan(NOW.getTime())
    expect(h.publish).toHaveBeenCalledTimes(1)
    expect(h.fake.state.records.Lead).toHaveLength(1)
  })

  it('DELETE 401: breaker, one request to the CRM at most, row re-armed', async () => {
    const h = setup(booking(), undefined, {
      extraRoutes: (req) => (req.method === 'DELETE' ? new Response('', { status: 401 }) : undefined),
    })

    const result = await dispatchOutboxKey(KEY, h.deps)

    expect(result).toEqual({ outcome: 'breaker', code: 'crm_auth' })
    expect(h.outbox.get(KEY)?.status).toBe('pending')
    expect(h.publish).toHaveBeenCalledTimes(1)
  })

  it('a second delivery of the same key after success is already_done and sends nothing', async () => {
    const h = setup(booking())
    await dispatchOutboxKey(KEY, h.deps)
    const before = h.fake.requests.length

    const again = await dispatchOutboxKey(KEY, h.deps)

    expect(again.outcome).toBe('already_done')
    expect(h.fake.requests.length).toBe(before)
  })
})

describe('lead.purge - scope (prohibitions)', () => {
  it('writes nothing to the CRM except the one DELETE /Lead/<id>', async () => {
    const h = setup(booking())
    await dispatchOutboxKey(KEY, h.deps)
    const mutating = h.fake.requests.filter((r) => r.method !== 'GET')
    expect(mutating.map((r) => `${r.method} ${r.path}`)).toEqual([`DELETE /Lead/${LEAD_ID}`])
  })
})
