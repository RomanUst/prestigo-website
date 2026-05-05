import type { Metadata } from 'next'

export const revalidate = 120

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import HourlyBookingSection from '@/components/HourlyBookingSection'
import { getPricingConfig } from '@/lib/pricing-config'

export async function generateMetadata(): Promise<Metadata> {
  const { hourlyRate } = await getPricingConfig()
  const from = hourlyRate['business'] ?? 49
  return {
    title: { absolute: 'City Rides — Hourly Chauffeur in Prague | PRESTIGO' },
    description: `Hourly chauffeur hire within Prague. Business meetings, sightseeing, theatre, private dinners. Airport-quality service at city rates. From €${from}/hour.`,
    alternates: {
      canonical: '/services/city-rides',
      languages: {
        en: 'https://rideprestigo.com/services/city-rides',
        'x-default': 'https://rideprestigo.com/services/city-rides',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/services/city-rides',
      title: 'Prague City Rides — Hourly Chauffeur Hire | PRESTIGO',
      description: `Hourly chauffeur hire within Prague. Business meetings, sightseeing, theatre, private dinners. Airport-quality service at city rates. From €${from}/hour.`,
      images: [{ url: 'https://rideprestigo.com/hero-city-rides.png', width: 1200, height: 630 }],
    },
  }
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
    title: 'How does hourly chauffeur hire in Prague work?',
    body: 'Book by the hour from a minimum of two hours, with no upper limit. Your chauffeur arrives at the agreed address, and from that moment the vehicle and their time are entirely yours. There are no meters running and no base-to-destination charges. Whether you have four meetings in four locations or a single dinner with a long wait in between, the rate is a fixed hourly figure confirmed at booking. Additional hours can be added on the day simply by informing your driver.',
  },
  {
    title: 'Does the driver know Prague well?',
    body: 'Our Prague chauffeurs know the city at the level that comes from years of operating within it. They know that Pařížská is one-way and when the pedestrian crossing restriction at Old Town Square applies. They know the Palace Hotel approach requires Panská rather than Jindřišská, and that Bílkova is faster than Kozí for reaching the riverside embankment at Dvořákovo nábřeží. A recommendation for a wine bar in Vinohrady or a tailor in Malá Strana is given when asked, never otherwise.',
  },
  {
    title: 'How does a city ride differ from an airport transfer?',
    body: 'Airport transfers are point-to-point: pickup at Arrivals, drop-off at your Prague address. City rides are everything else — the same Mercedes fleet, the same chauffeur standard, the same confirmation and communication — applied to a four-stop business day across Vinohrady, Smíchov, and the Old Town, or a private evening beginning at the National Theatre\'s Nová scéna and ending at dinner at La Degustation. The service is identical. The itinerary is entirely yours to define.',
  },
  {
    title: 'Can I add stops or change my plans mid-journey?',
    body: 'Your plans can change without consequence. A stop at a pharmacy on the way to the hotel, a detour to collect a colleague from Wenceslas Square, a decision to extend the evening by ninety minutes — none of these require a new booking or a renegotiated price. The hourly rate covers the full duration of your time with the vehicle. Changes are handled by informing your chauffeur directly, not by navigating an app or calling a dispatch centre.',
  },
]

const editorial = [
  'Prague is a compact city for walking, but it is not always a practical one for self-navigation — particularly for visitors managing luggage, working to a schedule where arriving late is not an option, or unfamiliar with which streets permit through traffic at which hours. The Old Town\'s pedestrian zones are extensive, and many of Prague\'s best hotels sit on streets that require local knowledge to reach efficiently.',
  'An hourly chauffeur removes these variables. Your driver holds the knowledge of which streets accept vehicles at which hours, where to wait without a parking enforcement risk, and which route avoids the Christmas market overflow on Staroměstské náměstí or the construction closure on Revoluční. In a city where a ten-minute walk can take thirty minutes with luggage and two wrong turns, this is a material advantage.',
  'The minimum booking is two hours. Within that window you can cover an airport arrival, a hotel check-in, and a lunch meeting in the Old Town with no pressure on timing. For a business visitor arriving at PRG and needing to reach two central Prague offices before an afternoon departure, a three-hour city ride from terminal arrival to drop-back at departures is often the most efficient arrangement available — one booking, no transitions, no time lost.',
]

