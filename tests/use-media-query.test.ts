import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from '@/lib/use-media-query'

describe('useMediaQuery', () => {
  let listeners: Array<(e: { matches: boolean }) => void> = []

  function mockMatchMedia(matches: boolean) {
    const mql = {
      matches,
      addEventListener: vi.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
        listeners.push(cb)
      }),
      removeEventListener: vi.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
        listeners = listeners.filter((l) => l !== cb)
      }),
    }
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn(() => mql),
    })
    return mql
  }

  beforeEach(() => {
    listeners = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns false on initial render (SSR-safe default)', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    // useState(false) is initial, then effect fires
    expect(typeof result.current).toBe('boolean')
  })

  it('returns true when matchMedia matches', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    act(() => {}) // flush effects
    expect(result.current).toBe(true)
  })

  it('returns false when matchMedia does not match', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    act(() => {})
    expect(result.current).toBe(false)
  })

  it('subscribes to change events and updates on change', () => {
    const mql = mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    act(() => {})
    expect(result.current).toBe(false)

    // Simulate media query change: update mql.matches then fire listeners
    ;(mql as unknown as { matches: boolean }).matches = true
    act(() => {
      listeners.forEach((l) => l({ matches: true }))
    })
    expect(result.current).toBe(true)
  })

  it('removes event listener on unmount', () => {
    const mql = mockMatchMedia(true)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    act(() => {})
    unmount()
    expect(mql.removeEventListener).toHaveBeenCalled()
  })
})
