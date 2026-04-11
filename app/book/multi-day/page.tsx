import type { Metadata } from 'next'
import MultiDayForm from '@/components/booking/MultiDayForm'

export const metadata: Metadata = {
  title: 'Multi-day Chauffeur Hire | PRESTIGO',
  description:
    'Dedicated chauffeur service for multi-day journeys across Central Europe. Build your day-by-day itinerary and receive a tailored quote within 24 hours.',
}

const INCLUDES = [
  'Dedicated English-speaking chauffeur for the full duration of your trip',
  'Premium vehicle class matched to your group size and comfort preferences',
  'Flexible day-by-day routing — Transfer, Hourly, or a combination of both',
  'Driver accommodation, tolls, parking, and road taxes fully covered by PRESTIGO',
  'Meet & greet at airports and hotels with name-board service',
  '24/7 concierge support throughout your journey for last-minute changes',
  'Flight monitoring on travel days — we track delays so your schedule stays intact',
  'Child seats, extra luggage space, and special requests arranged on request',
]

interface ExampleDay {
  day: number
  type: 'TRANSFER' | 'HOURLY'
  summary: string
}

interface ExampleItinerary {
  title: string
  subtitle: string
  description: string
  days: ExampleDay[]
}

const EXAMPLES: ExampleItinerary[] = [
  {
    title: 'Executive trip — Prague to Vienna',
    subtitle: '3 days · 2 transfers + city programme',
    description:
      'A classic Central European business circuit. Day one moves you from Prague to Vienna in style, with a brief stop at the Lednice château en route if time allows. Day two is yours — the chauffeur is on call for meetings, the airport, the opera, or a private wine dinner in the Wachau. Day three returns you to Prague in time for an afternoon flight.',
    days: [
      { day: 1, type: 'TRANSFER', summary: 'Prague (hotel / airport) → Vienna — ≈4 h drive, optional scenic stop' },
      { day: 2, type: 'HOURLY', summary: 'Vienna city programme — 6 h, meetings, sightseeing, or both' },
      { day: 3, type: 'TRANSFER', summary: 'Vienna → Prague (return), morning departure' },
    ],
  },
  {
    title: 'Central Europe scenic tour',
    subtitle: '5 days · Prague → Český Krumlov → Salzburg → Munich',
    description:
      'A leisurely cultural arc through four countries. The chauffeur handles all logistics — luggage loading, hotel drop-offs, and border crossings — so you move between UNESCO sites and alpine scenery without a single logistical worry. Each city stop is long enough to feel unhurried.',
    days: [
      { day: 1, type: 'TRANSFER', summary: 'Prague → Český Krumlov — UNESCO old town, castle views' },
      { day: 2, type: 'HOURLY', summary: 'Český Krumlov exploration — 5 h guided atmosphere' },
      { day: 3, type: 'TRANSFER', summary: 'Český Krumlov → Salzburg — alpine foothills, lunch stop' },
      { day: 4, type: 'HOURLY', summary: 'Salzburg — Mozart sites, Mirabell gardens, old town — 6 h' },
      { day: 5, type: 'TRANSFER', summary: 'Salzburg → Munich (airport or hotel drop-off)' },
    ],
  },
  {
    title: 'Corporate roadshow — Prague · Brno · Warsaw',
    subtitle: '4 days · senior team client visits across three cities',
    description:
      'Designed for senior teams running back-to-back client or investor meetings across multiple cities. One dedicated vehicle, one familiar driver, no time lost on logistics. The itinerary below is typical; we adapt departure times around your calendar in real time.',
    days: [
      { day: 1, type: 'TRANSFER', summary: 'Prague → Brno — morning departure, afternoon meetings' },
      { day: 2, type: 'HOURLY', summary: 'Brno — office visits and working lunch — 7 h on-call' },
      { day: 3, type: 'TRANSFER', summary: 'Brno → Warsaw — long-distance transfer, overnight' },
      { day: 4, type: 'HOURLY', summary: 'Warsaw city — final meetings + evening flight drop-off — 8 h' },
    ],
  },
  {
    title: 'Spa & wellness retreat — Karlovy Vary',
    subtitle: '3 days · Prague base + two full days in the spa triangle',
    description:
      'Western Bohemia\'s spa towns — Karlovy Vary, Mariánské Lázně, Františkovy Lázně — are just 90 minutes from Prague and among the most serene in Europe. This itinerary gives you two full unhurried days in the colonnades, with the car available for morning and evening transfers between hotels and treatment centres.',
    days: [
      { day: 1, type: 'TRANSFER', summary: 'Prague → Karlovy Vary — check-in, evening colonnade walk' },
      { day: 2, type: 'HOURLY', summary: 'Karlovy Vary & surrounds — 6 h spa circuit, optional Mariánské Lázně' },
      { day: 3, type: 'TRANSFER', summary: 'Karlovy Vary → Prague — flexible departure, airport option' },
    ],
  },
  {
    title: 'Wedding weekend — private group transfer',
    subtitle: '2 days · Prague city + Bohemian countryside venue',
    description:
      'Moving a wedding party between Prague hotels, the countryside venue, and back requires precision timing and a vehicle that matches the occasion. We coordinate with your event planner, hold waiting time between ceremony and reception, and ensure guests arrive composed.',
    days: [
      { day: 1, type: 'TRANSFER', summary: 'Prague hotels → countryside venue — ceremony and reception' },
      { day: 2, type: 'TRANSFER', summary: 'Venue → Prague (hotels + airport) — morning returns' },
    ],
  },
  {
    title: 'Wine & gastronomy — Moravia',
    subtitle: '4 days · Prague → South Moravia wine region loop',
    description:
      'Moravia\'s wine country sits two hours east of Prague and produces some of the best Welschriesling and Blaufränkisch in Central Europe — virtually unknown outside the region. This circuit combines cellar visits, open-air wine villages, and the Lednice–Valtice UNESCO landscape.',
    days: [
      { day: 1, type: 'TRANSFER', summary: 'Prague → Mikulov — boutique wine hotel, hillside castle' },
      { day: 2, type: 'HOURLY', summary: 'Wine cellar circuit — Valtice, Znojmo, Pálava hills — 7 h' },
      { day: 3, type: 'HOURLY', summary: 'Lednice–Valtice UNESCO landscape, afternoon tasting — 6 h' },
      { day: 4, type: 'TRANSFER', summary: 'Mikulov → Prague (or Brno airport) — return journey' },
    ],
  },
]

