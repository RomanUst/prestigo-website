import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

/**
 * Phase 94 plan 94-03 (D-08, D-10, D-15, D-17; DCAB-05, DCAB-07, DCAB-08): respondToOffer, the one accept / decline
 * path shared by the emailed link (token caller) and the cabinet (session caller), plus newestAssignmentByBooking.
 */

const { declineMock, acceptedMock } = vi.hoisted(() => ({
  declineMock: vi.fn(),
  acceptedMock: vi.fn(),
}))

vi.mock('@/lib/email', () => ({ sendDriverDeclineNotification: declineMock }))
vi.mock('@/lib/driver-accept-email', () => ({ sendDriverAcceptedTripEmail: acceptedMock }))

import { respondToOffer } from '@/lib/driver-offer'
import { newestAssignmentByBooking } from '@/lib/driver-cabinet/assignments'

const DRIVER = 'd0000000-0000-4000-8000-000000000001'
const OTHER_DRIVER = 'd0000000-0000-4000-8000-000000000002'
const BOOKING = 'b0000000-0000-4000-8000-000000000001'
const ASSIGNMENT = 'a0000000-0000-4000-8000-000000000001'
const TOKEN = 't0000000-0000-4000-8000-000000000001'

const FUTURE = () => new Date(Date.now() + 48 * 3600_000).toISOString()
const PAST = () => new Date(Date.now() - 3600_000).toISOString()

function seedDb(
  opts: {
    bookingStatus?: string
    assignment?: Record<string, unknown>
    extraAssignments?: Record<string, unknown>[]
  } = {},
): FakeDriverCabinetDb {
  return createFakeDriverCabinetDb({
    drivers: [
      { id: DRIVER, name: 'Petr Driver', email: 'petr@example.com', cabinet_enabled: true },
      { id: OTHER_DRIVER, name: 'Other Driver', email: 'other@example.com', cabinet_enabled: true },
    ],
    bookings: [
      {
        id: BOOKING,
        status: opts.bookingStatus ?? 'assigned',
        booking_reference: 'PRG-20260501-ABCDEF',
        pickup_date: '2026-05-01',
        pickup_time: '10:00',
        origin_address: 'Prague Airport',
        destination_address: 'Hotel Alcron',
      },
    ],
    driver_assignments: [
      {
        id: ASSIGNMENT,
        booking_id: BOOKING,
        driver_id: DRIVER,
        status: 'pending',
        token: TOKEN,
        token_expires_at: FUTURE(),
        token_used_at: null,
        created_at: '2026-04-01T10:00:00.000Z',
        ...(opts.assignment ?? {}),
      },
      ...(opts.extraAssignments ?? []),
    ],
  })
}

function assignmentRow(db: FakeDriverCabinetDb, id = ASSIGNMENT) {
  return db.tables.driver_assignments.find((r) => r.id === id)!
}

