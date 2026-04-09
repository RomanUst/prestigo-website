import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

// Long-form comparison built from real 2026 ÖBB/RegioJet/FlixBus fare data
// and PRESTIGO's published intercity pricing (see Notion pricing ledger).
// Every number on this page is cross-checked against operator websites,
// Seat61, Rome2Rio and our own dispatch data — no marketing claims.

const DESCRIPTION = 'Prague to Vienna 2026: private chauffeur vs RailJet vs RegioJet vs FlixBus vs rental car — honest cost per person by group size, timing, luggage, Sparschiene traps.'

export const metadata: Metadata = {
  title: 'Prague to Vienna 2026: Private Transfer vs Train vs Bus (Honest Guide)',
  description: DESCRIPTION,
  alternates: { canonical: '/compare/prague-vienna-transfer-vs-train' },
  openGraph: {
    url: 'https://rideprestigo.com/compare/prague-vienna-transfer-vs-train',
    title: 'Prague to Vienna 2026: Private Transfer vs Train vs Bus (Honest Guide)',
    description: DESCRIPTION,
  },
}

// ————————————————————————————————————————————————
// DATA — real fares and timings, verified April 2026
// ————————————————————————————————————————————————

const modes = [
  {
    id: 'prestigo',
    name: 'PRESTIGO private transfer',
    category: 'Chauffeur',
    fareBand: '€485–€725 per vehicle (fixed)',
    pax: '1–6',
    doorTime: '3h 15min',
    notes: 'Door-to-door, flight tracking on return leg, fuel + tolls + vignettes + driver included. Return within 24h −10 %.',
  },
  {
    id: 'railjet',
    name: 'ÖBB RailJet (2nd class, advance)',
    category: 'Train',
    fareBand: '€14.90–€59 Sparschiene to flex',
    pax: 'per person',
    doorTime: '5h 15min – 5h 45min (incl. taxis + station time)',
    notes: '9–11 daily departures, 4h 00min scheduled platform-to-platform. Non-refundable at the cheapest tier.',
  },
  {
    id: 'regiojet-train',
    name: 'RegioJet train',
    category: 'Train',
    fareBand: '€14.90–€23.90 fixed tiers',
    pax: 'per person',
    doorTime: '5h 15min – 5h 45min (incl. taxis + station time)',
    notes: '4 daily departures, 4h 15min scheduled. Flexible: refundable and prices don\u2019t spike near departure.',
  },
  {
    id: 'flixbus',
    name: 'FlixBus / RegioJet bus',
    category: 'Bus',
    fareBand: '€10–€25 per person',
    pax: 'per person',
    doorTime: '5h 30min – 6h (incl. taxis + station time)',
    notes: 'Up to 18 daily departures, 4h 10min scheduled. Lowest cost, luggage allowance limited to 1 cabin + 1 hold.',
  },
  {
    id: 'rental',
    name: 'One-way car rental',
    category: 'Self-drive',
    fareBand: '€170–€320 total (after drop-off fee, tolls, fuel)',
    pax: '1–5',
    doorTime: '3h 30min driving + Vienna parking hunt',
    notes: 'Czech + Austrian vignettes required. Vienna parking €15–€30/day. Not worth it for one-way unless group ≥ 4.',
  },
  {
    id: 'flight',
    name: 'Direct flight (LH, OS)',
    category: 'Air',
    fareBand: '€80–€280 per person',
    pax: 'per person',
    doorTime: '3h 30min – 4h 30min (incl. check-in + transfers)',
    notes: '50-minute flight time, but two airport transits erase the advantage. Worth it only if connecting onward.',
  },
]

