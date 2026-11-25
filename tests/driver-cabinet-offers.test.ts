import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-03 (DCAB-05, DCAB-07; D-10, D-11, D-12): live offers of one driver and the session-authenticated
// accept / decline route.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  session: null as null | { driverId: string; sessionId: string },
  checkRateLimit: vi.fn(),
  decline: vi.fn(),
  accepted: vi.fn(),
  afterCalls: [] as Array<() => unknown>,
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => h.db.client }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: h.checkRateLimit,
  getClientIp: () => '203.0.113.7',
}))
vi.mock('@/lib/driver-cabinet/auth', () => ({ getDriverSession: async () => h.session }))
vi.mock('@/lib/driver-accept-email', () => ({ sendDriverAcceptedTripEmail: h.accepted }))
vi.mock('@/lib/email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
  return { ...actual, sendDriverDeclineNotification: h.decline }
})
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (cb: () => unknown) => void h.afterCalls.push(cb) }
})

import { OFFER_SELECT, countLiveOffers, isLiveOffer, listLiveOffers } from '@/lib/driver-cabinet/offers'
import { formatCZK } from '@/lib/currency'
import { POST } from '@/app/api/driver/cabinet/offers/[assignmentId]/respond/route'

const DRIVER = 'd0000000-0000-4000-8000-000000000001'
const OTHER = 'd0000000-0000-4000-8000-000000000002'
const TODAY = '2026-11-25'

const bid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function booking(n: number, over: Record<string, unknown> = {}) {
  return {
    id: bid(n),
    status: 'assigned',
    pickup_date: '2026-11-27',
    pickup_time: '10:30',
    pickup_utc: null,
    origin_address: 'Václav Havel Airport Prague, Aviatická, Praha 6',
    destination_address: 'Hotel Alcron, Štěpánská 40',
    client_first_name: 'Jan',
    client_last_name: 'Novak',
    client_phone: '+420123456789',
    client_email: 'jan@example.com',
    amount_czk: 9999,
    payment_status: 'paid',
    vehicle_class: 'business_van',
    driver_price_czk: 2500,
    booking_reference: 'PRG-20261127-ABCDEF',
    ...over,
  }
}

function assignment(n: number, bookingN: number, over: Record<string, unknown> = {}) {
  return {
    id: aid(n),
    booking_id: bid(bookingN),
    driver_id: DRIVER,
    status: 'pending',
    token_expires_at: new Date(Date.now() - 3600_000).toISOString(),
    token_used_at: null,
    created_at: `2026-11-2${n}T10:00:00.000Z`,
    ...over,
  }
}

function makeDb(seed: Parameters<typeof createFakeDriverCabinetDb>[0]): FakeDriverCabinetDb {
  const db = createFakeDriverCabinetDb({
    drivers: [
      { id: DRIVER, name: 'Petr Driver', email: 'petr@example.com', cabinet_enabled: true },
      { id: OTHER, name: 'Other Driver', email: 'other@example.com', cabinet_enabled: true },
    ],
    ...seed,
  })
  h.db = db
  return db
}

beforeEach(() => {
  h.session = { driverId: DRIVER, sessionId: 's1' }
  h.checkRateLimit.mockReset().mockResolvedValue({ allowed: true })
  h.decline.mockReset().mockResolvedValue(undefined)
  h.accepted.mockReset().mockResolvedValue(undefined)
  h.afterCalls.length = 0
})

describe('isLiveOffer', () => {
  const row = (status: string, bookingStatus: string, id = 'a1') => ({
    id,
    status,
    booking_id: 'b1',
    bookings: { status: bookingStatus },
  })
  const newest = new Map([['b1', 'a1']])

  it.each(['accepted', 'declined'])('is false for an assignment in status %s', (s) => {
    expect(isLiveOffer(row(s, 'assigned') as never, newest)).toBe(false)
  })

  it.each(['cancelled', 'completed', 'no_show', 'en_route', 'on_location', 'on_board'])(
    'is false when the booking is %s',
    (s) => {
      expect(isLiveOffer(row('pending', s) as never, newest)).toBe(false)
    },
  )

  it('is false when it is not the newest assignment of the booking', () => {
    expect(isLiveOffer(row('pending', 'assigned', 'a0') as never, newest)).toBe(false)
    expect(isLiveOffer(row('pending', 'assigned') as never, new Map())).toBe(false)
  })

  it.each(['assigned', 'confirmed'])('is true for a pending newest assignment of a %s booking', (s) => {
    expect(isLiveOffer(row('pending', s) as never, newest)).toBe(true)
  })

  it('is false without a booking', () => {
    expect(isLiveOffer({ id: 'a1', status: 'pending', booking_id: 'b1', bookings: null }, newest)).toBe(false)
  })
})

