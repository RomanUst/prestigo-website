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
import esMessages from '@/messages/es.json'
import frMessages from '@/messages/fr.json'
import type { AbstractIntlMessages } from 'next-intl'

const ruMessagesTyped = ruMessages as unknown as AbstractIntlMessages
const arMessagesTyped = arMessages as unknown as AbstractIntlMessages
const hiMessagesTyped = hiMessages as unknown as AbstractIntlMessages
const zhMessagesTyped = zhMessages as unknown as AbstractIntlMessages

const ALL_MESSAGES: Record<string, Record<string, unknown>> = {
  en: enMessages as unknown as Record<string, unknown>,
  ru: ruMessages as unknown as Record<string, unknown>,
  es: esMessages as unknown as Record<string, unknown>,
  fr: frMessages as unknown as Record<string, unknown>,
  ar: arMessages as unknown as Record<string, unknown>,
  hi: hiMessages as unknown as Record<string, unknown>,
  zh: zhMessages as unknown as Record<string, unknown>,
}

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

// Task 3 — not-found / blog CTA / author page all mount the real Nav/Footer;
// mocked out here (same pattern as tests/static-pages-locale.test.tsx) so
// this suite proves only the text this plan owns, not Nav's own auth/router
// wiring or Footer's content.
vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))
// ArticleByline's own next/link href is a real, unrelated locale-dropping
// defect (75-EN-LEAK-AUDIT.md R3, row attributed to 75-13 but out of this
// plan's files_modified/task list — logged to deferred-items.md) — mocked
// out so it doesn't drown out this suite's own CTA assertions.
vi.mock('@/components/ArticleByline', () => ({ default: () => null }))
// The page's dynamic `await import(\`../../../../content/blog/${dir}/${slug}.mdx\`)`
// has no MDX-to-JSX vite transform configured for vitest — mocked to a stub
// component so the CTA-rendering test below exercises the real page
// component and real locale resolution without needing an MDX compiler in
// the test environment. content/blog/ar/<slug>.mdx genuinely exists (a real
// ar translation), so resolveLocalizedMdx resolves 'ar' (not an EN
// fallback) — mock both dirs so the test works regardless.
vi.mock('../content/blog/en/premium-airport-transfer-prague-shortcut.mdx', () => ({
  default: () => null,
}))
vi.mock('../content/blog/ar/premium-airport-transfer-prague-shortcut.mdx', () => ({
  default: () => null,
}))

// blog/[slug]/page.tsx's default export reads its locale from `params`
// (75-28, CR-01 — formerly `await getLocale()`), then
// `await getTranslations({ locale, namespace: 'BlogPost.cta' })` reusing that
// value — mocked directly against the real messages/<locale>.json catalogs
// (same technique as tests/route-page-render.test.tsx's worktree-safe
// next-intl/server mock note), since there is no real Next.js request
// context / AsyncLocalStorage in vitest for the genuine package to resolve
// requestLocale against.
const { mockGetLocale } = vi.hoisted(() => ({ mockGetLocale: vi.fn(async () => 'en') }))
vi.mock('next-intl/server', () => ({
  getLocale: mockGetLocale,
  getTranslations: vi.fn(async (opts: { locale: string; namespace: string } | string) => {
    const { locale, namespace } =
      typeof opts === 'string' ? { locale: 'en', namespace: opts } : opts
    const messages = ALL_MESSAGES[locale] ?? ALL_MESSAGES.en
    const ns = namespace
      .split('.')
      .reduce<Record<string, unknown>>((acc, k) => (acc?.[k] as Record<string, unknown>) ?? {}, messages)
    return (key: string) => {
      const value = key
        .split('.')
        .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], ns)
      if (typeof value !== 'string') {
        throw new Error(`Missing translation for ${namespace}.${key}`)
      }
      return value
    }
  }),
}))

import BookingSection from '@/components/BookingSection'
import HourlyBookingSection from '@/components/HourlyBookingSection'
import Routes from '@/components/Routes'
import RoutesBento, { type BentoTile } from '@/components/RoutesBento'
import RoutesMap, { type MapCity } from '@/components/RoutesMap'
import StepStub from '@/components/booking/steps/StepStub'
import NotFound from '@/app/[locale]/not-found'
import BookLoading from '@/app/[locale]/book/loading'

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

// ---------------------------------------------------------------------------
// Task 3
// ---------------------------------------------------------------------------

