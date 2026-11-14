import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeRouteDistance, ROUTES_TIMEOUT_MS } from '@/lib/route-distance'

const A = { lat: 50.08, lng: 14.42 }
const B = { lat: 50.09, lng: 14.43 }
const S = { lat: 50.085, lng: 14.4 }

function okResponse(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) }
}

function fetchMockOf(impl: () => Promise<unknown>) {
  const fn = vi.fn((_url: string, _init?: RequestInit) => impl())
  vi.stubGlobal('fetch', fn)
  return fn
}

function sentBody(fn: ReturnType<typeof fetchMockOf>, call = 0): Record<string, unknown> {
  const init = fn.mock.calls[call][1] as RequestInit
  return JSON.parse(init.body as string)
}

describe('computeRouteDistance', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('tracer: POSTs once through the stop with the Essentials field mask and returns km and minutes', async () => {
    const fetchMock = fetchMockOf(async () => okResponse({ routes: [{ distanceMeters: 42300, duration: '3060s' }] }))
    const result = await computeRouteDistance({ origin: A, destination: B, intermediates: [S] })

    expect(result).toEqual({ ok: true, distanceKm: 42.3, durationMin: 51 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Goog-FieldMask']).toBe('routes.distanceMeters,routes.duration')
    expect(headers['X-Goog-Api-Key']).toBe('test-key')
    expect(headers['Referer']).toBe('https://rideprestigo.com')
    expect(JSON.parse(init.body as string)).toEqual({
      origin: { location: { latLng: { latitude: A.lat, longitude: A.lng } } },
      destination: { location: { latLng: { latitude: B.lat, longitude: B.lng } } },
      travelMode: 'DRIVE',
      intermediates: [{ location: { latLng: { latitude: S.lat, longitude: S.lng } } }],
    })
  })

  it('distanceKm is distanceMeters / 1000 unrounded', async () => {
    fetchMockOf(async () => okResponse({ routes: [{ distanceMeters: 12345 }] }))
    const result = await computeRouteDistance({ origin: A, destination: B })
    expect(result).toEqual({ ok: true, distanceKm: 12.345, durationMin: null })
  })

  it.each([0, 1, 5])('body has exactly the four allowed keys and none of the forbidden ones for %i stops', async (n) => {
    const fetchMock = fetchMockOf(async () => okResponse({ routes: [{ distanceMeters: 1000 }] }))
    const stops = Array.from({ length: n }, (_, i) => ({ lat: 50 + i * 0.01, lng: 14 + i * 0.01 }))
    const result = await computeRouteDistance({ origin: A, destination: B, intermediates: stops })
    expect(result.ok).toBe(true)

    const body = sentBody(fetchMock)
    const expectedKeys = n === 0 ? ['destination', 'origin', 'travelMode'] : ['destination', 'intermediates', 'origin', 'travelMode']
    expect(Object.keys(body).sort()).toEqual(expectedKeys)
    expect(body.travelMode).toBe('DRIVE')
    const raw = (fetchMock.mock.calls[0][1] as RequestInit).body as string
    for (const forbidden of ['routingPreference', 'departureTime', 'optimizeWaypointOrder', 'via']) {
      expect(raw).not.toContain(forbidden)
    }
  })

  it('intermediates keep the order received and identical neighbours are not merged', async () => {
    const fetchMock = fetchMockOf(async () => okResponse({ routes: [{ distanceMeters: 1000 }] }))
    await computeRouteDistance({ origin: A, destination: B, intermediates: [S, S, A] })
    const body = sentBody(fetchMock) as { intermediates: Array<{ location: { latLng: { latitude: number; longitude: number } } }> }
    expect(body.intermediates.map((p) => [p.location.latLng.latitude, p.location.latLng.longitude])).toEqual([
      [S.lat, S.lng],
      [S.lat, S.lng],
      [A.lat, A.lng],
    ])
  })

  it('no stops sends no intermediates key', async () => {
    const fetchMock = fetchMockOf(async () => okResponse({ routes: [{ distanceMeters: 1000 }] }))
    await computeRouteDistance({ origin: A, destination: B, intermediates: [] })
    expect('intermediates' in sentBody(fetchMock)).toBe(false)
  })

  it('6 intermediates -> invalid_input and fetch is not called', async () => {
    const fetchMock = fetchMockOf(async () => okResponse({}))
    const stops = Array.from({ length: 6 }, (_, i) => ({ lat: 50 + i * 0.01, lng: 14 }))
    const result = await computeRouteDistance({ origin: A, destination: B, intermediates: stops })
    expect(result).toEqual({ ok: false, reason: 'invalid_input' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('non-finite or out-of-range coordinates -> invalid_input without fetch', async () => {
    const fetchMock = fetchMockOf(async () => okResponse({}))
    expect(await computeRouteDistance({ origin: { lat: NaN, lng: 14 }, destination: B })).toEqual({ ok: false, reason: 'invalid_input' })
    expect(await computeRouteDistance({ origin: A, destination: { lat: 91, lng: 14 } })).toEqual({ ok: false, reason: 'invalid_input' })
    expect(await computeRouteDistance({ origin: A, destination: B, intermediates: [{ lat: 50, lng: 181 }] })).toEqual({ ok: false, reason: 'invalid_input' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('missing key (unset or only a literal backslash-n) -> no_key without fetch', async () => {
    const fetchMock = fetchMockOf(async () => okResponse({}))
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '')
    expect(await computeRouteDistance({ origin: A, destination: B })).toEqual({ ok: false, reason: 'no_key' })
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '\\n')
    expect(await computeRouteDistance({ origin: A, destination: B })).toEqual({ ok: false, reason: 'no_key' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a trailing literal backslash-n on the key is stripped before it is sent', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'abc123\\n')
    const fetchMock = fetchMockOf(async () => okResponse({ routes: [{ distanceMeters: 1000 }] }))
    await computeRouteDistance({ origin: A, destination: B })
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Goog-Api-Key']).toBe('abc123')
  })

  it('HTTP 403 -> http_error', async () => {
    fetchMockOf(async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => 'forbidden' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await computeRouteDistance({ origin: A, destination: B })).toEqual({ ok: false, reason: 'http_error' })
  })

  it('a body without distanceMeters -> no_route', async () => {
    fetchMockOf(async () => okResponse({ routes: [] }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await computeRouteDistance({ origin: A, destination: B })).toEqual({ ok: false, reason: 'no_route' })
  })

  it('an aborted fetch -> timeout, a rejected fetch -> network, and it never throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMockOf(async () => {
      throw new DOMException('The operation timed out', 'TimeoutError')
    })
    expect(await computeRouteDistance({ origin: A, destination: B })).toEqual({ ok: false, reason: 'timeout' })

    fetchMockOf(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    expect(await computeRouteDistance({ origin: A, destination: B })).toEqual({ ok: false, reason: 'timeout' })

    fetchMockOf(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await computeRouteDistance({ origin: A, destination: B })).toEqual({ ok: false, reason: 'network' })
  })

  it('fetch receives an AbortSignal built from ROUTES_TIMEOUT_MS', async () => {
    expect(ROUTES_TIMEOUT_MS).toBe(8000)
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = fetchMockOf(async () => okResponse({ routes: [{ distanceMeters: 1000 }] }))
    await computeRouteDistance({ origin: A, destination: B })
    expect(timeoutSpy).toHaveBeenCalledWith(ROUTES_TIMEOUT_MS)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('console.error carries the status or reason only, never coordinates or the response body', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMockOf(async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => 'SECRET-BODY 50.08 14.42' }))
    await computeRouteDistance({ origin: A, destination: B, intermediates: [S] })
    fetchMockOf(async () => okResponse({ routes: [{ foo: 'SECRET-BODY' }] }))
    await computeRouteDistance({ origin: A, destination: B, intermediates: [S] })

    expect(errSpy).toHaveBeenCalled()
    const logged = JSON.stringify(errSpy.mock.calls)
    expect(logged).not.toContain('SECRET-BODY')
    expect(logged).not.toContain('50.08')
    expect(logged).not.toContain('14.42')
    expect(logged).not.toContain('50.085')
  })
})
