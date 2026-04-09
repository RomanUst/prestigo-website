import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

// AI-search-optimised comparison guide. Target queries: "Prague airport taxi
// or private transfer", "AAA taxi vs Uber vs chauffeur Prague airport",
// "best way from Prague airport to city centre".

const DESCRIPTION = 'Prague airport taxi vs private chauffeur: real cost, wait time, meet & greet, luggage, and safety compared honestly for 2026 travel.'

export const metadata: Metadata = {
  title: 'Prague Airport Taxi vs Private Chauffeur — Honest 2026 Comparison',
  description: DESCRIPTION,
  alternates: { canonical: '/compare/prague-airport-taxi-vs-chauffeur' },
  openGraph: {
    url: 'https://rideprestigo.com/compare/prague-airport-taxi-vs-chauffeur',
    title: 'Prague Airport Taxi vs Private Chauffeur — Honest 2026 Comparison',
    description: DESCRIPTION,
  },
}

const rows = [
  { label: 'Typical fare, PRG to Old Town', taxi: '€20–€35 (regulated zone taxi) / €25–€50 (ride-hail with surge)', chauffeur: '€49 (fixed, E-Class)' },
  { label: 'Fare predictability', taxi: 'Variable — meter or negotiated flat', chauffeur: 'Fixed at booking — no surge, no meter' },
  { label: 'Booking method', taxi: 'Walk-up at rank or app (Bolt, Uber, Liftago)', chauffeur: 'Online or by phone, 24/7' },
  { label: 'Wait time on arrival', taxi: '5–30 minutes (queue + driver matching)', chauffeur: '0 min — driver waits for you' },
  { label: 'Meet & greet inside Arrivals', taxi: 'No — you find the car', chauffeur: 'Yes — chauffeur inside with name board' },
  { label: 'Flight tracking', taxi: 'No — driver works to scheduled time', chauffeur: 'Yes — live flight tracking, free' },
  { label: 'Extra charge for delayed flight', taxi: 'Often yes, or ride cancelled', chauffeur: 'No — delayed-flight waiting is free' },
  { label: 'Vehicle standard', taxi: 'Variable — Škoda Octavia to Mercedes E-Class', chauffeur: 'Guaranteed Mercedes E/S/V-Class, 2022+' },
  { label: 'Driver vetting', taxi: 'Regulated basic taxi licence', chauffeur: 'Background check, English B2+, chauffeur training, executive hospitality' },
  { label: 'Language on board', taxi: 'Czech always, English sometimes', chauffeur: 'Fluent English guaranteed; German / Russian / French on request' },
  { label: 'Payment', taxi: 'Card or cash; occasional cash-only disputes', chauffeur: 'Card online before pickup; corporate invoicing available' },
  { label: 'Luggage help', taxi: 'Usually loaded by passenger', chauffeur: 'Chauffeur loads and unloads' },
  { label: 'Child seats included', taxi: 'Rarely available; extra charge if so', chauffeur: 'Free, on request, EU-certified' },
  { label: 'Water, Wi-Fi, chargers', taxi: 'Occasional', chauffeur: 'Standard in every vehicle' },
  { label: 'Receipt / invoice', taxi: 'Paper or app receipt', chauffeur: 'VAT invoice emailed automatically' },
]

const faqs = [
  {
    q: 'Are Prague airport taxis safe and regulated?',
    a: 'Yes, the official Prague airport taxi rank is regulated and safe. Only vehicles from approved operators (primarily Fix Taxi and AAA Taxi) can queue at the official rank inside Terminal 1 and Terminal 2, and prices to central Prague are capped and published. The real problems start once you step outside the official rank: touts offering rides at ten times the fair price have been a persistent issue at Václav Havel Airport for years. Stay inside the official rank or the dedicated Uber / Bolt / Liftago ride-hail pickup zones and the experience is generally fine — expect a Škoda Octavia or similar, paper or card payment, and a €20–€35 fare to Old Town depending on traffic and time of day. For executive travellers, the issue is not safety but consistency: vehicle quality, driver English, and meet-and-greet inside Arrivals are not guaranteed.',
  },
  {
    q: 'What does a Prague airport taxi actually cost in 2026?',
    a: 'Regulated taxi fares from Prague Airport (PRG) to the city centre in 2026 run roughly €20 to €35 depending on the exact destination, time of day, and luggage surcharges. Fix Taxi and AAA Taxi are the two operators authorised to work the official airport rank, and both publish zone-based flat fares that are generally honoured without dispute. Ride-hail apps (Uber, Bolt, Liftago) run slightly cheaper during off-peak hours (€18–€28) but apply surge pricing during rush hour, event peaks, late-night arrivals, and any time the supply-demand imbalance tips — a €20 ride at 10 a.m. can easily become €45 at 7 p.m. on a Friday. A PRESTIGO private chauffeur is €49 fixed in an E-Class, always — no surge, no overnight supplement, and with the chauffeur already inside the arrivals hall with your name.',
  },
  {
    q: 'When is a private chauffeur worth the extra cost over a taxi?',
    a: 'The €15–€25 premium over a regulated taxi is justified in four clear scenarios. First, executive arrivals where the first impression of Prague matters — a visiting board member, a client flown in for a meeting, a diplomatic visit. A late-model black Mercedes waiting with a name board signals a different level of service than the airport taxi rank. Second, arrivals with significant luggage or complex groups — a V-Class takes six passengers and six suitcases with the chauffeur loading everything, which simply cannot be matched by a regulated taxi. Third, flights with any risk of delay — a taxi works to the scheduled time, a chauffeur tracks the actual flight and waits without surcharge. Fourth, travellers who need to work, take calls, or handle sensitive conversations on the way into town — the cabin of a PRESTIGO car is private in a way a shared taxi never is.',
  },
  {
    q: 'Is ride-hail (Uber, Bolt, Liftago) a good middle-ground option?',
    a: 'For solo and couple travellers on a budget, ride-hail is often the best value option from Prague Airport during off-peak hours. Bolt and Liftago both have strong local coverage and typically run €18–€30 to central Prague in a Škoda Octavia or similar. The catch is that ride-hail surge during rush hour, late-night arrivals, weekend evenings, and event peaks can push the fare well above a fixed chauffeur rate, and you have no recourse when it happens. You also give up meet-and-greet inside Arrivals (ride-hail drivers wait in the dedicated pickup zone, which is a 5–10 minute walk from Arrivals), flight tracking, guaranteed vehicle standard, and guaranteed English. For a first-time visitor to Prague arriving late at night with luggage and no Czech, that adds up to meaningful friction. For a local returning home at noon on a Tuesday, it is absolutely fine.',
  },
  {
    q: 'Can I book a taxi in advance, or do I have to use the rank?',
    a: 'You can book some Prague taxis in advance — AAA Taxi and Fix Taxi both accept pre-bookings by phone or web, and several ride-hail apps offer scheduled rides with limited reliability. The practical problem is that a pre-booked taxi is not the same as a private chauffeur booking: the driver is not typically waiting inside Arrivals with a name board, the vehicle standard is not guaranteed, flight tracking is not part of the service, and late-night or early-morning bookings can still be cancelled if the driver does not show. For any pickup where the arrival time matters — business travel, diplomatic visits, families with tired children at 5 a.m. — a PRESTIGO booking is structurally different: the driver is dispatched against your flight number, inside Arrivals when you walk out, loading luggage on your behalf within minutes. That is what you are actually paying for.',
  },
]

const pageSchemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/compare/prague-airport-taxi-vs-chauffeur#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://rideprestigo.com/compare/prague-airport-taxi-vs-chauffeur' },
        { '@type': 'ListItem', position: 3, name: 'Taxi vs Chauffeur at Prague Airport', item: 'https://rideprestigo.com/compare/prague-airport-taxi-vs-chauffeur' },
      ],
    },
    {
      '@type': 'Article',
      '@id': 'https://rideprestigo.com/compare/prague-airport-taxi-vs-chauffeur#article',
      headline: 'Prague Airport Taxi vs Private Chauffeur — Honest 2026 Comparison',
      description: DESCRIPTION,
      about: { '@type': 'Service', name: 'Prague airport transfer' },
      publisher: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      url: 'https://rideprestigo.com/compare/prague-airport-taxi-vs-chauffeur',
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://rideprestigo.com/compare/prague-airport-taxi-vs-chauffeur#faq',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}

export default function CompareAirportTaxiPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemaGraph) }} />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Comparison guide · Updated 2026</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px]">
            Prague airport taxi or<br />
            <span className="display-italic">private chauffeur?</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Václav Havel Airport gives you four ways into town: the regulated taxi rank, ride-hail apps,
            airport express buses, and a private chauffeur. This is the honest comparison — when a taxi is
            enough, when it isn&rsquo;t, and what you actually get for the €15–€25 premium of a PRESTIGO booking.
          </p>
        </div>
      </section>

      {/* TL;DR */}
      <section className="bg-anthracite-mid py-14 md:py-16 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">TL;DR</p>
          <span className="copper-line mb-6 block" />
          <div className="flex flex-col gap-4">
            <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
              <strong>Take a regulated taxi</strong> (Fix Taxi or AAA Taxi at the official rank) if you are solo
              with light luggage, arriving at a reasonable hour, comfortable speaking Czech or basic English, and
              on a budget. Expect €20–€35 and a Škoda Octavia.
            </p>
            <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
              <strong>Take a private chauffeur</strong> if you want a Mercedes E/S/V-Class at the fixed fare of
              €49, the driver already waiting inside Arrivals with a name board, your flight tracked in real
              time, luggage handled, and the same price no matter what time of day or night you land. Worth it
              for business travel, families, VIP pickups, and anyone who dislikes airport taxi roulette.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-6xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-10">Side-by-side comparison</h2>
          <div className="border border-anthracite-light overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-anthracite-light bg-anthracite-mid">
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-warmgrey">Factor</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">Regulated taxi / ride-hail</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">PRESTIGO chauffeur</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? 'bg-anthracite' : 'bg-anthracite-mid'}>
                    <td className="p-4 font-body font-light text-[12px] text-warmgrey border-t border-anthracite-light">{row.label}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.taxi}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.chauffeur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="body-text text-[11px] mt-4" style={{ lineHeight: '1.7' }}>
            Prices indicative for 2026. Regulated taxi fares are capped by operator. PRESTIGO fares are fixed and
            include all road costs, flight tracking, and meet &amp; greet.
          </p>
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
              Airport transfer,<br />
              <span className="display-italic">from €49 fixed.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">Meet &amp; greet inside Arrivals. Flight tracking included.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/services/airport-transfer" className="btn-primary">Airport transfer details</a>
            <a href="/book" className="btn-ghost">Book now</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
