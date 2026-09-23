import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import { businessNodeDoc } from '@/lib/jsonld'
import { getPageContent } from '@/lib/page-content'
import { getAlternates } from '@/lib/seo'
import { BCP47_TAG, type AppLocale } from '@/i18n/locales'

type CorporateAccountsContent = {
  metadata: { title: string; description: string; ogTitle: string; ogDescription: string }
  serviceDescription: string
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string; ctaPrimary: string; ctaSecondary: string }
  pricingCallout: { label: string; heading: string; note: string; items: string[] }
  benefitsHeading: string
  benefits: { title: string; body: string }[]
  builtForHeading: string
  builtFor: { title: string; body: string }[]
  howItWorksHeading: string
  howItWorks: { step: string; title: string; body: string }[]
  cta: { label: string; headingLine1: string; headingItalic: string; buttonText: string }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('services/corporate-accounts', locale) as CorporateAccountsContent
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    robots: { index: false, follow: true },
    // indexable: false -> CR-01's self-referencing-canonical branch never
    // triggers (D-06: noindex canonical shape is intentionally unchanged),
    // so `locale` is a no-op here — passed anyway for sweep consistency.
    alternates: getAlternates('/corporate', { indexable: false, locale }),
    openGraph: {
      url: 'https://rideprestigo.com/services/corporate-accounts',
      title: content.metadata.ogTitle,
      description: content.metadata.ogDescription,
      images: [{ url: 'https://rideprestigo.com/hero-corporate-accounts.png', width: 1200, height: 630 }],
    },
  }
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'Corporate Accounts', item: 'https://rideprestigo.com/services/corporate-accounts' },
  ],
}

export default async function CorporateAccountsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('services/corporate-accounts', locale) as CorporateAccountsContent
  const businessDoc = businessNodeDoc()

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Corporate Chauffeur Accounts Prague',
    description: content.serviceDescription,
    inLanguage: BCP47_TAG[locale as AppLocale],
    provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
    areaServed: 'Prague, Czech Republic',
    url: 'https://rideprestigo.com/services/corporate-accounts',
  }

  const benefits = content.benefits
  const builtFor = content.builtFor
  const howItWorks = content.howItWorks

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {businessDoc && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessDoc) }} />}
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-corporate-accounts.png" alt="Corporate Chauffeur Accounts Prague — PRESTIGO" fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            {content.hero.headlineLine1} <br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            {content.hero.intro}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/corporate" className="btn-primary">{content.hero.ctaPrimary}</a>
            <a href="/services" className="btn-secondary">{content.hero.ctaSecondary}</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* Volume pricing callout */}
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

      {/* Benefits */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.benefitsHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {benefits.map((b) => (
              <div key={b.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h2 className="font-display font-light text-[22px] text-offwhite mb-3">{b.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Built for */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.builtForHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {builtFor.map((c) => (
              <div key={c.title} className="border border-anthracite-light p-8">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{c.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* How it works */}
      <section className="bg-anthracite py-16 md:py-20">
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
            <a href="/corporate" className="btn-primary">{content.cta.buttonText}</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
