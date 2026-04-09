import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Prague City Rides — Hourly Chauffeur Hire',
  description: 'Hourly chauffeur hire within Prague. Business meetings, sightseeing, theatre, private dinners. Airport-quality service at city rates. From €80/hour.',
  alternates: { canonical: '/services/city-rides' },
  openGraph: {
    url: 'https://rideprestigo.com/services/city-rides',
    title: 'Prague City Rides — Hourly Chauffeur Hire | PRESTIGO',
    description: 'Hourly chauffeur hire within Prague. Business meetings, sightseeing, theatre, private dinners. Airport-quality service at city rates. From €80/hour.',
  },
}

const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Prague City Rides — Hourly Chauffeur Hire',
  description: 'Hourly chauffeur hire within Prague for business meetings, sightseeing, leisure, and events. Airport-quality service at city rates.',
  provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
  areaServed: 'Prague, Czech Republic',
  url: 'https://rideprestigo.com/services/city-rides',
  offers: { '@type': 'Offer', price: '80', priceCurrency: 'EUR' },
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'City Rides', item: 'https://rideprestigo.com/services/city-rides' },
  ],
}

const features = [
  {
    title: 'Hourly Hire from 2 Hours',
    body: 'Book by the hour, from a minimum of 2 hours. Your chauffeur stays with you for the full duration — no meters, no rush.',
  },
  {
    title: 'Local Knowledge Included',
    body: 'Our chauffeurs know Prague deeply. Recommend a restaurant, suggest a detour, navigate around an event — consider it part of the service.',
  },
  {
    title: 'Airport-Quality, City Rates',
    body: 'The same fleet, the same service standard, and the same professionalism as our airport transfers — now available for city journeys.',
  },
  {
    title: 'Flexible Itinerary',
    body: 'Your itinerary, your pace. Whether it is three business meetings and a hotel, or a private tour of Malá Strana, your chauffeur adapts.',
  },
]

const useCases = [
  { title: 'Business Meetings', body: 'Multiple stops across Prague with luggage. No parking, no navigation, no delays.' },
  { title: 'Sightseeing', body: 'Castle district, Josefov, Vyšehrad — at a pace that suits you, with a driver who can suggest the best route.' },
  { title: 'Theatre & Dining', body: 'A private evening at the National Theatre and dinner at a Michelin-starred restaurant — handled from door to door.' },
  { title: 'Shopping', body: 'Luxury retail on Pařížská, Old Town antiques, or Palladium — with a chauffeur who waits and carries.' },
  { title: 'Medical Appointments', body: 'Discreet, patient, punctual. Your chauffeur waits and returns you home when you are ready.' },
  { title: 'Airport Connection', body: 'If your hourly hire ends at the airport, we transition seamlessly to our airport transfer service.' },
]

export default function CityRidesPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">City Rides · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague at your pace.<br />
            <span className="display-italic">Your chauffeur waits.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Hourly hire within Prague. Business meetings, theatre, private dinner at a Michelin-starred restaurant. Your chauffeur knows the city — not just the roads — and stays with you for as long as you need.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/book" className="btn-primary">Book a City Ride</a>
            <a href="/services" className="btn-secondary">All Services</a>
          </div>
        </div>
      </section>

      {/* Price callout */}
      <section className="bg-anthracite-mid py-10 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--warmgrey)' }}>Starting from</p>
            <p className="font-display font-light text-[42px] md:text-[52px] text-offwhite">€80<span className="text-[24px]">/hr</span></p>
            <p className="body-text text-[11px] mt-1">Minimum 2 hours · Fixed hourly rate</p>
          </div>
          <div className="flex flex-col gap-2">
            {['Minimum 2-hour booking', 'Chauffeur waits throughout', 'Multiple stops included', 'Prague-wide coverage', 'Available 24/7'].map((f) => (
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

      {/* Use cases */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">When to use it</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
            {useCases.map((u) => (
              <div key={u.title} className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{u.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <p className="label mb-6">Ready to explore Prague?</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            Book your city ride<br />
            <span className="display-italic">in under 60 seconds.</span>
          </h2>
          <div className="mt-10">
            <a href="/book" className="btn-primary">Book a City Ride</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
