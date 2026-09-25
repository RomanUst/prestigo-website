import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import MultiDayForm from '@/components/booking/MultiDayForm'
import MetaViewContent from '@/components/MetaViewContent'
import { businessNodeDoc } from '@/lib/jsonld'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { getPageContent } from '@/lib/page-content'

type MultiDayContent = {
  metadata: { title: string; description: string; ogTitle: string; ogDescription: string }
  hero: { label: string; headlineLine1: string; headlineLine2: string; intro: string[] }
  included: { heading: string; items: string[] }
  howItWorks: { label: string; steps: { title: string; body: string }[] }
  examples: {
    heading: string
    intro: string
    dayLabel: string
    dayTypeLabels: { TRANSFER: string; HOURLY: string }
    items: { title: string; subtitle: string; description: string; daySummaries: string[] }[]
  }
  faq: { heading: string; items: { q: string; a: string }[] }
  builder: { heading: string; intro: string }
  imageAlts: { hero: string; section: string }
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Book a Transfer', item: 'https://rideprestigo.com/book' },
    { '@type': 'ListItem', position: 3, name: 'Multi-day Chauffeur', item: 'https://rideprestigo.com/book/multi-day' },
  ],
}

// CR-01: converted from a static `metadata` export to generateMetadata()
// so the current locale is available for the self-referencing canonical.
// 75-07: /book/multi-day now has a content model
// (content/pages/<locale>/book/multi-day.json) -> `content: { kind: 'page',
// key: 'book/multi-day' }` makes the hreflang cluster translation-aware
// (Phase 74 D-07), not "all locales assumed valid".
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('book/multi-day', locale) as MultiDayContent
  const alternates = getAlternates('/book/multi-day', { indexable: true, content: { kind: 'page', key: 'book/multi-day' }, locale })
  return {
    title: { absolute: content.metadata.title },
    description: content.metadata.description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description: content.metadata.ogDescription,
      images: [{ url: 'https://rideprestigo.com/multi-day-hero.png', width: 1200, height: 630 }],
    },
  }
}

interface ExampleDay {
  day: number
  type: 'TRANSFER' | 'HOURLY'
}

// Structural config — day numbers and TRANSFER/HOURLY type per example stay
// in code, zipped by index with the translated `examples.items[i].daySummaries`
// catalog array (Phase 69 convention). The displayed TRANSFER/HOURLY badge
// text itself is translated via `examples.dayTypeLabels` (keyed by these
// same structural type values) so the badge does not leak English.
const EXAMPLE_DAYS: ExampleDay[][] = [
  [
    { day: 1, type: 'TRANSFER' },
    { day: 2, type: 'HOURLY' },
    { day: 3, type: 'TRANSFER' },
  ],
  [
    { day: 1, type: 'TRANSFER' },
    { day: 2, type: 'HOURLY' },
    { day: 3, type: 'TRANSFER' },
    { day: 4, type: 'HOURLY' },
    { day: 5, type: 'TRANSFER' },
  ],
  [
    { day: 1, type: 'TRANSFER' },
    { day: 2, type: 'HOURLY' },
    { day: 3, type: 'TRANSFER' },
    { day: 4, type: 'HOURLY' },
  ],
  [
    { day: 1, type: 'TRANSFER' },
    { day: 2, type: 'HOURLY' },
    { day: 3, type: 'TRANSFER' },
  ],
  [
    { day: 1, type: 'TRANSFER' },
    { day: 2, type: 'TRANSFER' },
  ],
  [
    { day: 1, type: 'TRANSFER' },
    { day: 2, type: 'HOURLY' },
    { day: 3, type: 'HOURLY' },
    { day: 4, type: 'TRANSFER' },
  ],
]

// Structural config — the 4 how-it-works step numbers stay in code, zipped
// by index with the translated `howItWorks.steps` catalog array (Phase 69
// convention, reused from 75-06's /book refactor).
const stepNumbers = ['01', '02', '03', '04']

