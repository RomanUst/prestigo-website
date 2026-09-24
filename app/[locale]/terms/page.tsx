import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getPageContent } from '@/lib/page-content'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'

type TermsContent = {
  metadata: { title: string; description: string; ogTitle: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; lastUpdated: string }
  section1: { title: string; text: string }
  section2: {
    title: string
    paragraph1Prefix: string
    bookingLinkLabel: string
    paragraph1Suffix: string
    paragraph2: string
    paragraph3: string
  }
  section3: { title: string; paragraph1: string; paragraph2: string; paragraph3: string }
  section4: { title: string; items: { label: string; desc: string }[] }
  section5: { title: string; items: string[]; extraItem: string }
  section6: { title: string; paragraph1: string; paragraph2: string }
  section7: { title: string; paragraph1: string; paragraph2: string; paragraph3: string }
  section8: { title: string; text: string }
  section9: { title: string; text: string }
  section10: { title: string; prefix: string; linkLabel: string; suffix: string }
  section11: { title: string; paragraph1: string; paragraph2: string }
  section12: { title: string; text: string }
  cta: { headingLine1: string; headingItalic: string; buttonPrimary: string; buttonSecondary: string }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('terms', locale) as TermsContent
  const alternates = getAlternates('/terms', { indexable: true, content: { kind: 'page', key: 'terms' }, locale })
  return {
    title: { absolute: content.metadata.title },
    description: content.metadata.description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description: content.metadata.description,
    },
  }
}

function buildSections(content: TermsContent) {
  return [
    {
      number: '1',
      title: content.section1.title,
      content: (
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          {content.section1.text}
        </p>
      ),
    },
    {
      number: '2',
      title: content.section2.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section2.paragraph1Prefix}
            <a href="/book" className="text-offwhite hover:text-copper transition-colors">
              {content.section2.bookingLinkLabel}
            </a>
            {content.section2.paragraph1Suffix}
          </p>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section2.paragraph2}
          </p>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section2.paragraph3}
          </p>
        </>
      ),
    },
    {
      number: '3',
      title: content.section3.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section3.paragraph1}
          </p>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section3.paragraph2}
          </p>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section3.paragraph3}
          </p>
        </>
      ),
    },
    {
      number: '4',
      title: content.section4.title,
      content: (
        <div className="flex flex-col gap-4">
          {content.section4.items.map((item) => (
            <div key={item.label}>
              <p className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-1">
                {item.label}
              </p>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      ),
    },
    {
      number: '5',
      title: content.section5.title,
      content: (
        <ul className="flex flex-col gap-3">
          {content.section5.items.map((item) => (
            <li key={item} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {item}
            </li>
          ))}
          <li className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section5.extraItem}
          </li>
        </ul>
      ),
    },
    {
      number: '6',
      title: content.section6.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section6.paragraph1}
          </p>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section6.paragraph2}
          </p>
        </>
      ),
    },
    {
      number: '7',
      title: content.section7.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section7.paragraph1}
          </p>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section7.paragraph2}
          </p>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section7.paragraph3}
          </p>
        </>
      ),
    },
    {
      number: '8',
      title: content.section8.title,
      content: (
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          {content.section8.text}
        </p>
      ),
    },
    {
      number: '9',
      title: content.section9.title,
      content: (
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          {content.section9.text}
        </p>
      ),
    },
    {
      number: '10',
      title: content.section10.title,
      content: (
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          {content.section10.prefix}
          <a href="/privacy" className="text-offwhite hover:text-copper transition-colors">
            {content.section10.linkLabel}
          </a>
          {content.section10.suffix}
        </p>
      ),
    },
    {
      number: '11',
      title: content.section11.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section11.paragraph1}
          </p>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section11.paragraph2}
          </p>
        </>
      ),
    },
    {
      number: '12',
      title: content.section12.title,
      content: (
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          {content.section12.text}
        </p>
      ),
    },
  ]
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('terms', locale) as TermsContent
  const sections = buildSections(content)

  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[length:clamp(30px,10vw,40px)] md:text-[56px] max-w-xl">
            {content.hero.headlineLine1}
            <br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
          <p className="body-text text-[13px] mt-6">{content.hero.lastUpdated}</p>
        </div>
      </section>

      {/* Sections */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12 flex flex-col gap-0">
          {sections.map((section, i) => (
            <div
              key={section.number}
              className={`py-10 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
            >
              <p className="label mb-6">
                {section.number}. {section.title}
              </p>
              {section.content}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite-mid py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <h2 className="display text-[28px] md:text-[36px] mb-4">
            {content.cta.headingLine1}
            <br />
            <span className="display-italic">{content.cta.headingItalic}</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <a href="/contact" className="btn-primary">
              {content.cta.buttonPrimary}
            </a>
            <a href="/book" className="btn-ghost">
              {content.cta.buttonSecondary}
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
