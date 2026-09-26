import type { Metadata } from 'next'

export const revalidate = 120

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { ROUTES } from '@/lib/routes'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'
import { getAllRoutes } from '@/lib/route-prices'
import { ROUTE_FALLBACK } from '@/lib/price-fallbacks'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { getPageContent } from '@/lib/page-content'
import { interpolate } from '@/lib/content-interpolate'
import { getPathname } from '@/i18n/routing'

type RoutesContent = {
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string }
  imageAlt: string
  fromToLabel: string
  popular: {
    label: string
    headingLine1: string
    headingItalic: string
    fromLabels: { eClass: string; vClass: string; sClass: string }
    viewRoute: string
  }
  whyPrivate: { label: string; headingLine1: string; headingItalic: string; paragraphs: string[] }
  countries: {
    label: string
    headingOne: string
    headingMany: string
    introOne: string
    introMany: string
    introSuffix: string
    cardLabels: { distance: string; duration: string; price: string }
    bookButton: string
    routeDetails: string
  }
  destinationNames: Record<string, string>
  countryNames: Record<string, string>
  howItWorks: { heading: string; steps: { title: string; body: string }[] }
  borders: { label: string; headingLine1: string; headingItalic: string; items: { title: string; body: string }[] }
  luggage: {
    label: string
    headingLine1: string
    headingItalic: string
    intro: string
    items: { t: string; b: string }[]
  }
  longDistance: { label: string; headingLine1: string; headingItalic: string; intro: string; destinations: string[] }
  faq: { heading: string; items: { q: string; a: string }[] }
  cta: { headingLine1: string; headingItalic: string; intro: string; bookButton: string; contactButton: string }
  metadata: { title: string; description: string; ogTitle: string; ogDescription: string }
}

// Structural, locale-invariant long-distance destination list (D-08
// prohibition: slugs/structural data stay in code) — the href query param
// always carries the EN city name; only the visible label is localized via
// content.longDistance.destinations, zipped by index with this array.
const LONG_DISTANCE_CITIES_EN = [
  'Erfurt', 'Frankfurt', 'Augsburg', 'Stuttgart', 'Cologne',
  'Düsseldorf', 'Hamburg', 'Innsbruck', 'Košice', 'Basel',
  'Zürich', 'Bern', 'Geneva', 'Venice', 'Verona',
  'Milan', 'Strasbourg', 'Paris', 'Brussels', 'Amsterdam',
]

// 75-09: /routes now has a content model (content/pages/<locale>/routes.json)
// -> content: { kind: 'page', key: 'routes' } makes the hreflang cluster
// translation-aware (Phase 74 D-07), not "all locales assumed valid".
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('routes', locale) as RoutesContent
  const routes = await getAllRoutes('display_order')
  const vienna = routes.find((r) => r.slug === 'prague-vienna')
  const berlin = routes.find((r) => r.slug === 'prague-berlin')
  const munich = routes.find((r) => r.slug === 'prague-munich')
  const budapest = routes.find((r) => r.slug === 'prague-budapest')
  const viennaPrice = vienna?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const berlinPrice = berlin?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const munichPrice = munich?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const budapestPrice = budapest?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const priceValues = { viennaPrice, berlinPrice, munichPrice, budapestPrice }
  const description = interpolate(content.metadata.description, priceValues)
  const alternates = getAlternates('/routes', { indexable: true, content: { kind: 'page', key: 'routes' }, locale })
  return {
    title: content.metadata.title,
    description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description: interpolate(content.metadata.ogDescription, priceValues),
      images: [{ url: 'https://rideprestigo.com/hero-intercity-routes.png', width: 1200, height: 630 }],
    },
  }
}

// Route data is sourced from lib/routes.ts — single source of truth for the
// 30 indexed intercity routes. See that file to add/remove/reorder routes.
// Per-route h2/description/notes stay English (structural, code-owned) —
// only the surrounding chrome (labels, headings, buttons) and the
// destination/country display names are localized via the content model.

