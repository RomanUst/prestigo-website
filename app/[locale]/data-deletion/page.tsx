import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getLocale } from 'next-intl/server'
import { getPageContent } from '@/lib/page-content'
import { getAlternates } from '@/lib/seo'

type DataDeletionContent = {
  metadata: { title: string; description: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string }
  requestReceived: {
    label: string
    paragraph1: string
    paragraph2Prefix: string
    paragraph2EmailLabel: string
    paragraph2Suffix: string
  }
  section1: { title: string; text: string }
  section2: {
    title: string
    paragraph1Prefix: string
    paragraph1EmailLabel: string
    paragraph1Suffix: string
    paragraph2: string
  }
  section3: {
    title: string
    paragraph1Prefix: string
    facebookLinkLabel: string
    paragraph1Suffix: string
  }
  cta: { headingLine1: string; headingItalic: string; buttonPrimary: string; buttonSecondary: string }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getPageContent('data-deletion', locale) as DataDeletionContent
  return {
    title: { absolute: content.metadata.title },
    description: content.metadata.description,
    // D-06: this page is noindex — getAlternates(indexable:false) returns an
    // empty languages cluster while keeping the page self-canonical, so no
    // hreflang cluster contradicts the noindex directive below.
    alternates: getAlternates('/data-deletion', { indexable: false }),
    robots: { index: false },
  }
}

interface Props {
  searchParams: Promise<{ code?: string }>
}

export default async function DataDeletionPage({ searchParams }: Props) {
  const { code } = await searchParams
  const locale = await getLocale()
  const content = getPageContent('data-deletion', locale) as DataDeletionContent

  const sections = [
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
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section2.paragraph1Prefix}
            <a
              href="mailto:info@rideprestigo.com?subject=Data%20Deletion%20Request"
              className="text-offwhite hover:text-copper transition-colors"
            >
              {content.section2.paragraph1EmailLabel}
            </a>
            {content.section2.paragraph1Suffix}
          </p>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section2.paragraph2}
          </p>
        </>
      ),
    },
    {
      number: '3',
      title: content.section3.title,
      content: (
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          {content.section3.paragraph1Prefix}
          <a
            href="https://www.facebook.com/settings?tab=applications"
            target="_blank"
            rel="noopener noreferrer"
            className="text-offwhite hover:text-copper transition-colors"
          >
            {content.section3.facebookLinkLabel}
          </a>
          {content.section3.paragraph1Suffix}
        </p>
      ),
    },
  ]

  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            {content.hero.headlineLine1}
            <br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
        </div>
      </section>

      {/* Content */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12 flex flex-col gap-0">

          {code && (
            <div className="py-10 border-t border-b border-anthracite-light mb-0">
              <p className="label mb-4">{content.requestReceived.label}</p>
              <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
                {content.requestReceived.paragraph1}
              </p>
              <p
                className="font-mono text-copper text-[15px] tracking-widest bg-anthracite-dark px-5 py-3 rounded inline-block"
              >
                {code}
              </p>
              <p className="body-text text-[13px] mt-4" style={{ lineHeight: '1.9' }}>
                {content.requestReceived.paragraph2Prefix}
                <a
                  href="mailto:info@rideprestigo.com"
                  className="text-offwhite hover:text-copper transition-colors"
                >
                  {content.requestReceived.paragraph2EmailLabel}
                </a>
                {content.requestReceived.paragraph2Suffix}
              </p>
            </div>
          )}

          {sections.map((section, i) => (
            <div
              key={section.number}
              className={`py-10 border-b border-anthracite-light ${!code && i === 0 ? 'border-t' : ''}`}
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
            <a href="mailto:info@rideprestigo.com?subject=Data%20Deletion%20Request" className="btn-primary">
              {content.cta.buttonPrimary}
            </a>
            <a href="/privacy" className="btn-ghost">
              {content.cta.buttonSecondary}
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
