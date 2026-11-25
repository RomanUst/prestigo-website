import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-07 (DCAB-05, DCAB-09; D-01, D-11, D-12, D-15): one ride of the cabinet.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  requireDriver: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => h.db.client }))
vi.mock('@/lib/driver-cabinet/auth', () => ({ requireDriver: h.requireDriver }))
vi.mock('next/navigation', () => ({ redirect: h.redirect, useRouter: () => ({ refresh: vi.fn() }) }))
// The loader is a marker so the props the cabinet page hands it can be read from the returned element.
vi.mock('@/app/(internal)/driver/trip/[token]/TripScreenForToken', () => ({
  default: function TripScreenForToken() {
    return null
  },
}))

import { resolveCabinetRide, RIDE_DETAIL_SELECT } from '@/lib/driver-cabinet/ride-detail'
import RideDetailPage from '@/app/(internal)/driver/(cabinet)/rides/[assignmentId]/page'
import TripScreenForToken from '@/app/(internal)/driver/trip/[token]/TripScreenForToken'

const DRIVER = 'd0000000-0000-4000-8000-000000000001'
const OTHER = 'd0000000-0000-4000-8000-000000000002'

const bid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tok = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function booking(n: number, over: Record<string, unknown> = {}) {
  return {
    id: bid(n),
    booking_reference: `PRG-${n}`,
    status: 'assigned',
    pickup_date: '2026-11-27',
    pickup_time: '10:30:00',
    origin_address: 'Václav Havel Airport Prague',
    destination_address: 'Hotel Alcron, Štěpánská 40',
    client_first_name: 'Jan',
    client_last_name: 'Novak',
    client_phone: '+420123456789',
    flight_number: 'OK123',
    special_requests: 'Child seat',
    amount_czk: 9999,
    vehicle_class: 'business_van',
    driver_price_czk: 2500,
    ...over,
  }
}

let seq = 0
function assignment(n: number, bookingN: number, over: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: aid(n),
    booking_id: bid(bookingN),
    driver_id: DRIVER,
    status: 'accepted',
    trip_token: tok(n),
    created_at: new Date(Date.UTC(2026, 10, 1, 8, 0, seq)).toISOString(),
    ...over,
  }
}

function dbWith(bookings: unknown[], assignments: unknown[]): FakeDriverCabinetDb {
  return createFakeDriverCabinetDb({
    bookings: bookings as Record<string, unknown>[],
    driver_assignments: assignments as Record<string, unknown>[],
  })
}

