import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Phase 67 DTRIP-03/04/08, rewritten in Phase 87 plan 08 (D-07): the driver route is a thin,
// token-gated wrapper. The old DTRIP-04 invariant ("this route touches only driver_assignments")
// became: the route never queries the bookings table; a status change goes through
// lib/driver-trip-step.ts -> the status service. The three ISOLATION tests are rewritten to that
// invariant, not deleted. CSRF prefix, rate limit and uniform invalid_token stay asserted here.

const REPO_ROOT = path.resolve(__dirname, '..')
const ROUTE_FILE = 'app/api/driver/trip/[token]/progress/route.ts'
const STEP_FILE = 'lib/driver-trip-step.ts'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports).
const { stubSupabaseFrom, mockCheckRateLimit, mockGetClientIp, mockAdvance, mockPush, mockGetStartGate } = vi.hoisted(() => ({
  stubSupabaseFrom: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(() => '127.0.0.1'),
  mockAdvance: vi.fn(),
  mockPush: vi.fn(),
  mockGetStartGate: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { void fn } }
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: stubSupabaseFrom })),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: mockGetClientIp,
}))

vi.mock('@/lib/booking-status-service', () => ({ advanceBookingStatus: mockAdvance }))
vi.mock('@/lib/gnet-push', () => ({ pushGnetForTransition: mockPush }))
vi.mock('@/lib/start-gate', () => ({ getStartGate: mockGetStartGate }))

import { POST } from '@/app/api/driver/trip/[token]/progress/route'

const validToken = 'a0000004-0000-4000-8000-000000000004'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const otherDriverId = 'a0000009-0000-4000-8000-000000000009'

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

function makeAssignmentRow(overrides: {
  assignmentDriverId?: string
  assignmentStatus?: string | null
  bookingDriverId?: string | null
  bookingStatus?: string
} = {}) {
  return {
    id: 'assign-1',
    driver_id: overrides.assignmentDriverId ?? driverId,
    status: overrides.assignmentStatus === undefined ? 'accepted' : overrides.assignmentStatus,
    bookings: {
      id: 'b0000001-0000-4000-8000-000000000001',
      status: overrides.bookingStatus ?? 'assigned',
      driver_id: overrides.bookingDriverId === undefined ? driverId : overrides.bookingDriverId,
      booking_source: 'online',
      amount_eur: 120,
      pickup_utc: '2026-11-12T13:30:00Z',
      pickup_date: '2026-11-12',
      pickup_time: '14:30',
      origin_lat: 50.087,
      origin_lng: 14.421,
      origin_address: 'Old Town Square',
      completed_at: null,
      no_show_requested_at: null,
    },
  }
}

/** Table-keyed stub: driver_assignments serves the lookup (select...single) and the update(...).eq. */
function mockAssignments(lookupData: unknown, lookupError: unknown = null) {
  const updateEqFn = vi.fn().mockResolvedValue({ data: null, error: null })
  const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })
  stubSupabaseFrom.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: lookupData, error: lookupError }) }),
    }),
    update: updateFn,
  }))
  return { updateFn, updateEqFn }
}

function advanceOk(to: string, previous: string) {
  return { ok: true, applied: true, previous, current: to, booking: { id: 'b1', status: to } }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, limit: 20 })
  mockGetClientIp.mockReturnValue('127.0.0.1')
  mockGetStartGate.mockResolvedValue({ unlocksAtMs: 0, open: true })
})