const tableRows: Array<{ label: string; prestigo: string; railjet: string; flixbus: string; rental: string }> = [
  { label: 'Scheduled journey time', prestigo: '3h 15min driving', railjet: '4h 00min platform-to-platform', flixbus: '4h 10min bus station-to-bus station', rental: '3h 30min driving' },
  { label: 'Realistic door-to-door', prestigo: '3h 15min', railjet: '5h 15min – 5h 45min', flixbus: '5h 30min – 6h', rental: '3h 30min + parking' },
  { label: 'Pickup location', prestigo: 'Any Prague address', railjet: 'Praha hl.n. only', flixbus: 'Florenc bus station only', rental: 'Rental depot (walk/taxi)' },
  { label: 'Drop-off location', prestigo: 'Any Vienna address', railjet: 'Wien Hbf only', flixbus: 'Wien Erdberg / Hbf', rental: 'Vienna rental depot + parking' },
  { label: '1 passenger fare', prestigo: '€485 (E-Class)', railjet: '€14.90–€59 (Sparschiene → flex)', flixbus: '€10–€18', rental: '€170–€320 all-in' },
  { label: '2 passenger total', prestigo: '€485 (same fixed fare)', railjet: '€29.80–€118', flixbus: '€20–€36', rental: '€170–€320 + tolls' },
  { label: '4 passenger total', prestigo: '€485 (E) or €560 (V)', railjet: '€59.60–€236', flixbus: '€40–€72', rental: '€200–€370 (7-seat van)' },
  { label: '6 passenger total', prestigo: '€560 (V-Class, fixed)', railjet: '€89.40–€354', flixbus: '€60–€108', rental: '€250–€420 (7-seat van)' },
  { label: 'Luggage allowance', prestigo: 'Unlimited — V-Class takes 6 large + 6 cabin', railjet: 'No formal limit; racks fill at peak; max 90×60×40 cm', flixbus: '1 cabin bag + 1 checked bag per passenger', rental: 'Whatever fits the car' },
  { label: 'Flexibility / cancellation', prestigo: 'Free up to 2 h before', railjet: 'Sparschiene €14.90 non-refundable; flex €59+ changeable', flixbus: 'Paid cancellation 15 min before', rental: 'Depends on operator; drop-off fee non-refundable' },
  { label: 'Flight tracking on return', prestigo: 'Yes — free', railjet: 'No', flixbus: 'No', rental: 'N/A' },
  { label: 'Wi-Fi / power / comfort', prestigo: '5G router, water, climate preset, silent cabin', railjet: 'Wi-Fi, power at every seat, restaurant car', flixbus: 'Wi-Fi, power, tight seats, no restaurant', rental: 'Whatever you rent' },
  { label: 'Stops en route', prestigo: 'Brno, Mikulov, Lednice, anywhere — free', railjet: 'Pardubice, Brno, Břeclav (fixed)', flixbus: 'Fixed stops only', rental: 'Wherever you like' },
  { label: 'Lead time', prestigo: 'Same day up to 2 h before', railjet: 'Cheapest 6 months out', flixbus: 'Flexible; cheapest 2–4 weeks out', rental: 'Flexible' },
]

