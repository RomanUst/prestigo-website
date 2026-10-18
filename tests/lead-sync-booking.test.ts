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

// ── Task 2: status follows the booking ──────────────────────────────────────

/** Re-point the booking at a new status and arm the outbox row the trigger would have enqueued. */
function change(h: Harness, id: string, status: string, leadStatus: LeadStatusKey) {
  h.bookings.set(id, { ...h.bookings.get(id)!, status })
  h.rows.set(keyOf(id, leadStatus), outboxRow(id, leadStatus))
}

const writes = (h: Harness) => h.fake.requests.filter((r) => r.method === 'POST' || r.method === 'PUT')

describe('dispatchOutboxKey - booking status follows the booking (D-06)', () => {
  it('New -> Converted on payment, then Dead on cancellation: one Lead, PUTs only', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], bookings: [booking(ID_A)] })
    await dispatchOutboxKey(keyOf(ID_A), deps(h))
    expect(leads(h)[0].status).toBe('New')

    change(h, ID_A, 'confirmed', 'converted')
    const paid = await dispatchOutboxKey(keyOf(ID_A, 'converted'), deps(h))
    expect(paid).toEqual({ outcome: 'sent' })
    expect(leads(h)).toHaveLength(1)
    expect(leads(h)[0].status).toBe('Converted')
    expect(h.fake.requests.filter((r) => r.method === 'POST' && r.path === '/Lead')).toHaveLength(1)

    change(h, ID_A, 'cancelled', 'dead')
    const cancelled = await dispatchOutboxKey(keyOf(ID_A, 'dead'), deps(h))
    expect(cancelled).toEqual({ outcome: 'sent' })
    expect(leads(h)).toHaveLength(1)
    expect(leads(h)[0].status).toBe('Dead')
  })

  it('a pending quote booking is In Process', async () => {
    const h = harness({
      rows: [outboxRow(ID_A, 'in_process')],
      bookings: [booking(ID_A, { status: 'pending', amount_eur: null })],
    })

    await dispatchOutboxKey(keyOf(ID_A, 'in_process'), deps(h))

    expect(leads(h)[0].status).toBe('In Process')
    expect(leads(h)[0].opportunityAmount).toBeUndefined()
  })

  it('an unpaid booking whose pickup already passed is Dead (D-03)', async () => {
    const h = harness({
      rows: [outboxRow(ID_A)],
      bookings: [booking(ID_A, { pickup_utc: '2026-10-18T09:00:00.000Z' })],
    })

    await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(leads(h)[0].status).toBe('Dead')
  })

  it('a status that maps to nothing is skipped unmapped_status', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], bookings: [booking(ID_A, { status: 'weird' })] })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'skipped', code: 'unmapped_status' })
    expect(h.fake.requests).toHaveLength(0)
  })

  it('the Lead update carries references and amount, and nothing else is sent when nothing changed', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], bookings: [booking(ID_A)] })
    await dispatchOutboxKey(keyOf(ID_A), deps(h))
    h.rows.set(keyOf(ID_A, 'converted'), outboxRow(ID_A, 'converted'))

    // Same status group, same data: the second event is a no-op.
    const before = writes(h).length
    await dispatchOutboxKey(keyOf(ID_A, 'converted'), deps(h))
    expect(writes(h).length).toBe(before)
  })
})

