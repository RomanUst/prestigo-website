import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'

export const metadata: Metadata = {
  title: 'Prague to Ostrava Private Transfer — From €610',
  description: 'Book a private chauffeur from Prague to Ostrava. 370 km door-to-door in a Mercedes-Benz. Fixed price from €610, Moravian-Silesian capital.',
  alternates: { canonical: '/routes/prague-ostrava' },
  openGraph: {
    url: 'https://rideprestigo.com/routes/prague-ostrava',
    title: 'Prague to Ostrava Private Transfer — From €610',
    description: 'Book a private chauffeur from Prague to Ostrava. 370 km door-to-door in a Mercedes-Benz. Fixed price from €610, Moravian-Silesian capital.',
  },
}

const highlights = [
  { label: 'Distance', value: '~370 km' },
  { label: 'Duration', value: '~4 hours' },
  { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
  { label: 'Price from', value: '€610', copper: true },
]

const vehicles = [
  { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '2 bags', price: 'From €610', photo: '/e-class-photo.png' },
  { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '2 bags', price: 'From €905', photo: '/s-class-photo.png' },
  { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: 'From €705', photo: '/v-class-photo.png' },
]

const inclusions = [
  'A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.',
  'A professional chauffeur — fluent English and Czech. Polish on request.',
  'Fuel, the Czech motorway vignette, and every toll on the route. Nothing is charged on top.',
  'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
  'Bottled water, phone charger, and WiFi in the rear cabin.',
  'Waiting time at pickup — 15 minutes free, then billed in transparent 15-minute increments.',
  'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
  'Same-day return — 10% off the return leg if booked together, or add hourly city rental from €40/hour.',
]

const faqs = [
  { q: 'How long does a private transfer from Prague to Ostrava take?', a: 'Approximately 4 hours door-to-door via the D1 motorway east through Brno and into Moravia-Silesia. Rush-hour congestion leaving Prague or around Brno can add 20–30 minutes. The route covers roughly 370 kilometres on the newly completed D1.' },
  { q: 'How much does a chauffeur from Prague to Ostrava cost?', a: 'Fixed fare from €610 in Mercedes E-Class (up to 3 passengers), €705 in V-Class (up to 6 passengers), or €905 in S-Class. Prices include fuel, the Czech motorway vignette, driver time, and every toll. No meter, no surge, no hidden charges.' },
  { q: 'Can I book a same-day return to Prague?', a: 'Yes, but a same-day round trip is heavy: roughly eight hours on the road plus time in Ostrava. Most clients overnight in Ostrava and return the following day, which the chauffeur can accommodate at a reduced rate. If the meeting or event is short, the driver can wait on-site and return the same evening.' },
  { q: 'Is there a border crossing on this route?', a: 'No. The Prague–Ostrava route is entirely inside the Czech Republic. Ostrava itself sits at the corner where Czech, Polish, and Slovak territory meet — the Polish border is roughly 10 km from the city centre, and the Slovak border is under an hour south. Prestigo can extend the booking across either border as a single fare.' },
  { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
  { q: 'What language does the chauffeur speak?', a: 'Every Prestigo chauffeur speaks fluent English and Czech as standard. A Polish-speaking or Russian-speaking chauffeur is available on request, which many clients find useful given Ostrava\'s proximity to the Polish border.' },
]

const whyBook = [
  {
    title: 'Fixed fare, no surprises',
    body: 'The price you see is the price you pay. Fuel, the Czech vignette, every toll, driver time, waiting time on arrival. Nothing added at drop-off.',
  },
  {
    title: 'Owned fleet, vetted chauffeurs',
    body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, trained for long-distance cross-country work.',
  },
  {
    title: 'Anticipatory service',
    body: 'If the D1 has the usual Velké Meziříčí construction zones, your chauffeur reroutes through Žďár nad Sázavou without asking. For Colours of Ostrava festival pickups, the chauffeur already knows the venue access protocols at Dolní Vítkovice.',
  },
]

const relatedRoutes = [
  { slug: 'prague-olomouc', city: 'Olomouc', distance: '280 km', duration: '2h 50min' },
  { slug: 'prague-brno', city: 'Brno', distance: '210 km', duration: '2h 15min' },
  { slug: 'prague-zlin', city: 'Zlín', distance: '300 km', duration: '3h 15min' },
  { slug: 'prague-krakow', city: 'Kraków', distance: '530 km', duration: '5h 30min' },
]

const serviceSchema = {
  '@type': 'Service',
  '@id': 'https://rideprestigo.com/routes/prague-ostrava#service',
  name: 'Private Chauffeur Transfer from Prague to Ostrava',
  serviceType: 'Private ground transfer',
  description: 'Chauffeured private transfer from Prague to Ostrava in Mercedes E-Class, S-Class, or V-Class. Fixed price, approximately 4 hours door-to-door via the D1 motorway. Distance 370 km.',
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
      name: 'Ostrava',
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
        description: 'Up to 3 passengers, 2 suitcases',
        price: '610',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-ostrava#e-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes S-Class',
        description: 'Up to 3 passengers, flagship comfort',
        price: '905',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-ostrava#s-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes V-Class',
        description: 'Up to 6 passengers, 6 suitcases',
        price: '705',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-ostrava#v-class',
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
      '@id': 'https://rideprestigo.com/routes/prague-ostrava#faq',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/routes/prague-ostrava#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
        { '@type': 'ListItem', position: 3, name: 'Prague to Ostrava', item: 'https://rideprestigo.com/routes/prague-ostrava' },
      ],
    },
  ],
}

