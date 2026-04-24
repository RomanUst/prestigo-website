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
  const route = await getRoutePrice('prague-plzen')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  return {
    title: `Prague to Plzeň Private Transfer — From €${ePrice}`,
    description: `Book a private chauffeur from Prague to Plzeň. 90 km on the D5 in a Mercedes-Benz. Fixed price from €${ePrice}, Pilsner Urquell brewery capital.`,
    alternates: {
      canonical: '/routes/prague-plzen',
      languages: {
        en: 'https://rideprestigo.com/routes/prague-plzen',
        'x-default': 'https://rideprestigo.com/routes/prague-plzen',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/routes/prague-plzen',
      title: `Prague to Plzeň Private Transfer — From €${ePrice}`,
      description: `Book a private chauffeur from Prague to Plzeň. 90 km on the D5 in a Mercedes-Benz. Fixed price from €${ePrice}, Pilsner Urquell brewery capital.`,
      images: [{ url: "https://rideprestigo.com/hero-intercity-routes.png", width: 1200, height: 630 }],
    },
  }
}


export default async function PraguePlzenPage() {
  const route = await getRoutePrice('prague-plzen')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const sPrice = route?.sClassEur ?? ROUTE_FALLBACK.sClassEur
  const vPrice = route?.vClassEur ?? ROUTE_FALLBACK.vClassEur

  const highlights = [
    { label: 'Distance', value: '~90 km' },
    { label: 'Duration', value: '~1 hour' },
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
    'Fuel, all tolls, and the Czech motorway vignette. Nothing is charged on top.',
    'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
    'Bottled water, phone charger, and WiFi in the rear cabin.',
    'Waiting time at pickup — 15 minutes free at any address.',
    'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
    'Same-day return — 10% off the return leg if booked together, or add hourly city rental.',
  ]

  const faqs = [
    { q: 'How long does a private transfer from Prague to Plzeň take?', a: 'Approximately 1 hour door-to-door via the D5 motorway. The D5 is a direct, fully built-out route west from Prague. Traffic leaving Prague during weekday rush hour can add 10–15 minutes.' },
    { q: 'How much does a chauffeur from Prague to Plzeň cost?', a: `Fixed fare from €${ePrice} in Mercedes E-Class (up to 3 passengers), €${vPrice} in V-Class (up to 6 passengers), or €${sPrice} in S-Class. Prices include fuel, all tolls, the Czech vignette, and driver time. No hidden charges.` },
    { q: 'Can I book a same-day return with a stop at the Pilsner Urquell brewery?', a: 'Yes. Most Plzeň bookings are same-day round trips built around the Pilsner Urquell tour. Your chauffeur waits on site while you tour the brewery and the cellars. Book both directions together for a 10% discount on the return leg. If you need the chauffeur to move around the city with you, add hourly city rental.' },
    { q: 'Is there a border crossing on this route?', a: 'No. Plzeň is inside the Czech Republic — the entire Prague to Plzeň journey stays within Czechia. No passports, no vignettes beyond the Czech one, no checks. The D5 does continue west to the German border at Rozvadov/Waidhaus, but only if you extend the route to Nuremberg or Munich.' },
    { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
    { q: 'What language does the chauffeur speak?', a: 'Every Prestigo chauffeur speaks fluent Czech and English as standard. German is available on request at no additional charge — useful if you are combining Plzeň with an onward leg into Bavaria.' },
  ]

  const whyBook = [
    {
      title: 'Fixed fare, no surprises',
      body: 'The price you see is the price you pay. Fuel, the Czech vignette, driver time, waiting at the brewery gate. Nothing added at drop-off.',
    },
    {
      title: 'Owned fleet, vetted chauffeurs',
      body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, trained for the full Bohemia network.',
    },
    {
      title: 'Anticipatory service',
      body: 'If you want to combine the brewery tour with a Karlovy Vary stop on the same day, that is included. If your hotel concierge changes the pickup time, the chauffeur shifts without a phone call.',
    },
  ]

  const relatedRoutes = [
    { slug: 'prague-karlovy-vary', city: 'Karlovy Vary', distance: '130 km', duration: '1h 30min' },
    { slug: 'prague-marianske-lazne', city: 'Mariánské Lázně', distance: '160 km', duration: '1h 45min' },
    { slug: 'prague-nuremberg', city: 'Nuremberg', distance: '360 km', duration: '4h' },
    { slug: 'prague-cesky-krumlov', city: 'Český Krumlov', distance: '170 km', duration: '2h 15min' },
  ]

  const pageSchema = {
    '@context': 'https://schema.org' as const,
    '@graph': [
      ...(route ? buildRouteJsonLd(route, 'prague-plzen')['@graph'] : []),
      {
        '@type': 'FAQPage',
        '@id': 'https://rideprestigo.com/routes/prague-plzen#faq',
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://rideprestigo.com/routes/prague-plzen#breadcrumb',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
          { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
          { '@type': 'ListItem', position: 3, name: 'Prague to Plzeň', item: 'https://rideprestigo.com/routes/prague-plzen' },
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
        <div className="absolute inset-0">
          <Image src="/photohero.png" alt="Plzeň" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Plzeň</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague to Plzeň,<br />
            <span className="display-italic">the brewery capital.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            90 km west on the D5. Home of Pilsner Urquell, West Bohemia&apos;s industrial capital, and a Republic Square that demands a slow coffee. One hour, one vehicle, one fixed price.
          </p>
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

      <Divider />

      {/* Opening paragraph */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
            A private transfer from Prague to Plzeň covers 90 km via the D5 motorway and takes approximately 1 hour door to door. Fixed fare starts at €{ePrice} in a Mercedes E-Class for up to 3 passengers; groups of up to 6 travel in the V-Class from €{vPrice}; the S-Class is available from €{sPrice} for executive or VIP travel. Every booking includes the driver's time, fuel, Czech motorway vignette, bottled water, onboard Wi-Fi, phone charger, and child seats on request at no extra cost. Nothing is added at drop-off. The fare is agreed before departure and does not change regardless of traffic or waiting time at your destination. Stops en route — Beroun, Rokycany, or a Pilsner Urquell brewery visit — are available at the fixed fare when arranged at booking. Your chauffeur monitors traffic before every departure and reroutes without asking if there is a delay.
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
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Plzeň<br /><span className="display-italic">in one hour.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or Václav Havel Airport, your chauffeur takes the D5 motorway west. The road runs past Beroun, through the Valík tunnel on the ring south of Plzeň, and drops you into the city from whichever exit is closest to your destination. The entire route is inside the Czech Republic — there is no border crossing on this transfer. The same D5 continues beyond Plzeň to the German border at Rozvadov/Waidhaus, but only if you extend the booking west into Bavaria.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Total distance is approximately 90 kilometres. Driving time is one hour in normal conditions. Add 10–15 minutes during Friday afternoon rush hour out of Prague, when the westbound D5 fills with weekenders heading for the spa triangle and Bavaria.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              The D5 has been fully built between Prague and the German border since 2006, and it remains one of the smoother motorway runs in Czechia. Your chauffeur still checks traffic before every departure. If there is a closure near Beroun or roadwork on the Plzeň ring, they reroute without asking. You are not paying for traffic; you are paying for time.
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
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Plzeň drop-off. The car, the chauffeur, the fuel, the Czech vignette. Brewery tour, business meeting at Škoda, or a slow afternoon on Republic Square — your driver handles the route while you focus on the day.</p>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-4 justify-center">
            {inclusions.map((item) => (
              <div key={item} className="flex items-start gap-4">
                <span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[13px] text-warmgrey" style={{ lineHeight: '1.8' }}>{item}</span>
              </div>
            ))}
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Fleet */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Fleet</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14">Choose your vehicle</h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {vehicles.map((v) => (
              <div key={v.name} className="border border-anthracite-light flex flex-col">
                <div className="w-full overflow-hidden" style={{ aspectRatio: '16/9', position: 'relative' }}>
                  <Image src={v.photo} alt={v.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover object-top" style={{ filter: 'brightness(0.92)' }} />
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

      <Divider />

      {/* Journey timeline + Good to know */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Journey</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">
              Prague to Plzeň,<br />
              <span className="display-italic">the route.</span>
            </h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Anywhere you like', note: 'A stop at Beroun, a roadside break, or anywhere on the D5. Your schedule, your pace.', anchor: false, custom: true },
                { city: 'Plzeň', note: 'Drop-off at any Plzeň address, the Pilsner Urquell brewery entrance, or the Republic Square.', anchor: true, custom: false },
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
                  { label: 'Onward routing', value: 'Plzeň is on the D5 to Nuremberg and Munich. Prestigo can extend your journey beyond Plzeň as a single booking.' },
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
              Your chauffeur will meet you in front of your pickup address — central Prague, Old Town, Vinohrady, or the arrivals hall at Václav Havel Airport. If you are at the airport, they are inside the terminal with a Prestigo tablet displaying your name. Not in a distant parking lot, not waiting for a phone call.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for an hour of calls or rest, the chauffeur will read that signal and let you be. If you want context on Plzeň — the 1842 founding of the brewery that gave pale lager its name, the Škoda Transportation works that still ship trams and locomotives across Europe, the city&apos;s turn as European Capital of Culture in 2015, its role as the western gateway toward Bavaria — your driver knows it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you need a specific rear-cabin temperature, say so. If you want to stop at the Rozvadov rest area further along the D5 on a Bavaria-bound extension, or just pause for a coffee before Plzeň, that is part of the fare.
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
            Why book with Prestigo<br /><span className="display-italic">for Prague to Plzeň.</span>
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

      <Divider />

      {/* Related routes */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Related Routes</p>
          <h2 className="display text-[26px] md:text-[32px] mb-6">
            Continue across<br /><span className="display-italic">West Bohemia.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Plzeň sits at the centre of the western corridor out of Prague. Many clients combine the brewery run with a spa stop in Karlovy Vary, a Baroque afternoon in Český Krumlov, or an onward leg into Bavaria. Every Prestigo route has the same fixed-fare model, the same fleet, and the same chauffeurs.
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
          <Reveal variant="up"><div>
            <h2 className="display text-[28px] md:text-[36px]">
              Prague to Plzeň.<br />
              <span className="display-italic">From €{ePrice}, fixed.</span>
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
