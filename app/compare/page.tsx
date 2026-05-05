import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'

const DESCRIPTION =
  'Honest comparisons: private chauffeur vs train, taxi, bus and rental car out of Prague. Real 2026 fares, timings, and decision guides by passenger profile.'

export const metadata: Metadata = {
  title: 'Prague Transport Comparisons — Chauffeur vs Train, Taxi & Bus',
  description: DESCRIPTION,
  alternates: {
    canonical: '/compare',
    languages: {
      en: 'https://rideprestigo.com/compare',
      'x-default': 'https://rideprestigo.com/compare',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/compare',
    title: 'Prague Transport Comparisons — Chauffeur vs Train, Taxi & Bus',
    description: DESCRIPTION,
    images: [{ url: 'https://rideprestigo.com/og-image.jpg', width: 1200, height: 630 }],
  },
}

const articles = [
  {
    slug: 'prague-vienna-transfer-vs-train',
    title: 'Prague to Vienna 2026: Private Transfer vs Train vs Bus',
    description:
      'ÖBB RailJet, RegioJet, FlixBus, rental car — honest cost per person by group size, timing, luggage, and Sparschiene traps.',
    tags: ['Vienna', 'Train', 'Bus', 'Intercity'],
    updated: '2026-04-09',
  },
  {
    slug: 'prague-airport-taxi-vs-chauffeur',
    title: 'Prague Airport Taxi vs Chauffeur 2026 — After Uber Took the Rank',
    description:
      'Uber is the exclusive official airport rank partner. AAA Taxi is no longer there. Real fares, scam alerts, decision tree by passenger profile.',
    tags: ['Airport', 'Taxi', 'Uber', 'PRG'],
    updated: '2026-04-09',
  },
]

const pageSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/compare#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://rideprestigo.com/compare' },
      ],
    },
    {
      '@type': 'CollectionPage',
      '@id': 'https://rideprestigo.com/compare#collection',
      url: 'https://rideprestigo.com/compare',
      name: 'Prague Transport Comparisons',
      description: DESCRIPTION,
      hasPart: articles.map((a) => ({
        '@type': 'Article',
        url: `https://rideprestigo.com/compare/${a.slug}`,
        name: a.title,
        description: a.description,
      })),
    },
  ],
}

export default function ComparePage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="bg-anthracite pt-40 pb-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
            <p className="label mb-6">Comparisons</p>
            <span className="copper-line mb-8 block" />
            <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
              Honest transport<br />
              <span className="display-italic">comparisons.</span>
            </h1>
            <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
              Private chauffeur versus train, taxi, and bus — with real 2026 fares, verified timings, and no marketing spin. Every number is cross-checked against operator websites, published pricing, and our own dispatch data.
            </p>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Articles */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="flex flex-col gap-6">
            {articles.map((a, i) => (
              <Reveal key={a.slug} variant="up" delay={i * 100}>
                <a
                  href={`/compare/${a.slug}`}
                  className="block border border-anthracite-light p-8 md:p-10 hover:border-[var(--copper)] transition-colors group"
                >
                  <div className="flex flex-wrap gap-2 mb-5">
                    {a.tags.map((tag) => (
                      <span
                        key={tag}
                        className="font-body font-light text-[9px] tracking-[0.15em] uppercase px-2.5 py-1 border border-anthracite-light text-warmgrey"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h2 className="font-display font-light text-[24px] md:text-[28px] text-offwhite mb-4 group-hover:text-copper-light transition-colors">
                    {a.title}
                  </h2>
                  <p className="body-text text-[13px] max-w-3xl" style={{ lineHeight: '1.8' }}>
                    {a.description}
                  </p>
                  <p className="font-body font-light text-[10px] tracking-[0.15em] uppercase mt-6" style={{ color: 'var(--copper)' }}>
                    Read comparison →
                  </p>
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up">
            <h2 className="display text-[28px] md:text-[36px]">
              Decided?<br />
              <span className="display-italic">Book in minutes.</span>
            </h2>
            <p className="body-text text-[13px] mt-4 max-w-md" style={{ lineHeight: '1.8' }}>
              Fixed price, door-to-door. No meters, no surprises.
            </p>
          </Reveal>
          <Reveal variant="fade" delay={150}>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="/book" className="btn-primary">Book a Transfer</a>
              <a href="/guides" className="btn-ghost">Travel Guides</a>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
