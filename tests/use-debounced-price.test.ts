import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useDebouncedPrice from '@/lib/use-debounced-price'

// Hoisted store state
const storeState = vi.hoisted(() => ({
  from: null as { lat: number; lng: number; placeId?: string; label: string } | null,
  to: null as { lat: number; lng: number; placeId?: string; label: string } | null,
  serviceType: 'transfer' as 'transfer' | 'hourly' | 'daily',
  date: null as string | null,
  time: null as string | null,
  hours: 2,
  passengers: 1,
  childSeats: 0,
  extraStops: 0,
  setPriceBreakdown: vi.fn(),
  setQuoteMode: vi.fn(),
  setMatchedRouteSlug: vi.fn(),
  setDistanceKm: vi.fn(),
}))

vi.mock('@/lib/calculator-store', () => ({
  useCalculatorStore: vi.fn((selector?: unknown) => {
    if (typeof selector === 'function') return selector(storeState)
    return storeState
  }),
}))

// Expose getState on mock after mocking
import { useCalculatorStore } from '@/lib/calculator-store'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(useCalculatorStore as any).getState = vi.fn(() => storeState)

const mockFetch = vi.fn()

describe('useDebouncedPrice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    global.fetch = mockFetch
    mockFetch.mockClear()
    storeState.setPriceBreakdown.mockClear()
    storeState.setQuoteMode.mockClear()
    storeState.setMatchedRouteSlug.mockClear()
    storeState.setDistanceKm.mockClear()
    // Reset to null state
    storeState.from = null
    storeState.to = null
    storeState.date = null
    storeState.time = null
    storeState.serviceType = 'transfer'
    storeState.hours = 2
    storeState.passengers = 1
    storeState.childSeats = 0
    storeState.extraStops = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does NOT fire fetch when date or time is missing', async () => {
    storeState.from = { lat: 50, lng: 14, placeId: 'ChIJ1', label: 'Prague' }
    storeState.to = { lat: 48, lng: 16, placeId: 'ChIJ2', label: 'Vienna' }
    storeState.date = null
    storeState.time = null

    renderHook(() => useDebouncedPrice())

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fires fetch after 400ms debounce when all inputs ready', async () => {
    storeState.from = { lat: 50, lng: 14, placeId: 'ChIJ1', label: 'Prague' }
    storeState.to = { lat: 48, lng: 16, placeId: 'ChIJ2', label: 'Vienna' }
    storeState.date = '2026-06-01'
    storeState.time = '10:00'
    storeState.childSeats = 1
    storeState.extraStops = 2

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        prices: { business: { base: 100, extras: 15, total: 115, currency: 'EUR' } },
        quoteMode: false,
        matchedRouteSlug: 'prague-vienna',
        distanceKm: 330,
      }),
    })

    renderHook(() => useDebouncedPrice())

    // Should not fire immediately
    expect(mockFetch).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(400)
      // Let the async fetch resolve
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/calculate-price', expect.objectContaining({
      method: 'POST',
    }))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.originPlaceId).toBe('ChIJ1')
    expect(body.destinationPlaceId).toBe('ChIJ2')
    expect(body.childSeats).toBe(1)
    expect(body.extraStops).toBe(2)
  })

  it('calls setQuoteMode(true) and setPriceBreakdown(null) on fetch error', async () => {
    storeState.from = { lat: 50, lng: 14, placeId: 'ChIJ1', label: 'Prague' }
    storeState.to = { lat: 48, lng: 16, placeId: 'ChIJ2', label: 'Vienna' }
    storeState.date = '2026-06-01'
    storeState.time = '10:00'

    mockFetch.mockRejectedValue(new Error('Network error'))

    renderHook(() => useDebouncedPrice())

    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(storeState.setQuoteMode).toHaveBeenCalledWith(true)
    expect(storeState.setPriceBreakdown).toHaveBeenCalledWith(null)
  })

  it('does NOT fire fetch before 400ms (debounce)', async () => {
    storeState.from = { lat: 50, lng: 14, placeId: 'ChIJ1', label: 'Prague' }
    storeState.to = { lat: 48, lng: 16, placeId: 'ChIJ2', label: 'Vienna' }
    storeState.date = '2026-06-01'
    storeState.time = '10:00'

    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ prices: null, quoteMode: true }) })

    renderHook(() => useDebouncedPrice())

    act(() => {
      vi.advanceTimersByTime(399)
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})