describe('POST /api/driver/trip/[token]/progress (DTRIP-03/04/08, D-07)', () => {
  it('a valid step writes through the status service and the trip_progress mirror', async () => {
    const { updateFn } = mockAssignments(makeAssignmentRow())
    mockAdvance.mockResolvedValue(advanceOk('en_route', 'assigned'))

    const res = await callRoute(validToken, { step: 'en_route' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, status: 'en_route', nextStep: 'on_site' })

    expect(mockAdvance).toHaveBeenCalledTimes(1)
    expect(updateFn).toHaveBeenCalledTimes(1)
    const payload = updateFn.mock.calls[0][0]
    expect(payload).toMatchObject({ trip_progress: 'en_route' })
    expect(typeof payload.trip_progress_updated_at).toBe('string')
  })

  it('rejects an unknown token with uniform 400 invalid_token', async () => {
    mockAssignments(null, { message: 'Not found' })

    const res = await callRoute(validToken, { step: 'en_route' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('rejects a reassigned driver (assignment.driver_id !== booking.driver_id) with uniform 400 invalid_token', async () => {
    mockAssignments(makeAssignmentRow({ assignmentDriverId: driverId, bookingDriverId: otherDriverId }))

    const res = await callRoute(validToken, { step: 'en_route' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('rejects a declined assignment with uniform 400 invalid_token', async () => {
    mockAssignments(makeAssignmentRow({ assignmentStatus: 'declined' }))

    const res = await callRoute(validToken, { step: 'en_route' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it.each(['completed', 'cancelled', 'no_show'])(
    'rejects a step on a terminal booking (%s) with uniform 400 invalid_token',
    async (bookingStatus) => {
      mockAssignments(makeAssignmentRow({ bookingStatus }))

      const res = await callRoute(validToken, { step: 'en_route' })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_token' })
      expect(mockAdvance).not.toHaveBeenCalled()
    },
  )

  it('rejects a malformed (non-UUID) token with 400 invalid_token before querying Supabase', async () => {
    const res = await callRoute('not-a-uuid', { step: 'en_route' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
  })

  it('rejects an unparseable body with 400 Invalid JSON before querying Supabase', async () => {
    const req = new Request(`http://localhost/api/driver/trip/${validToken}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })
    const res = await POST(req, { params: Promise.resolve({ token: validToken }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON' })
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
  })
})

describe('strict request schema (D-06, DRV-03, T-87-24)', () => {
  it.each([
    { step: 'en_route', amount: 10 },
    { step: 'completed', price: 99 },
    { status: 'completed' },
    { step: 'no_show' },
    { step: 'arrived' },
    { step: 'cancelled' },
    { progress: 'en_route' },
    { step: 'en_route', note: 'x' },
    { note: 'x', amount: 1 },
    {},
  ])('rejects %j with 400 Invalid payload, before any Supabase call or status write', async (body) => {
    const res = await callRoute(validToken, body)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid payload' })
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
    expect(mockAdvance).not.toHaveBeenCalled()
  })
})

describe('ISOLATION (D-07): the route and its step module never query bookings; status goes through the service', () => {
  it('ISOLATION: a step on a terminal booking never reaches the status service and never queries "bookings"', async () => {
    mockAssignments(makeAssignmentRow({ bookingStatus: 'completed' }))

    await callRoute(validToken, { step: 'en_route' })

    expect(mockAdvance).not.toHaveBeenCalled()
    expect(stubSupabaseFrom).toHaveBeenCalledWith('driver_assignments')
    expect(stubSupabaseFrom).not.toHaveBeenCalledWith('bookings')
  })

  it('ISOLATION: a valid step invokes advanceBookingStatus once and the route supabase is never called with "bookings"', async () => {
    const { updateFn } = mockAssignments(makeAssignmentRow({ bookingStatus: 'on_location' }))
    mockAdvance.mockResolvedValue(advanceOk('on_board', 'on_location'))

    await callRoute(validToken, { step: 'on_board' })

    expect(mockAdvance).toHaveBeenCalledTimes(1)
    expect(mockAdvance).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'on_board', expectedFrom: 'on_location', source: 'driver_trip', actor: { type: 'driver', id: driverId } }),
    )
    expect(stubSupabaseFrom).toHaveBeenCalledWith('driver_assignments')
    expect(stubSupabaseFrom).not.toHaveBeenCalledWith('bookings')
    expect(updateFn).toHaveBeenCalledTimes(1)
  })

  it('ISOLATION: a note-only write never calls advanceBookingStatus and never queries "bookings"', async () => {
    const { updateFn } = mockAssignments(makeAssignmentRow())

    await callRoute(validToken, { note: 'All good, on schedule' })

    expect(mockAdvance).not.toHaveBeenCalled()
    expect(stubSupabaseFrom).toHaveBeenCalledWith('driver_assignments')
    expect(stubSupabaseFrom).not.toHaveBeenCalledWith('bookings')
    expect(updateFn).toHaveBeenCalledTimes(1)
  })

  describe('source gate', () => {
    const routeSrc = fs.readFileSync(path.join(REPO_ROOT, ROUTE_FILE), 'utf8')
    const stepSrc = fs.readFileSync(path.join(REPO_ROOT, STEP_FILE), 'utf8')
    const bookingsFrom = /\.from\(\s*['"`]bookings['"`]\s*\)/

    it('the route imports the step module', () => {
      expect(routeSrc).toMatch(/from\s+['"]@\/lib\/driver-trip-step['"]/)
    })

    it('the route imports no GNet client and no Chatwoot or EspoCRM module', () => {
      expect(routeSrc).not.toMatch(/from\s+['"][^'"]*(gnet-client|chatwoot|espocrm)[^'"]*['"]/i)
    })

    it('the route has no direct bookings table query and no update of its own', () => {
      expect(routeSrc).not.toMatch(bookingsFrom)
      expect(routeSrc).not.toMatch(/\.update\(/)
    })

    it('the step module writes status only through the status service and has no bookings query', () => {
      expect(stepSrc).toMatch(/from\s+['"]@\/lib\/booking-status-service['"]/)
      expect(stepSrc).toMatch(/advanceBookingStatus\(/)
      expect(stepSrc).not.toMatch(bookingsFrom)
    })

    it('the step module imports no GNet client and no Chatwoot or EspoCRM module (infra isolation guard)', () => {
      expect(stepSrc).not.toMatch(/from\s+['"][^'"]*(gnet-client|chatwoot|espocrm)[^'"]*['"]/i)
    })
  })
})

describe('CSRF prefix and rate limit (D-07, T-87-26)', () => {
  it('middleware.ts CSRF_PROTECTED_PREFIXES contains /api/driver/trip', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'middleware.ts'), 'utf8')
    const block = /CSRF_PROTECTED_PREFIXES\s*=\s*\[([\s\S]*?)\]/.exec(src)
    expect(block).not.toBeNull()
    expect(block![1]).toMatch(/['"]\/api\/driver\/trip['"]/)
  })

  it("lib/rate-limit.ts LIMITS contains '/api/driver/trip/progress': 20", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'lib/rate-limit.ts'), 'utf8')
    expect(src).toMatch(/['"]\/api\/driver\/trip\/progress['"]\s*:\s*20\b/)
  })

  it('calls checkRateLimit with the literal path key "/api/driver/trip/progress"', async () => {
    mockAssignments(makeAssignmentRow())

    await callRoute(validToken, { step: 'on_board' })

    expect(mockCheckRateLimit).toHaveBeenCalledWith('/api/driver/trip/progress', '127.0.0.1')
  })

  it('returns 429 when rate-limited, before any Supabase call', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, limit: 20 })

    const res = await callRoute(validToken, { step: 'en_route' })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too many requests' })
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
    expect(mockAdvance).not.toHaveBeenCalled()
  })
})

describe('driver note (DTRIP-06, D-21)', () => {
  it('writes trip_note + trip_progress_updated_at (not trip_progress) for a note-only POST on an active link', async () => {
    const { updateFn } = mockAssignments(makeAssignmentRow())

    const res = await callRoute(validToken, { note: 'Passenger running late' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(updateFn).toHaveBeenCalledTimes(1)
    const payload = updateFn.mock.calls[0][0]
    expect(payload).toMatchObject({ trip_note: 'Passenger running late' })
    expect(payload).not.toHaveProperty('trip_progress')
    expect(typeof payload.trip_progress_updated_at).toBe('string')
  })

  it('a note on a completed link is the uniform 400 invalid_token and writes nothing', async () => {
    const { updateFn } = mockAssignments(makeAssignmentRow({ bookingStatus: 'completed' }))

    const res = await callRoute(validToken, { note: 'thanks' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('a note over 2000 characters is rejected with 400 Invalid payload', async () => {
    const res = await callRoute(validToken, { note: 'x'.repeat(2001) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid payload' })
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
  })
})
