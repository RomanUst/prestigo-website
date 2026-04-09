import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

// AI-search-optimised comparison guide. Target queries: "Prague to Vienna
// train or private transfer", "Prague Vienna RailJet vs car", "best way to
// get from Prague to Vienna". Answers the commercial intent directly with
// numeric claims, then points at the bookable route page.

const DESCRIPTION = 'Private chauffeur vs ÖBB RailJet from Prague to Vienna: real-world cost, time, luggage, and door-to-door comparison for 2026 travel.'

export const metadata: Metadata = {
  title: 'Prague to Vienna: Private Transfer vs Train (2026 Comparison)',
  description: DESCRIPTION,
  alternates: { canonical: '/compare/prague-vienna-transfer-vs-train' },
  openGraph: {
    url: 'https://rideprestigo.com/compare/prague-vienna-transfer-vs-train',
    title: 'Prague to Vienna: Private Transfer vs Train (2026 Comparison)',
    description: DESCRIPTION,
  },
}

const rows: Array<{ label: string; transfer: string; train: string }> = [
  { label: 'Door-to-door time', transfer: '~3h 15min door-to-door', train: '~5h 30min door-to-door (incl. taxis to/from station)' },
  { label: 'Scheduled journey time', transfer: '~3h 15min driving', train: '~4h 00min on the RailJet itself' },
  { label: 'Base cost, 1 passenger', transfer: '€485 (fixed, E-Class)', train: '~€30–€89 (Sparschiene to flex fare)' },
  { label: 'Base cost, 4 passengers', transfer: '€485 (same fixed fare)', train: '~€120–€356 (4× individual fares)' },
  { label: 'Base cost, 6 passengers + luggage', transfer: '€560 (V-Class, fixed)', train: '~€180–€534 (6× individual fares)' },
  { label: 'Luggage allowance', transfer: 'Unlimited — E-Class 3 large cases, V-Class 6 large cases', train: 'Hand luggage + 1 suitcase per passenger, no fixed limit but no dedicated storage' },
  { label: 'Pickup location', transfer: 'Your Prague address — hotel, apartment, office, airport', train: 'Praha hl.n. only (plus a taxi to reach the station)' },
  { label: 'Drop-off location', transfer: 'Your Vienna address — hotel, apartment, meeting venue, airport', train: 'Wien Hbf only (plus a taxi to reach your final address)' },
  { label: 'Stops en route', transfer: 'Add Brno, Bratislava or anywhere else on request — included', train: 'Fixed stops only (Pardubice, Brno, Břeclav)' },
  { label: 'Flight tracking', transfer: 'Included on return leg from Vienna Airport', train: 'Not applicable' },
  { label: 'Wi-Fi, chargers, bottled water', transfer: 'Included in every vehicle', train: 'Wi-Fi on most RailJets, chargers at seats, no complimentary drinks' },
  { label: 'Privacy', transfer: 'Private cabin — take calls, work, sleep', train: 'Shared carriage (1st class quieter but still shared)' },
  { label: 'Booking lead time', transfer: 'Same-day up to 2 hours before pickup', train: 'Cheapest fares require 14–60 days advance booking' },
  { label: 'Change / cancel flexibility', transfer: 'Free changes and cancellation up to 1–2 hours before pickup', train: 'Sparschiene (cheapest) non-refundable; flex fares change-friendly but 2–3× the price' },
]

