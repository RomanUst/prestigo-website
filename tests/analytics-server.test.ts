import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendGa4Purchase } from '@/lib/analytics-server'

// sendGa4Purchase no-ops entirely (returns false without calling fetch) unless
// both env vars are set — stub both to exercise the real MP POST body.
const ORIGINAL_ENV = { ...process.env }

function mockFetchOk() {
  return vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' })
}

describe('D-11: sendGa4Purchase site_locale param', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GA_ID = 'G-TEST123'
    process.env.GA4_API_SECRET = 'test-secret'
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
  })

  it('siteLocale "ar" -> events[0].params.site_locale === "ar"', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)

    const ok = await sendGa4Purchase({
      transactionId: 'PRG-20260101-0001',
      valueEur: 100,
      items: [],
      siteLocale: 'ar',
    })

    expect(ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as { body: string }).body)
    expect(body.events[0].params.site_locale).toBe('ar')
  })

  it('missing siteLocale -> site_locale defaults to "en"', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)

    await sendGa4Purchase({
      transactionId: 'PRG-20260101-0002',
      valueEur: 50,
      items: [],
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as { body: string }).body)
    expect(body.events[0].params.site_locale).toBe('en')
  })

  it('unknown siteLocale "xx" -> site_locale normalizes to "en"', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)

    await sendGa4Purchase({
      transactionId: 'PRG-20260101-0003',
      valueEur: 75,
      items: [],
      siteLocale: 'xx',
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as { body: string }).body)
    expect(body.events[0].params.site_locale).toBe('en')
  })

  it('site_locale is always present even when siteLocale is undefined', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)

    await sendGa4Purchase({
      transactionId: 'PRG-20260101-0004',
      valueEur: 10,
      items: [],
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as { body: string }).body)
    expect(body.events[0].params).toHaveProperty('site_locale')
  })
})