describe('dispatchOutboxKey - round trip (D-19)', () => {
  const outbound = (over: Partial<BookingRecord> = {}) =>
    booking(ID_A, { trip_type: 'round_trip', payment_intent_id: PI, ...over })
  const returnLeg = (over: Partial<BookingRecord> = {}) =>
    booking(ID_A_RETURN, {
      leg: 'return',
      trip_type: 'round_trip',
      payment_intent_id: PI,
      booking_reference: 'PRG-20261018-0002',
      amount_eur: null,
      ...over,
    })

  it('round trip: two rows of one trip give one Lead carrying the return reference', async () => {
    const h = harness({
      rows: [outboxRow(ID_A), outboxRow(ID_A_RETURN)],
      bookings: [outbound(), returnLeg()],
    })

    const out = await dispatchOutboxKey(keyOf(ID_A), deps(h))
    // Even if the trigger had enqueued the return row, the dispatcher skips it.
    const ret = await dispatchOutboxKey(keyOf(ID_A_RETURN), deps(h))

    expect(out).toEqual({ outcome: 'sent' })
    expect(ret).toEqual({ outcome: 'skipped', code: 'return_leg' })
    expect(leads(h)).toHaveLength(1)
    expect(leads(h)[0].cSupabaseRef).toBe(`booking:${ID_A}`)
    expect(leads(h)[0].cReturnBookingReference).toBe('PRG-20261018-0002')
    expect(leads(h)[0].opportunityAmount).toBe(45)
  })

  it('round trip: the return leg is found through attempt_id when there is no payment intent yet', async () => {
    const h = harness({
      rows: [outboxRow(ID_A)],
      bookings: [
        outbound({ payment_intent_id: null, attempt_id: ATTEMPT }),
        returnLeg({ payment_intent_id: null, attempt_id: ATTEMPT }),
      ],
    })

    await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(leads(h)[0].cReturnBookingReference).toBe('PRG-20261018-0002')
  })

  it('round trip: a one-way booking never looks for a return leg', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], bookings: [booking(ID_A, { payment_intent_id: PI })] })
    const lookups = vi.spyOn(h.store, 'readReturnLeg')

    await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(lookups).not.toHaveBeenCalled()
    expect(leads(h)[0].cReturnBookingReference).toBeUndefined()
  })

  it('two bookings of one customer are two Leads (D-05)', async () => {
    const h = harness({
      rows: [outboxRow(ID_A), outboxRow(ID_B)],
      bookings: [booking(ID_A), booking(ID_B, { booking_reference: 'PRG-20261018-0003' })],
    })

    await dispatchOutboxKey(keyOf(ID_A), deps(h))
    await dispatchOutboxKey(keyOf(ID_B), deps(h))

    expect(leads(h)).toHaveLength(2)
    expect(leads(h).map((l) => l.cSupabaseRef).sort()).toEqual([`booking:${ID_A}`, `booking:${ID_B}`].sort())
  })
})

describe('dispatchOutboxKey - sources (D-08) and gnet ghosts', () => {
  it.each([
    ['whatsapp', 'WhatsApp'],
    ['phone', 'Phone'],
    ['email', 'Email'],
    ['partner', 'Partner'],
    [null, 'Other'],
  ] as const)('manual booking channel %s becomes source %s', async (channel, source) => {
    const h = harness({
      rows: [outboxRow(ID_A, 'converted')],
      bookings: [booking(ID_A, { booking_source: 'manual', lead_channel: channel, status: 'confirmed' })],
    })

    await dispatchOutboxKey(keyOf(ID_A, 'converted'), deps(h))

    expect(leads(h)[0].source).toBe(source)
    expect(leads(h)[0].status).toBe('Converted')
  })

  it('gnet booking: source GNet, placeholder email/phone never reach the Lead, no Contact lookup', async () => {
    const h = harness({
      rows: [outboxRow(ID_A, 'converted')],
      bookings: [
        booking(ID_A, {
          booking_source: 'gnet',
          status: 'confirmed',
          client_email: 'noreply@gnet.local',
          client_phone: 'unknown',
          client_first_name: 'John',
          client_last_name: 'Smith',
        }),
      ],
    })

    const result = await dispatchOutboxKey(keyOf(ID_A, 'converted'), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    const lead = leads(h)[0]
    expect(lead.source).toBe('GNet')
    expect(lead).not.toHaveProperty('emailAddress')
    expect(lead).not.toHaveProperty('phoneNumber')
    expect(JSON.stringify(h.fake.requests.map((r) => r.body))).not.toContain('gnet.local')
    expect(h.fake.requests.some((r) => r.path.startsWith('/Contact'))).toBe(false)
  })

  it('gnet ghost: a booking deleted before dispatch is skipped source_missing with zero CRM requests', async () => {
    const h = harness({ rows: [outboxRow(ID_A, 'converted')], bookings: [] })

    const result = await dispatchOutboxKey(keyOf(ID_A, 'converted'), deps(h))

    expect(result).toEqual({ outcome: 'skipped', code: 'source_missing' })
    expect(h.fake.requests).toHaveLength(0)
    expect(h.rows.get(keyOf(ID_A, 'converted'))?.status).toBe('skipped')
  })
})

describe('dispatchOutboxKey - forward-only capture (D-21)', () => {
  it('forward-only: no capture start means skipped before_capture_start and zero CRM requests', async () => {
    const h = harness({ rows: [outboxRow(ID_A)], bookings: [booking(ID_A)], captureStart: null })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'skipped', code: 'before_capture_start' })
    expect(h.fake.requests).toHaveLength(0)
  })

  it('forward-only: a booking created one millisecond before the start is skipped, even if its status changed later', async () => {
    const h = harness({
      rows: [outboxRow(ID_A, 'converted')],
      bookings: [booking(ID_A, { status: 'confirmed', created_at: new Date(CAPTURE_START.getTime() - 1).toISOString() })],
    })

    const result = await dispatchOutboxKey(keyOf(ID_A, 'converted'), deps(h))

    expect(result).toEqual({ outcome: 'skipped', code: 'before_capture_start' })
    expect(h.fake.requests).toHaveLength(0)
  })

  it('forward-only: a booking created exactly at the start is captured (boundary is >=)', async () => {
    const h = harness({
      rows: [outboxRow(ID_A)],
      bookings: [booking(ID_A, { created_at: CAPTURE_START.toISOString() })],
    })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
    expect(leads(h)).toHaveLength(1)
  })

  it('forward-only: microsecond timestamps from the database are compared by instant', async () => {
    const h = harness({
      rows: [outboxRow(ID_A)],
      bookings: [booking(ID_A, { created_at: '2026-10-18T08:00:00.123456+00:00' })],
    })

    const result = await dispatchOutboxKey(keyOf(ID_A), deps(h))

    expect(result).toEqual({ outcome: 'sent' })
  })
})