export default async function MultiDayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('book/multi-day', locale) as MultiDayContent
  const businessDoc = businessNodeDoc()
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {businessDoc && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessDoc) }} />}
      <MetaViewContent contentName="Multi-Day Chauffeur" />
      <Nav />
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--anthracite)',
        color: 'var(--offwhite)',
        paddingBottom: '80px',
      }}
    >
      {/* ── Hero ── */}
      <section
        aria-labelledby="multiday-hero-heading"
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 'clamp(420px, 55vw, 680px)',
          display: 'flex',
          alignItems: 'flex-end',
          overflow: 'hidden',
          marginBottom: '0',
        }}
      >
        {/* Background image */}
        <Image
          src="/multi-day-hero.png"
          alt={content.imageAlts.hero}
          fill
          style={{ objectFit: 'cover', objectPosition: 'center 40%' }}
        />
        {/* Gradient overlay — bottom-heavy so text is readable */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(20,20,22,0.35) 0%, rgba(20,20,22,0.68) 50%, rgba(20,20,22,0.96) 100%)',
          }}
        />
        {/* Text content */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '960px', width: '100%', margin: '0 auto', padding: '48px 24px 56px' }}>
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: 'var(--copper-light)',
              marginBottom: '16px',
            }}
          >
            {content.hero.label}
          </p>
          <h1
            id="multiday-hero-heading"
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(36px, 6vw, 60px)',
              fontWeight: 400,
              lineHeight: 1.1,
              marginBottom: '28px',
              color: 'var(--offwhite)',
            }}
          >
            {content.hero.headlineLine1} <br />{content.hero.headlineLine2}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '16px',
              lineHeight: 1.8,
              color: 'var(--warmgrey)',
              maxWidth: '640px',
              marginBottom: '20px',
            }}
          >
            {content.hero.intro[0]}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '16px',
              lineHeight: 1.8,
              color: 'var(--warmgrey)',
              maxWidth: '640px',
            }}
          >
            {content.hero.intro[1]}
          </p>
        </div>
      </section>

      {/* ── What's included ── */}
      <section
        aria-labelledby="multiday-includes-heading"
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '40px 24px',
          borderTop: '1px solid var(--anthracite-light)',
          borderBottom: '1px solid var(--anthracite-light)',
        }}
      >
        <h2
          id="multiday-includes-heading"
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
            marginBottom: '24px',
          }}
        >
          {content.included.heading}
        </h2>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gap: '14px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {content.included.items.map((item) => (
            <li
              key={item}
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '14px',
                lineHeight: 1.6,
                color: 'var(--offwhite)',
                paddingLeft: '24px',
                position: 'relative',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '10px',
                  width: '8px',
                  height: '1px',
                  background: 'var(--copper-light)',
                }}
              />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* ── How it works ── */}
      <section
        aria-labelledby="multiday-how-heading"
        style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 24px 32px' }}
      >
        <h2
          id="multiday-how-heading"
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
            marginBottom: '32px',
          }}
        >
          {content.howItWorks.label}
        </h2>
        <ol
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gap: '0',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}
        >
          {stepNumbers.map((step, i) => {
            const s = content.howItWorks.steps[i]
            return (
            <div
              key={step}
              style={{
                padding: '28px 24px',
                borderLeft: '1px solid var(--anthracite-light)',
                borderBottom: '1px solid var(--anthracite-light)',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontSize: '40px',
                  fontWeight: 400,
                  color: 'var(--anthracite-light)',
                  lineHeight: 1,
                  marginBottom: '12px',
                }}
              >
                {step}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--copper-light)',
                  marginBottom: '10px',
                }}
              >
                {s.title}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '14px',
                  lineHeight: 1.65,
                  color: 'var(--warmgrey)',
                }}
              >
                {s.body}
              </p>
            </div>
            )
          })}
        </ol>
      </section>

      {/* ── Itinerary examples (content.examples) ── */}
      <section
        aria-labelledby="multiday-examples-heading"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderTop: '1px solid var(--anthracite-light)',
        }}
      >
        {/* Background image */}
        <Image
          src="/multi-day-itineraries-bg.png"
          alt={content.imageAlts.section}
          fill
          style={{ objectFit: 'cover', objectPosition: 'center', opacity: 0.22 }}
        />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '960px', margin: '0 auto', padding: '48px 24px 32px' }}>
        <h2
          id="multiday-examples-heading"
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
            marginBottom: '8px',
          }}
        >
          {content.examples.heading}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            color: 'var(--warmgrey)',
            marginBottom: '32px',
            lineHeight: 1.6,
          }}
        >
          {content.examples.intro}
        </p>
        <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
          {EXAMPLE_DAYS.map((days, exampleIndex) => {
            const example = content.examples.items[exampleIndex]
            return (
            <article
              key={example.title}
              style={{
                background: 'var(--anthracite-dark)',
                border: '1px solid var(--anthracite-light)',
                padding: '28px',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontSize: '26px',
                  fontWeight: 400,
                  marginBottom: '6px',
                  color: 'var(--offwhite)',
                  lineHeight: 1.2,
                }}
              >
                {example.title}
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--warmgrey)',
                  marginBottom: '16px',
                }}
              >
                {example.subtitle}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '13px',
                  lineHeight: 1.65,
                  color: 'var(--warmgrey)',
                  marginBottom: '20px',
                  borderLeft: '2px solid var(--anthracite-light)',
                  paddingLeft: '14px',
                }}
              >
                {example.description}
              </p>
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '10px' }}>
                {days.map((d, dayIndex) => (
                  <li
                    key={d.day}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      fontFamily: 'var(--font-montserrat)',
                      fontSize: '13px',
                      lineHeight: 1.55,
                      color: 'var(--offwhite)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.2em',
                        color: 'var(--copper-light)',
                        minWidth: '52px',
                        paddingTop: '2px',
                      }}
                    >
                      {content.examples.dayLabel.replace('{day}', String(d.day))}
                    </span>
                    <span>
                      <strong style={{ fontWeight: 500, color: 'var(--copper-lighter)' }}>{content.examples.dayTypeLabels[d.type]}</strong>
                      {' — '}
                      {example.daySummaries[dayIndex]}
                    </span>
                  </li>
                ))}
              </ol>
            </article>
            )
          })}
        </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section
        aria-labelledby="multiday-faq-heading"
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '48px 24px 32px',
          borderTop: '1px solid var(--anthracite-light)',
        }}
      >
        <h2
          id="multiday-faq-heading"
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
            marginBottom: '32px',
          }}
        >
          {content.faq.heading}
        </h2>
        <dl style={{ display: 'grid', gap: '0' }}>
          {content.faq.items.map(({ q, a }) => (
            <div
              key={q}
              style={{
                padding: '24px 0',
                borderBottom: '1px solid var(--anthracite-light)',
                display: 'grid',
                gridTemplateColumns: '1fr 1.6fr',
                gap: '32px',
              }}
            >
              <dt
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--offwhite)',
                  lineHeight: 1.5,
                }}
              >
                {q}
              </dt>
              <dd
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '13px',
                  color: 'var(--warmgrey)',
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Form ── */}
      <section
        aria-labelledby="multiday-form-heading"
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '48px 24px 64px',
          borderTop: '1px solid var(--anthracite-light)',
        }}
      >
        <h2
          id="multiday-form-heading"
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
            marginBottom: '8px',
          }}
        >
          {content.builder.heading}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            color: 'var(--warmgrey)',
            marginBottom: '32px',
            lineHeight: 1.6,
          }}
        >
          {content.builder.intro}
        </p>
        <MultiDayForm />
      </section>
    </main>
      <Footer />
    </>
  )
}
