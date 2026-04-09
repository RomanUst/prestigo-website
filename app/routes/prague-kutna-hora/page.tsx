import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Prague to Kutná Hora Private Transfer — From €115',
  description: 'Book a private chauffeur from Prague to Kutná Hora. 70 km door-to-door in a Mercedes-Benz. Fixed price from €115, UNESCO old town, Sedlec Ossuary.',
  alternates: { canonical: '/routes/prague-kutna-hora' },
  openGraph: {
    url: 'https://rideprestigo.com/routes/prague-kutna-hora',
    title: 'Prague to Kutná Hora Private Transfer — From €115',
    description: 'Book a private chauffeur from Prague to Kutná Hora. 70 km door-to-door in a Mercedes-Benz. Fixed price from €115, UNESCO old town, Sedlec Ossuary.',
  },
}

const highlights = [
  { label: 'Distance', value: '~70 km' },
  { label: 'Duration', value: '~1 hour' },
  { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
  { label: 'Price from', value: '€115', copper: true },
]

const vehicles = [
  { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €115', photo: '/e-class-photo.png' },
  { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €170', photo: '/s-class-photo.png' },
  { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: 'From €135', photo: '/v-class-photo.png' },
]

const inclusions = [
  'A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.',
  'A professional chauffeur — fluent English and Czech. Additional languages on request.',
  'Fuel, all tolls, and the Czech motorway vignette. Nothing is charged on top.',
  'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
  'Bottled water, phone charger, and WiFi in the rear cabin.',
  'Waiting time at pickup — 15 minutes free at any address.',
  'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
  'Same-day return — 10% off the return leg if booked together, or add hourly city rental from €40/hour.',
]

const faqs = [
  { q: 'How long does a private transfer from Prague to Kutná Hora take?', a: 'Approximately one hour door-to-door via the D1 motorway east out of Prague and Highway 38 through Kolín. It is the shortest drive of any Prestigo heritage route. Even with morning traffic leaving Prague, the full journey rarely exceeds 75 minutes.' },
  { q: 'How much does a chauffeur from Prague to Kutná Hora cost?', a: 'Fixed fare from €115 in Mercedes E-Class (up to 3 passengers), €135 in V-Class (up to 6 passengers), or €170 in S-Class. This is the lowest fare of any route in the Prestigo Green tier. Prices include fuel, tolls, and driver time. No hidden charges.' },
  { q: 'Can I book a same-day round trip and have the chauffeur wait?', a: 'Yes — and it is the standard pattern for this route. Kutná Hora is the easiest day trip from Prague, and most clients book the chauffeur to wait on site while they visit. A six-hour round trip covers St. Barbara, Sedlec, and a slow lunch without feeling rushed. If you need the chauffeur to move around the city with you, add hourly city rental from €40/hour.' },
  { q: 'Is there a border crossing on the way to Kutná Hora?', a: 'No. Kutná Hora is entirely within the Czech Republic, about 70 kilometres east of Prague in the Central Bohemian region. No border formalities, no vignettes beyond the Czech one, no passport checks.' },
  { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
  { q: 'What languages does the chauffeur speak?', a: 'Every Prestigo chauffeur speaks fluent Czech and English as standard. Additional languages — German, Italian, French, Russian — are available on request when you book in advance.' },
]

const dayTripConfigurations = [
  {
    title: 'The Cathedral and Italian Court',
    body: 'A half-day focused on the historic core. Pickup at 9:00, arrive in Kutná Hora by 10:00. Three hours for the Cathedral of St. Barbara, the Italian Court (Vlašský Dvůr) where Bohemian kings once minted the Prague groschen, and a walk along the Barborská terrace. Back in Prague by 14:00.',
    price: 'From €250 — based on three hours on site.',
  },
  {
    title: 'The Sedlec Ossuary and Cathedral Combo',
    body: 'The classic pairing. Pickup at 8:30, first stop at the Sedlec Ossuary before the coach crowds arrive, then across town to the Cathedral of St. Barbara and the medieval silver-mining quarter. Lunch in the old town, return to Prague late afternoon.',
    price: 'From €350 — based on five hours on site.',
  },
  {
    title: 'The Silver Mining and Historic Centre Day',
    body: 'A full day for travellers who want the full story. The Czech Museum of Silver and a guided descent into the medieval Hrádek mine, then the Cathedral of St. Barbara, the Italian Court, and the Stone House. The chauffeur stays with you throughout and handles parking between the sites.',
    price: 'From €400 — based on six hours on site.',
  },
]

const whyBook = [
  {
    title: 'Fixed fare, no surprises',
    body: 'The price you see is the price you pay. Fuel, the Czech vignette, driver time. Nothing added at drop-off, nothing added at the return leg.',
  },
  {
    title: 'Owned fleet, vetted chauffeurs',
    body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, and familiar with the historic streets of Kutná Hora.',
  },
  {
    title: 'Anticipatory service',
    body: 'If the D1 has the usual Mirošovice exit congestion, your chauffeur reroutes via Highway 333 without asking. For Sedlec Ossuary visits, the chauffeur knows the timed-entry windows and the parking constraints around the church, and plans the arrival accordingly.',
  },
]

const relatedRoutes = [
  { slug: 'prague-pardubice', city: 'Pardubice', distance: '105 km', duration: '1h 15min' },
  { slug: 'prague-hradec-kralove', city: 'Hradec Králové', distance: '115 km', duration: '1h 20min' },
  { slug: 'prague-cesky-krumlov', city: 'Český Krumlov', distance: '170 km', duration: '2h 15min' },
  { slug: 'prague-karlovy-vary', city: 'Karlovy Vary', distance: '130 km', duration: '1h 30min' },
]

const serviceSchema = {
  '@type': 'Service',
  '@id': 'https://rideprestigo.com/routes/prague-kutna-hora#service',
  name: 'Private Chauffeur Transfer from Prague to Kutná Hora',
  serviceType: 'Private ground transfer',
  description: 'Chauffeured private transfer from Prague to Kutná Hora in Mercedes E-Class, S-Class, or V-Class. Fixed price, approximately 1 hour door-to-door via the D1 and D11 motorways followed by the R35. Distance 70 km.',
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
      name: 'Kutná Hora',
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
        price: '115',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-kutna-hora#e-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes S-Class',
        description: 'Up to 3 passengers, flagship comfort',
        price: '170',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-kutna-hora#s-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes V-Class',
        description: 'Up to 6 passengers, 6 suitcases',
        price: '135',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-kutna-hora#v-class',
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
      '@id': 'https://rideprestigo.com/routes/prague-kutna-hora#faq',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/routes/prague-kutna-hora#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
        { '@type': 'ListItem', position: 3, name: 'Prague to Kutná Hora', item: 'https://rideprestigo.com/routes/prague-kutna-hora' },
      ],
    },
  ],
}

export default function PragueKutnaHoraPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="relative border-b border-anthracite-light overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/photohero.png" alt="Kutná Hora" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Kutná Hora</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague to Kutná Hora,<br />
            <span className="display-italic">the silver city.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            70 km east of Prague, the medieval silver-mining capital of Bohemia awaits. UNESCO old town, the haunting Sedlec Ossuary, and the Cathedral of St. Barbara. One hour, one vehicle, one fixed price.
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
          <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
            A private transfer from Prague to Kutná Hora is a one-hour drive through the rolling fields of Central Bohemia, and it is the closest piece of serious heritage you can reach from the capital. Prestigo runs a fleet of black Mercedes vehicles and bilingual chauffeurs who know the approach into the old town — where to drop you for the Cathedral of St. Barbara, where parking is tolerated near Sedlec, and which streets turn into pedestrian zones on weekends. The price is fixed before you book. The car is waiting when you step outside. The chauffeur already has your day mapped out.
          </p>
          <p className="body-text text-[14px] mt-6" style={{ lineHeight: '1.9' }}>
            This is not a shared coach tour. Not a train transfer with a ten-minute walk at the other end. A private Mercedes, one chauffeur, and a fare that does not change — from a city that, six centuries ago, rivalled Prague itself.
          </p>
        </div>
      </section>

      {/* The Route narrative */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <p className="label mb-6">The Route</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Kutná Hora<br /><span className="display-italic">in one hour.</span></h2>
          </div>
          <div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or Václav Havel Airport, your chauffeur takes the D1 motorway east, exits at Mirošovice, and follows Highway 38 through the Elbe lowlands by way of Kolín. There is no border crossing — Kutná Hora sits in the Central Bohemian region, entirely inside the Czech Republic. It is, in fact, the closest Green-tier destination on the Prestigo route map.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Total distance is approximately 70 kilometres. Driving time is one hour in normal conditions. The approach into the old town takes you past the silhouette of the Cathedral of St. Barbara on its hillside — a UNESCO-listed late Gothic jewel since 1995 — with the Italian Court (Vlašský Dvůr) and the Sedlec Ossuary (Bone Church) waiting in the historic core. For Sedlec visits with a group, your chauffeur confirms the advance booking the church now requires for organised parties.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Your chauffeur watches traffic on the D1 before every departure. If the Mirošovice exit is congested — as it often is on Friday afternoons heading out of Prague — they reroute via Highway 333 without asking. You are not paying for traffic; you are paying for time.
            </p>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <p className="label mb-6">What's Included</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Everything included,<br /><span className="display-italic">nothing to arrange.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Kutná Hora drop-off. The car, the chauffeur, the fuel, the tolls, the vignette. Half-day visit, full day on site, or a quiet morning at the cathedral — your driver handles the route while you focus on the destination.</p>
          </div>
          <div className="flex flex-col gap-4 justify-center">{inclusions.map((item) => (<div key={item} className="flex items-start gap-4"><span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} /><span className="font-body font-light text-[13px] text-warmgrey" style={{ lineHeight: '1.8' }}>{item}</span></div>))}</div>
        </div>
      </section>

      {/* Fleet */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Fleet</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14">Choose your vehicle</h2>
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
          <div>
            <p className="label mb-6">The Journey</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">
              Prague to Kutná Hora,<br />
              <span className="display-italic">the route.</span>
            </h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Anywhere you like', note: 'A stop at Kolín, a roadside break, or any address on the way. Your route, your schedule.', anchor: false, custom: true },
                { city: 'Kutná Hora', note: 'Drop-off at the town centre, your hotel, or the Sedlec Ossuary entrance. Driver can wait for your return.', anchor: true, custom: false },
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
          </div>
          <div className="flex flex-col gap-6 justify-start pt-[60px]">
            <div className="border border-anthracite-light p-8">
              <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--copper)' }}>Good to know</p>
              <div className="flex flex-col gap-5">
                {[
                  { label: 'Border crossing', value: 'No border crossing — entirely within the Czech Republic.' },
                  { label: 'Tolls', value: 'Czech motorway vignette included in the quoted price.' },
                  { label: 'Return transfer', value: 'Book both directions together for a reduced rate.' },
                  { label: 'Day trip', value: 'PRESTIGO covers the full day-trip format. Driver waits on-site or returns at your agreed time.' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{item.label}</p>
                    <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular day-trip configurations */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Day Trips from Prague</p>
          <h2 className="display text-[28px] md:text-[38px] mb-4">Popular day-trip<br /><span className="display-italic">configurations.</span></h2>
          <p className="body-text text-[13px] mb-14 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Kutná Hora is the closest Green destination on the Prestigo route map — one hour each way — which makes it the easiest day trip from Prague. Three configurations cover most of what clients ask for.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {dayTripConfigurations.map((c) => (
              <div key={c.title} className="border border-anthracite-light p-8 flex flex-col gap-4">
                <h3 className="font-display font-light text-[22px] text-offwhite">{c.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{c.body}</p>
                <p className="font-body font-light text-[11px] mt-auto pt-4 border-t border-anthracite-light" style={{ color: 'var(--copper-light)' }}>{c.price}</p>
              </div>
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
          <div>
            <p className="label mb-6">The Chauffeur</p>
            <h2 className="display text-[28px] md:text-[38px]">What to expect<br /><span className="display-italic">from your driver.</span></h2>
          </div>
          <div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Your chauffeur will meet you in front of your pickup address — a central Prague hotel, a private apartment in Vinohrady, or Václav Havel Airport with a Prestigo tablet displaying your name in the arrivals hall. No parking lots. No meeting points ten minutes away.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for the hour of driving — rest, work, a window view of the Bohemian countryside — the chauffeur will read that signal and let you be. If you want context on Kutná Hora, your chauffeur has it: the medieval silver-mining capital that briefly rivalled Prague in wealth during the fourteenth century; the bone church at Sedlec and the Cistercian cathedral beside it; the Bohemian Gothic of St. Barbara and its late nineteenth-century restoration; the UNESCO listing of 1995 that ties the old town and Sedlec together.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you want to stop at the OMV service area near Mirošovice for a coffee before the open road, that is included. Temperature, music, a quick detour through Kolín on the return — say so.
            </p>
          </div>
        </div>
      </section>

      {/* Why book with Prestigo */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Why Prestigo</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">
            Why book with Prestigo<br /><span className="display-italic">for Prague to Kutná Hora.</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {whyBook.map((w) => (
              <div key={w.title} className="border border-anthracite-light p-8 flex flex-col gap-4">
                <h3 className="font-display font-light text-[20px] text-offwhite">{w.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[34px] mb-12">Frequently asked questions</h2>
          <div className="flex flex-col gap-0">
            {faqs.map((faq, i) => (
              <div key={faq.q} className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}>
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related routes */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Related Routes</p>
          <h2 className="display text-[26px] md:text-[32px] mb-6">
            Continue across<br /><span className="display-italic">Bohemia.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Kutná Hora pairs naturally with other Bohemian heritage day trips. Every Prestigo route has the same fixed-fare model, the same fleet, and the same chauffeurs.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {relatedRoutes.map((r) => (
              <a key={r.slug} href={`/routes/${r.slug}`} className="border border-anthracite-light p-6 flex justify-between items-center hover:border-[var(--copper)] transition-colors">
                <div>
                  <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Prague → {r.city}</p>
                  <p className="font-display font-light text-[18px] text-offwhite">{r.city}</p>
                </div>
                <div className="text-right">
                  <p className="font-body font-light text-[11px] text-warmgrey">{r.distance}</p>
                  <p className="font-body font-light text-[11px] text-warmgrey">{r.duration}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h2 className="display text-[28px] md:text-[36px]">
              Prague to Kutná Hora.<br />
              <span className="display-italic">From €115, fixed.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book Now</a>
            <a href="/routes" className="btn-ghost">All Routes</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
