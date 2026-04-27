import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const {
  stubGetAdminUser,
  stubSupabaseFrom,
  stubLogEmail,
  stubSendDriverAssignmentEmail,
  stubSendDriverDeclineNotification,
  stubPushGnetStatus,
  stubPrestigoToGnetStatus,
  supabaseAuthStub,
} = vi.hoisted(() => {
  const supabaseAuthStub = {
    auth: {
      getUser: vi.fn(),
    },
  }

  const stubGetAdminUser = vi.fn()
  const stubSupabaseFrom = vi.fn()
  const stubLogEmail = vi.fn().mockResolvedValue(true)
  const stubSendDriverAssignmentEmail = vi.fn().mockResolvedValue(undefined)
  const stubSendDriverDeclineNotification = vi.fn().mockResolvedValue(undefined)
  const stubPushGnetStatus = vi.fn().mockResolvedValue(undefined)
  const stubPrestigoToGnetStatus = vi.fn().mockImplementation((status: string) => {
    const map: Record<string, string> = {
      confirmed: 'CONFIRMED',
      assigned: 'ASSIGNED',
      en_route: 'EN_ROUTE',
      on_location: 'ON_LOCATION',
      completed: 'COMPLETE',
      cancelled: 'CANCEL',
    }
    return map[status] ?? null
  })

  return {
    stubGetAdminUser,
    stubSupabaseFrom,
    stubLogEmail,
    stubSendDriverAssignmentEmail,
    stubSendDriverDeclineNotification,
    stubPushGnetStatus,
    stubPrestigoToGnetStatus,
    supabaseAuthStub,
  }
})

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } },
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
  getAdminUser: stubGetAdminUser,
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: stubSupabaseFrom })),
}))

vi.mock('@/lib/email-log', () => ({
  logEmail: stubLogEmail,
}))

vi.mock('@/lib/email', () => ({
  sendDriverAssignmentEmail: stubSendDriverAssignmentEmail,
  sendDriverDeclineNotification: stubSendDriverDeclineNotification,
}))

vi.mock('@/lib/gnet-client', () => ({
  pushGnetStatus: stubPushGnetStatus,
  prestigoToGnetStatus: stubPrestigoToGnetStatus,
}))

import { POST as assignPost } from '@/app/api/admin/bookings/[id]/assign/route'
import { GET as assignmentGet } from '@/app/api/admin/bookings/[id]/assignment/route'
import { POST as respondPost } from '@/app/api/driver/respond/route'

const bookingId = 'a0000001-0000-4000-8000-000000000001'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const assignmentToken = 'a0000003-0000-4000-8000-000000000003'

function makeAssignRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/bookings/${bookingId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeAssignmentGetRequest(): Request {
  return new Request(`http://localhost/api/admin/bookings/${bookingId}/assignment`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeRespondRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/driver/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default to admin user
  stubGetAdminUser.mockResolvedValue({ user: { id: '1', app_metadata: { is_admin: true } }, error: null })
  stubLogEmail.mockResolvedValue(true)
  stubSendDriverAssignmentEmail.mockResolvedValue(undefined)
  stubSendDriverDeclineNotification.mockResolvedValue(undefined)
  stubPushGnetStatus.mockResolvedValue(undefined)
  stubPrestigoToGnetStatus.mockImplementation((status: string) => {
    const map: Record<string, string> = {
      confirmed: 'CONFIRMED',
      assigned: 'ASSIGNED',
      en_route: 'EN_ROUTE',
      on_location: 'ON_LOCATION',
      completed: 'COMPLETE',
      cancelled: 'CANCEL',
    }
    return map[status] ?? null
  })
})

describe('DRIVER-02: POST /api/admin/bookings/[id]/assign', () => {
  it('Test 1: returns 401 without session', async () => {
    stubGetAdminUser.mockResolvedValue({ user: null, error: '401' })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin', async () => {
    stubGetAdminUser.mockResolvedValue({ user: null, error: '403' })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 201 with assignment object (status=pending)', async () => {
    const mockDriver = { id: driverId, name: 'John Driver', email: 'driver@example.com' }
    const mockBooking = {
      id: bookingId,
      booking_reference: 'PRG-001',
      pickup_date: '2026-05-01',
      pickup_time: '10:00',
      origin_address: 'Prague Airport',
      destination_address: 'Wenceslas Square',
      client_first_name: 'Alice',
      client_last_name: 'Smith',
      client_phone: '+420123456789',
      status: 'pending',
      booking_source: 'website',
    }
    const mockAssignment = { id: 'a1a2a3a4-0000-0000-0000-000000000001', driver_id: driverId, status: 'pending', token: assignmentToken }
    const mockNotificationFlags = { notification_flags: { driver_assigned: true } }

    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // drivers lookup
        const singleFn = vi.fn().mockResolvedValue({ data: mockDriver, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else if (callCount === 2) {
        // bookings lookup
        const singleFn = vi.fn().mockResolvedValue({ data: mockBooking, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else if (callCount === 3) {
        // insert assignment
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        const selectFn = vi.fn().mockReturnValue({ single: singleFn })
        const insertFn = vi.fn().mockReturnValue({ select: selectFn })
        return { insert: insertFn }
      } else {
        // notification_flags lookup
        const singleFn = vi.fn().mockResolvedValue({ data: mockNotificationFlags, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      }
    })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('assignment')
    expect(json.assignment.status).toBe('pending')
  })

  it('Test 4: returns 404 for unknown driver_id', async () => {
    // drivers lookup returns null
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    stubSupabaseFrom.mockReturnValue({ select: selectFn })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(404)
  })

  it('Test 5: calls logEmail and sendDriverAssignmentEmail', async () => {
    const mockDriver = { id: driverId, name: 'John Driver', email: 'driver@example.com' }
    const mockBooking = {
      id: bookingId,
      booking_reference: 'PRG-001',
      pickup_date: '2026-05-01',
      pickup_time: '10:00',
      origin_address: 'Prague Airport',
      destination_address: 'Wenceslas Square',
      client_first_name: 'Alice',
      client_last_name: 'Smith',
      client_phone: '+420123456789',
      status: 'pending',
      booking_source: 'website',
    }
    const mockAssignment = { id: 'a1a2a3a4-0000-0000-0000-000000000001', driver_id: driverId, status: 'pending', token: assignmentToken }
    const mockNotificationFlags = { notification_flags: { driver_assigned: true } }

    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockDriver, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else if (callCount === 2) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockBooking, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else if (callCount === 3) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        const selectFn = vi.fn().mockReturnValue({ single: singleFn })
        const insertFn = vi.fn().mockReturnValue({ select: selectFn })
        return { insert: insertFn }
      } else {
        const singleFn = vi.fn().mockResolvedValue({ data: mockNotificationFlags, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      }
    })

    await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })

    expect(stubLogEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: null,
        emailType: expect.stringMatching(/^driver_assigned:/),
        recipient: 'driver@example.com',
      })
    )
    // sendDriverAssignmentEmail is fire-and-forget, give it a tick to run
    await new Promise((r) => setTimeout(r, 10))
    expect(stubSendDriverAssignmentEmail).toHaveBeenCalledTimes(1)
  })
})

describe('DRIVER-02/05: GET /api/admin/bookings/[id]/assignment', () => {
  it('Test 6: returns 401 without session', async () => {
    stubGetAdminUser.mockResolvedValue({ user: null, error: '401' })

    const res = await assignmentGet(makeAssignmentGetRequest(), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(401)
  })

  it('Test 7: returns 200 with latest assignment (driver name joined)', async () => {
    const mockAssignment = {
      id: 'a1a2a3a4-0000-0000-0000-000000000001',
      driver_id: driverId,
      status: 'pending',
      created_at: '2026-05-01T10:00:00Z',
      drivers: { name: 'John Driver', email: 'driver@example.com' },
    }

    const maybeSingleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
    const limitFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const orderFn = vi.fn().mockReturnValue({ limit: limitFn })
    const eqFn = vi.fn().mockReturnValue({ order: orderFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    stubSupabaseFrom.mockReturnValue({ select: selectFn })

    const res = await assignmentGet(makeAssignmentGetRequest(), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('assignment')
    expect(json.assignment.drivers.name).toBe('John Driver')
  })

  it('Test 8: returns 200 with null when no assignment exists', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const limitFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const orderFn = vi.fn().mockReturnValue({ limit: limitFn })
    const eqFn = vi.fn().mockReturnValue({ order: orderFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    stubSupabaseFrom.mockReturnValue({ select: selectFn })

    const res = await assignmentGet(makeAssignmentGetRequest(), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('assignment')
    expect(json.assignment).toBeNull()
  })
})

describe('DRIVER-04: POST /api/driver/respond', () => {
  it('Test 9: returns 200 with ok:true for valid token + action=accepted', async () => {
    const mockAssignment = {
      id: 'a1a2a3a4-0000-0000-0000-000000000001',
      booking_id: bookingId,
      driver_id: driverId,
      status: 'pending',
      token_used_at: null,
      token_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    }

    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // token lookup
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else {
        // update assignment
        const singleFn = vi.fn().mockResolvedValue({ data: { ...mockAssignment, status: 'accepted', token_used_at: new Date().toISOString() }, error: null })
        const gtFn = vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) }) })
        const eqFn = vi.fn().mockReturnValue({ gt: gtFn })
        const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { update: updateFn }
      }
    })

    const res = await respondPost(makeRespondRequest({ token: assignmentToken, action: 'accepted' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('ok', true)
  })

  it('Test 10: returns 200 with ok:true for valid token + action=declined', async () => {
    const mockAssignment = {
      id: 'a1a2a3a4-0000-0000-0000-000000000001',
      booking_id: bookingId,
      driver_id: driverId,
      status: 'pending',
      token_used_at: null,
      token_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    }

    // Need drivers + bookings for decline notification
    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // token lookup
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else if (callCount === 2) {
        // update assignment
        const singleFn = vi.fn().mockResolvedValue({ data: { ...mockAssignment, status: 'declined', token_used_at: new Date().toISOString() }, error: null })
        const isFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
        const gtFn = vi.fn().mockReturnValue({ is: isFn })
        const eqFn = vi.fn().mockReturnValue({ gt: gtFn })
        const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { update: updateFn }
      } else if (callCount === 3) {
        // driver lookup
        const singleFn = vi.fn().mockResolvedValue({ data: { name: 'John Driver' }, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else {
        // booking lookup
        const singleFn = vi.fn().mockResolvedValue({ data: {
          booking_reference: 'PRG-001',
          pickup_date: '2026-05-01',
          pickup_time: '10:00',
          origin_address: 'Prague Airport',
          destination_address: 'Wenceslas Square',
        }, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      }
    })

    const res = await respondPost(makeRespondRequest({ token: assignmentToken, action: 'declined' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('ok', true)
  })

  it('Test 11: returns 400 with error=expired for expired token', async () => {
    const mockAssignment = {
      id: 'a1a2a3a4-0000-0000-0000-000000000001',
      booking_id: bookingId,
      driver_id: driverId,
      status: 'pending',
      token_used_at: null,
      token_expires_at: new Date(Date.now() - 1000).toISOString(), // expired
    }

    const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    stubSupabaseFrom.mockReturnValue({ select: selectFn })

    const res = await respondPost(makeRespondRequest({ token: assignmentToken, action: 'accepted' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('expired')
  })

  it('Test 12: returns 400 with error=used for already-used token', async () => {
    const mockAssignment = {
      id: 'a1a2a3a4-0000-0000-0000-000000000001',
      booking_id: bookingId,
      driver_id: driverId,
      status: 'accepted',
      token_used_at: '2026-04-01T10:00:00Z', // already used
      token_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    }

    const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    stubSupabaseFrom.mockReturnValue({ select: selectFn })

    const res = await respondPost(makeRespondRequest({ token: assignmentToken, action: 'accepted' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('used')
  })

  it('Test 13: returns 400 with error=not_found for unknown token', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    stubSupabaseFrom.mockReturnValue({ select: selectFn })

    const res = await respondPost(makeRespondRequest({ token: assignmentToken, action: 'accepted' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('not_found')
  })

  it('Test 14: calls sendDriverDeclineNotification when action=declined', async () => {
    const mockAssignment = {
      id: 'a1a2a3a4-0000-0000-0000-000000000001',
      booking_id: bookingId,
      driver_id: driverId,
      status: 'pending',
      token_used_at: null,
      token_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    }

    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else if (callCount === 2) {
        const singleFn = vi.fn().mockResolvedValue({ data: { ...mockAssignment, status: 'declined', token_used_at: new Date().toISOString() }, error: null })
        const isFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
        const gtFn = vi.fn().mockReturnValue({ is: isFn })
        const eqFn = vi.fn().mockReturnValue({ gt: gtFn })
        const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { update: updateFn }
      } else if (callCount === 3) {
        const singleFn = vi.fn().mockResolvedValue({ data: { name: 'John Driver' }, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      } else {
        const singleFn = vi.fn().mockResolvedValue({ data: {
          booking_reference: 'PRG-001',
          pickup_date: '2026-05-01',
          pickup_time: '10:00',
          origin_address: 'Prague Airport',
          destination_address: 'Wenceslas Square',
        }, error: null })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
        return { select: selectFn }
      }
    })

    await respondPost(makeRespondRequest({ token: assignmentToken, action: 'declined' }))

    await new Promise((r) => setTimeout(r, 10))
    expect(stubSendDriverDeclineNotification).toHaveBeenCalledTimes(1)
  })
})

// New call order after 5b-bis restructure:
// 1: drivers select (5a)
// 2: bookings select for email (5b)
// 3: insert assignment (5c)
// 4: bookings select for status (5b-bis) — non-blocking, error → log + skip update
// 5: bookings update (5c-bis) — only if status fetch succeeded and transition allowed
// 6+: notification_flags select (5d) + async after() gnet calls

// Helper for assign tests
function makeFullAssignMock(
  bookingOverrides: Record<string, unknown>,
  opts: { includeBookingsUpdate?: boolean } = {}
) {
  const mockDriver = { id: driverId, name: 'John Driver', email: 'driver@example.com' }
  const mockBooking = {
    id: bookingId,
    booking_reference: 'PRG-001',
    pickup_date: '2026-05-01',
    pickup_time: '10:00',
    origin_address: 'Prague Airport',
    destination_address: 'Wenceslas Square',
    client_first_name: 'Alice',
    client_last_name: 'Smith',
    client_phone: '+420123456789',
    status: 'confirmed',
    booking_source: 'website',
    ...bookingOverrides,
  }
  const mockAssignment = { id: 'a1a2a3a4-0000-0000-0000-000000000001', driver_id: driverId, status: 'pending', token: assignmentToken }
  const mockNotificationFlags = { notification_flags: { driver_assigned: false } }
  const bookingStatus = { status: mockBooking.status, booking_source: mockBooking.booking_source }

  let callCount = 0
  stubSupabaseFrom.mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      // drivers lookup (5a)
      const singleFn = vi.fn().mockResolvedValue({ data: mockDriver, error: null })
      const eqFn = vi.fn().mockReturnValue({ single: singleFn })
      const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
      return { select: selectFn }
    } else if (callCount === 2) {
      // bookings lookup for email (5b)
      const singleFn = vi.fn().mockResolvedValue({ data: mockBooking, error: null })
      const eqFn = vi.fn().mockReturnValue({ single: singleFn })
      const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
      return { select: selectFn }
    } else if (callCount === 3) {
      // insert assignment (5c)
      const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
      const selectFn = vi.fn().mockReturnValue({ single: singleFn })
      const insertFn = vi.fn().mockReturnValue({ select: selectFn })
      return { insert: insertFn }
    } else if (callCount === 4) {
      // bookings status fetch (5b-bis)
      const singleFn = vi.fn().mockResolvedValue({ data: bookingStatus, error: null })
      const eqFn = vi.fn().mockReturnValue({ single: singleFn })
      const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
      return { select: selectFn }
    } else if (opts.includeBookingsUpdate && callCount === 5) {
      // bookings update (5c-bis)
      const eqFn = vi.fn().mockResolvedValue({ data: null, error: null })
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
      return { update: updateFn }
    } else {
      // notification_flags lookup (5d)
      const singleFn = vi.fn().mockResolvedValue({ data: mockNotificationFlags, error: null })
      const eqFn = vi.fn().mockReturnValue({ single: singleFn })
      const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
      return { select: selectFn }
    }
  })

  return { mockDriver, mockBooking, mockAssignment }
}

describe('DRIVER-ASSIGN-02: bookings.driver_id + status transition (D-04, D-05, D-07)', () => {
  // Call order (new 5b-bis arch):
  // 1=drivers(5a) 2=bookings-email(5b) 3=insert(5c) 4=bookings-status(5b-bis) 5=bookings-update(5c-bis) 6+=nf/gnet

  it('Test A: confirmed → assigned transition updates bookings with driver_id + status', async () => {
    let updateArgs: unknown[] = []
    const mockDriver = { id: driverId, name: 'John Driver', email: 'driver@example.com' }
    const mockBooking = {
      id: bookingId, booking_reference: 'PRG-001', pickup_date: '2026-05-01', pickup_time: '10:00',
      origin_address: 'Prague Airport', destination_address: 'Wenceslas Square',
      client_first_name: 'Alice', client_last_name: 'Smith', client_phone: '+420123456789',
      status: 'confirmed', booking_source: 'website',
    }
    const mockAssignment = { id: 'a1a2a3a4-0000-0000-0000-000000000001', driver_id: driverId, status: 'pending', token: assignmentToken }
    const mockNotificationFlags = { notification_flags: { driver_assigned: false } }

    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockDriver, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 2) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockBooking, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 3) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 4) {
        // 5b-bis: bookings status fetch
        const singleFn = vi.fn().mockResolvedValue({ data: { status: 'confirmed', booking_source: 'website' }, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 5) {
        // 5c-bis: bookings update — capture args
        const eqFn = vi.fn().mockResolvedValue({ data: null, error: null })
        const updateFn = vi.fn().mockImplementation((args) => { updateArgs = [args]; return { eq: eqFn } })
        return { update: updateFn }
      } else {
        const singleFn = vi.fn().mockResolvedValue({ data: mockNotificationFlags, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      }
    })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(201)
    expect(updateArgs[0]).toMatchObject({ driver_id: driverId, status: 'assigned' })
    expect(stubPushGnetStatus).not.toHaveBeenCalled()
    const json = await res.json()
    expect(json.booking_status).toBe('assigned')
  })

  it('Test B: reassign (D-07) — updates only driver_id, status untouched', async () => {
    let updateArgs: unknown[] = []
    const mockDriver = { id: driverId, name: 'John Driver', email: 'driver@example.com' }
    const mockBooking = {
      id: bookingId, booking_reference: 'PRG-001', pickup_date: '2026-05-01', pickup_time: '10:00',
      origin_address: 'Prague Airport', destination_address: 'Wenceslas Square',
      client_first_name: 'Alice', client_last_name: 'Smith', client_phone: '+420123456789',
      status: 'assigned', booking_source: 'website', driver_id: 'a0000009-0000-4000-8000-000000000099',
    }
    const mockAssignment = { id: 'a1a2a3a4-0000-0000-0000-000000000001', driver_id: driverId, status: 'pending', token: assignmentToken }
    const mockNotificationFlags = { notification_flags: { driver_assigned: false } }

    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockDriver, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 2) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockBooking, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 3) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 4) {
        // 5b-bis: status fetch — returns 'assigned'
        const singleFn = vi.fn().mockResolvedValue({ data: { status: 'assigned', booking_source: 'website' }, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 5) {
        // 5c-bis: bookings update for reassign — capture args
        const eqFn = vi.fn().mockResolvedValue({ data: null, error: null })
        const updateFn = vi.fn().mockImplementation((args) => { updateArgs = [args]; return { eq: eqFn } })
        return { update: updateFn }
      } else {
        const singleFn = vi.fn().mockResolvedValue({ data: mockNotificationFlags, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      }
    })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(201)
    expect(updateArgs[0]).toMatchObject({ driver_id: driverId })
    expect((updateArgs[0] as Record<string, unknown>).status).toBeUndefined()
    expect(stubPushGnetStatus).not.toHaveBeenCalled()
  })

  it('Test C: GNet first-assign push (D-05) — fires pushGnetStatus for gnet booking on first assign', async () => {
    const mockDriver = { id: driverId, name: 'John Driver', email: 'driver@example.com' }
    const mockBooking = {
      id: bookingId, booking_reference: 'PRG-001', pickup_date: '2026-05-01', pickup_time: '10:00',
      origin_address: 'Prague Airport', destination_address: 'Wenceslas Square',
      client_first_name: 'Alice', client_last_name: 'Smith', client_phone: '+420123456789',
      status: 'confirmed', booking_source: 'gnet',
    }
    const mockAssignment = { id: 'a1a2a3a4-0000-0000-0000-000000000001', driver_id: driverId, status: 'pending', token: assignmentToken }
    const mockNotificationFlags = { notification_flags: { driver_assigned: false } }
    const mockGnetRow = { id: 'g0000001-0000-4000-8000-000000000001', gnet_res_no: 'GR-123' }

    const mockGnetSingleFn = vi.fn().mockResolvedValue({ data: mockGnetRow, error: null })
    const mockNfSingleFn = vi.fn().mockResolvedValue({ data: mockNotificationFlags, error: null })
    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockDriver, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 2) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockBooking, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 3) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 4) {
        // 5b-bis: status fetch — 'confirmed' + 'gnet'
        const singleFn = vi.fn().mockResolvedValue({ data: { status: 'confirmed', booking_source: 'gnet' }, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 5) {
        // 5c-bis: bookings update
        const eqFn = vi.fn().mockResolvedValue({ data: null, error: null })
        return { update: vi.fn().mockReturnValue({ eq: eqFn }) }
      } else if (callCount === 6) {
        // after() starts sync execution: gnet_bookings.from().select() called before first await
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: mockGnetSingleFn }) }) }
      } else if (callCount === 7) {
        // notification_flags select (5d, main handler continues after after() suspends at first await)
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: mockNfSingleFn }) }) }
      } else {
        // callCount=8+: gnet_bookings update (after() continuation after pushGnetStatus resolves)
        const eqFnUpdate = vi.fn().mockResolvedValue({ data: null, error: null })
        return { update: vi.fn().mockReturnValue({ eq: eqFnUpdate }) }
      }
    })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(201)
    // after() mock runs synchronously in test env — wait a tick
    await new Promise((r) => setTimeout(r, 10))
    // GNet push MUST be called with gnet_res_no and 'ASSIGNED'
    expect(stubPushGnetStatus).toHaveBeenCalledWith('GR-123', 'ASSIGNED')
  })

  it('Test D: GNet reassign no push (D-07) — pushGnetStatus NOT called on reassign', async () => {
    // booking status: 'assigned', booking_source: 'gnet' → reassign, no GNet push
    // makeFullAssignMock handles the 5b-bis status fetch now
    makeFullAssignMock({ status: 'assigned', booking_source: 'gnet' }, { includeBookingsUpdate: true })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(201)
    await new Promise((r) => setTimeout(r, 10))
    expect(stubPushGnetStatus).not.toHaveBeenCalled()
  })

  it('Test E: disallowed transition — pending booking, assignment insert succeeds, status untouched', async () => {
    // booking status: 'pending' → pending → assigned NOT in VALID_TRANSITIONS
    // driver_assignments insert still runs; bookings.status stays 'pending'
    let updateCallCount = 0
    const mockDriver = { id: driverId, name: 'John Driver', email: 'driver@example.com' }
    const mockBooking = {
      id: bookingId, booking_reference: 'PRG-001', pickup_date: '2026-05-01', pickup_time: '10:00',
      origin_address: 'Prague Airport', destination_address: 'Wenceslas Square',
      client_first_name: 'Alice', client_last_name: 'Smith', client_phone: '+420123456789',
      status: 'pending', booking_source: 'website',
    }
    const mockAssignment = { id: 'a1a2a3a4-0000-0000-0000-000000000001', driver_id: driverId, status: 'pending', token: assignmentToken }
    const mockNotificationFlags = { notification_flags: { driver_assigned: false } }

    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockDriver, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 2) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockBooking, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 3) {
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 4) {
        // 5b-bis: status fetch — returns 'pending' → no transition allowed
        const singleFn = vi.fn().mockResolvedValue({ data: { status: 'pending', booking_source: 'website' }, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else {
        // notification_flags — no update should occur
        const eqFn = vi.fn().mockResolvedValue({ data: null, error: null })
        const updateFn = vi.fn().mockImplementation(() => { updateCallCount++; return { eq: eqFn } })
        const singleFn = vi.fn().mockResolvedValue({ data: mockNotificationFlags, error: null })
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }),
          update: updateFn,
        }
      }
    })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    expect(res.status).toBe(201)
    expect(updateCallCount).toBe(0)
    const json = await res.json()
    expect(json.booking_status).toBe('pending')
  })

  it('Test F: booking status fetch error — endpoint logs error and still returns 201 with assignment', async () => {
    // 5b (email booking fetch) SUCCEEDS; 5b-bis (status fetch) FAILS with DB error.
    // Assignment insert (5c) already completed before 5b-bis → endpoint logs and returns 201.
    const mockDriver = { id: driverId, name: 'John Driver', email: 'driver@example.com' }
    const mockBooking = {
      id: bookingId, booking_reference: 'PRG-001', pickup_date: '2026-05-01', pickup_time: '10:00',
      origin_address: 'Prague Airport', destination_address: 'Wenceslas Square',
      client_first_name: 'Alice', client_last_name: 'Smith', client_phone: '+420123456789',
      status: 'confirmed', booking_source: 'website',
    }
    const mockAssignment = { id: 'a1a2a3a4-0000-0000-0000-000000000001', driver_id: driverId, status: 'pending', token: assignmentToken }
    const mockNotificationFlags = { notification_flags: { driver_assigned: false } }

    let callCount = 0
    stubSupabaseFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // 5a: drivers lookup — succeeds
        const singleFn = vi.fn().mockResolvedValue({ data: mockDriver, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 2) {
        // 5b: bookings email fetch — succeeds
        const singleFn = vi.fn().mockResolvedValue({ data: mockBooking, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 3) {
        // 5c: insert assignment — succeeds
        const singleFn = vi.fn().mockResolvedValue({ data: mockAssignment, error: null })
        return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else if (callCount === 4) {
        // 5b-bis: status fetch — FAILS with error
        const singleFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB connection error' } })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      } else {
        // 5d: notification_flags
        const singleFn = vi.fn().mockResolvedValue({ data: mockNotificationFlags, error: null })
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }) }
      }
    })

    const res = await assignPost(makeAssignRequest({ driver_id: driverId }), {
      params: Promise.resolve({ id: bookingId }),
    })
    // Must return 201 — assignment inserted; status fetch failure is non-blocking
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('assignment')
  })
})
