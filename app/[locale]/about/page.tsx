import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getAuthor, personSchemaFor } from '@/lib/authors'
import { getStaticAggregateRating } from '@/lib/google-reviews'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'
import { getPageContent } from '@/lib/page-content'
import { getAlternates } from '@/lib/seo'
import { BCP47_TAG, type AppLocale } from '@/i18n/locales'

type AboutContent = {
  metadata: { title: string; description: string; ogTitle: string }
  schema: { name: string; aboutPageName: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string }
  brandStory: { heading: string; paragraphs: string[] }
  quote: string
  ourStory: { label: string; headingLine1: string; headingItalic: string; paragraphs: string[] }
  founder: { label: string; headingLine1: string; headingItalic: string; extraParagraph: string; readFullProfile: string }
  discretion: { label: string; headingLine1: string; headingItalic: string; intro: string; items: { t: string; b: string }[] }
  localKnowledge: { label: string; headingLine1: string; headingItalic: string; paragraphs: string[] }
  principlesHeading: string
  principles: { title: string; body: string }[]
  chauffeurs: { label: string; heading: string; paragraph: string }
  requirements: string[]
  cta: { headingLine1: string; headingItalic: string; buttonPrimary: string; buttonSecondary: string }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('about', locale) as AboutContent
  return {
    title: { absolute: content.metadata.title },
    description: content.metadata.description,
    alternates: getAlternates('/about', { indexable: true, content: { kind: 'page', key: 'about' } }),
    openGraph: {
      url: 'https://rideprestigo.com/about',
      title: content.metadata.ogTitle,
      description: content.metadata.description,
      images: [{ url: 'https://rideprestigo.com/hero-about.png', width: 1200, height: 630 }],
    },
  }
}

const founder = getAuthor('roman-ustyugov')

