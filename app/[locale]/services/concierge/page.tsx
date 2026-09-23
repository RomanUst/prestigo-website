import type { Metadata } from 'next'

export const revalidate = 120

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import BookingSection from '@/components/BookingSection'
import { getLocale } from 'next-intl/server'
import { businessNodeDoc } from '@/lib/jsonld'
import { getPageContent } from '@/lib/page-content'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'

type ConciergeContent = {
  metadata: { title: string; description: string; ogTitle: string; ogDescription: string }
  serviceDescription: string
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string; ctaPrimary: string; ctaSecondary: string }
  handlesHeading: string
  handles: { title: string; body: string }[]
  editorialHeading: string
  editorial: string[]
  howItWorksHeading: string
  howItWorks: { step: string; title: string; body: string }[]
  pairsWellHeading: string
  pairsWellCta: string
  pairsWell: { title: string; body: string; href: string }[]
  faqHeading: string
  faqs: { q: string; a: string }[]
  cta: { label: string; headingLine1: string; headingItalic: string; primaryButton: string; secondaryButton: string }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getPageContent('services/concierge', locale) as ConciergeContent
  const alternates = getAlternates('/services/concierge', {
    indexable: true,
    content: { kind: 'page', key: 'services/concierge' },
    locale,
  })
  return {
    title: { absolute: content.metadata.title },
    description: content.metadata.description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description: content.metadata.ogDescription,
      images: [{ url: 'https://rideprestigo.com/hero-contact.webp', width: 1200, height: 630 }],
    },
  }
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'Concierge Chauffeur', item: 'https://rideprestigo.com/services/concierge' },
  ],
}

export default async function ConciergePage() {
  const locale = await getLocale()
  const content = getPageContent('services/concierge', locale) as ConciergeContent

  const handles = content.handles
  const editorial = content.editorial
  const howItWorks = content.howItWorks
  const faqs = content.faqs

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Concierge Chauffeur Service Prague',
    serviceType: 'Concierge chauffeur service',
    description: content.serviceDescription,
    provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
    areaServed: 'Prague, Czech Republic',
    url: 'https://rideprestigo.com/services/concierge',
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
          <Image src="/hero-contact.webp" alt="Concierge chauffeur service in Prague — PRESTIGO" fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)', objectPosition: '30% 15%' }} />
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

      <BookingSection />

      <Divider />

      {/* What your chauffeur handles */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.handlesHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {handles.map((h) => (
              <div key={h.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h2 className="font-display font-light text-[22px] text-offwhite mb-3">{h.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Editorial — the PRESTIGO standard */}
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

      {/* Pairs well with */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.pairsWellHeading}</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-anthracite-light">
            {content.pairsWell.map((c) => (
              <a key={c.title} href={c.href} className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors block">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{c.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{c.body}</p>
                <span className="font-body font-light text-[10px] tracking-[0.2em] uppercase mt-4 inline-block" style={{ color: 'var(--copper)' }}>{content.pairsWellCta}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.faqHeading}</p>
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
            {content.cta.headingLine1}<br />
            <span className="display-italic">{content.cta.headingItalic}</span>
          </h2>
          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            <a href="/book" className="btn-primary">{content.cta.primaryButton}</a>
            <a href="/contact" className="btn-secondary">{content.cta.secondaryButton}</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
