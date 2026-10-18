// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createFakeEspoCRM, type FakeEspoOptions } from './helpers/fake-espocrm'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { createSiteEspoClient } from '@/lib/espocrm-client'
import type { BookingRecord, OutboxRow, OutboxStore } from '@/lib/outbox-store'

// ── Fixtures ────────────────────────────────────────────────────────────────

const API_KEY = 'key_SECRET_abcdef0123'
const NOW = new Date('2026-10-18T12:00:00.000Z')
const CAPTURE_START = new Date('2026-10-18T08:00:00.000Z')
const ID_A = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const ID_A_RETURN = '2d1b4e30-7f5c-4a0d-9e9f-3c4d5e6f7081'
const ID_B = '1c0a3d2f-6e4b-4f9c-8d8e-2b3c4d5e6f70'
const PI = 'pi_3SmokeRoundTrip'
const ATTEMPT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

type LeadStatusKey = 'new' | 'in_process' | 'converted' | 'dead'
const keyOf = (id: string, status: LeadStatusKey = 'new') => `lead.booking:${id}:${status}`

const CONFIG = { baseUrl: 'https://crm.example.test', apiKey: API_KEY, leadAssigneeId: null as string | null }

function booking(id: string, over: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id,
    booking_reference: 'PRG-20261018-0001',
    status: 'unpaid',
    booking_source: 'online',
    lead_channel: null,
    leg: 'outbound',
    trip_type: 'one_way',
    payment_intent_id: null,
    attempt_id: null,
    payment_link_id: null,
    pickup_utc: '2026-12-01T09:00:00.000Z',
    pickup_date: '2026-12-01',
    pickup_time: '10:00',
    origin_address: 'Prague Airport',
    destination_address: 'Prague Old Town',
    vehicle_class: 'business',
    passengers: 2,
    hours: null,
    amount_eur: 45,
    client_first_name: 'Anna',
    client_last_name: 'Novak',
    client_email: 'Anna@Example.com',
    client_phone: '+420 725 986 855',
    created_at: '2026-10-18T10:00:00.000Z',
    ...over,
  }
}

function outboxRow(id: string, status: LeadStatusKey = 'new', over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    idempotency_key: keyOf(id, status),
    event_type: 'lead.booking',
    aggregate_type: 'booking',
    aggregate_id: id,
    status: 'pending',
    attempts: 0,
    available_at: new Date(NOW.getTime() - 1000).toISOString(),
    lease_until: null,
    last_error: null,
    ...over,
  }
}

interface StoreOpts {
  rows?: OutboxRow[]
  bookings?: BookingRecord[]
  captureStart?: Date | null
  now?: () => Date
}

/** In-memory OutboxStore with the claim semantics (incl. the per-aggregate mutex) of migration 064. */
function makeStore(opts: StoreOpts = {}) {
  const now = opts.now ?? (() => NOW)
  const rows = new Map<string, OutboxRow>((opts.rows ?? []).map((r) => [r.idempotency_key, { ...r }]))
  const bookings = new Map<string, BookingRecord>((opts.bookings ?? []).map((b) => [b.id, b]))
  const state = { captureStart: opts.captureStart === undefined ? CAPTURE_START : opts.captureStart }
  const calls = {
    complete: [] as Array<{ key: string; status: string; code: string | null }>,
    readBooking: [] as string[],
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
    async readBooking(id) {
      calls.readBooking.push(id)
      // A real read yields after the row was fetched: lets concurrent dispatches overlap.
      await new Promise((r) => setTimeout(r, 1))
      const b = bookings.get(id)
      return b ? { ...b } : null
    },
    async readReturnLeg(outbound) {
      const column = outbound.payment_intent_id ? 'payment_intent_id' : outbound.attempt_id ? 'attempt_id' : null
      if (!column) return null
      const match = [...bookings.values()].find((b) => b.leg === 'return' && b[column] === outbound[column])
      return match ? { id: match.id, booking_reference: match.booking_reference } : null
    },
    async readCaptureStart() {
      return state.captureStart
    },
  }
  return { store, rows, bookings, state, calls }
}

function makeCrm(options: FakeEspoOptions = {}, config = CONFIG) {
  const fake = createFakeEspoCRM({ ...options, records: { Lead: [], Contact: [], ...(options.records ?? {}) } })
  const crm = createSiteEspoClient({ config, fetchImpl: fake.fetchImpl as unknown as typeof fetch, timeoutMs: 200 })
  return { fake, crm, config }
}

type Harness = ReturnType<typeof makeStore> & ReturnType<typeof makeCrm> & { publish: ReturnType<typeof vi.fn> }

function harness(storeOpts: StoreOpts = {}, crmOpts: FakeEspoOptions = {}): Harness {
  const s = makeStore(storeOpts)
  const c = makeCrm(crmOpts)
  return { ...s, ...c, publish: vi.fn(async () => true) }
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

const leads = (h: Harness) => h.fake.state.records.Lead

// ── Task 1: tracer ──────────────────────────────────────────────────────────

describe('dispatchOutboxKey - booking tracer (unpaid website booking -> Lead New)', () => {
  it('creates a New Lead from "Website booking" with the booking references and amount', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], bookings: [booking(ID_A)] })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(leads(h)).toHaveLength(1)
    const lead = leads(h)[0]
    expect(lead.cSupabaseRef).toBe(`booking:${ID_A}`)
    expect(lead.status).toBe('New')
    expect(lead.source).toBe('Website booking')
    expect(lead.opportunityAmount).toBe(45)
    expect(lead.cBookingReference).toBe('PRG-20261018-0001')
    expect(lead.cAdminLink).toBe('https://rideprestigo.com/admin/bookings?search=PRG-20261018-0001')
    expect(lead.emailAddress).toBe('anna@example.com')
    expect(h.rows.get(keyOf(ID_A))?.status).toBe('sent')
  })

  it('a second dispatch of the same key is already_done and sends no request', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], bookings: [booking(ID_A)] })
    await dispatchOutboxKey(keyOf(ID_A), deps(h))
    const before = h.fake.requests.length

    const again = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(again.outcome).toBe('already_done')
    expect(h.fake.requests.length).toBe(before)
  })
})
