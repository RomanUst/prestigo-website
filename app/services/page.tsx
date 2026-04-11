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

interface ServiceEntry {
  label: string
  title: string
  description: string
  features: string[]
  price: string | null
  cta: string
  href: string
  bookHref: string
  bookCta: string
  isNew?: boolean
}

const services: ServiceEntry[] = [
  {
    label: 'AIRPORT',
    title: 'Airport Transfer',
    description: 'Prague Václav Havel Airport — met on arrival, every time. Your driver monitors your flight in real time, holds your name board at Arrivals, and handles your luggage. Fixed price from the moment you book.',
    features: ['Flight tracking included', 'Meet & greet at Arrivals', 'Name board included', 'All terminals covered'],
    price: 'From €69',
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
  {
    label: 'MULTI-DAY',
    title: 'Multi-day Hire',
    description: 'One dedicated chauffeur for your entire journey across Central Europe. Mix Transfer and Hourly days freely — Prague to Vienna, a five-day tour, a corporate roadshow. Fixed quote within 24 hours.',
    features: ['Dedicated chauffeur for full duration', 'Mix transfers & hourly days', 'Driver accommodation & tolls included', 'Custom itinerary, fixed all-inclusive price'],
    price: null,
    cta: 'BUILD ITINERARY',
    href: '/book/multi-day',
    bookHref: '/book/multi-day',
    bookCta: 'GET QUOTE',
    isNew: true,
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

// Substantive answers aimed at AI engines (ChatGPT, Perplexity, Claude,
// Google AI Overviews). FAQPage rich results no longer surface for non-gov
// sites (Aug 2023 deprecation), but the markup still fuels passage-level
// citation in generative search.
const servicesFaqs = [
  {
    q: 'What services does PRESTIGO offer in Prague?',
    a: 'PRESTIGO operates six distinct chauffeur services out of Prague. Airport transfers cover every terminal at Václav Havel Airport (PRG) with meet-and-greet, flight tracking, and a fixed fare from €49. Intercity routes cover 30 destinations across Central Europe with fixed per-vehicle pricing from €115 (Kutná Hora) up to €1,090 (Warsaw). Corporate accounts provide monthly invoicing, a dedicated account manager, and priority dispatch for companies that move people regularly. VIP and event services handle diplomatic visits, private openings, and multi-vehicle coordination. City rides are hourly hire within Prague from €80/hour. Group transfers coordinate up to 50 passengers across multiple vehicles with custom itineraries. Every service is delivered with the same late-model Mercedes fleet, the same vetted chauffeurs, and the same fixed-price guarantee.',
  },
  {
    q: 'How much does a Prague chauffeur service cost?',
    a: 'Prices are fixed per vehicle, not per passenger, and are confirmed before you book. An airport transfer in a Mercedes E-Class starts at €49; an S-Class is €89 and a V-Class for up to six passengers is €69. Intercity routes range from €115 (Prague to Kutná Hora, 70 km) through €485 (Prague to Vienna, 295 km), €580 (Prague to Berlin, 350 km), €635 (Prague to Munich, 385 km), and €885 (Prague to Budapest, 535 km) — all in an E-Class, with S-Class and V-Class priced higher. Hourly hire within Prague is €80/hour with a two-hour minimum. Every quoted price already includes fuel, all motorway tolls and vignettes, driver time, waiting allowance, bottled water, Wi-Fi, and child seats on request. There are no hidden fees, no surge pricing, and no per-trip booking charges.',
  },
  {
    q: 'Do you track flights and wait if a flight is delayed?',
    a: 'Yes — flight tracking is included in every airport transfer booking at no extra cost. Your driver monitors your flight against live air-traffic-control data from the moment you confirm the booking. If your flight lands early, the chauffeur is already in the arrivals hall with a name board. If the flight is delayed by minutes or hours, the pickup automatically shifts to the new arrival time and you pay nothing extra — waiting on flight delay is always free, with no hourly cap. If the flight is cancelled outright, we cancel the booking at no charge and rebook automatically for your next scheduled arrival. For airport collections we include 60 minutes of free waiting from the actual landing time (enough to clear customs, collect luggage, and reach the meeting point); for scheduled transfers we include 15 minutes of free waiting at the pickup address.',
  },
  {
    q: 'Which cities and routes do you cover from Prague?',
    a: 'PRESTIGO operates 30 indexed intercity routes from Prague across seven countries. In the Czech Republic we cover Kutná Hora, Plzeň, Karlovy Vary, Brno, Olomouc, Ostrava, Zlín, Český Krumlov, České Budějovice, Hradec Králové, Pardubice, Liberec, Mariánské Lázně, and Františkovy Lázně. Internationally we run to Vienna, Salzburg, Linz, and Graz (Austria); Berlin, Dresden, Leipzig, Munich, Nuremberg, Regensburg, and Passau (Germany); Bratislava (Slovakia); Budapest (Hungary); Kraków, Wrocław, and Warsaw (Poland). Every route is priced and detailed on its own dedicated page at /routes/prague-[city]. Destinations outside these 30 are available on request by contacting dispatch — we will quote a fixed fare within one business day for any point in the Schengen area.',
  },
  {
    q: 'Can I book a one-way transfer, round trip, or multi-day hire?',
    a: 'All three are supported. One-way is the default for both airport and intercity routes — book it for a specific date and time and pay the fixed fare. Round trips can be booked in a single confirmation and receive a 10 % discount on the return leg when both legs are pre-scheduled. Multi-day hire and multi-stop itineraries work as hourly or daily packages: your chauffeur and vehicle are dedicated for the duration, available for scheduled transfers, spontaneous city rides, and waiting time between stops. Typical use cases are diplomatic visits, roadshows across Central Europe, film or photo crews needing a moving base, or a family spending three days in Prague with day trips to Kutná Hora and Karlovy Vary. For multi-day hire, email dispatch with your itinerary and we will quote a single all-inclusive fare.',
  },
  {
    q: 'How do I book and how quickly will I get confirmation?',
    a: 'You can book in three ways. The fastest is the online booking form at /book — choose your route, vehicle class, and time, pay by card, and receive confirmation by email and SMS within ten seconds. The second is WhatsApp or phone on +420 725 986 855 — dispatch answers 24/7 and can confirm a booking while you are still on the call. The third is email to info@rideprestigo.com for complex itineraries, corporate accounts, or quotes that need a bespoke fare. Same-day bookings are accepted up to two hours before pickup (subject to driver availability); last-minute bookings inside that window are possible by phone. Corporate accounts receive priority dispatch and can be confirmed against a standing authorisation without repeated approvals. Every booking receives a confirmation email with driver name, photo, vehicle plate, and a live status link.',
  },
]

const servicesFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': 'https://rideprestigo.com/services#faq',
  mainEntity: servicesFaqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(servicesFaqSchema) }} />
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
                <div className="flex items-center gap-3 mb-4">
                  <p className="label">{s.label}</p>
                  {s.isNew && (
                    <span className="font-body font-light text-[8px] tracking-[0.14em] uppercase px-1.5 py-0.5 border border-copper/60 text-copper-light leading-none">NEW</span>
                  )}
                </div>
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

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Service questions</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-12">How PRESTIGO services work.</h2>
          <div className="flex flex-col gap-0">
            {servicesFaqs.map((faq, i) => (
              <div key={faq.q} className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}>
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
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
