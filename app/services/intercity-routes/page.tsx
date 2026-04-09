import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Intercity Routes from Prague — Vienna, Berlin, Munich',
  description: 'Private chauffeur transfers from Prague to Vienna, Berlin, Munich, Budapest, Bratislava and beyond. Fixed price, door-to-door, available 24/7.',
  alternates: { canonical: '/services/intercity-routes' },
  openGraph: {
    url: 'https://rideprestigo.com/services/intercity-routes',
    title: 'Intercity Routes from Prague — Vienna, Berlin, Munich | PRESTIGO',
    description: 'Private chauffeur transfers from Prague to Vienna, Berlin, Munich, Budapest, Bratislava and beyond. Fixed price, door-to-door.',
  },
}

const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Intercity Chauffeur Routes from Prague',
  description: 'Private door-to-door chauffeur transfers from Prague to Vienna, Berlin, Munich, Budapest, Bratislava, and other Central European cities.',
  provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
  areaServed: 'Central Europe',
  url: 'https://rideprestigo.com/services/intercity-routes',
  offers: { '@type': 'Offer', price: '180', priceCurrency: 'EUR' },
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'Intercity Routes', item: 'https://rideprestigo.com/services/intercity-routes' },
  ],
}

const popularRoutes = [
  { from: 'Prague', to: 'Vienna', slug: 'prague-vienna', duration: '3.5 hrs', price: 'From €485' },
  { from: 'Prague', to: 'Berlin', slug: 'prague-berlin', duration: '4 hrs', price: 'From €580' },
  { from: 'Prague', to: 'Munich', slug: 'prague-munich', duration: '4 hrs', price: 'From €635' },
  { from: 'Prague', to: 'Budapest', slug: 'prague-budapest', duration: '5.5 hrs', price: 'From €885' },
  { from: 'Prague', to: 'Bratislava', slug: 'prague-bratislava', duration: '3.5 hrs', price: 'From €545' },
  { from: 'Prague', to: 'Dresden', slug: 'prague-dresden', duration: '1.5 hrs', price: 'From €250' },
]

const features = [
  {
    title: 'Fixed Price Per Route',
    body: 'Every intercity route has a published fixed price. No meter, no tolls added on top. What you see when you book is what you pay.',
  },
  {
    title: 'Door-to-Door',
    body: 'Your driver picks you up from your hotel, office, or home — and drops you at your exact destination. No stations, no connections.',
  },
  {
    title: 'Work the Whole Way',
    body: 'Leather seating, USB charging, onboard Wi-Fi. Four hours to Vienna is a productive morning — or a quiet one, entirely your choice.',
  },
  {
    title: 'Available 24/7',
    body: 'Early morning departures for business meetings. Late-night returns after events. Intercity transfers run around the clock.',
  },
]

export default function IntercityRoutesPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Intercity Routes · Central Europe</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague to anywhere.<br />
            <span className="display-italic">In a Mercedes.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Door-to-door private transfers across Central Europe. Prague to Vienna, Berlin, Munich, Budapest and beyond — fixed price, no connections, a chauffeur who knows the road.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/routes" className="btn-primary">View All Routes</a>
            <a href="/book" className="btn-secondary">Book a Transfer</a>
          </div>
        </div>
      </section>

      {/* Popular routes */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Popular routes</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
            {popularRoutes.map((r) => (
              <a key={`${r.from}-${r.to}`} href={`/routes/${r.slug}`} className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors group block">
                <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--copper)' }}>
                  {r.from} → {r.to}
                </p>
                <p className="font-display font-light text-[28px] text-offwhite mb-1">{r.to}</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="font-body font-light text-[11px] text-warmgrey tracking-wide">{r.duration}</span>
                  <span className="font-body font-light text-[11px] tracking-wide" style={{ color: 'var(--copper-light)' }}>{r.price}</span>
                </div>
              </a>
            ))}
          </div>
          <div className="mt-8">
            <a href="/routes" className="font-body font-light text-[11px] tracking-[0.18em] uppercase hover:text-offwhite transition-colors" style={{ color: 'var(--copper)' }}>
              View all 50+ routes →
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Why choose a private transfer</p>
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

      {/* vs train comparison */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Private transfer vs. train</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="border border-anthracite-light p-8">
              <h2 className="font-display font-light text-[24px] text-offwhite mb-6">PRESTIGO Private Transfer</h2>
              <ul className="flex flex-col gap-3">
                {['Door-to-door, no station transfers', 'Fixed price, no dynamic fares', 'Work or rest in your own space', 'Luggage handled, no overhead bins', 'No delays, no cancellations'].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                    <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-anthracite-light p-8 opacity-60">
              <h2 className="font-display font-light text-[24px] text-offwhite mb-6">Train / Bus</h2>
              <ul className="flex flex-col gap-3">
                {['Station to station only', 'Price varies by booking date', 'Shared carriage, limited privacy', 'Luggage restrictions apply', 'Subject to delays and timetable'].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--warmgrey)' }} />
                    <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <p className="label mb-6">Ready to go?</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            Choose your route and book<br />
            <span className="display-italic">in under 60 seconds.</span>
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a href="/routes" className="btn-primary">View All Routes</a>
            <a href="/book" className="btn-secondary">Book Now</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
