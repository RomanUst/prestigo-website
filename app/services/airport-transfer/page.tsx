import type { Metadata } from 'next'

export const revalidate = 120

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import BookingSection from '@/components/BookingSection'
import { getPricingConfig } from '@/lib/pricing-config'
import { buildAirportTransferJsonLd } from '@/lib/jsonld'
import { AIRPORT_FALLBACK } from '@/lib/price-fallbacks'
import { getStaticAggregateRating } from '@/lib/google-reviews'

export async function generateMetadata(): Promise<Metadata> {
  const { globals } = await getPricingConfig()
  const businessPrice = globals.airportPromoActive
    ? globals.airportPromoPriceEur
    : globals.airportRegularPriceEur
  return {
    title: 'Airport Transfer Prague — PRG Václav Havel',
    description: `Prague airport transfer with flight tracking, meet & greet, and fixed price from €${businessPrice}. All terminals covered. Available 24/7. Book your PRG transfer online in seconds.`,
    alternates: {
      canonical: '/services/airport-transfer',
      languages: {
        en: 'https://rideprestigo.com/services/airport-transfer',
        'x-default': 'https://rideprestigo.com/services/airport-transfer',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/services/airport-transfer',
      title: 'Airport Transfer Prague — PRG Václav Havel | PRESTIGO',
      description: `Prague airport transfer with flight tracking, meet & greet, and fixed price from €${businessPrice}. All terminals covered. Available 24/7.`,
      images: [{ url: 'https://rideprestigo.com/hero-airport-transfer.webp', width: 1200, height: 630 }],
    },
  }
}

const features = [
  {
    title: 'What happens if my flight is delayed?',
    body: 'Your driver monitors your flight in real time. If your flight is delayed, your driver adjusts — no extra charge, no phone calls needed.',
  },
  {
    title: 'How does my driver find me at Prague Airport?',
    body: 'Your chauffeur holds a name board at the Arrivals hall. No searching, no stress. From the moment you land, everything is handled.',
  },
  {
    title: 'What is the price of an airport transfer from Prague?',
    body: 'The price you see at booking is the price you pay. No surge pricing, no hidden tolls, no surprises at the end of the journey.',
  },
  {
    title: 'Which terminal does my driver meet me at?',
    body: 'Terminal 2 handles Schengen arrivals — flights from Germany, Austria, France, the Netherlands, and most EU routes. Terminal 1 covers all non-Schengen arrivals: UK, US, Middle East, and long-haul. Both terminals are covered on every booking. Enter your flight number and your driver automatically meets you in the correct Arrivals hall with your name board — no parking lots, no ride-hail zones.',
  },
]

const faqs = [
  {
    q: 'What if my flight is delayed?',
    a: 'Your driver tracks your flight live. Delays are automatically accommodated — no extra charge for waiting up to 60 minutes after landing.',
  },
  {
    q: 'Which airports do you serve?',
    a: 'We primarily serve Prague Václav Havel Airport (PRG). We also arrange transfers to/from Vienna (VIE), Berlin (BER), and Munich (MUC) on request.',
  },
  {
    q: 'How do I find my driver at the airport?',
    a: 'Your driver will be waiting in the Arrivals hall with a name board. You will receive their name and phone number before the journey.',
  },
  {
    q: 'Can I book for early morning or late night arrivals?',
    a: 'Yes. PRESTIGO operates 24/7, 365 days a year. Early morning departures and late-night arrivals are standard.',
  },
  {
    q: 'How does PRESTIGO compare to taking an Uber from the airport?',
    a: 'Uber has held the exclusive official taxi rank at PRG since September 2023. A standard Uber to central Prague runs CZK 650–800 — lower than PRESTIGO\'s starting price. The difference is how you are collected: your PRESTIGO driver is inside the Arrivals hall with a name board before you reach the exit. Uber requires walking 120 metres to the designated P11 pickup zone and waiting for a vehicle to be assigned. For solo travellers with light luggage arriving off-peak, Uber is a practical option. For business arrivals, families, or anyone with luggage and a tight connection, the meet & greet and flight tracking more than justify the difference.',
  },
]

export default async function AirportTransferPage() {
  const { globals } = await getPricingConfig()
  const sClassAirport = AIRPORT_FALLBACK.sClass
  const vClassAirport = AIRPORT_FALLBACK.vClass
  const airportJsonLd = buildAirportTransferJsonLd(globals, sClassAirport, vClassAirport)
  const rating = getStaticAggregateRating()

  const pageSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      ...airportJsonLd['@graph'],
      ...(rating ? [{
        '@type': ['LocalBusiness', 'TaxiService'],
        '@id': 'https://rideprestigo.com/#business',
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: rating.ratingValue.toFixed(1),
          reviewCount: rating.reviewCount,
          bestRating: '5',
          worstRating: '1',
        },
      }] : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
          { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
          { '@type': 'ListItem', position: 3, name: 'Airport Transfer', item: 'https://rideprestigo.com/services/airport-transfer' },
        ],
      },
    ],
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  const businessPrice = globals.airportPromoActive
    ? globals.airportPromoPriceEur
    : globals.airportRegularPriceEur

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-airport-transfer.webp" alt="Prague Airport Transfer — PRESTIGO" fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Airport Transfer · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague Airport Transfer.<br />
            <span className="display-italic">Met on arrival, every time.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Prestigo Prague Airport Transfer is a fixed-price chauffeur service from Václav Havel Airport (PRG) to any Prague address, starting at €{businessPrice}. Your driver tracks your flight in real time, waits up to 60 minutes free at Arrivals with a name board, handles your luggage, and drives you in a Mercedes-Benz E-Class, S-Class, or V-Class.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/book" className="btn-primary">Book Airport Transfer</a>
            <a href="/services" className="btn-secondary">All Services</a>
          </div>
        </div>
      </section>

      <BookingSection />

      <Divider />


      {/* Features */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">What&apos;s included</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {features.map((f) => (
              <div key={f.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h2 className="font-display font-light text-[22px] text-offwhite mb-3">{f.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* How it works */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">How it works</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { step: '01', title: 'Book online', body: 'Enter your flight number, destination address, and passenger details. Select your vehicle class — E-Class, V-Class, or S-Class. Fixed price confirmed in seconds.' },
              { step: '02', title: 'We track your flight', body: 'Your driver monitors your flight live. If it is delayed, your driver adjusts automatically.' },
              { step: '03', title: 'Arrive, relax', body: 'Your chauffeur is waiting at Arrivals with your name board. From here, everything is handled.' },
            ].map((s) => (
              <div key={s.step} className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Journey times */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Journey times from PRG</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-14">
            <div>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                Prague Václav Havel Airport sits 20 km northwest of the city centre. Journey time from the terminal to your hotel or address depends on your destination and the time of day. The figures below reflect typical daytime conditions — allow 5–10 minutes extra during morning or evening rush hours.
              </p>
              <p className="body-text text-[13px] mt-4" style={{ lineHeight: '1.9' }}>
                Your price is fixed at booking regardless of traffic. No meter running, no surge, no negotiation at the end.
              </p>
            </div>
            <div className="flex flex-col gap-0">
              {[
                { place: 'Old Town (Staré Město) / Wenceslas Square', time: '~25 min' },
                { place: 'Vinohrady / Žižkov', time: '~30 min' },
                { place: 'Smíchov / Anděl', time: '~25 min' },
                { place: 'Holešovice / Letná', time: '~30 min' },
                { place: 'Karlín', time: '~32 min' },
                { place: 'Nusle / Pankrác', time: '~28 min' },
              ].map((r) => (
                <div key={r.place} className="flex items-center justify-between border-b border-anthracite-light py-3">
                  <span className="font-body font-light text-[12px] text-offwhite tracking-wide">{r.place}</span>
                  <span className="font-body font-light text-[12px] tracking-[0.1em]" style={{ color: 'var(--copper)' }}>{r.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* Vehicle classes */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Choose your vehicle</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                name: 'E-Class',
                tag: 'Standard premium',
                cap: 'Up to 3 passengers · 3 bags',
                price: `From €${businessPrice}`,
                body: 'The Mercedes E-Class is the everyday vehicle for Prague airport arrivals — quiet, spacious, and immaculate. The right choice for solo travellers, couples, and business arrivals who want comfort without excess.',
              },
              {
                name: 'V-Class',
                tag: 'Group & family',
                cap: 'Up to 6 passengers · 6 bags',
                price: `From €${vClassAirport}`,
                body: 'The Mercedes V-Class seats up to six with full luggage. Ideal for families, groups, and corporate arrivals where one vehicle and one fixed price covers everyone.',
              },
              {
                name: 'S-Class',
                tag: 'Executive flagship',
                cap: 'Up to 3 passengers · 3 bags',
                price: `From €${sClassAirport}`,
                body: 'The Mercedes S-Class is reserved for VIP, diplomatic, and senior executive arrivals. Rear-seat comfort, ambient lighting, and the most refined cabin in the current Mercedes range.',
              },
            ].map((v) => (
              <div key={v.name} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--warmgrey)' }}>{v.tag}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-1">Mercedes {v.name}</h3>
                <p className="font-body font-light text-[11px] tracking-wide mb-4" style={{ color: 'var(--copper)' }}>{v.price} · {v.cap}</p>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Questions</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {faqs.map((item) => (
              <div key={item.q} className="border border-anthracite-light p-8">
                <h3 className="font-display font-light text-[18px] text-offwhite mb-3">{item.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite-mid py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <p className="label mb-6">Ready to book?</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            Book your airport transfer<br />
            <span className="display-italic">in under 60 seconds.</span>
          </h2>
          <div className="mt-10">
            <a href="/book" className="btn-primary">Book Airport Transfer</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
