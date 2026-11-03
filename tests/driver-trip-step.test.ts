import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 87 Plan 08 (D-01, D-12, DRV-01/02/04): the driver step flow. The route is a thin
// wrapper; lib/driver-trip-step.ts decides, lib/booking-status-service.ts writes. These tests
// drive driverTripStep / buildTripView directly and the route POST end to end (service mocked).

const afterCallbacks: Array<() => unknown> = []

const { mockAdvance, mockPush, mockFrom, mockCheckRateLimit, mockGetClientIp } = vi.hoisted(() => ({
  mockAdvance: vi.fn(),
  mockPush: vi.fn(),
  mockFrom: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(() => '127.0.0.1'),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => {
      afterCallbacks.push(fn)
    },
  }
})

vi.mock('@/lib/booking-status-service', () => ({ advanceBookingStatus: mockAdvance }))
vi.mock('@/lib/gnet-push', () => ({ pushGnetForTransition: mockPush }))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: mockFrom })),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: mockGetClientIp,
}))

import { POST } from '@/app/api/driver/trip/[token]/progress/route'
import {
  driverTripStep,
  driverTripNote,
  driverTripRequestSchema,
  buildTripView,
  type DriverTripRecord,
} from '@/lib/driver-trip-step'

const validToken = 'a0000004-0000-4000-8000-000000000004'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const otherDriverId = 'a0000009-0000-4000-8000-000000000009'
const bookingId = 'b0000001-0000-4000-8000-000000000001'
const NOW = Date.parse('2026-11-12T10:00:00Z')

function bookingRow(overrides: Partial<DriverTripRecord['booking']> = {}): DriverTripRecord['booking'] {
  return {
    id: bookingId,
    status: 'assigned',
    driver_id: driverId,
    booking_source: 'online',
    amount_eur: 120,
    pickup_utc: '2026-11-12T13:30:00Z',
    pickup_date: '2026-11-12',
    pickup_time: '14:30',
    origin_lat: 50.087,
    origin_lng: 14.421,
    origin_address: 'Old Town Square, Prague',
    completed_at: null,
    no_show_requested_at: null,
    ...overrides,
  }
}

function tripRecord(
  bookingOverrides: Partial<DriverTripRecord['booking']> = {},
  overrides: Partial<Omit<DriverTripRecord, 'booking'>> = {},
): DriverTripRecord {
  return {
    assignmentId: 'assign-1',
    assignmentDriverId: driverId,
    assignmentStatus: 'accepted',
    booking: bookingRow(bookingOverrides),
    ...overrides,
  }
}

/** Raw driver_assignments row as the loader's single select returns it. */
function rawRow(bookingOverrides: Partial<DriverTripRecord['booking']> = {}, assignment: Record<string, unknown> = {}) {
  return {
    id: 'assign-1',
    driver_id: driverId,
    status: 'accepted',
    bookings: bookingRow(bookingOverrides),
    ...assignment,
  }
}

const assignmentUpdates: Array<Record<string, unknown>> = []
let updateError: { message: string } | null = null

function setupSupabase(lookup: { data: unknown; error?: unknown }) {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'driver_assignments') throw new Error(`unexpected table ${table}`)
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({ data: lookup.data, error: lookup.error ?? (lookup.data ? null : { message: 'not found' }) }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        assignmentUpdates.push(payload)
        return { eq: async () => ({ error: updateError }) }
      },
    }
  })
}

function supabaseStub() {
  return { from: mockFrom } as unknown as Parameters<typeof driverTripStep>[0]['supabase']
}

function advanceOk(to: string, previous: string, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    applied: true,
    previous,
    current: to,
    booking: { id: bookingId, status: to, ...extra },
  }
}

