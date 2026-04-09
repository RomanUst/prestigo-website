import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Prague to Budapest Private Transfer — From €885',
  description: 'Book a private chauffeur from Prague to Budapest. 535 km door-to-door in a Mercedes-Benz. Fixed price from €885, Pearl of the Danube.',
  alternates: { canonical: '/routes/prague-budapest' },
  openGraph: {
    url: 'https://rideprestigo.com/routes/prague-budapest',
    title: 'Prague to Budapest Private Transfer — From €885',
    description: 'Book a private chauffeur from Prague to Budapest. 535 km door-to-door in a Mercedes-Benz. Fixed price from €885, Pearl of the Danube.',
  },
}

const highlights = [
  { label: 'Distance', value: '~535 km' },
  { label: 'Duration', value: '~5.5 hours' },
  { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
  { label: 'Price from', value: '€885', copper: true },
]

const vehicles = [
  { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €885', photo: '/e-class-photo.png' },
  { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €1,310', photo: '/s-class-photo.png' },
  { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: 'From €1,015', photo: '/v-class-photo.png' },
]

const inclusions = [
  'A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.',
  'A professional chauffeur — fluent English and Czech. Hungarian on request.',
  'Fuel, all tolls, and the Czech, Slovak, and Hungarian motorway vignettes. Nothing is charged on top.',
  'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
  'Bottled water, phone charger, and WiFi in the rear cabin.',
  'Waiting time at pickup — 15 minutes free, then €60/hour (E-Class) or €80/hour (S-Class).',
  'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
  'Same-day return discount — 10% off the return leg if booked together.',
]

const faqs = [
  { q: 'How long does a private transfer from Prague to Budapest take?', a: 'Approximately 5 hours 30 minutes door-to-door via the D1 motorway east through Brno, a brief southern stretch through Slovakia on the D2 and the Bratislava D4 bypass, then across the Hungarian border onto the M15 and M1 into central Budapest. Friday afternoon departures out of Prague can add 20–30 minutes.' },
  { q: 'How much does a chauffeur from Prague to Budapest cost?', a: 'Fixed fare from €885 in Mercedes E-Class (up to 3 passengers), €1,015 in V-Class (up to 6 passengers), or €1,310 in S-Class. Prices include fuel, all three motorway vignettes, and driver time. No hidden charges.' },
  { q: 'Can I book a same-day round trip from Prague to Budapest?', a: 'It is possible but heavy — eleven hours on the road plus whatever time you spend in Budapest. Most Prestigo clients overnight in Budapest and return the following day, which is also cheaper than paying for the chauffeur to wait through the afternoon. If a same-day return is the right call for you, tell us the plan and we quote a firm round-trip fare.' },
  { q: 'How many border crossings are on this route?', a: 'Two. The Czech–Slovak Schengen border at Břeclav/Brodské after Brno, and the Slovak–Hungarian Schengen border at Rajka/Čunovo west of Budapest. Both are invisible inside the Schengen Area — no stops, no passport checks for EU citizens. Non-EU passengers should carry valid travel documents.' },
  { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
  { q: 'Can the chauffeur speak Hungarian?', a: 'Every Prestigo chauffeur speaks fluent English and Czech as standard, which covers every practical situation on the route and on arrival in Budapest. A Hungarian-speaking chauffeur is available on request with advance notice.' },
]

const dayTripConfigurations = [
  {
    title: 'The Buda Castle and Fisherman\'s Bastion express',
    body: 'Pickup at 5:00, arrive central Budapest by 10:30. Three hours on Castle Hill — Matthias Church, Fisherman\'s Bastion, the views across the Danube to Parliament — with lunch at a terrace restaurant in the Várnegyed. Return to Prague by 21:00.',
    price: 'From €1,750 in E-Class — based on three hours on site.',
  },
  {
    title: 'The Széchenyi Baths half-day',
    body: 'Early pickup for a 10:30 arrival at the Széchenyi Thermal Bath in City Park. Four hours in the outdoor pools and neo-Baroque bathhouse, with a late lunch on Andrássy Avenue before the drive back. Robes, swimwear, and timed entry arranged in advance on request.',
    price: 'From €1,800 in E-Class — based on four hours on site.',
  },
  {
    title: 'The Pest grand boulevards day',
    body: 'Pickup at 5:00. Five hours in Pest — Parliament exterior and Kossuth Square, St Stephen\'s Basilica, the Great Market Hall, and Váci Street for the afternoon. Your chauffeur waits near Vörösmarty Square between stops. Back in Prague before midnight.',
    price: 'From €1,850 in E-Class — based on five hours on site.',
  },
]

const whyBook = [
  {
    title: 'Fixed fare, no surprises',
    body: 'The price you see is the price you pay. Fuel, tolls, three motorway vignettes, driver time. Nothing added at drop-off.',
  },
  {
    title: 'Owned fleet, vetted chauffeurs',
    body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, trained for long-distance international travel.',
  },
  {
    title: 'Anticipatory service',
    body: 'If the M1 has a closure outside Győr, your chauffeur reroutes via Tatabánya without asking. If your flight into BUD is delayed, the pickup is shifted without a phone call. You should not have to manage the trip — that is the job.',
  },
]

const relatedRoutes = [
  { slug: 'prague-vienna', city: 'Vienna', distance: '330 km', duration: '3h 30min' },
  { slug: 'prague-bratislava', city: 'Bratislava', distance: '330 km', duration: '3h 30min' },
  { slug: 'prague-brno', city: 'Brno', distance: '205 km', duration: '2h 15min' },
  { slug: 'prague-krakow', city: 'Kraków', distance: '540 km', duration: '5h 30min' },
]

const serviceSchema = {
  '@type': 'Service',
  '@id': 'https://rideprestigo.com/routes/prague-budapest#service',
  name: 'Private Chauffeur Transfer from Prague to Budapest',
  serviceType: 'Private ground transfer',
  description: 'Chauffeured private transfer from Prague to Budapest in Mercedes E-Class, S-Class, or V-Class. Fixed price, approximately 5 hours 30 minutes door-to-door via the D1 motorway through Brno and the Hungarian M1. Distance 535 km.',
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
      name: 'Budapest',
      addressCountry: 'HU',
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
        price: '885',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-budapest#e-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes S-Class',
        description: 'Up to 3 passengers, flagship comfort',
        price: '1310',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-budapest#s-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes V-Class',
        description: 'Up to 6 passengers, 6 suitcases',
        price: '1015',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-budapest#v-class',
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
      '@id': 'https://rideprestigo.com/routes/prague-budapest#faq',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/routes/prague-budapest#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
        { '@type': 'ListItem', position: 3, name: 'Prague to Budapest', item: 'https://rideprestigo.com/routes/prague-budapest' },
      ],
    },
  ],
}

export default function PragueBudapestPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="relative border-b border-anthracite-light overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0"><Image src="/photohero.png" alt="Budapest" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Budapest</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">Prague to Budapest,<br /><span className="display-italic">Pearl of the Danube.</span></h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>535 km south through Moravia, Slovakia, and into Hungary. Buda Castle, the Chain Bridge, the thermal baths, and the ruin bars of Pest — five and a half hours, one fixed price.</p>
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
            {highlights.map((h) => (<div key={h.label}><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--copper)' }}>{h.label}</p>{Array.isArray(h.value) ? (<div><div className="flex flex-wrap gap-2 mt-1">{h.value.map((tag) => (<span key={tag} className="font-body font-light text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border border-anthracite-light text-offwhite">{tag}</span>))}</div><p className="font-body font-light text-[10px] text-warmgrey mt-3" style={{ letterSpacing: '0.03em' }}>Available on this route</p></div>) : (<p className="font-body font-light text-[22px]" style={{ color: (h as { copper?: boolean }).copper ? 'var(--copper-light)' : 'var(--offwhite)' }}>{h.value}</p>)}</div>))}
          </div>
        </div>
      </section>

      {/* Opening paragraph */}
      <section className="bg-anthracite py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
            A private transfer from Prague to Budapest is a five-and-a-half-hour drive across three countries on clean European motorway, and every hour of that drive should feel like part of the trip — not a logistics problem. Prestigo runs a fleet of black Mercedes vehicles and bilingual chauffeurs who have driven this route hundreds of times. The price is fixed before you book. The car is waiting when you step outside. The chauffeur already knows which entrance to use at your hotel on Andrássy Avenue, your apartment in the Inner City, or the pickup curb at Budapest Ferenc Liszt International Airport.
          </p>
          <p className="body-text text-[14px] mt-6" style={{ lineHeight: '1.9' }}>
            This is not a shared shuttle. Not a ride-hail app. A private Mercedes, one chauffeur, three borders, and a fare that does not change.
          </p>
        </div>
      </section>

      {/* The Route narrative */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <p className="label mb-6">The Route</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Budapest<br /><span className="display-italic">in five and a half hours.</span></h2>
          </div>
          <div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or Václav Havel Airport, your chauffeur takes the D1 motorway east through the Bohemian–Moravian highlands to Brno, then continues on the D2 down to the Czech–Slovak Schengen border at Břeclav and Brodské. Inside Slovakia the road runs south around Bratislava on the D4 bypass, crosses the Slovak–Hungarian Schengen border at Rajka and Čunovo, and becomes the Hungarian M15. From there the M1 carries you east past Győr and Tatabánya into the capital.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Total distance is approximately 535 kilometres. Driving time is five and a half hours in normal conditions. On arrival in Budapest, drop-off can be on the Pest side — the Inner City of Belváros, the hotels along the river, or Andrássy — or on the Buda side near Castle Hill and the Fisherman\'s Bastion. Your chauffeur knows both riverbanks and the bridge order between them.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Your chauffeur watches traffic on the D1 before every departure. If there is a construction zone between Jihlava and Brno — as there has been through the ongoing widening work — they reroute on the secondary network without asking. You are not paying for traffic; you are paying for time.
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
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Budapest drop-off. The car, the chauffeur, the fuel, the tolls, three vignettes. Business visit, thermal-bath weekend, or a Danube cultural trip — your driver handles the route while you focus on the destination.</p>
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
            {vehicles.map((v) => (<div key={v.name} className="border border-anthracite-light flex flex-col"><div className="w-full overflow-hidden" style={{ aspectRatio: '16/9', position: 'relative' }}><Image src={v.photo} alt={v.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover object-top" style={{ filter: 'brightness(0.92)' }} /><div style={{ position: 'absolute', bottom: 0, right: 0, width: 120, height: 120, background: 'radial-gradient(circle at bottom right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, transparent 75%)' }} /></div><div className="p-8 flex flex-col gap-6 flex-1"><div><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--copper)' }}>{v.category}</p><h3 className="font-display font-light text-[24px] text-offwhite mb-2">{v.name}</h3></div><div className="flex flex-col gap-2"><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Passengers</span><span className="font-body font-light text-[11px] text-offwhite">{v.capacity}</span></div><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Luggage</span><span className="font-body font-light text-[11px] text-offwhite">{v.bags}</span></div><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Transfer price</span><span className="font-body font-light text-[11px]" style={{ color: 'var(--copper-light)' }}>{v.price}</span></div></div><a href="/book" className="btn-primary self-center mt-auto" style={{ padding: '10px 24px', fontSize: '9px' }}>Book Online</a></div></div>))}
          </div>
          <p className="body-text text-[11px] mt-8" style={{ lineHeight: '1.8' }}>All vehicles are late-model Mercedes-Benz, maintained to manufacturer standard. Child seats available on request at no charge.</p>
        </div>
      </section>

      {/* Journey timeline + Good to know */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <p className="label mb-6">The Journey</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Budapest,<br /><span className="display-italic">the route.</span></h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Bratislava (optional)', note: 'Slovak capital directly on the route — available as an en-route stop before the final stretch into Hungary.', anchor: false, custom: false },
                { city: 'Anywhere you like', note: 'A stop at the Danube bend or any point along the way. Your schedule, your pace.', anchor: false, custom: true },
                { city: 'Budapest', note: 'Drop-off at any Budapest address, Budapest Airport (BUD), Buda Castle, or your hotel in Pest.', anchor: true, custom: false },
              ].map((stop, i, arr) => (<div key={stop.city} className="flex gap-6"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />{i < arr.length - 1 && <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />}</div><div className="pb-6"><p className="font-body font-light text-[11px] tracking-[0.15em] uppercase mb-1" style={{ color: stop.custom ? 'var(--copper-pale)' : 'var(--offwhite)' }}>{stop.city}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{stop.note}</p></div></div>))}
            </div>
          </div>
          <div className="flex flex-col gap-6 justify-start pt-[60px]">
            <div className="border border-anthracite-light p-8">
              <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--copper)' }}>Good to know</p>
              <div className="flex flex-col gap-5">
                {[
                  { label: 'Border crossings', value: 'Czech–Slovak Schengen border at Břeclav/Brodské and Slovak–Hungarian Schengen border at Rajka/Čunovo. No passport check for EU citizens.' },
                  { label: 'Tolls', value: 'Czech, Slovak, and Hungarian motorway vignettes all included in the quoted price.' },
                  { label: 'Return transfer', value: 'Book both directions together for a reduced rate.' },
                  { label: 'Vienna connection', value: 'Vienna sits roughly 60 km northwest of Budapest on the same corridor. Prestigo can incorporate a Vienna stop or extend your journey onward as a single booking.' },
                ].map((item) => (<div key={item.label}><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{item.label}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{item.value}</p></div>))}
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
            At eleven hours on the road round-trip, the Prague–Budapest day trip is a stretch — most clients overnight in Budapest instead. For those who prefer to sleep in their own bed, an early pickup makes it possible. Three configurations cover the practical options.
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
            Indicative prices based on the scenarios above. The final fare depends on the actual time spent on site — waiting time is billed in 15-minute increments at €60/hour (E-Class) or €80/hour (S-Class). Tell us your plan and we confirm a firm quote before you book.
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
              Your chauffeur will meet you in front of your pickup address — not in a parking lot across the street, not at an airport meeting point a ten-minute walk away. If you are at Václav Havel Airport, they are inside the arrivals hall with a Prestigo tablet displaying your name. On the return leg, a driver meets your party at Budapest Ferenc Liszt International Airport (BUD) in the Terminal 2 arrivals area with the same protocol.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for five hours of work or rest, the chauffeur will read that signal and let you be. If you want context on Budapest — the Austro-Hungarian Empire that bound Vienna and Budapest into a single state, the 1873 unification of Buda and Pest into a single city, the thermal bath culture that predates the Romans, or the post-1989 transformation from socialist capital to one of Europe\'s most visited cities — your chauffeur knows it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you forgot a European adapter, ask. If you need a specific temperature in the rear cabin, say so. If you want to stop for coffee at the Rohlenka rest area on the D1 before Brno, or at the Čilizská Radvaň services on the Slovak stretch, that is included.
            </p>
          </div>
        </div>
      </section>

      {/* Why book with Prestigo */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Why Prestigo</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">
            Why book with Prestigo<br /><span className="display-italic">for Prague to Budapest.</span>
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
          <div className="flex flex-col gap-0">{faqs.map((faq, i) => (<div key={faq.q} className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}><h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3><p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p></div>))}</div>
        </div>
      </section>

      {/* Related routes */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Related Routes</p>
          <h2 className="display text-[26px] md:text-[32px] mb-6">
            Continue across<br /><span className="display-italic">Central Europe.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Budapest sits at the eastern edge of the Prague corridor, and many of the cities between are destinations in their own right. Every Prestigo route has the same fixed-fare model, the same fleet, and the same chauffeurs.
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

      {/* Final CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div><h2 className="display text-[28px] md:text-[36px]">Prague to Budapest.<br /><span className="display-italic">From €885, fixed.</span></h2><p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p></div>
          <div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">Book Now</a><a href="/routes" className="btn-ghost">All Routes</a></div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
