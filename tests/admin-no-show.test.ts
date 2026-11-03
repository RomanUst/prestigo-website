import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 87 Plan 09 (D-16 a): the operator's response to a driver's no-show request. GET shows the
// request state, POST confirm moves on_location -> no_show through the status service, POST
// dismiss ("Client found") clears the request. Nothing else can set no_show.

const { mockGetAdminUser, mockFrom, mockRpc, mockAdvance, mockEnforce } = vi.hoisted(() => ({
  mockGetAdminUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockAdvance: vi.fn(),
  mockEnforce: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}))
vi.mock('@/lib/request-guards', () => ({ enforceMaxBody: mockEnforce }))
vi.mock('@/lib/booking-status-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/booking-status-service')>('@/lib/booking-status-service')
  return { ...actual, advanceBookingStatus: mockAdvance }
})

import { GET, POST } from '@/app/api/admin/bookings/[id]/no-show/route'

const bookingId = 'b0000001-0000-4000-8000-000000000001'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const adminId = 'admin-1'
const REQUESTED_AT = '2026-11-12T13:40:00.123Z'

const params = (id: string = bookingId) => ({ params: Promise.resolve({ id }) })

function chain(result: unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) c[m] = vi.fn(() => c)
  c.single = vi.fn(async () => result)
  return c
}

function post(body: unknown, raw = false) {
  return new Request(`http://localhost/api/admin/bookings/${bookingId}/no-show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}
function get() {
  return new Request(`http://localhost/api/admin/bookings/${bookingId}/no-show`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdminUser.mockResolvedValue({ user: { id: adminId }, error: null })
  mockEnforce.mockReturnValue(null)
})

describe('GET /api/admin/bookings/[id]/no-show', () => {
  function world(booking: unknown, driver: unknown = { data: { name: 'John Driver' }, error: null }) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bookings') return chain(booking)
      if (table === 'drivers') return chain(driver)
      throw new Error(`unexpected table ${table}`)
    })
  }

  it('401 and 403 without an admin', async () => {
    mockGetAdminUser.mockResolvedValue({ user: null, error: '401' })
    expect((await GET(get(), params())).status).toBe(401)
    mockGetAdminUser.mockResolvedValue({ user: null, error: '403' })
    expect((await GET(get(), params())).status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 for a non-uuid id, before any read', async () => {
    const res = await GET(get(), params('not-a-uuid'))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('404 for an unknown booking', async () => {
    world({ data: null, error: { message: 'no rows' } })
    expect((await GET(get(), params())).status).toBe(404)
  })

  it('200 with status, noShowRequestedAt and driverName', async () => {
    world({ data: { status: 'on_location', no_show_requested_at: REQUESTED_AT, driver_id: driverId }, error: null })
    const res = await GET(get(), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'on_location',
      noShowRequestedAt: REQUESTED_AT,
      driverName: 'John Driver',
    })
  })

  it('200 with null driverName when no driver is assigned', async () => {
    world({ data: { status: 'confirmed', no_show_requested_at: null, driver_id: null }, error: null })
    const res = await GET(get(), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'confirmed', noShowRequestedAt: null, driverName: null })
  })
})

