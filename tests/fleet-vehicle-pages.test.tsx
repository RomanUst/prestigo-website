/**
 * Per-vehicle fleet landing pages (/fleet/s-class, /fleet/v-class,
 * /fleet/e-class — 2026-10-31). Content completeness, token discipline and
 * sitemap coverage for every LANDING_PAGES entry are already guarded by
 * tests/seo-volume-pages.test.ts; this file covers what is specific to the
 * fleet section: capacities, snippet rules (no price), metadata/hreflang,
 * the rendered page (vehicle section, booking deeplink, JSON-LD) and the
 * /fleet hub ↔ vehicle page links.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { landingPagesFor, type LandingContent } from '@/lib/landing-pages'

const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
const FLEET = landingPagesFor('fleet')
const PRICES = { businessPrice: 1, vClassAirport: 2, sClassAirport: 3, hourlyFrom: 4, hourlyV: 5, hourlyS: 6 }

vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))
vi.mock('@/lib/landing-pages', async (orig) => ({
  ...(await orig<typeof import('@/lib/landing-pages')>()),
  getLandingPrices: async () => PRICES,
}))
vi.mock('next-intl/server', () => ({ setRequestLocale: () => {} }))

afterEach(() => cleanup())

beforeEach(() => {
  class MockIntersectionObserver {
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

function content(slug: string, locale: string): LandingContent {
  const file = path.join(process.cwd(), 'content', 'pages', locale, 'fleet', `${slug}.json`)
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

describe('fleet landing config', () => {
  it('has exactly the S-, V- and E-Class pages, each preselecting its booking class', () => {
    expect(FLEET.map((p) => p.slug).sort()).toEqual(['e-class', 's-class', 'v-class'])
    const cls = Object.fromEntries(FLEET.map((p) => [p.slug, p.ctaHref]))
    expect(cls['s-class']).toBe('/book?class=first_class')
    expect(cls['v-class']).toBe('/book?class=business_van')
    expect(cls['e-class']).toBe('/book?class=business')
  })

  it('capacities match the site-wide spec (E/S 3 pax 2+2, V 6 pax 6+6)', () => {
    const v = Object.fromEntries(FLEET.map((p) => [p.slug, p.vehicle!]))
    expect([v['e-class'].seating, v['e-class'].luggageCases, v['e-class'].luggageBags]).toEqual([3, 2, 2])
    expect([v['s-class'].seating, v['s-class'].luggageCases, v['s-class'].luggageBags]).toEqual([3, 2, 2])
    expect([v['v-class'].seating, v['v-class'].luggageCases, v['v-class'].luggageBags]).toEqual([6, 6, 6])
    for (const p of FLEET) {
      for (const locale of LOCALES) {
        const c = content(p.slug, locale)
        expect(c.vehicle?.seatsValue, `${locale}/${p.slug}`).toContain(String(p.vehicle!.seating))
        // ar spells small counts as dual nouns ("حقيبتان"), so only digit-bearing locales are checked here.
        if (locale !== 'ar') expect(c.vehicle?.luggageValue, `${locale}/${p.slug}`).toContain(String(p.vehicle!.luggageCases))
      }
    }
  })

  it('every vehicle photo and hero image exists in /public', () => {
    for (const p of FLEET) {
      expect(fs.existsSync(path.join(process.cwd(), 'public', p.vehicle!.photo)), p.vehicle!.photo).toBe(true)
      expect(fs.existsSync(path.join(process.cwd(), 'public', p.heroImage!)), p.heroImage).toBe(true)
    }
  })
})

describe('fleet snippets', () => {
  for (const p of FLEET) {
    it(`${p.slug}: titles lead with the model, no price, no brand misspelling`, () => {
      const model = p.vehicle!.model.replace('Mercedes-Benz ', 'Mercedes ')
      for (const locale of LOCALES) {
        const c = content(p.slug, locale)
        const { title, description, ogTitle } = c.metadata
        if (locale !== 'hi') expect(title.startsWith(model), `${locale}: ${title}`).toBe(true)
        else expect(title).toContain(model)
        for (const s of [title, description, ogTitle]) {
          expect(s).not.toMatch(/€|\{\w+\}|\d+\s?(EUR|eur)/)
          expect(s).not.toContain('| PRESTIGO') // the layout template adds it
        }
        expect(JSON.stringify(c)).not.toMatch(/Prestigio|rideprestigio/i)
        expect(c.faqs.length).toBeGreaterThanOrEqual(5)
        expect(c.faqs.length).toBeLessThanOrEqual(7)
      }
    })
  }
})

describe('fleet page metadata', () => {
  it('ru /fleet/v-class: self canonical + full 7-locale hreflang cluster', async () => {
    const { generateMetadata } = await import('@/app/[locale]/fleet/[slug]/page')
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'ru', slug: 'v-class' }) })
    expect(meta.title).toBe(content('v-class', 'ru').metadata.title)
    expect(String(meta.alternates?.canonical)).toMatch(/\/ru\/fleet\/v-class$/)
    const langs = Object.keys(meta.alternates?.languages ?? {})
    expect(langs).toEqual(expect.arrayContaining(['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh-Hans', 'x-default']))
  })

  it('generateStaticParams serves only the three vehicle slugs', async () => {
    const { generateStaticParams } = await import('@/app/[locale]/fleet/[slug]/page')
    expect(generateStaticParams().map((p) => p.slug).sort()).toEqual(['e-class', 's-class', 'v-class'])
  })
})

describe('fleet page render', () => {
  it.each([
    ['en', 's-class', '/book?class=first_class', '/fleet/v-class'],
    ['ru', 'v-class', '/ru/book?class=business_van', '/ru/fleet/s-class'],
    ['ar', 'e-class', '/ar/book?class=business', '/ar/fleet/s-class'],
  ] as const)('%s /fleet/%s: vehicle section, localized deeplink, sibling links, JSON-LD', async (locale, slug, bookHref, siblingHref) => {
    const { default: Page } = await import('@/app/[locale]/fleet/[slug]/page')
    const { render } = await import('@testing-library/react')
    const c = content(slug, locale)
    const { container } = render(await Page({ params: Promise.resolve({ locale, slug }) }))
    const html = container.innerHTML

    expect(container.querySelector('h1')?.textContent).toContain(c.hero.headlineLine1)
    expect(container.querySelector('#vehicle')?.textContent).toContain(c.vehicle!.seatsValue)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(bookHref)
    expect(hrefs).toContain(siblingHref)
    // Bottom CTA button is never empty.
    const ctas = Array.from(container.querySelectorAll('a.btn-primary'))
    for (const a of ctas) expect(a.textContent?.trim()).not.toBe('')

    const graphs = Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)).map((m) => JSON.parse(m[1]))
    const nodes = graphs.flatMap((g) => g['@graph'] ?? [g])
    const faq = nodes.find((n) => n['@type'] === 'FAQPage')
    expect(faq.mainEntity).toHaveLength(c.faqs.length)
    expect(faq.mainEntity[0].name).toBe(c.faqs[0].q)
    expect(nodes.find((n) => n['@type'] === 'Service')['@id']).toBe(`https://rideprestigo.com/fleet/${slug}#service`)
    const vehicle = nodes.find((n) => n['@type'] === 'Vehicle')
    expect(vehicle.url).toBe(`https://rideprestigo.com/fleet/${slug}`)
    const crumbs = nodes.find((n) => n['@type'] === 'BreadcrumbList').itemListElement
    expect(crumbs[1].item).toBe('https://rideprestigo.com/fleet')
  })
})

describe('/fleet hub links to every vehicle page', () => {
  it.each(['en', 'zh'] as const)('%s', async (locale) => {
    const { default: FleetPage } = await import('@/app/[locale]/fleet/page')
    const { render } = await import('@testing-library/react')
    const { container } = render(await FleetPage({ params: Promise.resolve({ locale }) }))
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    const prefix = locale === 'en' ? '' : `/${locale}`
    for (const slug of ['s-class', 'v-class', 'e-class']) expect(hrefs).toContain(`${prefix}/fleet/${slug}`)
    expect(hrefs).toContain(`${prefix}/book?class=first_class`)
  })
})
