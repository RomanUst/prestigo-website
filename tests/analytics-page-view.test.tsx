/**
 * analytics-page-view.test.tsx — Phase 75 Plan 04, Task 1
 *
 * Covers VER-01 (D-10): AnalyticsPageView issues gtag('set', { site_locale })
 * BEFORE the page_view event, on both the gtag branch and the dataLayer
 * fallback branch, and includes site_locale in the page_view payload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import AnalyticsPageView from '@/components/AnalyticsPageView'

// window.gtag is already declared globally elsewhere (e.g. PriceSummary.tsx);
// window.dataLayer is not, so declare it here for the fallback-branch test.
declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

const { mockUsePathname, mockUseSearchParams } = vi.hoisted(() => {
  return {
    mockUsePathname: vi.fn(),
    mockUseSearchParams: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
  useSearchParams: mockUseSearchParams,
}))

describe('AnalyticsPageView', () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue({ toString: () => '' })
    delete window.gtag
    delete window.dataLayer
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('calls gtag("set", { site_locale }) before gtag("event", "page_view", ...) and includes it in the payload', () => {
    mockUsePathname.mockReturnValue('/ru/book')
    const calls: unknown[][] = []
    window.gtag = (...args: unknown[]) => {
      calls.push(args)
    }

    render(<AnalyticsPageView />)

    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls[0]).toEqual(['set', { site_locale: 'ru' }])
    expect(calls[1][0]).toBe('event')
    expect(calls[1][1]).toBe('page_view')
    expect((calls[1][2] as Record<string, unknown>).site_locale).toBe('ru')
  })

  it('resolves site_locale to en for the unprefixed root', () => {
    mockUsePathname.mockReturnValue('/')
    const calls: unknown[][] = []
    window.gtag = (...args: unknown[]) => {
      calls.push(args)
    }

    render(<AnalyticsPageView />)

    expect(calls[0]).toEqual(['set', { site_locale: 'en' }])
    expect((calls[1][2] as Record<string, unknown>).site_locale).toBe('en')
  })

  it('pushes the set command before the page_view command on the dataLayer fallback branch', () => {
    mockUsePathname.mockReturnValue('/zh/routes/prague-vienna')
    window.dataLayer = []

    render(<AnalyticsPageView />)

    const dl = window.dataLayer as unknown[]
    expect(dl[0]).toEqual(['set', { site_locale: 'zh' }])
    expect((dl[1] as unknown[])[0]).toBe('event')
    expect((dl[1] as unknown[])[1]).toBe('page_view')
    expect(((dl[1] as unknown[])[2] as Record<string, unknown>).site_locale).toBe('zh')
  })

  it('sends nothing on /admin paths', () => {
    mockUsePathname.mockReturnValue('/admin/bookings')
    const calls: unknown[][] = []
    window.gtag = (...args: unknown[]) => {
      calls.push(args)
    }

    render(<AnalyticsPageView />)

    expect(calls.length).toBe(0)
  })
})
