import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'
import { businessNodeDoc } from '@/lib/jsonld'
import { interpolate, interpolateBidi } from '@/lib/content-interpolate'
import { localizedHref } from '@/lib/localized-href'
import { BCP47_TAG, type AppLocale } from '@/i18n/locales'
import type { LandingContent, LandingPageConfig } from '@/lib/landing-pages'

const BASE = 'https://rideprestigo.com'

/**
 * Shared body for the keyword-variant landing pages (lib/landing-pages.ts).
 * Every visible string comes from the LandingContent JSON; FAQPage and
 * BreadcrumbList JSON-LD are derived from that same copy so the structured
 * data can never drift from the page.
 */
export default function LandingView({
  page,
  content,
  locale,
  prices,
}: {
  page: LandingPageConfig
  content: LandingContent
  locale: string
  prices: Record<string, number>
}) {
  const path = `/${page.section}/${page.slug}`
  const sectionName = page.section === 'faq' ? 'FAQ' : 'Services'
  const faqs = content.faqs.map((f) => ({ q: f.q, a: interpolate(f.a, prices), aBidi: interpolateBidi(f.a, prices) }))
  const bidi = (s: string) => interpolateBidi(s, prices)

  const pageSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        '@id': `${BASE}${path}#faq`,
        inLanguage: BCP47_TAG[locale as AppLocale] ?? locale,
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${BASE}${path}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
          { '@type': 'ListItem', position: 2, name: sectionName, item: `${BASE}/${page.section}` },
          { '@type': 'ListItem', position: 3, name: content.breadcrumbName, item: `${BASE}${path}` },
        ],
      },
      ...(page.section === 'services'
        ? [{
            '@type': 'Service',
            '@id': `${BASE}${path}#service`,
            url: `${BASE}${path}`,
            name: content.metadata.ogTitle,
            description: interpolate(content.metadata.description, prices),
            serviceType: 'Private chauffeur service',
            areaServed: { '@type': 'City', name: 'Prague' },
            provider: { '@type': 'LocalBusiness', '@id': `${BASE}/#business` },
          }]
        : []),
    ],
  }
  const businessDoc = businessNodeDoc()

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      {businessDoc && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessDoc) }} />}
      <Nav />

      {/* Hero */}
      {page.heroImage ? (
        <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
          <div className="absolute inset-0"><Image src={page.heroImage} alt={content.hero.imageAlt} fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
          <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
            <HeroBody content={content} locale={locale} ctaHref={page.ctaHref} bidi={bidi} />
          </div>
        </section>
      ) : (
        <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20">
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <HeroBody content={content} locale={locale} ctaHref={page.ctaHref} bidi={bidi} />
          </div>
        </section>
      )}

      <Divider />

      {/* At a glance */}
      <section className="bg-anthracite-mid py-12">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-8">{content.glance.label}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {content.glance.items.map((g, i) => (
              <Reveal key={g.label} variant="up" delay={i * 100}><div>
                <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--copper)' }}>{g.label}</p>
                <p className="body-text text-[13px] text-offwhite" style={{ lineHeight: '1.7' }}>{bidi(g.value)}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Intro */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[38px]">{content.intro.headingLine1} <br /><span className="display-italic">{content.intro.headingItalic}</span></h2></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            {content.intro.paragraphs.map((p, i) => (<p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{bidi(p)}</p>))}
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Features */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">{content.features.label}</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">{content.features.headingLine1} <br /><span className="display-italic">{content.features.headingItalic}</span></h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {content.features.items.map((f, i) => (
              <Reveal key={f.title} variant="up" delay={(i % 3) * 120}><div className="border border-anthracite-light p-8 flex flex-col gap-4 h-full">
                <h3 className="font-display font-light text-[20px] text-offwhite">{f.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{bidi(f.body)}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Steps */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">{content.steps.label}</p>
          <h2 className="display text-[28px] md:text-[36px] mb-14">{content.steps.heading}</h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
            {content.steps.items.map((s, i) => (
              <Reveal key={s.title} variant="up" delay={i * 100}><div>
                <p className="font-display font-light text-[32px] mb-3" style={{ color: 'var(--copper)' }}>{String(i + 1).padStart(2, '0')}</p>
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{bidi(s.body)}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Editorial */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">{content.editorial.label}</p>
            <h2 className="display text-[28px] md:text-[38px]">{content.editorial.headingLine1} <br /><span className="display-italic">{content.editorial.headingItalic}</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            {content.editorial.paragraphs.map((p, i) => (<p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{bidi(p)}</p>))}
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-20" id="faq">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[34px] mb-12">{content.faqsHeading}</h2></Reveal>
          <div className="flex flex-col gap-0">{faqs.map((faq, i) => (<Reveal key={faq.q} variant="up" delay={i * 70}><div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}><h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3><p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.aBidi}</p></div></Reveal>))}</div>
        </div>
      </section>

      <Divider />

      {/* Related */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">{content.related.label}</p>
          <h2 className="display text-[26px] md:text-[32px] mb-10">{content.related.heading}</h2></Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {content.related.links.map((l) => (
              <a key={l.href} href={localizedHref(locale, l.href)} className="border border-anthracite-light p-6 flex flex-col gap-2 hover:border-[var(--copper)] transition-colors">
                <p className="font-display font-light text-[18px] text-offwhite">{l.title}</p>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.7' }}>{l.body}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[36px]">{content.cta.headingLine1} <br /><span className="display-italic">{bidi(content.cta.headingItalic)}</span></h2></Reveal>
          <Reveal variant="fade" delay={150}><a href={localizedHref(locale, page.ctaHref)} className="btn-primary">{content.cta.buttonText}</a></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function HeroBody({
  content,
  locale,
  ctaHref,
  bidi,
}: {
  content: LandingContent
  locale: string
  ctaHref: string
  bidi: (s: string) => React.ReactNode
}) {
  return (
    <>
      <p className="label mb-6">{content.hero.label}</p>
      <span className="copper-line mb-8 block" />
      <h1 className="display text-[length:clamp(30px,10vw,40px)] md:text-[56px] max-w-2xl">{content.hero.headlineLine1} <br /><span className="display-italic">{content.hero.headlineItalic}</span></h1>
      <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>{bidi(content.hero.intro)}</p>
      <div className="mt-10 flex flex-col sm:flex-row gap-4">
        <a href={localizedHref(locale, ctaHref)} className="btn-primary">{content.hero.ctaPrimary}</a>
        <a href={localizedHref(locale, '/contact')} className="btn-ghost">{content.hero.ctaSecondary}</a>
      </div>
    </>
  )
}
