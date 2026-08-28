import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// DISP-04/D-05 guard: the two KPI counters (TODAY count, THIS WEEK revenue)
// in app/admin/(dashboard)/bookings/page.tsx keep their own independent
// date-scoped /api/admin/bookings fetches (explicit startDate/endDate+limit,
// NO horizon param) and must stay decoupled from BookingsTable's ephemeral
// segmented-control horizon state. Toggling the segment must not trigger any
// additional fetch to either KPI URL pattern, and the rendered KPI values
// must not change.

function isKpiTodayUrl(url: string): boolean {
  // .../api/admin/bookings?startDate=X&endDate=X&limit=1 — the exact-1 limit
  // distinguishes it from BookingsTable's own list fetch (limit=20).
  return url.includes('/api/admin/bookings') && url.endsWith('&limit=1')
}

function isKpiWeekUrl(url: string): boolean {
  // .../api/admin/bookings?startDate=monday&endDate=sunday&limit=100
  return url.includes('/api/admin/bookings') && url.endsWith('&limit=100')
}

describe('BookingsPage — KPI decoupling guard (Phase 65 Plan 04, DISP-04/D-05)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  function stubFetch() {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url !== 'string') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            notification_flags: {},
            dispatch_default_horizon: 'future',
            dispatch_horizon_days: 7,
          }),
        })
      }
      if (isKpiTodayUrl(url)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ total: 5, bookings: [], page: 0, limit: 1 }) })
      }
      if (isKpiWeekUrl(url)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            total: 2,
            bookings: [{ amount_czk: 1000 }, { amount_czk: 2000 }],
            page: 0,
            limit: 100,
          }),
        })
      }
      if (url.includes('/api/admin/bookings')) {
        // BookingsTable's own list fetch (limit=20, carries horizon param)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ bookings: [], total: 0, page: 0, limit: 20 }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('bookings/page.tsx fetches /api/admin/settings on mount and passes defaultHorizon/horizonDays to BookingsTable', async () => {
    const fetchMock = stubFetch()
    const { default: BookingsPage } = await import('@/app/admin/(dashboard)/bookings/page')
    render(<BookingsPage />)

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('/api/admin/settings'))).toBe(true)
    })
    // BookingsTable's list fetch reflects the persisted default (future) once hydrated
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('horizon=future'))).toBe(true)
    })
  })

  it('the two KPI fetches never carry a horizon param', async () => {
    const fetchMock = stubFetch()
    const { default: BookingsPage } = await import('@/app/admin/(dashboard)/bookings/page')
    render(<BookingsPage />)

    await waitFor(() => {
      const kpiCalls = fetchMock.mock.calls.filter(([url]) => typeof url === 'string' && (isKpiTodayUrl(url) || isKpiWeekUrl(url)))
      expect(kpiCalls.length).toBeGreaterThanOrEqual(2)
    })
    const kpiCalls = fetchMock.mock.calls.filter(([url]) => typeof url === 'string' && (isKpiTodayUrl(url) || isKpiWeekUrl(url)))
    kpiCalls.forEach(([url]) => {
      expect((url as string)).not.toContain('horizon=')
    })
  })

  it('toggling the segmented control issues exactly one additional list fetch and ZERO additional KPI fetches; todayCount/weekRevenue stay unchanged', async () => {
    const fetchMock = stubFetch()
    const { default: BookingsPage } = await import('@/app/admin/(dashboard)/bookings/page')
    render(<BookingsPage />)

    // Wait for both KPI values to render
    await waitFor(() => {
      expect(screen.getByText('5')).toBeDefined()
    })
    await waitFor(() => {
      expect(screen.getByText(/^3\s000 CZK$/)).toBeDefined()
    })

    const kpiCallCountBefore = fetchMock.mock.calls.filter(
      ([url]) => typeof url === 'string' && (isKpiTodayUrl(url) || isKpiWeekUrl(url))
    ).length
    expect(kpiCallCountBefore).toBe(2)

    const listCallCountBefore = fetchMock.mock.calls.filter(
      ([url]) => typeof url === 'string' && url.includes('/api/admin/bookings') && !isKpiTodayUrl(url) && !isKpiWeekUrl(url)
    ).length

    // Toggle Future -> Past in BookingsTable
    const pastSegment = await screen.findByRole('button', { name: 'Past' })
    fireEvent.click(pastSegment)

    await waitFor(() => {
      const listCallCountAfter = fetchMock.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/api/admin/bookings') && !isKpiTodayUrl(url) && !isKpiWeekUrl(url)
      ).length
      expect(listCallCountAfter).toBe(listCallCountBefore + 1)
    })

    // KPI call count must stay exactly 2 (no additional KPI fetch fired by the toggle)
    const kpiCallCountAfter = fetchMock.mock.calls.filter(
      ([url]) => typeof url === 'string' && (isKpiTodayUrl(url) || isKpiWeekUrl(url))
    ).length
    expect(kpiCallCountAfter).toBe(2)

    // Rendered KPI values are unchanged
    expect(screen.getByText('5')).toBeDefined()
    expect(screen.getByText(/^3\s000 CZK$/)).toBeDefined()
  })
})
