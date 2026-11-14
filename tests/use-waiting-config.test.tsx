import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useWaitingConfig, resetWaitingConfigCache } from '@/components/booking/useWaitingConfig'

function okResponse(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) }
}

describe('useWaitingConfig (D-05)', () => {
  beforeEach(() => {
    resetWaitingConfigCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts not loaded, then returns the offered classes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ freeMin: 15, blockMin: 15, maxMin: 120, offeredClasses: ['business', 'first_class'] })))
    const { result } = renderHook(() => useWaitingConfig())
    expect(result.current).toEqual({ offeredClasses: [], loaded: false })
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.offeredClasses).toEqual(['business', 'first_class'])
  })

  it('shares one fetch between several consumers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ offeredClasses: ['business'] }))
    vi.stubGlobal('fetch', fetchMock)
    const a = renderHook(() => useWaitingConfig())
    const b = renderHook(() => useWaitingConfig())
    await waitFor(() => expect(a.result.current.loaded && b.result.current.loaded).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/waiting-config')
  })

  it('a failed fetch yields no offered classes and loaded true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const { result } = renderHook(() => useWaitingConfig())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.offeredClasses).toEqual([])
  })

  it('a non-OK response or malformed body yields no offered classes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }))
    const bad = renderHook(() => useWaitingConfig())
    await waitFor(() => expect(bad.result.current.loaded).toBe(true))
    expect(bad.result.current.offeredClasses).toEqual([])

    resetWaitingConfigCache()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ offeredClasses: 'business' })))
    const malformed = renderHook(() => useWaitingConfig())
    await waitFor(() => expect(malformed.result.current.loaded).toBe(true))
    expect(malformed.result.current.offeredClasses).toEqual([])
  })

  it('drops class names it does not know', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ offeredClasses: ['business', 'limo'] })))
    const { result } = renderHook(() => useWaitingConfig())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.offeredClasses).toEqual(['business'])
  })
})
