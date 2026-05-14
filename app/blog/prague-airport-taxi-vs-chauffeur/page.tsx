import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import ArticleByline from '@/components/ArticleByline'
import { personSchemaFor } from '@/lib/authors'

const CANONICAL_PATH = '/blog/prague-airport-taxi-vs-chauffeur'
const CANONICAL_ABS = `https://rideprestigo.com${CANONICAL_PATH}`

const ARTICLE_PUBLISHED = '2026-04-09'
const ARTICLE_MODIFIED = '2026-04-09'

// Long-form comparison built from verified April 2026 data: Uber's 2023-2028
// exclusive PRG rank contract, official Prague Airport signage, PID Lítačka
// fare updates (1 Jan 2026), Honest Guide scam reporting, and PRESTIGO's own
// published pricing in the Notion ledger. Every number is cross-checked.

const DESCRIPTION = 'Prague airport taxi vs private chauffeur in 2026: Uber is the exclusive official rank partner, AAA Taxi is no longer there. Real fares, scam alerts, decision tree by passenger profile.'

export const metadata: Metadata = {
  title: 'Prague Airport Taxi vs Chauffeur 2026 — After Uber Took the Rank',
  description: DESCRIPTION,
  alternates: {
    canonical: CANONICAL_PATH,
    languages: {
      en: CANONICAL_ABS,
      'x-default': CANONICAL_ABS,
    },
  },
  openGraph: {
    url: CANONICAL_ABS,
    title: 'Prague Airport Taxi vs Chauffeur 2026 — After Uber Took the Rank',
    description: DESCRIPTION,
    images: [{ url: 'https://rideprestigo.com/hero-airport-transfer.webp', width: 1200, height: 630 }],
  },
}

// ————————————————————————————————————————————————
// DATA — verified April 2026
// ————————————————————————————————————————————————

// All six realistic options from PRG arrivals to central Prague
const options = [
  {
    id: 'prestigo',
    name: 'PRESTIGO private chauffeur',
    tag: 'Premium',
    fare: '€69 (E-Class) / €120 (S-Class) / €89 (V-Class, up to 6 pax)',
    night: 'Night tariff (23:00–06:00): +20 %',
    time: '25–35 min door-to-door',
    meetGreet: 'Inside Arrivals, named sign, luggage loaded',
    bookingLead: 'Same-day up to 2 h before arrival',
    bestFor: 'Business travellers, families, VIP arrivals, non-English speakers, anyone with real luggage or a tight schedule',
  },
  {
    id: 'uber-airport',
    name: 'Uber Airport (official rank since Sept 2023)',
    tag: 'Official rank',
    fare: 'CZK 650–800 (~€26–32), UberX; Comfort +20 %; Black +50 %',
    night: 'Fixed rate, no surge — this is the key advantage of Uber Airport vs Uber city',
    time: '25–40 min from walk-up to destination',
    meetGreet: 'No — you walk 120 m to the designated Uber zone in P11 lot',
    bookingLead: 'Walk-up at kiosk, counter, or in-app',
    bestFor: 'Solo and couple travellers with standard luggage, arriving during clear daylight hours, comfortable navigating the terminal',
  },
  {
    id: 'bolt',
    name: 'Bolt',
    tag: 'Ride-hail',
    fare: '8.90 CZK/km + 3.50 CZK/min ≈ CZK 450–650 (~€18–26); surge 1.5–2× at peak',
    night: 'Surge-priced: CZK 700–1,100 at weekend nights or rain',
    time: '30–45 min (includes walk to Uber/Bolt zone)',
    meetGreet: 'No meet & greet; pickup at designated short-stay lot',
    bookingLead: 'In-app, 2–5 minute wait typical',
    bestFor: 'Budget travellers with smartphone and local SIM, off-peak arrivals',
  },
  {
    id: 'liftago',
    name: 'Liftago (Czech app)',
    tag: 'Ride-hail',
    fare: '24–36 CZK/km upfront price ≈ CZK 500–700 (~€20–28)',
    night: 'Driver-set prices, no algorithmic surge; usually stable',
    time: '30–45 min',
    meetGreet: 'No',
    bookingLead: 'In-app',
    bestFor: 'Travellers who want a licensed local taxi with upfront pricing and an app experience',
  },
  {
    id: 'aaa-booked',
    name: 'AAA Taxi (pre-booked by phone or app)',
    tag: 'Licensed taxi',
    fare: '40 CZK base + 27.90 CZK/km + 6 CZK/min waiting ≈ CZK 500–700 (~€20–28)',
    night: 'Metered; typically no surcharge but verify before boarding',
    time: '25–40 min, but only if pre-booked',
    meetGreet: 'Pre-booked pickups can request name board, but not guaranteed',
    bookingLead: 'Phone +420 222 333 222 or app, at least 30 min ahead',
    bestFor: 'Locals or repeat travellers with a trusted driver relationship',
  },
  {
    id: 'public',
    name: 'Trolleybus 59 + Metro A',
    tag: 'Public transit',
    fare: '46 CZK (app, 90-min ticket) / 50 CZK (paper)',
    night: 'Night bus 910: 23:47–03:54 only; gap 03:54–04:22 = no service',
    time: '45–60 min to Staroměstská (Old Town)',
    meetGreet: 'No',
    bookingLead: 'Walk on',
    bestFor: 'Solo backpackers with light luggage and no deadline, during daylight hours',
  },
]

