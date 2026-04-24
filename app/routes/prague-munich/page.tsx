import type { Metadata } from 'next'
import { getRoutePrice } from '@/lib/route-prices'
import { buildRouteJsonLd } from '@/lib/jsonld'
import { ROUTE_FALLBACK } from '@/lib/price-fallbacks'

export const revalidate = 120


import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'

export async function generateMetadata(): Promise<Metadata> {
  const route = await getRoutePrice('prague-munich')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  return {
    title: `Prague to Munich Private Transfer — From €${ePrice}`,
    description: `Book a private chauffeur from Prague to Munich. 385 km door-to-door in a Mercedes-Benz. Fixed price from €${ePrice}, Bavarian capital.`,
    alternates: {
      canonical: '/routes/prague-munich',
      languages: {
        en: 'https://rideprestigo.com/routes/prague-munich',
        'x-default': 'https://rideprestigo.com/routes/prague-munich',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/routes/prague-munich',
      title: `Prague to Munich Private Transfer — From €${ePrice}`,
      description: `Book a private chauffeur from Prague to Munich. 385 km door-to-door in a Mercedes-Benz. Fixed price from €${ePrice}, Bavarian capital.`,
      images: [{ url: "https://rideprestigo.com/hero-intercity-routes.png", width: 1200, height: 630 }],
    },
  }
}


export default async function PragueMunichPage() {
  const route = await getRoutePrice('prague-munich')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const sPrice = route?.sClassEur ?? ROUTE_FALLBACK.sClassEur
  const vPrice = route?.vClassEur ?? ROUTE_FALLBACK.vClassEur

  const highlights = [
    { label: 'Distance', value: '~385 km' },
    { label: 'Duration', value: '~4 hours' },
    { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
    { label: 'Price from', value: `€${ePrice}`, copper: true },
  ]

  const vehicles = [
    { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '2 bags', price: `From €${ePrice}`, photo: '/e-class-photo.png' },
    { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '2 bags', price: `From €${sPrice}`, photo: '/s-class-photo.png' },
    { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: `From €${vPrice}`, photo: '/v-class-photo.png' },
  ]

  const inclusions = [
    'A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.',
    'A professional chauffeur — fluent English and Czech. German on request.',
    'Fuel, all tolls, and the German toll vignette. Nothing is charged on top.',
    'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
    'Bottled water, phone charger, and WiFi in the rear cabin.',
    'Waiting time at pickup — 15 minutes free at any address.',
    'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
    'Same-day return — 10% off the return leg if booked together, or add hourly city rental.',
  ]

  const faqs = [
    { q: 'How long does a private transfer from Prague to Munich take?', a: 'Approximately 4 hours door-to-door via the D5 motorway through Plzeň, the Czech-German border at Rozvadov/Waidhaus, then the A6 west, the A93 south past Regensburg, and the A9 into central Munich. Friday afternoon traffic on the A99 ring around Munich can add 20–30 minutes.' },
    { q: 'How much does a chauffeur from Prague to Munich cost?', a: `Fixed fare from €${ePrice} in Mercedes E-Class (up to 3 passengers), €${vPrice} in V-Class (up to 6 passengers), or €${sPrice} in S-Class. Prices include fuel, the Czech vignette, the German toll, and driver time. No hidden charges.` },
    { q: 'Can I book a same-day round trip from Prague to Munich?', a: 'Yes, though it is a long day. A round trip is roughly 8 hours of driving, so most clients depart Prague at 6:00 to give themselves four to six hours on the ground in Munich before the return. A same-day return receives a 10% discount. If you need the chauffeur to move around with you, add hourly city rental.' },
    { q: 'Do you cross the German border without problems?', a: 'Both countries are inside the Schengen Area. The Czech-German border at Rozvadov/Waidhaus has no routine checks. All Prestigo vehicles carry the German toll vignette and the chauffeur holds a valid international chauffeur licence recognised in Bavaria.' },
    { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
    { q: 'Can the chauffeur speak German?', a: 'A German-speaking chauffeur is available on request — useful for Bavarian hotel concierges, Oktoberfest pickups, or business meetings in Munich. Every Prestigo chauffeur speaks fluent English and Czech as standard.' },
  ]

  const dayTripConfigurations = [
    {
      title: 'The Marienplatz and Hofbräuhaus Day',
      body: 'Pickup at 6:00, arrive Munich around 10:00. Four hours in the Altstadt — the Glockenspiel on Marienplatz at 11:00, the Viktualienmarkt for lunch, then a stein at the Hofbräuhaus before the return. Back in Prague by 20:00.',
      price: 'Round-trip package — contact us for a quote',
    },
    {
      title: 'The BMW Welt and Olympiapark Morning',
      body: 'Pickup at 6:30, arrive at BMW Welt for the 10:00 opening. Three hours in the museum and the showroom, then a walk through the 1972 Olympiapark. Lunch in Schwabing before the chauffeur turns the car back toward Prague.',
      price: 'Round-trip package — contact us for a quote',
    },
    {
      title: 'The Pinakothek Galleries Day',
      body: 'Pickup at 6:00, arrive Maxvorstadt around 10:00. Five hours across the Alte, Neue, and Pinakothek der Moderne — the strongest museum quarter in southern Germany — with a coffee break at the Café in the Alte Pinakothek. Departure at 15:30, home before 20:00.',
      price: 'Round-trip package — contact us for a quote',
    },
  ]

  const whyBook = [
    {
      title: 'Fixed fare, no surprises',
      body: 'The price you see is the price you pay. Fuel, the Czech vignette, the German toll, driver time. Nothing added at drop-off in Munich.',
    },
    {
      title: 'Owned fleet, vetted chauffeurs',
      body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, trained for the long Bavaria run.',
    },
    {
      title: 'Anticipatory service',
      body: 'If the A93 has a closure near Regensburg, your chauffeur reroutes via Bayreuth without asking. If your flight into MUC is delayed, the pickup is shifted without a phone call. You should not have to manage the trip — that is the job.',
    },
  ]

  const relatedRoutes = [
    { slug: 'prague-nuremberg', city: 'Nuremberg', distance: '290 km', duration: '3h' },
    { slug: 'prague-regensburg', city: 'Regensburg', distance: '290 km', duration: '3h 15min' },
    { slug: 'prague-passau', city: 'Passau', distance: '230 km', duration: '2h 45min' },
    { slug: 'prague-salzburg', city: 'Salzburg', distance: '470 km', duration: '4h 45min' },
  ]

  const pageSchema = {
    '@context': 'https://schema.org' as const,
    '@graph': [
      ...(route ? buildRouteJsonLd(route, 'prague-munich')['@graph'] : []),
      {
        '@type': 'FAQPage',
        '@id': 'https://rideprestigo.com/routes/prague-munich#faq',
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://rideprestigo.com/routes/prague-munich#breadcrumb',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
          { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
          { '@type': 'ListItem', position: 3, name: 'Prague to Munich', item: 'https://rideprestigo.com/routes/prague-munich' },
        ],
      },
    ],
  }

  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0"><Image src="/photohero.png" alt="Munich" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Munich</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">Prague to Munich,<br /><span className="display-italic">Bavarian capital.</span></h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>385 km southwest through Bohemia and Bavaria. Marienplatz, the English Garden, Oktoberfest, and Munich Airport — four hours, one fixed price, door to door.</p>
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
            A private transfer from Prague to Munich covers 385 km via the D5 and A93 motorways and takes approximately 4 hours door to door. Fixed fare starts at €{ePrice} in a Mercedes E-Class for up to 3 passengers; groups of up to 6 travel in the V-Class from €{vPrice}; the S-Class is available from €{sPrice} for executive or VIP travel. Every booking includes the driver's time, fuel, Czech and German motorway vignettes, bottled water, onboard Wi-Fi, phone charger, and child seats on request at no extra cost. Nothing is added at drop-off. The fare is agreed before departure and does not change regardless of traffic or waiting time at your destination. Stops en route — Plzeň or Regensburg — are available at the fixed fare when arranged at booking. Your chauffeur monitors traffic before every departure and reroutes without asking if there is a delay.
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
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Munich<br /><span className="display-italic">in four hours.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or Václav Havel Airport, your chauffeur takes the D5 motorway southwest through Pilsen and the rolling West Bohemian countryside. The Czech-German Schengen border at Rozvadov/Waidhaus is invisible — no stops, no document checks. Once in Bavaria, the road becomes the A6 heading west toward Nuremberg.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              The conventional fast route then turns south on the A93 past Regensburg and joins the A9 for the final approach into Munich. Drop-off is anywhere you need it — a hotel in the Altstadt near Marienplatz, an office in Maxvorstadt, the BMW Welt, or the executive terminal at Munich Airport (MUC). Total distance is approximately 385 kilometres.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Driving time is four hours in clean conditions. The Munich autobahn ring, the A99, can be heavy at morning and evening rush hour, so add 20–30 minutes for arrivals between 7:30 and 9:30 or 16:30 and 18:30. Your chauffeur watches the boards before every departure and shifts the route through the city outskirts when needed. You are not paying for traffic; you are paying for time.
            </p>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* What's included */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">What's Included</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Everything included,<br /><span className="display-italic">nothing to arrange.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Munich drop-off. The car, the chauffeur, the fuel, the tolls, the vignette. Airport transfer, business meeting, Oktoberfest weekend, or a Bavarian holiday — your driver handles the route while you focus on the destination.</p>
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
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Munich,<br /><span className="display-italic">the route.</span></h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Plzeň (optional)', note: 'West Bohemia\'s capital on the D5 — Pilsner Urquell brewery available as an en-route stop.', anchor: false, custom: false },
                { city: 'Anywhere you like', note: 'Regensburg, Nuremberg, or any stop on the Bavarian corridor. Your route, your pace.', anchor: false, custom: true },
                { city: 'Munich', note: 'Drop-off at any Munich address, Munich Airport (MUC), Marienplatz, or your hotel.', anchor: true, custom: false },
              ].map((stop, i, arr) => (<div key={stop.city} className="flex gap-6"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />{i < arr.length - 1 && <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />}</div><div className="pb-6"><p className="font-body font-light text-[11px] tracking-[0.15em] uppercase mb-1" style={{ color: stop.custom ? 'var(--copper-pale)' : 'var(--offwhite)' }}>{stop.city}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{stop.note}</p></div></div>))}
            </div>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-6 justify-start pt-[60px]">
            <div className="border border-anthracite-light p-8">
              <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--copper)' }}>Good to know</p>
              <div className="flex flex-col gap-5">
                {[
                  { label: 'Border crossing', value: 'Czech-German Schengen border at Rozvadov/Waidhaus. No passport check for EU citizens.' },
                  { label: 'Tolls', value: 'Czech motorway vignette and German motorway toll both included in the quoted price.' },
                  { label: 'Return transfer', value: 'Book both directions together for a reduced rate.' },
                  { label: 'Airport service', value: 'Full airport meet-and-greet at Munich Airport (MUC). Flight tracking and flexible wait times included.' },
                ].map((item) => (<div key={item.label}><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{item.label}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{item.value}</p></div>))}
              </div>
            </div>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Popular day-trip configurations */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Day Trips from Prague</p>
          <h2 className="display text-[28px] md:text-[38px] mb-4">Popular day-trip<br /><span className="display-italic">configurations.</span></h2>
          <p className="body-text text-[13px] mb-14 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Munich is four hours from Prague, which makes a same-day round trip practical for early starters. Three configurations cover most requests.
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
            Indicative prices based on the scenarios above. The final fare depends on the actual time spent on site. You can book the journey there and back with a 10% same-day return discount, or add hourly city rental if you need the chauffeur to move around the city with you. Tell us your plan and we confirm a firm quote before you book.
          </p>
        </div>
      </section>

      <Divider />

      {/* What to expect from your chauffeur */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Chauffeur</p>
            <h2 className="display text-[28px] md:text-[38px]">What to expect<br /><span className="display-italic">from your driver.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Your chauffeur will meet you in front of your pickup address — not in a parking lot across the street, not at an airport meeting point a ten-minute walk away. If you are at Václav Havel Airport, they are inside the arrivals hall with a Prestigo tablet displaying your name. If your inbound flight lands at Munich Airport, the same protocol holds at MUC — meet inside Terminal 1 or Terminal 2 arrivals, luggage to the car, motorway in under fifteen minutes.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for four hours of work or rest, the chauffeur will read that signal and let you be. If you want context on Munich — the Bavarian distinction from the rest of Germany, the post-war rebuilding of the Altstadt, the BMW industrial story, what Oktoberfest looks like from the inside of a Schwabing flat — your chauffeur knows it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you need a longer break, the chauffeur will pull off at the Heiligenwald rest stop on the A6 just past Waidhaus — clean facilities, real coffee, ten minutes to stretch. Then back on the road and on time into Munich.
            </p>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Why book with Prestigo */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Why Prestigo</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">
            Why book with Prestigo<br /><span className="display-italic">for Prague to Munich.</span>
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
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[34px] mb-12">Frequently asked questions</h2></Reveal>
          <div className="flex flex-col gap-0">{faqs.map((faq, i) => (<Reveal key={faq.q} variant="up" delay={i * 70}><div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}><h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3><p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p></div></Reveal>))}</div>
        </div>
      </section>

      <Divider />

      {/* Related routes */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Related Routes</p>
          <h2 className="display text-[26px] md:text-[32px] mb-6">
            Continue across<br /><span className="display-italic">Bavaria and beyond.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Munich anchors the Bavarian corridor between Prague and the Alps. Many clients combine the Munich run with Nuremberg, Regensburg, or extend into Austria. Every Prestigo route has the same fixed-fare model, the same fleet, and the same chauffeurs.
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
          <Reveal variant="up"><div><h2 className="display text-[28px] md:text-[36px]">Prague to Munich.<br /><span className="display-italic">From €{ePrice}, fixed.</span></h2><p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p></div></Reveal>
          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">Book Now</a><a href="/routes" className="btn-ghost">All Routes</a></div></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
