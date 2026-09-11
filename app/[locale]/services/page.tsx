import type { Metadata } from 'next'

export const revalidate = 120

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import { getLocale } from 'next-intl/server'
import { getPricingConfig } from '@/lib/pricing-config'
import { getAllRoutes } from '@/lib/route-prices'
import { AIRPORT_FALLBACK } from '@/lib/price-fallbacks'
import { businessNodeDoc } from '@/lib/jsonld'
import { getPageContent } from '@/lib/page-content'
import { interpolate } from '@/lib/content-interpolate'

interface ServiceEntry {
  label: string
  title: string
  description: string
  features: string[]
  price: string | null
  cta: string
  href: string
  bookHref: string
  bookCta: string
  isNew?: boolean
  image?: string
}

type ServicesHubContent = {
  metadata: { title: string; description: string; ogTitle: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string }
  services: ServiceEntry[]
  trustHeading: string
  trust: { title: string; body: string }[]
  faqHeading: { label: string; title: string }
  faqs: { q: string; a: string }[]
  cta: { label: string; headingLine1: string; headingItalic: string; buttonText: string }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getPageContent('services', locale) as ServicesHubContent
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates: {
      canonical: '/services',
      languages: {
        en: 'https://rideprestigo.com/services',
        'x-default': 'https://rideprestigo.com/services',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/services',
      title: content.metadata.ogTitle,
      description: content.metadata.description,
      images: [{ url: 'https://rideprestigo.com/og-image.jpg', width: 1200, height: 630 }],
    },
  }
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
  ],
}

