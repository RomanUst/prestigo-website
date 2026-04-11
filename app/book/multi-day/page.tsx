import type { Metadata } from 'next'
import MultiDayForm from '@/components/booking/MultiDayForm'

export const metadata: Metadata = {
  title: 'Multi-day Chauffeur Hire | PRESTIGO',
  description:
    'Dedicated chauffeur service for multi-day journeys across Central Europe. Build your day-by-day itinerary and receive a tailored quote within 24 hours.',
}

const INCLUDES = [
  'Dedicated English-speaking chauffeur for the full trip',
  'Premium vehicle class selected to match your itinerary',
  'Flexible routing — add or remove stops as plans change',
  'Driver accommodation and tolls handled by PRESTIGO',
  '24/7 concierge support throughout your journey',
]

interface ExampleDay {
  day: number
  type: 'TRANSFER' | 'HOURLY'
  summary: string
}

interface ExampleItinerary {
  title: string
  subtitle: string
  days: ExampleDay[]
}

const EXAMPLES: ExampleItinerary[] = [
  {
    title: 'Business trip — Prague to Vienna',
    subtitle: '3 days · 2 transfers + city tour',
    days: [
      { day: 1, type: 'TRANSFER', summary: 'Prague → Vienna (≈4 h drive)' },
      { day: 2, type: 'HOURLY', summary: 'Vienna city programme (6 h)' },
      { day: 3, type: 'TRANSFER', summary: 'Vienna → Prague (return)' },
    ],
  },
  {
    title: 'Central Europe scenic tour',
    subtitle: '5 days · Prague → Český Krumlov → Salzburg → Munich',
    days: [
      { day: 1, type: 'TRANSFER', summary: 'Prague → Český Krumlov (with UNESCO photo stop)' },
      { day: 2, type: 'HOURLY', summary: 'Český Krumlov exploration (5 h)' },
      { day: 3, type: 'TRANSFER', summary: 'Český Krumlov → Salzburg' },
      { day: 4, type: 'HOURLY', summary: 'Salzburg old town and Mozart sites (6 h)' },
      { day: 5, type: 'TRANSFER', summary: 'Salzburg → Munich (final drop-off)' },
    ],
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
      <section
        aria-labelledby="multiday-hero-heading"
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '64px 24px 32px',
        }}
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
            fontSize: 'clamp(36px, 6vw, 56px)',
            fontWeight: 400,
            lineHeight: 1.1,
            marginBottom: '24px',
          }}
        >
          Tailored multi-day journeys, one dedicated chauffeur.
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '16px',
            lineHeight: 1.7,
            color: 'var(--warmgrey)',
            maxWidth: '640px',
          }}
        >
          Tell us where you&rsquo;d like to go each day — a single transfer, a city tour, or a multi-stop route
          across Central Europe — and we&rsquo;ll return a fixed quote within 24 hours. No online payment, no
          pressure: once the itinerary is right, we&rsquo;ll confirm your booking by email.
        </p>
      </section>

      <section
        aria-labelledby="multiday-includes-heading"
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '24px',
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
            marginBottom: '20px',
          }}
        >
          What&rsquo;s included
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '12px' }}>
          {INCLUDES.map((item) => (
            <li
              key={item}
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '15px',
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

      <section
        aria-labelledby="multiday-examples-heading"
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '48px 24px 32px',
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
            marginBottom: '24px',
          }}
        >
          Example itineraries
        </h2>
        <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {EXAMPLES.map((example) => (
            <article
              key={example.title}
              style={{
                background: 'var(--anthracite-dark)',
                border: '1px solid var(--anthracite-light)',
                padding: '24px',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontSize: '24px',
                  fontWeight: 400,
                  marginBottom: '8px',
                  color: 'var(--offwhite)',
                }}
              >
                {example.title}
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '12px',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--warmgrey)',
                  marginBottom: '20px',
                }}
              >
                {example.subtitle}
              </p>
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '12px' }}>
                {example.days.map((d) => (
                  <li
                    key={d.day}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      fontFamily: 'var(--font-montserrat)',
                      fontSize: '14px',
                      lineHeight: 1.6,
                      color: 'var(--offwhite)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.2em',
                        color: 'var(--copper-light)',
                        minWidth: '56px',
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

      <section
        aria-labelledby="multiday-form-heading"
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '32px 24px 64px',
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
            marginBottom: '24px',
          }}
        >
          Build your itinerary
        </h2>
        <MultiDayForm />
      </section>
    </main>
  )
}
