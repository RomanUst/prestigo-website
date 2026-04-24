import type { Metadata } from 'next'

export const revalidate = 120

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'
import { getRoutePrice } from '@/lib/route-prices'
import { buildRouteJsonLd } from '@/lib/jsonld'
import { ROUTE_FALLBACK } from '@/lib/price-fallbacks'

export async function generateMetadata(): Promise<Metadata> {
  const route = await getRoutePrice('prague-wroclaw')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  return {
    title: `Prague to Wrocław Private Transfer — From €${ePrice}`,
    description: `Book a private chauffeur from Prague to Wrocław. 285 km door-to-door in a Mercedes-Benz. Fixed price from €${ePrice}, Poland's city of dwarfs.`,
    alternates: {
      canonical: '/routes/prague-wroclaw',
      languages: {
        en: 'https://rideprestigo.com/routes/prague-wroclaw',
        'x-default': 'https://rideprestigo.com/routes/prague-wroclaw',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/routes/prague-wroclaw',
      title: `Prague to Wrocław Private Transfer — From €${ePrice}`,
      description: `Book a private chauffeur from Prague to Wrocław. 285 km door-to-door in a Mercedes-Benz. Fixed price from €${ePrice}, Poland's city of dwarfs.`,
      images: [{ url: "https://rideprestigo.com/hero-intercity-routes.png", width: 1200, height: 630 }],
    },
  }
}

const inclusions = [
  'A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.',
  'A professional chauffeur — fluent English and Czech. Polish on request.',
  'Fuel, Czech motorway vignette, and Polish expressway tolls. Nothing is charged on top.',
  'Door-to-door service — pickup and drop-off at the exact address you specify, not a parking lot.',
  'Bottled water, phone charger, and WiFi in the rear cabin.',
  'Waiting time at pickup — 15 minutes free at any address.',
  'Child seats on request — rear-facing infant, forward-facing toddler, or booster. No additional charge.',
  'Same-day return — 10% off the return leg if booked together, or add hourly city rental (see pricing).',
]

const faqs = [
  { q: 'How long does a private transfer from Prague to Wrocław take?', a: 'Approximately 3 hours door-to-door via the D11 motorway north to Hradec Králové, then Highway 33 northeast to the Czech–Polish border at Náchod/Kudowa-Zdrój, then the Polish DK8 and S8 expressways into Wrocław. Traffic around Prague during rush hour can add 15–20 minutes.' },
  { q: 'How much does a chauffeur from Prague to Wrocław cost?', a: 'Please see current prices on this page — fares are loaded from our live pricing database. The price covers fuel, Czech vignette, Polish tolls, and driver time. No hidden charges.' },
  { q: 'Can I book a same-day round trip from Prague to Wrocław?', a: 'Yes, and it is the standard pattern on this route. A return on the same day receives a 10% discount. If you need the chauffeur to move around with you during the visit, add hourly city rental (see pricing). Most clients book a 10–12 hour round trip to cover the Rynek, the Racławice Panorama, and lunch near Ostrów Tumski.' },
  { q: 'Do you cross the Czech–Polish border without problems?', a: 'Both countries are inside the Schengen Area. The crossing at Náchod/Kudowa-Zdrój is invisible — no routine checks, no passport control. All Prestigo vehicles carry the Czech vignette and pre-paid Polish tolls, and the chauffeur holds an international chauffeur licence recognised across the EU.' },
  { q: 'Is a child seat available?', a: 'Yes. Rear-facing infant seats, forward-facing toddler seats, and booster seats are available at no extra cost. Please specify your child\'s age at booking so the correct seat is installed before pickup.' },
  { q: 'Can the chauffeur speak Polish?', a: 'A Polish-speaking chauffeur is available on request — useful for business meetings in Wrocław or for clients who prefer to be greeted in Polish. Every Prestigo chauffeur speaks fluent English and Czech as standard.' },
]

const whyBook = [
  {
    title: 'Fixed fare, no surprises',
    body: 'The price you see is the price you pay. Fuel, Czech vignette, Polish tolls, driver time. Nothing added at drop-off.',
  },
  {
    title: 'Owned fleet, vetted chauffeurs',
    body: 'Prestigo operates its own Mercedes fleet. Every vehicle under three years old. Every chauffeur background-checked, bilingual, trained for international travel.',
  },
  {
    title: 'Anticipatory service',
    body: 'If the Náchod border crossing has weekend congestion, your chauffeur uses the Bogatynia or Cieszyn alternative. For Polish-language meetings, a Polish-speaking chauffeur is available on request.',
  },
]

const relatedRoutes = [
  { slug: 'prague-hradec-kralove', city: 'Hradec Králové', distance: '115 km', duration: '1h 15min' },
  { slug: 'prague-liberec', city: 'Liberec', distance: '110 km', duration: '1h 20min' },
  { slug: 'prague-krakow', city: 'Kraków', distance: '535 km', duration: '5h 30min' },
  { slug: 'prague-warsaw', city: 'Warsaw', distance: '680 km', duration: '6h 45min' },
]

export default async function PragueWroclawPage() {
  const route = await getRoutePrice('prague-wroclaw')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const sPrice = route?.sClassEur ?? ROUTE_FALLBACK.sClassEur
  const vPrice = route?.vClassEur ?? ROUTE_FALLBACK.vClassEur

  const highlights = [
    { label: 'Distance', value: '~285 km' },
    { label: 'Duration', value: '~3 hours' },
    { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
    { label: 'Price from', value: `€${ePrice}`, copper: true },
  ]

  const vehicles = [
    { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '2 bags', price: `From €${ePrice}`, photo: '/e-class-photo.png' },
    { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '2 bags', price: `From €${sPrice}`, photo: '/s-class-photo.png' },
    { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: `From €${vPrice}`, photo: '/v-class-photo.png' },
  ]

  const pageSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      ...(route ? buildRouteJsonLd(route, 'prague-wroclaw')['@graph'] : []),
      {
        '@type': 'FAQPage',
        '@id': 'https://rideprestigo.com/routes/prague-wroclaw#faq',
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://rideprestigo.com/routes/prague-wroclaw#breadcrumb',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
          { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
          { '@type': 'ListItem', position: 3, name: 'Prague to Wrocław', item: 'https://rideprestigo.com/routes/prague-wroclaw' },
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
        <div className="absolute inset-0"><Image src="/photohero.png" alt="Wrocław" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Wrocław</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">Prague to Wrocław,<br /><span className="display-italic">Lower Silesia direct.</span></h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>285 km northeast to Poland&apos;s city of dwarfs and one of Central Europe&apos;s most vibrant market squares. Three hours, one fixed price, door to door across the border.</p>
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
            A private transfer from Prague to Wrocław covers 285 km and takes approximately 3 hours door to door. Fixed fare starts at €{ePrice} in a Mercedes E-Class for up to 3 passengers; groups of up to 6 travel in the V-Class from €{vPrice}; the S-Class is available from €{sPrice} for executive or VIP travel. Every booking includes the driver&apos;s time, fuel, Czech motorway vignette, bottled water, onboard Wi-Fi, phone charger, and child seats on request at no extra cost. Nothing is added at drop-off. The fare is agreed before departure and does not change regardless of traffic or waiting time at your destination. Stops en route — Liberec or Jelenia Góra — are available at the fixed fare when arranged at booking. Your chauffeur monitors traffic before every departure and reroutes without asking if there is a delay.
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
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Wrocław<br /><span className="display-italic">in three hours.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              From a Prague pickup in Old Town, Vinohrady, Malá Strana, or the airport, your chauffeur takes the D11 motorway north toward Hradec Králové, then joins Highway 33 northeast through the Czech foothills to the border at Náchod and Kudowa-Zdrój. The Czech–Polish Schengen crossing is invisible — no stops, no document checks. Once inside Poland, the road becomes the DK8 and then the S8 expressway, dropping into Wrocław from the south-west.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Total distance is approximately 285 kilometres. Driving time is three hours in normal conditions. Add 15–20 minutes on Friday afternoons leaving Prague. On weekends with heavy Polish border traffic, your chauffeur can reroute via Liberec and the Bogatynia crossing — a slightly longer drive through the Jizera Mountains but a cleaner run into Lower Silesia.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Wrocław itself is worth the drive. The Rynek is one of the largest medieval market squares in Europe. The bronze Wrocław dwarves — roughly six hundred of them — began as a single protest figurine in the 1980s and now turn every walk into a hunt. Cathedral Island (Ostrów Tumski), the Centennial Hall with its pioneering reinforced-concrete dome listed by UNESCO, and the immense Racławice Panorama in its purpose-built rotunda complete the short list. Your chauffeur watches traffic on the D11 before every departure. You are not paying for traffic; you are paying for time.
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
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>The fixed price covers everything from Prague pickup to Wrocław drop-off. The car, the chauffeur, the fuel, the Czech vignette, the Polish tolls. Business meeting in Lower Silesia, cultural weekend on the Rynek, or a Silesian family visit — your driver handles the route while you focus on the destination.</p>
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
            <h2 className="display text-[28px] md:text-[38px] mb-6">Prague to Wrocław,<br /><span className="display-italic">the route.</span></h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Czech-Polish border', note: 'Schengen crossing at Náchod/Kudowa-Zdrój — no delays for EU citizens. Your driver coordinates the crossing.', anchor: false, custom: false },
                { city: 'Anywhere you like', note: 'A stop in Kudowa-Zdrój spa town or anywhere along the way. Your route, your pace.', anchor: false, custom: true },
                { city: 'Wrocław', note: 'Drop-off at any Wrocław address, the Rynek market square, or your hotel.', anchor: true, custom: false },
              ].map((stop, i, arr) => (<div key={stop.city} className="flex gap-6"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />{i < arr.length - 1 && <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />}</div><div className="pb-6"><p className="font-body font-light text-[11px] tracking-[0.15em] uppercase mb-1" style={{ color: stop.custom ? 'var(--copper-pale)' : 'var(--offwhite)' }}>{stop.city}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{stop.note}</p></div></div>))}
            </div>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-6 justify-start pt-[60px]">
            <div className="border border-anthracite-light p-8">
              <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--copper)' }}>Good to know</p>
              <div className="flex flex-col gap-5">
                {[
                  { label: 'Border crossing', value: 'Czech-Polish Schengen border at Náchod/Kudowa-Zdrój. No passport check for EU citizens.' },
                  { label: 'Tolls', value: 'Czech motorway vignette included. Polish expressway tolls included in the quoted price.' },
                  { label: 'Return transfer', value: 'Book both directions together for a reduced rate.' },
                  { label: 'Onward routing', value: 'Wrocław connects to Kraków and Warsaw. PRESTIGO can extend your journey onward from Wrocław.' },
                ].map((item) => (<div key={item.label}><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{item.label}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{item.value}</p></div>))}
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
              Your chauffeur will meet you in front of your pickup address in central Prague — not in a parking lot across the street, not at an airport meeting point a ten-minute walk away. If you are flying into Václav Havel Airport, they are inside the arrivals hall with a Prestigo tablet displaying your name, and the luggage goes into the boot before you reach the car.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Conversation is a choice. If you want a quiet cabin for three hours of work or rest, the chauffeur will read that signal and let you be. If you want context on Wrocław — the Lower Silesian capital that was German Breslau until 1945, the population exchange that refilled the city with Polish families from Lwów, the university tradition, the Orange Alternative movement that birthed the krasnale dwarf tradition in the 1980s and turned it into a cultural landmark, or the 2016 European Capital of Culture year — your chauffeur knows it.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Phone charger, bottled water, and WiFi are already in the cabin. If you forgot a European adapter, ask. If you need a specific temperature in the rear cabin, say so. A real rest stop near Hradec Králové on the D11 or on the Polish S8 after the border is included whenever you want one.
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
            Why book with Prestigo<br /><span className="display-italic">for Prague to Wrocław.</span>
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
            Wrocław is the gateway between Prague and the rest of Poland. Many clients combine the Wrocław run with Kraków, Warsaw, or a Czech stop on the way. Every Prestigo route has the same fixed-fare model, the same fleet, and the same chauffeurs.
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
          <Reveal variant="up"><div><h2 className="display text-[28px] md:text-[36px]">Prague to Wrocław.<br /><span className="display-italic">From €{ePrice}, fixed.</span></h2><p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p></div></Reveal>
          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">Book Now</a><a href="/routes" className="btn-ghost">All Routes</a></div></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
