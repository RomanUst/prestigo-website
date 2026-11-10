// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getAdminUserMock, rpcMock } = vi.hoisted(() => ({
  getAdminUserMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: getAdminUserMock,
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ rpc: rpcMock })),
}))

import { GET } from '@/app/api/admin/bookings/dispatch/route'

function req(qs: string) {
  return new Request(`http://localhost/api/admin/bookings/dispatch?${qs}`)
}

function page(rows: unknown[], total: number) {
  return { data: [{ rows, total_count: total }], error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
})

describe('GET /api/admin/bookings/dispatch - tracer', () => {
  it('reads one Prague date range through admin_search_bookings (pickup_asc, 100 rows)', async () => {
    const rows = [{ id: 'b1' }, { id: 'b2' }]
    rpcMock.mockResolvedValueOnce(page(rows, 2))

    const res = await GET(req('startDate=2027-10-31&endDate=2027-10-31'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(await res.json()).toEqual({ bookings: rows, truncated: false })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('admin_search_bookings', {
      p_query: null,
      p_start_date: '2027-10-31',
      p_end_date: '2027-10-31',
      p_trip_type: null,
      p_status: null,
      p_sort: 'pickup_asc',
      p_offset: 0,
      p_limit: 100,
    })
  })

  it('answers 401 for an unauthenticated request and never calls the RPC', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    const res = await GET(req('startDate=2027-10-31&endDate=2027-10-31'))
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('answers 403 for a non-admin and never calls the RPC', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '403' })
    const res = await GET(req('startDate=2027-10-31&endDate=2027-10-31'))
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