describe('POST /api/admin/bookings/[id]/no-show: guards', () => {
  it('oversize body is 413 before auth', async () => {
    mockEnforce.mockReturnValue(new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413 }))
    const res = await POST(post({ action: 'confirm' }), params())
    expect(res.status).toBe(413)
    expect(mockGetAdminUser).not.toHaveBeenCalled()
  })

  it('enforces a 2 KB body cap', async () => {
    await POST(post({ action: 'dismiss' }), params())
    expect(mockEnforce).toHaveBeenCalledWith(expect.any(Request), 2_000)
  })

  it('401 and 403 without an admin, nothing written', async () => {
    mockGetAdminUser.mockResolvedValue({ user: null, error: '401' })
    expect((await POST(post({ action: 'confirm' }), params())).status).toBe(401)
    mockGetAdminUser.mockResolvedValue({ user: null, error: '403' })
    expect((await POST(post({ action: 'confirm' }), params())).status).toBe(403)
    expect(mockAdvance).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 for a non-uuid id', async () => {
    const res = await POST(post({ action: 'confirm' }), params('nope'))
    expect(res.status).toBe(400)
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('400 Invalid JSON', async () => {
    const res = await POST(post('{not json', true), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON' })
  })

  it.each([
    { action: 'nope' },
    { action: 'confirm', extra: 1 },
    { action: 'confirm', status: 'no_show' },
    { action: 'confirm', expected_status: 'arrived' },
    {},
    [],
  ])('400 Invalid payload for %j', async body => {
    const res = await POST(post(body), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid payload' })
    expect(mockAdvance).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('POST confirm', () => {
  it('moves on_location to no_show through the status service as admin_no_show', async () => {
    mockAdvance.mockResolvedValue({ ok: true, applied: true, previous: 'on_location', current: 'no_show', booking: {} })
    const res = await POST(post({ action: 'confirm', expected_status: 'on_location' }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, status: 'no_show' })
    expect(mockAdvance).toHaveBeenCalledTimes(1)
    expect(mockAdvance).toHaveBeenCalledWith({
      bookingId,
      to: 'no_show',
      expectedFrom: 'on_location',
      actor: { type: 'admin', id: adminId },
      source: 'admin_no_show',
      profile: 'full',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('works without expected_status', async () => {
    mockAdvance.mockResolvedValue({ ok: true, applied: true, previous: 'on_location', current: 'no_show', booking: {} })
    const res = await POST(post({ action: 'confirm' }), params())
    expect(res.status).toBe(200)
    expect(mockAdvance.mock.calls[0][0].expectedFrom).toBeUndefined()
  })

  it('409 status_conflict when the booking moved on', async () => {
    mockAdvance.mockResolvedValue({ ok: false, code: 'conflict', message: 'status_conflict', currentStatus: 'on_board' })
    const res = await POST(post({ action: 'confirm', expected_status: 'on_location' }), params())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'status_conflict', currentStatus: 'on_board' })
  })

  it('422 with the transition message on a completed booking', async () => {
    mockAdvance.mockResolvedValue({
      ok: false,
      code: 'invalid_transition',
      message: "Cannot transition from 'completed' to 'no_show'",
    })
    const res = await POST(post({ action: 'confirm' }), params())
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain("Cannot transition from 'completed' to 'no_show'")
  })

  it('404 and 500 pass through from the service', async () => {
    mockAdvance.mockResolvedValue({ ok: false, code: 'not_found', message: 'Booking not found' })
    expect((await POST(post({ action: 'confirm' }), params())).status).toBe(404)
    mockAdvance.mockResolvedValue({ ok: false, code: 'db_error', message: 'x' })
    expect((await POST(post({ action: 'confirm' }), params())).status).toBe(500)
  })
})

describe('POST dismiss', () => {
  it('clears an open request with actor admin', async () => {
    mockRpc.mockResolvedValue({
      data: { applied: true, no_show_requested_at: null, status: 'on_location' },
      error: null,
    })
    const res = await POST(post({ action: 'dismiss' }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, noShowRequestedAt: null })
    expect(mockRpc).toHaveBeenCalledWith('set_no_show_request', {
      p_booking_id: bookingId,
      p_action: 'clear',
      p_actor_type: 'admin',
      p_actor_id: adminId,
    })
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('is idempotent when no request is open', async () => {
    mockRpc.mockResolvedValue({
      data: { applied: false, no_show_requested_at: null, status: 'on_location' },
      error: null,
    })
    const res = await POST(post({ action: 'dismiss' }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, noShowRequestedAt: null })
  })

  it('500 when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await POST(post({ action: 'dismiss' }), params())
    expect(res.status).toBe(500)
  })
})
