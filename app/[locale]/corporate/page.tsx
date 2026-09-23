import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import CorporateForm from './CorporateForm'
import { getPageContent } from '@/lib/page-content'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { BCP47_TAG, type AppLocale } from '@/i18n/locales'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('corporate', locale) as CorporateContent
  const alternates = getAlternates('/corporate', { indexable: true, content: { kind: 'page', key: 'corporate' }, locale })
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description: content.metadata.description,
      images: [{ url: 'https://rideprestigo.com/hero-corporate-accounts.png', width: 1200, height: 630 }],
    },
  }
}

type CorporateContent = {
  metadata: { title: string; description: string; ogTitle: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string }
  benefits: { title: string; body: string }[]
  builtForHeading: string
  builtFor: { title: string; body: string }[]
  howItWorksHeading: string
  howItWorks: { step: string; title: string; body: string }[]
  whoUses: { label: string; headingLine1: string; headingItalic: string; paragraphs: string[] }
  usagePatterns: { label: string; headingLine1: string; headingItalic: string; items: { title: string; body: string }[] }
  onboarding: { label: string; headingLine1: string; headingItalic: string; paragraph: string }
  compliance: { label: string; headingLine1: string; headingItalic: string; paragraph: string }
  faqHeading: { label: string; heading: string }
  faqs: { q: string; a: string }[]
  testimonial: { quote: string; attribution: string }
}

function buildCorporateSchemaGraph(content: CorporateContent, locale: string) {
  const corporateFaqs = content.faqs
  return {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/corporate#breadcrumbs',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Corporate Accounts', item: 'https://rideprestigo.com/corporate' },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://rideprestigo.com/corporate#faq',
      inLanguage: BCP47_TAG[locale as AppLocale],
      mainEntity: corporateFaqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'Service',
      '@id': 'https://rideprestigo.com/corporate#service',
      name: 'PRESTIGO Corporate Chauffeur Accounts',
      serviceType: 'Corporate Chauffeur Account',
      description:
        'Dedicated corporate chauffeur accounts in Prague with monthly consolidated invoicing, a named account manager, priority dispatch, and a reporting dashboard. Designed for law firms, consulting groups, finance, embassies, and event organisers who move people regularly.',
      provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      areaServed: [
        { '@type': 'City', name: 'Prague', sameAs: 'https://www.wikidata.org/wiki/Q1085' },
        { '@type': 'Country', name: 'Czech Republic', sameAs: 'https://www.wikidata.org/wiki/Q213' },
      ],
      audience: {
        '@type': 'BusinessAudience',
        audienceType: 'Enterprise and SME corporate travel buyers',
      },
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Corporate account benefits',
        itemListElement: [
          {
            '@type': 'Offer',
            name: 'Monthly consolidated invoicing',
            description: 'One invoice on the first of every month covering all trips and all departments, formatted for corporate accounts teams.',
            priceCurrency: 'EUR',
            price: '0',
            availability: 'https://schema.org/InStock',
          },
          {
            '@type': 'Offer',
            name: 'Dedicated account manager',
            description: 'A single named contact who knows your company, preferences, and travellers — reachable by phone, email, and WhatsApp.',
            priceCurrency: 'EUR',
            price: '0',
            availability: 'https://schema.org/InStock',
          },
          {
            '@type': 'Offer',
            name: 'Priority dispatch',
            description: 'Corporate accounts receive priority allocation for same-day, last-minute, and early-morning bookings.',
            priceCurrency: 'EUR',
            price: '0',
            availability: 'https://schema.org/InStock',
          },
          {
            '@type': 'Offer',
            name: 'Reporting dashboard',
            description: 'Bookings, travellers, routes, and costs exportable for expense and compliance reporting at any time.',
            priceCurrency: 'EUR',
            price: '0',
            availability: 'https://schema.org/InStock',
          },
        ],
      },
      termsOfService: 'https://rideprestigo.com/corporate',
      url: 'https://rideprestigo.com/corporate',
    },
  ],
  }
}

export default async function CorporatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('corporate', locale) as CorporateContent
  const corporateSchemaGraph = buildCorporateSchemaGraph(content, locale)
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(corporateSchemaGraph) }} />

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

      {/* Benefits */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {content.benefits.map((b, i) => (
              <Reveal key={b.title} variant="up" delay={i * 100}>
              <div className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h2 className="font-display font-light text-[22px] text-offwhite mb-3">{b.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{b.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* For whom */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <h2 className="display text-[28px] md:text-[36px] mb-14">{content.builtForHeading}</h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {content.builtFor.map((c, i) => (
              <Reveal key={c.title} variant="up" delay={i * 120}>
              <div className="border border-anthracite-light p-8">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{c.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{c.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-anthracite py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <h2 className="display text-[28px] md:text-[36px] mb-14">{content.howItWorksHeading}</h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {content.howItWorks.map((s, i) => (
              <Reveal key={s.step} variant="up" delay={i * 120}>
              <div className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Who uses corporate accounts */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-16">
          <Reveal variant="up" className="md:col-span-2">
          <div>
            <p className="label mb-6">{content.whoUses.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">{content.whoUses.headingLine1} <span className="display-italic">{content.whoUses.headingItalic}</span></h2>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150} className="md:col-span-3 flex flex-col gap-5">
          <div>
            {content.whoUses.paragraphs.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {para}
              </p>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      {/* Typical usage patterns */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <div className="mb-14">
            <p className="label mb-6">{content.usagePatterns.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">{content.usagePatterns.headingLine1} <br /><span className="display-italic">{content.usagePatterns.headingItalic}</span></h2>
          </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {content.usagePatterns.items.map((item, i) => (
              <Reveal key={item.title} variant="up" delay={i * 120}>
              <div className="border border-anthracite-light p-8">
                <span className="copper-line mb-5 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{item.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Onboarding + Compliance */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <p className="label mb-6">{content.onboarding.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[34px] mb-6">{content.onboarding.headingLine1} <span className="display-italic">{content.onboarding.headingItalic}</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.onboarding.paragraph}
            </p>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <div>
            <p className="label mb-6">{content.compliance.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[34px] mb-6">{content.compliance.headingLine1} <span className="display-italic">{content.compliance.headingItalic}</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.compliance.paragraph}
            </p>
          </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <p className="label mb-6">{content.faqHeading.label}</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-12">{content.faqHeading.heading}</h2>
          </Reveal>
          <div className="flex flex-col gap-0">
            {content.faqs.map((faq, i) => (
              <Reveal key={faq.q} variant="up" delay={i * 60}>
              <div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}>
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Form + Quote */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-16">

          {/* Testimonial */}
          <Reveal variant="up" className="md:col-span-2 flex flex-col justify-center">
          <div>
            <span className="copper-line mb-8 block" />
            <blockquote className="font-display font-light italic text-[22px] md:text-[26px] text-offwhite leading-[1.5]">
              {content.testimonial.quote}
            </blockquote>
            <p className="body-text text-[11px] mt-6">{content.testimonial.attribution}</p>
          </div>
          </Reveal>

          {/* Form */}
          <Reveal variant="up" delay={150} className="md:col-span-3">
            <CorporateForm />
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
