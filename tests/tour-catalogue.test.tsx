/**
 * Phase 93 (plan 93-14; TRIP-01, D-13, D-16, D-25; UI-SPEC Surface 1.7 and Surface 2): the catalogue surfaces.
 *   - the hub (/services/day-trips-from-prague) keeps its LandingView and lists the published tours of the locale
 *     right after "At a glance", with the custom-tour band between the FAQ and the final CTA;
 *   - a tour page shows up to 3 other tours ("You might also like"), the compact custom-tour card under the box
 *     and the band above the footer;
 *   - the /services index lists the hub plus the published tours.
 *
 * next-intl/server is mocked with the real use-intl translator over the real catalogs; the store, Nav, Footer,
 * Divider, Reveal and Testimonials are mocked. The real LandingView renders, so the slot positions are the real ones.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { createTranslator } from 'use-intl/core'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import enMessages from '@/messages/en.json'
import ruMessages from '@/messages/ru.json'
import arMessages from '@/messages/ar.json'
import { formatEUR } from '@/lib/currency'
import { buildCustomTourHref } from '@/lib/tours/custom-tour-link'
import type { TourCardView, TourPageData } from '@/lib/tours/store'

const CATALOGS: Record<string, Record<string, unknown>> = {
  en: enMessages as unknown as Record<string, unknown>,
  ru: ruMessages as unknown as Record<string, unknown>,
  ar: arMessages as unknown as Record<string, unknown>,
}
const T = enMessages.Tours

const storeMock = vi.hoisted(() => ({
  getPublishedTourForLocale: vi.fn(),
  getPublishedTourLocales: vi.fn(),
  listPublishedTours: vi.fn(),
}))
// The request page is not live yet (CUSTOM_TOUR_REQUEST_LIVE false): links go to /contact. `live` flips the real
// builder to its live state so the tour query carried by each entry point can be asserted.
const customLink = vi.hoisted(() => ({ live: false }))

vi.mock('@/lib/tours/store', () => storeMock)
vi.mock('@/lib/tours/custom-tour-link', async (orig) => {
  const actual = await orig<typeof import('@/lib/tours/custom-tour-link')>()
  return {
    ...actual,
    customTourHref: (q: Parameters<typeof actual.customTourHref>[0] = {}) => actual.buildCustomTourHref(q, customLink.live),
  }
})
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getLocale: vi.fn(async () => 'en'),
  getTranslations: vi.fn(async (arg: string | { locale: string; namespace: string }) => {
    const locale = typeof arg === 'string' ? 'en' : arg.locale
    const namespace = typeof arg === 'string' ? arg : arg.namespace
    return createTranslator({ locale, messages: CATALOGS[locale] ?? CATALOGS.en, namespace } as never)
  }),
}))
vi.mock('@/i18n/routing', async (orig) => ({
  ...(await orig<typeof import('@/i18n/routing')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/image', () => ({
  default: ({ src, alt, fill: _f, priority: _p, ...rest }: { src: string; alt: string; fill?: boolean; priority?: boolean }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...rest} />
  },
}))
vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))
vi.mock('@/components/Divider', () => ({ default: () => null }))
vi.mock('@/components/Reveal', () => ({ default: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/Testimonials', () => ({ default: () => <div data-testid="testimonials">reviews</div> }))
vi.mock('@/components/HeroRating', () => ({ default: () => null }))
vi.mock('@/lib/landing-pages', async (orig) => ({
  ...(await orig<typeof import('@/lib/landing-pages')>()),
  getLandingPrices: async () => ({ businessPrice: 1, vClassAirport: 2, sClassAirport: 3, hourlyFrom: 4, hourlyV: 5, hourlyS: 6 }),
}))
vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: async () => ({
    globals: { airportPromoActive: false, airportPromoPriceEur: 1, airportRegularPriceEur: 2 },
    hourlyRate: {},
  }),
}))
vi.mock('@/lib/route-prices', () => ({ getAllRoutes: async () => [] }))

import ServicePage from '@/app/[locale]/services/[slug]/page'
import ServicesPage from '@/app/[locale]/services/page'
import TourPageView from '@/components/tours/TourPageView'
import CustomTourBlock from '@/components/tours/CustomTourBlock'

const HUB = 'day-trips-from-prague'

function card(slug: string, over: Partial<TourCardView> = {}): TourCardView {
  return {
    slug,
    title: `Title of ${slug}`,
    shortDescription: `Short text of ${slug}`,
    hoursIncluded: 6,
    totalHours: 10,
    lowestPrice: 400,
    cover: null,
    ...over,
  }
}

const DRESDEN = card('dresden-day-trip', { lowestPrice: 400, totalHours: 10, hoursIncluded: 6 })
const KARLOVY = card('karlovy-vary-day-trip', { lowestPrice: 310, totalHours: 8, hoursIncluded: 5 })

function params(locale: string, slug: string) {
  return { params: Promise.resolve({ locale, slug }) }
}

function tourFixture(slug: string): TourPageData {
  return {
    tour: {
      id: 'tour-1',
      slug,
      status: 'published',
      sort_order: 1,
      hours_included: 6,
      drive_minutes_each_way: 120,
      start_time_min: '07:00',
      start_time_max: '10:00',
      price_e_eur: 400,
      price_s_eur: 520,
      price_v_eur: 560,
      destination_label: 'Dresden',
      first_published_at: '2026-11-01T00:00:00Z',
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    },
    translation: {
      tour_id: 'tour-1',
      locale: 'en',
      title: 'Current tour title',
      short_description: 'Short description of the trip.',
      description: 'A description.',
      pickup_info: 'We pick you up at your hotel.',
      important_info: 'Bring a passport.',
      seo_title: 'SEO title',
      seo_description: 'SEO description',
      highlights: ['Highlight alpha'],
      itinerary: [{ title: 'Pickup in Prague', body: 'We meet you.' }],
      includes: ['Private car'],
      excludes: ['Entrance tickets'],
      faq: [{ q: 'Question one?', a: 'Answer one text.' }],
      is_complete: true,
      updated_at: '2026-11-01T00:00:00Z',
    },
    completeLocales: ['en'],
    photos: [],
    settings: {
      id: 1,
      extra_hour_e_eur: 40,
      extra_hour_s_eur: 50,
      extra_hour_v_eur: 60,
      free_cancel_hours: 24,
      pickup_radius_km: 25,
      updated_at: '2026-11-01T00:00:00Z',
    },
  }
}

// Next renders async server components itself; testing-library cannot, so the page's TourPageView element is
// awaited here (the same call Next makes) before rendering.
async function resolve(ui: React.ReactElement): Promise<React.ReactElement> {
  return ui.type === TourPageView ? await (ui.type as (p: unknown) => Promise<React.ReactElement>)(ui.props) : ui
}

async function renderPage(locale: string, slug: string) {
  const ui = await resolve(await ServicePage(params(locale, slug)))
  return render(
    <NextIntlClientProvider locale={locale} messages={(CATALOGS[locale] ?? CATALOGS.en) as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  customLink.live = false
  storeMock.getPublishedTourLocales.mockResolvedValue([])
  storeMock.listPublishedTours.mockResolvedValue([])
})
afterEach(() => cleanup())

describe('hub grid (tracer)', () => {
  it('lists the published tours of the locale right after "At a glance": section label, heading and one article per tour', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN, KARLOVY])
    const { container } = await renderPage('en', HUB)
    expect(storeMock.listPublishedTours).toHaveBeenCalledWith('en')

    const section = screen.getByTestId('tour-hub-grid')
    expect(within(section).getByText(T.hub.label)).toBeTruthy()
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe(T.hub.heading)
    expect(within(section).getAllByRole('article')).toHaveLength(2)

    // directly after the glance section (its label is the page content's glance label)
    const glance = container.querySelector('section.bg-anthracite-mid')
    expect(glance).toBeTruthy()
    expect(glance!.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const faq = container.querySelector('#faq')!
    expect(section.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a card has the title as its only link (localized), the facts and the lowest price', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN])
    await renderPage('en', HUB)
    const article = screen.getByRole('article')
    const links = article.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/services/dresden-day-trip')
    expect(within(article).getByRole('heading', { level: 3 }).textContent).toBe(DRESDEN.title)
    expect(links[0].closest('h3')).toBeTruthy()

    expect(within(article).getByText(T.hub.cardEyebrow)).toBeTruthy()
    expect(within(article).getByText(DRESDEN.shortDescription)).toBeTruthy()
    expect(within(article).getByText('About 10 hours in total')).toBeTruthy()
    expect(within(article).getByText('6 hours at the destination')).toBeTruthy()
    expect(within(article).getByText(T.box.from)).toBeTruthy()
    expect(within(article).getByText(formatEUR(400)).tagName).toBe('BDI')
    expect(within(article).getByText(T.box.perCar)).toBeTruthy()
  })

  it('links the card to the localized tour URL in ru', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN])
    await renderPage('ru', HUB)
    expect(screen.getByRole('article').querySelector('a')!.getAttribute('href')).toBe('/ru/services/dresden-day-trip')
  })

  it('shows the cover at 4:3 with the title as alt text, and no image box content when there is no cover', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    const withCover = card('a-day-trip', {
      cover: { id: 'p1', tour_id: 't1', storage_path: 't1/a.jpg', position: 0, is_cover: true } as TourCardView['cover'],
    })
    storeMock.listPublishedTours.mockResolvedValue([withCover, card('b-day-trip')])
    await renderPage('en', HUB)
    const [first, second] = screen.getAllByRole('article')
    const img = first.querySelector('img')!
    expect(img.getAttribute('alt')).toBe(withCover.title)
    expect(img.getAttribute('src')).toContain('/tour-photos/t1/a.jpg')
    expect(second.querySelector('img')).toBeNull()
    expect(first.querySelector('.aspect-\\[4\\/3\\]')).toBeTruthy()
    vi.unstubAllEnvs()
  })

  it('omits the price line amount when no class price is known', async () => {
    storeMock.listPublishedTours.mockResolvedValue([card('x-day-trip', { lowestPrice: null, totalHours: null })])
    await renderPage('en', HUB)
    const article = screen.getByRole('article')
    expect(within(article).queryByText(T.box.from)).toBeNull()
    expect(article.querySelector('bdi')).toBeNull()
    expect(within(article).queryByText(/in total/)).toBeNull()
  })

  it('carries no badge, rating, popularity or count markup', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN, KARLOVY])
    await renderPage('en', HUB)
    const html = screen.getByTestId('tour-hub-grid').innerHTML.toLowerCase()
    for (const word of ['popular', 'bestseller', 'best seller', 'rating', 'review', 'star', 'only ', 'left']) {
      expect(html).not.toContain(word)
    }
    expect(screen.getByTestId('tour-hub-grid').querySelector('svg.lucide-star')).toBeNull()
  })

  it('with no tour in the locale shows the empty state and a custom-tour link built by customTourHref({})', async () => {
    storeMock.listPublishedTours.mockResolvedValue([])
    await renderPage('en', HUB)
    const section = screen.getByTestId('tour-hub-grid')
    expect(within(section).queryAllByRole('article')).toHaveLength(0)
    expect(within(section).getByRole('heading', { name: T.hub.emptyHeading })).toBeTruthy()
    expect(within(section).getByText(T.hub.emptyBody)).toBeTruthy()
    const cta = within(section).getByRole('link', { name: T.custom.cta })
    expect(cta.getAttribute('href')).toBe('/contact')
    expect(cta.className).toContain('btn-primary')
  })

  it('the empty-state link carries no tour query when the request page is live', async () => {
    customLink.live = true
    await renderPage('en', HUB)
    const cta = within(screen.getByTestId('tour-hub-grid')).getByRole('link', { name: T.custom.cta })
    expect(cta.getAttribute('href')).toBe('/book/custom-tour')
  })

  it('the band sits between the FAQ and the final CTA, links without a tour query, and shows with zero tours too', async () => {
    customLink.live = true
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN])
    const { container } = await renderPage('en', HUB)
    const band = screen.getByTestId('custom-tour-band')
    expect(within(band).getByText(T.custom.bandLabel)).toBeTruthy()
    expect(within(band).getByRole('heading', { level: 2 }).textContent).toBe(T.custom.heading)
    expect(within(band).getByText(T.custom.bandBody)).toBeTruthy()
    const link = within(band).getByRole('link', { name: T.custom.cta })
    expect(link.getAttribute('href')).toBe('/book/custom-tour')
    expect(link.className).toContain('btn-primary')

    const faq = container.querySelector('#faq')!
    const ctaLinks = Array.from(container.querySelectorAll('a.btn-primary'))
    const finalCta = ctaLinks[ctaLinks.length - 1]
    expect(faq.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(band.compareDocumentPosition(finalCta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the band is present on the hub when no tour is published', async () => {
    storeMock.listPublishedTours.mockResolvedValue([])
    await renderPage('en', HUB)
    expect(screen.getByTestId('custom-tour-band')).toBeTruthy()
  })

  it('does not query the store for any other landing page', async () => {
    await renderPage('en', 'limousine-prague')
    expect(storeMock.listPublishedTours).not.toHaveBeenCalled()
    expect(screen.queryByTestId('tour-hub-grid')).toBeNull()
    expect(screen.queryByTestId('custom-tour-band')).toBeNull()
  })

  it('degrades to the empty state when the store call rejects', async () => {
    storeMock.listPublishedTours.mockRejectedValue(new Error('db down'))
    await renderPage('en', HUB)
    expect(screen.getByRole('heading', { name: T.hub.emptyHeading })).toBeTruthy()
  })
})

describe('tour page: related row and custom-tour blocks', () => {
  const SLUG = 'dresden-day-trip'
  const others = ['a-day-trip', 'b-day-trip', 'c-day-trip', 'd-day-trip'].map((s) => card(s))

  beforeEach(() => {
    storeMock.getPublishedTourForLocale.mockResolvedValue({ status: 'ok', data: tourFixture(SLUG) })
  })

  it('related row shows at most 3 other tours and never the current one', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN, ...others])
    await renderPage('en', SLUG)
    const section = screen.getByTestId('tour-related')
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe(T.sections.related)
    const articles = within(section).getAllByRole('article')
    expect(articles).toHaveLength(3)
    const hrefs = articles.map((a) => a.querySelector('a')!.getAttribute('href'))
    expect(hrefs).toEqual(['/services/a-day-trip', '/services/b-day-trip', '/services/c-day-trip'])
    expect(hrefs).not.toContain(`/services/${SLUG}`)
  })

  it('related row with one or two other tours keeps the column grid (cards do not stretch)', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN, others[0]])
    await renderPage('en', SLUG)
    const grid = within(screen.getByTestId('tour-related')).getAllByRole('list')[0]
    expect(within(grid).getAllByRole('article')).toHaveLength(1)
    expect(grid.className).toContain('lg:grid-cols-3')
    expect(grid.className).toContain('sm:grid-cols-2')
  })

  it('related row is absent when the current tour is the only one', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN])
    await renderPage('en', SLUG)
    expect(screen.queryByTestId('tour-related')).toBeNull()
    expect(screen.queryByText(T.sections.related)).toBeNull()
  })

  it('related row is absent when the list is empty', async () => {
    storeMock.listPublishedTours.mockResolvedValue([])
    await renderPage('en', SLUG)
    expect(screen.queryByTestId('tour-related')).toBeNull()
  })

  it('the compact custom-tour card sits in the aside under the box and carries the tour query', async () => {
    customLink.live = true
    await renderPage('en', SLUG)
    const aside = document.querySelector('[data-area="box"]')!
    const compact = within(aside as HTMLElement).getByTestId('custom-tour-compact')
    expect(within(compact).getByText(T.custom.heading)).toBeTruthy()
    expect(within(compact).getByText(T.custom.compactBody)).toBeTruthy()
    expect(compact.querySelector('svg.lucide-message-circle')).toBeTruthy()
    const link = within(compact).getByRole('link', { name: T.custom.cta })
    expect(link.getAttribute('href')).toBe(`/book/custom-tour?tour=${SLUG}`)
    // under the box: the box area comes first in the aside
    const box = aside.querySelector('#book')!
    expect(box.compareDocumentPosition(compact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the band comes after the related row and carries the tour query', async () => {
    customLink.live = true
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN, others[0]])
    await renderPage('en', SLUG)
    const band = screen.getByTestId('custom-tour-band')
    expect(within(band).getByRole('link', { name: T.custom.cta }).getAttribute('href')).toBe(`/book/custom-tour?tour=${SLUG}`)
    const related = screen.getByTestId('tour-related')
    expect(related.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('both blocks link to /contact while the request page is not live', async () => {
    await renderPage('en', SLUG)
    expect(within(screen.getByTestId('custom-tour-compact')).getByRole('link').getAttribute('href')).toBe('/contact')
    expect(within(screen.getByTestId('custom-tour-band')).getByRole('link').getAttribute('href')).toBe('/contact')
  })

  it('renders the blocks in ar with the translated copy and a localized link', async () => {
    customLink.live = true
    await renderPage('ar', SLUG)
    const band = screen.getByTestId('custom-tour-band')
    expect(within(band).getByText(arMessages.Tours.custom.bandBody)).toBeTruthy()
    expect(within(band).getByRole('link').getAttribute('href')).toBe(`/ar/book/custom-tour?tour=${SLUG}`)
  })
})

describe('CustomTourBlock', () => {
  const t = createTranslator({ locale: 'en', messages: enMessages, namespace: 'Tours' } as never) as never

  it('the band mirrors its rule to the inline start (border-inline-start, logical padding)', () => {
    render(<CustomTourBlock variant="band" locale="en" t={t} />)
    const band = screen.getByTestId('custom-tour-band')
    const column = band.querySelector('[class*="border-s"]')
    expect(column).toBeTruthy()
    expect(column!.className).toContain('ps-6')
  })

  it('an invalid tour slug never reaches the link (falls back to no query)', () => {
    customLink.live = true
    render(<CustomTourBlock variant="compact" tourSlug="../../evil" locale="en" t={t} />)
    expect(screen.getByRole('link').getAttribute('href')).toBe(buildCustomTourHref({}, true))
  })
})

describe('services index: also popular', () => {
  async function renderIndex(locale = 'en') {
    const ui = await ServicesPage({ params: Promise.resolve({ locale }) })
    return render(ui)
  }

  it('lists the hub and one card per published tour, linking only to the hub or a published tour', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN, KARLOVY])
    const { container } = await renderIndex()
    expect(storeMock.listPublishedTours).toHaveBeenCalledWith('en')
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(`/services/${HUB}`)
    expect(hrefs).toContain('/services/dresden-day-trip')
    expect(hrefs).toContain('/services/karlovy-vary-day-trip')
    expect(screen.getByText(DRESDEN.title)).toBeTruthy()
    expect(screen.getByText(KARLOVY.title)).toBeTruthy()
    // no link to a removed day-trip landing page: every */day-trip(s) href is the hub or a published tour
    const dayTripHrefs = hrefs.filter((h) => h && /\/services\/[^/]*day-trip/.test(h))
    for (const h of dayTripHrefs) {
      expect([`/services/${HUB}`, '/services/dresden-day-trip', '/services/karlovy-vary-day-trip']).toContain(h)
    }
  })

  it('shows the published tours as full photo cards with a link to the catalogue', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN, KARLOVY])
    await renderIndex()
    const showcase = screen.getByTestId('tour-showcase')
    expect(within(showcase).getAllByRole('article')).toHaveLength(2)
    expect(within(showcase).getByRole('heading', { level: 2 }).textContent).toBe(T.hub.heading)
    const all = within(showcase).getByRole('link', { name: T.checkout.seeAll })
    expect(all.getAttribute('href')).toBe(`/services/${HUB}`)
  })

  it('renders no tour block without published tours', async () => {
    storeMock.listPublishedTours.mockResolvedValue([])
    await renderIndex()
    expect(screen.queryByTestId('tour-showcase')).toBeNull()
  })

  it('localizes tour links in ru', async () => {
    storeMock.listPublishedTours.mockResolvedValue([DRESDEN])
    const { container } = await renderIndex('ru')
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/ru/services/dresden-day-trip')
  })

  it('with the store returning [] still renders the landing pages and the hub', async () => {
    storeMock.listPublishedTours.mockResolvedValue([])
    const { container } = await renderIndex()
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(`/services/${HUB}`)
  })

  it('does not break when the store rejects', async () => {
    storeMock.listPublishedTours.mockRejectedValue(new Error('db down'))
    const { container } = await renderIndex()
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(`/services/${HUB}`)
  })
})