export default function PragueOstravaPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0"><Image src="/photohero.png" alt="Ostrava" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Ostrava</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">Prague to Ostrava,<br /><span className="display-italic">industrial Silesia.</span></h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>370 km east to the Czech Republic&apos;s steel city on the Polish border. Colours of Ostrava, the Dolní Vítkovice ironworks, and a city in creative transformation — four hours, one fixed price.</p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book this Route</a>
            <a href="/contact" className="btn-ghost">Ask a Question</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* Highlights bar */}
      <section className="bg-anthracite-mid py-12">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {highlights.map((h, i) => (<Reveal key={h.label} variant="up" delay={i * 100}><div><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--copper)' }}>{h.label}</p>{Array.isArray(h.value) ? (<div><div className="flex flex-wrap gap-2 mt-1">{h.value.map((tag) => (<span key={tag} className="font-body font-light text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border border-anthracite-light text-offwhite">{tag}</span>))}</div><p className="font-body font-light text-[10px] text-warmgrey mt-3" style={{ letterSpacing: '0.03em' }}>Available on this route</p></div>) : (<p className="font-body font-light text-[22px]" style={{ color: (h as { copper?: boolean }).copper ? 'var(--copper-light)' : 'var(--offwhite)' }}>{h.value}</p>)}</div></Reveal>))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Opening paragraph */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
            A private transfer from Prague to Ostrava is a four-hour drive across the full east-west length of the Czech Republic, and every hour of that drive should feel like part of the trip — not a logistics problem. Prestigo runs a fleet of black Mercedes vehicles and bilingual chauffeurs who know the D1 from Prague through Brno and onward into Moravia-Silesia. The price is fixed before you book. The car is waiting when you step outside. The chauffeur already knows which entrance to use at your hotel in the city centre, your meeting address in the Dolní Vítkovice industrial park, or the venue gate for a Colours of Ostrava pickup.
          </p>
          <p className="body-text text-[14px] mt-6" style={{ lineHeight: '1.9' }}>
            This is not a shared shuttle. Not a ride-hail app. A private Mercedes, one chauffeur, and a fare that does not change.
          </p></Reveal>
        </div>
      </section>

      <Divider />

      {/* The Route narrative */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Route</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Ostrava<br /><span className="display-italic">in four hours.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or Václav Havel Airport, your chauffeur takes the D1 east through the Vysočina highlands towards Brno. This is a long but uniform run on the busiest Czech motorway — recently completed end to end, linking Prague to the Polish border without a single set of traffic lights. At Brno the route bends northeast, crossing into Moravia, past the rolling farmland around Prostějov and Olomouc, and finally down through Ostrava&apos;s industrial outskirts to the centre.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              There is no border crossing on this route — everything is Czech motorway. But Ostrava itself sits at the corner where Czech, Polish, and Slovak territory meet, and the city&apos;s character reflects that. Landmarks you pass or arrive at include Dolní Vítkovice, the post-industrial cultural centre with its iconic blast furnaces and the Bolt Tower; Stodolní street, the nightlife spine of the city; the New Town Hall observation deck, the tallest in the country; and the riverside venues where Colours of Ostrava fills the summer.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Your chauffeur watches D1 traffic before every departure. If the long-running Velké Meziříčí construction zones are active, they reroute through Žďár nad Sázavou without asking. You are not paying for traffic; you are paying for time.
            </p>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* What's included */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">What&apos;s Included</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Everything included,<br /><span className="display-italic">nothing to arrange.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Ostrava drop-off. The car, the chauffeur, the fuel, the tolls, the vignette. Business visit, industrial heritage day, or a festival weekend in Moravia-Silesia — your driver handles the route while you focus on the destination.</p>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-4 justify-center">{inclusions.map((item) => (<div key={item} className="flex items-start gap-4"><span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} /><span className="font-body font-light text-[13px] text-warmgrey" style={{ lineHeight: '1.8' }}>{item}</span></div>))}</div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Fleet */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Fleet</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14">Choose your vehicle</h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {vehicles.map((v, i) => (<Reveal key={v.name} variant="up" delay={i * 120}><div className="border border-anthracite-light flex flex-col"><div className="w-full overflow-hidden" style={{ aspectRatio: '16/9', position: 'relative' }}><Image src={v.photo} alt={v.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover object-top" style={{ filter: 'brightness(0.92)' }} /></div><div className="p-8 flex flex-col gap-6 flex-1"><div><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--copper)' }}>{v.category}</p><h3 className="font-display font-light text-[24px] text-offwhite mb-2">{v.name}</h3></div><div className="flex flex-col gap-2"><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Passengers</span><span className="font-body font-light text-[11px] text-offwhite">{v.capacity}</span></div><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Luggage</span><span className="font-body font-light text-[11px] text-offwhite">{v.bags}</span></div><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Transfer price</span><span className="font-body font-light text-[11px]" style={{ color: 'var(--copper-light)' }}>{v.price}</span></div></div><a href="/book" className="btn-primary self-center mt-auto" style={{ padding: '10px 24px', fontSize: '9px' }}>Book Online</a></div></div></Reveal>))}
          </div>
          <p className="body-text text-[11px] mt-8" style={{ lineHeight: '1.8' }}>All vehicles are late-model Mercedes-Benz, maintained to manufacturer standard. Child seats available on request at no charge.</p>
        </div>
      </section>

      <Divider />

      {/* Journey timeline + Good to know */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Journey</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Ostrava,<br /><span className="display-italic">the route.</span></h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Olomouc (optional)', note: 'Moravia\'s historic capital — the natural en-route stop. Available for a visit, a meeting, or a lunch break.', anchor: false, custom: false },
                { city: 'Anywhere you like', note: 'A stop anywhere along the Moravian corridor. Your schedule, your pace.', anchor: false, custom: true },
                { city: 'Ostrava', note: 'Drop-off at any Ostrava address, the Dolní Vítkovice complex, or Leoš Janáček Airport (OSR).', anchor: true, custom: false },
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
                  { label: 'Polish & Slovak connection', value: 'Ostrava is 10 km from the Polish border and under an hour from Slovakia. Prestigo can extend to Katowice, Kraków, or Žilina as part of a single booking.' },
                ].map((item) => (<div key={item.label}><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{item.label}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{item.value}</p></div>))}
              </div>
            </div>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* What to expect from your chauffeur */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Chauffeur</p>
            <h2 className="display text-[28px] md:text-[38px]">What to expect<br /><span className="display-italic">from your driver.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Your chauffeur meets you in front of your pickup address — central Prague hotel, private apartment, office, or the arrivals hall at Václav Havel Airport, where they stand inside the terminal with a Prestigo tablet displaying your name. No parking lot across the street, no meeting point a ten-minute walk away.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for four hours of work or rest, the chauffeur reads that signal and lets you be. If you want context on Ostrava — the story of how the Vítkovice ironworks shut down in the 1990s and were reborn from 2002 onwards as a cultural centre; how Colours of Ostrava turned a festival in a steelworks into one of Europe&apos;s most distinctive music weekends; how the city sits at the Czech-Polish-Slovak corner — your chauffeur knows it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. Temperature to your preference. On a four-hour drive, a real rest stop halfway is part of the plan — not a rushed fuel break, but a proper stop on the D1 for coffee and a stretch before the second leg into Moravia-Silesia.
            </p>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Why book with Prestigo */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Why Prestigo</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">
            Why book with Prestigo<br /><span className="display-italic">for Prague to Ostrava.</span>
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

      <Divider />

      {/* FAQ */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[34px] mb-12">Frequently asked questions</h2></Reveal>
          <div className="flex flex-col gap-0">{faqs.map((faq, i) => (<Reveal key={faq.q} variant="up" delay={i * 70}><div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}><h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3><p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p></div></Reveal>))}</div>
        </div>
      </section>

      <Divider />

      {/* Related routes */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Related Routes</p>
          <h2 className="display text-[26px] md:text-[32px] mb-6">
            Continue across<br /><span className="display-italic">Moravia and beyond.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Ostrava is the gateway between the Czech Republic, Poland, and Slovakia. Many clients combine the Ostrava run with a stop in Olomouc, a handover to Kraków, or a business circuit through the Moravian industrial belt. Every Prestigo route has the same fixed-fare model, the same fleet, and the same chauffeurs.
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

      <Divider />

      {/* Final CTA */}
      <section className="bg-anthracite py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up"><div><h2 className="display text-[28px] md:text-[36px]">Prague to Ostrava.<br /><span className="display-italic">From €610, fixed.</span></h2><p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p></div></Reveal>
          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">Book Now</a><a href="/routes" className="btn-ghost">All Routes</a></div></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
