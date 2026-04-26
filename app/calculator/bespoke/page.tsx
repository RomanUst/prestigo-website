import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import BespokeQuoteForm from '@/components/calculator/BespokeQuoteForm'

export const metadata: Metadata = {
  title: 'Bespoke Quote — First Class Chauffeur | PRESTIGO',
  description:
    'Request a bespoke chauffeur quote for weddings, corporate VIPs, airport pickups, and special occasions across Central Europe. Response within 24 hours.',
  alternates: {
    canonical: 'https://rideprestigo.com/calculator/bespoke',
    languages: {
      en: 'https://rideprestigo.com/calculator/bespoke',
      'x-default': 'https://rideprestigo.com/calculator/bespoke',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/calculator/bespoke',
    title: 'Bespoke Quote — First Class Chauffeur | PRESTIGO',
    description:
      'Request a bespoke chauffeur quote for special occasions. Response within 24 hours.',
  },
}

export default function BespokeQuotePage() {
  return (
    <>
      <Nav />
      <main
        id="main-content"
        style={{
          background: 'var(--charcoal)',
          minHeight: '100vh',
          paddingBottom: 80,
        }}
      >
        {/* Hero section */}
        <section
          style={{
            maxWidth: 760,
            margin: '0 auto',
            padding: '72px 24px 48px',
          }}
        >
          <p
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 13,
              color: 'var(--warmgrey)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              margin: '0 0 12px 0',
            }}
          >
            PRESTIGO — First Class
          </p>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 'clamp(28px, 5vw, 42px)',
              fontWeight: 300,
              color: 'var(--offwhite)',
              lineHeight: 1.15,
              margin: '0 0 20px 0',
            }}
          >
            Bespoke quote request
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              lineHeight: 1.7,
              margin: 0,
              maxWidth: 560,
            }}
          >
            For First Class chauffeur service that doesn&apos;t fit a standard quote — weddings,
            corporate VIPs, airport receptions, multi-vehicle dispatches. Tell us what you need;
            we respond within 24 hours.
          </p>
        </section>

        {/* Form section */}
        <section
          style={{
            maxWidth: 760,
            margin: '0 auto',
            padding: '0 24px',
          }}
        >
          <BespokeQuoteForm />
        </section>
      </main>
      <Footer />
    </>
  )
}
