import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockFetch, mockGetGnetToken } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockGetGnetToken: vi.fn(),
}))
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/gnet-token', () => ({
  getGnetToken: mockGetGnetToken,
  GnetTokenError: class GnetTokenError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.name = 'GnetTokenError'
      this.code = code
    }
  },
}))

process.env.GNET_API_URL = 'https://api.test.grdd.net'

import { pushGnetStatus, GnetClientError, type GnetStatus } from '@/lib/gnet-client'

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset()
  mockGetGnetToken.mockReset()
})

// ── Test 1: Happy path — calls providerUpdateStatusByResNo with Bearer token ─

describe('pushGnetStatus happy path', () => {
  it('calls providerUpdateStatusByResNo with Bearer token', async () => {
    mockGetGnetToken.mockResolvedValue('tok-1')
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )

    await pushGnetStatus('RES-123', 'CONFIRMED')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('providerUpdateStatusByResNo')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ gnetResNo: 'RES-123', status: 'CONFIRMED' })
    expect(mockGetGnetToken).toHaveBeenCalledTimes(1)
    // First call should be without force arg (cached path)
    expect(mockGetGnetToken.mock.calls[0][0]).toBeFalsy()
  })
})

// ── Test 2: Retry once with forced fresh token on 401 ────────────────────────

describe('pushGnetStatus retry-on-401', () => {
  it('retries once with forced fresh token on 401', async () => {
    mockGetGnetToken
      .mockResolvedValueOnce('stale-tok')
      .mockResolvedValueOnce('fresh-tok')
    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    await expect(pushGnetStatus('RES-9', 'COMPLETE')).resolves.toBeUndefined()

    expect(mockGetGnetToken).toHaveBeenCalledTimes(2)
    expect(mockGetGnetToken.mock.calls[1][0]).toBe(true) // second call with force=true
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [, secondInit] = mockFetch.mock.calls[1] as [string, RequestInit]
    expect((secondInit.headers as Record<string, string>)['Authorization']).toBe('Bearer fresh-tok')
  })

  it('throws GnetClientError("AUTH_FAILED") after second 401', async () => {
    mockGetGnetToken
      .mockResolvedValueOnce('tok-a')
      .mockResolvedValueOnce('tok-b')
    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))

    const err = await pushGnetStatus('RES-1', 'CANCEL').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GnetClientError)
    expect((err as GnetClientError).code).toBe('AUTH_FAILED')
    expect((err as GnetClientError).status).toBe(401)
  })
})

// ── Test 3: AUTH_FAILED after two 401s (isolated) ────────────────────────────

describe('pushGnetStatus AUTH_FAILED on double 401', () => {
  it('throws GnetClientError code AUTH_FAILED with status 401 and calls fetch exactly twice', async () => {
    mockGetGnetToken
      .mockResolvedValueOnce('tok-a')
      .mockResolvedValueOnce('tok-b')
    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))

    await expect(pushGnetStatus('RES-x', 'ASSIGNED')).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      status: 401,
    })
    expect(mockFetch).toHaveBeenCalledTimes(2) // no third attempt
  })
})

// ── Test 4: API_ERROR on non-2xx, non-401 ────────────────────────────────────

describe('pushGnetStatus non-2xx non-401 error', () => {
  it('throws GnetClientError("API_ERROR") on 500 response without token in message', async () => {
    mockGetGnetToken.mockResolvedValue('secret-tok-xyz')
    mockFetch.mockResolvedValue(new Response('server error', { status: 500 }))

    await expect(pushGnetStatus('RES-2', 'EN_ROUTE')).rejects.toMatchObject({
      code: 'API_ERROR',
      status: 500,
    })

    try {
      await pushGnetStatus('RES-2', 'EN_ROUTE')
    } catch (err) {
      const e = err as GnetClientError
      expect(e).toBeInstanceOf(GnetClientError)
      expect(e.message).toContain('500')
      expect(e.message).not.toContain('secret-tok-xyz')
    }
  })
})

