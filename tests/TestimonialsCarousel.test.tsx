import { act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithIntl as render, screen, fireEvent } from '@/tests/helpers/renderWithIntl'
import TestimonialsCarousel from '@/components/TestimonialsCarousel'
import { HARDCODED_TESTIMONIALS, type Review } from '@/lib/google-reviews'
import type { AbstractIntlMessages } from 'next-intl'
import enMessages from '@/messages/en.json'
import ruMessages from '@/messages/ru.json'
import esMessages from '@/messages/es.json'
import frMessages from '@/messages/fr.json'
import arMessages from '@/messages/ar.json'
import hiMessages from '@/messages/hi.json'
import zhMessages from '@/messages/zh.json'

const googleReview = (overrides: Partial<Extract<Review, { source: 'google' }>> = {}): Review => ({
  source: 'google',
  author: 'Alice',
  rating: 5,
  text: 'Excellent service end to end.',
  time: 1700000000,
  relativeTime: '3 months ago',
  ...overrides,
})

const hardcodedReview = (overrides: Partial<Extract<Review, { source: 'hardcoded' }>> = {}): Review => ({
  source: 'hardcoded',
  // not a catalog id -> the component falls back to the raw EN fields
  id: 'testFixture',
  quote: 'Reliable, discreet, on time.',
  name: 'Michael H.',
  role: 'CFO · Frankfurt',
  sourceLabel: 'Verified booking · Airport transfer',
  ...overrides,
})

const matchMediaMock = (matches: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: matchMediaMock(false) })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GRVW-06: auto-advance every 5 seconds', () => {
  it('shows reviews[0] on mount and reviews[1] after 5000ms', () => {
    const reviews = [googleReview({ text: 'first slide quote' }), hardcodedReview({ quote: 'second slide quote' })]
    render(<TestimonialsCarousel reviews={reviews} />)
    expect(screen.getByText(/first slide quote/)).toBeTruthy()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText(/second slide quote/)).toBeTruthy()
  })

  it('wraps from the last slide back to index 0', () => {
    const reviews = [googleReview({ text: 'first slide quote' }), hardcodedReview({ quote: 'second slide quote' })]
    render(<TestimonialsCarousel reviews={reviews} />)
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByText(/first slide quote/)).toBeTruthy()
  })

  it('respects custom intervalMs prop', () => {
    const reviews = [googleReview({ text: 'first slide quote' }), hardcodedReview({ quote: 'second slide quote' })]
    render(<TestimonialsCarousel reviews={reviews} intervalMs={2000} />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByText(/second slide quote/)).toBeTruthy()
  })
})

describe('GRVW-07: dot indicators', () => {
  it('renders one dot button per review', () => {
    const reviews = [googleReview(), hardcodedReview(), googleReview({ text: 'third review', time: 1700000001 })]
    render(<TestimonialsCarousel reviews={reviews} />)
    expect(screen.getAllByRole('button', { name: /go to slide/i }).length).toBe(3)
  })

  it('marks the active dot with aria-current="true"', () => {
    const reviews = [googleReview(), hardcodedReview()]
    render(<TestimonialsCarousel reviews={reviews} />)
    const dots = screen.getAllByRole('button', { name: /go to slide/i })
    expect(dots[0].getAttribute('aria-current')).toBe('true')
    expect(dots[1].getAttribute('aria-current')).toBe('false')
    act(() => vi.advanceTimersByTime(5000))
    expect(dots[1].getAttribute('aria-current')).toBe('true')
  })

  it('clicking a dot jumps to that index and resets timer', () => {
    const reviews = [
      googleReview({ text: 'slide 0' }),
      hardcodedReview({ quote: 'slide 1' }),
      googleReview({ text: 'slide 2', time: 1700000002 }),
    ]
    render(<TestimonialsCarousel reviews={reviews} />)
    const dots = screen.getAllByRole('button', { name: /go to slide/i })
    fireEvent.click(dots[2])
    expect(screen.getByText(/slide 2/)).toBeTruthy()
    act(() => vi.advanceTimersByTime(4999))
    expect(screen.getByText(/slide 2/)).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText(/slide 0/)).toBeTruthy()
  })
})