describe('resolveCabinetRide', () => {
  it('accepted on a waiting booking is the trip, with that assignment token', async () => {
    const db = dbWith([booking(1)], [assignment(1, 1)])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'trip', tripToken: tok(1) })
  })

  it('queries by id and driver_id only and never writes', async () => {
    const db = dbWith([booking(1)], [assignment(1, 1)])
    await resolveCabinetRide(db.client, DRIVER, aid(1))
    const detail = db.calls.find((c) => c.table === 'driver_assignments' && c.columns === RIDE_DETAIL_SELECT)
    expect(detail?.filters).toEqual(['eq id', 'eq driver_id'])
    expect(db.calls.filter((c) => c.op !== 'select')).toEqual([])
  })

  it('does not select a client name, phone, flight, notes, client fare or payment column', async () => {
    expect(RIDE_DETAIL_SELECT).not.toMatch(
      /client_|flight|special_requests|amount|payment|price_eur|passenger|email/i,
    )
    expect(RIDE_DETAIL_SELECT).toContain('driver_price_czk')
  })

  it('an unknown id, another driver id and a declined assignment are not available', async () => {
    const db = dbWith(
      [booking(1), booking(2)],
      [assignment(1, 1, { driver_id: OTHER }), assignment(2, 2, { status: 'declined' })],
    )
    expect(await resolveCabinetRide(db.client, DRIVER, aid(99))).toEqual({ kind: 'not_available' })
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
    expect(await resolveCabinetRide(db.client, DRIVER, aid(2))).toEqual({ kind: 'not_available' })
  })

  it('a superseded assignment (not the newest of its booking) is not available', async () => {
    const older = assignment(1, 1, { created_at: '2026-11-01T08:00:00.000Z' })
    const newer = assignment(2, 1, { driver_id: OTHER, created_at: '2026-11-02T08:00:00.000Z' })
    const db = dbWith([booking(1)], [older, newer])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
  })

  it('an accepted assignment without a trip token is not available', async () => {
    const db = dbWith([booking(1)], [assignment(1, 1, { trip_token: null })])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
  })

  it('a failing read is not available', async () => {
    const failing = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }) }) }),
      }),
    }
    expect(await resolveCabinetRide(failing, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
  })

  it.each(['en_route', 'on_location', 'on_board'])('a pending assignment on a %s booking is the trip', async (status) => {
    const db = dbWith([booking(1, { status })], [assignment(1, 1, { status: 'pending' })])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'trip', tripToken: tok(1) })
  })

  it.each(['assigned', 'confirmed'])('a pending assignment on a %s booking is an offer', async (status) => {
    const db = dbWith([booking(1, { status })], [assignment(1, 1, { status: 'pending' })])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'offer' })
  })

  it('accepted + completed is closed with the driver fee label and a Back to the Past month', async () => {
    const db = dbWith([booking(1, { status: 'completed' })], [assignment(1, 1)])
    const r = await resolveCabinetRide(db.client, DRIVER, aid(1))
    expect(r).toMatchObject({
      kind: 'closed',
      state: 'completed',
      backHref: '/driver/rides?view=past&month=2026-11',
    })
    if (r.kind !== 'closed') throw new Error('closed expected')
    expect(r.summary.feeLabel).toMatch(/2\s?500/)
    expect(r.summary).toMatchObject({
      bookingReference: 'PRG-1',
      pickupTime: '10:30',
      pickup: 'Václav Havel Airport Prague',
      dropoff: 'Hotel Alcron, Štěpánská 40',
    })
    expect(r.summary.dateLabel).toContain('27 Nov 2026')
    expect(r.summary.vehicleLabel).not.toBe('')
  })

  it('a completed ride without a positive integer fee has no fee label', async () => {
    for (const fee of [null, 0, -5, 12.5]) {
      const db = dbWith([booking(1, { status: 'completed', driver_price_czk: fee })], [assignment(1, 1)])
      const r = await resolveCabinetRide(db.client, DRIVER, aid(1))
      if (r.kind !== 'closed') throw new Error('closed expected')
      expect(r.summary.feeLabel).toBeNull()
    }
  })

  it('accepted + cancelled and accepted + no_show are closed without a fee label', async () => {
    const db = dbWith(
      [booking(1, { status: 'cancelled' }), booking(2, { status: 'no_show' })],
      [assignment(1, 1), assignment(2, 2)],
    )
    const cancelled = await resolveCabinetRide(db.client, DRIVER, aid(1))
    const noShow = await resolveCabinetRide(db.client, DRIVER, aid(2))
    expect(cancelled).toMatchObject({ kind: 'closed', state: 'cancelled' })
    expect(noShow).toMatchObject({ kind: 'closed', state: 'no_show' })
    if (cancelled.kind !== 'closed' || noShow.kind !== 'closed') throw new Error('closed expected')
    expect(cancelled.summary.feeLabel).toBeNull()
    expect(noShow.summary.feeLabel).toBeNull()
  })

  it('pending + cancelled is not available', async () => {
    const db = dbWith([booking(1, { status: 'cancelled' })], [assignment(1, 1, { status: 'pending' })])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
  })

  it('the summary never carries passenger, flight, notes, client fare or payment text', async () => {
    const db = dbWith([booking(1, { status: 'completed' })], [assignment(1, 1)])
    const r = await resolveCabinetRide(db.client, DRIVER, aid(1))
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/Jan|Novak|\+420123456789|OK123|Child seat|9999/)
  })

  it('source gate: the resolver has no write call', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/driver-cabinet/ride-detail.ts'), 'utf8')
    expect(src).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/)
  })
})

describe('/driver/rides/[assignmentId] page', () => {
  let db: FakeDriverCabinetDb

  beforeEach(() => {
    seq = 0
    h.requireDriver.mockReset()
    h.requireDriver.mockResolvedValue({ driverId: DRIVER, sessionId: 's1' })
    h.redirect.mockClear()
    db = dbWith(
      [booking(1), booking(2, { status: 'assigned' })],
      [assignment(1, 1), assignment(2, 2, { status: 'pending' })],
    )
    h.db = db
  })

  async function render(id: string) {
    return (await RideDetailPage({ params: Promise.resolve({ assignmentId: id }) })) as {
      type: unknown
      props: Record<string, unknown>
    }
  }

  it('gates itself with requireDriver before any query, with the ride path as next', async () => {
    await render(aid(1))
    expect(h.requireDriver).toHaveBeenCalledWith(`/driver/rides/${aid(1)}`)
  })

  it('a live ride renders the shared trip loader with that token and no token in the URL', async () => {
    const el = await render(aid(1))
    expect(el.type).toBe(TripScreenForToken)
    expect(el.props.token).toBe(tok(1))
    expect(`/driver/rides/${aid(1)}`).not.toContain(tok(1))
  })

  it('a pending offer that has not started redirects to the Offers tab', async () => {
    await expect(render(aid(2))).rejects.toThrow('REDIRECT:/driver/offers')
    expect(h.redirect).toHaveBeenCalledWith('/driver/offers')
  })

  it('a malformed id makes no query', async () => {
    db.calls.length = 0
    const el = await render('not-a-uuid')
    expect(el.type).not.toBe(TripScreenForToken)
    expect(db.calls).toEqual([])
  })

  it('source gate: the page has no write call and calls requireDriver', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/(internal)/driver/(cabinet)/rides/[assignmentId]/page.tsx'),
      'utf8',
    )
    expect(src).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/)
    expect(src).toMatch(/requireDriver\(/)
  })
})

describe('token page (D-15)', () => {
  it('stays a thin wrapper over the shared loader and writes nothing', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../app/(internal)/driver/trip/[token]/page.tsx'), 'utf8')
    expect(src).toMatch(/TripScreenForToken/)
    expect(src).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/)
    const loader = fs.readFileSync(
      path.resolve(__dirname, '../app/(internal)/driver/trip/[token]/TripScreenForToken.tsx'),
      'utf8',
    )
    expect(loader).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/)
  })
})
