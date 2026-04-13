import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'

export const metadata: Metadata = {
  title: 'Prague to Brno Private Transfer — From €340',
  description: 'Book a private chauffeur from Prague to Brno. 205 km on the D1 in a Mercedes-Benz. Fixed price from €340, Moravia\'s capital.',
  alternates: { canonical: '/routes/prague-brno' },
  openGraph: {
    url: 'https://rideprestigo.com/routes/prague-brno',
    title: 'Prague to Brno Private Transfer — From €340',
    description: 'Book a private chauffeur from Prague to Brno. 205 km on the D1 in a Mercedes-Benz. Fixed price from €340, Moravia\'s capital.',
  },
}

const highlights = [
  { label: 'Distance', value: '~205 km' },
  { label: 'Duration', value: '~2.5 hours' },
  { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
  { label: 'Price from', value: '€340', copper: true },
]

const vehicles = [
  { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €340', photo: '/e-class-photo.png' },
  { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €500', photo: '/s-class-photo.png' },
  { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: 'From €390', photo: '/v-class-photo.png' },
]

const inclusions = [
  'A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.',
  'A professional chauffeur — fluent English and Czech as standard.',
  'Fuel and the Czech motorway vignette. Nothing is charged on top.',
  'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
  'Bottled water, phone charger, and WiFi in the rear cabin.',
  'Waiting time at pickup — 15 minutes free at any address.',
  'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
  'Same-day return — 10% off the return leg if booked together, or add hourly city rental from €40/hour.',
]

const faqs = [
  { q: 'How long does a private transfer from Prague to Brno take?', a: 'Approximately 2.5 hours door-to-door via the D1 motorway east through the Vysočina highlands. Friday afternoon outbound traffic from Prague can add 20–30 minutes.' },
  { q: 'How much does a chauffeur from Prague to Brno cost?', a: 'Fixed fare from €340 in Mercedes E-Class (up to 3 passengers), €390 in V-Class (up to 6 passengers), or €500 in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.' },
  { q: 'Can I book a same-day round trip from Prague to Brno?', a: 'Yes — and it is the natural pattern for this route. Brno is 2.5 hours each way, which leaves a comfortable day on site without an overnight stay. A same-day return receives a 10% discount. If you need the chauffeur to move around with you during the visit, add hourly city rental from €40/hour. Most clients book a 6–8 hour round trip to cover a meeting, a lunch, and the drive back to Prague by evening.' },
  { q: 'Is there a border crossing on the way to Brno?', a: 'No. The route is entirely within the Czech Republic on the D1 motorway. No border checks, no vignette changes, no document requirements beyond those for domestic travel.' },
  { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
  { q: 'What languages does the chauffeur speak?', a: 'Every Prestigo chauffeur speaks fluent Czech and English as standard. Other languages can be arranged on request at the time of booking.' },
]

const dayTripConfigurations = [
  {
    title: 'The Špilberk and Old Town Day',
    body: 'Pickup at 8:00, arrive Brno by 10:30. Three hours at Špilberk Castle on the hill above the city — fortress, casemates, and Brno City Museum — followed by lunch on Zelný trh and a walk to the Cathedral of St. Peter and Paul on Petrov. Back in Prague by 18:30.',
    price: 'From €650 — based on four hours on site.',
  },
  {
    title: 'The Villa Tugendhat and Moravian Wine Afternoon',
    body: 'Pre-booked timed entry for Villa Tugendhat, the Mies van der Rohe modernist house and UNESCO World Heritage site. After the tour, a drive south into the Pálava wine region for a late lunch and cellar visit in Mikulov or Valtice before the return.',
    price: 'From €750 — based on six hours on site.',
  },
  {
    title: 'The Brno Exhibition Centre Trade Fair Day',
    body: 'Early pickup in Prague, drop-off at the correct gate inside BVV — the chauffeur knows which entrance each hall uses during large fairs. Your driver stays on standby for the day, handles any mid-show runs to the hotel or city centre, and returns you to Prague after the closing session.',
    price: 'From €700 — based on five hours on standby.',
  },
]

const whyBook = [
  {
    title: 'Fixed fare, no surprises',
    body: 'The price you see is the price you pay. Fuel, the Czech vignette, driver time. Nothing added at drop-off, no meter running while you take a meeting.',
  },
  {
    title: 'Owned fleet, vetted chauffeurs',
    body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, and trained for long-distance executive travel.',
  },
  {
    title: 'Route knowledge, not a map app',
    body: 'If the D1 has a closure near Velké Meziříčí, your chauffeur knows the parallel R602 routing without touching the satnav. For BVV trade fair pickups, the chauffeur knows where to drop within the entry gates so you walk into the right hall, not the opposite end of the complex.',
  },
]

const relatedRoutes = [
  { slug: 'prague-bratislava', city: 'Bratislava', distance: '330 km', duration: '3h 45min' },
  { slug: 'prague-vienna', city: 'Vienna', distance: '330 km', duration: '3h 45min' },
  { slug: 'prague-olomouc', city: 'Olomouc', distance: '280 km', duration: '3h' },
  { slug: 'prague-zlin', city: 'Zlín', distance: '300 km', duration: '3h 30min' },
]

const serviceSchema = {
  '@type': 'Service',
  '@id': 'https://rideprestigo.com/routes/prague-brno#service',
  name: 'Private Chauffeur Transfer from Prague to Brno',
  serviceType: 'Private ground transfer',
  description: 'Chauffeured private transfer from Prague to Brno in Mercedes E-Class, S-Class, or V-Class. Fixed price, approximately 2 hours 15 minutes door-to-door via the D1 motorway. Distance 205 km.',
  provider: {
    '@type': 'LocalBusiness',
    '@id': 'https://rideprestigo.com/#business',
    name: 'Prestigo',
    url: 'https://rideprestigo.com',
    telephone: '+420-xxx-xxx-xxx',
    email: 'info@rideprestigo.com',
    priceRange: '€€€',
    areaServed: 'Prague, Czech Republic',
  },
  areaServed: [
    {
      '@type': 'City',
      name: 'Prague',
      addressCountry: 'CZ',
    },
    {
      '@type': 'City',
      name: 'Brno',
      addressCountry: 'CZ',
    },
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Vehicle Classes',
    itemListElement: [
      {
        '@type': 'Offer',
        name: 'Mercedes E-Class',
        description: 'Up to 3 passengers, 3 suitcases',
        price: '340',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-brno#e-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes S-Class',
        description: 'Up to 3 passengers, flagship comfort',
        price: '500',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-brno#s-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes V-Class',
        description: 'Up to 6 passengers, 6 suitcases',
        price: '390',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-brno#v-class',
      },
    ],
  },
}

const pageSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    serviceSchema,
    {
      '@type': 'FAQPage',
      '@id': 'https://rideprestigo.com/routes/prague-brno#faq',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/routes/prague-brno#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
        { '@type': 'ListItem', position: 3, name: 'Prague to Brno', item: 'https://rideprestigo.com/routes/prague-brno' },
      ],
    },
  ],
}

export default function PragueBrnoPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="relative border-b border-anthracite-light overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0"><Image src="/photohero.png" alt="Brno" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Brno</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">Prague to Brno,<br /><span className="display-italic">Moravia&apos;s capital.</span></h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>205 km east on the D1 to the Czech Republic&apos;s second city. Špilberk Castle, Villa Tugendhat, the Brno Exhibition Centre, and Moravian wine country — two and a half hours, one fixed price.</p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book this Route</a>
            <a href="/contact" className="btn-ghost">Ask a Question</a>
          </div>
        </div>
      </section>

      {/* Highlights bar */}
      <section className="bg-anthracite-mid py-12 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {highlights.map((h, i) => (<Reveal key={h.label} variant="up" delay={i * 100}><div><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--copper)' }}>{h.label}</p>{Array.isArray(h.value) ? (<div><div className="flex flex-wrap gap-2 mt-1">{h.value.map((tag) => (<span key={tag} className="font-body font-light text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border border-anthracite-light text-offwhite">{tag}</span>))}</div><p className="font-body font-light text-[10px] text-warmgrey mt-3" style={{ letterSpacing: '0.03em' }}>Available on this route</p></div>) : (<p className="font-body font-light text-[22px]" style={{ color: (h as { copper?: boolean }).copper ? 'var(--copper-light)' : 'var(--offwhite)' }}>{h.value}</p>)}</div></Reveal>))}
          </div>
        </div>
      </section>

      {/* Opening paragraph */}
      <section className="bg-anthracite py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
            A private transfer from Prague to Brno is a two-and-a-half-hour drive on the D1 motorway, and every kilometre of that drive should feel like part of the working day — not an item on a checklist. Prestigo runs a fleet of black Mercedes vehicles and bilingual chauffeurs who know the D1 the way a Prague tram driver knows the line to Smíchov. The price is fixed before you book. The car is waiting when you step outside. The chauffeur already knows which gate to use at the Brno Exhibition Centre, which hotel entrance on Česká handles luggage, and which side of Petrov hill gets you closest to the Cathedral.
          </p>
          <p className="body-text text-[14px] mt-6" style={{ lineHeight: '1.9' }}>
            This is not a shared shuttle. Not a ride-hail app. A private Mercedes, one chauffeur, and a fare that does not change.
          </p></Reveal>
        </div>
      </section>

      {/* The Route narrative */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Route</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Brno<br /><span className="display-italic">in two and a half hours.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in the Old Town, Vinohrady, Karlín, or Václav Havel Airport, your chauffeur takes the D1 motorway east. The D1 is the busiest motorway in the Czech Republic and the central spine of the country, running from the capital through the Vysočina — the Bohemian-Moravian Highlands — and down into Brno. There is no border crossing; the route stays entirely within Czechia, which means no vignette changes, no document checks, and no stop at a frontier.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Total distance is approximately 205 kilometres. Much of the corridor has been progressively widened and rebuilt over the last several years, and the drive now moves at a steady rhythm through Humpolec, Jihlava, and Velké Meziříčí before descending into Brno. In the city, the route branches to where you actually need to go — the Old Town under Špilberk Castle and the Cathedral of St. Peter and Paul, the Brno Exhibition Centre (BVV) for trade fairs, Villa Tugendhat on the hill above Černá Pole, or south into the Moravian wine country around Mikulov.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Friday afternoon outbound from Prague is the one pattern worth planning around — it is reliably heavy and can add half an hour. Your chauffeur watches the D1 before every departure and shifts the pickup time if the map is red. You are not paying for traffic; you are paying for time.
            </p>
          </div></Reveal>
        </div>
      </section>

      {/* What's included */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">What&apos;s Included</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Everything included,<br /><span className="display-italic">nothing to arrange.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Brno drop-off. The car, the chauffeur, the fuel, the vignette. Business meeting, trade fair at BVV, or a Moravian wine weekend — your driver handles the route while you focus on the destination.</p>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-4 justify-center">{inclusions.map((item) => (<div key={item} className="flex items-start gap-4"><span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} /><span className="font-body font-light text-[13px] text-warmgrey" style={{ lineHeight: '1.8' }}>{item}</span></div>))}</div></Reveal>
        </div>
      </section>

      {/* Fleet */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Fleet</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14">Choose your vehicle</h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {vehicles.map((v, i) => (<Reveal key={v.name} variant="up" delay={i * 120}><div className="border border-anthracite-light flex flex-col"><div className="w-full overflow-hidden" style={{ aspectRatio: '16/9', position: 'relative' }}><Image src={v.photo} alt={v.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover object-top" style={{ filter: 'brightness(0.92)' }} /><div style={{ position: 'absolute', bottom: 0, right: 0, width: 120, height: 120, background: 'radial-gradient(circle at bottom right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, transparent 75%)' }} /></div><div className="p-8 flex flex-col gap-6 flex-1"><div><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--copper)' }}>{v.category}</p><h3 className="font-display font-light text-[24px] text-offwhite mb-2">{v.name}</h3></div><div className="flex flex-col gap-2"><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Passengers</span><span className="font-body font-light text-[11px] text-offwhite">{v.capacity}</span></div><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Luggage</span><span className="font-body font-light text-[11px] text-offwhite">{v.bags}</span></div><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Transfer price</span><span className="font-body font-light text-[11px]" style={{ color: 'var(--copper-light)' }}>{v.price}</span></div></div><a href="/book" className="btn-primary self-center mt-auto" style={{ padding: '10px 24px', fontSize: '9px' }}>Book Online</a></div></div></Reveal>))}
          </div>
          <p className="body-text text-[11px] mt-8" style={{ lineHeight: '1.8' }}>All vehicles are late-model Mercedes-Benz, maintained to manufacturer standard. Child seats available on request at no charge.</p>
        </div>
      </section>

      {/* Journey timeline + Good to know */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Journey</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Brno,<br /><span className="display-italic">the route.</span></h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Anywhere you like', note: 'A stop at Humpolec, Jihlava, or anywhere along the D1. Your route, your schedule.', anchor: false, custom: true },
                { city: 'Brno', note: 'Drop-off at any Brno address, the Exhibition Centre, Brno main station, or your hotel.', anchor: true, custom: false },
              ].map((stop, i, arr) => (<div key={stop.city} className="flex gap-6"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />{i < arr.length - 1 && <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />}</div><div className="pb-6"><p className="font-body font-light text-[11px] tracking-[0.15em] uppercase mb-1" style={{ color: stop.custom ? 'var(--copper-pale)' : 'var(--offwhite)' }}>{stop.city}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{stop.note}</p></div></div>))}
            </div>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-6 justify-start pt-[60px]">
            <div className="border border-anthracite-light p-8">
              <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--copper)' }}>Good to know</p>
              <div className="flex flex-col gap-5">
                {[
                  { label: 'Border crossing', value: 'No border crossing — entirely within the Czech Republic.' },
                  { label: 'Tolls', value: 'Czech motorway vignette included in the quoted price.' },
                  { label: 'Return transfer', value: 'Book both directions together for a reduced rate.' },
                  { label: 'Onward routing', value: 'Bratislava is 130 km, Vienna 150 km. PRESTIGO can extend your journey from Brno onward as a single booking.' },
                ].map((item) => (<div key={item.label}><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{item.label}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{item.value}</p></div>))}
              </div>
            </div>
          </div></Reveal>
        </div>
      </section>

      {/* Popular day-trip configurations */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Day Trips from Prague</p>
          <h2 className="display text-[28px] md:text-[38px] mb-4">Popular day-trip<br /><span className="display-italic">configurations.</span></h2>
          <p className="body-text text-[13px] mb-14 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Brno is 2.5 hours each way, which makes it an ideal day trip from Prague — a full working day on site with the chauffeur on standby, and home before dinner. Three configurations cover most requests.
          </p></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {dayTripConfigurations.map((c, i) => (
              <Reveal key={c.title} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8 flex flex-col gap-4">
                <h3 className="font-display font-light text-[22px] text-offwhite">{c.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{c.body}</p>
                <p className="font-body font-light text-[11px] mt-auto pt-4 border-t border-anthracite-light" style={{ color: 'var(--copper-light)' }}>{c.price}</p>
              </div></Reveal>
            ))}
          </div>
          <p className="body-text text-[11px] mt-8 max-w-3xl" style={{ lineHeight: '1.8' }}>
            Indicative prices based on the scenarios above. The final fare depends on the actual time spent on site. You can book the journey there and back with a 10% same-day return discount, or add hourly city rental from €40/hour if you need the chauffeur to move around the city with you. Tell us your plan and we confirm a firm quote before you book.
          </p>
        </div>
      </section>

      {/* What to expect from your chauffeur */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Chauffeur</p>
            <h2 className="display text-[28px] md:text-[38px]">What to expect<br /><span className="display-italic">from your driver.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Your chauffeur will meet you in front of your pickup address — not in a parking lot across the street, not at an airport meeting point a ten-minute walk away. If you are arriving at Václav Havel Airport or staying in central Prague, they are at the door with a Prestigo tablet displaying your name.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for two and a half hours of work or rest, the chauffeur will read that signal and let you be. If you want context on Brno — Mendel&apos;s garden at the Augustinian abbey where the laws of genetics were first described, the Tugendhat house as a founding monument of European modernism, the BVV trade fair complex that put socialist Czechoslovakia on the industrial map, the startup and tech cluster that now makes Brno one of the fastest-growing Czech tech cities — your chauffeur knows it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you want to stop for a coffee at the Devět Křížů rest area halfway to Brno, that is included. If you need a specific temperature in the rear cabin, say so.
            </p>
          </div></Reveal>
        </div>
      </section>

      {/* Why book with Prestigo */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Why Prestigo</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">
            Why book with Prestigo<br /><span className="display-italic">for Prague to Brno.</span>
          </h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {whyBook.map((w, i) => (
              <Reveal key={w.title} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8 flex flex-col gap-4">
                <h3 className="font-display font-light text-[20px] text-offwhite">{w.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{w.body}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[34px] mb-12">Frequently asked questions</h2></Reveal>
          <div className="flex flex-col gap-0">{faqs.map((faq, i) => (<Reveal key={faq.q} variant="up" delay={i * 70}><div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}><h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3><p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p></div></Reveal>))}</div>
        </div>
      </section>

      {/* Related routes */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Related Routes</p>
          <h2 className="display text-[26px] md:text-[32px] mb-6">
            Continue across<br /><span className="display-italic">Moravia and beyond.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Brno is the natural hub for Moravia and the gateway south to Bratislava and Vienna. Many clients combine a Brno run with onward travel or use it as a bridge into the Danube capitals. Every Prestigo route has the same fixed-fare model, the same fleet, and the same chauffeurs.
          </p></Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {relatedRoutes.map((r, i) => (
              <Reveal key={r.slug} variant="up" delay={i * 100}><a href={`/routes/${r.slug}`} className="border border-anthracite-light p-6 flex justify-between items-center hover:border-[var(--copper)] transition-colors">
                <div>
                  <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Prague → {r.city}</p>
                  <p className="font-display font-light text-[18px] text-offwhite">{r.city}</p>
                </div>
                <div className="text-right">
                  <p className="font-body font-light text-[11px] text-warmgrey">{r.distance}</p>
                  <p className="font-body font-light text-[11px] text-warmgrey">{r.duration}</p>
                </div>
              </a></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up"><div><h2 className="display text-[28px] md:text-[36px]">Prague to Brno.<br /><span className="display-italic">From €340, fixed.</span></h2><p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p></div></Reveal>
          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">Book Now</a><a href="/routes" className="btn-ghost">All Routes</a></div></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
