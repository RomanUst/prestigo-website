import type { Metadata } from 'next'

export const revalidate = 120

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { ROUTES } from '@/lib/routes'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'
import { getAllRoutes } from '@/lib/route-prices'
import { ROUTE_FALLBACK } from '@/lib/price-fallbacks'

export async function generateMetadata(): Promise<Metadata> {
  const routes = await getAllRoutes('display_order')
  const vienna = routes.find((r) => r.slug === 'prague-vienna')
  const berlin = routes.find((r) => r.slug === 'prague-berlin')
  const munich = routes.find((r) => r.slug === 'prague-munich')
  const budapest = routes.find((r) => r.slug === 'prague-budapest')
  const viennaPrice = vienna?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const berlinPrice = berlin?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const munichPrice = munich?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const budapestPrice = budapest?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const description = `Private chauffeur from Prague to 30 Central European destinations. Vienna from €${viennaPrice}, Berlin from €${berlinPrice}, Munich from €${munichPrice}, Budapest from €${budapestPrice}. Fixed price, door-to-door.`
  return {
    title: 'Prague Private Chauffeur — 30 Intercity Routes',
    description,
    alternates: {
      canonical: '/routes',
      languages: {
        en: 'https://rideprestigo.com/routes',
        'x-default': 'https://rideprestigo.com/routes',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/routes',
      title: 'Prague Private Chauffeur — 30 Intercity Routes',
      description,
      images: [{ url: 'https://rideprestigo.com/hero-intercity-routes.png', width: 1200, height: 630 }],
    },
  }
}

// Route data is sourced from lib/routes.ts — single source of truth for the
// 30 indexed intercity routes. See that file to add/remove/reorder routes.

const faqs = [
  {
    q: 'Can I stop en route between Prague and my destination?',
    a: 'Yes — stops are included at no extra cost on every intercity route and can be added at booking or requested on the day directly with the chauffeur. Typical stops include a lunch break at a roadside restaurant, a scenic viewpoint, or a secondary city on the way (Brno between Prague and Vienna, Dresden between Prague and Berlin, Bratislava between Prague and Budapest). Waiting time at each stop is included up to 30 minutes; beyond that we bill at a clear hourly waiting rate agreed in advance. If you need a longer stop — for example, a three-hour visit to Karlovy Vary on the way to Munich — book it as a multi-stop itinerary and we quote a single fixed fare for the whole journey. For corporate clients we can build recurring multi-stop itineraries into the account so your travellers can select them with one click.',
  },
  {
    q: 'What if my plans change after I book?',
    a: 'Cancellations are free up to two hours before the scheduled pickup time — no questions asked, refund processed to the original payment method within one business day. Changes to pickup time, pickup or drop-off address, vehicle class, or passenger name are free at any time, including on the day of travel: just call dispatch on +420 725 986 855 or message us on WhatsApp. For intercity routes booked more than 48 hours in advance, you can postpone the trip to any future date without penalty, and the original payment carries over. For last-minute cancellations inside the two-hour window we charge a minimum fee of 50 % to cover the driver&rsquo;s dispatched position, except when the cancellation is due to a flight cancellation — in which case the booking is cancelled at no charge and we help rebook for your next scheduled arrival.',
  },
  {
    q: 'Can I book a return journey from the destination back to Prague?',
    a: 'Yes — return bookings are available on every route and receive a 10 % discount on the return leg when both legs are booked together. The discount applies automatically at checkout when you select a return date and time. Same-day returns (for example, a morning drive from Prague to Dresden and an evening return) are the most common use case and work particularly well for day trips to Karlovy Vary, Kutná Hora, Dresden, or Vienna. Multi-day returns work equally well for business trips — book both legs now and the same vehicle (or at least the same class) is dispatched for each. For flight-connected returns — a transfer to Vienna, a flight elsewhere, and a pickup back in Vienna days later — the return is tracked against your flight number exactly like an airport pickup.',
  },
  {
    q: 'What vehicle will I travel in and can I upgrade?',
    a: 'You choose the vehicle class at booking. The Mercedes E-Class is our business sedan: up to 3 passengers, 3 large suitcases plus cabin bags, leather interior, onboard Wi-Fi, and the baseline price for every route. The S-Class is our executive sedan with the same capacity but rear massage seats, executive legroom, and ambient lighting — priced roughly 50 % higher than the E-Class on any given route. The V-Class is our six-passenger van, priced between E-Class and S-Class, and is the right choice whenever you have more than three passengers, six or more pieces of luggage, or want a more comfortable group experience. Upgrades after booking are possible subject to availability: contact dispatch and we confirm within minutes. Every vehicle is 2022 model year or newer.',
  },
  {
    q: 'Are tolls, vignettes, and fuel included in the quoted price?',
    a: 'Yes — every cost associated with the journey is included in the fixed quoted fare. That covers fuel, the Czech dálniční známka (motorway vignette), the Austrian and Slovak vignettes where relevant, every German motorway toll, every bridge or tunnel charge, and any urban congestion fee along the route. It also covers the driver&rsquo;s time on the full journey plus the included waiting allowance at your pickup and drop-off addresses. There is nothing added at the end of the trip: no service charge, no fuel surcharge, no border surcharge, no late-night surcharge, no weekend premium. The only thing that can change the total after booking is if you add a stop, extend a waiting period, or request an additional service (for example, a second drop-off in a different city) — and in those cases the adjusted quote is always confirmed with you before the change happens.',
  },
  {
    q: 'How far in advance should I book an intercity route?',
    a: 'We recommend booking at least 24 hours in advance for peace of mind, and 48–72 hours for major destinations (Vienna, Berlin, Munich, Budapest) during peak travel periods (Easter, Christmas markets, major trade fairs, Formula 1 weekends). That said, PRESTIGO accepts same-day bookings on every route up to two hours before pickup, subject to driver availability, and for corporate accounts we guarantee same-day availability with priority dispatch. Last-minute bookings inside the two-hour window are best handled by phone on +420 725 986 855 — dispatch can often find a car when the online system suggests no availability. For complex multi-stop itineraries, weekend or holiday travel, or V-Class bookings during peak season we do recommend booking at least 72 hours out to guarantee your exact preferred vehicle and driver.',
  },
]

const routesBreadcrumbSchema = {
  '@type': 'BreadcrumbList',
  '@id': 'https://rideprestigo.com/routes#breadcrumb',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
  ],
}

