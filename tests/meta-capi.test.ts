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
    vi.stubEnv('META_PIXEL_ID', 'pixel-123')
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', 'pixel-123')
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