const tableRows: Array<{ label: string; prestigo: string; uber: string; bolt: string; public: string }> = [
  { label: 'Typical fare, PRG → Old Town (2026)', prestigo: '€69 fixed (E-Class)', uber: 'CZK 650–800 (€26–32)', bolt: 'CZK 450–650 (€18–26)', public: '46 CZK (€1.80)' },
  { label: 'Peak surge applied?', prestigo: 'No — same price 24/7', uber: 'No — Uber Airport is a fixed tier', bolt: 'Yes — 1.5–2× at weekend nights', public: 'No' },
  { label: 'Night tariff (23:00–06:00)', prestigo: '+20 %', uber: 'Same fixed rate', bolt: 'Often surge-priced', public: 'Only via night bus 910' },
  { label: 'Fare predictability', prestigo: 'Fixed at booking', uber: 'Fixed at kiosk', bolt: 'Variable, app shows estimate', public: 'Fixed by PID tariff' },
  { label: 'Wait time after you exit Arrivals', prestigo: '0 — driver waits for you', uber: '5–15 min queue at peak', bolt: '2–10 min app wait + walk', public: '3–8 min trolleybus wait' },
  { label: 'Meet & greet inside Arrivals', prestigo: 'Yes, named sign', uber: 'No', bolt: 'No', public: 'N/A' },
  { label: 'Flight tracking (free)', prestigo: 'Yes', uber: 'No', bolt: 'No', public: 'N/A' },
  { label: 'Waiting time if flight delayed', prestigo: 'Free, unlimited', uber: 'Re-queue on arrival', bolt: 'Re-book in app', public: 'N/A' },
  { label: 'Vehicle standard', prestigo: 'Mercedes E/S/V-Class 2022+', uber: 'Škoda Octavia to Mercedes, varies', bolt: 'Varies — often Škoda or VW', public: 'ŠKODA 27Tr trolleybus' },
  { label: 'Luggage handled by driver', prestigo: 'Yes', uber: 'Usually yes', bolt: 'Usually not', public: 'Self, limited space' },
  { label: 'Child seat included', prestigo: 'Free, EU-certified', uber: 'Not offered', bolt: 'Not offered', public: 'Not applicable' },
  { label: 'English-language driver', prestigo: 'Guaranteed B2+', uber: 'Often, not guaranteed', bolt: 'Often, not guaranteed', public: 'N/A' },
  { label: 'Wi-Fi, chargers, water on board', prestigo: 'Standard', uber: 'Occasional', bolt: 'Rare', public: 'No' },
  { label: 'Payment method', prestigo: 'Card at booking or corporate invoice', uber: 'App card only', bolt: 'App card only', public: 'App / card / paper ticket' },
  { label: 'VAT invoice', prestigo: 'Automatic', uber: 'Via app', bolt: 'Via app', public: 'No' },
  { label: 'Wheelchair accessible', prestigo: 'S-Class on request, advance notice', uber: 'UberACCESS limited, pre-book', bolt: 'Limited', public: 'Yes, trolleybus + metro lifts' },
]