describe('listLiveOffers', () => {
  it('returns a view with first name, day label, time, route, class and fee', async () => {
    const db = makeDb({ bookings: [booking(1)], driver_assignments: [assignment(1, 1)] })
    const offers = await listLiveOffers(db.client, DRIVER, TODAY)
    expect(offers).toEqual([
      {
        assignmentId: aid(1),
        pickupDate: '2026-11-27',
        dayLabel: 'Fri 27 Nov',
        time: '10:30',
        pickup: 'Václav Havel Airport Prague, Aviatická, Praha 6',
        dropoff: 'Hotel Alcron, Štěpánská 40',
        firstName: 'Jan',
        vehicleLabel: 'Business Van',
        feeLabel: formatCZK(2500),
      },
    ])
  })

  it('stays live whatever token_expires_at says (D-10)', async () => {
    const db = makeDb({
      bookings: [booking(1)],
      driver_assignments: [assignment(1, 1, { token_expires_at: '2020-01-01T00:00:00.000Z' })],
    })
    expect(await listLiveOffers(db.client, DRIVER, TODAY)).toHaveLength(1)
  })

  it('shows As directed without a drop-off and a null fee without a positive integer fee (never 0 Kč)', async () => {
    const db = makeDb({
      bookings: [
        booking(1, { destination_address: '', driver_price_czk: null }),
        booking(2, { driver_price_czk: 0 }),
      ],
      driver_assignments: [assignment(1, 1), assignment(2, 2)],
    })
    const offers = await listLiveOffers(db.client, DRIVER, TODAY)
    expect(offers).toHaveLength(2)
    for (const o of offers) expect(o.feeLabel).toBeNull()
    expect(offers.find((o) => o.assignmentId === aid(1))?.dropoff).toBe('As directed')
    expect(JSON.stringify(offers)).not.toContain('0 Kč')
  })

  it('sorts the earliest pickup first', async () => {
    const db = makeDb({
      bookings: [
        booking(1, { pickup_date: '2026-11-30', pickup_time: '08:00' }),
        booking(2, { pickup_date: '2026-11-27', pickup_time: '18:00' }),
        booking(3, { pickup_date: '2026-11-27', pickup_time: '09:00' }),
      ],
      driver_assignments: [assignment(1, 1), assignment(2, 2), assignment(3, 3)],
    })
    const offers = await listLiveOffers(db.client, DRIVER, TODAY)
    expect(offers.map((o) => o.assignmentId)).toEqual([aid(3), aid(2), aid(1)])
  })

  it('only queries the session driver and never leaks another driver offer', async () => {
    const db = makeDb({
      bookings: [booking(1), booking(2)],
      driver_assignments: [assignment(1, 1), assignment(2, 2, { driver_id: OTHER })],
    })
    const offers = await listLiveOffers(db.client, DRIVER, TODAY)
    expect(offers.map((o) => o.assignmentId)).toEqual([aid(1)])
    const read = db.calls.find((c) => c.table === 'driver_assignments' && c.columns === OFFER_SELECT)!
    expect(read.filters).toContain('eq driver_id')
  })

  it('drops superseded and closed offers', async () => {
    const db = makeDb({
      bookings: [booking(1), booking(2, { status: 'cancelled' }), booking(3, { status: 'en_route' })],
      driver_assignments: [
        assignment(1, 1),
        // a later assignment of booking 1 to another driver supersedes it
        assignment(4, 1, { driver_id: OTHER }),
        assignment(2, 2),
        assignment(3, 3),
      ],
    })
    expect(await listLiveOffers(db.client, DRIVER, TODAY)).toEqual([])
  })

  it('does not include answered assignments', async () => {
    const db = makeDb({
      bookings: [booking(1)],
      driver_assignments: [assignment(1, 1, { status: 'accepted' })],
    })
    expect(await listLiveOffers(db.client, DRIVER, TODAY)).toEqual([])
  })

  it('countLiveOffers equals the list length', async () => {
    const db = makeDb({
      bookings: [booking(1), booking(2)],
      driver_assignments: [assignment(1, 1), assignment(2, 2)],
    })
    expect(await countLiveOffers(db.client, DRIVER)).toBe((await listLiveOffers(db.client, DRIVER)).length)
  })

  it('no recorded select names a client fare, payment, last name, phone, e-mail or deposit column', async () => {
    const db = makeDb({ bookings: [booking(1)], driver_assignments: [assignment(1, 1)] })
    const offers = await listLiveOffers(db.client, DRIVER, TODAY)
    const selects = db.calls.map((c) => c.columns ?? '')
    expect(selects.length).toBeGreaterThan(0)
    for (const s of selects) expect(s).not.toMatch(/amount_|payment_|client_last_name|client_phone|client_email|deposit/)
    expect(OFFER_SELECT).not.toMatch(/amount_|payment_|client_last_name|client_phone|client_email|deposit/)
    // and none of the seeded private values reaches the view
    const json = JSON.stringify(offers)
    for (const secret of ['Novak', '+420123456789', 'jan@example.com', '9999']) expect(json).not.toContain(secret)
  })
})