beforeEach(() => {
  declineMock.mockReset().mockResolvedValue(undefined)
  acceptedMock.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('respondToOffer, token caller (the email link, D-15)', () => {
  const token = { kind: 'token', token: TOKEN } as const

  it('an unknown token answers invalid_token', async () => {
    const db = seedDb()
    const r = await respondToOffer(db.client, { action: 'accepted', caller: { kind: 'token', token: 'nope' } })
    expect(r).toEqual({ ok: false, error: 'invalid_token' })
  })

  it('a used token answers invalid_token and changes nothing', async () => {
    const db = seedDb({ assignment: { token_used_at: '2026-04-02T00:00:00.000Z', status: 'accepted' } })
    const r = await respondToOffer(db.client, { action: 'declined', caller: token })
    expect(r).toEqual({ ok: false, error: 'invalid_token' })
    expect(assignmentRow(db).status).toBe('accepted')
  })

  it('an expired token answers invalid_token and changes nothing', async () => {
    const db = seedDb({ assignment: { token_expires_at: PAST() } })
    const r = await respondToOffer(db.client, { action: 'accepted', caller: token })
    expect(r).toEqual({ ok: false, error: 'invalid_token' })
    expect(assignmentRow(db).status).toBe('pending')
  })

  it('a lost race (the guarded update finds no row) answers used', async () => {
    const db = seedDb()
    // The pre-check passes, then the row is consumed before the guarded update runs.
    const realFrom = db.client.from
    db.client.from = (table: string) => {
      const q = realFrom(table) as { update: (p: Record<string, unknown>) => unknown }
      const origUpdate = q.update.bind(q)
      q.update = (p: Record<string, unknown>) => {
        assignmentRow(db).token_used_at = '2026-04-02T00:00:00.000Z'
        return origUpdate(p)
      }
      return q
    }
    const r = await respondToOffer(db.client, { action: 'accepted', caller: token })
    expect(r).toEqual({ ok: false, error: 'used' })
    expect(assignmentRow(db).status).toBe('pending')
  })

  it('success writes { status, token_used_at } guarded by token_expires_at and token_used_at', async () => {
    const db = seedDb()
    const r = await respondToOffer(db.client, { action: 'accepted', caller: token })
    expect(r.ok).toBe(true)
    const row = assignmentRow(db)
    expect(row.status).toBe('accepted')
    expect(typeof row.token_used_at).toBe('string')
    const update = db.calls.find((c) => c.table === 'driver_assignments' && c.op === 'update')!
    expect(update.filters).toEqual(['eq id', 'gt token_expires_at', 'is token_used_at'])
  })

  it('does not require the booking to be live or the assignment to be the newest (today, byte for byte)', async () => {
    const db = seedDb({
      bookingStatus: 'cancelled',
      extraAssignments: [
        { id: 'a0000000-0000-4000-8000-000000000009', booking_id: BOOKING, driver_id: OTHER_DRIVER, created_at: '2026-04-05T00:00:00.000Z' },
      ],
    })
    const r = await respondToOffer(db.client, { action: 'declined', caller: token })
    expect(r.ok).toBe(true)
  })
})

describe('respondToOffer, session caller (the cabinet, D-08 / D-10 / D-17)', () => {
  const session = (driverId = DRIVER, assignmentId = ASSIGNMENT) =>
    ({ kind: 'session', driverId, assignmentId }) as const

  it('a live offer is answered and the row becomes { status, token_used_at }', async () => {
    const db = seedDb()
    const r = await respondToOffer(db.client, { action: 'accepted', caller: session() })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.assignmentId).toBe(ASSIGNMENT)
      expect(r.action).toBe('accepted')
    }
    const row = assignmentRow(db)
    expect(row.status).toBe('accepted')
    expect(typeof row.token_used_at).toBe('string')
    const update = db.calls.find((c) => c.table === 'driver_assignments' && c.op === 'update')!
    expect(update.filters).toContain('eq driver_id')
    expect(update.filters).toContain('eq status')
    expect(update.filters).not.toContain('gt token_expires_at')
  })

  it('ignores token_expires_at: an offer whose link expired can still be answered (D-10)', async () => {
    const db = seedDb({ assignment: { token_expires_at: PAST() } })
    const r = await respondToOffer(db.client, { action: 'declined', caller: session() })
    expect(r.ok).toBe(true)
    expect(assignmentRow(db).status).toBe('declined')
    const reads = db.calls.filter((c) => c.table === 'driver_assignments' && c.op === 'select')
    for (const c of reads) expect(c.columns ?? '').not.toContain('token_expires_at')
  })

  it('the emailed link reads used after a cabinet answer (D-17)', async () => {
    const db = seedDb()
    await respondToOffer(db.client, { action: 'accepted', caller: session() })
    const again = await respondToOffer(db.client, { action: 'declined', caller: { kind: 'token', token: TOKEN } })
    expect(again).toEqual({ ok: false, error: 'invalid_token' })
    expect(assignmentRow(db).status).toBe('accepted')
  })

  it('an assignment of another driver is not available and nothing changes', async () => {
    const db = seedDb()
    const r = await respondToOffer(db.client, { action: 'accepted', caller: session(OTHER_DRIVER) })
    expect(r).toEqual({ ok: false, error: 'not_available' })
    expect(assignmentRow(db).status).toBe('pending')
    expect(assignmentRow(db).token_used_at).toBeNull()
  })

  it('an unknown assignment id is not available', async () => {
    const db = seedDb()
    const r = await respondToOffer(db.client, {
      action: 'accepted',
      caller: session(DRIVER, 'a0000000-0000-4000-8000-0000000000ff'),
    })
    expect(r).toEqual({ ok: false, error: 'not_available' })
  })

  it.each(['accepted', 'declined'])('an already %s assignment is not available', async (status) => {
    const db = seedDb({ assignment: { status, token_used_at: '2026-04-02T00:00:00.000Z' } })
    const r = await respondToOffer(db.client, { action: 'accepted', caller: session() })
    expect(r).toEqual({ ok: false, error: 'not_available' })
    expect(assignmentRow(db).status).toBe(status)
  })

  it('a superseded assignment (a later one exists for the booking) is not available', async () => {
    const db = seedDb({
      extraAssignments: [
        { id: 'a0000000-0000-4000-8000-000000000009', booking_id: BOOKING, driver_id: OTHER_DRIVER, created_at: '2026-04-05T00:00:00.000Z' },
      ],
    })
    const r = await respondToOffer(db.client, { action: 'accepted', caller: session() })
    expect(r).toEqual({ ok: false, error: 'not_available' })
    expect(assignmentRow(db).status).toBe('pending')
  })

  it.each(['cancelled', 'completed', 'no_show', 'en_route', 'on_location', 'on_board'])(
    'a booking in status %s is not available',
    async (bookingStatus) => {
      const db = seedDb({ bookingStatus })
      const r = await respondToOffer(db.client, { action: 'accepted', caller: session() })
      expect(r).toEqual({ ok: false, error: 'not_available' })
      expect(assignmentRow(db).status).toBe('pending')
      expect(db.calls.some((c) => c.op === 'update')).toBe(false)
    },
  )

  it.each(['assigned', 'confirmed'])('a booking in status %s is answerable', async (bookingStatus) => {
    const db = seedDb({ bookingStatus })
    const r = await respondToOffer(db.client, { action: 'accepted', caller: session() })
    expect(r.ok).toBe(true)
  })

  it('a concurrent answer (the guarded update finds no row) is not available', async () => {
    const db = seedDb()
    const realFrom = db.client.from
    db.client.from = (table: string) => {
      const q = realFrom(table) as { update: (p: Record<string, unknown>) => unknown }
      const origUpdate = q.update.bind(q)
      q.update = (p: Record<string, unknown>) => {
        // The other answer lands first.
        assignmentRow(db).status = 'declined'
        return origUpdate(p)
      }
      return q
    }
    const r = await respondToOffer(db.client, { action: 'accepted', caller: session() })
    expect(r).toEqual({ ok: false, error: 'not_available' })
    expect(assignmentRow(db).status).toBe('declined')
  })

  it('a failing update is not available', async () => {
    const db = seedDb()
    db.failWritesOn.add('driver_assignments')
    const r = await respondToOffer(db.client, { action: 'accepted', caller: session() })
    expect(r).toEqual({ ok: false, error: 'not_available' })
  })
})