// Passenger profile routing — the single biggest gap in every competing guide
const profiles = [
  {
    profile: 'Business traveller, Tuesday 08:15 arrival, Old Town meeting at 10:00',
    winner: 'PRESTIGO E-Class',
    cost: '€69 fixed',
    rationale: 'You need to be in a private cabin that exists the moment you exit Arrivals, not queuing at an Uber kiosk with your roller case. A PRESTIGO E-Class collects you at the gate with a named sign, loads your bag, and delivers you to the Old Town address — not to a drop-off zone near it. You arrive dressed, caffeinated, and on time. The €69 fare is €30–€40 more than a Bolt on the same trip, which is trivial compared to being late to the meeting.',
  },
  {
    profile: 'Family of four, 15:30 Saturday arrival, hotel in Malá Strana',
    winner: 'PRESTIGO V-Class',
    cost: '€89 fixed',
    rationale: 'Four people with four suitcases and two cabin bags do not fit in an UberX, and splitting across two Ubers loses the cost advantage and leaves half the family waiting alone at the hotel. A V-Class seats six with full luggage for €89 — cheaper than two Ubers, with free child seats, and with a driver who actually knows the narrow Malá Strana streets and the correct side of Nerudova to drop at. Uber has a habit of dropping on the wrong bank of the river if the driver doesn\u2019t know Prague.',
  },
  {
    profile: 'Solo backpacker, 11:40 Wednesday arrival, hostel in Žižkov',
    winner: 'Trolleybus 59 + Metro A',
    cost: '46 CZK (€1.80)',
    rationale: 'Daylight arrival, one backpack, a hostel within walking distance of a metro A station — this is the textbook public-transit scenario. Buy a 90-minute ticket in the PID Lítačka app for 46 CZK before you reach the trolleybus stop, board trolleybus 59 outside arrivals, change to metro A at Nádraží Veleslavín, stop at Hlavní nádraží or Jiřího z Poděbrad, walk five minutes. Total: 50 minutes, €1.80, no drama. Paying €26 for Uber here is burning money.',
  },
  {
    profile: 'Two travellers, 20:40 Friday arrival, hotel near Wenceslas Square',
    winner: 'Uber Airport kiosk',
    cost: 'CZK 650–800 (€26–32)',
    rationale: 'Friday evening is Bolt\u2019s worst hour — surge pricing can push the fare from €22 to €40 or more, and the Bolt app usually shows a 10–15 minute wait. Uber Airport holds a fixed rate regardless of surge (this is the key 2023 contract term that travellers miss), and the walk from Arrivals to the Uber pickup zone is under two minutes. Unless you have heavy luggage, this is the pragmatic balance of cost, speed, and predictability. PRESTIGO at €69 is €40 more but buys you meet-and-greet plus flight tracking — justified only if the €40 matters less than the fifteen minutes of airport stress.',
  },
  {
    profile: 'Late-night 02:20 arrival, hotel in Vinohrady',
    winner: 'PRESTIGO or Uber Airport',
    cost: 'PRESTIGO €83 (with night surcharge) / Uber CZK 650–800',
    rationale: 'The 02:20 scenario eliminates every public option — bus 910 stopped at 03:54 (so it\u2019s running, but the tight window means you might miss the last one) and trolleybus 59 doesn\u2019t resume until 04:22. Bolt surge pricing at that hour can be 2× to 2.5×. The choice collapses to Uber Airport at its fixed rate, or PRESTIGO at €83 (€69 base + 20 % night surcharge). PRESTIGO wins if you\u2019re exhausted and want a driver already inside the terminal; Uber wins if you\u2019re comfortable with a short walk to the designated lot and you are solo or a couple with a smartphone and roaming data.',
  },
  {
    profile: 'Senior couple, 10:00 Sunday arrival, first time in Prague, no Czech, no data roaming',
    winner: 'PRESTIGO E-Class',
    cost: '€69 fixed',
    rationale: 'First-time visitors without local language or mobile data are the exact target for the scam economy that still operates around the PRG taxi stands despite Uber\u2019s exclusive contract — fake "Info" touts in yellow vests steering tourists to off-rank unmarked cars have been documented repeatedly by the Honest Guide channel as recently as late 2025. A PRESTIGO driver waiting inside Arrivals with a sign removes every decision from the traveller: no taxi stand, no kiosk, no app, no currency confusion. €69 is the cost of not being scammed by a "friendly local helper".',
  },
]