function makeRequest(token: string, body: unknown): Request {
  return new Request(`http://localhost/api/driver/trip/${token}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function callRoute(token: string, body: unknown) {
  return POST(makeRequest(token, body), { params: Promise.resolve({ token }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  afterCallbacks.length = 0
  assignmentUpdates.length = 0
  updateError = null
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, limit: 20 })
  mockGetClientIp.mockReturnValue('127.0.0.1')
  mockPush.mockResolvedValue(undefined)
  setupSupabase({ data: rawRow() })
})

describe('driverTripRequestSchema (D-06, DRV-03)', () => {
  it('accepts exactly { step } or { note }', () => {
    expect(driverTripRequestSchema.safeParse({ step: 'en_route' }).success).toBe(true)
    expect(driverTripRequestSchema.safeParse({ step: 'on_site' }).success).toBe(true)
    expect(driverTripRequestSchema.safeParse({ note: 'running late' }).success).toBe(true)
  })

  it.each([
    { step: 'en_route', amount: 10 },
    { status: 'completed' },
    { step: 'no_show' },
    { step: 'arrived' },
    { progress: 'en_route' },
    { step: 'en_route', note: 'x' },
    {},
  ])('rejects %j', (body) => {
    expect(driverTripRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('driverTripStep: accepted steps go through the status service (D-01, DRV-02)', () => {
  it('assigned + en_route: one service call with the driver actor and a CAS, then the trip_progress mirror', async () => {
    mockAdvance.mockResolvedValue(advanceOk('en_route', 'assigned'))

    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord(), step: 'en_route', nowMs: NOW })

    expect(res.httpStatus).toBe(200)
    expect(res.body).toEqual({ ok: true, status: 'en_route', nextStep: 'on_site' })
    expect(mockAdvance).toHaveBeenCalledTimes(1)
    expect(mockAdvance).toHaveBeenCalledWith({
      bookingId,
      to: 'en_route',
      expectedFrom: 'assigned',
      actor: { type: 'driver', id: driverId },
      source: 'driver_trip',
      profile: 'full',
    })
    expect(assignmentUpdates).toHaveLength(1)
    expect(assignmentUpdates[0]).toMatchObject({ trip_progress: 'en_route' })
    expect(typeof assignmentUpdates[0].trip_progress_updated_at).toBe('string')
  })

  it('en_route + on_site: target on_location, mirror "arrived", next step on_board', async () => {
    mockAdvance.mockResolvedValue(advanceOk('on_location', 'en_route'))

    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord({ status: 'en_route' }), step: 'on_site', nowMs: NOW })

    expect(res.body).toEqual({ ok: true, status: 'on_location', nextStep: 'on_board' })
    expect(mockAdvance).toHaveBeenCalledWith(expect.objectContaining({ to: 'on_location', expectedFrom: 'en_route' }))
    expect(assignmentUpdates[0]).toMatchObject({ trip_progress: 'arrived' })
  })

  it('on_location + on_board: target on_board, mirror "on_board", next step completed', async () => {
    mockAdvance.mockResolvedValue(advanceOk('on_board', 'on_location'))

    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord({ status: 'on_location' }), step: 'on_board', nowMs: NOW })

    expect(res.body).toEqual({ ok: true, status: 'on_board', nextStep: 'completed' })
    expect(assignmentUpdates[0]).toMatchObject({ trip_progress: 'on_board' })
  })

  it('on_board + completed: target completed, no next step, completedAt from the service row', async () => {
    mockAdvance.mockResolvedValue(advanceOk('completed', 'on_board', { completed_at: '2026-11-12T15:00:00Z' }))

    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord({ status: 'on_board' }), step: 'completed', nowMs: NOW })

    expect(res.httpStatus).toBe(200)
    expect(res.body).toEqual({ ok: true, status: 'completed', nextStep: null, completedAt: '2026-11-12T15:00:00Z' })
    expect(assignmentUpdates[0]).toMatchObject({ trip_progress: 'completed' })
  })
})

describe('driverTripStep: replay (D-12, DRV-04)', () => {
  it('a step already applied is a 200 replay with no service call and no update', async () => {
    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord({ status: 'on_location' }), step: 'on_site', nowMs: NOW })

    expect(res.httpStatus).toBe(200)
    expect(res.body).toEqual({ ok: true, replay: true, status: 'on_location', nextStep: 'on_board' })
    expect(mockAdvance).not.toHaveBeenCalled()
    expect(assignmentUpdates).toHaveLength(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('a completed trip replayed with step completed is still a 200 (not a 400)', async () => {
    const res = await driverTripStep({
      supabase: supabaseStub(),
      trip: tripRecord({ status: 'completed', completed_at: '2026-11-12T15:00:00Z' }),
      step: 'completed',
      nowMs: NOW,
    })

    expect(res.httpStatus).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      replay: true,
      status: 'completed',
      nextStep: null,
      completedAt: '2026-11-12T15:00:00Z',
    })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('a replay on a gnet booking schedules pushGnetForTransition for the applied status', async () => {
    await driverTripStep({
      supabase: supabaseStub(),
      trip: tripRecord({ status: 'on_location', booking_source: 'gnet', amount_eur: 80 }),
      step: 'on_site',
      nowMs: NOW,
    })

    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]()
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId, bookingSource: 'gnet', status: 'on_location', amountEur: 80 }),
    )
  })

  it('a replay on a non-gnet booking does not call pushGnetForTransition', async () => {
    await driverTripStep({
      supabase: supabaseStub(),
      trip: tripRecord({ status: 'on_location' }),
      step: 'on_site',
      nowMs: NOW,
    })

    expect(afterCallbacks).toHaveLength(0)
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('driverTripStep: strict order and conflicts', () => {
  it('a skipped step is a 409 step_conflict carrying the current status and next step, with no writes', async () => {
    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord({ status: 'assigned' }), step: 'on_board', nowMs: NOW })

    expect(res.httpStatus).toBe(409)
    expect(res.body).toEqual({ ok: false, error: 'step_conflict', status: 'assigned', nextStep: 'en_route' })
    expect(mockAdvance).not.toHaveBeenCalled()
    expect(assignmentUpdates).toHaveLength(0)
  })

  it('a confirmed (not yet assigned) booking has no next step: 409 step_conflict with nextStep null', async () => {
    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord({ status: 'confirmed' }), step: 'en_route', nowMs: NOW })

    expect(res.httpStatus).toBe(409)
    expect(res.body).toEqual({ ok: false, error: 'step_conflict', status: 'confirmed', nextStep: null })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('an admin change between read and write: service conflict becomes 409 with the admin status and no mirror', async () => {
    mockAdvance.mockResolvedValue({ ok: false, code: 'conflict', message: 'status_conflict', currentStatus: 'cancelled' })

    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord({ status: 'assigned' }), step: 'en_route', nowMs: NOW })

    expect(res.httpStatus).toBe(409)
    expect(res.body).toEqual({ ok: false, error: 'step_conflict', status: 'cancelled', nextStep: null })
    expect(assignmentUpdates).toHaveLength(0)
  })

  it('a service conflict to a status that has a next step reports that step', async () => {
    mockAdvance.mockResolvedValue({ ok: false, code: 'conflict', message: 'status_conflict', currentStatus: 'en_route' })

    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord({ status: 'assigned' }), step: 'en_route', nowMs: NOW })

    expect(res.body).toEqual({ ok: false, error: 'step_conflict', status: 'en_route', nextStep: 'on_site' })
  })

  it('a non-replay step on a terminal booking is a 400 invalid_token', async () => {
    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord({ status: 'cancelled' }), step: 'en_route', nowMs: NOW })

    expect(res.httpStatus).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_token' })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('a service db_error is a 500 update_failed', async () => {
    mockAdvance.mockResolvedValue({ ok: false, code: 'db_error', message: 'DB update failed' })

    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord(), step: 'en_route', nowMs: NOW })

    expect(res.httpStatus).toBe(500)
    expect(res.body).toEqual({ ok: false, error: 'update_failed', status: 'assigned', nextStep: 'en_route' })
  })

  it('a service not_found or invalid_transition never lets the step through as ok', async () => {
    mockAdvance.mockResolvedValue({ ok: false, code: 'invalid_transition', message: "Cannot transition from 'assigned' to 'en_route'" })

    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord(), step: 'en_route', nowMs: NOW })

    expect(res.httpStatus).toBe(409)
    expect(res.body).toMatchObject({ ok: false, error: 'step_conflict' })
    expect(assignmentUpdates).toHaveLength(0)
  })

  it('a failed trip_progress mirror does not undo the applied status: still 200', async () => {
    mockAdvance.mockResolvedValue(advanceOk('en_route', 'assigned'))
    updateError = { message: 'mirror failed' }

    const res = await driverTripStep({ supabase: supabaseStub(), trip: tripRecord(), step: 'en_route', nowMs: NOW })

    expect(res.httpStatus).toBe(200)
    expect(res.body).toMatchObject({ ok: true, status: 'en_route' })
  })

  it('a link whose identity is invalid (declined, reassigned) is a 400 invalid_token even for a replay', async () => {
    const declined = await driverTripStep({
      supabase: supabaseStub(),
      trip: tripRecord({ status: 'en_route' }, { assignmentStatus: 'declined' }),
      step: 'en_route',
      nowMs: NOW,
    })
    expect(declined.httpStatus).toBe(400)

    const reassigned = await driverTripStep({
      supabase: supabaseStub(),
      trip: tripRecord({ status: 'en_route', driver_id: otherDriverId }),
      step: 'en_route',
      nowMs: NOW,
    })
    expect(reassigned.httpStatus).toBe(400)
    expect(mockAdvance).not.toHaveBeenCalled()
  })
})

describe('driverTripNote (D-21)', () => {
  it('writes trip_note + trip_progress_updated_at only, for an active link', async () => {
    const res = await driverTripNote({ supabase: supabaseStub(), trip: tripRecord({ status: 'en_route' }), note: 'Passenger running late' })

    expect(res.httpStatus).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(assignmentUpdates).toHaveLength(1)
    expect(assignmentUpdates[0]).toMatchObject({ trip_note: 'Passenger running late' })
    expect(assignmentUpdates[0]).not.toHaveProperty('trip_progress')
    expect(typeof assignmentUpdates[0].trip_progress_updated_at).toBe('string')
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('a completed or cancelled link is a 400 invalid_token', async () => {
    const completed = await driverTripNote({ supabase: supabaseStub(), trip: tripRecord({ status: 'completed' }), note: 'x' })
    expect(completed.httpStatus).toBe(400)
    const cancelled = await driverTripNote({ supabase: supabaseStub(), trip: tripRecord({ status: 'cancelled' }), note: 'x' })
    expect(cancelled.httpStatus).toBe(400)
    expect(assignmentUpdates).toHaveLength(0)
  })

  it('a db error is a 500 update_failed', async () => {
    updateError = { message: 'boom' }
    const res = await driverTripNote({ supabase: supabaseStub(), trip: tripRecord(), note: 'x' })
    expect(res.httpStatus).toBe(500)
    expect(res.body).toEqual({ error: 'update_failed' })
  })
})

describe('buildTripView', () => {
  it.each(['confirmed', 'pending', 'unpaid'])('%s is "waiting" with no next step', async (status) => {
    const view = await buildTripView({ booking: bookingRow({ status }), nowMs: NOW })
    expect(view).toMatchObject({ status, nextStep: null, lockReason: 'waiting', unlocksAt: null })
  })

  it('an assigned booking shows en_route as the next step', async () => {
    const view = await buildTripView({ booking: bookingRow({ status: 'assigned' }), nowMs: NOW })
    expect(view.nextStep).toBe('en_route')
  })

  it('a later status has its next step and no lock', async () => {
    const view = await buildTripView({ booking: bookingRow({ status: 'en_route' }), nowMs: NOW })
    expect(view).toEqual({ status: 'en_route', nextStep: 'on_site', lockReason: null, unlocksAt: null })
  })
})

describe('POST /api/driver/trip/[token]/progress: tracer end to end', () => {
  it('{ step: en_route } moves the booking through the service and answers { ok, status, nextStep }', async () => {
    mockAdvance.mockResolvedValue(advanceOk('en_route', 'assigned'))

    const res = await callRoute(validToken, { step: 'en_route' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, status: 'en_route', nextStep: 'on_site' })
    expect(mockAdvance).toHaveBeenCalledTimes(1)
    expect(mockAdvance).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'en_route', expectedFrom: 'assigned', actor: { type: 'driver', id: driverId }, source: 'driver_trip', profile: 'full' }),
    )
    expect(mockFrom).not.toHaveBeenCalledWith('bookings')
  })

  it('a skipped step answers 409 step_conflict through the route', async () => {
    const res = await callRoute(validToken, { step: 'completed' })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ ok: false, error: 'step_conflict', status: 'assigned', nextStep: 'en_route' })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('a replay of the applied step answers 200 replay through the route', async () => {
    setupSupabase({ data: rawRow({ status: 'on_board' }) })

    const res = await callRoute(validToken, { step: 'on_board' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, replay: true, status: 'on_board', nextStep: 'completed' })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('completed replay after the link became terminal is a 200 through the route', async () => {
    setupSupabase({ data: rawRow({ status: 'completed', completed_at: '2026-11-12T15:00:00Z' }) })

    const res = await callRoute(validToken, { step: 'completed' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, replay: true, status: 'completed', nextStep: null })
  })

  it.each([
    ['cancelled booking', rawRow({ status: 'cancelled' })],
    ['reassigned driver', rawRow({ driver_id: otherDriverId })],
    ['declined assignment', rawRow({}, { status: 'declined' })],
    ['driverless booking', rawRow({ driver_id: null })],
  ])('%s answers the uniform 400 invalid_token', async (_label, row) => {
    setupSupabase({ data: row })

    const res = await callRoute(validToken, { step: 'en_route' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('an unknown token answers the uniform 400 invalid_token', async () => {
    setupSupabase({ data: null, error: { message: 'Not found' } })

    const res = await callRoute(validToken, { step: 'en_route' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
  })

  it('a service db_error answers 500 update_failed', async () => {
    mockAdvance.mockResolvedValue({ ok: false, code: 'db_error', message: 'DB update failed' })

    const res = await callRoute(validToken, { step: 'en_route' })

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'update_failed' })
  })

  it('a note-only POST on an active link writes the note and answers { ok: true }', async () => {
    const res = await callRoute(validToken, { note: 'At the gate' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(assignmentUpdates[0]).toMatchObject({ trip_note: 'At the gate' })
    expect(mockAdvance).not.toHaveBeenCalled()
  })
})