describe('dispatchOutboxKey - racing and out-of-order events', () => {
  it('concurrent: new and converted for one booking dispatched together create exactly one Lead, the loser is deferred', async () => {
    const h = harness({
      rows: [outboxRow(ID_A, 'new'), outboxRow(ID_A, 'converted')],
      bookings: [booking(ID_A, { status: 'confirmed' })],
    })

    const [first, second] = await Promise.all([
      dispatchOutboxKey(keyOf(ID_A, 'new'), deps(h)),
      dispatchOutboxKey(keyOf(ID_A, 'converted'), deps(h)),
    ])

    expect([first.outcome, second.outcome].sort()).toEqual(['deferred', 'sent'])
    expect(h.fake.requests.filter((r) => r.method === 'POST' && r.path === '/Lead')).toHaveLength(1)
    expect(h.publish).toHaveBeenCalledTimes(1)

    const deferredKey = first.outcome === 'deferred' ? keyOf(ID_A, 'new') : keyOf(ID_A, 'converted')
    const rerun = await dispatchOutboxKey(deferredKey, deps(h))

    expect(rerun).toEqual({ outcome: 'sent' })
    expect(leads(h)).toHaveLength(1)
    expect(leads(h)[0].status).toBe('Converted')
    expect(h.fake.requests.filter((r) => r.method === 'POST' && r.path === '/Lead')).toHaveLength(1)
  })

  it('out of order: converted first, new afterwards: the Lead stays Converted and the second run writes nothing', async () => {
    const h = harness({
      rows: [outboxRow(ID_A, 'converted'), outboxRow(ID_A, 'new')],
      bookings: [booking(ID_A, { status: 'confirmed' })],
    })

    await dispatchOutboxKey(keyOf(ID_A, 'converted'), deps(h))
    const writesBefore = writes(h).length
    const late = await dispatchOutboxKey(keyOf(ID_A, 'new'), deps(h))

    expect(late).toEqual({ outcome: 'sent' })
    expect(leads(h)).toHaveLength(1)
    expect(leads(h)[0].status).toBe('Converted')
    expect(writes(h).length).toBe(writesBefore)
  })
})

describe('dispatchOutboxKey - booking CRM scope (D-09)', () => {
  it('a full lifecycle never writes a Contact, CBooking, Account or convert action', async () => {
    const h = harness({
      rows: [outboxRow(ID_A)],
      bookings: [booking(ID_A, { trip_type: 'round_trip', payment_intent_id: PI }), booking(ID_A_RETURN, { leg: 'return', trip_type: 'round_trip', payment_intent_id: PI })],
    })
    await dispatchOutboxKey(keyOf(ID_A), deps(h))
    change(h, ID_A, 'confirmed', 'converted')
    await dispatchOutboxKey(keyOf(ID_A, 'converted'), deps(h))
    change(h, ID_A, 'cancelled', 'dead')
    await dispatchOutboxKey(keyOf(ID_A, 'dead'), deps(h))

    for (const r of h.fake.requests) {
      expect(r.path).not.toMatch(/^\/(CBooking|Account)/)
      expect(r.path).not.toMatch(/convert/i)
      if (r.path.startsWith('/Contact')) expect(r.method).toBe('GET')
    }
    expect(h.fake.state.records.Contact).toHaveLength(0)
  })
})