export default async function ServicesPage() {
  const locale = await getLocale()
  const content = getPageContent('services', locale) as ServicesHubContent
  const { globals, hourlyRate } = await getPricingConfig()
  const routes = await getAllRoutes('display_order')
  const cheapestIntercity = routes.length > 0 ? Math.min(...routes.map(r => r.eClassEur)) : AIRPORT_FALLBACK.regular
  const airportFrom = globals.airportPromoActive ? globals.airportPromoPriceEur : globals.airportRegularPriceEur
  const hourlyFrom = hourlyRate['business'] ?? AIRPORT_FALLBACK.regular

  // Named route lookups for FAQ copy
  const budapest = routes.find(r => r.slug === 'prague-budapest')?.eClassEur ?? 885
  const vienna = routes.find(r => r.slug === 'prague-vienna')?.eClassEur ?? 485
  const berlin = routes.find(r => r.slug === 'prague-berlin')?.eClassEur ?? 580
  const munich = routes.find(r => r.slug === 'prague-munich')?.eClassEur ?? 635
  const kutnaHora = routes.find(r => r.slug === 'prague-kutna-hora')?.eClassEur ?? 115

  const prices = {
    airportFrom,
    hourlyFrom,
    cheapestIntercity,
    budapest,
    vienna,
    berlin,
    munich,
    kutnaHora,
    sClassFallback: AIRPORT_FALLBACK.sClass,
    vClassFallback: AIRPORT_FALLBACK.vClass,
  }

  const services: ServiceEntry[] = content.services.map((s) => ({
    ...s,
    price: s.price ? interpolate(s.price, prices) : null,
  }))

  const trust = content.trust

  // Substantive answers aimed at AI engines (ChatGPT, Perplexity, Claude,
  // Google AI Overviews). FAQPage rich results no longer surface for non-gov
  // sites (Aug 2023 deprecation), but the markup still fuels passage-level
  // citation in generative search.
  const servicesFaqs = content.faqs.map((f) => ({ q: f.q, a: interpolate(f.a, prices) }))

  const serviceListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'PRESTIGO Chauffeur Services Prague',
    itemListElement: services.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Service',
        name: s.title,
        description: s.description,
        provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
        areaServed: 'Prague, Czech Republic',
        url: `https://rideprestigo.com${s.href}`,
        ...(s.price ? { offers: { '@type': 'Offer', price: s.price.replace(/[^0-9]/g, ''), priceCurrency: 'EUR' } } : {}),
      },
    })),
  }

  const servicesFaqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': 'https://rideprestigo.com/services#faq',
    mainEntity: servicesFaqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  const businessDoc = businessNodeDoc()

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(servicesFaqSchema) }} />
      {businessDoc && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessDoc) }} />}
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            {content.hero.headlineLine1} <br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            {content.hero.intro}
          </p>
        </div>
      </section>

      {/* Service cards */}
      <section className="bg-anthracite py-16 md:py-24">
        {/* top divider */}
        <div style={{ height: '1px', background: 'linear-gradient(to right, transparent 0%, var(--copper) 50%, transparent 100%)' }} />
        <div className="flex flex-col gap-0">
          {services.map((s, i) => {
            const cardContent = (
              <>
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <p className="label">{s.label}</p>
                    {s.isNew && (
                      <span className="font-body font-light text-[8px] tracking-[0.14em] uppercase px-1.5 py-0.5 border border-copper/60 text-copper-light leading-none">NEW</span>
                    )}
                  </div>
                  <h2 className="display text-[28px] md:text-[34px] mb-4">{s.title}</h2>
                  <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{s.description}</p>
                  {s.price && (
                    <p className="font-body font-light text-[13px] mt-6" style={{ color: 'var(--copper-light)' }}>
                      {s.price}
                    </p>
                  )}
                </div>
                <div className="flex flex-col justify-between gap-8">
                  <ul className="flex flex-col gap-3">
                    {s.features.map((f) => (
                      <li key={f} className="flex items-start gap-3">
                        <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                        <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    <a href={s.href} className="btn-primary self-start">
                      {s.cta}
                    </a>
                    <a href={s.bookHref} className="btn-secondary self-start">
                      {s.bookCta}
                    </a>
                  </div>
                </div>
              </>
            )

            const divider = (
              <div style={{ height: '1px', background: 'linear-gradient(to right, transparent 0%, var(--copper) 50%, transparent 100%)' }} />
            )

            if (s.image) {
              return (
                <Reveal key={s.title} variant="up" delay={i * 80}>
                <div
                  className="relative overflow-hidden"
                  style={{
                    backgroundImage: `url(${s.image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    minHeight: '460px',
                  }}
                >
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(28,28,30,0.92) 30%, rgba(28,28,30,0.55) 100%)' }} />
                  <div className="relative z-10 max-w-7xl mx-auto py-14 md:py-16 px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
                    {cardContent}
                  </div>
                </div>
                {divider}
                </Reveal>
              )
            }

            return (
              <Reveal key={s.title} variant="up" delay={i * 80}>
              <div>
                <div className="max-w-7xl mx-auto py-14 md:py-16 px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
                  {cardContent}
                </div>
              </div>
              {divider}
              </Reveal>
            )
          })}
        </div>
        {/* bottom divider */}
        <div style={{ height: '1px', background: 'linear-gradient(to right, transparent 0%, var(--copper) 50%, transparent 100%)' }} />
      </section>

      {/* Trust block */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <h2 className="display text-[28px] md:text-[36px] mb-14 text-center">{content.trustHeading}</h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {trust.map((t, i) => (
              <Reveal key={t.title} variant="up" delay={i * 120}>
              <div className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{t.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{t.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <p className="label mb-6">{content.faqHeading.label}</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-12">{content.faqHeading.title}</h2>
          </Reveal>
          <div className="flex flex-col gap-0">
            {servicesFaqs.map((faq, i) => (
              <Reveal key={faq.q} variant="up" delay={i * 70}>
              <div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}>
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <Reveal variant="up">
          <p className="label mb-6">{content.cta.label}</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            {content.cta.headingLine1} <br />
            <span className="display-italic">{content.cta.headingItalic}</span>
          </h2>
          </Reveal>
          <Reveal variant="fade" delay={150}>
          <div className="mt-10">
            <a href="/book" className="btn-primary">{content.cta.buttonText}</a>
          </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
