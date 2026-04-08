import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Airport Transfer Prague — PRG Václav Havel | PRESTIGO',
  description: 'Prague airport transfer with flight tracking, meet & greet, and fixed price. All terminals covered. Available 24/7. Book your PRG transfer online in seconds.',
  alternates: { canonical: '/services/airport-transfer' },
  openGraph: {
    url: 'https://rideprestigo.com/services/airport-transfer',
    title: 'Airport Transfer Prague — PRG Václav Havel | PRESTIGO',
    description: 'Prague airport transfer with flight tracking, meet & greet, and fixed price. All terminals covered. Available 24/7.',
  },
}

const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Airport Transfer Prague',
  description: 'Premium airport transfer service at Prague Václav Havel Airport. Flight tracking, meet & greet, name board, fixed price.',
  provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
  areaServed: 'Prague, Czech Republic',
  url: 'https://rideprestigo.com/services/airport-transfer',
  offers: { '@type': 'Offer', price: '49', priceCurrency: 'EUR' },
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'Airport Transfer', item: 'https://rideprestigo.com/services/airport-transfer' },
  ],
}

const features = [
  {
    title: 'Flight Tracking',
    body: 'Your driver monitors your flight in real time. If your flight is delayed, your driver adjusts — no extra charge, no phone calls needed.',
  },
  {
    title: 'Meet & Greet at Arrivals',
    body: 'Your chauffeur holds a name board at the Arrivals hall. No searching, no stress. From the moment you land, everything is handled.',
  },
  {
    title: 'Fixed Price',
    body: 'The price you see at booking is the price you pay. No surge pricing, no hidden tolls, no surprises at the end of the journey.',
  },
  {
    title: 'All Terminals',
    body: 'Terminal 1 and Terminal 2 — both covered, every flight, every airline. Domestic and international arrivals.',
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
]

export default function AirportTransferPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative border-b border-anthracite-light overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <img src="/hero-airport-transfer.webp" alt="Prague Airport Transfer — PRESTIGO" className="w-full h-full object-cover" style={{ filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Airport Transfer · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague Airport.<br />
            <span className="display-italic">Met on arrival, every time.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Your driver monitors your flight in real time, holds your name board at Arrivals, and handles your luggage. Fixed price. No surprises. From the moment you land, everything is handled.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/book" className="btn-primary">Book Airport Transfer</a>
            <a href="/services" className="btn-secondary">All Services</a>
          </div>
        </div>
      </section>

      {/* Price callout */}
      <section className="bg-anthracite-mid py-10 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--warmgrey)' }}>Starting from</p>
            <p className="font-display font-light text-[42px] md:text-[52px] text-offwhite">€49</p>
            <p className="body-text text-[11px] mt-1">Fixed price · PRG → Prague city centre</p>
          </div>
          <div className="flex flex-col gap-2">
            {['Flight tracking included', 'Meet & greet at Arrivals', 'Name board included', 'All terminals covered', 'Waiting time included'].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">What's included</p>
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

      {/* How it works */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">How it works</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { step: '01', title: 'Book online', body: 'Enter your flight number, pickup address, and passenger details. Confirmed in seconds.' },
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

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
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

      {/* CTA */}
      <section className="bg-anthracite-mid py-20 border-t border-anthracite-light">
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
