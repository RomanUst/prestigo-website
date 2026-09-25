import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'
import { businessNodeDoc } from '@/lib/jsonld'
import { getPageContent } from '@/lib/page-content'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { BCP47_TAG, type AppLocale } from '@/i18n/locales'
import { localizedHref } from '@/lib/localized-href'

type FaqContent = {
  metadata: { title: string; description: string; ogTitle: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string }
  sections: { title: string; faqs: { q: string; a: string }[] }[]
  cta: { headingLine1: string; headingItalic: string; contactButton: string; bookButton: string; emailPrefix: string }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('faq', locale) as FaqContent
  const alternates = getAlternates('/faq', { indexable: true, content: { kind: 'page', key: 'faq' }, locale })
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description: content.metadata.description,
      images: [{ url: 'https://rideprestigo.com/og-image.jpg', width: 1200, height: 630 }],
    },
  }
}

// Derived from `content.sections` so every visible question is
// machine-readable — single source of truth, no drift between page copy
// and JSON-LD.
function buildFaqSchema(content: FaqContent, locale: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: BCP47_TAG[locale as AppLocale],
    mainEntity: content.sections.flatMap((section) =>
      section.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    ),
  }
}


const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'FAQ', item: 'https://rideprestigo.com/faq' },
  ],
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('faq', locale) as FaqContent
  const faqSchema = buildFaqSchema(content, locale)
  const businessDoc = businessNodeDoc()
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {businessDoc && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessDoc) }} />}

      <Divider />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[length:clamp(30px,10vw,40px)] md:text-[56px] max-w-xl">
            {content.hero.headlineLine1} <br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
        </div>
      </section>

      {/* FAQ sections */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12 flex flex-col gap-16">
          {content.sections.map((section, i) => (
            <Reveal key={section.title} variant="up" delay={i * 100}><div>
              <h2 className="label mb-8">{section.title}</h2>
              <div className="flex flex-col gap-0">
                {section.faqs.map((faq, i) => (
                  <div
                    key={faq.q}
                    className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
                  >
                    <h3 className="font-body font-medium text-[12px] tracking-[0.08em] uppercase text-offwhite mb-3">{faq.q}</h3>
                    <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
                  </div>
                ))}
              </div>
            </div></Reveal>
          ))}
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite-mid py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[36px] mb-4">
            {content.cta.headingLine1} <br />
            <span className="display-italic">{content.cta.headingItalic}</span>
          </h2></Reveal>
          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <a href={localizedHref(locale, '/contact')} className="btn-primary">{content.cta.contactButton}</a>
            <a href={localizedHref(locale, '/book')} className="btn-ghost">{content.cta.bookButton}</a>
          </div></Reveal>
          <Reveal variant="fade" delay={250}><p className="font-body font-light text-[12px] text-warmgrey mt-6">
            {content.cta.emailPrefix}{' '}
            <a href="mailto:info@rideprestigo.com" className="hover:text-offwhite transition-colors">
              info@rideprestigo.com
            </a>
          </p></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
