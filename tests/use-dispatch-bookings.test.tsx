import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, render, screen, waitFor, act } from '@testing-library/react'
import {
  useDispatchBookings,
  DISPATCH_POLL_MS,
  type DispatchQuery,
} from '@/components/admin/dispatch/useDispatchBookings'
import { UpdatedAgo } from '@/components/admin/dispatch/UpdatedAgo'

interface Row { id: string; status?: string }

const BASE: DispatchQuery = { startDate: '2027-10-31', endDate: '2027-10-31', search: '', tripType: 'all' }

function okResponse(rows: Row[], truncated = false) {
  return { ok: true, status: 200, json: async () => ({ bookings: rows, truncated }) } as unknown as Response
}
function statusResponse(status: number) {
  return { ok: false, status, json: async () => ({}) } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setVisibility('visible')
})

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

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

describe('useDispatchBookings - polling rules', () => {
  async function mountFake(paused = false) {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(okResponse([{ id: 'b1', status: 'confirmed' }]))
    const hook = renderHook(
      ({ paused }: { paused: boolean }) => useDispatchBookings<Row>(BASE, { paused }),
      { initialProps: { paused } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    return hook
  }
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })

  it('exports a 30 second interval', () => {
    expect(DISPATCH_POLL_MS).toBe(30_000)
  })

  it('fetches once more after 30 000 ms and not after 29 999 ms', async () => {
    await mountFake()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(29_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('skips ticks while paused and catches up at once when the pause ends', async () => {
    const hook = await mountFake(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    hook.rerender({ paused: false })
    await advance(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await advance(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not catch up after a pause when no tick was skipped', async () => {
    const hook = await mountFake(true)
    hook.rerender({ paused: false })
    await advance(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fetches nothing on a hidden tab and loads at once when it becomes visible', async () => {
    await mountFake()
    setVisibility('hidden')
    await advance(90_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not load on visibilitychange while paused', async () => {
    await mountFake(true)
    setVisibility('hidden')
    setVisibility('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('drops a response for an older query when the newer one resolved first', async () => {
    vi.useFakeTimers()
    let resolveOld: (r: Response) => void = () => {}
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce(okResponse([{ id: 'new' }]))
    const hook = renderHook(
      ({ q }: { q: DispatchQuery }) => useDispatchBookings<Row>(q, { paused: false }),
      { initialProps: { q: BASE } },
    )
    hook.rerender({ q: { ...BASE, search: 'new' } })
    await advance(0)
    expect(hook.result.current.rows).toEqual([{ id: 'new' }])
    await act(async () => {
      resolveOld(okResponse([{ id: 'old' }]))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(hook.result.current.rows).toEqual([{ id: 'new' }])
  })

  it('stops polling on 401 and reports unauthorized', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(statusResponse(401))
    const hook = renderHook(() => useDispatchBookings<Row>(BASE, { paused: false }))
    await advance(0)
    expect(hook.result.current.error).toBe('unauthorized')
    await advance(90_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports failed on a 500 and retries on the next tick', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(statusResponse(500)).mockResolvedValue(okResponse([{ id: 'b1' }]))
    const hook = renderHook(() => useDispatchBookings<Row>(BASE, { paused: false }))
    await advance(0)
    expect(hook.result.current.error).toBe('failed')
    await advance(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(hook.result.current.error).toBeNull()
    expect(hook.result.current.rows).toEqual([{ id: 'b1' }])
  })

  it('patchRow changes only the named row and refresh fetches at once', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(okResponse([{ id: 'b1', status: 'confirmed' }, { id: 'b2', status: 'confirmed' }]))
    const hook = renderHook(() => useDispatchBookings<Row>(BASE, { paused: false }))
    await advance(0)
    act(() => hook.result.current.patchRow('b1', { status: 'on_location' }))
    expect(hook.result.current.rows).toEqual([
      { id: 'b1', status: 'on_location' },
      { id: 'b2', status: 'confirmed' },
    ])
    await act(async () => {
      hook.result.current.refresh()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('drops a poll that was already in flight when a row was patched (WR-05)', async () => {
    vi.useFakeTimers()
    let resolveStale: (r: Response) => void = () => {}
    fetchMock
      .mockResolvedValueOnce(okResponse([{ id: 'b1', status: 'confirmed' }]))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveStale = resolve }))
      .mockResolvedValue(okResponse([{ id: 'b1', status: 'on_location' }]))
    const hook = renderHook(() => useDispatchBookings<Row>(BASE, { paused: false }))
    await advance(0)
    await advance(30_000) // second poll leaves and hangs
    expect(fetchMock).toHaveBeenCalledTimes(2)
    act(() => hook.result.current.patchRow('b1', { status: 'on_location' }))
    // the poll that left before the move comes back with the pre-move status
    await act(async () => {
      resolveStale(okResponse([{ id: 'b1', status: 'confirmed' }]))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(hook.result.current.rows).toEqual([{ id: 'b1', status: 'on_location' }])
    expect(hook.result.current.loading).toBe(false)
  })

  it('clears the rows of the old range while the new one loads and after it failed (WR-07)', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(okResponse([{ id: 'yesterday' }]))
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValueOnce(statusResponse(500))
    const hook = renderHook(
      ({ q }: { q: DispatchQuery }) => useDispatchBookings<Row>(q, { paused: false }),
      { initialProps: { q: BASE } },
    )
    await advance(0)
    expect(hook.result.current.rows).toEqual([{ id: 'yesterday' }])

    hook.rerender({ q: { ...BASE, startDate: '2027-11-01', endDate: '2027-11-01' } })
    await advance(0)
    expect(hook.result.current.rows).toEqual([])
    expect(hook.result.current.loading).toBe(true)
    expect(hook.result.current.updatedAt).toBeNull()

    hook.rerender({ q: { ...BASE, startDate: '2027-11-02', endDate: '2027-11-02' } })
    await advance(0)
    expect(hook.result.current.error).toBe('failed')
    expect(hook.result.current.rows).toEqual([])
  })

  it('keeps the rows when only the poll repeats for the same query (WR-07)', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(okResponse([{ id: 'b1' }]))
    const hook = renderHook(() => useDispatchBookings<Row>(BASE, { paused: false }))
    await advance(0)
    await advance(30_000)
    expect(hook.result.current.rows).toEqual([{ id: 'b1' }])
  })

  it('does not stay in loading when the query changes after a 401 (WR-07)', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(statusResponse(401))
    const hook = renderHook(
      ({ q }: { q: DispatchQuery }) => useDispatchBookings<Row>(q, { paused: false }),
      { initialProps: { q: BASE } },
    )
    await advance(0)
    expect(hook.result.current.error).toBe('unauthorized')
    expect(hook.result.current.loading).toBe(false)
    hook.rerender({ q: { ...BASE, search: 'x' } })
    await advance(0)
    expect(hook.result.current.loading).toBe(false)
    expect(hook.result.current.error).toBe('unauthorized')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('makes no request when enabled is false', async () => {
    vi.useFakeTimers()
    renderHook(() => useDispatchBookings<Row>(BASE, { paused: false, enabled: false }))
    await advance(120_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('UpdatedAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-10-31T10:00:00Z'))
  })

  it('shows 0 s for a fresh load, then seconds, then minutes', async () => {
    render(<UpdatedAgo at={Date.now()} />)
    expect(screen.getByText('Updated 0 s ago')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    expect(screen.getByText('Updated 12 s ago')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(113_000)
    })
    expect(screen.getByText('Updated 2 min ago')).toBeInTheDocument()
  })

  it('shows Loading… when there is no load yet', () => {
    render(<UpdatedAgo at={null} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('says refreshing is paused only while paused (WR-08)', () => {
    const { rerender } = render(<UpdatedAgo at={Date.now()} />)
    expect(screen.queryByTestId('refresh-paused')).toBeNull()
    rerender(<UpdatedAgo at={Date.now()} paused />)
    expect(screen.getByTestId('refresh-paused').textContent).toContain('Refresh paused while editing')
    expect(screen.getByText('Updated 0 s ago')).toBeInTheDocument()
    rerender(<UpdatedAgo at={null} paused />)
    expect(screen.getByTestId('refresh-paused')).toBeInTheDocument()
  })

  it('turns screen-reader announcements off', () => {
    render(<UpdatedAgo at={Date.now()} />)
    expect(screen.getByText('Updated 0 s ago')).toHaveAttribute('aria-live', 'off')
  })
})
