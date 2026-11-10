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

describe('GET /api/admin/bookings/dispatch - range validation', () => {
  const bad: Array<[string, string]> = [
    ['missing startDate', 'endDate=2027-10-31'],
    ['missing endDate', 'startDate=2027-10-31'],
    ['non-padded date', 'startDate=2027-1-01&endDate=2027-10-31'],
    ['impossible calendar date', 'startDate=2027-02-30&endDate=2027-03-05'],
    ['start after end', 'startDate=2027-11-02&endDate=2027-11-01'],
    ['63 days inclusive', 'startDate=2027-10-01&endDate=2027-12-02'],
  ]

  it.each(bad)('answers 400 invalid_range for %s and skips the RPC', async (_name, qs) => {
    const res = await GET(req(qs))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_range' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('accepts a 62-day inclusive range', async () => {
    rpcMock.mockResolvedValueOnce(page([], 0))
    const res = await GET(req('startDate=2027-10-01&endDate=2027-12-01'))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/admin/bookings/dispatch - tripType and search', () => {
  it.each(['evil', 'transfer;drop'])('answers 400 invalid_trip_type for %s', async (value) => {
    const res = await GET(req(`startDate=2027-10-31&endDate=2027-10-31&tripType=${encodeURIComponent(value)}`))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_trip_type' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('passes a known tripType through and treats an empty one as null', async () => {
    rpcMock.mockResolvedValue(page([], 0))
    await GET(req('startDate=2027-10-31&endDate=2027-10-31&tripType=daily'))
    expect(rpcMock.mock.calls[0][1].p_trip_type).toBe('daily')
    await GET(req('startDate=2027-10-31&endDate=2027-10-31&tripType='))
    expect(rpcMock.mock.calls[1][1].p_trip_type).toBeNull()
  })

  it('trims and cuts a 150-character search to its first 100 characters', async () => {
    rpcMock.mockResolvedValue(page([], 0))
    const long = 'a'.repeat(150)
    await GET(req(`startDate=2027-10-31&endDate=2027-10-31&search=${encodeURIComponent('  ' + long)}`))
    expect(rpcMock.mock.calls[0][1].p_query).toBe('a'.repeat(100))
  })

  it('treats a whitespace-only search as null', async () => {
    rpcMock.mockResolvedValue(page([], 0))
    await GET(req('startDate=2027-10-31&endDate=2027-10-31&search=%20%20%20'))
    expect(rpcMock.mock.calls[0][1].p_query).toBeNull()
  })
})

describe('GET /api/admin/bookings/dispatch - paging and truncation', () => {
  const rowsOf = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `b${from + i}` }))

  it('pages through total_count 250 in three calls (offsets 0, 100, 200), truncated false', async () => {
    rpcMock
      .mockResolvedValueOnce(page(rowsOf(100, 0), 250))
      .mockResolvedValueOnce(page(rowsOf(100, 100), 250))
      .mockResolvedValueOnce(page(rowsOf(50, 200), 250))
    const res = await GET(req('startDate=2027-10-01&endDate=2027-10-31'))
    const body = await res.json()
    expect(rpcMock).toHaveBeenCalledTimes(3)
    expect(rpcMock.mock.calls.map((c) => c[1].p_offset)).toEqual([0, 100, 200])
    expect(body.bookings).toHaveLength(250)
    expect(body.truncated).toBe(false)
  })

  it('stops after five RPC calls for total_count 900 and reports truncated true', async () => {
    rpcMock.mockImplementation(async (_fn: string, args: { p_offset: number }) =>
      page(rowsOf(100, args.p_offset), 900),
    )
    const res = await GET(req('startDate=2027-10-01&endDate=2027-10-31'))
    const body = await res.json()
    expect(rpcMock).toHaveBeenCalledTimes(5)
    expect(rpcMock.mock.calls.map((c) => c[1].p_offset)).toEqual([0, 100, 200, 300, 400])
    expect(body.bookings).toHaveLength(500)
    expect(body.truncated).toBe(true)
  })

  it('answers an empty range after one RPC call', async () => {
    rpcMock.mockResolvedValueOnce(page([], 0))
    const res = await GET(req('startDate=2027-10-31&endDate=2027-10-31'))
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ bookings: [], truncated: false })
  })
})

describe('GET /api/admin/bookings/dispatch - failure and log hygiene', () => {
  it('answers 500 DB read failed and never logs the search term', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const res = await GET(req('startDate=2027-10-31&endDate=2027-10-31&search=SecretClientName'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'DB read failed' })
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(spy).toHaveBeenCalled()
    expect(JSON.stringify(spy.mock.calls)).not.toContain('SecretClientName')
    spy.mockRestore()
  })
})