const routesFaqSchema = {
  '@type': 'FAQPage',
  '@id': 'https://rideprestigo.com/routes#faq',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@graph': [routesBreadcrumbSchema, routesFaqSchema],
}

export default async function RoutesPage() {
  const dbRoutes = await getAllRoutes('display_order')
  const top10 = dbRoutes.slice(0, 10)

  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-intercity-routes.png" alt="PRESTIGO intercity routes — private chauffeur Central Europe" fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Intercity Routes</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Central Europe,<br />
            <span className="display-italic">door to door.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Prague is the centre of Central Europe. Vienna, Berlin, Munich, Budapest — all within a day&rsquo;s drive. PRESTIGO chauffeurs cover 30 routes with fixed pricing, premium vehicles, and zero surprises.
          </p>
        </div>
      </section>

      <Divider />

      {/* Top 10 routes — DB-driven pricing */}
      {top10.length > 0 && (
        <>
          <section className="bg-anthracite py-16 md:py-20">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <Reveal variant="up"><div className="mb-10">
                <p className="label mb-4">Most popular routes</p>
                <span className="copper-line mb-6 block" />
                <h2 className="display text-[28px] md:text-[36px]">Top routes from Prague,<br /><span className="display-italic">live pricing.</span></h2>
              </div></Reveal>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {top10.map((r, i) => (
                  <Reveal key={r.slug} variant="up" delay={i * 60}>
                    <a href={`/routes/${r.slug}`} className="border border-anthracite-light p-6 flex flex-col gap-4 hover:border-[var(--copper)] transition-colors group">
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--copper)' }}>Prague → {r.toLabel}</p>
                        <p className="font-display font-light text-[20px] text-offwhite">{r.toLabel}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="font-body font-light text-[10px] text-warmgrey tracking-[0.05em]">E-Class from</span>
                          <span className="font-body font-light text-[13px]" style={{ color: 'var(--copper-light)' }}>€{r.eClassEur}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-body font-light text-[10px] text-warmgrey tracking-[0.05em]">V-Class from</span>
                          <span className="font-body font-light text-[11px] text-offwhite">€{r.vClassEur}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-body font-light text-[10px] text-warmgrey tracking-[0.05em]">S-Class from</span>
                          <span className="font-body font-light text-[11px] text-offwhite">€{r.sClassEur}</span>
                        </div>
                      </div>
                      <p className="font-body font-light text-[10px] tracking-[0.1em] uppercase mt-auto" style={{ color: 'var(--copper)' }}>
                        View route →
                      </p>
                    </a>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
          <Divider />
        </>
      )}

      {/* Planning intercity travel */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-10 md:gap-16">
          <Reveal variant="up" className="md:col-span-2"><div>
            <p className="label mb-6">Planning intercity travel</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">Why a private transfer <span className="display-italic">beats the train.</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150} className="md:col-span-3"><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Intercity rail in Central Europe is excellent — but it stops at the station, not at your hotel door. For most of our clients, the hidden cost of a Prague&ndash;Vienna or Prague&ndash;Berlin trip isn&rsquo;t the ticket. It&rsquo;s the two taxis on either side, the hour spent dragging luggage through a terminus, the rigid departure window, and the wasted time between meetings when the schedule slips.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              A PRESTIGO private transfer replaces all of that with a single fixed-price journey. Your chauffeur collects you from your address in Prague, loads your luggage, clears the city on the fastest route of the day, and delivers you to the exact entrance of your destination — hotel, office, embassy, conference centre, airport. If you need to take a phone call the whole way, you can. If you need to sleep, you can. If you need to stop for lunch in Brno, Bratislava or Dresden, you simply tell the driver.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Every intercity route on this page is operated with the same fleet, the same vetted chauffeurs, and the same service standard as our airport transfers. Prices are quoted per vehicle, not per passenger — so two people share the same fare as one, and a V-Class with six passengers and full luggage still travels for a single fixed total.
            </p>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Route sections — grouped by country to replace 30 H2s with 7 country
          H2s and route H3s nested beneath, collapsing the H2 count from 54 to
          well under 15 across the whole page. */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col gap-16">
          {(() => {
            // Sort routes within each country by distance, then group.
            const byCountry: Record<string, typeof ROUTES> = {}
            for (const r of ROUTES) {
              if (!byCountry[r.country]) byCountry[r.country] = []
              byCountry[r.country].push(r)
            }
            // Country display order: CZ first, then international by shortest
            // available route distance.
            const order = Object.keys(byCountry).sort((a, b) => {
              if (a === 'Czech Republic') return -1
              if (b === 'Czech Republic') return 1
              const minA = Math.min(...byCountry[a].map((x) => x.distanceKm))
              const minB = Math.min(...byCountry[b].map((x) => x.distanceKm))
              return minA - minB
            })
            return order.map((country) => {
              const routes = byCountry[country].slice().sort((a, b) => a.distanceKm - b.distanceKm)
              const countryId = country.toLowerCase().replace(/\s+/g, '-')
              return (
                <div key={country} className="flex flex-col">
                  {/* Country H2 */}
                  <Reveal variant="up"><div className="mb-10" id={`routes-${countryId}`}>
                    <p className="label mb-4">Destination country</p>
                    <span className="copper-line mb-6 block" />
                    <h2 className="display text-[32px] md:text-[44px]">
                      {country}<span className="display-italic"> — {routes.length} {routes.length === 1 ? 'route' : 'routes'} from Prague</span>
                    </h2>
                    <p className="body-text text-[13px] mt-4 max-w-2xl" style={{ lineHeight: '1.9' }}>
                      {routes.length === 1
                        ? `One private chauffeur route from Prague into ${country}.`
                        : `${routes.length} private chauffeur routes from Prague into ${country}, sorted by distance.`}
                      {' '}Every route is a single fixed fare, door-to-door, with flight tracking on the return leg where applicable.
                    </p>
                  </div></Reveal>
                  <div className="flex flex-col gap-0">
          {routes.map((r, i) => {
            const hasImage = Boolean(r.image)
            const cardContent = (
              <>
                <div>
                  <p className="label mb-4">{r.from} → {r.city}</p>
                  <h3 className="display text-[26px] md:text-[32px] mb-4">{r.h2}</h3>
                  <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{r.description}</p>
                </div>
                <div className="flex flex-col justify-between gap-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-6">
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Distance</p>
                        <p className="font-body font-light text-[13px] text-offwhite">{r.distance}</p>
                      </div>
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Duration</p>
                        <p className="font-body font-light text-[13px] text-offwhite">{r.duration}</p>
                      </div>
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Price</p>
                        <p className="font-body font-light text-[13px]" style={{ color: 'var(--copper-light)' }}>{r.priceFrom}</p>
                      </div>
                    </div>
                    {r.notes.length > 0 && (
                      <ul className="flex flex-col gap-2 mt-2">
                        {r.notes.map((n) => (
                          <li key={n} className="flex items-start gap-3">
                            <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                            <span className="font-body font-light text-[12px] text-warmgrey">{n}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a href="/book" className="btn-primary self-start" style={{ padding: '10px 24px', fontSize: '9px' }}>
                      Book Prague → {r.city}
                    </a>
                    <a href={`/routes/${r.slug}`} className="btn-ghost self-start" style={{ padding: '10px 24px', fontSize: '9px' }}>
                      Route Details
                    </a>
                  </div>
                </div>
              </>
            )
            if (hasImage && r.image) {
              return (
                <Reveal key={r.slug} variant="up" delay={i * 80}>
                <div
                  className={`relative overflow-hidden border-b border-anthracite-light -mx-6 md:-mx-12 ${i === 0 ? 'border-t' : ''}`}
                  style={{
                    backgroundImage: `url(${r.image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    minHeight: '460px',
                  }}
                >
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(28,28,30,0.92) 30%, rgba(28,28,30,0.55) 100%)' }} />
                  <div className="relative z-10 py-14 md:py-16 px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
                    {cardContent}
                  </div>
                </div>
                </Reveal>
              )
            }
            return (
              <Reveal key={r.slug} variant="up" delay={i * 80}>
              <div
                className={`py-14 md:py-16 border-b border-anthracite-light grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 ${i === 0 ? 'border-t' : ''}`}
              >
                {cardContent}
              </div>
              </Reveal>
            )
          })}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </section>

      <Divider />

      {/* How it works */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[36px] mb-14">How it works</h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { step: '01', title: 'Book', body: 'Select your route and vehicle. Fixed price confirmed instantly.' },
              { step: '02', title: 'Travel', body: 'Your chauffeur collects you at the agreed time and location.' },
              { step: '03', title: 'Arrive', body: 'Door-to-door delivery. No transfers, no terminals, no waiting.' },
            ].map((s, i) => (
              <Reveal key={s.step} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Border crossings, tolls, paperwork */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><div className="mb-14">
            <p className="label mb-6">Borders, tolls &amp; paperwork</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">Crossing borders<br /><span className="display-italic">without the friction.</span></h2>
          </div></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                title: 'Schengen as standard',
                body: 'Every route we operate is within the Schengen area — Czechia, Austria, Germany, Slovakia, Hungary, Poland. There is no passport control at the border and no document inspection during the journey. Non-EU passport holders should still carry their passport, as occasional spot checks do happen during major events.',
              },
              {
                title: 'All tolls and vignettes included',
                body: 'The fixed price on each route covers every motorway toll, tunnel fee, Austrian and Slovak vignette, Czech dálniční známka, and city congestion charge along the way. There are no surcharges for fuel, waiting at the border, or driver overtime.',
              },
              {
                title: 'Documentation for corporate travel',
                body: 'For corporate and diplomatic clients we can prepare a detailed trip confirmation in advance, including vehicle plate, driver name and licence number, insurance reference, and estimated route — useful for security teams, embassies, and venues with advance-notification requirements.',
              },
            ].map((item, i) => (
              <Reveal key={item.title} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8">
                <span className="copper-line mb-5 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{item.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.body}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Luggage, pets, child seats */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up"><div>
            <p className="label mb-6">Luggage, pets &amp; children</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">Travel with everything <span className="display-italic">you need.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Intercity transfers usually mean more luggage than a city run — ski bags, golf clubs, sample cases, presentation materials, or the full suitcase complement of a family relocating between capitals. Every PRESTIGO class is matched to a realistic luggage load, and when in doubt we upgrade you at the same price rather than squeeze a trip.
            </p>
          </div></Reveal>
          <Reveal variant="up" delay={150}><ul className="flex flex-col gap-4">
            {[
              { t: 'E-Class luggage', b: '2 large suitcases + 2 cabin bags.' },
              { t: 'S-Class luggage', b: '2 large suitcases + 2 cabin bags. Same capacity, with executive rear legroom and massage seats.' },
              { t: 'V-Class luggage', b: 'Up to 6 large suitcases and 6 cabin bags with all seats occupied — effectively unlimited for 2 or 3 passengers.' },
              { t: 'Pets welcome', b: 'Small pets travel free in a carrier; larger dogs accepted by arrangement in the V-Class. Please note at booking.' },
              { t: 'Child &amp; booster seats', b: 'EU-certified infant, toddler and booster seats available at no charge. Just confirm age and weight when you book.' },
              { t: 'Oversized items', b: 'Skis, golf bags, bicycles (partially dismantled) and musical instruments carried on request — V-Class is almost always the right answer.' },
            ].map((item) => (
              <li key={item.t} className="flex items-start gap-4 py-3 border-b border-anthracite-light last:border-0">
                <span className="mt-[8px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <div>
                  <p className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-1" dangerouslySetInnerHTML={{ __html: item.t }} />
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }} dangerouslySetInnerHTML={{ __html: item.b }} />
                </div>
              </li>
            ))}
          </ul></Reveal>
        </div>
      </section>

      <Divider />

      {/* Long-distance / red routes — noindex, quote on request */}
      <section className="bg-anthracite-mid py-14 md:py-16">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Long-distance transfers</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[24px] md:text-[30px] mb-4">
            Quote on <span className="display-italic">request.</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            The following destinations are priced individually based on route, timing, and overnight requirements. Expect a written quote within 2 hours.
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {[
              { label: 'Erfurt', href: '/routes/prague-to-erfurt' },
              { label: 'Frankfurt', href: '/routes/prague-to-frankfurt' },
              { label: 'Augsburg', href: '/routes/prague-to-augsburg' },
              { label: 'Stuttgart', href: '/routes/prague-to-stuttgart' },
              { label: 'Cologne', href: '/routes/prague-to-cologne' },
              { label: 'Düsseldorf', href: '/routes/prague-to-dusseldorf' },
              { label: 'Hamburg', href: '/routes/prague-to-hamburg' },
              { label: 'Innsbruck', href: '/routes/prague-to-innsbruck' },
              { label: 'Košice', href: '/routes/prague-to-kosice' },
              { label: 'Basel', href: '/routes/prague-to-basel' },
              { label: 'Zürich', href: '/routes/prague-to-zurich' },
              { label: 'Bern', href: '/routes/prague-to-bern' },
              { label: 'Geneva', href: '/routes/prague-to-geneva' },
              { label: 'Venice', href: '/routes/prague-to-venice' },
              { label: 'Verona', href: '/routes/prague-to-verona' },
              { label: 'Milan', href: '/routes/prague-to-milan' },
              { label: 'Strasbourg', href: '/routes/prague-to-strasbourg' },
              { label: 'Paris', href: '/routes/prague-to-paris' },
              { label: 'Brussels', href: '/routes/prague-to-brussels' },
              { label: 'Amsterdam', href: '/routes/prague-to-amsterdam' },
            ].map((r) => (
              <li key={r.href}>
                <a
                  href={r.href}
                  className="flex items-center justify-between border border-anthracite-light px-4 py-3 hover:border-copper/40 transition-colors group"
                >
                  <span className="font-body font-light text-[12px] text-warmgrey group-hover:text-offwhite transition-colors">Prague → {r.label}</span>
                  <span className="font-body text-[10px]" style={{ color: 'var(--copper)' }}>→</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Divider />

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[34px] mb-12">Common questions</h2></Reveal>
          <div className="flex flex-col gap-0">
            {faqs.map((faq, i) => (
              <Reveal key={faq.q} variant="up" delay={i * 60}><div
                className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
              >
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite-mid py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up"><div>
            <h2 className="display text-[28px] md:text-[36px]">
              Not seeing your destination?<br />
              <span className="display-italic">We go anywhere.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">PRESTIGO covers all destinations across Central Europe.</p>
          </div></Reveal>
          <Reveal variant="fade" delay={100}><div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book a Route</a>
            <a href="/contact" className="btn-ghost">Request Custom Route</a>
          </div></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
