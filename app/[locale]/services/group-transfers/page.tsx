import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import { getLocale } from 'next-intl/server'
import { businessNodeDoc } from '@/lib/jsonld'
import { getPageContent } from '@/lib/page-content'

type GroupTransfersContent = {
  metadata: { title: string; description: string; ogTitle: string; ogDescription: string }
  serviceDescription: string
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string; ctaPrimary: string; ctaSecondary: string }
  capacityCallout: { label: string; heading: string; note: string; items: string[] }
  featuresHeading: string
  features: { title: string; body: string }[]
  editorialHeading: string
  editorial: string[]
  groupTypesHeading: string
  groupTypes: { title: string; body: string }[]
  cta: { label: string; headingLine1: string; headingItalic: string; body: string; buttonText: string }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getPageContent('services/group-transfers', locale) as GroupTransfersContent
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates: {
      canonical: '/services/group-transfers',
      languages: {
        en: 'https://rideprestigo.com/services/group-transfers',
        'x-default': 'https://rideprestigo.com/services/group-transfers',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/services/group-transfers',
      title: content.metadata.ogTitle,
      description: content.metadata.ogDescription,
      images: [{ url: 'https://rideprestigo.com/hero-group-transfers.png', width: 1200, height: 630 }],
    },
  }
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'Group Transfers', item: 'https://rideprestigo.com/services/group-transfers' },
  ],
}

export default async function GroupTransfersPage() {
  const locale = await getLocale()
  const content = getPageContent('services/group-transfers', locale) as GroupTransfersContent
  const businessDoc = businessNodeDoc()

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Group Transfers Prague',
    description: content.serviceDescription,
    provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
    areaServed: 'Prague, Czech Republic',
    url: 'https://rideprestigo.com/services/group-transfers',
  }

  const features = content.features
  const editorial = content.editorial
  const groupTypes = content.groupTypes

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
          <Image src="/hero-group-transfers.png" alt="Group Transfers Prague — PRESTIGO" fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
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
            <a href="/contact" className="btn-primary">{content.hero.ctaPrimary}</a>
            <a href="/services" className="btn-secondary">{content.hero.ctaSecondary}</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* Capacity callout */}
      <section className="bg-anthracite-mid py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--warmgrey)' }}>{content.capacityCallout.label}</p>
            <p className="font-display font-light text-[42px] md:text-[52px] text-offwhite">{content.capacityCallout.heading}</p>
            <p className="body-text text-[11px] mt-1">{content.capacityCallout.note}</p>
          </div>
          <div className="flex flex-col gap-2">
            {content.capacityCallout.items.map((f) => (
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

      {/* Group types */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.groupTypesHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
            {groupTypes.map((g) => (
              <div key={g.title} className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{g.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{g.body}</p>
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
            <a href="/contact" className="btn-primary">{content.cta.buttonText}</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
