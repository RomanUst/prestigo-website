import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'

const DESCRIPTION =
  'Practical travel guides for Prague and Central Europe — written from real dispatch data and local knowledge. Fares, timings, and routes verified for 2026.'

export const metadata: Metadata = {
  title: 'Prague Travel Guides — Airport, Routes & Transport (2026)',
  description: DESCRIPTION,
  alternates: {
    canonical: '/guides',
    languages: {
      en: 'https://rideprestigo.com/guides',
      'x-default': 'https://rideprestigo.com/guides',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/guides',
    title: 'Prague Travel Guides — Airport, Routes & Transport (2026)',
    description: DESCRIPTION,
  },
}

const guides = [
  {
    slug: 'prague-airport-to-city-center',
    title: 'Prague Airport to City Centre 2026 — By Passenger Type',
    description:
      'Every option with real fares after the 1 Jan 2026 PID hike — trolleybus 59, Bus 100, metro, taxis, and private transfer — neighbourhood-by-neighbourhood routing and late-night protocols.',
    tags: ['Airport', 'PRG', 'Public Transport', 'Transfers'],
    updated: '2026-04-09',
  },
]

const pageSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/guides#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://rideprestigo.com/guides' },
      ],
    },
    {
      '@type': 'CollectionPage',
      '@id': 'https://rideprestigo.com/guides#collection',
      url: 'https://rideprestigo.com/guides',
      name: 'Prague Travel Guides',
      description: DESCRIPTION,
      hasPart: guides.map((g) => ({
        '@type': 'Article',
        url: `https://rideprestigo.com/guides/${g.slug}`,
        name: g.title,
        description: g.description,
      })),
    },
  ],
}

export default function GuidesPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="bg-anthracite pt-40 pb-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
            <p className="label mb-6">Travel Guides</p>
            <span className="copper-line mb-8 block" />
            <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
              Prague transport,<br />
              <span className="display-italic">explained clearly.</span>
            </h1>
            <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
              Practical guides written from real dispatch data and local knowledge — not recycled travel-blog copy. Every fare, timetable, and route detail is verified against operator sources for 2026.
            </p>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Guides list */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="flex flex-col gap-6">
            {guides.map((g, i) => (
              <Reveal key={g.slug} variant="up" delay={i * 100}>
                <a
                  href={`/guides/${g.slug}`}
                  className="block border border-anthracite-light p-8 md:p-10 hover:border-[var(--copper)] transition-colors group"
                >
                  <div className="flex flex-wrap gap-2 mb-5">
                    {g.tags.map((tag) => (
                      <span
                        key={tag}
                        className="font-body font-light text-[9px] tracking-[0.15em] uppercase px-2.5 py-1 border border-anthracite-light text-warmgrey"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h2 className="font-display font-light text-[24px] md:text-[28px] text-offwhite mb-4 group-hover:text-copper-light transition-colors">
                    {g.title}
                  </h2>
                  <p className="body-text text-[13px] max-w-3xl" style={{ lineHeight: '1.8' }}>
                    {g.description}
                  </p>
                  <p className="font-body font-light text-[10px] tracking-[0.15em] uppercase mt-6" style={{ color: 'var(--copper)' }}>
                    Read guide →
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
              Ready to travel?<br />
              <span className="display-italic">Book your transfer.</span>
            </h2>
            <p className="body-text text-[13px] mt-4 max-w-md" style={{ lineHeight: '1.8' }}>
              Fixed price, door-to-door from Prague. No meters, no surprises.
            </p>
          </Reveal>
          <Reveal variant="fade" delay={150}>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="/book" className="btn-primary">Book a Transfer</a>
              <a href="/compare" className="btn-ghost">Compare Options</a>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