describe('POST /api/driver/cabinet/offers/[assignmentId]/respond', () => {
  function call(id: string, body: unknown, raw?: string) {
    const request = new Request(`http://localhost/api/driver/cabinet/offers/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    })
    return POST(request, { params: Promise.resolve({ assignmentId: id }) })
  }

  function seedLive() {
    return makeDb({ bookings: [booking(1)], driver_assignments: [assignment(1, 1)] })
  }

  it('rate-limits under the cabinet respond key', async () => {
    seedLive()
    await call(aid(1), { action: 'accepted' })
    expect(h.checkRateLimit).toHaveBeenCalledWith('/api/driver/cabinet/offers/respond', '203.0.113.7')
  })

  it('answers 429 when the limiter denies', async () => {
    const db = seedLive()
    h.checkRateLimit.mockResolvedValueOnce({ allowed: false })
    const res = await call(aid(1), { action: 'accepted' })
    expect(res.status).toBe(429)
    expect(db.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('answers 401 without a session and writes nothing', async () => {
    const db = seedLive()
    h.session = null
    const res = await call(aid(1), { action: 'accepted' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(db.calls).toHaveLength(0)
  })

  it('answers 400 invalid_json and invalid_payload', async () => {
    seedLive()
    const bad = await call(aid(1), null, '{nope')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid_json' })
    for (const body of [{}, { action: 'maybe' }, { action: 'ACCEPTED' }, { action: 1 }]) {
      const res = await call(aid(1), body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_payload' })
    }
  })

  it('rejects a body over 1 KB', async () => {
    seedLive()
    const request = new Request(`http://localhost/api/driver/cabinet/offers/${aid(1)}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '2000' },
      body: JSON.stringify({ action: 'accepted' }),
    })
    const res = await POST(request, { params: Promise.resolve({ assignmentId: aid(1) }) })
    expect(res.status).toBe(413)
  })

  it('malformed, foreign and superseded ids answer the same 409 not_available body', async () => {
    const db = makeDb({
      bookings: [booking(1), booking(2)],
      driver_assignments: [
        assignment(1, 1, { driver_id: OTHER }),
        assignment(2, 2),
        assignment(3, 2, { driver_id: OTHER }),
      ],
    })
    const responses = [
      await call('not-a-uuid', { action: 'accepted' }),
      await call(aid(1), { action: 'accepted' }), // foreign
      await call(aid(2), { action: 'accepted' }), // superseded by 3
      await call(aid(9), { action: 'accepted' }), // missing
    ]
    const bodies: unknown[] = []
    for (const r of responses) {
      expect(r.status).toBe(409)
      bodies.push(await r.json())
    }
    for (const b of bodies) expect(b).toEqual({ error: 'not_available' })
    expect(db.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('a live offer answers 200 { ok, assignmentId } and runs the effects in after()', async () => {
    const db = seedLive()
    const res = await call(aid(1), { action: 'accepted' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, assignmentId: aid(1) })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const row = db.tables.driver_assignments[0]
    expect(row.status).toBe('accepted')
    expect(typeof row.token_used_at).toBe('string')

    expect(h.accepted).not.toHaveBeenCalled()
    expect(h.afterCalls).toHaveLength(1)
    await h.afterCalls[0]()
    expect(h.accepted).toHaveBeenCalledWith(aid(1))
  })

  it('declining sends the decline notice through after()', async () => {
    seedLive()
    const res = await call(aid(1), { action: 'declined' })
    expect(res.status).toBe(200)
    await h.afterCalls[0]()
    expect(h.decline).toHaveBeenCalledTimes(1)
    expect(h.decline.mock.calls[0][0]).toMatchObject({ driverName: 'Petr Driver', bookingReference: 'PRG-20261127-ABCDEF' })
  })

  it('a second answer to the same offer is 409', async () => {
    seedLive()
    expect((await call(aid(1), { action: 'declined' })).status).toBe(200)
    const again = await call(aid(1), { action: 'accepted' })
    expect(again.status).toBe(409)
  })

  it('never writes the bookings table (D-01)', async () => {
    const db = seedLive()
    await call(aid(1), { action: 'accepted' })
    expect(db.calls.filter((c) => c.table === 'bookings' && c.op !== 'select')).toEqual([])
  })
})
