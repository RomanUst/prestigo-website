import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.stubGlobal('fetch', mockFetch)

process.env.GNET_UID = 'test-uid'
process.env.GNET_PW  = 'test-pw'
process.env.UPSTASH_REDIS_REST_URL   = 'https://test.upstash.io'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-upstash-token'

import { getGnetToken, GnetTokenError } from '@/lib/gnet-token'

// ── Response helpers ────────────────────────────────────────────────────────────

const upstashGetHit  = (val: string) => new Response(JSON.stringify({ result: val }),  { status: 200 })
const upstashGetMiss = ()             => new Response(JSON.stringify({ result: null }), { status: 200 })
const upstashSetOk   = ()             => new Response(JSON.stringify({ result: 'OK' }), { status: 200 })
const gnetAuthOk     = (tok: string)  => new Response(JSON.stringify({ token: tok }),  { status: 200 })
const gnetAuthFail   = ()             => new Response('server error', { status: 500 })

// ── Setup ───────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset()
  // Restore env vars to defaults
  process.env.GNET_UID = 'test-uid'
  process.env.GNET_PW  = 'test-pw'
  process.env.UPSTASH_REDIS_REST_URL   = 'https://test.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-upstash-token'
})

afterEach(() => {
  // Restore env vars after each test
  process.env.GNET_UID = 'test-uid'
  process.env.GNET_PW  = 'test-pw'
  process.env.UPSTASH_REDIS_REST_URL   = 'https://test.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-upstash-token'
})

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('getGnetToken', () => {
  it('returns cached token on Upstash cache hit', async () => {
    mockFetch.mockResolvedValueOnce(upstashGetHit('cached-jwt-abc'))

    const result = await getGnetToken()

    expect(result).toBe('cached-jwt-abc')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('fetches new token on Upstash cache miss and writes back with TTL 3500', async () => {
    mockFetch
      .mockResolvedValueOnce(upstashGetMiss())         // Upstash GET miss
      .mockResolvedValueOnce(gnetAuthOk('fresh-jwt-xyz')) // GNet auth POST
      .mockResolvedValueOnce(upstashSetOk())           // Upstash SET

    const result = await getGnetToken()

    expect(result).toBe('fresh-jwt-xyz')
    expect(mockFetch).toHaveBeenCalledTimes(3)

    // 2nd call: GNet auth URL contains 'getToken2', body contains uid/pw
    const gnetCall = mockFetch.mock.calls[1]
    expect(gnetCall[0]).toContain('getToken2')
    const gnetBody = JSON.parse(gnetCall[1].body)
    expect(gnetBody).toMatchObject({ uid: 'test-uid', pw: 'test-pw' })

    // 3rd call: Upstash SET with TTL 3500
    const setCall = mockFetch.mock.calls[2]
    const setBody = JSON.parse(setCall[1].body)
    expect(setBody).toEqual(['SET', 'prestigo:gnet:token', 'fresh-jwt-xyz', 'EX', 3500])
  })

  it('getGnetToken(true) bypasses cache and forces a fresh fetch', async () => {
    mockFetch
      .mockResolvedValueOnce(gnetAuthOk('force-jwt-abc')) // GNet auth (no Upstash GET call)
      .mockResolvedValueOnce(upstashSetOk())              // Upstash SET

    const result = await getGnetToken(true)

    expect(result).toBe('force-jwt-abc')
    // Upstash GET must NOT be called — only GNet auth + Upstash SET
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const firstCallUrl = mockFetch.mock.calls[0][0] as string
    expect(firstCallUrl).toContain('getToken2')

    // Upstash SET also includes TTL 3500
    const setBody = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(setBody).toEqual(['SET', 'prestigo:gnet:token', 'force-jwt-abc', 'EX', 3500])
  })

  it('throws GnetTokenError("MISSING_CREDENTIALS") when GNET_UID is unset', async () => {
    delete process.env.GNET_UID
    // Upstash GET miss so we proceed to fetchNewToken
    mockFetch.mockResolvedValueOnce(upstashGetMiss())

    await expect(getGnetToken()).rejects.toMatchObject({
      code: 'MISSING_CREDENTIALS',
    })
    await expect(getGnetToken()).rejects.toBeInstanceOf(GnetTokenError)
  })

  it('throws GnetTokenError("AUTH_FAILED") on non-2xx from GNet auth; message does not contain GNET_PW', async () => {
    mockFetch
      .mockResolvedValueOnce(upstashGetMiss()) // Upstash GET miss
      .mockResolvedValueOnce(gnetAuthFail())   // GNet auth 500

    let caughtError: unknown
    try {
      await getGnetToken()
    } catch (e) {
      caughtError = e
    }

    expect(caughtError).toBeInstanceOf(GnetTokenError)
    expect((caughtError as GnetTokenError).code).toBe('AUTH_FAILED')
    expect((caughtError as Error).message).not.toContain('test-pw')
  })

  it('falls back to in-memory cache when Upstash env vars are unset', async () => {
    // Need fresh module state for in-memory fallback test
    await vi.resetModules()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { getGnetToken: getGnetTokenFresh } = await import('@/lib/gnet-token')

    // First call: fetch from GNet (no Upstash)
    mockFetch.mockResolvedValueOnce(gnetAuthOk('mem-jwt-111'))
    const result1 = await getGnetTokenFresh()
    expect(result1).toBe('mem-jwt-111')

    // Second call: in-memory cache hit — must NOT call GNet again
    mockFetch.mockReset()
    const result2 = await getGnetTokenFresh()
    expect(result2).toBe('mem-jwt-111')
    expect(mockFetch).toHaveBeenCalledTimes(0)
  })

  it('never logs token value to any console method', async () => {
    await vi.resetModules()
    process.env.UPSTASH_REDIS_REST_URL   = 'https://test.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-upstash-token'

    const { getGnetToken: getGnetTokenFresh } = await import('@/lib/gnet-token')

    mockFetch
      .mockResolvedValueOnce(upstashGetMiss())
      .mockResolvedValueOnce(gnetAuthOk('fresh-jwt-xyz'))
      .mockResolvedValueOnce(upstashSetOk())

    const logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    await getGnetTokenFresh()

    const allLogArgs = [
      ...logSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...infoSpy.mock.calls.flat(),
    ]
    for (const arg of allLogArgs) {
      if (typeof arg === 'string') {
        expect(arg).not.toContain('fresh-jwt-xyz')
      }
    }

    logSpy.mockRestore()
    warnSpy.mockRestore()
    infoSpy.mockRestore()
  })
})