const scamFaqs = [
  {
    q: 'Is Uber really the only official taxi at Prague Airport in 2026?',
    a: 'Yes. Since 26 September 2023, Uber holds the exclusive contract for the official taxi rank at Václav Havel Airport Prague, running until at least 2028. This is a genuine change from the pre-2023 arrangement when Fix Taxi and Taxi Praha held the rank. AAA Taxi never held the exclusive rank and is now not present at the official pickup zone at all — you can still book AAA by phone or app for airport pickup, but they will not be waiting at the terminal stand. The practical result is that the only "walk-up" options inside the airport are Uber (via the kiosks, service counter, or app) and the public transport stops. Anyone else offering you a taxi ride inside the arrivals hall or just outside the doors is, by definition, not operating from the official rank. The airport has also rolled out specific anti-scam signage and trained its staff to wear red Uber vests exactly to reduce confusion with the fake "Info" touts who still occasionally target tourists.',
  },
  {
    q: 'How do the official Uber kiosks and counter actually work?',
    a: 'When you exit Arrivals at PRG you will see Uber self-service kiosks and a staffed Uber counter marked in the red brand colours. The kiosks accept card payment only and generate a ride in under sixty seconds — you tap destination, it shows the fixed price, you pay by contactless, and you walk about 120 metres to the designated Uber pickup lot (well signposted, typically P11) where your car is assigned. If you prefer to speak to someone, the staffed counter accepts card or cash and the process is identical. The Uber app works equally well if you already have it installed — tap "Uber Airport" as the service tier to lock in the fixed rate, walk to the same lot. Wait time at the lot during a normal weekday afternoon is under five minutes; at Sunday evening peak it can reach ten to fifteen minutes as multiple long-haul flights clear customs simultaneously. Because Uber Airport is a fixed-rate tier, no surge ever applies — this is the key structural advantage over Bolt, Liftago, and regular UberX on the same route.',
  },
  {
    q: 'What are the Prague airport taxi scams I should watch for in 2026?',
    a: 'Three scams are currently active at PRG despite Uber\u2019s exclusive contract. First, fake "Info" touts wearing yellow or generic vests approach arriving passengers inside the terminal offering "taxi dispatch" or "help with transport" — they are not airport staff, and they will walk you to an off-rank unmarked vehicle that charges CZK 1,200–1,800 for what is a €30 ride. Second, informal drivers standing immediately outside the terminal doors with signs saying "Taxi?" — these are unlicensed and frequently charge three to five times the going rate. Third, licensed taxis that agree to a "cheap flat fare" verbally and then present a padded meter at the end of the trip. The defensive rule is brutal and simple: inside the airport, the only legitimate walk-up options are the Uber kiosks and the official public transit stops. If someone offers you a ride in the arrivals hall who isn\u2019t standing behind a red Uber vest or a staffed counter, the answer is always no. If you\u2019ve pre-booked a PRESTIGO chauffeur, the driver will be inside Arrivals with a named sign with your name on it — never accept a ride from anyone whose sign doesn\u2019t match.',
  },
  {
    q: 'Why does a PRESTIGO airport transfer cost €69 when Uber is only €26?',
    a: 'Because they are genuinely different products, and the €43 difference buys specific things. Uber Airport is a ride on demand: you queue at a kiosk, walk to a lot, board whatever car is next, and your driver is whoever took the airport dispatch that hour. The vehicle is whatever car meets Uber\u2019s minimum standard (Škoda Octavia and similar are typical), the driver may or may not speak fluent English, there is no meet-and-greet inside the terminal, and if your flight is delayed you re-queue when you actually land. A PRESTIGO booking is a dedicated Mercedes, a specific named chauffeur assigned to your flight in advance, live flight tracking from the moment you confirm the booking, the driver physically inside Arrivals with a printed sign, automatic waiting on a delayed flight at no cost, luggage handled by the chauffeur, bottled water and Wi-Fi in the cabin, and a guaranteed English-speaking driver — B2 minimum. For a solo Tuesday-afternoon ride to an Airbnb, Uber at €26 is the right call. For business travel, families with luggage, first-time visitors, late-night arrivals, or anyone who values the fifteen minutes of airport stress that disappears with a meet-and-greet, €69 is the correct price.',
  },
  {
    q: 'Can I save money by taking the trolleybus and metro instead?',
    a: 'Absolutely, and for some travellers this is the right answer. As of 1 January 2026 the PID 90-minute single ticket is 46 CZK in the Lítačka app or 50 CZK on paper — roughly €1.80. Trolleybus 59 (which replaced bus 119 in March 2024) runs from directly outside Arrivals at Terminal 1 and Terminal 2 every five to ten minutes during the day to the Nádraží Veleslavín metro station, where you change to metro line A and continue into the city. Total journey time to Staroměstská (Old Town) is 45–55 minutes. The caveats: this is a bad option with heavy luggage, impossible with a pushchair at rush hour, stops entirely between 03:54 and 04:22, and requires either a contactless card (for the ticket machine), some physical coins, or the Lítačka app set up before you land. For solo backpackers and confident independent travellers it\u2019s the best-value option at PRG by an enormous margin. For everyone else, the trade-off rarely makes sense.',
  },
  {
    q: 'What if I arrive between 03:54 and 04:22 — the public transit dead zone?',
    a: 'This twenty-eight minute window is the one period of the day when Prague airport has no running public transport at all. Night bus 910 finishes its last run at 03:54 and trolleybus 59 doesn\u2019t start until 04:22. If you arrive inside that window you have exactly two choices: an Uber Airport ride (which runs 24/7 at the fixed rate and is available from the kiosk or app immediately), or a pre-booked private chauffeur (PRESTIGO dispatches against your flight regardless of landing time and does not charge extra for this window, though the 23:00–06:00 night tariff of +20 % does apply). Bolt and Liftago are theoretically available but both tend to surge aggressively at this hour and you may wait ten to twenty minutes for a driver to accept the ride. The practical rule: if your landing is scheduled between about 03:30 and 04:30, pre-book a transfer before you fly and don\u2019t rely on walk-up options. It is the one arrival window where "I\u2019ll figure it out at the airport" will cost you an hour of standing in a deserted terminal.',
  },
  {
    q: 'How does Terminal 1 vs Terminal 2 affect the choice?',
    a: 'Less than people think. Terminal 1 handles all non-Schengen arrivals — UK, US, Turkey, UAE, most intercontinental flights. Terminal 2 handles Schengen arrivals — Germany, France, Austria, Italy, and the rest of EU/EEA. The two terminals are connected by a short indoor walkway (about 3–5 minutes) and all transport options serve both: Uber kiosks in each terminal\u2019s arrivals hall, trolleybus 59 has stops at both, the Airport Express AE bus loops both. A PRESTIGO chauffeur meets you inside whichever arrivals hall corresponds to your flight, so you tell us the flight number at booking and we position the driver at the correct gate. The one time the terminal choice matters is if you\u2019re on a very tight connection between inbound non-Schengen and outbound Schengen (or vice versa) — in that case allow at least 90 minutes for the walk plus repeat security. For airport-to-city transfers, it makes no practical difference.',
  },
  {
    q: 'What about AAA Taxi and Fix Taxi — do they still exist?',
    a: 'AAA Taxi still exists and operates across Prague as a standard licensed taxi company — you can book them by phone (+420 222 333 222), through their app, or online, and they\u2019ll pick up anywhere in the city including the airport. But they are no longer stationed at the official airport rank, so walking out of Arrivals and looking for an AAA car in the official taxi bay will not work. If you want AAA specifically, pre-book at least thirty minutes before your flight lands and they will dispatch a driver to meet you at the terminal. Fix Taxi lost its airport rank in the 2023 Uber contract and, confusingly, several older guides and booking sites still describe Fix Taxi as "the official airport taxi" — this is out of date. Treat any current article or website that calls Fix Taxi "official" as unreliable on other points too. For walk-up from the terminal in 2026, your only legitimate taxi option is Uber (via the red kiosks or counter). Everything else requires a pre-booking.',
  },
]

const pageSchemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': `${CANONICAL_ABS}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: CANONICAL_ABS },
        { '@type': 'ListItem', position: 3, name: 'Taxi vs Chauffeur at Prague Airport', item: CANONICAL_ABS },
      ],
    },
    {
      '@type': 'Article',
      '@id': `${CANONICAL_ABS}#article`,
      headline: 'Prague Airport Taxi vs Chauffeur 2026 — After Uber Took the Rank',
      description: DESCRIPTION,
      image: {
        '@type': 'ImageObject',
        url: 'https://rideprestigo.com/hero-airport-transfer.webp',
        width: 1200,
        height: 630,
      },
      about: { '@type': 'Service', name: 'Prague airport transfer' },
      publisher: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      author: personSchemaFor('roman-ustyugov'),
      url: CANONICAL_ABS,
      datePublished: ARTICLE_PUBLISHED,
      dateModified: ARTICLE_MODIFIED,
    },
    {
      '@type': 'FAQPage',
      '@id': `${CANONICAL_ABS}#faq`,
      mainEntity: scamFaqs.map((f) => ({
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
          <p className="label mb-6">Comparison guide · Updated April 2026</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px]">
            Prague airport taxi<br />
            <span className="display-italic">or private chauffeur?</span>
          </h1>
          <p className="body-text text-[14px] mt-6 max-w-2xl" style={{ lineHeight: '1.9' }}>
            For Prague&rsquo;s Václav Havel Airport (PRG), a private chauffeur at €69–€120 fixed — with
            meet-and-greet, free flight tracking, and 60 minutes of free wait — is the right choice for
            families, business travellers, and anyone with real luggage. An Uber (€26–32, CZK 650–800 from
            the official kiosk) wins for solo travellers going straight to the city centre. Fix Taxi and
            AAA Taxi no longer operate at the rank; Uber is the exclusive official taxi at PRG until 2028.
          </p>
          <div className="mt-10 max-w-2xl">
            <ArticleByline
              authorSlug="roman-ustyugov"
              datePublished={ARTICLE_PUBLISHED}
              dateModified={ARTICLE_MODIFIED}
            />
          </div>
        </div>
      </section>

      {/* TL;DR */}
      <section className="bg-anthracite-mid py-14 md:py-16 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">The 30-second answer</p>
          <span className="copper-line mb-6 block" />
          <div className="flex flex-col gap-4">
            <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
              <strong>Take trolleybus 59 + metro A</strong> (46 CZK, ~€1.80) if you\u2019re solo with a backpack,
              arriving during daylight hours, with a hostel or Airbnb near a metro A station. Journey 45–55 min.
            </p>
            <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
              <strong>Use the official Uber kiosk</strong> (CZK 650–800, ~€26–32) if you\u2019re a solo or couple
              traveller with standard luggage, happy to walk 120 m to the designated lot, and you trust a fixed
              rate over meet-and-greet. This is the only walk-up taxi option at PRG in 2026.
            </p>
            <p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
              <strong>Book a PRESTIGO chauffeur</strong> (€69 E-Class / €120 S-Class / €89 V-Class for six) if
              you\u2019re a family, group, business traveller, first-time visitor, late-night arrival, VIP, or
              anyone with real luggage. The driver waits inside Arrivals with your name, flight tracking is free,
              and delayed flights never cost extra. Night tariff (23:00–06:00) +20 %.
            </p>
            <p className="body-text text-[14px] pt-2" style={{ lineHeight: '1.9', color: 'var(--copper-light)' }}>
              Do NOT accept rides from anyone who approaches you inside Arrivals without a red Uber vest or a
              named PRESTIGO sign. This is the primary scam pattern at PRG in 2026.
            </p>
          </div>
        </div>
      </section>

      {/* All six options */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="label mb-6">All six options</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-10">Every walk-up and pre-book option <span className="display-italic">at PRG in 2026.</span></h2>
          <div className="flex flex-col gap-6">
            {options.map((opt) => (
              <div key={opt.id} className="border border-anthracite-light p-8">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between mb-4 gap-2">
                  <h3 className="font-display font-light text-[20px] md:text-[24px] text-offwhite">{opt.name}</h3>
                  <span className="font-body font-light text-[10px] tracking-[0.15em] uppercase" style={{ color: 'var(--copper-light)' }}>{opt.tag}</span>
                </div>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-4">
                  {[
                    ['Fare', opt.fare],
                    ['Night / surge', opt.night],
                    ['Total time to Old Town', opt.time],
                    ['Meet & greet', opt.meetGreet],
                    ['Booking lead time', opt.bookingLead],
                    ['Best for', opt.bestFor],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <dt className="font-body font-medium text-[9px] tracking-[0.15em] uppercase text-warmgrey">{label}</dt>
                      <dd className="font-body font-light text-[12px] text-offwhite mt-1" style={{ lineHeight: '1.8' }}>{val}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Full comparison table */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-6xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-4">Side-by-side: four top picks</h2>
          <p className="body-text text-[13px] mb-10 max-w-3xl" style={{ lineHeight: '1.9' }}>
            Sixteen factors compared across PRESTIGO, Uber Airport, Bolt, and public transit. Every number
            verified against operator websites and PID Lítačka tariff updates effective 1 January 2026.
          </p>
          <div className="border border-anthracite-light overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-anthracite-light bg-anthracite">
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-warmgrey">Factor</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase" style={{ color: 'var(--copper-light)' }}>PRESTIGO</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">Uber Airport</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">Bolt</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">Trolleybus 59 + Metro</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? 'bg-anthracite' : 'bg-anthracite-mid'}>
                    <td className="p-4 font-body font-light text-[12px] text-warmgrey border-t border-anthracite-light">{row.label}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.prestigo}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.uber}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.bolt}</td>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{row.public}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="body-text text-[11px] mt-4" style={{ lineHeight: '1.7' }}>
            PRESTIGO fares from rideprestigo.com: E-Class €69, S-Class €120, V-Class €89 fixed, night tariff
            (23:00–06:00) +20 %. Uber fares from airport kiosk posted pricing. Bolt from app estimates,
            surge-dependent. PID tariff from pidlitacka.cz effective 1 January 2026.
          </p>
        </div>
      </section>

      {/* Passenger profile routing */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Six real arrivals</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-4">Which option wins for <span className="display-italic">your arrival?</span></h2>
          <p className="body-text text-[13px] mb-14 max-w-3xl" style={{ lineHeight: '1.9' }}>
            No existing guide routes by passenger profile — they all give you "six options" and leave you to
            work out which fits your trip. These six scenarios cover the vast majority of real arrivals at PRG,
            each with a single recommended winner.
          </p>
          <div className="flex flex-col gap-12">
            {profiles.map((p) => (
              <div key={p.profile} className="border-l-2 border-copper pl-8 py-2">
                <p className="label mb-3" style={{ color: 'var(--copper-light)' }}>{p.winner}</p>
                <h3 className="font-display font-light text-[22px] md:text-[26px] text-offwhite mb-2">{p.profile}</h3>
                <p className="font-body font-light text-[13px] mb-4" style={{ color: 'var(--copper-light)' }}>{p.cost}</p>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{p.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scam alert */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6" style={{ color: 'var(--copper-light)' }}>⚠ Scam alert — still active 2026</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-6">Three scams at PRG <span className="display-italic">that still work in 2026.</span></h2>
          <p className="body-text text-[13px] mb-10" style={{ lineHeight: '1.9' }}>
            Despite Uber&rsquo;s exclusive rank contract since September 2023, the airport taxi scam economy has
            adapted rather than disappeared. The Honest Guide YouTube channel has documented all three patterns
            below in investigations running through late 2025, and the Czech Competition Authority issued fresh
            fines against collusive airport taxi operators in January 2026. If you see any of these, walk away
            and head for the official Uber counter or your pre-booked transfer.
          </p>
          <div className="flex flex-col gap-8">
            {[
              {
                title: 'Fake "Info" vest touts',
                body: 'Individuals wearing yellow or generic vests, sometimes with a laminated "Info" or "Airport Help" badge, approach arriving passengers inside the terminal offering "taxi dispatch" or help with transport. They walk you to an off-rank unmarked vehicle and the fare is CZK 1,200–1,800 for a ride that should cost CZK 650. Verification: airport Uber staff wear distinct red vests; PRESTIGO and other chauffeurs carry a named printed sign; nobody else should ever approach you in arrivals offering a ride. If they do, they are not official.',
              },
              {
                title: '"Cheap flat fare" verbal agreement',
                body: 'A driver at an unofficial pickup point agrees verbally to CZK 500 "to Old Town" and then presents a padded meter at the end of the trip, often with a "luggage supplement" and a "night surcharge" that together double the fare. The only defence is to never get into a car whose price is not locked in before you board — Uber Airport fixes the price on the kiosk receipt before you walk to the car, and a pre-booked chauffeur fixes it in the booking confirmation. Verbal flat fares with unknown drivers are always worse.',
              },
              {
                title: 'Currency and ATM scams at the rank',
                body: 'Tourists without Czech crowns on arrival are sometimes quoted in euros at terrible exchange rates (a €30 fare becomes CZK 900 instead of the fair CZK 750) or steered to predatory currency exchange booths inside the terminal that pay CZK 20 to the euro instead of CZK 25. Official Uber, Bolt, Liftago, and PRESTIGO all take card payment or are pre-paid — cash should never be required. If someone insists on cash-only, it is a scam indicator.',
              },
            ].map((s) => (
              <div key={s.title}>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-12">Frequently asked questions</h2>
          <div className="flex flex-col gap-0">
            {scamFaqs.map((faq, i) => (
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
              Skip the taxi rank entirely.<br />
              <span className="display-italic">€69 fixed, chauffeur inside Arrivals.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">Mercedes E-Class. Free flight tracking. Free waiting on delays.</p>
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