describe('respondToOffer runEffects (same for both callers)', () => {
  it('declined: reads the driver and booking and sends the decline notice once', async () => {
    const db = seedDb()
    const r = await respondToOffer(db.client, {
      action: 'declined',
      caller: { kind: 'session', driverId: DRIVER, assignmentId: ASSIGNMENT },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(declineMock).not.toHaveBeenCalled()
    await r.runEffects()
    expect(declineMock).toHaveBeenCalledTimes(1)
    expect(declineMock).toHaveBeenCalledWith({
      bookingReference: 'PRG-20260501-ABCDEF',
      pickupDate: '2026-05-01',
      pickupTime: '10:00',
      originAddress: 'Prague Airport',
      destinationAddress: 'Hotel Alcron',
      driverName: 'Petr Driver',
    })
    expect(acceptedMock).not.toHaveBeenCalled()
  })

  it('accepted: sends the accepted-trip email once with the assignment id', async () => {
    const db = seedDb()
    const r = await respondToOffer(db.client, { action: 'accepted', caller: { kind: 'token', token: TOKEN } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    await r.runEffects()
    expect(acceptedMock).toHaveBeenCalledTimes(1)
    expect(acceptedMock).toHaveBeenCalledWith(ASSIGNMENT)
    expect(declineMock).not.toHaveBeenCalled()
  })

  it('a rejecting sender is logged with the existing tag and never thrown', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    acceptedMock.mockRejectedValueOnce(new Error('resend down'))
    declineMock.mockRejectedValueOnce(new Error('resend down'))

    const db1 = seedDb()
    const accepted = await respondToOffer(db1.client, { action: 'accepted', caller: { kind: 'token', token: TOKEN } })
    if (!accepted.ok) throw new Error('expected ok')
    await expect(accepted.runEffects()).resolves.toBeUndefined()
    expect(errSpy.mock.calls.some((c) => c[0] === '[driver-accept]:')).toBe(true)

    const db2 = seedDb()
    const declined = await respondToOffer(db2.client, { action: 'declined', caller: { kind: 'token', token: TOKEN } })
    if (!declined.ok) throw new Error('expected ok')
    await expect(declined.runEffects()).resolves.toBeUndefined()
    expect(errSpy.mock.calls.some((c) => c[0] === '[driver-decline]:')).toBe(true)
  })

  it('declined with a missing booking sends nothing and does not throw', async () => {
    const db = seedDb()
    const r = await respondToOffer(db.client, { action: 'declined', caller: { kind: 'token', token: TOKEN } })
    if (!r.ok) throw new Error('expected ok')
    db.tables.bookings.length = 0
    await expect(r.runEffects()).resolves.toBeUndefined()
    expect(declineMock).not.toHaveBeenCalled()
  })
})

describe('newestAssignmentByBooking', () => {
  it('picks the latest created_at per booking', async () => {
    const db = createFakeDriverCabinetDb({
      driver_assignments: [
        { id: 'a1', booking_id: 'b1', created_at: '2026-04-01T10:00:00.000Z' },
        { id: 'a2', booking_id: 'b1', created_at: '2026-04-03T10:00:00.000Z' },
        { id: 'a3', booking_id: 'b1', created_at: '2026-04-02T10:00:00.000Z' },
        { id: 'a4', booking_id: 'b2', created_at: '2026-04-01T10:00:00.000Z' },
      ],
    })
    const map = await newestAssignmentByBooking(db.client, ['b1', 'b2'])
    expect(map.get('b1')).toBe('a2')
    expect(map.get('b2')).toBe('a4')
  })

  it('breaks a created_at tie with the larger id', async () => {
    const db = createFakeDriverCabinetDb({
      driver_assignments: [
        { id: 'a1', booking_id: 'b1', created_at: '2026-04-01T10:00:00.000Z' },
        { id: 'a9', booking_id: 'b1', created_at: '2026-04-01T10:00:00.000Z' },
      ],
    })
    const map = await newestAssignmentByBooking(db.client, ['b1'])
    expect(map.get('b1')).toBe('a9')
  })

  it('makes no query for an empty list', async () => {
    const db = createFakeDriverCabinetDb()
    const map = await newestAssignmentByBooking(db.client, [])
    expect(map.size).toBe(0)
    expect(db.calls).toHaveLength(0)
  })

  it('reads only id, booking_id and created_at with one query', async () => {
    const db = createFakeDriverCabinetDb({
      driver_assignments: [{ id: 'a1', booking_id: 'b1', created_at: '2026-04-01T10:00:00.000Z' }],
    })
    await newestAssignmentByBooking(db.client, ['b1'])
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0].columns).toBe('id, booking_id, created_at')
    expect(db.calls[0].filters).toEqual(['in booking_id'])
  })
})
