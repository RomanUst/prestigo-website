import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getPageContent } from '@/lib/page-content'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { localizedHref } from '@/lib/localized-href'

type PrivacyContent = {
  metadata: { title: string; description: string; ogTitle: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; lastUpdated: string }
  section1: {
    title: string
    controllerPrefix: string
    controllerName: string
    controllerSuffix: string
    contactPrefix: string
    contactEmailLabel: string
    contactMiddle: string
    contactPhoneLabel: string
    contactSuffix: string
  }
  section2: {
    title: string
    intro: string
    bookingForm: { heading: string; text: string }
    contactForm: { heading: string; text: string }
    corporateEnquiry: { heading: string; text: string }
    automaticallyCollected: { heading: string; text: string }
    locationData: { heading: string; text: string }
  }
  section3: {
    title: string
    intro: string
    performanceOfContract: { heading: string; text: string }
    legitimateInterest: { heading: string; text: string }
    legalObligation: { heading: string; text: string }
  }
  section4: {
    title: string
    intro: string
    privacyPolicyLabel: string
    providers: { name: string; purpose: string; url: string }[]
  }
  section5: { title: string; text: string }
  section6: { title: string; items: { type: string; period: string }[] }
  section7: {
    title: string
    intro: string
    cookies: { name: string; purpose: string }[]
    outro: string
  }
  section8: {
    title: string
    intro: string
    rights: { right: string; article: string; desc: string }[]
    outroPrefix: string
    outroEmailLabel: string
    outroSuffix: string
  }
  section9: {
    title: string
    intro: string
    authorityName: string
    authorityAddress: string
    authorityUrlLabel: string
  }
  section10: { title: string; text: string }
  cta: { headingLine1: string; headingItalic: string; buttonPrimary: string; buttonSecondary: string }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('privacy', locale) as PrivacyContent
  const alternates = getAlternates('/privacy', { indexable: true, content: { kind: 'page', key: 'privacy' }, locale })
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

function buildSections(content: PrivacyContent) {
  return [
    {
      number: '1',
      title: content.section1.title,
      content: (
        <>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section1.controllerPrefix}
            <strong className="text-offwhite">{content.section1.controllerName}</strong>
            {content.section1.controllerSuffix}
          </p>
          <p className="body-text text-[13px] mt-4" style={{ lineHeight: '1.9' }}>
            {content.section1.contactPrefix}
            <a href="mailto:info@rideprestigo.com" className="text-offwhite hover:text-copper transition-colors">
              {content.section1.contactEmailLabel}
            </a>
            {content.section1.contactMiddle}
            <a href="tel:+420725986855" className="text-offwhite hover:text-copper transition-colors">
              {content.section1.contactPhoneLabel}
            </a>
            {content.section1.contactSuffix}
          </p>
        </>
      ),
    },
    {
      number: '2',
      title: content.section2.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section2.intro}
          </p>

          <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
            {content.section2.bookingForm.heading}
          </h4>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section2.bookingForm.text}
          </p>

          <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
            {content.section2.contactForm.heading}
          </h4>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section2.contactForm.text}
          </p>

          <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
            {content.section2.corporateEnquiry.heading}
          </h4>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section2.corporateEnquiry.text}
          </p>

          <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
            {content.section2.automaticallyCollected.heading}
          </h4>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section2.automaticallyCollected.text}
          </p>

          <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
            {content.section2.locationData.heading}
          </h4>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section2.locationData.text}
          </p>
        </>
      ),
    },
    {
      number: '3',
      title: content.section3.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section3.intro}
          </p>

          <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
            {content.section3.performanceOfContract.heading}
          </h4>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section3.performanceOfContract.text}
          </p>

          <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
            {content.section3.legitimateInterest.heading}
          </h4>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section3.legitimateInterest.text}
          </p>

          <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
            {content.section3.legalObligation.heading}
          </h4>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section3.legalObligation.text}
          </p>
        </>
      ),
    },
    {
      number: '4',
      title: content.section4.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section4.intro}
          </p>

          <div className="flex flex-col gap-4">
            {content.section4.providers.map((provider) => (
              <div key={provider.name}>
                <p className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-1">
                  {provider.name}
                </p>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                  {provider.purpose}{' '}
                  <a
                    href={provider.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-offwhite hover:text-copper transition-colors"
                  >
                    {content.section4.privacyPolicyLabel}
                  </a>
                </p>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      number: '5',
      title: content.section5.title,
      content: (
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          {content.section5.text}
        </p>
      ),
    },
    {
      number: '6',
      title: content.section6.title,
      content: (
        <div className="flex flex-col gap-4">
          {content.section6.items.map((item) => (
            <div key={item.type}>
              <p className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-1">
                {item.type}
              </p>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {item.period}
              </p>
            </div>
          ))}
        </div>
      ),
    },
    {
      number: '7',
      title: content.section7.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section7.intro}
          </p>
          <div className="flex flex-col gap-4">
            {content.section7.cookies.map((cookie) => (
              <div key={cookie.name}>
                <p className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-1">
                  {cookie.name}
                </p>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                  {cookie.purpose}
                </p>
              </div>
            ))}
          </div>
          <p className="body-text text-[13px] mt-5" style={{ lineHeight: '1.9' }}>
            {content.section7.outro}
          </p>
        </>
      ),
    },
    {
      number: '8',
      title: content.section8.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
            {content.section8.intro}
          </p>
          <ul className="flex flex-col gap-3 mb-5">
            {content.section8.rights.map((item) => (
              <li key={item.right} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                <strong className="text-offwhite">{item.right}</strong>{' '}
                <span className="text-warmgrey">({item.article})</span> — {item.desc}
              </li>
            ))}
          </ul>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {content.section8.outroPrefix}
            <a href="mailto:info@rideprestigo.com" className="text-offwhite hover:text-copper transition-colors">
              {content.section8.outroEmailLabel}
            </a>
            {content.section8.outroSuffix}
          </p>
        </>
      ),
    },
    {
      number: '9',
      title: content.section9.title,
      content: (
        <>
          <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
            {content.section9.intro}
          </p>
          <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            <strong className="text-offwhite">{content.section9.authorityName}</strong>
            <br />
            {content.section9.authorityAddress}
            <br />
            <a
              href="https://www.uoou.cz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-offwhite hover:text-copper transition-colors"
            >
              {content.section9.authorityUrlLabel}
            </a>
          </p>
        </>
      ),
    },
    {
      number: '10',
      title: content.section10.title,
      content: (
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          {content.section10.text}
        </p>
      ),
    },
  ]
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('privacy', locale) as PrivacyContent
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
            <a href="mailto:info@rideprestigo.com" className="btn-primary">
              {content.cta.buttonPrimary}
            </a>
            <a href={localizedHref(locale, '/contact')} className="btn-ghost">
              {content.cta.buttonSecondary}
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
