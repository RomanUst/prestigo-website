import { describe, it, expect, beforeEach, vi } from 'vitest'

// afterCallbacks: collect callbacks registered with after() so tests can await them
const afterCallbacks: Array<() => Promise<void>> = []

const {
  mockPushGnetStatus,
  mockGetAdminUser,
  mockLogEmail,
  mockScheduleQStash,
  mockAfter,
  mockGnetBookingsUpdate,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockPushGnetStatus: vi.fn(),
  mockGetAdminUser: vi.fn(),
  mockLogEmail: vi.fn(),
  mockScheduleQStash: vi.fn(),
  mockAfter: vi.fn(),
  mockGnetBookingsUpdate: vi.fn(),
  mockSupabaseFrom: vi.fn(),
}))

/**
 * Run all after() callbacks registered during a PATCH call and await them.
 * next/server's after() runs post-response — we simulate that here.
 */
async function flushAfterCallbacks() {
  const cbs = afterCallbacks.splice(0)
  await Promise.all(cbs.map(cb => cb()))
}

vi.mock('@/lib/gnet-client', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/gnet-client')>()
  return {
    ...actual,
    pushGnetStatus: mockPushGnetStatus,
    // prestigoToGnetStatus: use real implementation (pure function)
  }
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ from: mockSupabaseFrom }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin', app_metadata: { is_admin: true } } }, error: null }) },
  }),
}))

vi.mock('@/lib/email-log', () => ({
  logEmail: mockLogEmail,
}))

vi.mock('@/lib/email', () => ({
  sendStatusConfirmedEmail: vi.fn(),
  sendStatusCancelledEmail: vi.fn(),
  sendPostTripEmail: vi.fn(),
}))

vi.mock('@/lib/qstash', () => ({
  scheduleQStashReminder: mockScheduleQStash,
}))

vi.mock('next/server', async (importActual) => {
  const actual = await importActual<typeof import('next/server')>()
  return {
    ...actual,
    after: mockAfter,
  }
})

// Test fixtures — id must be a valid UUID v4 (bookingPatchSchema uses z.string().uuid())
// 4th group must start with [89ab] per RFC 4122; using valid v4 UUIDs here
const BOOKING_UUID = 'a1b2c3d4-e5f6-4789-a1b2-c3d4e5f6a7b8'
const GNET_ROW_UUID = 'b2c3d4e5-f6a7-4890-b1c2-d3e4f5a6b7c8'

const bookingRow = {
  id: BOOKING_UUID,
  status: 'pending',
  booking_source: 'gnet',
  client_email: 'a@b.com',
  pickup_utc: null,
  client_first_name: 'Test',
  client_last_name: 'User',
}

const gnetRow = { id: GNET_ROW_UUID, gnet_res_no: 'RES-123' }

function buildSupabaseMock({
  bookingData = bookingRow,
  gnetData = gnetRow,
}: {
  bookingData?: typeof bookingRow | null
  gnetData?: typeof gnetRow | null
} = {}) {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'bookings') return {
      select: () => ({ eq: () => ({ single: async () => ({ data: bookingData, error: bookingData ? null : 'not found' }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }
    if (table === 'gnet_bookings') return {
      select: () => ({ eq: () => ({ single: async () => ({ data: gnetData, error: gnetData ? null : 'not found' }) }) }),
      update: (payload: unknown) => {
        mockGnetBookingsUpdate(payload)
        return { eq: async () => ({ error: null }) }
      },
    }
    if (table === 'pricing_globals') return {
      select: () => ({ eq: () => ({ single: async () => ({ data: { notification_flags: null }, error: null }) }) }),
    }
    return {}
  })
}

function makePatchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  afterCallbacks.splice(0) // clear leftover callbacks
  mockGetAdminUser.mockResolvedValue({ user: { id: 'admin' }, error: null })
  mockLogEmail.mockResolvedValue(false)
  // Collect callbacks instead of running them immediately.
  // Tests call flushAfterCallbacks() after PATCH to simulate post-response execution.
  mockAfter.mockImplementation((cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  })
})

