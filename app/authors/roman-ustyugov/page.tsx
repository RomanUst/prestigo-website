import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getAuthor, personSchemaFor } from '@/lib/authors'

// Author profile page — E-E-A-T Experience signal for YMYL (transport).
// Google's 2022+ Experience update expects a named, bio'd human behind
// long-form content. This page is the canonical target for every author
// byline on /guides, /compare, and /routes — it backs up the Person schema
// that sits inside their Article graphs.

const author = getAuthor('roman-ustyugov')
const CANONICAL = `https://rideprestigo.com/authors/${author.slug}`

const DESCRIPTION =
  'Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground transport and 5★ hospitality. Author of the PRESTIGO travel guides.'

export const metadata: Metadata = {
  title: 'Roman Ustyugov — Founder of PRESTIGO Chauffeur Service',
  description: DESCRIPTION,
  alternates: { canonical: `/authors/${author.slug}` },
  openGraph: {
    url: CANONICAL,
    title: 'Roman Ustyugov — Founder of PRESTIGO Chauffeur Service',
    description: DESCRIPTION,
    images: [author.imageUrl],
    type: 'profile',
  },
}

const personSchema = personSchemaFor('roman-ustyugov')

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Authors', item: CANONICAL },
    { '@type': 'ListItem', position: 3, name: author.name, item: CANONICAL },
  ],
}

const pageSchemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [personSchema, breadcrumbSchema],
}

export default function RomanUstyugovPage() {
  return (
    <main id="main-content">
      <Nav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemaGraph) }}
      />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-10 md:gap-16 items-center">
          <div>
            <picture>
              <source srcSet="/roman-ustyugov-founder.avif" type="image/avif" />
              <source srcSet="/roman-ustyugov-founder.webp" type="image/webp" />
              <img
                src={author.image}
                alt={author.imageAlt}
                width={220}
                height={220}
                className="w-[180px] h-[180px] md:w-[220px] md:h-[220px] rounded-full object-cover border border-anthracite-light"
              />
            </picture>
          </div>
          <div>
            <p className="label mb-6">Author profile</p>
            <span className="copper-line mb-6 block" />
            <h1 className="display text-[36px] md:text-[48px] leading-tight">
              {author.name}
            </h1>
            <p className="font-body text-[12px] tracking-[0.12em] uppercase text-copper mt-3">
              {author.jobTitle}
            </p>
            <p className="body-text text-[13px] mt-5 max-w-xl" style={{ lineHeight: '1.9' }}>
              {author.bioShort}
            </p>
          </div>
        </div>
      </section>

      {/* Bio */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <p className="label mb-6">About</p>
          <span className="copper-line mb-8 block" />
          <div className="flex flex-col gap-6">
            {author.bio.map((para, i) => (
              <p
                key={i}
                className="body-text text-[14px]"
                style={{ lineHeight: '1.9' }}
              >
                {para}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Expertise */}
      <section className="bg-anthracite py-14 md:py-16 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Areas of expertise</p>
          <span className="copper-line mb-8 block" />
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3">
            {author.knowsAbout.map((topic) => (
              <li
                key={topic}
                className="flex items-start gap-3 py-2 border-b border-anthracite-light"
              >
                <span
                  className="mt-[9px] w-1 h-1 rounded-full flex-shrink-0"
                  style={{ background: 'var(--copper)' }}
                />
                <span className="font-body font-light text-[13px] text-warmgrey">
                  {topic}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite-mid py-16 border-t border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="display text-[24px] md:text-[30px]">
              Book directly with <span className="display-italic">our team.</span>
            </h2>
            <p className="body-text text-[12px] mt-2 max-w-lg">
              Every PRESTIGO booking is overseen personally by the founder&rsquo;s
              team — dispatch, chauffeur briefing, and post-ride follow-up.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="/book" className="btn-primary">Book a Transfer</a>
            <a href="/about" className="btn-ghost">About PRESTIGO</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
