import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'

// Phase 94 plan 94-10 (UI-SPEC "Freshness", "Loading and error"): tab refresh island, loading placeholders, error view.

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  pathname: '/driver/rides',
  session: null as null | { driverId: string; sessionId: string },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: h.refresh }),
  usePathname: () => h.pathname,
  redirect: vi.fn(),
}))
vi.mock('@/lib/driver-cabinet/auth', () => ({ getDriverSession: async () => h.session }))
vi.mock('@/lib/driver-cabinet/offers', () => ({ countLiveOffers: async () => 0 }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => ({}) }))
vi.mock('@/components/driver/CabinetRefresh', () => ({
  default: () => <span data-testid="cabinet-refresh" />,
}))

import TabLoading from '@/components/driver/TabLoading'
import TabsError from '@/app/(internal)/driver/(cabinet)/(tabs)/error'
import TabsLoading from '@/app/(internal)/driver/(cabinet)/(tabs)/loading'
import TabsLayout from '@/app/(internal)/driver/(cabinet)/(tabs)/layout'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  h.refresh.mockClear()
  h.pathname = '/driver/rides'
  h.session = null
  setVisibility('visible')
})

describe('CabinetRefresh (UI-SPEC Freshness)', () => {
  // The module is mocked above for the layout test; the real one is imported through the actual path here.
  async function real() {
    return (await vi.importActual<typeof import('@/components/driver/CabinetRefresh')>('@/components/driver/CabinetRefresh'))
      .default
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing visible', async () => {
    const Real = await real()
    const { container } = render(<Real />)
    expect(container).toBeEmptyDOMElement()
  })

  it('refreshes when the page becomes visible, but not when it becomes hidden', async () => {
    const Real = await real()
    render(<Real />)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(h.refresh).not.toHaveBeenCalled()
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(h.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the phone comes back online', async () => {
    const Real = await real()
    render(<Real />)
    window.dispatchEvent(new Event('online'))
    expect(h.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes every 30 s while visible and skips ticks while hidden', async () => {
    vi.useFakeTimers()
    const Real = await real()
    render(<Real />)
    vi.advanceTimersByTime(29_999)
    expect(h.refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(h.refresh).toHaveBeenCalledTimes(1)
    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)
    expect(h.refresh).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    vi.advanceTimersByTime(30_000)
    expect(h.refresh).toHaveBeenCalledTimes(2)
  })

  it('removes its listeners and the interval on unmount', async () => {
    vi.useFakeTimers()
    const Real = await real()
    const view = render(<Real />)
    view.unmount()
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    vi.advanceTimersByTime(120_000)
    expect(h.refresh).not.toHaveBeenCalled()
  })
})

describe('TabLoading (UI-SPEC Loading)', () => {
  const cases: Array<[string, string, string]> = [
    ['/driver/rides', 'Rides', 'Loading rides'],
    ['/driver/offers', 'Offers', 'Loading offers'],
    ['/driver/you', 'You', 'Loading profile'],
  ]

  it.each(cases)('shows the %s title and a busy region named "%s"', (path, title, label) => {
    h.pathname = path
    render(<TabLoading />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    const region = screen.getByRole('region', { name: label })
    expect(region).toHaveAttribute('aria-busy', 'true')
  })

  it('renders three static 80px placeholder blocks and no animation', () => {
    const { container } = render(<TabLoading />)
    const blocks = container.querySelectorAll('[data-placeholder]')
    expect(blocks).toHaveLength(3)
    for (const block of Array.from(blocks)) {
      expect((block as HTMLElement).style.height).toBe('80px')
      expect(block.getAttribute('aria-hidden')).toBe('true')
    }
    expect(container.innerHTML).not.toMatch(/animation|animate|pulse|shimmer|spin/i)
  })

  it('the (tabs) loading file renders it', () => {
    h.pathname = '/driver/offers'
    render(<TabsLoading />)
    expect(screen.getByRole('region', { name: 'Loading offers' })).toBeInTheDocument()
  })
})

describe('(tabs) error view (UI-SPEC Loading and error)', () => {
  it('shows the fixed copy, never the error text, and retries once through reset', () => {
    const reset = vi.fn()
    const error = Object.assign(new Error('relation "driver_assignments" does not exist'), { digest: 'abc123' })
    const { container } = render(<TabsError error={error} reset={reset} />)
    expect(screen.getByText('Could not load this page')).toBeInTheDocument()
    expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument()
    expect(container.textContent).not.toContain('driver_assignments')
    expect(container.textContent).not.toContain('abc123')

    const button = screen.getByRole('button', { name: 'Try again' })
    expect(button).toHaveAttribute('data-driver-focus')
    fireEvent.click(button)
    expect(reset).toHaveBeenCalledTimes(1)
  })
})

describe('(tabs) layout', () => {
  it('mounts CabinetRefresh exactly once next to the children', async () => {
    cleanup()
    render(await TabsLayout({ children: <p>page body</p> }))
    expect(screen.getAllByTestId('cabinet-refresh')).toHaveLength(1)
    expect(within(document.body).getByText('page body')).toBeInTheDocument()
  })
})
