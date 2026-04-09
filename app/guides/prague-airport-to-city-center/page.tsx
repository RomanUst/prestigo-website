import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

// AI-search-optimised travel guide. Target queries: "Prague airport to city
// centre", "how to get from PRG to old town", "Prague airport to hotel".
// Comprehensive resource covering every realistic option with honest costs
// and times, ending with a PRESTIGO CTA.

const DESCRIPTION = 'How to get from Prague Airport (PRG) to the city centre in 2026: every option compared — taxi, bus, metro, private chauffeur — with cost, time and logistics.'

export const metadata: Metadata = {
  title: 'Prague Airport to City Centre — Every Option Compared (2026 Guide)',
  description: DESCRIPTION,
  alternates: { canonical: '/guides/prague-airport-to-city-center' },
  openGraph: {
    url: 'https://rideprestigo.com/guides/prague-airport-to-city-center',
    title: 'Prague Airport to City Centre — Every Option Compared (2026 Guide)',
    description: DESCRIPTION,
  },
}

const options = [
  {
    name: 'Private chauffeur',
    cost: '€49 fixed (E-Class), €69 (V-Class up to 6 pax)',
    time: '25–35 min door-to-door',
    pros: [
      'Chauffeur waits inside Arrivals with name board',
      'Live flight tracking — no charge if you land late',
      'Door-to-door to exact address, no taxi-to-hotel relay',
      'Luggage handled, child seats free, Wi-Fi in car',
      'Fixed price, no surge, 24/7 availability',
    ],
    cons: [
      'Highest nominal cost for solo travellers on a budget',
      'Requires advance booking (though same-day works up to 2 hours before)',
    ],
    bestFor: 'Executive travellers, families, groups with luggage, late arrivals, anyone who wants to bypass the airport taxi rank',
  },
  {
    name: 'Regulated airport taxi (Fix Taxi / AAA Taxi)',
    cost: '€20–€35 to central Prague',
    time: '30–45 min (plus 5–15 min rank wait)',
    pros: [
      'Available immediately at the official rank',
      'Capped regulated fares to central Prague zones',
      'Paper receipt / card payment accepted',
      'No advance booking required',
    ],
    cons: [
      'Variable vehicle quality (typically Škoda Octavia)',
      'English not guaranteed',
      'No meet-and-greet inside Arrivals',
      'Queue can be long at peak hours',
      'Luggage loaded by passenger',
    ],
    bestFor: 'Solo travellers on a budget with basic Czech or English, arriving during off-peak hours with light luggage',
  },
  {
    name: 'Ride-hail (Uber / Bolt / Liftago)',
    cost: '€18–€45 depending on surge',
    time: '30–50 min (plus 5–15 min pickup zone walk + wait)',
    pros: [
      'Typically slightly cheaper than regulated taxis during off-peak',
      'App-based booking and payment',
      'English-speaking drivers more common',
      'Track the ride live',
    ],
    cons: [
      'Surge pricing during rush hour and late-night (can double the fare)',
      'Dedicated pickup zone is a 5–10 min walk from Arrivals',
      'No meet-and-greet inside Arrivals',
      'Driver cancellations more common than regulated taxis',
    ],
    bestFor: 'Cost-conscious travellers comfortable with app-based bookings, arriving at off-peak times',
  },
  {
    name: 'Airport Express bus (AE)',
    cost: '100 CZK (~€4) one-way',
    time: '35–45 min to Praha hl.n.',
    pros: [
      'Cheapest airport-to-city option',
      'Direct to Prague main train station',
      'Runs every 30 min from ~05:30 to ~22:00',
      'No driver tip expectations, fixed fare',
    ],
    cons: [
      'Terminates at Praha hl.n. only — still need a taxi/metro to reach your hotel',
      'No service after ~22:00',
      'Limited luggage storage during peak periods',
      'Not suitable for families with small children or heavy luggage',
    ],
    bestFor: 'Solo travellers on tight budgets, staying within walking distance of Praha hl.n., travelling during daytime hours',
  },
  {
    name: 'Public bus + metro (119 + Line A)',
    cost: '40 CZK (~€1.60) — single 90-min ticket',
    time: '45–60 min to city centre',
    pros: [
      'Cheapest option in absolute terms',
      'Frequent service (every 5–15 min, 24/7 via night bus 910)',
      'One ticket covers bus + metro + tram transfers',
    ],
    cons: [
      'Two changes typical: bus 119 → metro A at Nádraží Veleslavín → final stop',
      'Luggage unfriendly — no dedicated storage, crowded at peak hours',
      'Navigation requires confidence with Czech signage',
      'Night bus (910) takes 70+ minutes with multiple stops',
    ],
    bestFor: 'Budget travellers with minimal luggage, staying near a metro A station, comfortable navigating foreign transit',
  },
]