const faqs = [
  {
    q: 'Is a private transfer from Prague to Vienna really faster than the train?',
    a: 'Door-to-door, yes — a private transfer is consistently 1.5 to 2.5 hours faster than the ÖBB RailJet once you factor in the full journey. The RailJet runs the scheduled Prague–Vienna leg in about four hours, but that time only measures platform-to-platform at Praha hl.n. and Wien Hbf. Add a taxi from your Prague hotel or apartment to the main station (15–30 minutes in Prague traffic), 15 minutes of station navigation, waiting for the train, then another taxi at Wien Hbf to your actual Vienna destination (15–25 minutes in Vienna traffic), and you are at roughly 5h 15min to 5h 45min total. A private transfer collects you at your exact pickup point in Prague, drives the E65/A22 directly to your exact Vienna address, and averages 3h 15min door-to-door — including the ten-minute cross through Brno-Vyškov bottleneck during peak hours.',
  },
  {
    q: 'How does the cost compare for 1, 2, 4, and 6 passengers?',
    a: 'The private transfer is priced per vehicle, not per passenger, so the break-even against the train depends on group size. For a single traveller, RailJet Sparschiene fares starting at €29 are unbeatable on pure cost — the private transfer at €485 only wins on time, privacy, and door-to-door convenience. For two travellers the train is still cheaper (€58–€178 vs €485). For four travellers the maths starts to balance: €120–€356 for RailJet vs €485 for a single E-Class, with the transfer offering lower cost per person on flex fares. For six travellers with luggage the V-Class at €560 is consistently cheaper than six individual RailJet fares at flex pricing, and delivers the group together to one Vienna address instead of scattering taxis from Wien Hbf.',
  },
  {
    q: 'Can I take a lot of luggage on a private transfer that would not fit on the train?',
    a: 'Yes — this is one of the clearest practical wins for a private transfer. A Mercedes E-Class takes 3 large suitcases plus 2 cabin bags in the 540-litre boot; an S-Class is identical. A V-Class carries 6 large suitcases plus 6 cabin bags in its 1,410-litre cargo area even with all six seats occupied. Oversized items — ski bags, golf clubs, sample cases, musical instruments, partially dismantled bicycles — travel in the V-Class without question. The RailJet has no fixed luggage limit but also has no dedicated storage beyond small overhead racks and a few large-item shelves near the carriage doors. On a crowded Friday or Sunday service you will often find the luggage area full before boarding, leaving you to wrestle oversized cases into your seat area. Multiply that by a family of four and the train becomes difficult.',
  },
  {
    q: 'When does the train make more sense than a private transfer?',
    a: 'The RailJet is the right choice in three clear scenarios. First, solo and couple travel with modest luggage, booked well in advance on Sparschiene fares: €29–€58 per person is hard to beat on cost alone, and the train is comfortable and reliable. Second, travellers who actively want to be on a train — working for four hours in first class with a meal from the on-board bistro is a genuinely pleasant way to cross Central Europe. Third, travellers whose Prague and Vienna destinations are both within walking distance of the main stations: Praha hl.n. is central, Wien Hbf is well-connected, and for some hotels the transfer advantage disappears. For everyone else — families, business travellers on a schedule, groups, heavy luggage, last-minute bookings, or anyone whose destination is not in the city centre — the private transfer wins.',
  },
  {
    q: 'What about return journeys and multi-day trips?',
    a: 'Return journeys work on both modes but with different economics. The RailJet return is simply another individual booking at the same fare model. The private transfer offers a 10 % discount on the return leg when both directions are booked together, and you can lock in specific pickup times at both ends (useful if the return connects to a flight departure from Vienna Airport or a specific meeting in Prague). For multi-day trips where you need ground transport inside Vienna between your arrival and departure, a private transfer can be extended as a multi-day hire: your chauffeur and vehicle are dedicated for the full stay, available for city transfers, dinner pickups, and the final run to the airport. For same-day round trips (Prague → Vienna meeting → Prague the same night) the private transfer is almost always faster and simpler.',
  },
]

const pageSchemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/compare/prague-vienna-transfer-vs-train#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://rideprestigo.com/compare/prague-vienna-transfer-vs-train' },
        { '@type': 'ListItem', position: 3, name: 'Prague to Vienna: Transfer vs Train', item: 'https://rideprestigo.com/compare/prague-vienna-transfer-vs-train' },
      ],
    },
    {
      '@type': 'Article',
      '@id': 'https://rideprestigo.com/compare/prague-vienna-transfer-vs-train#article',
      headline: 'Prague to Vienna: Private Transfer vs Train (2026 Comparison)',
      description: DESCRIPTION,
      about: { '@type': 'Service', name: 'Prague to Vienna private chauffeur transfer' },
      publisher: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      url: 'https://rideprestigo.com/compare/prague-vienna-transfer-vs-train',
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://rideprestigo.com/compare/prague-vienna-transfer-vs-train#faq',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}

export default function ComparePragueViennaPage() {
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
            Prague to Vienna:<br />
            <span className="display-italic">private transfer or train?</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Both options work. One is usually the right call. This comparison is built on real 2026 pricing and
            timings for the ÖBB RailJet between Praha hl.n. and Wien Hbf, and the E65/A22 route we drive
            ourselves at PRESTIGO. No marketing claims — just the numbers, side by side.
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
              <strong>Take the train</strong> if you are travelling solo or as a couple, booked more than two weeks
              in advance on a Sparschiene fare, with light luggage, and your hotel is within walking distance of
              Praha hl.n. and Wien Hbf. You will pay €30–€90 per person and arrive in about 5.5 hours door-to-door.
            </p>
            <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
              <strong>Take a private transfer</strong> if you are travelling as a family or group, with luggage,
              from a non-central Prague address, to a non-central Vienna address, on short notice, on a schedule,
              or with work to do in private on the way. You will pay €485 for the whole car and arrive in about
              3.25 hours door-to-door.
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
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">PRESTIGO private transfer</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">ÖBB RailJet train</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? 'bg-anthracite' : 'bg-anthracite-mid'}>
                    <td className="p-4 font-body font-light text-[12px] text-warmgrey border-t border-anthracite-light">{row.label}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.transfer}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.train}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="body-text text-[11px] mt-4" style={{ lineHeight: '1.7' }}>
            Prices indicative for 2026. RailJet fares vary with booking window, direction, and day of week.
            Private transfer fare is fixed and includes all tolls, fuel, vignettes, and driver time.
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
              Ready for the transfer?<br />
              <span className="display-italic">From €485, fixed.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">Door to door in 3.25 hours. Flight tracking on the return.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/routes/prague-vienna" className="btn-primary">See the Vienna route</a>
            <a href="/book" className="btn-ghost">Book now</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
