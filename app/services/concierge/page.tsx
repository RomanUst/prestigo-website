import type { Metadata } from 'next'

export const revalidate = 120

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import BookingSection from '@/components/BookingSection'
import { businessNodeDoc } from '@/lib/jsonld'

export const metadata: Metadata = {
  title: { absolute: 'Concierge Chauffeur Service Prague — More Than a Driver | PRESTIGO' },
  description:
    'A Prague chauffeur who works as your concierge — restaurant reservations, local knowledge, errands, and hotel liaison handled around every ride. English-speaking, discreet, operating since 2016.',
  alternates: {
    canonical: '/services/concierge',
    languages: {
      en: 'https://rideprestigo.com/services/concierge',
      'x-default': 'https://rideprestigo.com/services/concierge',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/services/concierge',
    title: 'Concierge Chauffeur Service Prague — More Than a Driver | PRESTIGO',
    description:
      'A Prague chauffeur who works as your concierge — reservations, local knowledge, errands, and hotel liaison handled around every ride. Discreet, English-speaking, since 2016.',
    images: [{ url: 'https://rideprestigo.com/hero-contact.webp', width: 1200, height: 630 }],
  },
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'Concierge Chauffeur', item: 'https://rideprestigo.com/services/concierge' },
  ],
}

// The eight things a PRESTIGO chauffeur handles beyond driving — the core of
// the "concierge at the wheel" positioning.
const handles = [
  {
    title: 'Anticipation',
    body: 'The cabin is ready before you reach it — climate set, bottled water, phone chargers, an umbrella when the forecast turns. Your chauffeur has already planned the route around the roadworks on Revoluční and the closure at Old Town Square. Nothing is asked of you because the thinking was done in advance.',
  },
  {
    title: 'Local knowledge',
    body: 'Recommendations from someone who lives here, not a search result. Where to take a client for a quiet business lunch in Malá Strana, which wine bar in Vinohrady is worth the detour, when the Charles Bridge is walkable and when it is not. Offered when asked, never imposed.',
  },
  {
    title: 'Reservations & liaison',
    body: 'A table held at the restaurant, a call ahead to the venue, coordination with the concierge desk at the Four Seasons, Mandarin Oriental, or Augustine. If a plan needs to be made or a booking confirmed while you travel, your chauffeur handles it so you arrive to a situation already resolved.',
  },
  {
    title: 'Flexibility on the day',
    body: 'A stop added on the way, a dinner extended by an hour, a change of destination after a meeting overruns — none of it requires a new booking or a renegotiated price. You inform your chauffeur directly. The plan bends to your day, not the other way around.',
  },
  {
    title: 'Errands & logistics',
    body: 'Shopping bags carried and kept in the car, a pharmacy stop, flowers collected, a package picked up or delivered across the city. The vehicle is a moving base for the day, and the practical tasks that would otherwise interrupt it are simply absorbed.',
  },
  {
    title: 'Language',
    body: 'English as standard, with German, Russian, and other languages available on request. When something needs to be explained to a shopkeeper, a doorman, or a maître d\', your chauffeur bridges it — so a small friction in an unfamiliar city never becomes your problem to solve.',
  },
  {
    title: 'Family & special requirements',
    body: 'Child seats fitted correctly and in advance, step-free access arranged, a quiet cabin for a passenger who needs to rest or work. Particular needs are noted at booking and prepared for before the car arrives, not improvised at the kerb.',
  },
  {
    title: 'One point of contact',
    body: 'For a multi-day stay, the same chauffeur across every journey. They learn your preferences, your timing, the way you like a day to run — and by the second day, most of it no longer needs to be said. Continuity is the difference between a car service and a concierge.',
  },
]

const editorial = [
  'PRESTIGO has operated in Prague since 2016. In that time the vehicles have changed and the fleet has grown, but the defining decision has stayed the same: we hire and train chauffeurs, not drivers. A driver moves a car from one point to another. A chauffeur takes responsibility for the whole of your time in the vehicle — and, increasingly, for the parts of your day that touch it.',
  'A concierge chauffeur is not a more expensive way to get across town. It is a single person who removes the small, constant friction of moving through an unfamiliar city: the reservation that needs confirming, the route that needs local judgement, the bag that needs carrying, the plan that changes at four in the afternoon. Each of these is minor on its own. Together, over a day or a week, they are the difference between managing a visit and being looked after during one.',
  'This service is not a separate product with its own price list. It is the standard we hold on every PRESTIGO journey — the airport transfer, the hourly city ride, the intercity route, the multi-day itinerary. This page simply describes what that standard means in practice, and who it is for: visitors and residents who would rather hand the logistics to one trusted person and think about nothing else.',
]

const howItWorks = [
  {
    step: '01',
    title: 'Tell us the shape of your day',
    body: 'At booking, or by a message to dispatch, share what you are planning — meetings, dinners, a day of sightseeing, guests to collect. The more your chauffeur knows in advance, the less you manage on the day.',
  },
  {
    step: '02',
    title: 'We prepare, not just dispatch',
    body: 'Your chauffeur is briefed on your itinerary, preferences, and any bookings to confirm. Reservations, child seats, routes, and timing are handled before the car arrives.',
  },
  {
    step: '03',
    title: 'Hand it over',
    body: 'From the moment you step in, the logistics are ours. Change the plan freely, add a stop, extend the evening — your chauffeur adapts and you carry none of it.',
  },
]

