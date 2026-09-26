import type { Metadata } from 'next'

export const revalidate = 120

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import BookingSection from '@/components/BookingSection'
import { getLocale } from 'next-intl/server'
import { getPricingConfig } from '@/lib/pricing-config'
import { buildAirportTransferJsonLd } from '@/lib/jsonld'
import { AIRPORT_FALLBACK } from '@/lib/price-fallbacks'
import { getStaticAggregateRating } from '@/lib/google-reviews'
import { getPageContent } from '@/lib/page-content'
import { interpolate, interpolateBidi } from '@/lib/content-interpolate'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { localizedHref } from '@/lib/localized-href'

type AirportTransferContent = {
  metadata: { title: string; description: string; ogTitle: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string; ctaPrimary: string; ctaSecondary: string; imageAlt: string }
  featuresHeading: string
  features: { title: string; body: string }[]
  meetGreet: { label: string; heading: string; paragraph1: string; paragraph2: string; items: string[] }
  howItWorksHeading: string
  howItWorks: { step: string; title: string; body: string }[]
  journeyTimesHeading: string
  journeyTimes: { paragraph1: string; paragraph2: string; items: { place: string; time: string }[] }
  vehicleClassesHeading: string
  vehicleClasses: { name: string; tag: string; cap: string; price: string; body: string }[]
  faqsHeading: string
  faqs: { q: string; a: string }[]
  cta: { label: string; headingLine1: string; headingItalic: string; buttonText: string }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getPageContent('services/airport-transfer', locale) as AirportTransferContent
  const { globals } = await getPricingConfig()
  const businessPrice = globals.airportPromoActive
    ? globals.airportPromoPriceEur
    : globals.airportRegularPriceEur
  const description = interpolate(content.metadata.description, { businessPrice })
  const alternates = getAlternates('/services/airport-transfer', {
    indexable: true,
    content: { kind: 'page', key: 'services/airport-transfer' },
    locale,
  })
  return {
    title: content.metadata.title,
    description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description,
      images: [{ url: 'https://rideprestigo.com/hero-airport-transfer.webp', width: 1200, height: 630 }],
    },
  }
}

export default async function AirportTransferPage() {
  const locale = await getLocale()
  const content = getPageContent('services/airport-transfer', locale) as AirportTransferContent
  const { globals } = await getPricingConfig()
  const sClassAirport = AIRPORT_FALLBACK.sClass
  const vClassAirport = AIRPORT_FALLBACK.vClass
  const businessPrice = globals.airportPromoActive
    ? globals.airportPromoPriceEur
    : globals.airportRegularPriceEur

  const prices = { businessPrice, vClassAirport, sClassAirport }

  // WR-01: thread the already-loaded localized content into the JSON-LD
  // Service node's name/description — previously only `locale` was passed,
  // so inLanguage correctly flipped to e.g. "ru" while name/description
  // stayed the hardcoded EN strings. description is interpolated with the
  // same businessPrice token generateMetadata() above already uses, so the
  // {businessPrice} placeholder never leaks into the JSON-LD literally.
  const airportJsonLd = buildAirportTransferJsonLd(globals, sClassAirport, vClassAirport, {
    locale,
    name: content.metadata.ogTitle,
    description: interpolate(content.metadata.description, { businessPrice }),
  })
  const rating = getStaticAggregateRating()

  const features = content.features
  const faqs = content.faqs
  const howItWorks = content.howItWorks
  const journeyTimes = content.journeyTimes.items
  const meetGreetItems = content.meetGreet.items
  const vehicleClasses = content.vehicleClasses.map((v) => ({ ...v, price: interpolate(v.price, prices) }))
  const heroIntro = interpolateBidi(content.hero.intro, prices)

  const pageSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      ...airportJsonLd['@graph'],
      ...(rating ? [{
        '@type': ['LocalBusiness', 'TaxiService'],
        '@id': 'https://rideprestigo.com/#business',
        name: 'PRESTIGO',
        url: 'https://rideprestigo.com',
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: rating.ratingValue.toFixed(1),
          reviewCount: rating.reviewCount,
          bestRating: '5',
          worstRating: '1',
        },
      }] : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
          { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
          { '@type': 'ListItem', position: 3, name: 'Airport Transfer', item: 'https://rideprestigo.com/services/airport-transfer' },
        ],
      },
    ],
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-airport-transfer.webp" alt={content.hero.imageAlt} fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[length:clamp(30px,10vw,40px)] md:text-[56px] max-w-2xl">
            {content.hero.headlineLine1} <br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            {heroIntro}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href={localizedHref(locale, '/book')} className="btn-primary">{content.hero.ctaPrimary}</a>
            <a href={localizedHref(locale, '/services')} className="btn-secondary">{content.hero.ctaSecondary}</a>
          </div>
        </div>
      </section>

      <BookingSection />

      <Divider />


      {/* Features */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.featuresHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {features.map((f) => (
              <div key={f.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h2 className="font-display font-light text-[22px] text-offwhite mb-3">{f.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Meet & Greet */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.meetGreet.label}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-14">
            <div>
              <h2 className="font-display font-light text-[26px] md:text-[30px] text-offwhite mb-5">
                {content.meetGreet.heading}
              </h2>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {content.meetGreet.paragraph1}
              </p>
              <p className="body-text text-[13px] mt-4" style={{ lineHeight: '1.9' }}>
                {content.meetGreet.paragraph2}
              </p>
            </div>
            <div className="flex flex-col gap-0">
              {meetGreetItems.map((line) => (
                <div key={line} className="border-b border-anthracite-light py-3">
                  <span className="font-body font-light text-[12px] text-offwhite tracking-wide" style={{ lineHeight: '1.7' }}>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* How it works */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.howItWorksHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {howItWorks.map((s) => (
              <div key={s.step} className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Journey times */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.journeyTimesHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-14">
            <div>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {content.journeyTimes.paragraph1}
              </p>
              <p className="body-text text-[13px] mt-4" style={{ lineHeight: '1.9' }}>
                {content.journeyTimes.paragraph2}
              </p>
            </div>
            <div className="flex flex-col gap-0">
              {journeyTimes.map((r) => (
                <div key={r.place} className="flex items-center justify-between border-b border-anthracite-light py-3">
                  <span className="font-body font-light text-[12px] text-offwhite tracking-wide">{r.place}</span>
                  <span className="font-body font-light text-[12px] tracking-[0.1em]" style={{ color: 'var(--copper)' }}>{r.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* Vehicle classes */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.vehicleClassesHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {vehicleClasses.map((v) => (
              <div key={v.name} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-1 hyphens-auto break-words" style={{ color: 'var(--warmgrey)' }}>{v.tag}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-1">Mercedes {v.name}</h3>
                <p className="font-body font-light text-[11px] tracking-wide mb-4" style={{ color: 'var(--copper)' }}><bdi>{v.price}</bdi> · {v.cap}</p>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.faqsHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {faqs.map((item) => (
              <div key={item.q} className="border border-anthracite-light p-8">
                <h3 className="font-display font-light text-[18px] text-offwhite mb-3">{item.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite-mid py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <p className="label mb-6">{content.cta.label}</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            {content.cta.headingLine1} <br />
            <span className="display-italic">{content.cta.headingItalic}</span>
          </h2>
          <div className="mt-10">
            <a href={localizedHref(locale, '/book')} className="btn-primary">{content.cta.buttonText}</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