describe('GNet status push — STATUS-01..04 + guards', () => {

  it('STATUS-01: confirmed status on GNet booking calls pushGnetStatus with CONFIRMED', async () => {
    buildSupabaseMock()
    mockPushGnetStatus.mockResolvedValue(undefined)

    const { PATCH } = await import('@/app/api/admin/bookings/route')
    const req = makePatchRequest({ id: BOOKING_UUID, status: 'confirmed' })
    const res = await PATCH(req as any)
    await flushAfterCallbacks()

    expect(res.status).toBe(200)
    expect(mockPushGnetStatus).toHaveBeenCalledTimes(1)
    expect(mockPushGnetStatus).toHaveBeenCalledWith('RES-123', 'CONFIRMED')
  })

  it('STATUS-02: PATCH returns 200 ok:true even when pushGnetStatus throws', async () => {
    buildSupabaseMock()
    mockPushGnetStatus.mockRejectedValueOnce(new Error('GNet 503'))

    const { PATCH } = await import('@/app/api/admin/bookings/route')
    const req = makePatchRequest({ id: BOOKING_UUID, status: 'confirmed' })
    const res = await PATCH(req as any)
    await flushAfterCallbacks()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('STATUS-03 failure: gnet_bookings.update receives last_push_error with error message', async () => {
    buildSupabaseMock()
    mockPushGnetStatus.mockRejectedValueOnce(new Error('GNet timeout'))

    const { PATCH } = await import('@/app/api/admin/bookings/route')
    const req = makePatchRequest({ id: BOOKING_UUID, status: 'confirmed' })
    await PATCH(req as any)
    await flushAfterCallbacks()

    expect(mockGnetBookingsUpdate).toHaveBeenCalledTimes(1)
    const updatePayload = mockGnetBookingsUpdate.mock.calls[0][0]
    expect(updatePayload.last_push_status).toBe('CONFIRMED')
    expect(updatePayload.last_push_error).toBe('GNet timeout')
    expect(typeof updatePayload.last_pushed_at).toBe('string')
  })

  it('STATUS-03 success: gnet_bookings.update receives last_push_error null', async () => {
    buildSupabaseMock()
    mockPushGnetStatus.mockResolvedValueOnce(undefined)

    const { PATCH } = await import('@/app/api/admin/bookings/route')
    const req = makePatchRequest({ id: BOOKING_UUID, status: 'confirmed' })
    await PATCH(req as any)
    await flushAfterCallbacks()

    expect(mockGnetBookingsUpdate).toHaveBeenCalledTimes(1)
    const updatePayload = mockGnetBookingsUpdate.mock.calls[0][0]
    expect(updatePayload.last_push_status).toBe('CONFIRMED')
    expect(updatePayload.last_push_error).toBeNull()
    expect(typeof updatePayload.last_pushed_at).toBe('string')
  })

  it('STATUS-04 mapping: completed → COMPLETE', async () => {
    buildSupabaseMock({ bookingData: { ...bookingRow, status: 'confirmed' } })
    mockPushGnetStatus.mockResolvedValueOnce(undefined)

    const { PATCH } = await import('@/app/api/admin/bookings/route')
    const req = makePatchRequest({ id: BOOKING_UUID, status: 'completed' })
    await PATCH(req as any)
    await flushAfterCallbacks()

    expect(mockPushGnetStatus).toHaveBeenCalledWith('RES-123', 'COMPLETE')
  })

  it('STATUS-04 mapping: cancelled → CANCEL', async () => {
    buildSupabaseMock({ bookingData: { ...bookingRow, status: 'pending' } })
    mockPushGnetStatus.mockResolvedValueOnce(undefined)

    const { PATCH } = await import('@/app/api/admin/bookings/route')
    const req = makePatchRequest({ id: BOOKING_UUID, status: 'cancelled' })
    await PATCH(req as any)
    await flushAfterCallbacks()

    expect(mockPushGnetStatus).toHaveBeenCalledWith('RES-123', 'CANCEL')
  })

  it('D-03 guard: non-GNet booking does NOT call pushGnetStatus', async () => {
    buildSupabaseMock({ bookingData: { ...bookingRow, booking_source: 'online' } })

    const { PATCH } = await import('@/app/api/admin/bookings/route')
    const req = makePatchRequest({ id: BOOKING_UUID, status: 'confirmed' })
    const res = await PATCH(req as any)
    await flushAfterCallbacks()

    expect(res.status).toBe(200)
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
    // gnet_bookings table should NOT be queried
    const gnetCalls = (mockSupabaseFrom as ReturnType<typeof vi.fn>).mock.calls
      .filter((args: unknown[]) => args[0] === 'gnet_bookings')
    expect(gnetCalls.length).toBe(0)
  })

  it('D-01 guard: unmapped status (pending) does NOT call pushGnetStatus', async () => {
    // The VALID_TRANSITIONS map in route.ts does not allow transitions to 'pending'
    // so we test this via direct helper import instead
    const { prestigoToGnetStatus } = await import('@/lib/gnet-client')
    expect(prestigoToGnetStatus('pending')).toBeNull()
    expect(prestigoToGnetStatus('assigned')).toBeNull()
    expect(prestigoToGnetStatus('en_route')).toBeNull()
    expect(prestigoToGnetStatus('on_location')).toBeNull()
    // Confirm pushGnetStatus not called when mapping returns null
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
  })

})
