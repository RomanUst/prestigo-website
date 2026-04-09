import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Prague to Leipzig Private Transfer — From €270',
  description: 'Book a private chauffeur from Prague to Leipzig. Door-to-door in a Mercedes-Benz. Fixed price from €270, Bach city and trade fair capital.',
  alternates: { canonical: '/routes/prague-leipzig' },
  openGraph: {
    url: 'https://rideprestigo.com/routes/prague-leipzig',
    title: 'Prague to Leipzig Private Transfer — From €270',
    description: 'Book a private chauffeur from Prague to Leipzig. Door-to-door in a Mercedes-Benz. Fixed price from €270, Bach city and trade fair capital.',
  },
}

const highlights = [
  { label: 'Distance', value: '~260 km' },
  { label: 'Duration', value: '~2h 45min' },
  { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
  { label: 'Price from', value: '€270', copper: true },
]

const vehicles = [
  { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €270', photo: '/e-class-photo.png' },
  { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €405', photo: '/s-class-photo.png' },
  { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: 'From €315', photo: '/v-class-photo.png' },
]

const inclusions = [
  'A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.',
  'A professional chauffeur — fluent English and Czech. German on request.',
  'Fuel, all tolls, and the German toll vignette. Nothing is charged on top.',
  'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
  'Bottled water, phone charger, and WiFi in the rear cabin.',
  'Waiting time at pickup — 15 minutes free, then €60/hour (E-Class) or €80/hour (S-Class).',
  'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
  'Same-day return discount — 10% off the return leg if booked together.',
]

const faqs = [
  { q: 'How long does a private transfer from Prague to Leipzig take?', a: 'Approximately 2 hours 45 minutes to 3 hours door-to-door via the D8 motorway north from Prague through Ústí nad Labem, the A17 around Dresden, and the A14 northwest to Leipzig. Friday rush hour out of Prague or construction on the A14 corridor can add 20 minutes.' },
  { q: 'How much does a chauffeur from Prague to Leipzig cost?', a: 'Fixed fare from €270 in Mercedes E-Class (up to 3 passengers), €315 in V-Class (up to 6 passengers), or €405 in S-Class. Prices include fuel, all tolls, and driver time. No hidden charges.' },
  { q: 'Can I book a same-day round trip from Prague to Leipzig?', a: 'Yes — and it is the most common booking pattern on this route. A return on the same day receives a 10% discount. Many clients combine Leipzig with a half-day in Dresden, which sits directly en route. Wait-on-site time is charged at €60/hour for E-Class or €80/hour for S-Class.' },
  { q: 'Do you cross the German border without problems?', a: 'Both countries are inside the Schengen Area. The crossing at Schönwald/Hřensko is invisible — no stops, no document checks. All Prestigo vehicles carry the German toll vignette and the chauffeur holds a valid international chauffeur licence recognised in Germany.' },
  { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
  { q: 'Can the chauffeur speak German?', a: 'A German-speaking chauffeur is available on request. Every Prestigo chauffeur speaks fluent English and Czech as standard.' },
]

const dayTripConfigurations = [
  {
    title: 'The Bach and Thomaskirche Day',
    body: 'Pickup at 7:30, arrive Leipzig around 10:30. Morning at St. Thomas Church — Bach\'s tomb in the chancel, the Bach Museum across the square, and if the timing lines up, a Motette service with the Thomanerchor. Lunch on the Markt before the return.',
    price: 'From €750 in E-Class — based on five hours on site.',
  },
  {
    title: 'The Spinnerei and Museums Afternoon',
    body: 'Later pickup at 9:00. Arrive for an afternoon at the Leipziger Baumwollspinnerei — the former cotton mill turned contemporary art quarter — with time for the Museum der bildenden Künste or the Grassi Museum before dinner near the Marktplatz.',
    price: 'From €700 in E-Class — based on four hours on site.',
  },
  {
    title: 'The Battle of the Nations and Old Town',
    body: 'Pickup at 8:00. Start at the Völkerschlachtdenkmal — the 91-metre Battle of the Nations Monument and its viewing platform — then a half-day in the Old Town around the Markt, the Old City Hall, and the Mädler-Passage. Return by early evening.',
    price: 'From €800 in E-Class — based on six hours on site.',
  },
]

const whyBook = [
  {
    title: 'Fixed fare, no surprises',
    body: 'The price you see is the price you pay. Fuel, tolls, the German vignette, driver time. Nothing added at drop-off.',
  },
  {
    title: 'Owned fleet, vetted chauffeurs',
    body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, trained for international travel.',
  },
  {
    title: 'Anticipatory service',
    body: 'If the A14 has a closure near Grimma, your chauffeur reroutes via the B6 without asking. If you want to combine Leipzig with Dresden in the same day, that is included in the planning, not an upsell.',
  },
]

const relatedRoutes = [
  { slug: 'prague-dresden', city: 'Dresden', distance: '150 km', duration: '2h' },
  { slug: 'prague-berlin', city: 'Berlin', distance: '350 km', duration: '3h 45min' },
  { slug: 'prague-nuremberg', city: 'Nuremberg', distance: '360 km', duration: '4h' },
  { slug: 'prague-munich', city: 'Munich', distance: '385 km', duration: '4h 15min' },
]

const serviceSchema = {
  '@type': 'Service',
  '@id': 'https://rideprestigo.com/routes/prague-leipzig#service',
  name: 'Private Chauffeur Transfer from Prague to Leipzig',
  serviceType: 'Private ground transfer',
  description: 'Chauffeured private transfer from Prague to Leipzig in Mercedes E-Class, S-Class, or V-Class. Fixed price, approximately 2 hours 45 minutes door-to-door via the D8, A17, and A14 motorways. Distance 260 km.',
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
      name: 'Leipzig',
      addressCountry: 'DE',
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
        price: '270',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-leipzig#e-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes S-Class',
        description: 'Up to 3 passengers, flagship comfort',
        price: '405',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-leipzig#s-class',
      },
      {
        '@type': 'Offer',
        name: 'Mercedes V-Class',
        description: 'Up to 6 passengers, 6 suitcases',
        price: '315',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://rideprestigo.com/routes/prague-leipzig#v-class',
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
      '@id': 'https://rideprestigo.com/routes/prague-leipzig#faq',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/routes/prague-leipzig#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
        { '@type': 'ListItem', position: 3, name: 'Prague to Leipzig', item: 'https://rideprestigo.com/routes/prague-leipzig' },
      ],
    },
  ],
}

export default function PragueLeipzigPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="relative border-b border-anthracite-light overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0"><Image src="/photohero.png" alt="Leipzig" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Leipzig</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">Prague to Leipzig,<br /><span className="display-italic">Bach&apos;s city.</span></h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>North into Saxony to the city of Bach and Schiller, the Gewandhaus, and one of Germany&apos;s great trade fair centres. Two hours, one fixed price, door to door.</p>
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
            A private transfer from Prague to Leipzig is a quiet two-and-a-half-hour run up the D8, around Dresden, and northwest across Saxony on the A14. Prestigo runs a fleet of black Mercedes vehicles and bilingual chauffeurs who have driven this route hundreds of times — for Leipzig Book Fair exhibitors, for Messe Leipzig trade visitors, for families chasing Bach and the Gewandhaus. The price is fixed before you book. The car is waiting when you step outside. The chauffeur already knows whether your drop-off is a hotel on Augustusplatz, a stand at the Neue Messe, or a studio inside the Spinnerei cotton-mill complex.
          </p>
          <p className="body-text text-[14px] mt-6" style={{ lineHeight: '1.9' }}>
            This is not a shared shuttle. Not a ride-hail app. A private Mercedes, one chauffeur, and a fare that does not change.
          </p>
        </div>
      </section>

      {/* The Route narrative */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <p className="label mb-6">The Route</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Leipzig,<br /><span className="display-italic">three motorways north.</span></h2>
          </div>
          <div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or Václav Havel Airport, your chauffeur takes the D8 motorway north through Ústí nad Labem. The Czech–German Schengen border in the Schönwald/Hřensko area is invisible — no stops, no document checks, just a seam of asphalt between two countries. In Germany the road becomes the A17, which loops around Dresden on its southern edge, before the A14 peels off northwest across rolling Saxon farmland to Leipzig.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Dresden is the natural midpoint of the drive. Many clients pause there for a coffee, an hour in the Altstadt, or a full half-day before continuing on to Leipzig. The A14 then delivers you to the Markt, St. Thomas Church with Bach&apos;s tomb in the chancel, the Neue Messe exhibition grounds north of the city, the Spinnerei art quarter in Plagwitz, or the Völkerschlachtdenkmal on the southern edge. Total distance is roughly 260 kilometres; driving time is two hours forty-five in normal conditions.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Your chauffeur watches traffic on the A14 corridor before every departure — the Grimma stretch has been prone to lane closures during recent resurfacing, and the workaround via the B6 adds fifteen minutes rather than an hour of standstill. You are not paying for traffic; you are paying for time.
            </p>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <p className="label mb-6">What&apos;s Included</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Everything included,<br /><span className="display-italic">nothing to arrange.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Leipzig drop-off. The car, the chauffeur, the fuel, the tolls, the vignette. Trade fair, concert at the Gewandhaus, or a weekend in Saxony — your driver handles the route while you focus on the destination.</p>
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
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Leipzig,<br /><span className="display-italic">the route.</span></h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Dresden (natural en-route stop)', note: 'Saxon capital on the Elbe — available as an en-route stop before continuing to Leipzig. Often combined with Leipzig on the same day.', anchor: false, custom: false },
                { city: 'Anywhere you like', note: 'A scenic break or any stop along the way. Your schedule, your pace.', anchor: false, custom: true },
                { city: 'Leipzig', note: 'Drop-off at any Leipzig address, your hotel, Messe Leipzig, the Markt, or St. Thomas Church.', anchor: true, custom: false },
              ].map((stop, i, arr) => (<div key={stop.city} className="flex gap-6"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />{i < arr.length - 1 && <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />}</div><div className="pb-6"><p className="font-body font-light text-[11px] tracking-[0.15em] uppercase mb-1" style={{ color: stop.custom ? 'var(--copper-pale)' : 'var(--offwhite)' }}>{stop.city}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{stop.note}</p></div></div>))}
            </div>
          </div>
          <div className="flex flex-col gap-6 justify-start pt-[60px]">
            <div className="border border-anthracite-light p-8">
              <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--copper)' }}>Good to know</p>
              <div className="flex flex-col gap-5">
                {[
                  { label: 'Border crossing', value: 'Czech–German Schengen border in the Schönwald/Hřensko area. No passport check for EU citizens — non-EU passengers should carry travel documents.' },
                  { label: 'Tolls', value: 'Czech motorway vignette and German motorway toll included in the quoted price.' },
                  { label: 'Return transfer', value: 'Book both directions together for a reduced rate.' },
                  { label: 'Onward routing', value: 'Leipzig connects to Berlin, Frankfurt, and Hamburg. Prestigo can extend your transfer onward from Leipzig.' },
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
            At two and a half to three hours each way, Leipzig sits inside the comfortable limit for a same-day return from Prague — and many clients pair it with a half-day in Dresden on the drive back. Three configurations cover most requests.
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
              Your chauffeur will meet you in front of your pickup address — central Prague, your office, or Václav Havel Airport. If you are arriving at PRG, they are inside the arrivals hall with a Prestigo tablet displaying your name, and the car is parked a short walk away rather than across a ring road.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for three hours of work or rest, the chauffeur will read that signal and let you be. If you want context on Leipzig — Bach&apos;s twenty-seven years as Thomaskantor, Mendelssohn founding the first German conservatory, the 1989 Monday demonstrations at the Nikolaikirche that helped bring down the Wall, Leipzig&apos;s centuries as the cradle of German publishing, the post-reunification pivot from industrial decline to one of the country&apos;s fastest-growing cities — your chauffeur knows it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you want a coffee break, the Rastplatz Heidenau on the A17 south of Dresden is the cleanest stop on the route — an easy ten-minute pause roughly halfway to Leipzig.
            </p>
          </div>
        </div>
      </section>

      {/* Why book with Prestigo */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Why Prestigo</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">
            Why book with Prestigo<br /><span className="display-italic">for Prague to Leipzig.</span>
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
            Leipzig pairs naturally with the other German routes from Prague. Many clients combine Leipzig with Dresden on the same day, or extend a Leipzig booking onward to Berlin. Every Prestigo route uses the same fixed-fare model, the same fleet, and the same chauffeurs.
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
          <div><h2 className="display text-[28px] md:text-[36px]">Prague to Leipzig.<br /><span className="display-italic">From €270, fixed.</span></h2><p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p></div>
          <div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">Book Now</a><a href="/routes" className="btn-ghost">All Routes</a></div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