const faqs = [
  {
    q: 'How long does it take to get from Prague Airport to the city centre?',
    a: 'The honest answer depends on your mode of transport, the time of day, and your exact destination in Prague. A private chauffeur covers the 20 km from Václav Havel Airport (PRG) to central Prague in 25 to 35 minutes door-to-door during off-peak hours, 35 to 50 minutes at rush hour (07:30–09:30 and 16:00–18:30 on weekdays). A regulated taxi adds 5 to 15 minutes of rank queue time at the airport before the same drive. The Airport Express bus takes 35 to 45 minutes to Praha hl.n. (plus waiting time at the rank), but you then still need a taxi, metro, or tram to your actual hotel. Public transport (bus 119 + metro A) takes 45 to 60 minutes and involves at least one change — longer during rush hour or with heavy luggage. Budget travellers: assume an hour door-to-door. Executive travellers: assume 30 minutes.',
  },
  {
    q: 'What is the cheapest way from Prague Airport to the city centre?',
    a: 'Public transport is by far the cheapest at 40 CZK (~€1.60) for a single 90-minute ticket that covers bus 119 from the airport to the Nádraží Veleslavín metro station, then metro line A into central Prague. The ticket is sold at kiosks in the airport terminal, at machines at the bus stop, or through the PID Lítačka app on your phone. The Airport Express bus (AE) is the next cheapest at 100 CZK (~€4) and runs directly to Praha hl.n. without changes, making it significantly easier to navigate with luggage. Ride-hail apps typically come in at €18–€30 during off-peak hours. A regulated taxi is €20–€35. A private chauffeur is €49 fixed. The cheapest option is only practical if you travel light, speak some English or Czech, and have a destination near a metro A station.',
  },
  {
    q: 'Is it safe to take a taxi from Prague Airport?',
    a: 'Yes — as long as you use the official regulated taxi rank inside Terminal 1 or Terminal 2. Only Fix Taxi and AAA Taxi are authorised to work the rank, and both publish capped zone-based fares to central Prague (currently €20–€35 depending on destination). These operators are regulated, licensed, and reliable. The historic problem at Václav Havel Airport has been unofficial "taxis" — touts approaching arriving travellers outside the official rank offering rides at inflated prices, sometimes five or ten times the fair fare. This has been an issue for years and still happens occasionally. The rule is simple: ignore anyone offering you a ride inside or outside the terminal. Walk directly to the official rank (clearly signposted from Arrivals), or to the Uber / Bolt / Liftago pickup zone, or book a private chauffeur in advance. Any of these three options is completely safe.',
  },
  {
    q: 'Which terminal does my airline use at Prague Airport?',
    a: 'Václav Havel Airport Prague has two passenger terminals connected by a short walkway. Terminal 2 handles all Schengen flights — arrivals and departures from EU/EEA countries and Switzerland — which for most international travellers from Vienna, Berlin, Munich, Paris, Amsterdam, Brussels, Madrid, Rome, or within the Schengen zone means you arrive at Terminal 2. Terminal 1 handles all non-Schengen flights, including arrivals and departures from the UK, US, Canada, Ireland, Turkey, Dubai, and any other non-Schengen destination. Both terminals have taxi ranks, ride-hail pickup zones, and public transport stops immediately outside Arrivals. PRESTIGO chauffeurs meet passengers inside either terminal depending on your flight — just tell us your flight number at booking and the driver positions themselves at the correct gate before you land.',
  },
  {
    q: 'Can I use a Prague public transport ticket on the airport bus?',
    a: 'Yes — standard Prague Integrated Transport (PID) tickets are valid on bus 119, bus 100, and the Airport Express bus (AE) that connect Václav Havel Airport to the city. A single 90-minute ticket costs 40 CZK (~€1.60) and is valid on bus, metro, tram, and suburban rail with unlimited transfers for 90 minutes from validation. A 24-hour ticket is 120 CZK (~€4.80) and includes all unlimited rides for a full day — the better option if you plan to use public transport at all during your visit. Tickets are sold at PID ticket machines at the airport bus stop, from kiosks in the terminal, and through the PID Lítačka mobile app. The one exception is the Airport Express (AE) for which a separate 100 CZK ticket was historically required — as of 2026 this has been integrated into the standard PID system, but check the current signage at the bus stop to confirm.',
  },
  {
    q: 'Is Prague Airport walkable from the city centre, or can I bike?',
    a: 'No and no — at least not as a realistic option. Václav Havel Airport is 20 kilometres west-northwest of central Prague, connected by the R7 ring road and surrounded by industrial and airfield land. Walking would take roughly 5–6 hours and is not legal along most of the route. Cycling is theoretically possible on parallel roads but not advised — there is no dedicated cycle infrastructure from the airport, the road surface is mixed quality, and arriving at the airport with a bike requires somewhere safe to leave it for the trip (there are no secure bike storage facilities at PRG as of 2026). If you are a hardcore cyclist tourist, the logical approach is to arrive in Prague by train or by a cycling-friendly airline that takes bikes, not to start at the airport. For normal travellers: take a taxi, private chauffeur, bus, or metro.',
  },
]

const pageSchemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/guides/prague-airport-to-city-center#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://rideprestigo.com/guides/prague-airport-to-city-center' },
        { '@type': 'ListItem', position: 3, name: 'Prague Airport to City Centre', item: 'https://rideprestigo.com/guides/prague-airport-to-city-center' },
      ],
    },
    {
      '@type': 'Article',
      '@id': 'https://rideprestigo.com/guides/prague-airport-to-city-center#article',
      headline: 'Prague Airport to City Centre — Every Option Compared (2026 Guide)',
      description: DESCRIPTION,
      about: { '@type': 'Place', name: 'Václav Havel Airport Prague' },
      publisher: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      url: 'https://rideprestigo.com/guides/prague-airport-to-city-center',
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://rideprestigo.com/guides/prague-airport-to-city-center#faq',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}

export default function GuidePragueAirportPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemaGraph) }} />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Travel guide · Updated 2026</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px]">
            Prague Airport<br />
            <span className="display-italic">to the city centre.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Václav Havel Airport (PRG) sits 20 km northwest of central Prague. There are five realistic ways
            to cover the gap — private chauffeur, taxi, ride-hail, airport express bus, or public transport.
            This guide is the honest comparison with real 2026 prices, times, and the caveats the airport
            info desks do not mention.
          </p>
        </div>
      </section>

      {/* Quick answer card */}
      <section className="bg-anthracite-mid py-14 md:py-16 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Quick answer</p>
          <span className="copper-line mb-6 block" />
          <p className="body-text text-[14px] mb-4" style={{ lineHeight: '1.9' }}>
            The airport is 20 km from central Prague. Driving time is 25–35 min off-peak, 35–50 min at rush hour.
          </p>
          <ul className="flex flex-col gap-3 mt-6">
            {[
              ['Fastest door-to-door', 'Private chauffeur, 25–35 min, €49 fixed'],
              ['Cheapest', 'Bus 119 + Metro A, ~€1.60, 45–60 min with changes'],
              ['Best balance of cost and ease', 'Airport Express bus to Praha hl.n., ~€4, 35–45 min'],
              ['Best for families / groups / VIP', 'Private chauffeur, meet & greet inside Arrivals'],
            ].map(([label, val]) => (
              <li key={label} className="flex items-start gap-4">
                <span className="mt-[8px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <div>
                  <p className="font-body font-medium text-[11px] tracking-[0.1em] uppercase text-offwhite mb-1">{label}</p>
                  <p className="body-text text-[13px]" style={{ lineHeight: '1.85' }}>{val}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* All five options */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14">All five options, compared honestly</h2>
          <div className="flex flex-col gap-10">
            {options.map((opt, i) => (
              <div key={opt.name} className={`py-10 ${i < options.length - 1 ? 'border-b border-anthracite-light' : ''}`}>
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between mb-6 gap-3">
                  <h3 className="display text-[24px] md:text-[28px]">{opt.name}</h3>
                  <div className="flex gap-6 text-[11px] font-body font-light tracking-[0.1em] uppercase">
                    <span style={{ color: 'var(--copper-light)' }}>{opt.cost}</span>
                    <span className="text-warmgrey">{opt.time}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                  <div>
                    <p className="font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite mb-3">What works</p>
                    <ul className="flex flex-col gap-2">
                      {opt.pros.map((p) => (
                        <li key={p} className="flex items-start gap-3">
                          <span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                          <span className="font-body font-light text-[12px] text-warmgrey" style={{ lineHeight: '1.8' }}>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite mb-3">What to watch</p>
                    <ul className="flex flex-col gap-2">
                      {opt.cons.map((c) => (
                        <li key={c} className="flex items-start gap-3">
                          <span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--warmgrey)' }} />
                          <span className="font-body font-light text-[12px] text-warmgrey" style={{ lineHeight: '1.8' }}>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="font-body font-light text-[11px] mt-6 pt-4 border-t border-anthracite-light text-warmgrey" style={{ lineHeight: '1.8' }}>
                  <strong className="text-offwhite">Best for:</strong> {opt.bestFor}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-12">Frequently asked questions</h2>
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

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h2 className="display text-[28px] md:text-[36px]">
              Skip the airport taxi rank.<br />
              <span className="display-italic">€49 fixed, meet &amp; greet inside.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">Flight tracking included. Free waiting on delays. 24/7.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/services/airport-transfer" className="btn-primary">Airport transfer details</a>
            <a href="/book" className="btn-ghost">Book your transfer</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
