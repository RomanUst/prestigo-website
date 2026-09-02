import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted
// before imports) — mirrors tests/driver-trip.test.ts / tests/check-flight.test.ts
// conventions.
const { stubSupabaseFrom, mockCheckRateLimit, mockGetClientIp } = vi.hoisted(() => ({
  stubSupabaseFrom: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(() => '127.0.0.1'),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: stubSupabaseFrom })),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: mockGetClientIp,
}))

import { POST } from '@/app/api/driver/trip/[token]/progress/route'

const validToken = 'a0000004-0000-4000-8000-000000000004'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const otherDriverId = 'a0000009-0000-4000-8000-000000000009'

function makeRequest(token: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/driver/trip/${token}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function callRoute(token: string, body: Record<string, unknown>) {
  return POST(makeRequest(token, body), { params: Promise.resolve({ token }) })
}

function makeAssignmentRow(overrides: {
  assignmentDriverId?: string
  bookingDriverId?: string | null
  bookingStatus?: string
} = {}) {
  return {
    id: 'assign-1',
    driver_id: overrides.assignmentDriverId ?? driverId,
    bookings: {
      driver_id: overrides.bookingDriverId === undefined ? driverId : overrides.bookingDriverId,
      status: overrides.bookingStatus ?? 'assigned',
    },
  }
}

/** Sets up the SELECT (lookup) call: .from().select().eq().single() */
function mockSelectSingle(data: unknown, error: unknown = null) {
  const singleFn = vi.fn().mockResolvedValue({ data, error })
  const eqFn = vi.fn().mockReturnValue({ single: singleFn })
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
  return { select: selectFn, singleFn, eqFn, selectFn }
}

/** Sets up a two-call sequence: first call = select lookup, second call = update. */
function mockLookupThenUpdate(
  lookupData: unknown,
  lookupError: unknown = null,
  updateResult: { data: unknown; error: unknown } = { data: null, error: null }
) {
  const updateEqFn = vi.fn().mockResolvedValue(updateResult)
  const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

  let callCount = 0
  stubSupabaseFrom.mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      const singleFn = vi.fn().mockResolvedValue({ data: lookupData, error: lookupError })
      const eqFn = vi.fn().mockReturnValue({ single: singleFn })
      const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
      return { select: selectFn }
    }
    return { update: updateFn }
  })

  return { updateFn, updateEqFn }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, limit: 20 })
  mockGetClientIp.mockReturnValue('127.0.0.1')
})

