import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import { businessNodeDoc } from '@/lib/jsonld'
import { getPageContent } from '@/lib/page-content'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { BCP47_TAG, type AppLocale } from '@/i18n/locales'
import { localizedHref } from '@/lib/localized-href'

type VipEventsContent = {
  metadata: { title: string; description: string; ogTitle: string; ogDescription: string }
  serviceDescription: string
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string; ctaPrimary: string; ctaSecondary: string; imageAlt: string }
  pricingCallout: { label: string; heading: string; note: string; items: string[] }
  featuresHeading: string
  features: { title: string; body: string }[]
  editorialHeading: string
  editorial: string[]
  occasionsHeading: string
  occasions: { title: string; body: string }[]
  cta: { label: string; headingLine1: string; headingItalic: string; body: string; buttonText: string }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('services/vip-events', locale) as VipEventsContent
  const alternates = getAlternates('/services/vip-events', { indexable: true, content: { kind: 'page', key: 'services/vip-events' }, locale })
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description: content.metadata.ogDescription,
      images: [{ url: 'https://rideprestigo.com/hero-vip-events.png', width: 1200, height: 630 }],
    },
  }
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'VIP & Events', item: 'https://rideprestigo.com/services/vip-events' },
  ],
}

export default async function VipEventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('services/vip-events', locale) as VipEventsContent
  const businessDoc = businessNodeDoc()

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'VIP & Events Chauffeur Prague',
    description: content.serviceDescription,
    inLanguage: BCP47_TAG[locale as AppLocale],
    provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
    areaServed: 'Prague, Czech Republic',
    url: 'https://rideprestigo.com/services/vip-events',
  }

  const features = content.features
  const editorial = content.editorial
  const occasions = content.occasions

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: features.map((item) => ({
      '@type': 'Question',
      name: item.title,
      acceptedAnswer: { '@type': 'Answer', text: item.body },
    })),
  }

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
          <Image src="/hero-vip-events.png" alt={content.hero.imageAlt} fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[length:clamp(30px,10vw,40px)] md:text-[56px] max-w-2xl">
            {content.hero.headlineLine1} <br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            {content.hero.intro}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href={localizedHref(locale, '/contact')} className="btn-primary">{content.hero.ctaPrimary}</a>
            <a href={localizedHref(locale, '/services')} className="btn-secondary">{content.hero.ctaSecondary}</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* On request callout */}
      <section className="bg-anthracite-mid py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--warmgrey)' }}>{content.pricingCallout.label}</p>
            <p className="font-display font-light text-[28px] md:text-[36px] text-offwhite">{content.pricingCallout.heading}</p>
            <p className="body-text text-[11px] mt-1">{content.pricingCallout.note}</p>
          </div>
          <div className="flex flex-col gap-2">
            {content.pricingCallout.items.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

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
      <section className="bg-anthracite py-16 md:py-24">
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

      {/* Occasions */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.occasionsHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
            {occasions.map((o) => (
              <div key={o.title} className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{o.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{o.body}</p>
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
          <p className="body-text text-[13px] mt-4 max-w-md mx-auto" style={{ lineHeight: '1.9' }}>
            {content.cta.body}
          </p>
          <div className="mt-10">
            <a href={localizedHref(locale, '/contact')} className="btn-primary">{content.cta.buttonText}</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