const FAQ = [
  {
    q: 'How far in advance do I need to book?',
    a: 'We accept requests up to 12 months ahead and as close as 48 hours before the first day, subject to vehicle availability. For peak periods (May–September, December) we recommend booking at least two weeks out.',
  },
  {
    q: 'Can I change the itinerary after submitting?',
    a: 'Yes. Once we send your quote, you can request changes before confirming. After confirmation, minor adjustments — departure times, additional stops — are handled directly with your driver. Major route changes may affect pricing.',
  },
  {
    q: 'Which countries do you cover?',
    a: 'Our primary territory is Czech Republic, Austria, Germany, Slovakia, Poland, and Hungary. We can also arrange transfers into Croatia, Slovenia, and the Benelux on request. Longer itineraries are quoted individually.',
  },
  {
    q: 'What vehicle classes are available for multi-day trips?',
    a: 'Business (Mercedes E-Class or equivalent), First Class (Mercedes S-Class or equivalent), and Business Van (Mercedes V-Class, up to 6 passengers). All classes include ample boot space; extra luggage trailers are available for group transfers.',
  },
  {
    q: 'Is accommodation for the driver included?',
    a: 'Yes — driver accommodation, meals on multi-day routes, and all tolls are fully included in your quote. There are no hidden surcharges.',
  },
  {
    q: 'Do you provide receipts for corporate expense reporting?',
    a: 'Yes. We issue a VAT invoice after the journey is complete. We can address invoices to your company and split by cost centre on request.',
  },
]

export default function MultiDayPage() {
  return (
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
        style={{ maxWidth: '960px', margin: '0 auto', padding: '64px 24px 48px' }}
      >
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
          PRESTIGO · Multi-day chauffeur hire
        </p>
        <h1
          id="multiday-hero-heading"
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(36px, 6vw, 60px)',
            fontWeight: 400,
            lineHeight: 1.1,
            marginBottom: '28px',
          }}
        >
          One chauffeur. Every day.<br />Wherever Central Europe takes you.
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '16px',
            lineHeight: 1.8,
            color: 'var(--warmgrey)',
            maxWidth: '680px',
            marginBottom: '20px',
          }}
        >
          Some journeys don&rsquo;t fit into a single booking. A corporate roadshow spanning three cities. A family tour across Bohemia and Bavaria. A wedding weekend that moves between Prague and a countryside château. For these, you need a dedicated vehicle and a driver who knows your itinerary as well as you do.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '16px',
            lineHeight: 1.8,
            color: 'var(--warmgrey)',
            maxWidth: '680px',
          }}
        >
          Build your day-by-day itinerary below — mix Transfer and Hourly days freely, add intermediate stops, set departure times — and we&rsquo;ll return a fixed quote within 24 hours. No online payment required: once the itinerary is right, we confirm by email and the rest is taken care of.
        </p>
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
          Everything included
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
          {INCLUDES.map((item) => (
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
          How it works
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
          {[
            { step: '01', title: 'Build your itinerary', body: 'Add days, choose Transfer or Hourly for each, set dates and departure times. Stops and special requests go in the notes.' },
            { step: '02', title: 'Receive your quote', body: 'We review your route and send a fixed all-inclusive quote within 24 hours. No surprises — the price covers driver, tolls, and accommodation.' },
            { step: '03', title: 'Confirm by email', body: 'Reply to accept. No payment link, no deposit. We confirm your booking and assign your dedicated chauffeur.' },
            { step: '04', title: 'Travel', body: 'Your driver meets you at the first pick-up point. From that moment, logistics are ours to manage.' },
          ].map(({ step, title, body }) => (
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
                {title}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '14px',
                  lineHeight: 1.65,
                  color: 'var(--warmgrey)',
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </ol>
      </section>

      {/* ── Example itineraries ── */}
      <section
        aria-labelledby="multiday-examples-heading"
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '48px 24px 32px',
          borderTop: '1px solid var(--anthracite-light)',
        }}
      >
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
          Example itineraries
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
          These are real trip types we run regularly. Use them as starting points — every itinerary we quote is built from scratch around your requirements.
        </p>
        <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
          {EXAMPLES.map((example) => (
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
                {example.days.map((d) => (
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
                      DAY {d.day}
                    </span>
                    <span>
                      <strong style={{ fontWeight: 500, color: 'var(--copper-lighter)' }}>{d.type}</strong>
                      {' — '}
                      {d.summary}
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
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
          Frequently asked questions
        </h2>
        <dl style={{ display: 'grid', gap: '0' }}>
          {FAQ.map(({ q, a }) => (
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
          Build your itinerary
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
          Add your days below. Each day can be a point-to-point Transfer or an Hourly block — mix freely. We&rsquo;ll review and respond with a fixed quote within 24 hours.
        </p>
        <MultiDayForm />
      </section>
    </main>
  )
}
