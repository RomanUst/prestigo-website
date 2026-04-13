import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'

export const metadata: Metadata = {
  title: 'Prague to Karlovy Vary Private Transfer — From €215',
  description: 'Book a private chauffeur from Prague to Karlovy Vary. 130 km door-to-door in a Mercedes-Benz. Fixed price from €215, spa town luxury transfer.',
  alternates: { canonical: '/routes/prague-karlovy-vary' },
  openGraph: {
    url: 'https://rideprestigo.com/routes/prague-karlovy-vary',
    title: 'Prague to Karlovy Vary Private Transfer — From €215',
    description: 'Book a private chauffeur from Prague to Karlovy Vary. 130 km door-to-door in a Mercedes-Benz. Fixed price from €215, spa town luxury transfer.',
  },
}

const highlights = [
  { label: 'Distance', value: '~130 km' },
  { label: 'Duration', value: '~1.5 hours' },
  { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
  { label: 'Price from', value: 'From €215', copper: true },
]

const vehicles = [
  { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €215', photo: '/e-class-photo.png' },
  { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €320', photo: '/s-class-photo.png' },
  { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: 'From €250', photo: '/v-class-photo.png' },
]

const inclusions = [
  'A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.',
  'A professional chauffeur — fluent English and Czech. Other languages on request.',
  'Fuel, all tolls, and the Czech motorway vignette. Nothing is charged on top.',
  'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
  'Bottled water, phone charger, and WiFi in the rear cabin.',
  'Waiting time at pickup — 15 minutes free at any address.',
  'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
  'Same-day return — 10% off the return leg if booked together, or add hourly city rental from €40/hour.',
]

const faqs = [
  { q: 'How long does a private transfer from Prague to Karlovy Vary take?', a: 'Approximately 1 hour 30 minutes door-to-door via the D6 motorway. The route runs entirely inside the Czech Republic and rarely congests outside of Friday afternoons in summer. Prague rush-hour traffic can add 10–15 minutes to the first leg.' },
  { q: 'How much does a chauffeur from Prague to Karlovy Vary cost?', a: 'Fixed fare from €215 in Mercedes E-Class (up to 3 passengers), €250 in V-Class (up to 6 passengers), or €320 in S-Class. Prices include fuel, the Czech vignette, and driver time. No hidden charges.' },
  { q: 'Can I book a same-day round trip from Prague to Karlovy Vary?', a: 'Yes — this is the most natural day-trip route we run. A return on the same day receives a 10% discount. If you need the chauffeur to move around with you during the visit, add hourly city rental from €40/hour. Most clients book a 4–6 hour round trip to cover the Mill Colonnade, a lunch at the Grandhotel Pupp, and a walk through the spa quarter.' },
  { q: 'Is there a border crossing on the Prague to Karlovy Vary route?', a: 'No. The entire journey is inside the Czech Republic on the D6 motorway. No documents are required beyond what your chauffeur carries as standard. The single Czech motorway vignette is included in the fare.' },
  { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
  { q: 'What language does the chauffeur speak?', a: 'Every Prestigo chauffeur speaks fluent Czech and English as standard. German, Russian, or other languages can be arranged on request at no extra charge — mention your preference when booking.' },
]

const dayTripConfigurations = [
  {
    title: 'The Colonnades and Becherovka',
    body: 'Pickup at 8:30, arrive Karlovy Vary around 10:00. Ninety minutes walking the Mlýnská Kolonáda and tasting the thermal springs from a lázeňský pohárek, then a guided tour at the Jan Becher Museum to trace the history of Becherovka. Back in Prague before lunch.',
    price: 'From €400 — based on three hours on site.',
  },
  {
    title: 'Grandhotel Pupp and the Mill Colonnade',
    body: 'Pickup at 9:00, arrive in time for a late coffee at the Grandhotel Pupp café, lunch in the dining room, and an afternoon across the Mlýnská Kolonáda, Hotel Imperial, and the Diana funicular. Return to Prague by early evening.',
    price: 'From €500 — based on five hours on site.',
  },
  {
    title: 'Loket Castle or the Film Festival',
    body: 'A full day in the region: Karlovy Vary in the morning, lunch, and either a short drive onward to Loket Castle on the Ohře river or an evening slot at the Karlovy Vary International Film Festival (late June to early July). Your chauffeur stays with you throughout.',
    price: 'From €600 — based on seven hours on site.',
  },
]

const whyBook = [
  {
    title: 'Fixed fare, no surprises',
    body: 'The price you see is the price you pay. Fuel, the Czech vignette, driver time. Nothing added at drop-off, nothing added at the return leg.',
  },
  {
    title: 'Owned fleet, vetted chauffeurs',
    body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, trained for the full West Bohemian spa region.',
  },
  {
    title: 'Anticipatory service',
    body: 'If the D6 has a closure near Lubenec, your chauffeur reroutes via the older Route 6 without asking. If you want to extend to Mariánské Lázně or Františkovy Lázně in the same day, that is included in the same booking.',
  },
]

const relatedRoutes = [
  { slug: 'prague-marianske-lazne', city: 'Mariánské Lázně', distance: '170 km', duration: '2h' },
  { slug: 'prague-frantiskovy-lazne', city: 'Františkovy Lázně', distance: '185 km', duration: '2h 15min' },
  { slug: 'prague-cesky-krumlov', city: 'Český Krumlov', distance: '170 km', duration: '2h 15min' },
  { slug: 'prague-dresden', city: 'Dresden', distance: '150 km', duration: '2h' },
]

const serviceSchema = {
  '@type': 'Service',
  '@id': 'https://rideprestigo.com/routes/prague-karlovy-vary#service',
  name: 'Private Chauffeur Transfer from Prague to Karlovy Vary',
  serviceType: 'Private ground transfer',
  description: 'Chauffeured private transfer from Prague to Karlovy Vary in Mercedes E-Class, S-Class, or V-Class. Fixed price, approximately 1 hour 30 minutes door-to-door via the R6 motorway through Cheb direction. Distance 130 km.',
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
      name: 'Karlovy Vary',
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
        price: '215',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-karlovy-vary#e-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes S-Class',
        description: 'Up to 3 passengers, flagship comfort',
        price: '320',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-karlovy-vary#s-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes V-Class',
        description: 'Up to 6 passengers, 6 suitcases',
        price: '250',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-karlovy-vary#v-class',
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
      '@id': 'https://rideprestigo.com/routes/prague-karlovy-vary#faq',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/routes/prague-karlovy-vary#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
        { '@type': 'ListItem', position: 3, name: 'Prague to Karlovy Vary', item: 'https://rideprestigo.com/routes/prague-karlovy-vary' },
      ],
    },
  ],
}

export default function PragueKarlovyVaryPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="relative border-b border-anthracite-light overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/photohero.png" alt="Karlovy Vary" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Karlovy Vary</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague to Karlovy Vary,<br />
            <span className="display-italic">spa country, direct.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            130 km west on the D6, through the Bohemian highlands. The most celebrated spa town in Central Europe — film festival, thermal colonnades, and Becherovka. One vehicle, one fixed price.
          </p>
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
            {highlights.map((h) => (
              <div key={h.label}>
                <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--copper)' }}>{h.label}</p>
                {Array.isArray(h.value) ? (
                  <div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {h.value.map((tag) => (
                        <span key={tag} className="font-body font-light text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border border-anthracite-light text-offwhite">{tag}</span>
                      ))}
                    </div>
                    <p className="font-body font-light text-[10px] text-warmgrey mt-3" style={{ letterSpacing: '0.03em' }}>Available on this route</p>
                  </div>
                ) : (
                  <p className="font-body font-light text-[22px]" style={{ color: (h as { copper?: boolean }).copper ? 'var(--copper-light)' : 'var(--offwhite)' }}>{h.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Opening paragraph */}
      <section className="bg-anthracite py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
            A private transfer from Prague to Karlovy Vary is a ninety-minute drive west across Bohemia, and every minute of it should feel like the opening of the trip — not a logistics problem to solve on the way. Prestigo runs a fleet of black Mercedes vehicles and bilingual chauffeurs who have driven this route hundreds of times. The price is fixed before you book. The car is at the kerb when you step outside. The chauffeur already knows whether you are heading to the Grandhotel Pupp, the Hotel Imperial funicular, or a quiet rental above the Teplá river.
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
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Karlovy Vary<br /><span className="display-italic">in ninety minutes.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or Václav Havel Airport, your chauffeur takes the D6 motorway west out of the city. The road climbs through the Bohemian plateau past Nové Strašecí and Krušovice, the land opening into rolling farmland and orchards before dropping into the spa valley at Karlovy Vary. The entire route stays inside the Czech Republic — no border crossing, no document checks, no vignette change.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Total distance is approximately 130 kilometres. Driving time is one and a half hours in normal conditions. Add 10–15 minutes during Friday afternoon rush hour out of Prague, particularly in summer.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              The D6 has been progressively widened to full motorway standard over the last several years, with the Hořesedly and Krupá sections completing recently and the final stretches toward Karlovy Vary scheduled through 2027. Your chauffeur watches the state of each section before every departure. If a construction zone appears near Lubenec or a closure affects the newer bypass, they reroute via the older Route 6 without asking. You are not paying for traffic; you are paying for time.
            </p>
          </div></Reveal>
        </div>
      </section>

      {/* What's included */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">What's Included</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Everything included,<br /><span className="display-italic">nothing to arrange.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Karlovy Vary drop-off. The car, the chauffeur, the fuel, the tolls, the vignette. Spa treatment, business meeting, or a weekend at the Pupp — your driver handles the route while you focus on the destination.</p>
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
            {vehicles.map((v) => (
              <div key={v.name} className="border border-anthracite-light flex flex-col">
                <div className="w-full overflow-hidden" style={{ aspectRatio: '16/9', position: 'relative' }}>
                  <Image src={v.photo} alt={v.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover object-top" style={{ filter: 'brightness(0.92)' }} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 120, height: 120, background: 'radial-gradient(circle at bottom right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, transparent 75%)' }} />
                </div>
                <div className="p-8 flex flex-col gap-6 flex-1">
                  <div>
                    <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--copper)' }}>{v.category}</p>
                    <h3 className="font-display font-light text-[24px] text-offwhite mb-2">{v.name}</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Passengers</span>
                      <span className="font-body font-light text-[11px] text-offwhite">{v.capacity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Luggage</span>
                      <span className="font-body font-light text-[11px] text-offwhite">{v.bags}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Transfer price</span>
                      <span className="font-body font-light text-[11px]" style={{ color: 'var(--copper-light)' }}>{v.price}</span>
                    </div>
                  </div>
                  <a href="/book" className="btn-primary self-center mt-auto" style={{ padding: '10px 24px', fontSize: '9px' }}>Book Online</a>
                </div>
              </div>
            ))}
          </div>
          <p className="body-text text-[11px] mt-8" style={{ lineHeight: '1.8' }}>
            All vehicles are late-model Mercedes-Benz, maintained to manufacturer standard. Child seats available on request at no charge.
          </p>
        </div>
      </section>

      {/* Journey timeline + Good to know */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Journey</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">
              Prague to Karlovy Vary,<br />
              <span className="display-italic">the route.</span>
            </h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Anywhere you like', note: 'A stop for a photo, a coffee, or a detour. The route belongs to you.', anchor: false, custom: true },
                { city: 'Karlovy Vary', note: 'Drop-off at your hotel, the Grand Colonnade, or Karlovy Vary Airport (KLV) on request.', anchor: true, custom: false },
              ].map((stop, i, arr) => (
                <div key={stop.city} className="flex gap-6">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />
                    {i < arr.length - 1 && (
                      <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />
                    )}
                  </div>
                  <div className="pb-6">
                    <p className="font-body font-light text-[11px] tracking-[0.15em] uppercase mb-1" style={{ color: stop.custom ? 'var(--copper-pale)' : 'var(--offwhite)' }}>{stop.city}</p>
                    <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{stop.note}</p>
                  </div>
                </div>
              ))}
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
                  { label: 'Spa stops', value: 'Mariánské Lázně and Františkovy Lázně are available as en-route stops. Just request at booking.' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{item.label}</p>
                    <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{item.value}</p>
                  </div>
                ))}
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
            Karlovy Vary is a ninety-minute drive each way — the most natural day-trip route we run. Three configurations cover most of what clients ask for.
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
              Your chauffeur will meet you in front of your pickup address — not in a parking lot across the street, not at an airport meeting point a ten-minute walk away. If you are at Václav Havel Airport, they are inside the arrivals hall with a Prestigo tablet displaying your name. From central Prague, the car is at the kerb within the window you set.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for ninety minutes of work or rest, the chauffeur will read that signal and let you be. If you want context on Karlovy Vary — why the Habsburgs built a summer court here, which hotel hosted the Russian aristocracy in the 1880s, how the Becherovka recipe survived two world wars and the expropriation of 1948, what the hot springs actually taste like — your chauffeur knows it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you need a specific temperature in the rear cabin, say so. If you want to stop for coffee at a rest area near Nové Strašecí halfway along the D6, that is included.
            </p>
          </div></Reveal>
        </div>
      </section>

      {/* Why book with Prestigo */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Why Prestigo</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">
            Why book with Prestigo<br /><span className="display-italic">for Prague to Karlovy Vary.</span>
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
            Continue across<br /><span className="display-italic">the spa triangle.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Karlovy Vary is the anchor of the West Bohemian spa triangle. Many clients combine it with Mariánské Lázně and Františkovy Lázně in a single booking, or extend north to Dresden or south to Český Krumlov. Every Prestigo route has the same fixed-fare model, the same fleet, and the same chauffeurs.
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

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up"><div>
            <h2 className="display text-[28px] md:text-[36px]">
              Prague to Karlovy Vary.<br />
              <span className="display-italic">From €215, fixed.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p>
          </div></Reveal>
          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book Now</a>
            <a href="/routes" className="btn-ghost">All Routes</a>
          </div></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