// ── Test 5: NETWORK_ERROR when fetch rejects ──────────────────────────────────

describe('pushGnetStatus network error', () => {
  it('throws GnetClientError("NETWORK_ERROR") when fetch rejects', async () => {
    mockGetGnetToken.mockResolvedValue('tok-1')
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(pushGnetStatus('RES-3', 'ON_LOCATION')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })

    try {
      await pushGnetStatus('RES-3', 'ON_LOCATION')
    } catch (err) {
      const e = err as GnetClientError
      expect(e).toBeInstanceOf(GnetClientError)
      expect(e.cause).toBeInstanceOf(Error)
    }
  })
})

// ── Test 6: Rethrows GnetTokenError from getGnetToken ────────────────────────

describe('pushGnetStatus rethrows GnetTokenError', () => {
  it('rethrows GnetTokenError("MISSING_CREDENTIALS") and never calls fetch', async () => {
    const { GnetTokenError } = await import('@/lib/gnet-token')
    const tokenErr = new GnetTokenError('MISSING_CREDENTIALS', 'no creds')
    mockGetGnetToken.mockRejectedValue(tokenErr)

    await expect(pushGnetStatus('RES-4', 'CONFIRMED')).rejects.toThrow('no creds')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ── Test 7-a: prestigoToGnetStatus mapping (D-01, D-06) ──────────────────────

describe('prestigoToGnetStatus', () => {
  it('returns CONFIRMED for confirmed', async () => {
    const { prestigoToGnetStatus } = await import('@/lib/gnet-client')
    expect(prestigoToGnetStatus('confirmed')).toBe('CONFIRMED')
  })
  it('returns COMPLETE for completed', async () => {
    const { prestigoToGnetStatus } = await import('@/lib/gnet-client')
    expect(prestigoToGnetStatus('completed')).toBe('COMPLETE')
  })
  it('returns CANCEL for cancelled', async () => {
    const { prestigoToGnetStatus } = await import('@/lib/gnet-client')
    expect(prestigoToGnetStatus('cancelled')).toBe('CANCEL')
  })
  it('returns null for pending (D-01)', async () => {
    const { prestigoToGnetStatus } = await import('@/lib/gnet-client')
    expect(prestigoToGnetStatus('pending')).toBeNull()
  })
  it('returns null for assigned (D-01 deferred)', async () => {
    const { prestigoToGnetStatus } = await import('@/lib/gnet-client')
    expect(prestigoToGnetStatus('assigned')).toBeNull()
  })
  it('returns null for en_route (D-01 deferred)', async () => {
    const { prestigoToGnetStatus } = await import('@/lib/gnet-client')
    expect(prestigoToGnetStatus('en_route')).toBeNull()
  })
  it('returns null for on_location (D-01 deferred)', async () => {
    const { prestigoToGnetStatus } = await import('@/lib/gnet-client')
    expect(prestigoToGnetStatus('on_location')).toBeNull()
  })
  it('returns null for unknown status', async () => {
    const { prestigoToGnetStatus } = await import('@/lib/gnet-client')
    expect(prestigoToGnetStatus('garbage_unknown')).toBeNull()
  })
})

// ── Test 7: GnetStatus type — compile-time and runtime check ─────────────────

describe('GnetStatus type', () => {
  it('accepts all 6 valid GnetStatus values at runtime', async () => {
    mockGetGnetToken.mockResolvedValue('tok-1')
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )

    const statuses: GnetStatus[] = [
      'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ON_LOCATION', 'COMPLETE', 'CANCEL',
    ]
    for (const s of statuses) {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      await expect(pushGnetStatus('RES-ts', s)).resolves.toBeUndefined()
    }
  })

  it('TypeScript compile-time assertion — INVALID is not assignable to GnetStatus', () => {
    // @ts-expect-error
    const _: GnetStatus = 'INVALID'
    // This test just needs to exist — tsc validates the @ts-expect-error
    expect(true).toBe(true)
  })
})