describe('NotFound (75-13 Task 3)', () => {
  it('renders en unchanged with unprefixed links', () => {
    renderWithIntl(<NotFound />)
    expect(screen.getByText("This road doesn't")).toBeTruthy()
    expect(screen.getByText('lead anywhere.')).toBeTruthy()
    const bookLink = screen.getByRole('link', { name: 'Book a Transfer' }) as HTMLAnchorElement
    expect(bookLink.getAttribute('href')).toBe('/book')
    const homeLink = screen.getByRole('link', { name: 'Back to Home' }) as HTMLAnchorElement
    expect(homeLink.getAttribute('href')).toBe('/')
  })

  it('renders ru text with /ru/-prefixed links and no EN string', () => {
    const { container } = renderWithIntl(<NotFound />, { locale: 'ru', messages: ruMessagesTyped })
    expect(container.innerHTML).not.toContain("This road doesn't")
    const ruHeading = (ruMessagesTyped as unknown as { NotFound: { headingLine1: string } }).NotFound
      .headingLine1
    expect(screen.getByText(ruHeading)).toBeTruthy()
    const bookLink = screen.getAllByRole('link')[0] as HTMLAnchorElement
    expect(bookLink.getAttribute('href')).toBe('/ru/book')
  })
})

describe('/book loading aria-label (75-13 Task 3)', () => {
  it('is "Loading booking form" in en', () => {
    renderWithIntl(<BookLoading />)
    expect(screen.getByLabelText('Loading booking form')).toBeTruthy()
  })

  it('is localized under ru (not the EN string)', () => {
    const { container } = renderWithIntl(<BookLoading />, { locale: 'ru', messages: ruMessagesTyped })
    expect(container.innerHTML).not.toContain('Loading booking form')
    const ruLabel = (ruMessagesTyped as unknown as { Common: { loadingBooking: string } }).Common
      .loadingBooking
    expect(screen.getByLabelText(ruLabel)).toBeTruthy()
  })
})

describe('Blog post bottom CTA (75-13 Task 3)', () => {
  it('renders ar text and both CTA buttons link to /ar/book and /ar/services/airport-transfer', async () => {
    // 75-28 (CR-01): the page now reads its locale from the route params,
    // not getLocale() — pass it the way Next.js does.
    const { default: BlogArticlePage } = await import('@/app/[locale]/blog/[slug]/page')
    const PageElement = await BlogArticlePage({
      params: Promise.resolve({ slug: 'premium-airport-transfer-prague-shortcut', locale: 'ar' }),
    })
    const { render } = await import('@testing-library/react')
    const { container } = render(PageElement)

    const arCta = (arMessagesTyped as unknown as {
      BlogPost: { cta: { headingLine1: string; primaryButton: string; secondaryButton: string } }
    }).BlogPost.cta
    expect(container.innerHTML).toContain(arCta.headingLine1)
    expect(container.innerHTML).not.toContain('Skip the taxi rank.')

    const primaryLink = screen.getByRole('link', { name: arCta.primaryButton }) as HTMLAnchorElement
    expect(primaryLink.getAttribute('href')).toBe('/ar/book')
    const secondaryLink = screen.getByRole('link', { name: arCta.secondaryButton }) as HTMLAnchorElement
    expect(secondaryLink.getAttribute('href')).toBe('/ar/services/airport-transfer')
  })
})

describe('Author page — roman-ustyugov (75-13 Task 3)', () => {
  it('renders zh section labels and bio text; JSON-LD Person stays unchanged from EN', async () => {
    const { default: RomanUstyugovPage } = await import('@/app/[locale]/authors/roman-ustyugov/page')
    const PageElement = await RomanUstyugovPage({ params: Promise.resolve({ locale: 'zh' }) })
    const { render } = await import('@testing-library/react')
    const { container } = render(PageElement)

    expect(container.innerHTML).toContain('作者简介')
    expect(container.innerHTML).toContain('关于')
    expect(container.innerHTML).toContain('专业领域')
    expect(container.innerHTML).not.toContain('Author profile')
    expect(container.innerHTML).not.toContain('Areas of expertise')

    const ld = container.querySelector('script[type="application/ld+json"]')
    expect(ld).not.toBeNull()
    const parsed = JSON.parse(ld!.innerHTML) as { '@graph': Array<Record<string, unknown>> }
    const person = parsed['@graph'].find((n) => n['@type'] === 'Person') as { name: string; description: string }
    expect(person.name).toBe('Roman Ustyugov')
    expect(person.description).toBe(
      'Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague.'
    )
  })
})
