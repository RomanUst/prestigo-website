import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDispatchBookings, type DispatchQuery } from '@/components/admin/dispatch/useDispatchBookings'

interface Row { id: string; status?: string }

const BASE: DispatchQuery = { startDate: '2027-10-31', endDate: '2027-10-31', search: '', tripType: 'all' }

function okResponse(rows: Row[], truncated = false) {
  return { ok: true, status: 200, json: async () => ({ bookings: rows, truncated }) } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useDispatchBookings - tracer', () => {
  it('loads the range on mount and exposes rows, loading false and updatedAt', async () => {
    fetchMock.mockResolvedValue(okResponse([{ id: 'b1' }]))
    const { result } = renderHook(() =>
      useDispatchBookings<Row>(BASE, { paused: false }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/admin/bookings/dispatch?startDate=2027-10-31&endDate=2027-10-31',
    )
    expect(result.current.rows).toEqual([{ id: 'b1' }])
    expect(typeof result.current.updatedAt).toBe('number')
    expect(result.current.error).toBeNull()
  })

  it('appends search and tripType when set', async () => {
    fetchMock.mockResolvedValue(okResponse([]))
    const { result } = renderHook(() =>
      useDispatchBookings<Row>({ ...BASE, search: 'PRG', tripType: 'hourly' }, { paused: false }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/admin/bookings/dispatch?startDate=2027-10-31&endDate=2027-10-31&search=PRG&tripType=hourly',
    )
  })
})
