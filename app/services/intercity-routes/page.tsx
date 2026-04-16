import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'

export const metadata: Metadata = {
  title: 'Intercity Routes from Prague — Vienna, Berlin, Munich',
  description: 'Private chauffeur transfers from Prague to Vienna, Berlin, Munich, Budapest, Bratislava and beyond. Fixed price, door-to-door, available 24/7.',
  alternates: {
    canonical: '/services/intercity-routes',
    languages: {
      en: 'https://rideprestigo.com/services/intercity-routes',
      'x-default': 'https://rideprestigo.com/services/intercity-routes',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/services/intercity-routes',
    title: 'Intercity Routes from Prague — Vienna, Berlin, Munich | PRESTIGO',
    description: 'Private chauffeur transfers from Prague to Vienna, Berlin, Munich, Budapest, Bratislava and beyond. Fixed price, door-to-door.',
    images: [{ url: 'https://rideprestigo.com/hero-intercity-routes.png', width: 1200, height: 630 }],
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
    title: 'What does a private transfer from Prague cost?',
    body: 'Every intercity route has a confirmed fixed price before you book. The figure includes fuel, driver time, all motorway tolls, and where applicable, Czech and Austrian or German motorway vignettes. Nothing is added at drop-off. For reference, the E-Class fare for Prague to Vienna is €485, Prague to Berlin €580, and Prague to Dresden €250 — all locked in at the time of booking, regardless of traffic conditions or fuel costs on the day of travel.',
  },
  {
    title: 'What does door-to-door service mean in practice?',
    body: 'Your driver arrives at your hotel lobby, office reception, or home address and handles your luggage from that moment. At the destination you are taken to your exact address — a specific hotel, a conference centre, or a private residence. There are no station transfers, no shared coaches, and no need to navigate an unfamiliar city after four hours on the road. The entire journey is a single, uninterrupted movement from your door to theirs.',
  },
  {
    title: 'Can I work or take calls during a long transfer?',
    body: 'Each vehicle carries USB-A and USB-C charging, a phone holder, and onboard Wi-Fi. The S-Class and V-Class also carry chilled bottled water. The separation between driver and passenger compartment means calls, video meetings, and confidential conversations remain private throughout. Four hours Prague to Vienna is genuinely productive time — it is common for passengers on the corporate account to spend the first two hours on calls and the second two in documents, arriving at the destination with the morning\'s work done.',
  },
  {
    title: 'Can I book a transfer for early morning or late at night?',
    body: 'Intercity departures run at any hour. A 04:30 departure from Prague for a 09:00 meeting in Vienna is one of the most common booking patterns on the corporate account — it allows passengers to arrive rested rather than disrupted by a first-flight-of-the-morning connection through a hub airport. Late returns after a dinner that runs until midnight in a destination city are equally routine. The driver confirms the booking the evening before and sends a departure reminder one hour ahead.',
  },
]

const editorial = [
  'Central Europe is compact by the standards of long-haul travel, but public transport connections are rarely convenient when time and comfort matter. Vienna is 3.5 hours from Prague by road, but the direct Railjet train takes 4 hours 20 minutes and arrives at Wien Hauptbahnhof — a further 30 minutes from most business hotels in the First or Fourth District by taxi or U-Bahn. Berlin by train from Praha hlavní nádraží is 4 hours 40 minutes on the direct EC service, which runs twice daily with limited luggage space and no guaranteed quiet zone.',
  'A private transfer covers the same ground in fewer total hours, with the vehicle at your door at departure and your exact destination address at the other end. The difference in door-to-door journey time — accounting for the walk or taxi to the station, the waiting time, and the onward journey at the destination — is typically 45 minutes to two hours in favour of the private transfer, depending on the destination city and the time of day.',
  'PRESTIGO operates 30 confirmed routes from Prague, each with a published fixed price. The fleet is exclusively Mercedes: E-Class for solo and paired travel, S-Class for those who want the additional space and specification of a full executive saloon, and V-Class for groups of up to seven passengers with full luggage. Every route can be extended into a return trip, with a return discount applied automatically at booking.',
]

export default function IntercityRoutesPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-intercity-routes.png" alt="Intercity Routes from Prague — PRESTIGO" fill style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
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

      <Divider />

      {/* Popular routes */}
      <section className="bg-anthracite-mid py-16 md:py-24">
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

      <Divider />

      {/* Features */}
      <section className="bg-anthracite py-16 md:py-24">
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

      <Divider />

      {/* Editorial — service depth */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Private transfer vs. public transport</p>
          <span className="copper-line mb-10 block" />
          <div className="max-w-3xl flex flex-col gap-6">
            {editorial.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{para}</p>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* vs train comparison */}
      <section className="bg-anthracite-mid py-16 md:py-20">
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

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite py-20">
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
