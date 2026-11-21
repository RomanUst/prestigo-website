/**
 * Phase 93, plan 93-12 (TRIP-04; D-09; UI-SPEC 3.9) - the mobile sticky booking bar and the chat launcher rule on tour pages.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithIntl } from './helpers/renderWithIntl'

const { pathnameRef } = vi.hoisted(() => ({ pathnameRef: { current: '/' } }))

vi.mock('@/components/MetaPixel', () => ({ trackMetaEvent: vi.fn() }))

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    usePathname: () => pathnameRef.current,
    useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  }
})

import StickyBookBar from '@/components/tours/StickyBookBar'
import ChatLauncher from '@/components/ChatLauncher'

type IOCallback = (entries: Array<Pick<IntersectionObserverEntry, 'isIntersecting'>>) => void
let ioCallback: IOCallback | null = null
const observe = vi.fn()
const disconnect = vi.fn()

function reportBoxVisible(isIntersecting: boolean) {
  act(() => {
    ioCallback?.([{ isIntersecting }])
  })
}

function renderBar(props: Partial<React.ComponentProps<typeof StickyBookBar>> = {}) {
  const target = document.createElement('section')
  document.body.appendChild(target)
  const targetRef = { current: target }
  const onBook = vi.fn()
  const focusFirstMissing = vi.fn()
  renderWithIntl(
    <StickyBookBar
      targetRef={targetRef}
      fromEur={410}
      totalEur={null}
      complete={false}
      onBook={onBook}
      focusFirstMissing={focusFirstMissing}
      {...props}
    />
  )
  return { target, onBook, focusFirstMissing }
}

const bar = () => screen.getByTestId('tour-sticky-bar')
const bookButton = () => bar().querySelector('button') as HTMLButtonElement

beforeEach(() => {
  ioCallback = null
  vi.mocked(window.HTMLElement.prototype.scrollIntoView).mockClear()
  observe.mockClear()
  disconnect.mockClear()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IOCallback) {
        ioCallback = cb
      }
      observe = observe
      disconnect = disconnect
      unobserve = vi.fn()
      takeRecords = () => []
    }
  )
  pathnameRef.current = '/'
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('StickyBookBar', () => {
  it('is hidden (aria-hidden, unfocusable button) while the box is visible, shown when it is not', () => {
    const { target } = renderBar()
    expect(observe).toHaveBeenCalledWith(target)
    reportBoxVisible(true)
    expect(bar().getAttribute('aria-hidden')).toBe('true')
    expect(bookButton().getAttribute('tabindex')).toBe('-1')

    reportBoxVisible(false)
    expect(bar().getAttribute('aria-hidden')).toBe('false')
    expect(bookButton().hasAttribute('tabindex')).toBe(false)
  })

  it('starts hidden before the observer reports, so it never flashes in', () => {
    renderBar()
    expect(bar().getAttribute('aria-hidden')).toBe('true')
  })

  it('shows From + the lowest price + per car, or Total once a car is chosen', () => {
    renderBar()
    reportBoxVisible(false)
    expect(bar().textContent).toContain('From')
    expect(bar().textContent).toContain('€410')
    expect(bar().textContent).toContain('per car')
    expect(bar().textContent).not.toContain('Total')
    cleanup()

    renderBar({ totalEur: 575, complete: true })
    reportBoxVisible(false)
    expect(bar().textContent).toContain('Total')
    expect(bar().textContent).toContain('€575')
    expect(bar().textContent).not.toContain('From')
  })

  it('tapping with a complete box calls onBook', () => {
    const { onBook, focusFirstMissing, target } = renderBar({ complete: true, totalEur: 520 })
    reportBoxVisible(false)
    fireEvent.click(bookButton())
    expect(onBook).toHaveBeenCalledTimes(1)
    expect(focusFirstMissing).not.toHaveBeenCalled()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('tapping with an incomplete box scrolls the box into view smoothly and focuses the first missing field', () => {
    const { onBook, focusFirstMissing, target } = renderBar()
    reportBoxVisible(false)
    fireEvent.click(bookButton())
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(focusFirstMissing).toHaveBeenCalledTimes(1)
    expect(onBook).not.toHaveBeenCalled()
  })

  it('scrolls instantly under prefers-reduced-motion', () => {
    const mm = window.matchMedia
    window.matchMedia = vi.fn((q: string) => ({ matches: q.includes('prefers-reduced-motion'), media: q }) as MediaQueryList)
    try {
      const { target } = renderBar()
      reportBoxVisible(false)
      fireEvent.click(bookButton())
      expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    } finally {
      window.matchMedia = mm
    }
  })

  it('without a focus callback an incomplete tap falls back to onBook (which focuses the first missing field)', () => {
    const { onBook } = renderBar({ focusFirstMissing: undefined })
    reportBoxVisible(false)
    fireEvent.click(bookButton())
    expect(onBook).toHaveBeenCalledTimes(1)
  })

  it('is lg:hidden, fixed under the Nav (z-40), 72px tall plus the safe area, with a reduced-motion-safe fade', () => {
    renderBar()
    expect(bar().className).toMatch(/\blg:hidden\b/)
    expect(bar().className).toMatch(/\bz-40\b/)
    expect(bar().className).toMatch(/\bmotion-reduce:transition-none\b/)
    expect(bar().className).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(bar().className).toContain('min-h-[calc(72px+env(safe-area-inset-bottom))]')
  })

  it('disconnects its observer on unmount', () => {
    renderBar()
    cleanup()
    expect(disconnect).toHaveBeenCalled()
  })
})

describe('ChatLauncher on tour pages', () => {
  const CONSENT = JSON.stringify({ analytics: false, marketing: false })
  const container = () => screen.getByRole('button', { name: /chat/i }).closest('.fixed') as HTMLElement
  const card = () => screen.queryByRole('region', { name: 'Message from Prestigo' })

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it.each(['/services/dresden-day-trip', '/ru/services/dresden-day-trip', '/services/vienna-day-trip/'])(
    'lifts the launcher above the bar and shows no greeting on %s',
    (path) => {
      pathnameRef.current = path
      localStorage.setItem('prestigo_consent_v2', CONSENT)
      renderWithIntl(<ChatLauncher />)
      expect(container().className).toMatch(/\bbottom-24\b/)
      expect(container().className).not.toMatch(/\bbottom-4\b/)
      expect(card()).toBeNull()
    }
  )

  it('stays on the lg boundary: lifted below the sticky bar breakpoint, normal offset from lg', () => {
    pathnameRef.current = '/services/dresden-day-trip'
    renderWithIntl(<ChatLauncher />)
    expect(container().className).toMatch(/\bmd:bottom-24\b/)
    expect(container().className).toMatch(/\blg:bottom-6\b/)
  })

  it.each(['/services/day-trips-from-prague', '/services/airport-transfer', '/routes/prague-vienna', '/services/a/b-day-trip'])(
    'is unchanged on %s',
    (path) => {
      pathnameRef.current = path
      localStorage.setItem('prestigo_consent_v2', CONSENT)
      renderWithIntl(<ChatLauncher />)
      expect(container().className).toMatch(/\bbottom-4\b/)
      expect(container().className).toMatch(/\bmd:bottom-6\b/)
      expect(container().className).not.toMatch(/\bbottom-24\b/)
      expect(card()).toBeTruthy()
    }
  )
})

