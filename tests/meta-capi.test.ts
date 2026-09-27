/**
 * meta-capi.test.ts — Phase 75 Plan 04, Task 2
 *
 * Covers VER-01 (D-12, T-75-10): the extended customDataSchema in
 * app/api/meta-capi/route.ts allow-lists site_locale/content_type/
 * content_ids while staying .strict() — an unknown key or an out-of-enum
 * site_locale still drops custom_data entirely.
 *
 * The route reads META_PIXEL_ID/META_CAPI_TOKEN at module scope, so this
 * file stubs the env vars with vi.stubEnv and dynamically imports the route
 * AFTER stubbing + vi.resetModules().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/meta-capi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/meta-capi customDataSchema (site_locale)', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    // Real Meta pixel IDs are numeric — the route now rejects non-digit IDs
    // (Plan 75-23, normalizeMetaPixelId).
    vi.stubEnv('META_PIXEL_ID', '1234567890')
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '1234567890')
    vi.stubEnv('META_CAPI_TOKEN', 'test-token')

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    })
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('passes value/currency/content_type/content_ids/site_locale through unchanged, event_id untouched', async () => {
    const { POST } = await import('@/app/api/meta-capi/route')

    const res = await POST(
      makeRequest({
        event_name: 'Purchase',
        event_id: 'PRG-20260101-ABC123',
        custom_data: {
          value: 120,
          currency: 'EUR',
          content_type: 'product',
          content_ids: ['PRG-20260101-ABC123'],
          site_locale: 'ru',
        },
      }) as unknown as import('next/server').NextRequest
    )

    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.data[0].custom_data).toEqual({
      value: 120,
      currency: 'EUR',
      content_type: 'product',
      content_ids: ['PRG-20260101-ABC123'],
      site_locale: 'ru',
    })
    expect(sentBody.data[0].event_id).toBe('PRG-20260101-ABC123')
  })

  it('drops custom_data entirely when an unknown key is present (strict preserved)', async () => {
    const { POST } = await import('@/app/api/meta-capi/route')

    const res = await POST(
      makeRequest({
        event_name: 'Purchase',
        event_id: 'PRG-1',
        custom_data: {
          value: 120,
          currency: 'EUR',
          unknown_key: 'evil',
        },
      }) as unknown as import('next/server').NextRequest
    )

    expect(res.status).toBe(200)
    const [, init] = mockFetch.mock.calls[0]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.data[0].custom_data).toBeUndefined()
  })

  it('drops custom_data when site_locale is out of the enum', async () => {
    const { POST } = await import('@/app/api/meta-capi/route')

    const res = await POST(
      makeRequest({
        event_name: 'Purchase',
        event_id: 'PRG-2',
        custom_data: { value: 1, currency: 'EUR', site_locale: 'xx' },
      }) as unknown as import('next/server').NextRequest
    )

    expect(res.status).toBe(200)
    const [, init] = mockFetch.mock.calls[0]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.data[0].custom_data).toBeUndefined()
  })

  it('drops custom_data when site_locale is an oversized string', async () => {
    const { POST } = await import('@/app/api/meta-capi/route')

    const res = await POST(
      makeRequest({
        event_name: 'Purchase',
        event_id: 'PRG-3',
        custom_data: { value: 1, currency: 'EUR', site_locale: 'a'.repeat(1000) },
      }) as unknown as import('next/server').NextRequest
    )

    expect(res.status).toBe(200)
    const [, init] = mockFetch.mock.calls[0]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.data[0].custom_data).toBeUndefined()
  })
})

/**
 * Plan 75-23, Task 2 (GAP-2 / WINDOWS #15, T-75-G07): the outbound Graph API
 * URL is built from the normalized pixel ID and the trimmed CAPI token — a
 * stray newline in either env value never reaches the request URL.
 * Token values here are dummy fixtures.
 */
describe('POST /api/meta-capi env normalization (WINDOWS #15)', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    })
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('builds the graph URL with the bare pixel ID and bare token (no newline, no %0A)', async () => {
    vi.stubEnv('META_PIXEL_ID', '1234567890\n')
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '')
    vi.stubEnv('META_CAPI_TOKEN', 'dummy-token\r\n')
    const { POST } = await import('@/app/api/meta-capi/route')

    const res = await POST(
      makeRequest({ event_name: 'PageView' }) as unknown as import('next/server').NextRequest
    )

    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe(
      'https://graph.facebook.com/v19.0/1234567890/events?access_token=dummy-token'
    )
    expect(String(url)).not.toMatch(/[\r\n]|%0A|%0D/i)
  })

  it('falls back to the normalized public pixel ID when META_PIXEL_ID is whitespace-only', async () => {
    vi.stubEnv('META_PIXEL_ID', '   \n')
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', ' 9876543210\n')
    vi.stubEnv('META_CAPI_TOKEN', 'dummy-token')
    const { POST } = await import('@/app/api/meta-capi/route')

    await POST(
      makeRequest({ event_name: 'PageView' }) as unknown as import('next/server').NextRequest
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe(
      'https://graph.facebook.com/v19.0/9876543210/events?access_token=dummy-token'
    )
  })

  it('falls back to the public pixel ID when META_PIXEL_ID is non-numeric', async () => {
    vi.stubEnv('META_PIXEL_ID', 'pixel-123')
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '9876543210')
    vi.stubEnv('META_CAPI_TOKEN', 'dummy-token')
    const { POST } = await import('@/app/api/meta-capi/route')

    await POST(
      makeRequest({ event_name: 'PageView' }) as unknown as import('next/server').NextRequest
    )

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/v19.0/9876543210/events')
  })

  it('returns ok+skipped and never calls fetch when both pixel IDs are invalid', async () => {
    vi.stubEnv('META_PIXEL_ID', 'abc')
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '  ')
    vi.stubEnv('META_CAPI_TOKEN', 'dummy-token')
    const { POST } = await import('@/app/api/meta-capi/route')

    const res = await POST(
      makeRequest({ event_name: 'PageView' }) as unknown as import('next/server').NextRequest
    )

    expect(await res.json()).toEqual({ ok: true, skipped: true })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('treats a whitespace-only CAPI token as not configured', async () => {
    vi.stubEnv('META_PIXEL_ID', '1234567890')
    vi.stubEnv('META_CAPI_TOKEN', ' \n')
    const { POST } = await import('@/app/api/meta-capi/route')

    const res = await POST(
      makeRequest({ event_name: 'PageView' }) as unknown as import('next/server').NextRequest
    )

    expect(await res.json()).toEqual({ ok: true, skipped: true })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
