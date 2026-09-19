import type { Metadata } from 'next'

export const revalidate = 120

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import HourlyBookingSection from '@/components/HourlyBookingSection'
import { getLocale } from 'next-intl/server'
import { getPricingConfig } from '@/lib/pricing-config'
import { businessNodeDoc } from '@/lib/jsonld'
import { getPageContent } from '@/lib/page-content'
import { interpolate, interpolateBidi } from '@/lib/content-interpolate'

type CityRidesContent = {
  metadata: { title: string; description: string; ogTitle: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string; ctaPrimary: string; ctaSecondary: string }
  priceCallout: { label: string; note: string; features: string[]; vClassLine: string; firstClassLine: string }
  featuresHeading: string
  features: { title: string; body: string }[]
  editorialHeading: string
  editorial: string[]
  useCasesHeading: string
  useCases: { title: string; body: string }[]
  cta: { label: string; headingLine1: string; headingItalic: string; buttonText: string }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getPageContent('services/city-rides', locale) as CityRidesContent
  const { hourlyRate } = await getPricingConfig()
  const from = hourlyRate['business'] ?? 49
  const description = interpolate(content.metadata.description, { from })
  return {
    title: { absolute: content.metadata.title },
    description,
    alternates: {
      canonical: '/services/city-rides',
      languages: {
        en: 'https://rideprestigo.com/services/city-rides',
        'x-default': 'https://rideprestigo.com/services/city-rides',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/services/city-rides',
      title: content.metadata.ogTitle,
      description,
      images: [{ url: 'https://rideprestigo.com/hero-city-rides.png', width: 1200, height: 630 }],
    },
  }
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'Car Rental with Chauffeur', item: 'https://rideprestigo.com/services/city-rides' },
  ],
}

export default async function CityRidesPage() {
  const locale = await getLocale()
  const content = getPageContent('services/city-rides', locale) as CityRidesContent
  const { hourlyRate } = await getPricingConfig()
  const businessHourly = hourlyRate['business'] ?? 49
  const firstClassHourly = hourlyRate['first_class'] ?? 120
  const vClassHourly = hourlyRate['business_van'] ?? 76

  const features = content.features
  const editorial = content.editorial
  const useCases = content.useCases
  const vClassLine = interpolateBidi(content.priceCallout.vClassLine, { vClassHourly })
  const firstClassLine = interpolateBidi(content.priceCallout.firstClassLine, { firstClassHourly })

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: features.map((item) => ({
      '@type': 'Question',
      name: item.title,
      acceptedAnswer: { '@type': 'Answer', text: item.body },
    })),
  }

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Car Rental with Chauffeur in Prague — Hourly Hire',
    description: 'Rent a car with a private chauffeur in Prague by the hour — for business meetings, sightseeing, leisure, dining, and events. Same Mercedes fleet and chauffeur standard as our airport service, at city rates.',
    provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
    areaServed: 'Prague, Czech Republic',
    url: 'https://rideprestigo.com/services/city-rides',
    offers: { '@type': 'Offer', price: String(businessHourly), priceCurrency: 'EUR' },
  }

  const businessDoc = businessNodeDoc()

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {businessDoc && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessDoc) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-city-rides.png" alt="Prague City Rides — PRESTIGO" fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            {content.hero.headlineLine1}<br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            {content.hero.intro}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/book" className="btn-primary">{content.hero.ctaPrimary}</a>
            <a href="/services" className="btn-secondary">{content.hero.ctaSecondary}</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* Price callout */}
      <section className="bg-anthracite-mid py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--warmgrey)' }}>{content.priceCallout.label}</p>
            <p className="font-display font-light text-[42px] md:text-[52px] text-offwhite">€<bdi>{businessHourly}</bdi><span className="text-[24px]">/hr</span></p>
            <p className="body-text text-[11px] mt-1">{content.priceCallout.note}</p>
          </div>
          <div className="flex flex-col gap-2">
            {content.priceCallout.features.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 text-end">
            <p className="font-body font-light text-[11px] text-warmgrey">
              {vClassLine}
            </p>
            <p className="font-body font-light text-[11px] text-warmgrey">
              {firstClassLine}
            </p>
          </div>
        </div>
      </section>

      <Divider />

      {/* Booking widget — hourly default */}
      <HourlyBookingSection />

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

      {/* Editorial — service depth */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.editorialHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="max-w-3xl flex flex-col gap-6">
            {editorial.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{para}</p>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Use cases */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.useCasesHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
            {useCases.map((u) => (
              <div key={u.title} className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{u.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <p className="label mb-6">{content.cta.label}</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            {content.cta.headingLine1} <br />
            <span className="display-italic">{content.cta.headingItalic}</span>
          </h2>
          <div className="mt-10">
            <a href="/book" className="btn-primary">{content.cta.buttonText}</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
