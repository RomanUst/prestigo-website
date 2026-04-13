import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const {
  stubGetAdminUser,
  stubSupabaseFrom,
  stubLogEmail,
  stubSendDriverAssignmentEmail,
  stubSendDriverDeclineNotification,
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

  return {
    stubGetAdminUser,
    stubSupabaseFrom,
    stubLogEmail,
    stubSendDriverAssignmentEmail,
    stubSendDriverDeclineNotification,
    supabaseAuthStub,
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
      first_name: 'Alice',
      last_name: 'Smith',
      phone: '+420123456789',
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
      first_name: 'Alice',
      last_name: 'Smith',
      phone: '+420123456789',
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
      expect.objectContaining({ emailType: 'driver_assigned' })
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