describe('GRVW-08 + GRVW-09: attribution rendering per source', () => {
  it('renders a Google Review badge with star count for google-sourced cards', () => {
    const reviews = [googleReview({ rating: 4 })]
    render(<TestimonialsCarousel reviews={reviews} />)
    expect(screen.getByText(/Google Review/i)).toBeTruthy()
    expect(screen.queryAllByTestId('star-filled').length).toBe(4)
  })

  it('renders the hardcoded sourceLabel verbatim for hardcoded cards', () => {
    const reviews = [hardcodedReview({ sourceLabel: 'Verified booking · Intercity route' })]
    render(<TestimonialsCarousel reviews={reviews} />)
    expect(screen.getByText('Verified booking · Intercity route')).toBeTruthy()
    expect(screen.queryByText(/Google Review/i)).toBeNull()
    expect(screen.queryAllByTestId('star-filled').length).toBe(0)
  })
})

describe('GRVW-10: graceful fallback edge cases', () => {
  it('returns null when reviews is an empty array', () => {
    const { container } = render(<TestimonialsCarousel reviews={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a single card without dots when reviews length is 1', () => {
    const reviews = [hardcodedReview()]
    render(<TestimonialsCarousel reviews={reviews} />)
    expect(screen.getByText(/Reliable, discreet, on time/)).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: /go to slide/i }).length).toBe(0)
  })

  it('does NOT advance when reviews length is 1', () => {
    const reviews = [hardcodedReview({ quote: 'only quote here' })]
    render(<TestimonialsCarousel reviews={reviews} />)
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByText(/only quote here/)).toBeTruthy()
  })
})

describe('GRVW-11: accessibility — aria, keyboard, reduced-motion', () => {
  it('has aria-roledescription="carousel" on the root and aria-live="polite" on the slide region', () => {
    const reviews = [googleReview(), hardcodedReview()]
    const { container } = render(<TestimonialsCarousel reviews={reviews} />)
    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('aria-roledescription')).toBe('carousel')
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeTruthy()
  })

  it('ArrowRight key on carousel root advances; ArrowLeft moves back', () => {
    const reviews = [
      googleReview({ text: 'slide 0 text' }),
      hardcodedReview({ quote: 'slide 1 text' }),
      googleReview({ text: 'slide 2 text', time: 1700000003 }),
    ]
    const { container } = render(<TestimonialsCarousel reviews={reviews} />)
    const root = container.firstChild as HTMLElement
    root.focus()
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    expect(screen.getByText(/slide 1 text/)).toBeTruthy()
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    expect(screen.getByText(/slide 0 text/)).toBeTruthy()
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    expect(screen.getByText(/slide 2 text/)).toBeTruthy()
  })

  it('does NOT start the auto-advance interval when prefers-reduced-motion is reduce', () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: matchMediaMock(true) })
    const reviews = [googleReview({ text: 'motion check slide 0' }), hardcodedReview({ quote: 'motion check slide 1' })]
    render(<TestimonialsCarousel reviews={reviews} />)
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByText(/motion check slide 0/)).toBeTruthy()
    const dots = screen.getAllByRole('button', { name: /go to slide/i })
    expect(dots.length).toBe(2)
  })
})

describe('GRVW-06 cleanup: timer cleared on unmount', () => {
  it('does not leak intervals after unmount', () => {
    const reviews = [googleReview(), hardcodedReview()]
    const { unmount } = render(<TestimonialsCarousel reviews={reviews} />)
    unmount()
    act(() => vi.advanceTimersByTime(10000))
    expect(vi.getTimerCount()).toBe(0)
  })
})

