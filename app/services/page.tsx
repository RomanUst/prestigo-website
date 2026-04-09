import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

const SERVICES_DESCRIPTION = 'Prague chauffeur services: airport transfers, intercity routes, corporate accounts, VIP events, city rides. Fixed price, flight tracking, instant booking.'

export const metadata: Metadata = {
  title: 'Chauffeur Services Prague — Airport, Intercity & Corporate',
  description: SERVICES_DESCRIPTION,
  alternates: { canonical: '/services' },
  openGraph: {
    url: 'https://rideprestigo.com/services',
    title: 'Chauffeur Services Prague — Airport, Intercity & Corporate',
    description: SERVICES_DESCRIPTION,
  },
}

const services = [
  {
    label: 'AIRPORT',
    title: 'Airport Transfer',
    description: 'Prague Václav Havel Airport — met on arrival, every time. Your driver monitors your flight in real time, holds your name board at Arrivals, and handles your luggage. Fixed price from the moment you book.',
    features: ['Flight tracking included', 'Meet & greet at Arrivals', 'Name board included', 'All terminals covered'],
    price: 'From €49',
    cta: 'LEARN MORE',
    href: '/services/airport-transfer',
    bookHref: '/book',
    bookCta: 'BOOK NOW',
  },
  {
    label: 'CITY-TO-CITY',
    title: 'Intercity Routes',
    description: 'Prague to Vienna in 3.5 hours. Prague to Berlin in 4. Door-to-door, in a Mercedes, with a driver who knows the road. Work the whole way or simply watch Europe pass by.',
    features: ['Fixed price per route', 'Prague → Vienna, Berlin, Munich, Budapest, Bratislava, Salzburg, Dresden', 'Available 24/7', 'Business or leisure'],
    price: 'From €180',
    cta: 'LEARN MORE',
    href: '/services/intercity-routes',
    bookHref: '/routes',
    bookCta: 'VIEW ROUTES',
  },
  {
    label: 'CORPORATE',
    title: 'Corporate Accounts',
    description: 'A dedicated account for your company. Monthly invoicing, consolidated reporting, a named account manager. Your travel manager books once, PRESTIGO handles everything else.',
    features: ['Monthly consolidated invoicing', 'Dedicated account manager', 'Priority dispatch', 'Corporate reporting dashboard'],
    price: null,
    cta: 'LEARN MORE',
    href: '/services/corporate-accounts',
    bookHref: '/corporate',
    bookCta: 'SET UP ACCOUNT',
  },
  {
    label: 'VIP',
    title: 'VIP & Events',
    description: 'Diplomatic visits. Private openings. Luxury hotel arrivals. Multi-vehicle coordination for events where every detail matters and nothing can go wrong.',
    features: ['Diplomatic protocol awareness', 'Multi-vehicle coordination', 'Discretion guaranteed', 'Advance route reconnaissance available'],
    price: null,
    cta: 'LEARN MORE',
    href: '/services/vip-events',
    bookHref: '/contact',
    bookCta: 'ENQUIRE',
  },
  {
    label: 'CITY',
    title: 'Prague City Rides',
    description: 'Hourly hire within Prague. Business meetings, theatre, private dinner at a Michelin-starred restaurant. Your chauffeur knows the city — not just the roads.',
    features: ['Hourly hire from 2 hours', 'Local knowledge included', 'Airport-quality service, city rates', 'Ideal for sightseeing & leisure'],
    price: 'From €80/hour',
    cta: 'LEARN MORE',
    href: '/services/city-rides',
    bookHref: '/book',
    bookCta: 'BOOK NOW',
  },
  {
    label: 'GROUP',
    title: 'Group Transfers',
    description: 'Conference delegations. Incentive travel. Corporate off-sites. Minivans, multiple vehicles, precise timing. Everyone arrives together, on schedule.',
    features: ['Minivan & multi-car coordination', 'Up to 50 passengers', 'Conference & events specialists', 'Custom itineraries'],
    price: null,
    cta: 'LEARN MORE',
    href: '/services/group-transfers',
    bookHref: '/contact',
    bookCta: 'GET QUOTE',
  },
]

const trust = [
  {
    title: 'Fixed Price',
    body: 'No surge pricing. No hidden tolls. The price you see at booking is the price you pay.',
  },
  {
    title: 'Flight Tracking',
    body: "Your driver monitors your flight in real time. Delays don't cost you extra.",
  },
  {
    title: 'Instant Confirmation',
    body: 'Book online, confirmed in seconds. No forms, no waiting for callbacks.',
  },
]

const serviceListSchema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'PRESTIGO Chauffeur Services Prague',
  itemListElement: services.map((s, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Service',
      name: s.title,
      description: s.description,
      provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      areaServed: 'Prague, Czech Republic',
      url: `https://rideprestigo.com${s.href}`,
      ...(s.price ? { offers: { '@type': 'Offer', price: s.price.replace(/[^0-9]/g, ''), priceCurrency: 'EUR' } } : {}),
    },
  })),
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
  ],
}

export default function ServicesPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Chauffeur Services · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Every journey.<br />
            <span className="display-italic">Every detail.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            From Prague Václav Havel Airport to anywhere in Central Europe — PRESTIGO chauffeurs deliver every trip with fixed pricing, flight tracking, and the quiet confidence of a service built for executives.
          </p>
        </div>
      </section>

      {/* Service cards */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col gap-0">
          {services.map((s, i) => (
            <div
              key={s.title}
              className={`py-14 md:py-16 border-b border-anthracite-light grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 ${i === 0 ? 'border-t' : ''}`}
            >
              <div>
                <p className="label mb-4">{s.label}</p>
                <h2 className="display text-[28px] md:text-[34px] mb-4">{s.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{s.description}</p>
                {s.price && (
                  <p className="font-body font-light text-[13px] mt-6" style={{ color: 'var(--copper-light)' }}>
                    {s.price}
                  </p>
                )}
              </div>
              <div className="flex flex-col justify-between gap-8">
                <ul className="flex flex-col gap-3">
                  {s.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                      <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-3">
                  <a href={s.href} className="btn-primary self-start">
                    {s.cta}
                  </a>
                  <a href={s.bookHref} className="btn-secondary self-start">
                    {s.bookCta}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust block */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14 text-center">Why PRESTIGO</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {trust.map((t) => (
              <div key={t.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{t.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <p className="label mb-6">Ready to book?</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            Choose your service and book<br />
            <span className="display-italic">in under 60 seconds.</span>
          </h2>
          <div className="mt-10">
            <a href="/book" className="btn-primary">Book a Transfer</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
