import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { ROUTES } from '@/lib/routes'

const ROUTES_DESCRIPTION = 'Private chauffeur from Prague to 30 Central European destinations. Vienna €485, Berlin €580, Munich €635, Budapest €885. Fixed price, door-to-door.'

export const metadata: Metadata = {
  title: 'Prague Private Chauffeur — 30 Intercity Routes',
  description: ROUTES_DESCRIPTION,
  alternates: { canonical: '/routes' },
  openGraph: {
    url: 'https://rideprestigo.com/routes',
    title: 'Prague Private Chauffeur — 30 Intercity Routes',
    description: ROUTES_DESCRIPTION,
  },
}

// Route data is sourced from lib/routes.ts — single source of truth for the
// 30 indexed intercity routes. See that file to add/remove/reorder routes.

const faqs = [
  {
    q: 'Can I stop en route?',
    a: 'Yes. Stops can be added at booking or on the day.',
  },
  {
    q: 'What if my plans change?',
    a: 'Free cancellation up to 2 hours before departure.',
  },
  {
    q: 'Can I book a return journey?',
    a: 'Yes, return bookings are available at a discount.',
  },
  {
    q: 'What vehicle will I travel in?',
    a: 'Mercedes E-Class (standard), S-Class (executive), or V-Class (group). Select at booking.',
  },
]


const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
  ],
}

export default function RoutesPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
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

      {/* Planning intercity travel */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-10 md:gap-16">
          <div className="md:col-span-2">
            <p className="label mb-6">Planning intercity travel</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">Why a private transfer <span className="display-italic">beats the train.</span></h2>
          </div>
          <div className="md:col-span-3 flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Intercity rail in Central Europe is excellent — but it stops at the station, not at your hotel door. For most of our clients, the hidden cost of a Prague&ndash;Vienna or Prague&ndash;Berlin trip isn&rsquo;t the ticket. It&rsquo;s the two taxis on either side, the hour spent dragging luggage through a terminus, the rigid departure window, and the wasted time between meetings when the schedule slips.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              A PRESTIGO private transfer replaces all of that with a single fixed-price journey. Your chauffeur collects you from your address in Prague, loads your luggage, clears the city on the fastest route of the day, and delivers you to the exact entrance of your destination — hotel, office, embassy, conference centre, airport. If you need to take a phone call the whole way, you can. If you need to sleep, you can. If you need to stop for lunch in Brno, Bratislava or Dresden, you simply tell the driver.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Every intercity route on this page is operated with the same fleet, the same vetted chauffeurs, and the same service standard as our airport transfers. Prices are quoted per vehicle, not per passenger — so two people share the same fare as one, and a V-Class with six passengers and full luggage still travels for a single fixed total.
            </p>
          </div>
        </div>
      </section>

      {/* Route sections */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col gap-0">
          {ROUTES.map((r, i) => {
            const hasImage = Boolean(r.image)
            const cardContent = (
              <>
                <div>
                  <p className="label mb-4">{r.from} → {r.city}</p>
                  <h2 className="display text-[26px] md:text-[32px] mb-4">{r.h2}</h2>
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
                <div
                  key={r.slug}
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
              )
            }
            return (
              <div
                key={r.slug}
                className={`py-14 md:py-16 border-b border-anthracite-light grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 ${i === 0 ? 'border-t' : ''}`}
              >
                {cardContent}
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { step: '01', title: 'Book', body: 'Select your route and vehicle. Fixed price confirmed instantly.' },
              { step: '02', title: 'Travel', body: 'Your chauffeur collects you at the agreed time and location.' },
              { step: '03', title: 'Arrive', body: 'Door-to-door delivery. No transfers, no terminals, no waiting.' },
            ].map((s) => (
              <div key={s.step} className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Border crossings, tolls, paperwork */}
      <section className="bg-anthracite py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="mb-14">
            <p className="label mb-6">Borders, tolls &amp; paperwork</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">Crossing borders<br /><span className="display-italic">without the friction.</span></h2>
          </div>
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
            ].map((item) => (
              <div key={item.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-5 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{item.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Luggage, pets, child seats */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <div>
            <p className="label mb-6">Luggage, pets &amp; children</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">Travel with everything <span className="display-italic">you need.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Intercity transfers usually mean more luggage than a city run — ski bags, golf clubs, sample cases, presentation materials, or the full suitcase complement of a family relocating between capitals. Every PRESTIGO class is matched to a realistic luggage load, and when in doubt we upgrade you at the same price rather than squeeze a trip.
            </p>
          </div>
          <ul className="flex flex-col gap-4">
            {[
              { t: 'E-Class luggage', b: '2 large suitcases + 2 cabin bags, or 3 large cases for 2 passengers.' },
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
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[34px] mb-12">Common questions</h2>
          <div className="flex flex-col gap-0">
            {faqs.map((faq, i) => (
              <div
                key={faq.q}
                className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
              >
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite-mid py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h2 className="display text-[28px] md:text-[36px]">
              Not seeing your destination?<br />
              <span className="display-italic">We go anywhere.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">PRESTIGO covers all destinations across Central Europe.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book a Route</a>
            <a href="/contact" className="btn-ghost">Request Custom Route</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