const routesBreadcrumbSchema = {
  '@type': 'BreadcrumbList',
  '@id': 'https://rideprestigo.com/routes#breadcrumb',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
  ],
}

export default async function RoutesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('routes', locale) as RoutesContent
  const { destinationNames, countryNames } = content

  const routesFaqSchema = {
    '@type': 'FAQPage',
    '@id': 'https://rideprestigo.com/routes#faq',
    mainEntity: content.faq.items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@graph': [routesBreadcrumbSchema, routesFaqSchema],
  }

  const dbRoutes = await getAllRoutes('display_order')
  const top10 = dbRoutes.slice(0, 10)

  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-intercity-routes.png" alt={content.imageAlt} fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[length:clamp(30px,10vw,40px)] md:text-[56px] max-w-xl">
            {content.hero.headlineLine1}<br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            {content.hero.intro}
          </p>
        </div>
      </section>

      <Divider />

      {/* Top 10 routes — DB-driven pricing */}
      {top10.length > 0 && (
        <>
          <section className="bg-anthracite py-16 md:py-20">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <Reveal variant="up"><div className="mb-10">
                <p className="label mb-4">{content.popular.label}</p>
                <span className="copper-line mb-6 block" />
                <h2 className="display text-[28px] md:text-[36px]">{content.popular.headingLine1}<br /><span className="display-italic">{content.popular.headingItalic}</span></h2>
              </div></Reveal>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {top10.map((r, i) => {
                  const cityName = destinationNames[r.slug] ?? r.toLabel
                  return (
                  <Reveal key={r.slug} variant="up" delay={i * 60}>
                    <a href={getPathname({ locale, href: `/routes/${r.slug}` })} className="border border-anthracite-light p-6 flex flex-col gap-4 hover:border-[var(--copper)] transition-colors group">
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--copper)' }}>{interpolate(content.fromToLabel, { city: cityName })}</p>
                        <p className="font-display font-light text-[20px] text-offwhite">{cityName}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="font-body font-light text-[10px] text-warmgrey tracking-[0.05em]">{content.popular.fromLabels.eClass}</span>
                          <span className="font-body font-light text-[13px]" style={{ color: 'var(--copper-light)' }}>€{r.eClassEur}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-body font-light text-[10px] text-warmgrey tracking-[0.05em]">{content.popular.fromLabels.vClass}</span>
                          <span className="font-body font-light text-[11px] text-offwhite">€{r.vClassEur}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-body font-light text-[10px] text-warmgrey tracking-[0.05em]">{content.popular.fromLabels.sClass}</span>
                          <span className="font-body font-light text-[11px] text-offwhite">€{r.sClassEur}</span>
                        </div>
                      </div>
                      <p className="font-body font-light text-[10px] tracking-[0.1em] uppercase mt-auto" style={{ color: 'var(--copper)' }}>
                        {content.popular.viewRoute}
                      </p>
                    </a>
                  </Reveal>
                  )
                })}
              </div>
            </div>
          </section>
          <Divider />
        </>
      )}

      {/* Planning intercity travel */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-10 md:gap-16">
          <Reveal variant="up" className="md:col-span-2"><div>
            <p className="label mb-6">{content.whyPrivate.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">{content.whyPrivate.headingLine1}<span className="display-italic">{content.whyPrivate.headingItalic}</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150} className="md:col-span-3"><div className="flex flex-col gap-5">
            {content.whyPrivate.paragraphs.map((p, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {p}
              </p>
            ))}
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Route sections — grouped by country to replace 30 H2s with 7 country
          H2s and route H3s nested beneath, collapsing the H2 count from 54 to
          well under 15 across the whole page. */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col gap-16">
          {(() => {
            // Sort routes within each country by distance, then group.
            const byCountry: Record<string, typeof ROUTES> = {}
            for (const r of ROUTES) {
              if (!byCountry[r.country]) byCountry[r.country] = []
              byCountry[r.country].push(r)
            }
            // Country display order: CZ first, then international by shortest
            // available route distance.
            const order = Object.keys(byCountry).sort((a, b) => {
              if (a === 'Czech Republic') return -1
              if (b === 'Czech Republic') return 1
              const minA = Math.min(...byCountry[a].map((x) => x.distanceKm))
              const minB = Math.min(...byCountry[b].map((x) => x.distanceKm))
              return minA - minB
            })
            return order.map((country) => {
              const routes = byCountry[country].slice().sort((a, b) => a.distanceKm - b.distanceKm)
              const countryId = country.toLowerCase().replace(/\s+/g, '-')
              const countryLabel = countryNames[country] ?? country
              const headingSuffix =
                routes.length === 1
                  ? content.countries.headingOne
                  : interpolate(content.countries.headingMany, { count: routes.length })
              const introText =
                routes.length === 1
                  ? interpolate(content.countries.introOne, { country: countryLabel })
                  : interpolate(content.countries.introMany, { count: routes.length, country: countryLabel })
              return (
                <div key={country} className="flex flex-col">
                  {/* Country H2 */}
                  <Reveal variant="up"><div className="mb-10" id={`routes-${countryId}`}>
                    <p className="label mb-4">{content.countries.label}</p>
                    <span className="copper-line mb-6 block" />
                    <h2 className="display text-[32px] md:text-[44px]">
                      {countryLabel}<span className="display-italic"> — {headingSuffix}</span>
                    </h2>
                    <p className="body-text text-[13px] mt-4 max-w-2xl" style={{ lineHeight: '1.9' }}>
                      {introText}
                      {' '}{content.countries.introSuffix}
                    </p>
                  </div></Reveal>
                  <div className="flex flex-col gap-0">
          {routes.map((r, i) => {
            const hasImage = Boolean(r.image)
            const cityName = destinationNames[r.slug] ?? r.city
            const cardContent = (
              <>
                <div>
                  <p className="label mb-4">{interpolate(content.fromToLabel, { city: cityName })}</p>
                  <h3 className="display text-[26px] md:text-[32px] mb-4">{r.h2}</h3>
                  <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{r.description}</p>
                </div>
                <div className="flex flex-col justify-between gap-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-6">
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{content.countries.cardLabels.distance}</p>
                        <p className="font-body font-light text-[13px] text-offwhite">{r.distance}</p>
                      </div>
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{content.countries.cardLabels.duration}</p>
                        <p className="font-body font-light text-[13px] text-offwhite">{r.duration}</p>
                      </div>
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{content.countries.cardLabels.price}</p>
                        <p className="font-body font-light text-[13px]" style={{ color: 'var(--copper-light)' }}>{r.priceFrom}</p>
                      </div>
                    </div>
                    {r.notes.length > 0 && (
                      <ul className="flex flex-col gap-2 mt-2">
                        {r.notes.map((n) => (
                          <li key={n} className="flex items-start gap-3">
                            <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                            <span className="font-body font-light text-[12px] text-warmgrey">{n}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a href={getPathname({ locale, href: '/book' })} className="btn-primary self-start" style={{ padding: '10px 24px', fontSize: '9px' }}>
                      {interpolate(content.countries.bookButton, { city: cityName })}
                    </a>
                    <a href={getPathname({ locale, href: `/routes/${r.slug}` })} className="btn-ghost self-start" style={{ padding: '10px 24px', fontSize: '9px' }}>
                      {content.countries.routeDetails}
                    </a>
                  </div>
                </div>
              </>
            )
            if (hasImage && r.image) {
              return (
                <Reveal key={r.slug} variant="up" delay={i * 80}>
                <div
                  className={`relative overflow-hidden border-b border-anthracite-light -mx-6 md:-mx-12 ${i === 0 ? 'border-t' : ''}`}
                  style={{
                    backgroundImage: `url(${r.image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    minHeight: '460px',
                  }}
                >
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(28,28,30,0.92) 30%, rgba(28,28,30,0.55) 100%)' }} />
                  <div className="relative z-10 py-14 md:py-16 px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
                    {cardContent}
                  </div>
                </div>
                </Reveal>
              )
            }
            return (
              <Reveal key={r.slug} variant="up" delay={i * 80}>
              <div
                className={`py-14 md:py-16 border-b border-anthracite-light grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 ${i === 0 ? 'border-t' : ''}`}
              >
                {cardContent}
              </div>
              </Reveal>
            )
          })}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </section>

      <Divider />

      {/* How it works */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[36px] mb-14">{content.howItWorks.heading}</h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {['01', '02', '03'].map((step, i) => {
              const s = content.howItWorks.steps[i]
              return (
              <Reveal key={step} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{step}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div></Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <Divider />

      {/* Border crossings, tolls, paperwork */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><div className="mb-14">
            <p className="label mb-6">{content.borders.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">{content.borders.headingLine1}<br /><span className="display-italic">{content.borders.headingItalic}</span></h2>
          </div></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {content.borders.items.map((item, i) => (
              <Reveal key={item.title} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8">
                <span className="copper-line mb-5 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{item.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.body}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Luggage, pets, child seats */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up"><div>
            <p className="label mb-6">{content.luggage.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">{content.luggage.headingLine1}<span className="display-italic">{content.luggage.headingItalic}</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.luggage.intro}
            </p>
          </div></Reveal>
          <Reveal variant="up" delay={150}><ul className="flex flex-col gap-4">
            {content.luggage.items.map((item) => (
              <li key={item.t} className="flex items-start gap-4 py-3 border-b border-anthracite-light last:border-0">
                <span className="mt-[8px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <div>
                  <p className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-1" dangerouslySetInnerHTML={{ __html: item.t }} />
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }} dangerouslySetInnerHTML={{ __html: item.b }} />
                </div>
              </li>
            ))}
          </ul></Reveal>
        </div>
      </section>

      <Divider />

      {/* Long-distance / red routes — noindex, quote on request */}
      <section className="theme-light bg-anthracite-mid py-14 md:py-16">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.longDistance.label}</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[24px] md:text-[30px] mb-4">
            {content.longDistance.headingLine1}<span className="display-italic">{content.longDistance.headingItalic}</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            {content.longDistance.intro}
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {LONG_DISTANCE_CITIES_EN.map((enLabel, i) => {
              const displayLabel = content.longDistance.destinations[i] ?? enLabel
              const contactPath = getPathname({ locale, href: '/contact' })
              return (
              <li key={enLabel}>
                <a
                  href={`${contactPath}?destination=${encodeURIComponent(enLabel)}`}
                  className="flex items-center justify-between border border-anthracite-light px-4 py-3 hover:border-copper/40 transition-colors group"
                >
                  <span className="font-body font-light text-[12px] text-warmgrey group-hover:text-offwhite transition-colors">{interpolate(content.fromToLabel, { city: displayLabel })}</span>
                  <span className="font-body text-[10px]" style={{ color: 'var(--copper)' }}>→</span>
                </a>
              </li>
              )
            })}
          </ul>
        </div>
      </section>

      <Divider />

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[34px] mb-12">{content.faq.heading}</h2></Reveal>
          <div className="flex flex-col gap-0">
            {content.faq.items.map((faq, i) => (
              <Reveal key={faq.q} variant="up" delay={i * 60}><div
                className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
              >
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="theme-light bg-anthracite-mid py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up"><div>
            <h2 className="display text-[28px] md:text-[36px]">
              {content.cta.headingLine1}<br />
              <span className="display-italic">{content.cta.headingItalic}</span>
            </h2>
            <p className="body-text text-[13px] mt-4">{content.cta.intro}</p>
          </div></Reveal>
          <Reveal variant="fade" delay={100}><div className="flex flex-col sm:flex-row gap-4">
            <a href={getPathname({ locale, href: '/book' })} className="btn-primary">{content.cta.bookButton}</a>
            <a href={getPathname({ locale, href: '/contact' })} className="btn-ghost">{content.cta.contactButton}</a>
          </div></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
