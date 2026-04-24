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
  const route = await getRoutePrice('prague-hradec-kralove')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  return {
    title: `Prague to Hradec Králové Private Transfer — From €${ePrice}`,
    description: `Book a private chauffeur from Prague to Hradec Králové. 115 km on the D11 in a Mercedes-Benz. Fixed price from €${ePrice}.`,
    alternates: {
      canonical: '/routes/prague-hradec-kralove',
      languages: {
        en: 'https://rideprestigo.com/routes/prague-hradec-kralove',
        'x-default': 'https://rideprestigo.com/routes/prague-hradec-kralove',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/routes/prague-hradec-kralove',
      title: `Prague to Hradec Králové Private Transfer — From €${ePrice}`,
      description: `Book a private chauffeur from Prague to Hradec Králové. 115 km on the D11 in a Mercedes-Benz. Fixed price from €${ePrice}.`,
      images: [{ url: "https://rideprestigo.com/hero-intercity-routes.png", width: 1200, height: 630 }],
    },
  }
}


export default async function PragueHradecKralovePage() {
  const route = await getRoutePrice('prague-hradec-kralove')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const sPrice = route?.sClassEur ?? ROUTE_FALLBACK.sClassEur
  const vPrice = route?.vClassEur ?? ROUTE_FALLBACK.vClassEur

  const highlights = [
    { label: 'Distance', value: '~115 km' },
    { label: 'Duration', value: '~1.5 hours' },
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
    'A professional chauffeur — fluent English and Czech. Additional languages on request.',
    'Fuel, all tolls, and the Czech motorway vignette. Nothing is charged on top.',
    'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
    'Bottled water, phone charger, and WiFi in the rear cabin.',
    'Waiting time at pickup — 15 minutes free at any address.',
    'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
    'Same-day return — 10% off the return leg if booked together, or add hourly city rental.',
  ]

  const faqs = [
    { q: 'How long does the Prague to Hradec Králové transfer take?', a: 'Approximately 1.5 hours door-to-door via the D11 motorway. The D11 runs east out of Prague directly into Hradec Králové — straightforward, well-maintained, and the only major road needed for the journey.' },
    { q: 'How much does a chauffeur from Prague to Hradec Králové cost?', a: `Fixed fare from €${ePrice} in Mercedes E-Class (up to 3 passengers), €${vPrice} in V-Class (up to 6 passengers), or €${sPrice} in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.` },
    { q: 'Is a same-day return available?', a: 'Yes. Your chauffeur can wait on site in Hradec Králové or return at an agreed time. A return booked on the same day receives a 10% discount. If you need the chauffeur to move around the city with you, add hourly city rental.' },
    { q: 'Is there a border crossing on this route?', a: 'No. Hradec Králové is in East Bohemia and the entire route runs inside the Czech Republic. There are no border checks, no foreign vignettes, and no currency changes. Only the Czech motorway toll applies, and it is already included in your fixed fare.' },
    { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are all available at no extra charge. Please specify your child\'s age at booking so the correct seat is fitted before pickup.' },
    { q: 'What language does the chauffeur speak?', a: 'Every Prestigo chauffeur speaks fluent English and Czech as standard. German, French, Italian, or Russian-speaking chauffeurs are available on request — please mention your preference at booking.' },
  ]

  const pageSchema = {
    '@context': 'https://schema.org' as const,
    '@graph': [
      ...(route ? buildRouteJsonLd(route, 'prague-hradec-kralove')['@graph'] : []),
      {
        '@type': 'FAQPage',
        '@id': 'https://rideprestigo.com/routes/prague-hradec-kralove#faq',
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://rideprestigo.com/routes/prague-hradec-kralove#breadcrumb',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
          { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
          { '@type': 'ListItem', position: 3, name: 'Prague to Hradec Králové', item: 'https://rideprestigo.com/routes/prague-hradec-kralove' },
        ],
      },
    ],
  }

  const whyBook = [
    {
      title: 'Fixed fare, no surprises',
      body: 'The price you see is the price you pay. Fuel, the Czech motorway vignette, driver time. Nothing added at drop-off, no meter, no app surge.',
    },
    {
      title: 'Owned fleet, vetted chauffeurs',
      body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, and trained for long-distance work.',
    },
    {
      title: 'Anticipatory service',
      body: 'If you want to combine Hradec Králové with Pardubice in the same day, that is included. The two cities are 25 minutes apart and form the natural East Bohemian pair. Tell your chauffeur the plan; the rest is handled.',
    },
  ]

  const relatedRoutes = [
    { slug: 'prague-pardubice', city: 'Pardubice', distance: '105 km', duration: '1h 15min' },
    { slug: 'prague-liberec', city: 'Liberec', distance: '110 km', duration: '1h 20min' },
    { slug: 'prague-kutna-hora', city: 'Kutná Hora', distance: '80 km', duration: '1h' },
    { slug: 'prague-brno', city: 'Brno', distance: '205 km', duration: '2h 20min' },
  ]

  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0"><Image src="/photohero.png" alt="Hradec Králové" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Hradec Králové</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">Prague to Hradec Králové,<br /><span className="display-italic">the royal city.</span></h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>115 km east on the D11 to the royal city on the upper Elbe. Modernist architecture by Kotěra and Gočár, the East Bohemia Museum, and East Bohemia's cultural capital. One fixed price.</p>
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
                {Array.isArray(h.value) ? (<div><div className="flex flex-wrap gap-2 mt-1">{h.value.map((tag) => (<span key={tag} className="font-body font-light text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border border-anthracite-light text-offwhite">{tag}</span>))}</div><p className="font-body font-light text-[10px] text-warmgrey mt-3" style={{ letterSpacing: '0.03em' }}>Available on this route</p></div>) : (<p className="font-body font-light text-[22px]" style={{ color: (h as { copper?: boolean }).copper ? 'var(--copper-light)' : 'var(--offwhite)' }}>{h.value}</p>)}
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
            A private transfer from Prague to Hradec Králové covers 115 km via the D11 motorway and takes approximately 1.5 hours door to door. Fixed fare starts at €{ePrice} in a Mercedes E-Class for up to 3 passengers; groups of up to 6 travel in the V-Class from €{vPrice}; the S-Class is available from €{sPrice} for executive or VIP travel. Every booking includes the driver's time, fuel, Czech motorway vignette, bottled water, onboard Wi-Fi, phone charger, and child seats on request at no extra cost. Nothing is added at drop-off. The fare is agreed before departure and does not change regardless of traffic or waiting time at your destination. Stops en route — Poděbrady or Chlumec nad Cidlinou — are available at the fixed fare when arranged at booking. Your chauffeur monitors traffic before every departure and reroutes without asking if there is a delay.
          </p>
          <p className="body-text text-[14px] mt-6" style={{ lineHeight: '1.9' }}>
            This is not a shared shuttle. Not a taxi app. A private Mercedes, one chauffeur, and a fare that does not change between booking and drop-off.
          </p></Reveal>
        </div>
      </section>

      <Divider />

      {/* The Route narrative */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">The Route</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Hradec Králové<br /><span className="display-italic">in ninety minutes.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or Václav Havel Airport, your chauffeur takes the D11 motorway east. The D11 is the primary eastbound Czech motorway connecting the capital to East Bohemia, and it runs directly from the Prague ring road into the outskirts of Hradec Králové without branching. There is no border crossing, no foreign vignette to arrange, and no document check to anticipate — the entire route is inside the Czech Republic.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              On arrival, Hradec Králové unfolds at the confluence of the Elbe and Orlice rivers. The medieval core is anchored by the Bílá Věž (White Tower) bell tower above the Old Town Square and the Gothic Cathedral of the Holy Spirit. Around that medieval spine, the city was replanned in the early twentieth century by Jan Kotěra and his protégé Josef Gočár into one of Europe's most coherent functionalist civic quarters — the reason Hradec is known as the Salon of the Republic. The East Bohemian Museum, designed by Kotěra, is part of that legacy.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Total distance is roughly 115 kilometres. Normal driving time is ninety minutes. Friday evening traffic out of Prague can add fifteen minutes; your chauffeur checks D11 conditions before every departure and reroutes if needed. You are not paying for traffic; you are paying for time.
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
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Hradec Králové drop-off. The car, the chauffeur, the fuel, the Czech motorway vignette. Business visit, architectural tour, or a day at the East Bohemian Museum — your driver handles the route while you focus on the destination.</p>
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
            {vehicles.map((v) => (
              <div key={v.name} className="border border-anthracite-light flex flex-col">
                <div className="w-full overflow-hidden" style={{ aspectRatio: '16/9', position: 'relative' }}><Image src={v.photo} alt={v.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover object-top" style={{ filter: 'brightness(0.92)' }} /></div>
                <div className="p-8 flex flex-col gap-6 flex-1">
                  <div><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--copper)' }}>{v.category}</p><h3 className="font-display font-light text-[24px] text-offwhite mb-2">{v.name}</h3></div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Passengers</span><span className="font-body font-light text-[11px] text-offwhite">{v.capacity}</span></div>
                    <div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Luggage</span><span className="font-body font-light text-[11px] text-offwhite">{v.bags}</span></div>
                    <div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Transfer price</span><span className="font-body font-light text-[11px]" style={{ color: 'var(--copper-light)' }}>{v.price}</span></div>
                  </div>
                  <a href="/book" className="btn-primary self-center mt-auto" style={{ padding: '10px 24px', fontSize: '9px' }}>Book Online</a>
                </div>
              </div>
            ))}
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
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Hradec Králové,<br /><span className="display-italic">the route.</span></h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Pardubice (optional)', note: 'Adjacent twin city. Available as an en-route stop — Old Town, racecourse, or any Pardubice address.', anchor: false, custom: false },
                { city: 'Anywhere you like', note: 'A stop at Poděbrady, a roadside break, or any address on the way. Your route, your schedule.', anchor: false, custom: true },
                { city: 'Hradec Králové', note: 'Drop-off at any Hradec Králové address, the East Bohemia Museum, or the city centre.', anchor: true, custom: false },
              ].map((stop, i, arr) => (
                <div key={stop.city} className="flex gap-6">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />
                    {i < arr.length - 1 && <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />}
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
                  { label: 'Twin cities', value: 'Pardubice is adjacent. PRESTIGO can cover both cities in a single booking — just request at booking.' },
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
              Your chauffeur meets you in front of your pickup address — a hotel in Old Town, a residence in Vinohrady, or the arrivals hall at Václav Havel Airport with a Prestigo tablet displaying your name. Not a parking lot across the street, not a meeting point requiring a ten-minute walk with luggage.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for ninety minutes of work or rest, the chauffeur will read that signal and let you be. If you want context on Hradec Králové — the royal city of the dowager queens of Bohemia, the modernist replanning by Kotěra and Gočár that earned the Salon of the Republic nickname, the military history tied to the Czech Armed Forces headquarters, the rhythm of a Czech university town during term — your chauffeur knows it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you need a different cabin temperature, say so. If you would like a short coffee stop at the Sedlice rest stop on the D11, that is included in the fare.
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
            Why book with Prestigo<br /><span className="display-italic">for Prague to Hradec Králové.</span>
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
          <h2 className="display text-[28px] md:text-[34px] mb-12">Common questions</h2>
          <div className="flex flex-col gap-0">
            {faqs.map((faq, i) => (<Reveal key={faq.q} variant="up" delay={i * 70}><div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}><h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3><p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p></div></Reveal>))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Related routes */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">Related Routes</p>
          <h2 className="display text-[26px] md:text-[32px] mb-6">
            Continue across<br /><span className="display-italic">Bohemia and beyond.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Hradec Králové sits at the heart of East Bohemia. Many clients pair it with Pardubice, extend north to Liberec, or continue southeast toward Brno. Every Prestigo route shares the same fixed-fare model, the same fleet, and the same chauffeurs.
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
            <h2 className="display text-[28px] md:text-[36px]">Prague to Hradec Králové.<br /><span className="display-italic">From €{ePrice}, fixed.</span></h2>
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