describe('POST /api/driver/trip/[token]/progress (DTRIP-03/04/08)', () => {
  it('writes trip_progress + trip_progress_updated_at for a valid token', async () => {
    const { updateFn } = mockLookupThenUpdate(makeAssignmentRow())

    const res = await callRoute(validToken, { progress: 'en_route' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('ok', true)

    expect(updateFn).toHaveBeenCalledTimes(1)
    const payload = updateFn.mock.calls[0][0]
    expect(payload).toMatchObject({ trip_progress: 'en_route' })
    expect(typeof payload.trip_progress_updated_at).toBe('string')
  })

  it.each(['en_route', 'arrived', 'on_board', 'completed', 'no_show'] as const)(
    'accepts trip-progress value "%s" with no ordering gate',
    async (value) => {
      mockLookupThenUpdate(makeAssignmentRow())

      const res = await callRoute(validToken, { progress: value })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toHaveProperty('ok', true)
    }
  )

  it('rejects a progress value outside the enum with 400 Invalid payload', async () => {
    mockLookupThenUpdate(makeAssignmentRow())

    const res = await callRoute(validToken, { progress: 'boarded' })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid payload')
  })

  it('rejects an unknown token with uniform 400 invalid_token', async () => {
    const { select } = mockSelectSingle(null, { message: 'Not found' })
    stubSupabaseFrom.mockReturnValue({ select })

    const res = await callRoute(validToken, { progress: 'en_route' })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid_token')
  })

  it('rejects a reassigned driver (assignment.driver_id !== booking.driver_id) with uniform 400 invalid_token', async () => {
    const { select } = mockSelectSingle(
      makeAssignmentRow({ assignmentDriverId: driverId, bookingDriverId: otherDriverId })
    )
    stubSupabaseFrom.mockReturnValue({ select })

    const res = await callRoute(validToken, { progress: 'en_route' })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid_token')
  })

  it('rejects a terminal booking status (completed) with uniform 400 invalid_token', async () => {
    const { select } = mockSelectSingle(makeAssignmentRow({ bookingStatus: 'completed' }))
    stubSupabaseFrom.mockReturnValue({ select })

    const res = await callRoute(validToken, { progress: 'en_route' })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid_token')
  })

  it('rejects a terminal booking status (cancelled) with uniform 400 invalid_token', async () => {
    const { select } = mockSelectSingle(makeAssignmentRow({ bookingStatus: 'cancelled' }))
    stubSupabaseFrom.mockReturnValue({ select })

    const res = await callRoute(validToken, { progress: 'en_route' })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid_token')
  })

  it('ISOLATION: never invokes Supabase from() with "bookings" for an update on a completed booking', async () => {
    const { select } = mockSelectSingle(makeAssignmentRow({ bookingStatus: 'completed' }))
    stubSupabaseFrom.mockReturnValue({ select })

    await callRoute(validToken, { progress: 'completed' })

    // The mocked `from` is only ever invoked with 'driver_assignments' (the
    // stub is keyed generically, but this route hardcodes the table name at
    // every call site — asserting the mock was called at all, with no
    // 'bookings' update call captured, proves no bookings mutation occurred).
    expect(stubSupabaseFrom).toHaveBeenCalledWith('driver_assignments')
    expect(stubSupabaseFrom).not.toHaveBeenCalledWith('bookings')
  })

  it('ISOLATION: update() is invoked against driver_assignments only for a valid write', async () => {
    const { updateFn } = mockLookupThenUpdate(makeAssignmentRow())

    await callRoute(validToken, { progress: 'on_board' })

    expect(stubSupabaseFrom).toHaveBeenCalledWith('driver_assignments')
    expect(stubSupabaseFrom).not.toHaveBeenCalledWith('bookings')
    expect(updateFn).toHaveBeenCalledTimes(1)
  })

  it('calls checkRateLimit with the literal path key "/api/driver/trip/progress"', async () => {
    mockLookupThenUpdate(makeAssignmentRow())

    await callRoute(validToken, { progress: 'en_route' })

    expect(mockCheckRateLimit).toHaveBeenCalledWith('/api/driver/trip/progress', '127.0.0.1')
  })

  it('returns 429 when rate-limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, limit: 20 })

    const res = await callRoute(validToken, { progress: 'en_route' })
    expect(res.status).toBe(429)
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
  })

  it('rejects a malformed (non-UUID) token with 400 invalid_token before querying Supabase', async () => {
    const res = await callRoute('not-a-uuid', { progress: 'en_route' })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid_token')
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
  })

  // DTRIP-06 — optional driver note, independent of status marking
  it('writes trip_note (not trip_progress) for a note-only POST', async () => {
    const { updateFn } = mockLookupThenUpdate(makeAssignmentRow())

    const res = await callRoute(validToken, { note: 'Passenger running late' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('ok', true)

    expect(updateFn).toHaveBeenCalledTimes(1)
    const payload = updateFn.mock.calls[0][0]
    expect(payload).toMatchObject({ trip_note: 'Passenger running late' })
    expect(payload).not.toHaveProperty('trip_progress')
    expect(typeof payload.trip_progress_updated_at).toBe('string')
  })

  it('rejects a POST with neither progress nor note with 400 Invalid payload', async () => {
    mockLookupThenUpdate(makeAssignmentRow())

    const res = await callRoute(validToken, {})
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid payload')
  })

  it('ISOLATION: a note-only write never invokes Supabase from() with "bookings" for an update', async () => {
    const { updateFn } = mockLookupThenUpdate(makeAssignmentRow())

    await callRoute(validToken, { note: 'All good, on schedule' })

    expect(stubSupabaseFrom).toHaveBeenCalledWith('driver_assignments')
    expect(stubSupabaseFrom).not.toHaveBeenCalledWith('bookings')
    expect(updateFn).toHaveBeenCalledTimes(1)
  })
})
