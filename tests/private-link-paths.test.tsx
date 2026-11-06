// @vitest-environment jsdom
/**
 * private-link-paths.test.tsx — Phase 89 Plan 02 (HOLD-06, D-02; threats T-89-04, T-89-06, T-89-07)
 *
 * A secret-link path (/manage/<token>, /driver/trip/<token>) must never reach a
 * third party. One shared predicate keeps every analytics / consent / chat component
 * off those paths; the public manage routes are CSRF-guarded and rate-limited.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextRequest } from 'next/server'

const { mockUsePathname, mockUseSearchParams } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
  mockUseSearchParams: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    usePathname: mockUsePathname,
    useSearchParams: mockUseSearchParams,
  }
})

// Make next/script observable: one <script> per Script element, with its id and body.
vi.mock('next/script', () => ({
  default: (props: { id?: string; src?: string; children?: string; dangerouslySetInnerHTML?: { __html: string } }) => (
    <script
      data-testid="script"
      data-id={props.id ?? ''}
      data-src={props.src ?? ''}
      dangerouslySetInnerHTML={{ __html: props.children ?? props.dangerouslySetInnerHTML?.__html ?? '' }}
    />
  ),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  })),
}))
vi.mock('next-intl/middleware', () => ({ default: vi.fn(() => vi.fn()) }))

import { isPrivateLinkPath } from '@/lib/private-link-path'
import { checkRateLimit } from '@/lib/rate-limit'
import AnalyticsPageView from '@/components/AnalyticsPageView'

describe('isPrivateLinkPath', () => {
  it.each([
    '/admin',
    '/admin/bookings',
    '/driver/trip/abc',
    '/manage/abc',
    '/ar/manage/abc',
    '/zh/driver/x',
    '/ru/manage/abc',
    '/fr/manage',
  ])('%s is private', (path) => {
    expect(isPrivateLinkPath(path)).toBe(true)
  })

  it.each([
    '/',
    '/managed',
    '/en-route',
    '/book',
    '/routes/prague-vienna',
    '/ru/book',
    '/ru',
    '/administrator',
    '/driverless',
    '/blog/manage-your-booking',
  ])('%s is public', (path) => {
    expect(isPrivateLinkPath(path)).toBe(false)
  })

  it('treats empty input as public', () => {
    expect(isPrivateLinkPath(null)).toBe(false)
    expect(isPrivateLinkPath(undefined)).toBe(false)
    expect(isPrivateLinkPath('')).toBe(false)
  })
})

describe('AnalyticsPageView on private paths', () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue({ toString: () => '' })
    delete (window as { gtag?: unknown }).gtag
    delete (window as { dataLayer?: unknown }).dataLayer
  })
  afterEach(() => cleanup())

  it.each(['/manage/tok', '/ar/manage/tok', '/driver/trip/tok'])('%s sends no page view', (path) => {
    mockUsePathname.mockReturnValue(path)
    const gtag = vi.fn()
    ;(window as { gtag?: unknown }).gtag = gtag
    render(<AnalyticsPageView />)
    expect(gtag).not.toHaveBeenCalled()
    expect((window as { dataLayer?: unknown[] }).dataLayer).toBeUndefined()
  })

  it('still sends a page view on a public path', () => {
    mockUsePathname.mockReturnValue('/book')
    const gtag = vi.fn()
    ;(window as { gtag?: unknown }).gtag = gtag
    render(<AnalyticsPageView />)
    expect(gtag).toHaveBeenCalled()
  })
})

describe('GoogleAnalytics on private paths', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function load() {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST123')
    vi.resetModules()
    return (await import('@/components/GoogleAnalytics')).default
  }

  it.each(['/manage/tok', '/ar/manage/tok', '/driver/trip/tok', '/admin'])('%s renders no gtag script and no config call', async (path) => {
    mockUsePathname.mockReturnValue(path)
    const GoogleAnalytics = await load()
    const { container } = render(<GoogleAnalytics />)
    expect(container.querySelectorAll('script').length).toBe(0)
  })

  it('renders the gtag loader and config on a public path', async () => {
    mockUsePathname.mockReturnValue('/book')
    const GoogleAnalytics = await load()
    const { container } = render(<GoogleAnalytics />)
    expect(container.querySelector('script[data-id="ga-init"]')?.innerHTML).toContain("gtag('config'")
  })
})

describe('rate-limit keys for the public manage routes (an unknown key is unlimited)', () => {
  it('/api/manage/cancel has a finite limit', async () => {
    const r = await checkRateLimit('/api/manage/cancel', 'test-ip-cancel')
    expect(Number.isFinite(r.limit)).toBe(true)
    expect(r.limit).toBe(10)
  })

  it('/api/manage/change-request has a finite limit', async () => {
    const r = await checkRateLimit('/api/manage/change-request', 'test-ip-change')
    expect(Number.isFinite(r.limit)).toBe(true)
    expect(r.limit).toBe(5)
  })
})

describe('CSRF on /api/manage/*', () => {
  function post(pathname: string, origin: string | null): NextRequest {
    const headers: Record<string, string> = { host: 'prestigo.cz', 'content-type': 'application/json' }
    if (origin) headers.origin = origin
    return new NextRequest(`https://prestigo.cz${pathname}`, { method: 'POST', headers, body: '{}' })
  }

  it.each(['/api/manage/cancel', '/api/manage/change-request'])(
    '%s: cross-site Origin is refused',
    async (path) => {
      const { middleware } = await import('@/middleware')
      const res = await middleware(post(path, 'https://evil.example'))
      expect(res.status).toBe(403)
    },
  )

  it.each(['/api/manage/cancel', '/api/manage/change-request'])(
    '%s: a missing Origin is refused (strict list)',
    async (path) => {
      const { middleware } = await import('@/middleware')
      const res = await middleware(post(path, null))
      expect(res.status).toBe(403)
    },
  )

  it.each(['/api/manage/cancel', '/api/manage/change-request'])(
    '%s: the site origin passes the Origin check',
    async (path) => {
      const { middleware } = await import('@/middleware')
      const res = await middleware(post(path, 'https://prestigo.cz'))
      expect(res.status).not.toBe(403)
    },
  )
})