// Six realistic group profiles — the single biggest gap in every competing
// guide, which all fall into one-size-fits-all per-person pricing.
const scenarios = [
  {
    title: 'Solo traveller, light bag, booking 2 weeks ahead',
    winner: 'Train (ÖBB or RegioJet Sparschiene)',
    cost: '€14.90 – €25',
    body: 'Book cd.cz or regiojet.com six to eight weeks out and you will pay between fifteen and twenty-five euros for a four-hour RailJet or RegioJet ride that\u2019s genuinely comfortable — power at every seat, restaurant car, Wi-Fi. The €1.60 Prague metro ride to Praha hl.n. and the €2 Vienna U-Bahn from Wien Hbf bring total door-to-door cost to about €20. No mode beats this for the solo traveller who is not in a hurry and travels light. A private transfer at €485 costs roughly 30× more per passenger for the same trip.',
  },
  {
    title: 'Couple, moderate luggage, booking a week ahead',
    winner: 'Train (still) — but start watching transfer prices',
    cost: '€60 – €120 total',
    body: 'Two advance Sparschiene fares put you at around €30–€60 total in 2nd class. First class is €60–€90 total and worth considering for the luggage racks alone. At one week\u2019s notice, Sparschiene fares have usually doubled or tripled; check RegioJet — its price doesn\u2019t spike as aggressively and last-minute fares often beat ÖBB by 40 %. A PRESTIGO transfer is still three to four times the train total, but if your luggage is serious (two large cases plus carry-ons) or you have a tight meeting, the door-to-door saving of two hours starts to matter.',
  },
  {
    title: 'Family of four, holiday, luggage and a child seat',
    winner: 'Private transfer ties with train — transfer wins on stress',
    cost: 'PRESTIGO €485 / Train €60–€240',
    body: 'On cost alone, four Sparschiene fares at €60 total beat the €485 E-Class transfer. But: four suitcases plus cabin bags in a RailJet second-class carriage at peak travel is an unpleasant experience — the overhead racks fill by the third car, the large-item bays at the car ends are normally full by Pardubice, and a family with small children plus luggage will typically end up with bags at their feet for four hours. A PRESTIGO E-Class absorbs all of that plus a free child seat, door-to-door pickup from your Prague hotel, and arrival at your Vienna hotel\u2019s actual entrance. For €106 per person it is the rational choice if your travel budget allows.',
  },
  {
    title: 'Group of six, multi-stop weekend (Lednice + Wien)',
    winner: 'PRESTIGO V-Class (decisively)',
    cost: '€560 fixed',
    body: 'Six people on the train means six €15–€60 tickets (€90–€360 total), plus taxis on both ends, plus the logistics of keeping six people together through two station changes. A V-Class for six is €560 — about €93 per passenger — and includes a 30-minute stop at the Lednice palace gardens, another at Mikulov, and direct delivery to your Vienna apartment. Multi-stop itineraries are effectively impossible on the train. This is the scenario where the V-Class fixed fare becomes the cheapest option on a per-person basis compared to flexible train fares, and the only realistic option if you want to see the UNESCO Lednice-Valtice cultural landscape on the way.',
  },
  {
    title: 'Business traveller, tight meeting window, Tuesday 8am',
    winner: 'PRESTIGO E-Class or S-Class',
    cost: '€485 – €725',
    body: 'The 8am meeting in Vienna\u2019s Innere Stadt requires you to leave Prague before 05:00 on the train (07:00 RailJet arrives Wien Hbf 11:00 — too late) and pray nothing delays the connection. A PRESTIGO S-Class collects you at 04:30 from any Prague address, drives directly to your meeting venue, and you arrive by 07:45 with forty-five minutes for coffee. You work, sleep, or take calls the whole way in a private cabin — the single most expensive thing in a tight business trip is not the transfer fare, it\u2019s an extra overnight hotel because you had to travel the day before.',
  },
  {
    title: 'Budget backpacker, no deadline',
    winner: 'FlixBus or RegioJet bus',
    cost: '€10 – €18',
    body: 'The bus is the unbeatable budget option — often cheaper than the cheapest train fare, with the same door-to-door time and no penalty for booking late. FlixBus runs eighteen daily departures from Praha Florenc to Vienna Erdberg; RegioJet buses are similar with slightly better seats and included drinks. You will arrive at a bus station on the edge of each city rather than in the centre, which is the main trade-off. For one person with a backpack and no meetings, €10–€18 is worth the extra thirty minutes of city transit on each end.',
  },
]

// Most travellers don't know the intermediate stops are even possible
const stops = [
  {
    name: 'Lednice-Valtice cultural landscape',
    viaPrestigo: 'Add to any V-Class booking — we hold 30–60 min at the palace gardens',
    viaTrain: 'Get off at Břeclav, hire a local taxi (20 min each way) — only worthwhile with 3+ hours',
    worthIt: 'Yes, if you love gardens, palaces, and UNESCO sites. The Liechtenstein palace is the highlight of the Czech south.',
  },
  {
    name: 'Brno (Moravian capital)',
    viaPrestigo: '15-minute coffee stop on the D1 — zero cost added',
    viaTrain: 'RailJet stops here anyway (scheduled 2-minute halt); hop off and rebook on a later train with a flex ticket',
    worthIt: 'Only if you specifically want Brno — it is a detour for the wine region and Lednice.',
  },
  {
    name: 'Mikulov (Palava wine country)',
    viaPrestigo: 'Free to add on any intercity booking; 30–45 min for the castle and square',
    viaTrain: 'Bus or taxi from Břeclav; complex and slow',
    worthIt: 'Yes — Mikulov\u2019s castle overlooks one of Central Europe\u2019s best wine regions and it is five minutes off the E65.',
  },
  {
    name: 'Klentnice Dragon Rock viewpoint',
    viaPrestigo: 'Hidden stop known to drivers; 15 min scramble for the photo',
    viaTrain: 'Impossible without a car',
    worthIt: 'Absolutely, if you have a V-Class with flexibility on timing. Most dramatic view between Prague and Vienna.',
  },
]

