/**
 * Phase 93 (plan 93-11; TRIP-01, TRIP-02): the /services/[slug] route resolves a landing page or a published
 * tour from the database, redirects an incomplete locale to EN, and renders the tour sections from the row.
 *
 * next-intl/server is mocked with the real use-intl translator over the real catalogs (ICU plurals and rich
 * tags work); the store, Nav, Footer, Testimonials and LandingView are mocked. In a git worktree the real
 * next-intl server build can be unresolvable, hence the mock.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createTranslator } from 'use-intl/core'
import enMessages from '@/messages/en.json'
import ruMessages from '@/messages/ru.json'
import arMessages from '@/messages/ar.json'
import { LANDING_PAGES } from '@/lib/landing-pages'
import type { TourPageData } from '@/lib/tours/store'
import type { TourPhotoRow } from '@/lib/tours/types'

const CATALOGS: Record<string, Record<string, unknown>> = {
  en: enMessages as unknown as Record<string, unknown>,
  ru: ruMessages as unknown as Record<string, unknown>,
  ar: arMessages as unknown as Record<string, unknown>,
}

const storeMock = vi.hoisted(() => ({
  getPublishedTourForLocale: vi.fn(),
  getPublishedTourLocales: vi.fn(),
}))
const navMock = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/lib/tours/store', () => storeMock)
vi.mock('next/navigation', async (orig) => ({ ...(await orig<typeof import('next/navigation')>()), ...navMock }))
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async (arg: string | { locale: string; namespace: string }) => {
    const locale = typeof arg === 'string' ? 'en' : arg.locale
    const namespace = typeof arg === 'string' ? arg : arg.namespace
    return createTranslator({ locale, messages: CATALOGS[locale] ?? CATALOGS.en, namespace } as never)
  }),
}))
vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))
vi.mock('@/components/Testimonials', () => ({ default: () => <div data-testid="testimonials">reviews</div> }))
vi.mock('@/components/LandingView', () => ({ default: () => <div data-testid="landing-view" /> }))
vi.mock('@/lib/landing-pages', async (orig) => ({
  ...(await orig<typeof import('@/lib/landing-pages')>()),
  getLandingPrices: async () => ({ businessPrice: 1, vClassAirport: 2, sClassAirport: 3, hourlyFrom: 4, hourlyV: 5, hourlyS: 6 }),
}))

import ServicePage, { generateMetadata, generateStaticParams } from '@/app/[locale]/services/[slug]/page'
import TourPageView from '@/components/tours/TourPageView'

const SLUG = 'dresden-day-trip'

const TITLE = 'Dresden Test Trip Title'
const LONG_DESCRIPTION = [
  'First paragraph of the description about the Frauenkirche and the Zwinger. '.repeat(3).trim(),
  'Second paragraph about the Old Masters Picture Gallery and the drive back to Prague.',
].join('\n\n')

function fixture(over: Partial<TourPageData['translation']> = {}): TourPageData {
  return {
    tour: {
      id: 'tour-1',
      slug: SLUG,
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
      locale: 'ru',
      title: TITLE,
      short_description: 'Short description of the trip.',
      description: LONG_DESCRIPTION,
      pickup_info: 'We pick you up at your hotel.',
      important_info: 'Bring a passport.\n\nCheck the weather.',
      seo_title: 'SEO title',
      seo_description: 'SEO description',
      highlights: ['Highlight alpha', 'Highlight beta'],
      itinerary: [
        { title: 'Pickup in Prague', body: 'We meet you.' },
        { title: 'Old Town walk', body: 'Free time.' },
        { title: 'Return to Prague', body: 'Same address.' },
      ],
      includes: ['Private car', 'Waiting time'],
      excludes: ['Entrance tickets'],
      faq: [
        { q: 'Question one?', a: 'Answer one text.' },
        { q: 'Question two?', a: 'Answer two text.' },
      ],
      is_complete: true,
      updated_at: '2026-11-01T00:00:00Z',
      ...over,
    },
    completeLocales: ['en', 'ru'],
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

function params(locale: string, slug: string) {
  return { params: Promise.resolve({ locale, slug }) }
}

// Next renders async server components itself; testing-library cannot, so the page's TourPageView element is
// awaited here (the same call Next makes) before rendering.
async function resolve(ui: React.ReactElement): Promise<React.ReactElement> {
  return ui.type === TourPageView ? await (ui.type as (p: unknown) => Promise<React.ReactElement>)(ui.props) : ui
}

async function renderPage(locale: string, slug = SLUG) {
  return render(await resolve(await ServicePage(params(locale, slug))))
}

beforeEach(() => {
  vi.clearAllMocks()
  storeMock.getPublishedTourLocales.mockResolvedValue([])
})
afterEach(() => cleanup())

describe('route resolution', () => {
  it('renders the ru tour from the database: H1, eyebrow, highlights and itinerary in order', async () => {
    storeMock.getPublishedTourForLocale.mockResolvedValue({ status: 'ok', data: fixture() })
    await renderPage('ru')
    expect(storeMock.getPublishedTourForLocale).toHaveBeenCalledWith(SLUG, 'ru')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITLE)
    expect(screen.getByText(ruMessages.Tours.page.eyebrow)).toBeTruthy()
    expect(screen.getByText('Highlight alpha')).toBeTruthy()
    const steps = within(screen.getByTestId('tour-itinerary')).getAllByRole('listitem')
    expect(steps.map((li) => li.querySelector('p')?.textContent)).toEqual([
      'Pickup in Prague',
      'Old Town walk',
      'Return to Prague',
    ])
  })

  it('redirects 307 to the EN URL when the locale translation is not complete, and renders nothing', async () => {
    storeMock.getPublishedTourForLocale.mockResolvedValue({ status: 'locale_incomplete', completeLocales: ['en'] })
    await expect(ServicePage(params('ru', SLUG))).rejects.toThrow('NEXT_REDIRECT:/services/dresden-day-trip')
    expect(navMock.redirect).toHaveBeenCalledWith('/services/dresden-day-trip')
  })

  it('calls notFound() for an unknown tour that is not a landing page', async () => {
    storeMock.getPublishedTourForLocale.mockResolvedValue({ status: 'not_found' })
    await expect(ServicePage(params('en', 'atlantis-day-trip'))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('never queries or redirects for a malformed slug (open-redirect guard)', async () => {
    await expect(ServicePage(params('en', '//evil.com'))).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(ServicePage(params('en', 'not-a-tour'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(storeMock.getPublishedTourForLocale).not.toHaveBeenCalled()
    expect(navMock.redirect).not.toHaveBeenCalled()
  })

  it('still renders LandingView for the hub day-trips-from-prague (D-25)', async () => {
    await renderPage('en', 'day-trips-from-prague')
    expect(screen.getByTestId('landing-view')).toBeTruthy()
    expect(storeMock.getPublishedTourForLocale).not.toHaveBeenCalled()
  })

  it('generateStaticParams returns landing slugs plus published tour slugs', async () => {
    storeMock.getPublishedTourLocales.mockResolvedValue([
      { slug: SLUG, locales: ['en'], updatedAt: 'x' },
      { slug: 'karlstejn-day-trip', locales: ['en'], updatedAt: 'x' },
    ])
    const result = await generateStaticParams()
    const slugs = result.map((p) => p.slug)
    expect(slugs).toContain('day-trips-from-prague')
    expect(slugs).toContain(SLUG)
    expect(slugs).toContain('karlstejn-day-trip')
  })

  it('generateStaticParams returns only the landing slugs when the store returns [] or throws', async () => {
    const landing = LANDING_PAGES.filter((p) => p.section === 'services').map((p) => p.slug)
    expect((await generateStaticParams()).map((p) => p.slug).sort()).toEqual([...landing].sort())
    storeMock.getPublishedTourLocales.mockRejectedValue(new Error('no env'))
    expect((await generateStaticParams()).map((p) => p.slug).sort()).toEqual([...landing].sort())
  })

  it('LANDING_PAGES no longer lists the tour slugs but keeps the hub', () => {
    const slugs = LANDING_PAGES.map((p) => p.slug)
    for (const s of ['cesky-krumlov-day-trip', 'kutna-hora-day-trip', 'karlovy-vary-day-trip', 'dresden-day-trip']) {
      expect(slugs).not.toContain(s)
    }
    expect(slugs).toContain('day-trips-from-prague')
  })

  it('the page module reads params.locale and never the bare request-locale reader (ISR safety)', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app', '[locale]', 'services', '[slug]', 'page.tsx'), 'utf-8')
    expect(source).not.toMatch(/getLocale\s*\(/)
    expect(source).toMatch(/setRequestLocale\(locale\)/)
    expect(source).toMatch(/export const dynamicParams = true/)
  })
})

describe('tour page content', () => {
  beforeEach(() => {
    storeMock.getPublishedTourForLocale.mockResolvedValue({ status: 'ok', data: fixture() })
  })

  it('renders the five key facts from the row, the settings and the vehicle config', async () => {
    await renderPage('en')
    const facts = screen.getByTestId('tour-key-facts')
    expect(within(facts).getAllByRole('listitem')).toHaveLength(5)
    // 2 x 120 min drive + 6 included hours = 10 hours in total.
    expect(facts.textContent).toContain('About 10 hours in total')
    expect(facts.textContent).toContain('6 hours at the destination')
    expect(facts.textContent).toContain('Up to 6 people per car')
    expect(facts.textContent).toContain('Free cancellation up to 24 hours before pickup')
    expect(facts.textContent).toContain('Reserve now, pay after your trip')
  })

  it('renders the fixed pickup line with a custom-tour link and the fixed not-a-guide line', async () => {
    await renderPage('en')
    const pickup = screen.getByTestId('tour-pickup-fixed')
    expect(within(pickup).getByRole('link').textContent).toBe('request a custom tour')
    expect(screen.getByTestId('tour-important-fixed').textContent).toBe(enMessages.Tours.page.importantFixed)
  })

  it('FAQ answers stay in the DOM while collapsed; questions are buttons with aria-expanded and aria-controls', async () => {
    await renderPage('en')
    const button = screen.getByRole('button', { name: /Question one\?/ })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '')
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain('Answer one text.')
    expect(panel!.hasAttribute('inert')).toBe(true)
    expect(panel!.hasAttribute('hidden')).toBe(false)
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(panel!.hasAttribute('inert')).toBe(false)
  })

  it('shows the reviews block (D-14) and links the one-way transfer when a route page exists', async () => {
    await renderPage('en')
    expect(screen.getByTestId('testimonials')).toBeTruthy()
    const oneWay = screen.getByTestId('tour-oneway')
    expect(within(oneWay).getByRole('link').getAttribute('href')).toBe('/routes/prague-dresden')
    expect(oneWay.textContent).toContain('Dresden')
  })

  it('omits the one-way link when no route page exists for the destination', async () => {
    const data = fixture()
    data.tour.slug = 'atlantis-day-trip'
    storeMock.getPublishedTourForLocale.mockResolvedValue({ status: 'ok', data })
    await renderPage('en', 'atlantis-day-trip')
    expect(screen.queryByTestId('tour-oneway')).toBeNull()
  })
})

describe('guard contract', () => {
  it('scarcity: no aggregateRating, no star icon and none of the scarcity phrases in the tour content', async () => {
    const ui = await TourPageView({ data: fixture(), locale: 'en', oneWayRoute: null })
    const { container } = render(ui)
    const content = container.cloneNode(true) as HTMLElement
    content.querySelector('[data-testid="testimonials"]')?.remove()
    const html = content.innerHTML
    expect(html).not.toMatch(/aggregateRating/i)
    expect(html).not.toMatch(/lucide-star/i)
    const text = content.textContent ?? ''
    expect(text).not.toMatch(/booked \d+ times|sell(s|ing)? out|spots? left|only \d+ left|last chance|popular choice/i)
    expect(JSON.stringify(enMessages.Tours)).not.toMatch(
      /booked \d+ times|sell(s|ing)? out|spots? left|only \d+ left|last chance|popular choice/i,
    )
  })

  it('rtl: the ar page uses logical-direction classes only and mirrors the breadcrumb chevrons', async () => {
    const ui = await TourPageView({ data: fixture({ locale: 'ar' }), locale: 'ar', oneWayRoute: null })
    const { container } = render(ui)
    const physical = /(^|[\s:])(-?)(ml|mr|pl|pr|left|right|text-left|text-right)-/
    for (const el of Array.from(container.querySelectorAll('[class]'))) {
      const cls = el.getAttribute('class') ?? ''
      expect(cls, cls).not.toMatch(physical)
    }
    const chevrons = container.querySelectorAll('nav svg')
    expect(chevrons.length).toBeGreaterThan(0)
    for (const svg of Array.from(chevrons)) expect(svg.getAttribute('class')).toContain('rtl:-scale-x-100')
  })

  it('read more: toggles aria-expanded and the clamp (long descriptions only)', async () => {
    const ui = await TourPageView({ data: fixture(), locale: 'en', oneWayRoute: null })
    render(ui)
    const button = screen.getByRole('button', { name: enMessages.Tours.page.readMore })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const region = document.getElementById(button.getAttribute('aria-controls') ?? '')
    expect(region?.getAttribute('data-clamped')).toBe('true')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.textContent).toBe(enMessages.Tours.page.showLess)
    expect(region?.getAttribute('data-clamped')).toBe('false')
  })

  it('read more: a short description renders no button', async () => {
    const ui = await TourPageView({
      data: fixture({ description: 'Short text.' }),
      locale: 'en',
      oneWayRoute: null,
    })
    render(ui)
    expect(screen.queryByRole('button', { name: enMessages.Tours.page.readMore })).toBeNull()
  })

  it('itinerary renders first and last steps in order inside an ordered list', async () => {
    const ui = await TourPageView({ data: fixture(), locale: 'en', oneWayRoute: null })
    render(ui)
    const list = screen.getByTestId('tour-itinerary')
    expect(list.tagName).toBe('OL')
    const titles = within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent)
    expect(titles[0]).toBe('Pickup in Prague')
    expect(titles[titles.length - 1]).toBe('Return to Prague')
  })

  it('important information ends with the fixed line; cancellation uses free_cancel_hours', async () => {
    const data = fixture()
    data.settings.free_cancel_hours = 48
    const ui = await TourPageView({ data, locale: 'en', oneWayRoute: null })
    render(ui)
    const section = document.getElementById('tour-important')!
    const last = section.querySelector('p:last-of-type')
    expect(last?.textContent).toBe(enMessages.Tours.page.importantFixed)
    const cancellation = screen.getByTestId('tour-cancellation')
    expect(cancellation.textContent).toContain('Free cancellation up to 48 hours before pickup.')
    expect(within(cancellation).getByRole('link').getAttribute('target')).toBe('_blank')
  })

  it('no tour field reaches dangerouslySetInnerHTML (sections and facts are React text)', () => {
    for (const f of ['TourSections.tsx', 'TourKeyFacts.tsx', 'TourFaq.tsx', 'TourReadMore.tsx']) {
      const source = fs.readFileSync(path.join(process.cwd(), 'components', 'tours', f), 'utf-8')
      expect(source, f).not.toContain('dangerouslySetInnerHTML')
    }
  })

  it('a tour photo cover is not required for the page to render', async () => {
    const data = fixture()
    data.photos = [] as TourPhotoRow[]
    const ui = await TourPageView({ data, locale: 'en', oneWayRoute: null })
    expect(() => render(ui)).not.toThrow()
  })
})

describe('metadata and structured data', () => {
  it('uses the locale seo fields and lists only the complete locales in hreflang and canonical', async () => {
    const data = fixture()
    data.completeLocales = ['en', 'ru']
    storeMock.getPublishedTourForLocale.mockResolvedValue({ status: 'ok', data })
    const md = await generateMetadata(params('ru', SLUG))
    expect(md.title).toBe('SEO title')
    expect(md.description).toBe('SEO description')
    expect(Object.keys(md.alternates!.languages as Record<string, string>)).toEqual(['en', 'ru', 'x-default'])
    expect(md.alternates!.canonical).toBe('https://rideprestigo.com/ru/services/dresden-day-trip')
    expect((md.openGraph!.images as Array<{ url: string }>)[0].url).toBe('https://rideprestigo.com/og-image.jpg')
  })

  it('returns no tour metadata for an incomplete locale, an unknown tour or a malformed slug', async () => {
    storeMock.getPublishedTourForLocale.mockResolvedValue({ status: 'locale_incomplete', completeLocales: ['en'] })
    expect(await generateMetadata(params('ru', SLUG))).toEqual({})
    expect(await generateMetadata(params('ru', 'nope'))).toEqual({})
  })

  it('renders one JSON-LD script with the DB prices, escaped against script injection', async () => {
    const data = fixture({ title: 'Evil </script><script>alert(1)</script>' })
    storeMock.getPublishedTourForLocale.mockResolvedValue({ status: 'ok', data })
    const { container } = await renderPage('en')
    const scripts = container.querySelectorAll('script[type="application/ld+json"]')
    expect(scripts).toHaveLength(1)
    const raw = scripts[0].innerHTML
    expect(raw).not.toContain('</script')
    const doc = JSON.parse(raw)
    const trip = doc['@graph'].find((n: { '@type': string }) => n['@type'] === 'TouristTrip')
    expect(trip.name).toContain('</script>')
    expect(trip.offers.map((o: { price: string }) => o.price)).toEqual(['400', '520', '560'])
  })
})