function buildAboutPageSchemaGraph(content: AboutContent, locale: string) {
  return {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/about#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'About', item: 'https://rideprestigo.com/about' },
      ],
    },
    {
      '@type': 'AboutPage',
      '@id': 'https://rideprestigo.com/about#aboutpage',
      url: 'https://rideprestigo.com/about',
      name: content.schema.aboutPageName,
      description: content.metadata.description,
      inLanguage: BCP47_TAG[locale as AppLocale],
      mainEntity: { '@id': 'https://rideprestigo.com/#business' },
      about: personSchemaFor('roman-ustyugov'),
    },
    {
      '@type': 'Organization',
      '@id': 'https://rideprestigo.com/#org',
      name: content.schema.name,
      url: 'https://rideprestigo.com',
      foundingDate: '2016',
      founder: {
        '@type': 'Person',
        '@id': 'https://rideprestigo.com/authors/roman-ustyugov#person',
        name: 'Roman Ustyugov',
      },
    },
  ],
  }
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('about', locale) as AboutContent
  const principlesList = content.principles
  const requirementsList = content.requirements
  const aboutPageSchemaGraph = buildAboutPageSchemaGraph(content, locale)
  const rating = getStaticAggregateRating()
  const schemaGraph = rating
    ? {
        ...aboutPageSchemaGraph,
        '@graph': [
          ...aboutPageSchemaGraph['@graph'],
          {
            '@type': ['LocalBusiness', 'TaxiService'],
            '@id': 'https://rideprestigo.com/#business',
            name: content.schema.name,
            url: 'https://rideprestigo.com',
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: rating.ratingValue.toFixed(1),
              reviewCount: rating.reviewCount,
              bestRating: '5',
              worstRating: '1',
            },
          },
        ],
      }
    : aboutPageSchemaGraph

  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }} />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-about.png" alt="About PRESTIGO — Prague's Premium Chauffeur Service" fill style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
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

      <Divider />

      {/* Brand story */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <h2 className="display text-[28px] md:text-[36px] mb-8">{content.brandStory.heading}</h2>
            <div className="flex flex-col gap-6">
              {content.brandStory.paragraphs.map((para, i) => (
                <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                  {para}
                </p>
              ))}
            </div>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <div className="flex items-center">
            <div className="w-full border border-anthracite-light p-10">
              <span className="copper-line mb-8 block" />
              <blockquote className="font-display font-light italic text-[24px] md:text-[28px] text-offwhite leading-[1.5]">
                {content.quote}
              </blockquote>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Our story */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-16">
          <Reveal variant="up" className="md:col-span-2">
          <div>
            <p className="label mb-6">{content.ourStory.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">{content.ourStory.headingLine1} <span className="display-italic">{content.ourStory.headingItalic}</span></h2>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150} className="md:col-span-3">
          <div className="flex flex-col gap-5">
            {content.ourStory.paragraphs.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {para}
              </p>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Founder */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-10 md:gap-16 items-start">
          <Reveal variant="up">
          <div
            className="w-[200px] h-[200px] md:w-[240px] md:h-[240px] rounded-full border border-anthracite-light flex-shrink-0"
            style={{
              backgroundImage: `url('/roman-ustyugov-founder.jpg')`,
              backgroundSize: '105%',
              backgroundPosition: 'center -5%',
              backgroundRepeat: 'no-repeat',
            }}
            role="img"
            aria-label={founder.imageAlt}
          />
          </Reveal>
          <Reveal variant="up" delay={150}>
          <div>
            <p className="label mb-6">{content.founder.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-3">
              {content.founder.headingLine1} <span className="display-italic">{content.founder.headingItalic}</span>
            </h2>
            <p className="font-body text-[11px] tracking-[0.12em] uppercase text-copper mb-6">
              {founder.jobTitle}
            </p>
            <div className="flex flex-col gap-5 max-w-2xl">
              {founder.bio.map((para, i) => (
                <p
                  key={i}
                  className="body-text text-[13px]"
                  style={{ lineHeight: '1.9' }}
                >
                  {para}
                </p>
              ))}
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {content.founder.extraParagraph}
              </p>
              <div className="pt-2">
                <a
                  href={`/authors/${founder.slug}`}
                  className="font-body text-[11px] tracking-[0.12em] uppercase text-copper hover:text-offwhite transition-colors"
                >
                  {content.founder.readFullProfile}
                </a>
              </div>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* What discretion means */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <p className="label mb-6">{content.discretion.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">{content.discretion.headingLine1} <span className="display-italic">{content.discretion.headingItalic}</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.discretion.intro}
            </p>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <ul className="flex flex-col gap-4">
            {content.discretion.items.map((item) => (
              <li key={item.t} className="flex items-start gap-4 py-3 border-b border-anthracite-light last:border-0">
                <span className="mt-[8px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <div>
                  <p className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-1" dangerouslySetInnerHTML={{ __html: item.t }} />
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }} dangerouslySetInnerHTML={{ __html: item.b }} />
                </div>
              </li>
            ))}
          </ul>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Local knowledge */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <p className="label mb-6">{content.localKnowledge.label}</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-10">{content.localKnowledge.headingLine1} <span className="display-italic">{content.localKnowledge.headingItalic}</span></h2>
          </Reveal>
          <Reveal variant="fade" delay={100}>
          <div className="flex flex-col gap-6">
            {content.localKnowledge.paragraphs.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {para}
              </p>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Principles */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <h2 className="display text-[28px] md:text-[36px] mb-14">{content.principlesHeading}</h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {principlesList.map((p, i) => (
              <Reveal key={p.title} variant="up" delay={i * 120}>
              <div className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{p.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{p.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Chauffeurs */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <p className="label mb-6">{content.chauffeurs.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">{content.chauffeurs.heading}</h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.chauffeurs.paragraph}
            </p>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <div className="flex flex-col justify-center gap-4">
            {requirementsList.map((r) => (
              <div key={r} className="flex items-start gap-4 py-4 border-b border-anthracite-light last:border-0">
                <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[13px] text-warmgrey">{r}</span>
              </div>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="theme-light bg-anthracite-mid py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up">
          <h2 className="display text-[28px] md:text-[36px]">
            {content.cta.headingLine1} <br />
            <span className="display-italic">{content.cta.headingItalic}</span>
          </h2>
          </Reveal>
          <Reveal variant="fade" delay={150}>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">{content.cta.buttonPrimary}</a>
            <a href="/corporate" className="btn-ghost">{content.cta.buttonSecondary}</a>
          </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