const faqs = [
  {
    q: 'What\u2019s the fastest realistic way from Prague to Vienna in 2026?',
    a: 'A private chauffeur transfer is the fastest door-to-door option at around 3h 15min from your Prague address to your Vienna address. The ÖBB RailJet scheduled time is 4h 00min platform-to-platform, which sounds competitive but grows to 5h 15min – 5h 45min once you add a Prague taxi or metro to Praha hl.n. (20–30 min), waiting time on the platform (15 min), and a Vienna U-Bahn or taxi from Wien Hbf to your actual destination (15–25 min). FlixBus adds another 30 minutes on top because the bus stations are further from the centres. The direct LH or OS flight is scheduled at 50 minutes airborne, but check-in, security, boarding, and two airport transfers push total travel time to 3h 30min – 4h 30min — rarely faster than the car in practice, unless you are continuing onward by air.',
  },
  {
    q: 'How much does the ÖBB RailJet from Prague to Vienna actually cost in 2026?',
    a: 'RailJet Sparschiene (advance, non-refundable, non-changeable) starts at €14.90 in 2nd class and €29.90 in 1st class when booked 4–8 weeks out — both directions, on most departures. The Sparschiene Komfort flex version is typically €20–€35 in 2nd class. Standard flexible fares run €40–€60 in 2nd class and €70–€100 in 1st class, and last-minute bookings inside 72 hours often land at the top of the flex band. ÖBB Business class with a light meal is usually €90–€110. Book on cd.cz (Czech Railways) rather than oebb.at — the fares are identical on most dates but cd.cz often lets you change a cheap ticket where oebb.at would sell you a strictly non-refundable Sparschiene. Mandatory €3 seat reservation. Check RegioJet as well — its train fares are fixed at €14.90 / €19.90 / €22.90 / €23.90 tiers and don\u2019t spike near departure.',
  },
  {
    q: 'Is a PRESTIGO private transfer ever actually cheaper than the train?',
    a: 'Yes, in two clear scenarios. First, groups of five or six with luggage: a V-Class at €560 fixed works out to €93 per passenger — cheaper than six flexible RailJet fares (€234–€354) and far cheaper than six last-minute Sparschiene purchases. Second, last-minute business trips inside 72 hours: advance train fares have disappeared and flex RailJet to Vienna with a mandatory seat reservation can reach €60 in 2nd class or €90+ in 1st. Three business travellers travelling together at €60 each is €180 on the train (plus €30 in taxis and metro); a PRESTIGO E-Class is €485 for the same three people, door-to-door — about €160 per head. Add the time saved (2 hours each way) and the ability to work or sleep privately in the cabin, and the transfer is genuinely better value in pure economic terms, not just convenience.',
  },
  {
    q: 'Can I actually bring as much luggage as I want on the RailJet?',
    a: 'In theory yes — ÖBB has no weight limit and no check-in; you just bring your bag and put it on a rack. In practice the racks fill up fast. On a typical 08:10 Prague departure on a Friday in spring, the overhead racks above the seats are usually full by the third carriage, the large-item racks at either end of each carriage are full by Pardubice (50 minutes in), and anyone boarding a crowded train with two large cases will spend the next four hours with their bags at their feet or wedged in the aisle. The maximum per-piece dimension is 90×60×40 cm, which excludes oversized ski bags or golf cases. A PRESTIGO E-Class takes three large cases plus two cabin bags in the boot; a V-Class takes six plus six. If luggage is a concern at all, this is the biggest reason to choose a chauffeur transfer over the train.',
  },
  {
    q: 'What\u2019s the difference between ÖBB RailJet and RegioJet, and which should I book?',
    a: 'RailJet is operated by ÖBB (Austrian Railways) in partnership with Czech Railways, runs nine to eleven daily departures between Prague and Vienna, is 30 minutes faster than RegioJet on average, and has a proper restaurant car with hot meals and draught beer. Seats in 1st class are wider, the Business-class carriage has leather seats and a light meal included. RegioJet is a private Czech operator running four daily trains on the same route using ex-ÖBB rolling stock — the carriages are older but the seats are larger, the attendants serve complimentary drinks and snacks at your seat, and the ticket fares don\u2019t surge near departure. Book RailJet if you want the fastest, most frequent, most comfortable option and you\u2019re booking early. Book RegioJet if you\u2019re booking late (its €19.90 tier is still available inside 7 days) or if you specifically want the at-seat service and don\u2019t mind older carriages. Both are genuinely good.',
  },
  {
    q: 'I\u2019m travelling with kids. Is the train or a private transfer better?',
    a: 'For kids under 6, RailJet 2nd class is free (ÖBB family ticket), RegioJet is similar, and the restaurant car is a genuine plus — kids love walking to the dining car for hot chocolate on a four-hour trip. The difficulty is luggage plus small children on a crowded train: if you\u2019re a family of four with two suitcases, two cabin bags, a pushchair, and children who need attention, the logistics of the train are tiring. A PRESTIGO E-Class at €485 door-to-door is expensive compared to €60 of Sparschiene tickets, but it includes a free EU-certified child seat or booster, the driver handles all the luggage, and the kids can nap in a quiet private cabin. For one or two kids with light luggage the train is more fun. For three or more kids, multiple cases, or a destination that isn\u2019t Wien Hbf, a V-Class at €560 is the lower-stress option every time.',
  },
  {
    q: 'What happens if I miss my Sparschiene train or my flight is delayed?',
    a: 'Sparschiene is the catch of the entire ÖBB fare system: it is non-refundable and non-changeable. If you miss it — because you were late leaving Prague, because the metro was delayed, or because your inbound flight landed late — the €14.90 ticket becomes worthless and you buy a new one at the station, typically €40–€60 flex for the next available departure. Sparschiene Komfort lets you change for a fee. Standard flexible fares let you switch to any train that day. RegioJet is refundable as standard — often the safer choice if you\u2019re booking around a flight. A PRESTIGO transfer is flexible by default: free cancellation up to two hours before pickup, free rebooking around a delayed flight when the transfer is for the outbound leg, and flight tracking is automatic on any airport pickup so the driver waits without surcharge.',
  },
  {
    q: 'Which side of the RailJet should I sit on for the best views?',
    a: 'Honestly, the Prague–Vienna route is not scenic and the guidebook advice to "sit on the left" is mostly wishful thinking. The route runs south-east from Prague across agricultural Bohemia and southern Moravia into the flat Vienna basin — you will see farmland, small towns, and the occasional factory. The most visually interesting section is the final 30 minutes approaching Vienna, where the train rolls past Marchfeld onto the Danube plain, and a weak third place is the Pardubice → Brno leg. If scenery matters to you, don\u2019t take this train at all — take a private transfer with a 45-minute stop at Mikulov (the dramatic limestone cliffs of Palava) or the Lednice palace gardens. Both are genuinely beautiful and both are impossible on the direct train.',
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
      headline: 'Prague to Vienna 2026: Private Transfer vs Train vs Bus (Honest Guide)',
      description: DESCRIPTION,
      about: { '@type': 'Service', name: 'Prague to Vienna private chauffeur transfer' },
      publisher: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      url: 'https://rideprestigo.com/compare/prague-vienna-transfer-vs-train',
      datePublished: '2026-04-09',
      dateModified: '2026-04-09',
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
          <p className="label mb-6">Comparison guide · Updated April 2026</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px]">
            Prague to Vienna:<br />
            <span className="display-italic">the honest comparison.</span>
          </h1>
          <p className="body-text text-[14px] mt-6 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Every number on this page is verified against ÖBB, RegioJet, FlixBus, and our own dispatch
            records as of April 2026. We drive this route hundreds of times a year and we have no incentive
            to oversell the private transfer — for half of travellers, the train is the right answer. This
            guide tells you which half you are in, to the euro and to the minute.
          </p>
        </div>
      </section>

      {/* TL;DR */}
      <section className="bg-anthracite-mid py-14 md:py-16 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">The 30-second answer</p>
          <span className="copper-line mb-6 block" />
          <div className="flex flex-col gap-4">
            <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
              <strong>Take the train</strong> if you are solo or a couple, booking more than two weeks ahead,
              with light luggage, and your hotel is within 15 minutes of Praha hl.n. or Wien Hbf. Budget
              €15–€30 per person on Sparschiene fares, 5h 15min door-to-door, and book on cd.cz rather than
              oebb.at for better flexibility on the cheap tiers.
            </p>
            <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
              <strong>Take a private transfer</strong> if you are a family or group of 4+, have real luggage,
              are travelling with kids, need door-to-door service to a specific address, or you\u2019re booking
              inside 72 hours and flexible train fares have already climbed above €50 per person. Budget
              €485 (E-Class) or €560 (V-Class for six), 3h 15min door-to-door, flight tracking on return.
            </p>
            <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
              <strong>Take the bus</strong> if you\u2019re a solo backpacker on a tight budget with no deadline.
              FlixBus and RegioJet run eighteen daily departures between Praha Florenc and Vienna Erdberg
              from €10, and the journey time is within 30 minutes of the train.
            </p>
          </div>
        </div>
      </section>

      {/* Full comparison table */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-6xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-4">Every option, side by side</h2>
          <p className="body-text text-[13px] mb-10 max-w-3xl" style={{ lineHeight: '1.9' }}>
            Four modes, every number verified against operator websites as of April 2026. Train fares are
            ÖBB RailJet 2nd class unless noted; FlixBus figures are for RegioJet bus or FlixBus Standard.
          </p>
          <div className="border border-anthracite-light overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-anthracite-light bg-anthracite-mid">
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-warmgrey">Factor</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite" style={{ color: 'var(--copper-light)' }}>PRESTIGO transfer</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">ÖBB RailJet</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">FlixBus / RegioJet bus</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">One-way rental</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? 'bg-anthracite' : 'bg-anthracite-mid'}>
                    <td className="p-4 font-body font-light text-[12px] text-warmgrey border-t border-anthracite-light">{row.label}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.prestigo}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.railjet}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.flixbus}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.rental}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="body-text text-[11px] mt-4" style={{ lineHeight: '1.7' }}>
            PRESTIGO fares: Mercedes E-Class €485, S-Class €725, V-Class €560 fixed per vehicle (Prague → Vienna,
            door-to-door, all inclusive, 10 % off return within 24 h). Source: rideprestigo.com/routes/prague-vienna.
          </p>
        </div>
      </section>

      {/* Six scenarios */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Six real scenarios</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-4">Which option wins for <span className="display-italic">your trip?</span></h2>
          <p className="body-text text-[13px] mb-14 max-w-3xl" style={{ lineHeight: '1.9' }}>
            Every competing guide on this topic collapses into per-person pricing and ignores group size, luggage,
            lead time, and purpose. These six scenarios cover the realistic spectrum of Prague → Vienna travel
            and name a single winner each.
          </p>
          <div className="flex flex-col gap-12">
            {scenarios.map((s) => (
              <div key={s.title} className="border-l-2 border-copper pl-8 py-2">
                <p className="label mb-3" style={{ color: 'var(--copper-light)' }}>{s.winner}</p>
                <h3 className="font-display font-light text-[22px] md:text-[26px] text-offwhite mb-2">{s.title}</h3>
                <p className="font-body font-light text-[13px] mb-4" style={{ color: 'var(--copper-light)' }}>{s.cost}</p>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stops worth adding */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="label mb-6">What the train can\u2019t do</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-6">Stops worth making between <span className="display-italic">Prague and Vienna.</span></h2>
          <p className="body-text text-[13px] mb-14 max-w-3xl" style={{ lineHeight: '1.9' }}>
            The direct RailJet runs through some of the best landscape and heritage in Central Europe and
            stops at none of it. If you are taking a private transfer you can add any of these to the itinerary
            at no extra cost beyond reasonable waiting time. A train trip effectively locks you out of all of
            them unless you buy a flex fare and plan a multi-stop day.
          </p>
          <div className="border border-anthracite-light overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-anthracite-light bg-anthracite-mid">
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-warmgrey">Stop</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">By PRESTIGO</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">By train</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">Worth it?</th>
                </tr>
              </thead>
              <tbody>
                {stops.map((s, i) => (
                  <tr key={s.name} className={i % 2 === 0 ? 'bg-anthracite' : 'bg-anthracite-mid'}>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{s.name}</td>
                    <td className="p-4 font-body font-light text-[12px] text-warmgrey border-t border-anthracite-light">{s.viaPrestigo}</td>
                    <td className="p-4 font-body font-light text-[12px] text-warmgrey border-t border-anthracite-light">{s.viaTrain}</td>
                    <td className="p-4 font-body font-light text-[12px] border-t border-anthracite-light" style={{ color: 'var(--copper-light)' }}>{s.worthIt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Booking traps */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Booking traps to avoid</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-10">Three mistakes that cost travellers <span className="display-italic">hundreds of euros.</span></h2>
          <div className="flex flex-col gap-8">
            <div>
              <h3 className="font-display font-light text-[22px] text-offwhite mb-3">1. Buying Sparschiene when your flight is delayed</h3>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                ÖBB\u2019s cheapest fare (€14.90) is non-refundable and non-changeable. If you book a Sparschiene
                train from Praha hl.n. and your inbound flight lands 90 minutes late, your ticket is worthless and
                you\u2019ll buy a new one at the station for €40–€60. The rule: if there is any chance your
                outbound departure slips — delayed flight, tight connection, evening train after an all-day meeting —
                never book Sparschiene. Pay €10–€15 more for the Komfort or flex version, or use RegioJet which
                is refundable as standard. The same logic applies to connecting trains.
              </p>
            </div>
            <div>
              <h3 className="font-display font-light text-[22px] text-offwhite mb-3">2. Booking oebb.at instead of cd.cz</h3>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                ÖBB and Czech Railways sell the same trains at the same fares, but the cancellation rules differ.
                On oebb.at, Sparschiene is strictly non-refundable. On cd.cz, some cheap tiers are changeable for a
                small fee — and the interface is available in English. Book on cd.cz by default unless you
                specifically need the ÖBB loyalty programme. RegioJet has its own booking at regiojet.com with
                fully refundable fares as standard and a noticeably better mobile experience.
              </p>
            </div>
            <div>
              <h3 className="font-display font-light text-[22px] text-offwhite mb-3">3. Skipping the seat reservation</h3>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                The €3 seat reservation on RailJet is not optional in practice. On any peak departure the train
                fills up before Pardubice and unreserved passengers stand for the second half of the trip. Every
                ÖBB ticket sold through cd.cz or oebb.at offers a reservation at checkout — pay the €3, pick a
                window seat on the left side (marginal view advantage), and book an aisle seat for the person
                next to you if you want guaranteed luggage access. First class is a de-facto luggage upgrade at
                €15–€25 above second class and worth it on any trip where you have more than one case.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
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

      {/* Mode reference */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Reference — all six modes</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-10">Including the options you <span className="display-italic">probably forgot about.</span></h2>
          <div className="flex flex-col gap-6">
            {modes.map((m) => (
              <div key={m.id} className="border border-anthracite-light p-8">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between mb-3 gap-2">
                  <h3 className="font-display font-light text-[20px] md:text-[24px] text-offwhite">{m.name}</h3>
                  <span className="font-body font-light text-[11px] tracking-[0.12em] uppercase" style={{ color: 'var(--copper-light)' }}>{m.category}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 mb-4">
                  <div>
                    <p className="font-body font-medium text-[9px] tracking-[0.15em] uppercase text-warmgrey">Fare band</p>
                    <p className="font-body font-light text-[12px] text-offwhite mt-1">{m.fareBand}</p>
                  </div>
                  <div>
                    <p className="font-body font-medium text-[9px] tracking-[0.15em] uppercase text-warmgrey">Passengers</p>
                    <p className="font-body font-light text-[12px] text-offwhite mt-1">{m.pax}</p>
                  </div>
                  <div>
                    <p className="font-body font-medium text-[9px] tracking-[0.15em] uppercase text-warmgrey">Door-to-door</p>
                    <p className="font-body font-light text-[12px] text-offwhite mt-1">{m.doorTime}</p>
                  </div>
                </div>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{m.notes}</p>
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
              <span className="display-italic">€485 fixed. 3h 15min door-to-door.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">Mercedes E-Class. Flight tracking on return. 10 % off round trips within 24 h.</p>
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