const faqs = [
  {
    q: 'How is a concierge chauffeur different from a normal transfer?',
    a: 'A standard transfer moves you from point A to point B. A concierge chauffeur takes on the tasks around the journey as well — confirming a restaurant reservation, coordinating with your hotel concierge, carrying shopping, advising on where to go, and adapting the plan as your day changes. It is the same Mercedes fleet and the same fixed pricing; the difference is that one trusted person handles the logistics of your time in Prague, not just the driving.',
  },
  {
    q: 'Can I book a chauffeur for a full day or several days?',
    a: 'Yes. A concierge chauffeur works best over a full day or a multi-day stay, when the same driver stays with you throughout and learns how you like a day to run. Full days are arranged as hourly hire; multi-day stays are quoted as a single all-inclusive itinerary that mixes transfers and hourly days, with driver time, tolls, and accommodation included. Contact dispatch with your dates and we will quote a fixed fare.',
  },
  {
    q: 'Do your chauffeurs speak English?',
    a: 'English is spoken as standard by every PRESTIGO chauffeur. German, Russian, and other languages can be arranged on request — please note the language you need at booking and we will assign accordingly. When something needs to be communicated to a venue, shop, or hotel on your behalf, your chauffeur bridges it.',
  },
  {
    q: 'Will my chauffeur make reservations or run errands for me?',
    a: 'Within reason, yes. Confirming a table, calling ahead to a venue, coordinating with your hotel concierge, collecting flowers or a package, waiting while you shop and carrying the bags — these are part of the service. For anything more involved, mention it at booking so we can prepare properly. The vehicle functions as a moving base for your day, and practical tasks that touch it are absorbed rather than treated as extras.',
  },
  {
    q: 'Is the concierge service discreet?',
    a: 'Discretion is a condition of the work, not a feature of it. Our chauffeurs have coordinated transfers for diplomatic missions and for guests of Prague\'s leading hotels since 2016. Client names are never disclosed, conversations in the cabin stay in the cabin, and confidentiality can be formalised in writing for corporate or private clients on request.',
  },
  {
    q: 'Does the concierge service cost extra?',
    a: 'No. This level of service is the PRESTIGO standard on every journey, not a paid add-on — the price you see for your transfer, hourly hire, or multi-day itinerary already includes it. What varies is how much of it you draw on: a point-to-point transfer uses little; a full day in the city uses a great deal. Either way, the fare is fixed and confirmed before you book.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

export default function ConciergePage() {
  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Concierge Chauffeur Service Prague',
    serviceType: 'Concierge chauffeur service',
    description:
      'A private chauffeur in Prague who works as a personal concierge — restaurant reservations, local knowledge, errands, hotel liaison, and full-day flexibility, delivered on every journey.',
    provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
    areaServed: 'Prague, Czech Republic',
    url: 'https://rideprestigo.com/services/concierge',
  }

  const businessDoc = businessNodeDoc()

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {businessDoc && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessDoc) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-contact.webp" alt="Concierge chauffeur service in Prague — PRESTIGO" fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)', objectPosition: '30% 15%' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Concierge Chauffeur · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Not just a driver.<br />
            <span className="display-italic">A concierge at the wheel.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            A PRESTIGO chauffeur does more than move you across Prague. Reservations confirmed, local knowledge offered, errands absorbed, plans changed on the day without a second thought — the logistics of your time in the city, handled by one trusted person. English-speaking, discreet, operating since 2016.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/book" className="btn-primary">Book a Chauffeur</a>
            <a href="/services" className="btn-secondary">All Services</a>
          </div>
        </div>
      </section>

      <BookingSection />

      <Divider />

      {/* What your chauffeur handles */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">What your chauffeur handles</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {handles.map((h) => (
              <div key={h.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h2 className="font-display font-light text-[22px] text-offwhite mb-3">{h.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Editorial — the PRESTIGO standard */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">The PRESTIGO standard</p>
          <span className="copper-line mb-10 block" />
          <div className="max-w-3xl flex flex-col gap-6">
            {editorial.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{para}</p>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* How it works */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">How it works</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {howItWorks.map((s) => (
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

      {/* Pairs well with */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">The same standard, on every service</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-anthracite-light">
            {[
              { title: 'Airport Transfer', body: 'Met on arrival at PRG with a name board, luggage handled, flight tracked.', href: '/services/airport-transfer' },
              { title: 'City Rides', body: 'Hourly hire across Prague — your chauffeur waits, and the day is yours.', href: '/services/city-rides' },
              { title: 'VIP & Events', body: 'Protocol-aware transfers, hotel and event coordination, absolute discretion.', href: '/services/vip-events' },
              { title: 'Multi-day Hire', body: 'One dedicated chauffeur across your whole itinerary in Central Europe.', href: '/book/multi-day' },
            ].map((c) => (
              <a key={c.title} href={c.href} className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors block">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{c.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{c.body}</p>
                <span className="font-body font-light text-[10px] tracking-[0.2em] uppercase mt-4 inline-block" style={{ color: 'var(--copper)' }}>Learn more →</span>
              </a>
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
          <p className="label mb-6">Travel looked after</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            One trusted person<br />
            <span className="display-italic">for the whole of your day.</span>
          </h2>
          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            <a href="/book" className="btn-primary">Book a Chauffeur</a>
            <a href="/contact" className="btn-secondary">Discuss a Multi-day Stay</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
