import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import ArticleByline from '@/components/ArticleByline'
import { personSchemaFor } from '@/lib/authors'

const ARTICLE_PUBLISHED = '2026-04-09'
const ARTICLE_MODIFIED = '2026-04-09'

// Exhaustive Prague Airport → city guide, verified against PID Lítačka 2026
// tariff (effective 1 Jan 2026), DPP network changes (bus 119 → trolleybus 59
// renaming in March 2024), prg.aero signage, and PRESTIGO's own dispatch data.
// Structure: not "6 options" but passenger profiles + neighbourhood routing.

const DESCRIPTION = 'Prague Airport (PRG) to city centre in 2026: every option with real fares after the 1 Jan 2026 PID hike, neighbourhood-by-neighbourhood routing, and late-night protocols.'

export const metadata: Metadata = {
  title: 'Prague Airport to City Centre 2026 — By Passenger Type (Full Guide)',
  description: DESCRIPTION,
  alternates: {
    canonical: '/guides/prague-airport-to-city-center',
    languages: {
      en: 'https://rideprestigo.com/guides/prague-airport-to-city-center',
      'x-default': 'https://rideprestigo.com/guides/prague-airport-to-city-center',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/guides/prague-airport-to-city-center',
    title: 'Prague Airport to City Centre 2026 — By Passenger Type (Full Guide)',
    description: DESCRIPTION,
    images: [{ url: 'https://rideprestigo.com/hero-airport-transfer.webp', width: 1200, height: 630 }],
  },
}

// ————————————————————————————————————————————————
// DATA — verified April 2026
// ————————————————————————————————————————————————

// Six options, with 2026 accurate fares and operating hours
const options = [
  {
    name: 'Trolleybus 59 + Metro A',
    cost: '46 CZK app / 50 CZK paper (90-min ticket)',
    time: '45–55 min to Staroměstská',
    hours: '04:22 – 23:32 (trolleybus 59); metro A 05:00 – 00:00',
    pros: [
      'Cheapest option — €1.80 total to anywhere in the city',
      'Fully wheelchair-accessible trolleybus and metro lifts at Veleslavín',
      'Trolleybus 59 stops directly outside both Arrivals halls',
      'Frequency 3–10 min during daytime',
      'Night bus 910 covers 23:51–03:54 gap (same ticket)',
    ],
    cons: [
      'Requires one change at Nádraží Veleslavín',
      'Dead zone 03:54–04:22: no service at all',
      'Limited luggage space on the trolleybus',
      'Buy ticket before boarding — no cash on board',
      'Not viable with multiple large suitcases',
    ],
    bestFor: 'Solo backpackers, day trips, anyone staying near a metro A stop, anyone paying their own money',
    booking: 'Buy in PID Lítačka app (iOS/Android), at the yellow ticket machine next to the trolleybus stop (accepts contactless cards), or at the DPP info counter inside the terminal. Ticket activates one minute after purchase in the app.',
  },
  {
    name: 'Bus 100 + Metro B',
    cost: '46 CZK app / 50 CZK paper',
    time: '45 min to Anděl / central Prague via line B',
    hours: '05:00 – 23:30',
    pros: [
      'Direct alternative to trolleybus 59',
      'Metro B stops at Anděl, Národní třída, Můstek — useful for Nové Město hotels',
      'Same ticket price as trolleybus 59',
      'Cleaner transfer at Zličín (terminus station)',
    ],
    cons: [
      'Less frequent than trolleybus 59 (10–20 min)',
      'Zličín is at the very end of line B — long metro ride after',
      'Not well-signposted from arrivals',
      'Shorter operating hours than trolleybus 59',
    ],
    bestFor: 'Travellers whose destination is on metro line B specifically — Anděl, Smíchov, Nové Město south',
    booking: 'Same as trolleybus 59 — PID Lítačka app, yellow machine, or DPP counter. The ticket is a 90-minute universal PID ticket, good on all modes.',
  },
  {
    name: 'Airport Express (AE) bus',
    cost: '200 CZK (doubled from 100 CZK on 1 Jan 2026)',
    time: '35–45 min to Praha hl.n.',
    hours: '05:30 – 22:00 (airport → city); 05:30 – 20:53 (city → airport)',
    pros: [
      'Direct to Prague main train station — no changes',
      'Generous luggage space, low-floor, wheelchair accessible',
      'Frequency every 30 minutes, reliable',
      'Still cheaper than a taxi for one passenger',
    ],
    cons: [
      'Fare doubled in January 2026 — value has deteriorated',
      'Ends at Praha hl.n. only — you still need onward transport',
      'PID tickets not valid — must buy separate AE ticket',
      'No service after 22:00 or before 05:30',
    ],
    bestFor: 'Travellers catching onward trains from Praha hl.n., staying within walking distance of the main station (Žižkov, Vinohrady north), or flying in with moderate luggage who don\u2019t want to change trolleybus to metro',
    booking: 'Cash or card direct to driver, or from the DPP Visitor Centre in Arrivals. NOT sold in the PID Lítačka app.',
  },
  {
    name: 'Uber Airport (official rank)',
    cost: 'CZK 650–800 (€26–32) — fixed rate, no surge',
    time: '25–40 min',
    hours: '24 / 7',
    pros: [
      'Fixed-rate tier — does not surge at peak hours like regular Uber',
      'Exclusive official rank partner at PRG since September 2023',
      'Kiosks in both terminals, card payment, 60-second booking',
      'Works at 3 AM when nothing else runs',
      'Staffed Uber counter for non-app users',
    ],
    cons: [
      'Still a 120-metre walk from arrivals to the designated Uber lot',
      'Wait 5–15 min at the lot during peak hours',
      'Vehicle quality varies (Škoda Octavia to Mercedes E-Class)',
      'No meet-and-greet inside the terminal',
      'Does not fit 5+ passengers — you need Uber XL (more expensive, limited)',
    ],
    bestFor: 'Solo and couple travellers with standard luggage, fair-to-good English, and a clear smartphone map of their destination. The default walk-up taxi option in 2026.',
    booking: 'Red Uber kiosks in each terminal arrivals hall (card payment only, 60 sec), staffed Uber counter (mixed payment), or Uber app with "Airport" tier selected. Walk to designated P11 lot with signage in English, Czech, and Russian.',
  },
  {
    name: 'Bolt / Liftago',
    cost: '€18–€26 off-peak, €35–€45 with surge',
    time: '30–45 min (including app wait)',
    hours: '24 / 7',
    pros: [
      'Often cheaper than Uber Airport during off-peak hours',
      'Liftago uses only licensed local taxis with upfront prices',
      'Bolt has large driver base, quick matching',
      'English-speaking drivers common',
    ],
    cons: [
      'Bolt surges aggressively at weekends, rain, and late nights — 2× not unusual',
      'Dedicated pickup lot, not meet-and-greet',
      'Requires working data roaming or Czech SIM',
      'Driver cancellations more common at 02:00 AM pickup',
    ],
    bestFor: 'Budget travellers with smartphones who know how to spot surge pricing, off-peak arrivals, and travellers already using these apps in their home city',
    booking: 'Download Bolt or Liftago app before you land. Enter destination, confirm price, walk to the ride-hail lot adjacent to Uber pickup (signposted).',
  },
  {
    name: 'Pre-booked private chauffeur (PRESTIGO)',
    cost: '€69 E-Class, €120 S-Class, €89 V-Class (up to 6)',
    time: '25–35 min door-to-door',
    hours: '24 / 7; night tariff (23:00–06:00) +20 %',
    pros: [
      'Meet-and-greet inside arrivals with a named sign',
      'Free flight tracking — driver waits without extra charge if you\u2019re late',
      'Door-to-door to your exact hotel or apartment entrance',
      'Luggage handled, EU-certified child seats free, Wi-Fi on board',
      'Guaranteed Mercedes E / S / V-Class 2022+, guaranteed English-speaking chauffeur',
      'Works in the 03:54–04:22 dead zone',
    ],
    cons: [
      'Highest nominal fare',
      'Requires advance booking (same-day possible up to 2 h before arrival)',
    ],
    bestFor: 'Business travellers, families, VIP arrivals, first-time visitors, late-night arrivals, anyone with heavy luggage, and anyone who would rather pay €40 extra than think about logistics on landing',
    booking: 'Book at rideprestigo.com/book with your flight number; confirmation email includes driver name, photo, vehicle plate, and phone number. Flight tracked automatically from confirmation.',
  },
]

// Passenger-profile routing — the thing nobody else does
const profiles = [
  {
    title: 'Solo backpacker, 14:00 Tuesday arrival, hostel in Žižkov',
    pick: 'Trolleybus 59 + Metro A',
    cost: '46 CZK (€1.80)',
    steps: [
      'Exit arrivals, turn left outside the doors, walk 50 m to the covered trolleybus stop.',
      'Buy a 90-minute ticket in the PID Lítačka app (set up before landing) for 46 CZK, or at the yellow ticket machine (contactless card or coins).',
      'Board trolleybus 59 — it runs every 5 minutes on a Tuesday afternoon. 16 minutes to Nádraží Veleslavín.',
      'Follow signs to metro A (green line). Tap the card reader at the gate with your phone or paper ticket.',
      'Ride metro A two stops eastbound to Dejvická or six stops to Hlavní nádraží (Žižkov is a 10-minute walk from there or one tram stop).',
      'Total time 50 minutes, total cost €1.80.',
    ],
  },
  {
    title: 'Couple, 20:15 Friday arrival, boutique hotel in Staré Město',
    pick: 'Uber Airport (fixed rate)',
    cost: 'CZK 650–800 (€26–32)',
    steps: [
      'Friday evening is Bolt\u2019s worst surge window — expect 1.7× or more.',
      'Uber Airport holds a fixed rate regardless of surge. This is the key advantage of the 2023 rank contract.',
      'Exit arrivals, follow the red Uber signage. Use the kiosk (60-second booking, card only) or the staffed counter.',
      'Walk 120 metres to the P11 pickup lot. Wait is typically 5–10 minutes on a Friday evening.',
      'Driver drops you as close to your hotel as Old Town pedestrian rules allow — usually a short walk for the final 100–200 m in Staré Město.',
      'Total time 35–45 minutes, total cost around CZK 750.',
    ],
  },
  {
    title: 'Family of four, 11:30 Saturday arrival, hotel in Malá Strana',
    pick: 'PRESTIGO V-Class',
    cost: '€89 fixed',
    steps: [
      'Four suitcases and two cabin bags exceed what fits in a single Uber. Splitting into two Ubers costs more and leaves half the family alone at the hotel.',
      'A V-Class for six with full luggage is €89 fixed — cheaper than two Ubers, with a chauffeur who actually knows Malá Strana\u2019s narrow streets.',
      'Driver meets you inside arrivals with a sign reading your surname. Loads all the luggage while the children explore the terminal shop.',
      'Direct to the hotel front door rather than the "as close as Google Maps allows" compromise that Uber ends up with.',
      'Free EU-certified booster and child seats — just confirm the children\u2019s ages at booking.',
      'Total time 35 minutes, total cost €89 (about €22 per person) — the best-value per-head option for a family with luggage.',
    ],
  },
  {
    title: 'Business traveller, 07:45 Monday arrival, meeting in Karlín at 09:30',
    pick: 'PRESTIGO E-Class',
    cost: '€69 fixed',
    steps: [
      'A 09:30 meeting with 07:45 landing means zero margin for Uber kiosk queueing or bus transfers.',
      'PRESTIGO dispatches the chauffeur to your gate based on your flight number. They are inside arrivals with a sign before you clear immigration.',
      'Direct to the Karlín office address — Wi-Fi in the cabin for last-minute prep, bottled water, climate preset to your preference.',
      'Arrive at the office by 08:35, thirty minutes early for coffee and email.',
      'Total time 35 minutes, total cost €69 billed to the corporate account (or personal card with VAT invoice).',
    ],
  },
  {
    title: 'Late-night 02:40 arrival, Airbnb in Vinohrady',
    pick: 'Uber Airport or pre-booked PRESTIGO',
    cost: 'Uber CZK 650–800 / PRESTIGO €83 (with 20 % night surcharge)',
    steps: [
      'Night bus 910 runs 23:47–03:54, but trolleybus 59 doesn\u2019t start until 04:22, leaving the 03:54–04:22 dead zone. 02:40 is inside the 910 window — technically viable but tight.',
      'Bolt surge is common at this hour (1.5–2×) and driver cancellations are frequent.',
      'Uber Airport holds its fixed rate and runs 24/7 from the same kiosks. Walk-up works even at 03:00.',
      'If you\u2019re exhausted and don\u2019t want to think, pre-book PRESTIGO before the flight: driver is inside arrivals with a sign and €83 (night tariff included) is locked.',
      'Either way, avoid walking out to look for a "cheap taxi" at 02:40 in a mostly empty terminal — this is the hour scammers target.',
    ],
  },
  {
    title: 'Wheelchair user, solo, 13:00 Wednesday arrival',
    pick: 'Pre-booked accessible transfer or Trolleybus 59 + Metro A',
    cost: 'Accessible taxi ~€50; public transit €1.80',
    steps: [
      'Book Prague Airport Assistance 36 hours before arrival on +420 220 111 220 — free escort service from plane to ground transport.',
      'Accessible taxi: call Centrum Mobility 1–2 hours before arrival for a ramp-equipped van. Available 24/7 but not at the walk-up rank.',
      'Public transit route: trolleybus 59 is low-floor with boarding ramp and fully wheelchair-accessible. Metro A has lifts at Nádraží Veleslavín and at every Old Town station (Dejvická, Hradčanská, Malostranská, Staroměstská, Můstek, Muzeum).',
      'PRESTIGO V-Class has ramp access on request with 24 h advance notice — book with "accessibility" note.',
    ],
  },
]

// Neighbourhood-by-neighbourhood routing — another genuine gap in every guide
const neighbourhoods = [
  { area: 'Staré Město (Old Town Square)', publicRoute: 'Trolleybus 59 → Metro A → Staroměstská (5-min walk)', taxiTime: '30–40 min', note: 'Old Town is pedestrian-restricted — taxis drop at the edge.' },
  { area: 'Malá Strana (Lesser Town)', publicRoute: 'Trolleybus 59 → Metro A → Malostranská + tram 22', taxiTime: '30–45 min', note: 'Narrow streets — V-Class beats sedans for last-100-m access.' },
  { area: 'Nové Město (Wenceslas Square)', publicRoute: 'Trolleybus 59 → Metro A → Můstek', taxiTime: '30–45 min', note: 'AE bus direct to Hlavní nádraží is also useful.' },
  { area: 'Vinohrady', publicRoute: 'Trolleybus 59 → Metro A → Muzeum, then Metro C 1 stop', taxiTime: '25–35 min', note: 'Wide boulevards — taxi drop-off straightforward.' },
  { area: 'Žižkov', publicRoute: 'Trolleybus 59 → Metro A → Hlavní nádraží + tram', taxiTime: '30–40 min', note: 'Hilly — hostel guests often prefer a taxi for the last leg.' },
  { area: 'Smíchov / Anděl', publicRoute: 'Bus 100 → Metro B → Anděl', taxiTime: '25–35 min', note: 'Bus 100 is the only public-transit pick where it beats trolleybus 59.' },
  { area: 'Karlín', publicRoute: 'Trolleybus 59 → Metro A → Můstek + Metro B', taxiTime: '30–40 min', note: 'Tech and office district — taxi direct is worth the premium.' },
  { area: 'Holešovice', publicRoute: 'Trolleybus 59 → Metro A → Můstek + Metro C (Vltavská)', taxiTime: '30–40 min', note: 'DOX gallery area — taxi easier with luggage.' },
  { area: 'Dejvice / Prague 6', publicRoute: 'Trolleybus 59 → Metro A → Dejvická', taxiTime: '15–25 min', note: 'Closest city district to the airport — Uber often the cheapest option.' },
  { area: 'Vyšehrad / Nusle', publicRoute: 'Trolleybus 59 → Metro A → Muzeum + Metro C', taxiTime: '30–40 min', note: 'Public transit is reasonable; taxi saves 15 min with luggage.' },
]

const faqs = [
  {
    q: 'How long does it take to get from Prague Airport to the city centre?',
    a: 'Door-to-door time depends heavily on your transport mode and final destination. A private chauffeur or taxi covers the 20 km from Václav Havel Airport (PRG) to central Prague in 25 to 35 minutes off-peak (10:00–15:30, after 19:00), or 35 to 50 minutes during the two rush-hour windows (07:30–09:30 and 16:00–18:30 on weekdays). The Airport Express (AE) bus runs 35 to 45 minutes direct to Praha hl.n. but you still need to transfer onward. Trolleybus 59 plus metro A takes 45 to 55 minutes to Staroměstská with one change at Nádraží Veleslavín. In rush hour, public transit is often faster than a taxi because the trolleybus has dedicated priority lanes and the metro is immune to surface traffic. At 02:00 AM nothing runs except taxis and pre-booked transfers; expect 25 minutes. The honest rule of thumb: executive travellers should assume 30 minutes, budget travellers 60 minutes, and everyone should add 15 minutes at weekday rush hour.',
  },
  {
    q: 'What is the cheapest way from Prague Airport to the city centre in 2026?',
    a: 'Trolleybus 59 plus metro A is the cheapest legitimate option at 46 CZK (about €1.80) for a 90-minute PID ticket that covers the entire journey to anywhere in central Prague with unlimited transfers. The ticket is cheapest in the PID Lítačka mobile app, marginally more expensive on paper at the yellow ticket machine (50 CZK) or at the DPP Visitor Centre inside the terminal. A 24-hour PID pass is 120 CZK and worth it if you plan to use Prague public transport at all during your visit. The next cheapest is the Airport Express (AE) bus at 200 CZK — note this doubled from 100 CZK on 1 January 2026, making it significantly less attractive than before. Ride-hail (Bolt, Liftago) runs €18–€26 off-peak, Uber Airport is a fixed €26–€32, and a PRESTIGO chauffeur is €69 in an E-Class. The cheapest option is viable only for travellers with light luggage, confidence navigating a transfer, and a destination near a metro stop — for everyone else the minor extra cost of a taxi is justified.',
  },
  {
    q: 'Is Fix Taxi still the official Prague airport taxi?',
    a: 'No, and any guide that still says this is out of date. Since 26 September 2023, Uber has been the exclusive official taxi rank partner at Václav Havel Airport Prague, with a contract running through at least 2028. Fix Taxi and Taxi Praha, which previously held the official rank, are no longer present at the terminal pickup points. AAA Taxi never held the exclusive rank and is also not at the airport stand in 2026 — you can still book AAA by phone or app for airport pickup, but they will not be waiting there. This means the only walk-up taxi option inside the airport in 2026 is Uber, using either the red self-service kiosks in each arrivals hall, the staffed Uber counter, or the Uber app with the "Uber Airport" fixed-rate tier selected. Everything else — Bolt, Liftago, AAA, PRESTIGO — requires either an app booking or an advance pre-book. Anyone approaching you inside arrivals offering an unbooked taxi ride is not operating from the official rank and should be ignored.',
  },
  {
    q: 'Which terminal does my airline use at Prague Airport?',
    a: 'Václav Havel Airport Prague has two passenger terminals connected by a short indoor walkway. Terminal 2 handles all Schengen flights — arrivals from Germany, France, Austria, Italy, Spain, the Netherlands, the Nordic countries, Switzerland, and any other EU/EEA destination. Terminal 1 handles non-Schengen flights — arrivals from the UK, US, Canada, Ireland, Turkey, the UAE, and any intercontinental route. The walk between terminals is about 3 to 5 minutes indoors; a free airside shuttle exists for passengers with short connecting flights. Crucially for ground transport: both terminals have their own arrivals halls with Uber kiosks, trolleybus 59 stops, Airport Express (AE) bus stops, and public transport. PRESTIGO chauffeurs meet their passengers inside whichever arrivals hall corresponds to your specific flight — you tell us the flight number at booking and we position the driver at the correct gate before you land. If you\u2019re making a tight connection between non-Schengen and Schengen flights, budget at least 90 minutes for the walk plus repeat security.',
  },
  {
    q: 'What do I do if I arrive between 03:54 and 04:22 when nothing runs?',
    a: 'This twenty-eight minute window is the only period of the day when Prague Airport has no running public transport at all. Night bus 910 finishes its last run at 03:54 and trolleybus 59 does not start until 04:22. If you arrive inside that window you have exactly three options. First, walk to the Uber Airport kiosk or counter — Uber runs 24/7 at the fixed rate (CZK 650–800 to central Prague) and availability at this hour is typically good because the fleet pre-positions for dawn arrivals. Second, use Bolt or Liftago via their apps, though expect surge pricing at 1.5–2× the normal rate and occasional driver cancellations. Third, pre-book a PRESTIGO transfer before you fly — a chauffeur is dispatched against your flight number, waits inside arrivals with a sign regardless of landing time, and the €69 E-Class fare plus 20 % night surcharge gives you a locked-in €83 total with zero uncertainty. If your landing is scheduled between roughly 03:30 and 04:30, pre-booking is the only approach that takes the airport guesswork out of the arrival.',
  },
  {
    q: 'How do I buy a Prague public transport ticket at the airport?',
    a: 'Three ways. First and cheapest: the PID Lítačka mobile app (iOS and Android, available in English). Download before you land, add a payment card, buy a 90-minute ticket for 46 CZK or a 24-hour pass for 120 CZK. The ticket activates one minute after purchase — buy it before you reach the trolleybus stop, not while boarding. Second: the yellow ticket machine next to the trolleybus 59 stop outside both arrivals halls. Machines accept contactless cards and most accept coins; paper ticket is 50 CZK. Third: the DPP Visitor Centre inside the arrivals hall, staffed in English, sells the full range of PID tickets and multi-day passes. Czech language is not required for any of these — machines and the app are fully English-language. Keep the ticket on you throughout the journey; random inspector checks happen at the rate of about one per day on the airport route and unticketed passengers face an 800–1500 CZK fine.',
  },
  {
    q: 'Can I walk or cycle from Prague Airport to the city?',
    a: 'Not practically. Václav Havel Airport sits 20 kilometres west-northwest of central Prague, connected by the R7 ring road, industrial estates, and airfield perimeter land. Walking would take 5 to 6 hours on foot and is not legal along most of the route because the main roads are motorway-class. Cycling is theoretically possible on parallel roads via the Ruzyně residential district and the Divoká Šárka nature reserve, but there is no dedicated cycling infrastructure from the airport itself, the road surfaces are mixed quality, and there is no secure bike storage at PRG if you want to leave a bike. If you are a dedicated cyclist tourist, the practical approach is to take the trolleybus 59 into central Prague with the bike folded or taken as luggage (trolleybuses allow this outside rush hour at no extra charge) and start your cycling from the city. For normal travellers, the choice is always taxi, chauffeur, bus, or metro — never walking.',
  },
  {
    q: 'Is Prague airport accessible for wheelchair users?',
    a: 'Yes — Prague Airport is fully accessible, and the route into the city offers multiple accessible options. First, book the airport\u2019s free MaidPro escort service 36 hours before arrival on +420 220 111 220: a trained assistant meets you at the aircraft door and escorts you through customs to your chosen ground transport pickup. Trolleybus 59 is low-floor with a boarding ramp and is fully wheelchair accessible; metro A has lifts at Nádraží Veleslavín (the transfer station) and at every central station (Dejvická, Hradčanská, Malostranská, Staroměstská, Můstek, Muzeum). For taxi options, Centrum Mobility operates wheelchair-accessible vans 24/7 but requires 1–2 hours advance notice — book before landing. Uber\u2019s accessibility tier is limited at PRG and not recommended. PRESTIGO can provide a V-Class with ramp access on request with 24 hours advance notice. For the vast majority of wheelchair travellers arriving at PRG, the combination of MaidPro escort plus trolleybus 59 is the simplest and most reliable option — and also the cheapest.',
  },
  {
    q: 'What happens if I lose my luggage or miss my onward connection?',
    a: 'For lost or delayed checked luggage, file a Property Irregularity Report (PIR) at the airline desk in baggage reclaim before leaving the airport — this is critical for any airline compensation claim. Most airlines deliver lost bags to your Prague address at no cost within 24–48 hours, so you do not need to wait at the airport. For missed onward connections, the AE bus runs directly to Praha hl.n. (the main train station) if you need to catch a train onward; trains to Vienna, Berlin, Brno, and other major cities depart roughly every 1–2 hours during the day. For missed flight connections, your airline\u2019s rebooking desk is in the departures hall of your original terminal. If you pre-booked a PRESTIGO transfer and your arrival is delayed, the chauffeur waits automatically at no extra cost — flight tracking is live from the moment you confirm the booking, so the driver knows the moment your flight lands regardless of scheduling changes. This is the single biggest practical advantage of a pre-booked chauffeur over a walk-up taxi.',
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
      headline: 'Prague Airport to City Centre 2026 — By Passenger Type (Full Guide)',
      description: DESCRIPTION,
      image: {
        '@type': 'ImageObject',
        url: 'https://rideprestigo.com/hero-airport-transfer.webp',
        width: 1200,
        height: 630,
      },
      about: { '@type': 'Place', name: 'Václav Havel Airport Prague' },
      publisher: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      author: personSchemaFor('roman-ustyugov'),
      url: 'https://rideprestigo.com/guides/prague-airport-to-city-center',
      datePublished: ARTICLE_PUBLISHED,
      dateModified: ARTICLE_MODIFIED,
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
          <p className="label mb-6">Travel guide · Updated April 2026</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px]">
            Prague Airport<br />
            <span className="display-italic">to the city centre.</span>
          </h1>
          <p className="body-text text-[14px] mt-6 max-w-2xl" style={{ lineHeight: '1.9' }}>
            Václav Havel Airport (PRG) sits 20 km west-northwest of central Prague, and there are six
            realistic ways to cover the gap. Three things changed recently and almost no online guide has
            caught up: bus 119 was renamed to trolleybus 59 in March 2024; PID ticket prices rose 25–35 % on
            1 January 2026; and Uber took exclusive control of the official taxi rank in September 2023.
            This guide has the current numbers and, unusually, routes you by passenger profile and
            neighbourhood rather than giving you a generic "six options" list.
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

      {/* Quick answer */}
      <section className="bg-anthracite-mid py-14 md:py-16 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">The 30-second answer</p>
          <span className="copper-line mb-6 block" />
          <p className="body-text text-[14px] mb-4" style={{ lineHeight: '1.9' }}>
            The airport is 20 km from central Prague. Driving time is 25–35 min off-peak, 35–50 min at rush hour.
          </p>
          <ul className="flex flex-col gap-3 mt-6">
            {[
              ['Cheapest', 'Trolleybus 59 + Metro A, 46 CZK (€1.80), 45–55 min with one change'],
              ['Best mid-range walk-up', 'Uber Airport kiosk, CZK 650–800 fixed, 30–40 min'],
              ['Fastest door-to-door', 'PRESTIGO E-Class, €69 fixed, 25–35 min with meet & greet'],
              ['Best for families / groups', 'PRESTIGO V-Class, €89 fixed for six with luggage'],
              ['Only option 03:54–04:22', 'Uber Airport or pre-booked PRESTIGO — everything else stops'],
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

      {/* All six options */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="label mb-6">All six options</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-14">Every route from PRG to the centre, <span className="display-italic">with current 2026 fares.</span></h2>
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
                <p className="font-body font-light text-[11px] tracking-[0.08em] uppercase text-warmgrey mb-6">Operating hours: {opt.hours}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-2">
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
                <p className="font-body font-light text-[12px] mt-6 pt-4 border-t border-anthracite-light text-warmgrey" style={{ lineHeight: '1.85' }}>
                  <strong className="text-offwhite">Best for:</strong> {opt.bestFor}
                </p>
                <p className="font-body font-light text-[12px] mt-4 text-warmgrey" style={{ lineHeight: '1.85' }}>
                  <strong className="text-offwhite">How to book:</strong> {opt.booking}
                </p>
                {opt.name.includes('PRESTIGO') && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <a href="/services/airport-transfer" className="font-body font-light text-[11px] tracking-[0.12em] uppercase border border-anthracite-light px-4 py-2 text-offwhite hover:border-copper transition-colors">Airport transfer details</a>
                    <a href="/book" className="font-body font-light text-[11px] tracking-[0.12em] uppercase border border-anthracite-light px-4 py-2 text-offwhite hover:border-copper transition-colors">Book your transfer</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Passenger profiles */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Six real arrivals</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-4">Which option wins for <span className="display-italic">your exact trip?</span></h2>
          <p className="body-text text-[13px] mb-14 max-w-3xl" style={{ lineHeight: '1.9' }}>
            Generic "six options" lists are the norm in every competing guide. We think that\u2019s lazy. These
            six real arrival profiles cover the vast majority of PRG landings, each with a step-by-step
            execution plan.
          </p>
          <div className="flex flex-col gap-12">
            {profiles.map((p) => (
              <div key={p.title} className="border-l-2 border-copper pl-8 py-2">
                <p className="label mb-3" style={{ color: 'var(--copper-light)' }}>{p.pick} · {p.cost}</p>
                <h3 className="font-display font-light text-[22px] md:text-[26px] text-offwhite mb-5">{p.title}</h3>
                <ol className="flex flex-col gap-3">
                  {p.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-4">
                      <span className="font-body font-medium text-[9px] tracking-[0.2em] uppercase pt-1 flex-shrink-0" style={{ color: 'var(--copper)', minWidth: '24px' }}>{String(idx + 1).padStart(2, '0')}</span>
                      <span className="body-text text-[13px]" style={{ lineHeight: '1.85' }}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Neighbourhood routing */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-6xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Routing by neighbourhood</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-4">Where exactly are you <span className="display-italic">staying?</span></h2>
          <p className="body-text text-[13px] mb-10 max-w-3xl" style={{ lineHeight: '1.9' }}>
            The right option depends heavily on your destination neighbourhood — a hostel in Žižkov wants
            a different route than a hotel in Malá Strana. This table pairs the ten most common Prague
            districts with the fastest public-transit route and a taxi-time estimate.
          </p>
          <div className="border border-anthracite-light overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-anthracite-light bg-anthracite-mid">
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-warmgrey">Neighbourhood</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">Public transit route</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">Taxi / chauffeur time</th>
                  <th className="p-4 font-body font-medium text-[10px] tracking-[0.15em] uppercase text-offwhite">Note</th>
                </tr>
              </thead>
              <tbody>
                {neighbourhoods.map((n, i) => (
                  <tr key={n.area} className={i % 2 === 0 ? 'bg-anthracite' : 'bg-anthracite-mid'}>
                    <td className="p-4 font-body font-light text-[12px] text-offwhite border-t border-anthracite-light">{n.area}</td>
                    <td className="p-4 font-body font-light text-[12px] text-warmgrey border-t border-anthracite-light">{n.publicRoute}</td>
                    <td className="p-4 font-body font-light text-[12px] border-t border-anthracite-light" style={{ color: 'var(--copper-light)' }}>{n.taxiTime}</td>
                    <td className="p-4 font-body font-light text-[12px] text-warmgrey border-t border-anthracite-light">{n.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Scam warning */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6" style={{ color: 'var(--copper-light)' }}>⚠ Avoid these three scams</p>
          <span className="copper-line mb-6 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-6">What to ignore <span className="display-italic">inside the terminal.</span></h2>
          <p className="body-text text-[13px] mb-8" style={{ lineHeight: '1.9' }}>
            Despite Uber\u2019s exclusive rank since 2023 and repeated Czech Competition Authority fines, three
            scam patterns are still active at PRG in 2026. They target arriving tourists who are tired,
            disoriented, or without a plan. Here are the three and the rule for each.
          </p>
          <ul className="flex flex-col gap-6">
            {[
              ['Fake "Info" vest touts', 'Individuals in yellow or generic vests approaching you in arrivals offering "taxi help". They walk you to an off-rank unmarked car charging CZK 1,200–1,800 for a €30 ride. Rule: nobody should ever approach you in arrivals offering a ride. Official Uber staff wear distinct red vests and stand behind counters; PRESTIGO chauffeurs hold a printed named sign. Everyone else is a scam.'],
              ['Verbal flat-fare scams', 'An unofficial driver agrees to "CZK 500 to Old Town" verbally, then presents a padded meter at the end with luggage and night surcharges doubling the fare. Rule: never board a vehicle where the price isn\u2019t fixed in writing before pickup. Uber kiosks print a receipt, ride-hail apps show the fare in advance, pre-booked chauffeurs fix the price in the confirmation email.'],
              ['Currency exchange traps', 'Inside the terminal, multiple currency booths quote terrible rates (CZK 20/€ vs the fair CZK 25/€) and some unofficial drivers will insist on payment in euros at those same bad rates. Rule: use the airport ATMs (reasonable rates from Czech banks, not the exchange booths) or pay by card wherever possible. All legitimate taxi options accept card.'],
            ].map(([title, body]) => (
              <li key={title as string} className="border border-anthracite-light p-6">
                <h3 className="font-display font-light text-[18px] text-offwhite mb-3">{title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.85' }}>{body}</p>
              </li>
            ))}
          </ul>
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

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h2 className="display text-[28px] md:text-[36px]">
              Skip the airport taxi rank.<br />
              <span className="display-italic">€69 fixed. Chauffeur inside Arrivals.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">Mercedes E-Class. Free flight tracking. Free waiting on delays. 24/7.</p>
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
