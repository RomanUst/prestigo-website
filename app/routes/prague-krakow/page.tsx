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
  const route = await getRoutePrice('prague-krakow')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  return {
    title: `Prague to Kraków Private Transfer — From €${ePrice}`,
    description: `Book a private chauffeur from Prague to Kraków. 385 km door-to-door in a Mercedes-Benz. Fixed price from €${ePrice}, Poland's royal capital.`,
    alternates: {
      canonical: '/routes/prague-krakow',
      languages: {
        en: 'https://rideprestigo.com/routes/prague-krakow',
        'x-default': 'https://rideprestigo.com/routes/prague-krakow',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/routes/prague-krakow',
      title: `Prague to Kraków Private Transfer — From €${ePrice}`,
      description: `Book a private chauffeur from Prague to Kraków. 385 km door-to-door in a Mercedes-Benz. Fixed price from €${ePrice}, Poland's royal capital.`,
      images: [{ url: "https://rideprestigo.com/hero-intercity-routes.png", width: 1200, height: 630 }],
    },
  }
}


export default async function PragueKrakowPage() {
  const route = await getRoutePrice('prague-krakow')
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
    'A professional chauffeur — fluent English and Czech. Polish on request.',
    'Fuel, Czech motorway vignette, and all Polish toll motorway charges including the A4. Nothing is charged on top.',
    'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
    'Bottled water, phone charger, and WiFi in the rear cabin.',
    'Waiting time at pickup — 15 minutes free at any address.',
    'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
    'Same-day return — 10% off the return leg if booked together, or add hourly city rental.',
  ]

  const faqs = [
    { q: 'How long does a private transfer from Prague to Kraków take?', a: 'Approximately 4 to 4.5 hours door-to-door. The route runs east on the D1 through Brno, then northeast toward Ostrava on the D1/D48, across the Schengen border at Český Těšín/Cieszyn, and east on the Polish A1 and A4 into Kraków. Friday afternoon departures out of Prague can add 20 minutes.' },
    { q: 'How much does a chauffeur from Prague to Kraków cost?', a: `Fixed fare from €${ePrice} in Mercedes E-Class (up to 3 passengers), €${vPrice} in V-Class (up to 6 passengers), or €${sPrice} in S-Class. Prices include fuel, the Czech vignette, and all Polish toll sections including the A4. No hidden charges.` },
    { q: 'Is a same-day round trip from Prague to Kraków possible?', a: 'Technically yes, but the driving alone is 8 to 9 hours round trip. Most Prestigo clients overnight in Kraków and book the return for the following day. If you need the chauffeur to move around the city with you, add hourly city rental.' },
    { q: 'Do you cross the Polish border without problems?', a: 'Both countries are inside the Schengen Area. The Czech–Polish border is crossed at Český Těšín on the Czech side and Cieszyn on the Polish side — no routine checks. All Prestigo vehicles are registered for international travel and the chauffeur holds a valid international chauffeur licence recognised in Poland.' },
    { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
    { q: 'Can the chauffeur speak Polish?', a: 'Polish is available on request — mention it at booking and Prestigo will assign a chauffeur with working Polish. Every Prestigo chauffeur speaks fluent English and Czech as standard, which is more than enough for the drive itself and for most interactions in Kraków.' },
  ]

  const dayTripConfigurations = [
    {
      title: 'The Wawel Castle and Old Town Day',
      body: 'Pickup at 6:30, arrive Kraków around 11:00. Five hours on foot: Wawel Castle and Cathedral, the Rynek Główny and Cloth Hall, lunch at a restaurant off the main square, the Jagiellonian University quarter. Return to Prague late evening.',
      price: 'Round-trip package — contact us for a quote',
    },
    {
      title: 'The Auschwitz-Birkenau Memorial Day',
      body: 'Pickup at 6:00. Your chauffeur drives directly to the Auschwitz-Birkenau State Museum in Oświęcim, 70 km west of Kraków. Four hours at the memorial with a booked, timed-entry guided tour. A quiet return drive to Prague. Handled with discretion.',
      price: 'Round-trip package — contact us for a quote',
    },
    {
      title: 'Wieliczka Salt Mine and Old Town',
      body: 'Pickup at 6:30, arrive Wieliczka around 11:00 for a two-hour underground tour of the UNESCO salt mine. Then into central Kraków for four hours at Rynek Główny and Kazimierz, the former Jewish quarter, before the return leg to Prague.',
      price: 'Round-trip package — contact us for a quote',
    },
  ]

  const whyBook = [
    {
      title: 'Fixed fare, no surprises',
      body: 'The price you see is the price you pay. Fuel, the Czech vignette, Polish motorway tolls, driver time, border crossing. Nothing added at drop-off.',
    },
    {
      title: 'Owned fleet, vetted chauffeurs',
      body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, trained for international travel.',
    },
    {
      title: 'Anticipatory service',
      body: 'If the A4 has a closure near Katowice, your chauffeur reroutes via Bielsko-Biała without asking. For Auschwitz-Birkenau visits, the chauffeur knows the timed-entry windows and builds the arrival around them, not around the drive.',
    },
  ]

  const relatedRoutes = [
    { slug: 'prague-ostrava', city: 'Ostrava', distance: '370 km', duration: '3h 30min' },
    { slug: 'prague-wroclaw', city: 'Wrocław', distance: '280 km', duration: '3h 15min' },
    { slug: 'prague-warsaw', city: 'Warsaw', distance: '680 km', duration: '7h' },
    { slug: 'prague-brno', city: 'Brno', distance: '200 km', duration: '2h' },
  ]

  const pageSchema = {
    '@context': 'https://schema.org' as const,
    '@graph': [
      ...(route ? buildRouteJsonLd(route, 'prague-krakow')['@graph'] : []),
      {
        '@type': 'FAQPage',
        '@id': 'https://rideprestigo.com/routes/prague-krakow#faq',
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://rideprestigo.com/routes/prague-krakow#breadcrumb',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
          { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
          { '@type': 'ListItem', position: 3, name: 'Prague to Kraków', item: 'https://rideprestigo.com/routes/prague-krakow' },
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
        <div className="absolute inset-0"><Image src="/photohero.png" alt="Kraków" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Kraków</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">Prague to Kraków,<br /><span className="display-italic">Poland&apos;s royal city.</span></h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>385 km northeast to Poland&apos;s cultural capital. Wawel Castle, the Rynek market square, Jewish Kazimierz, and salt mines at Wieliczka — four hours, one fixed price.</p>
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
            A private transfer from Prague to Kraków covers 385 km and takes approximately 4 hours door to door. Fixed fare starts at €{ePrice} in a Mercedes E-Class for up to 3 passengers; groups of up to 6 travel in the V-Class from €{vPrice}; the S-Class is available from €{sPrice} for executive or VIP travel. Every booking includes the driver's time, fuel, Czech motorway vignette, bottled water, onboard Wi-Fi, phone charger, and child seats on request at no extra cost. Nothing is added at drop-off. The fare is agreed before departure and does not change regardless of traffic or waiting time at your destination. Stops en route — Ostrava or Katowice — are available at the fixed fare when arranged at booking. Your chauffeur monitors traffic before every departure and reroutes without asking if there is a delay.
          </p>
          <p className="body-text text-[14px] mt-6" style={{ lineHeight: '1.9' }}>
            This is not a shared shuttle. Not a ride-hail app. A private Mercedes, one chauffeur, one border crossing handled for you, and a fare that does not change.
          </p></Reveal>
        </div>
      </section>

      <Divider />

      {/* The Route narrative */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Route</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Kraków<br /><span className="display-italic">in four hours.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or Václav Havel Airport, your chauffeur takes the D1 motorway east past Brno, then continues northeast on the D1 and D48 toward Ostrava. The Czech–Polish Schengen border is crossed at Český Těšín on the Czech side and Cieszyn on the Polish side — invisible, no stops, no document checks. From there, the Polish A1 joins the A4 heading east through Katowice and on to Kraków, arriving at your hotel or meeting point in central Małopolska.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Total distance is approximately 385 kilometres. Driving time is four hours in normal conditions, four and a half during Friday afternoon traffic out of Prague. If the chauffeur prefers a slightly different line on a given day — through Olomouc on the D35 and then onto the D48 — that option is on the table too. Both routes reach Kraków in roughly the same time, and the choice is made on the morning of the drive based on live traffic.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              In Kraków the drop-off can be anywhere: Stare Miasto and the Main Market Square, Wawel Castle above the Vistula, Kazimierz — the former Jewish quarter — or the socialist-realist plan of Nowa Huta on the eastern edge of the city. Your chauffeur watches traffic on the D1 and the Polish A4 before every departure. The A4 is a toll motorway and that cost is already inside your fare; if there is an incident near Katowice, they reroute without asking. You are not paying for traffic; you are paying for time.
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
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Kraków drop-off. The car, the chauffeur, the fuel, the Czech vignette, the Polish toll motorway. Business visit, cultural weekend, or a memorial day at Auschwitz-Birkenau — your driver handles the route while you focus on the destination.</p>
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
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Kraków,<br /><span className="display-italic">the route.</span></h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Brno or Ostrava (optional)', note: 'A natural midway stop for a coffee or a quick lunch. Brno after two hours on the D1, or Ostrava closer to the border if you prefer a later break.', anchor: false, custom: false },
                { city: 'Anywhere you like', note: 'A stop at the Wieliczka salt mines, Auschwitz-Birkenau, or anywhere on the route. Your schedule, your pace.', anchor: false, custom: true },
                { city: 'Kraków', note: 'Drop-off at any Kraków address, Wawel Castle, the Rynek Główny, or Kraków Airport (KRK).', anchor: true, custom: false },
              ].map((stop, i, arr) => (<div key={stop.city} className="flex gap-6"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />{i < arr.length - 1 && <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />}</div><div className="pb-6"><p className="font-body font-light text-[11px] tracking-[0.15em] uppercase mb-1" style={{ color: stop.custom ? 'var(--copper-pale)' : 'var(--offwhite)' }}>{stop.city}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{stop.note}</p></div></div>))}
            </div>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-6 justify-start pt-[60px]">
            <div className="border border-anthracite-light p-8">
              <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--copper)' }}>Good to know</p>
              <div className="flex flex-col gap-5">
                {[
                  { label: 'Border crossing', value: 'Czech–Polish Schengen border at Český Těšín/Cieszyn. No passport check for EU citizens — carry travel documents for non-EU passengers.' },
                  { label: 'Tolls', value: 'Czech motorway vignette and Polish toll motorway sections including the A4 all included in the quoted price.' },
                  { label: 'Return transfer', value: 'Book both directions together for a reduced rate. Most clients overnight in Kraków and return the following day.' },
                  { label: 'Auschwitz-Birkenau', value: '70 km west of Kraków. Prestigo can incorporate a respectful memorial visit into the transfer itinerary on request.' },
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
            Kraków at four to four and a half hours each way is a stretchy day trip. Most clients prefer an overnight. For those who want to see the city and be back in Prague by bedtime, three configurations cover the common requests.
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
              Your chauffeur will meet you in front of your pickup address in central Prague — Old Town, Malá Strana, Vinohrady — or inside the arrivals hall at Václav Havel Airport, holding a Prestigo tablet with your name. Not across a parking lot. Not at a meeting point ten minutes away. Where you are, at the time you booked.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for four hours of work or rest, the chauffeur will read that signal and let you be. If you want context on Kraków — its centuries as the seat of the Polish royal court, the UNESCO-listed Old Town, the Jagiellonian University founded in 1364, the weight of Holocaust memory in Kazimierz and at the Auschwitz-Birkenau memorial, the post-1989 transformation of the city — your chauffeur has it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you need a specific cabin temperature, say so. If you want to stop at the OMV rest area on the D1 near Brno for a coffee and a proper lunch, that is included — most Prague–Kraków drives take a twenty-minute break there.
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
            Why book with Prestigo<br /><span className="display-italic">for Prague to Kraków.</span>
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
            Continue across<br /><span className="display-italic">Central Europe.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Kraków is the anchor of Małopolska, but Prestigo covers the whole corridor east from Prague. Many clients combine the Kraków run with Ostrava or Brno on the Czech side, or with Wrocław and Warsaw further into Poland. Every Prestigo route has the same fixed-fare model, the same fleet, and the same chauffeurs.
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
          <Reveal variant="up"><div><h2 className="display text-[28px] md:text-[36px]">Prague to Kraków.<br /><span className="display-italic">From €{ePrice}, fixed.</span></h2><p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p></div></Reveal>
          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">Book Now</a><a href="/routes" className="btn-ghost">All Routes</a></div></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