// ─── 75-28 (GAP-4d): hardcoded testimonials render in the page locale ────────

type HardcodedEntry = { quote: string; role: string; sourceLabel: string }
const CATALOGS: Record<string, AbstractIntlMessages> = {
  en: enMessages as unknown as AbstractIntlMessages,
  ru: ruMessages as unknown as AbstractIntlMessages,
  es: esMessages as unknown as AbstractIntlMessages,
  fr: frMessages as unknown as AbstractIntlMessages,
  ar: arMessages as unknown as AbstractIntlMessages,
  hi: hiMessages as unknown as AbstractIntlMessages,
  zh: zhMessages as unknown as AbstractIntlMessages,
}
function hardcodedCatalog(locale: string): Record<string, HardcodedEntry> {
  return (CATALOGS[locale] as unknown as { Testimonials: { hardcoded: Record<string, HardcodedEntry> } })
    .Testimonials.hardcoded
}

describe('75-28: hardcoded testimonials are localized via Testimonials.hardcoded.<id>', () => {
  it('every HARDCODED_TESTIMONIALS entry has a unique stable id present in the EN catalog with the verbatim EN text', () => {
    const ids = HARDCODED_TESTIMONIALS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    const en = hardcodedCatalog('en')
    for (const t of HARDCODED_TESTIMONIALS) {
      expect(en[t.id], t.id).toEqual({ quote: t.quote, role: t.role, sourceLabel: t.sourceLabel })
    }
  })

  it('renders the EN text byte-identically under en', () => {
    const michael = HARDCODED_TESTIMONIALS[0]
    render(<TestimonialsCarousel reviews={[michael]} />)
    expect(screen.getByText(`\u201c${michael.quote}\u201d`)).toBeTruthy()
    expect(screen.getByText(michael.role)).toBeTruthy()
    expect(screen.getByText(michael.sourceLabel)).toBeTruthy()
    expect(screen.getByText(michael.name)).toBeTruthy()
  })

  for (const locale of ['ru', 'es', 'fr', 'ar', 'hi', 'zh']) {
    it(`renders the ${locale} quote, role and source label (name unchanged, no EN leak)`, () => {
      const cat = hardcodedCatalog(locale)
      for (const t of HARDCODED_TESTIMONIALS) {
        const { unmount, container } = render(<TestimonialsCarousel reviews={[t]} />, {
          locale,
          messages: CATALOGS[locale],
        })
        const entry = cat[t.id]
        expect(entry, `${locale}:${t.id}`).toBeTruthy()
        expect(entry.quote).not.toBe(t.quote)
        expect(entry.role).not.toBe(t.role)
        expect(entry.sourceLabel).not.toBe(t.sourceLabel)
        expect(screen.getByText(`\u201c${entry.quote}\u201d`)).toBeTruthy()
        expect(screen.getByText(entry.role)).toBeTruthy()
        expect(screen.getByText(entry.sourceLabel)).toBeTruthy()
        expect(screen.getByText(t.name)).toBeTruthy()
        expect(container.innerHTML).not.toContain(t.quote)
        unmount()
      }
    })
  }

  it('renders a Google review text and relative time unchanged under ru', () => {
    const g = googleReview({ text: 'Excellent service end to end.', relativeTime: '3 months ago' })
    render(<TestimonialsCarousel reviews={[g]} />, { locale: 'ru', messages: CATALOGS.ru })
    expect(screen.getByText('\u201cExcellent service end to end.\u201d')).toBeTruthy()
    expect(screen.getByText('3 months ago')).toBeTruthy()
  })

  it('falls back to the raw fields for a hardcoded review whose id is not in the catalog', () => {
    render(<TestimonialsCarousel reviews={[hardcodedReview()]} />, { locale: 'ru', messages: CATALOGS.ru })
    expect(screen.getByText('\u201cReliable, discreet, on time.\u201d')).toBeTruthy()
  })
})