const useCases = [
  { title: 'Business Meetings', body: 'Multiple stops across Prague with luggage. No parking, no navigation, no delays.' },
  { title: 'Sightseeing', body: 'Castle district, Josefov, Vyšehrad — at a pace that suits you, with a driver who can suggest the best route.' },
  { title: 'Theatre & Dining', body: 'A private evening at the National Theatre and dinner at a Michelin-starred restaurant — handled from door to door.' },
  { title: 'Shopping', body: 'Luxury retail on Pařížská, Old Town antiques, or Palladium — with a chauffeur who waits and carries.' },
  { title: 'Medical Appointments', body: 'Discreet, patient, punctual. Your chauffeur waits and returns you home when you are ready.' },
  { title: 'Airport Connection', body: 'If your hourly hire ends at the airport, we transition seamlessly to our airport transfer service.' },
]

export default async function CityRidesPage() {
  const { hourlyRate } = await getPricingConfig()
  const businessHourly = hourlyRate['business'] ?? 49
  const firstClassHourly = hourlyRate['first_class'] ?? 120
  const vClassHourly = hourlyRate['business_van'] ?? 76

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Prague City Rides — Hourly Chauffeur Hire',
    description: 'Hourly chauffeur hire within Prague for business meetings, sightseeing, leisure, and events. Airport-quality service at city rates.',
    provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
    areaServed: 'Prague, Czech Republic',
    url: 'https://rideprestigo.com/services/city-rides',
    offers: { '@type': 'Offer', price: String(businessHourly), priceCurrency: 'EUR' },
  }

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-city-rides.png" alt="Prague City Rides — PRESTIGO" fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Hourly Car Rental with Chauffeur · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague at your pace.<br />
            <span className="display-italic">Your chauffeur waits.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Prestigo Prague city rides offer hourly chauffeur hire in a Mercedes-Benz E-Class, S-Class, or V-Class, with a 2-hour minimum and no upper limit. Your driver and vehicle stay with you for the full duration — business meetings, theatre, shopping, private dining, or airport waits. Hourly rate is fixed at booking.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/book" className="btn-primary">Book a City Ride</a>
            <a href="/services" className="btn-secondary">All Services</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* Price callout */}
      <section className="bg-anthracite-mid py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--warmgrey)' }}>Starting from</p>
            <p className="font-display font-light text-[42px] md:text-[52px] text-offwhite">€{businessHourly}<span className="text-[24px]">/hr</span></p>
            <p className="body-text text-[11px] mt-1">Minimum 2 hours · Fixed hourly rate</p>
          </div>
          <div className="flex flex-col gap-2">
            {[
              'Minimum 2-hour booking',
              'Chauffeur waits throughout',
              'Multiple stops included',
              'Prague-wide coverage',
              'Available 24/7',
            ].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 text-right">
            <p className="font-body font-light text-[11px] text-warmgrey">
              Business Van (V-Class): €{vClassHourly}/hr
            </p>
            <p className="font-body font-light text-[11px] text-warmgrey">
              First Class (S-Class): €{firstClassHourly}/hr
            </p>
          </div>
        </div>
      </section>

      <Divider />

      {/* Booking widget — hourly default */}
      <HourlyBookingSection />

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

      {/* Editorial — service depth */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Why hire by the hour in Prague</p>
          <span className="copper-line mb-10 block" />
          <div className="max-w-3xl flex flex-col gap-6">
            {editorial.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{para}</p>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Use cases */}
      <section className="bg-anthracite-mid py-16 md:py-20">
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

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite py-20">
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
