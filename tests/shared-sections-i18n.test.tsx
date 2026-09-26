/**
 * 75-13: shared homepage/booking components render catalog text in every
 * locale instead of hardcoded English, and their internal links keep the
 * locale prefix (i18n Link / getPathname).
 *
 * Task 1 (tracer): BookingSection only — proves the pattern with a real en
 * (unchanged output) + ru (no EN leak) render pair before Task 2 repeats it
 * across the remaining shared components.
 * Task 2: HourlyBookingSection, Routes/RoutesBento/RoutesMap, StepStub (+
 * the hi Booking.entryBar.flightNumberAriaLabel fix — no render needed).
 * BlogCard has its own migrated test file (tests/BlogCard.test.tsx).
 * Task 3: not-found, /book loading aria, blog post CTA, author page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithIntl, screen } from './helpers/renderWithIntl'
import ruMessages from '@/messages/ru.json'
import arMessages from '@/messages/ar.json'
import hiMessages from '@/messages/hi.json'
import zhMessages from '@/messages/zh.json'
import enMessages from '@/messages/en.json'
import type { AbstractIntlMessages } from 'next-intl'

const ruMessagesTyped = ruMessages as unknown as AbstractIntlMessages
const arMessagesTyped = arMessages as unknown as AbstractIntlMessages
const hiMessagesTyped = hiMessages as unknown as AbstractIntlMessages
const zhMessagesTyped = zhMessages as unknown as AbstractIntlMessages

// BookingWidget pulls in Stripe/Places/etc — mocked out, this suite only
// proves the surrounding text block, not the widget itself.
vi.mock('@/components/booking/BookingWidget', () => ({
  default: () => null,
}))

// Never loaded in tests (Wave 0 mock pattern, reused from tests/RouteMap.test.tsx) —
// RoutesMap's effect chain ends in a .catch() that swallows the resulting
// "google is not defined" throw, so the static aria-label attribute (set in
// JSX, not inside the effect) is all this suite needs to assert on.
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockResolvedValue(undefined),
}))

import BookingSection from '@/components/BookingSection'
import HourlyBookingSection from '@/components/HourlyBookingSection'
import Routes from '@/components/Routes'
import RoutesBento, { type BentoTile } from '@/components/RoutesBento'
import RoutesMap, { type MapCity } from '@/components/RoutesMap'
import StepStub from '@/components/booking/steps/StepStub'

beforeEach(() => {
  // jsdom does not implement IntersectionObserver — Routes.tsx renders
  // <Reveal> wrappers that construct one on mount.
  class MockIntersectionObserver {
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

const EN_STRINGS = [
  'Instant booking',
  'Book your',
  'chauffeur now.',
  'Fixed price. Instant confirmation. Your driver tracks your flight automatically.',
  'Flight tracking included',
  'Fixed price — no surprises',
  'Free cancellation up to 1 hour',
  'Meet & greet at Arrivals',
]

describe('BookingSection (75-13 Task 1 tracer)', () => {
  it('renders the label, headline, subhead and all 4 trust bullets in en (unchanged output)', () => {
    renderWithIntl(<BookingSection />)
    expect(screen.getByText('Instant booking')).toBeTruthy()
    expect(screen.getByText('Book your')).toBeTruthy()
    expect(screen.getByText('chauffeur now.')).toBeTruthy()
    expect(
      screen.getByText(
        'Fixed price. Instant confirmation. Your driver tracks your flight automatically.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Flight tracking included')).toBeTruthy()
    expect(screen.getByText('Fixed price — no surprises')).toBeTruthy()
    expect(screen.getByText('Free cancellation up to 1 hour')).toBeTruthy()
    expect(screen.getByText('Meet & greet at Arrivals')).toBeTruthy()
  })

  it('renders the ru headline and none of the EN strings under the ru catalog', () => {
    const { container } = renderWithIntl(<BookingSection />, {
      locale: 'ru',
      messages: ruMessagesTyped,
    })
    const html = container.innerHTML
    for (const s of EN_STRINGS) {
      expect(html).not.toContain(s)
    }
    const ruSection = (ruMessagesTyped as unknown as { BookingSection: { headlineLine1: string } })
      .BookingSection
    expect(html).toContain(ruSection.headlineLine1)
  })
})

// ---------------------------------------------------------------------------
// Task 2
// ---------------------------------------------------------------------------

const HOURLY_EN_STRINGS = [
  'Hourly booking',
  'Hire a car with',
  'chauffeur by the hour.',
  'Minimum 2 hours. One chauffeur, one vehicle — yours for as long as you need, across Prague and beyond.',
  'Minimum 2-hour booking',
  'Multiple stops included',
  'Chauffeur waits throughout',
  'Fixed hourly rate — no surprises',
]

describe('HourlyBookingSection (75-13 Task 2)', () => {
  it('renders en unchanged', () => {
    renderWithIntl(<HourlyBookingSection />)
    for (const s of HOURLY_EN_STRINGS) {
      expect(screen.getByText(s)).toBeTruthy()
    }
  })

  it('contains no EN string under ru', () => {
    const { container } = renderWithIntl(<HourlyBookingSection />, {
      locale: 'ru',
      messages: ruMessagesTyped,
    })
    const html = container.innerHTML
    for (const s of HOURLY_EN_STRINGS) {
      expect(html).not.toContain(s)
    }
  })
})

const ROUTES_EN_STRINGS = [
  'Popular routes',
  'Central Europe.',
  'Connected.',
  'Point to point or multi-city. We connect the key destinations of Central',
  'Explore routes',
  'All fares include tolls, vignettes, waiting time and meet',
]

describe('Routes (75-13 Task 2)', () => {
  it('renders en unchanged and the "Explore routes" link keeps /routes unprefixed', () => {
    const { container } = renderWithIntl(<Routes routes={[]} />)
    for (const s of ROUTES_EN_STRINGS) {
      expect(container.innerHTML).toContain(s)
    }
    const link = screen.getByRole('link', { name: 'Explore routes' })
    expect(link.getAttribute('href')).toBe('/routes')
  })

  it('contains no EN string under ru and the "Explore routes" link is /ru/routes', () => {
    const { container } = renderWithIntl(<Routes routes={[]} />, {
      locale: 'ru',
      messages: ruMessagesTyped,
    })
    const html = container.innerHTML
    for (const s of ROUTES_EN_STRINGS) {
      expect(html).not.toContain(s)
    }
    const ruLabel = (ruMessagesTyped as unknown as { RoutesSection: { exploreRoutes: string } })
      .RoutesSection.exploreRoutes
    const link = screen.getByRole('link', { name: ruLabel })
    expect(link.getAttribute('href')).toBe('/ru/routes')
  })
})

const TILES: BentoTile[] = [{ span: 'col-span-1' }]
const POOL = [{ slug: 'prague-vienna', to: 'Vienna', time: '3h 30m', price: 154 }]

describe('RoutesBento (75-13 Task 2)', () => {
  it('renders "View route" in en with an unprefixed /routes/{slug} link', () => {
    renderWithIntl(<RoutesBento pool={POOL} tiles={TILES} />)
    expect(screen.getByText('View route')).toBeTruthy()
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/routes/prague-vienna')
  })

  it('renders the ru "View route" label with a /ru/routes/{slug} link', () => {
    const { container } = renderWithIntl(<RoutesBento pool={POOL} tiles={TILES} />, {
      locale: 'ru',
      messages: ruMessagesTyped,
    })
    expect(container.innerHTML).not.toContain('View route')
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/ru/routes/prague-vienna')
    const ruViewRoute = (ruMessagesTyped as unknown as { RoutesSection: { viewRoute: string } })
      .RoutesSection.viewRoute
    expect(container.innerHTML).toContain(ruViewRoute)
  })
})

const HUB: MapCity = { name: 'Prague', lat: 50.0755, lng: 14.4378 }
const CITIES: MapCity[] = [{ name: 'Vienna', lat: 48.2082, lng: 16.3738, time: '3h 30m' }]

describe('RoutesMap (75-13 Task 2)', () => {
  it('renders the EN aria-label unchanged', () => {
    renderWithIntl(<RoutesMap hub={HUB} cities={CITIES} />)
    expect(
      screen.getByRole('img', {
        name: 'Map of Prestigo chauffeur routes radiating from Prague across Central Europe',
      })
    ).toBeTruthy()
  })

  it('renders the ru aria-label under the ru catalog', () => {
    renderWithIntl(<RoutesMap hub={HUB} cities={CITIES} />, {
      locale: 'ru',
      messages: ruMessagesTyped,
    })
    const ruAria = (ruMessagesTyped as unknown as { RoutesSection: { mapAriaLabel: string } })
      .RoutesSection.mapAriaLabel
    expect(screen.getByRole('img', { name: ruAria })).toBeTruthy()
  })
})

describe('StepStub (75-13 Task 2)', () => {
  it('renders "Step 3 of 6" in en', () => {
    renderWithIntl(<StepStub step={3} />)
    expect(screen.getByText('Step 3 of 6')).toBeTruthy()
  })

  it.each([
    ['ru', ruMessagesTyped],
    ['ar', arMessagesTyped],
    ['hi', hiMessagesTyped],
    ['zh', zhMessagesTyped],
  ] as const)('renders the ICU step-of-6 string (not the EN string) under %s', (locale, messages) => {
    const { container } = renderWithIntl(<StepStub step={3} />, { locale, messages })
    expect(container.innerHTML).not.toContain('Step 3 of 6')
    const catalog = messages as unknown as { StepStub: { stepOfSix: string } }
    const expected = catalog.StepStub.stepOfSix.replace('{step}', '3')
    expect(container.innerHTML).toContain(expected)
  })
})

describe('messages/hi.json Booking.entryBar.flightNumberAriaLabel (75-13 Task 2 D-07/D-08 fix)', () => {
  it('is Hindi, not byte-identical to EN', () => {
    const en = (enMessages as unknown as { Booking: { entryBar: { flightNumberAriaLabel: string } } })
      .Booking.entryBar.flightNumberAriaLabel
    const hi = (hiMessagesTyped as unknown as { Booking: { entryBar: { flightNumberAriaLabel: string } } })
      .Booking.entryBar.flightNumberAriaLabel
    expect(hi).not.toBe(en)
  })
})
