// Builders for /llms.txt and /llms-full.txt.
//
// These files used to be static copies in public/ and drifted badly from the
// live pricing DB (every route price stale, 20 dead prague-to-* links, three
// different airport "from" prices across surfaces). They are now generated
// from the same sources as the pages themselves — route_prices and
// pricing_globals — via the route handlers in app/llms.txt and
// app/llms-full.txt (ISR, hourly revalidate).

import type { RoutePrice } from '@/lib/route-prices'
import type { PricingRates } from '@/lib/pricing-config'
import type { BlogPost } from '@/lib/blog'

const BASE = 'https://rideprestigo.com'

export type LlmsData = {
  routes: RoutePrice[]
  pricing: PricingRates
  posts: BlogPost[]
}

export function airportFromPrice(pricing: PricingRates): number {
  const { globals } = pricing
  return globals.airportPromoActive
    ? globals.airportPromoPriceEur
    : globals.airportRegularPriceEur
}

function eur(n: number): string {
  return `€${n.toLocaleString('en-US')}`
}

function routeLine(r: RoutePrice): string {
  return `- [${r.fromLabel} to ${r.toLabel}](${BASE}/routes/${r.slug}): From ${eur(r.eClassEur)}, ${r.distanceKm} km door-to-door.`
}

function postLine(p: BlogPost): string {
  return `- [${p.title}](${BASE}/blog/${p.slug}): ${p.description}`
}

export function buildLlmsTxt(data: LlmsData): string {
  const { routes, pricing, posts } = data
  const airport = airportFromPrice(pricing)
  const routesBlock =
    routes.length > 0
      ? routes.map(routeLine).join('\n')
      : `- [All intercity routes](${BASE}/routes): 30 fixed-price destinations across Central Europe.`

  return `# Prestigo

> Premium chauffeur service in Prague, Czech Republic. Airport transfers, intercity routes across Central Europe, corporate accounts. All-Mercedes fleet, fixed pricing, 24/7.

## Key Pages

- [Prague Airport Transfer](${BASE}/services/airport-transfer): From ${eur(airport)}, meet-and-greet, 60-min free wait, flight tracking.
- [Intercity Routes](${BASE}/routes): 30 fixed-price destinations across Central Europe.
- [FAQ](${BASE}/faq): Booking, pricing, cancellation, vehicle questions.
- [Corporate Accounts](${BASE}/corporate): Monthly invoicing, dedicated account manager, priority dispatch.
- [Fleet](${BASE}/fleet): Mercedes E-Class, S-Class, V-Class — full spec and pricing.

## Routes

${routesBlock}

## Services

- [City Rides Prague](${BASE}/services/city-rides): Hourly hire, point-to-point city transfers.
- [Group Transfers](${BASE}/services/group-transfers): Up to 50 passengers, Mercedes V-Class fleet.
- [VIP & Events](${BASE}/services/vip-events): Galas, private events, hotel-to-venue coordination.

## Guides & Comparisons

${posts.map(postLine).join('\n')}

## Optional

- [About](${BASE}/about): Founded 2016, Roman Ustyugov, ICO 05650801.
- [Privacy Policy](${BASE}/privacy)
- [Terms](${BASE}/terms)
`
}

export function buildLlmsFullTxt(data: LlmsData): string {
  const { routes, pricing, posts } = data
  const airport = airportFromPrice(pricing)
  const hourly = pricing.hourlyRate
  const eClassHourly = hourly['business']
  const sClassHourly = hourly['first_class']
  const vClassHourly = hourly['business_van']
  const today = new Date().toISOString().slice(0, 10)

  const priceList =
    routes.length > 0
      ? routes
          .map((r) => `${r.toLabel} ${eur(r.eClassEur)}`)
          .join(' · ')
      : `see ${BASE}/routes`

  const hourlyLine = (v: number | undefined): string =>
    v ? `Hourly hire from ${eur(v)}/hour` : 'Hourly hire configured per booking'

  return `# PRESTIGO — Premium Chauffeur Service in Prague

> PRESTIGO is a boutique chauffeur service in Prague, Czech Republic, operating an all-Mercedes-Benz fleet (E-Class, S-Class, V-Class) for airport transfers, intercity routes across Central Europe, hourly city hire, corporate accounts, VIP events, and group transfers. Fixed pricing, 24/7 availability, meet-and-greet at Václav Havel Airport (PRG), 60 minutes of complimentary wait time included.

- **Website:** ${BASE}
- **Phone / WhatsApp:** +420 725 986 855
- **Email:** info@rideprestigo.com
- **Base:** Prague, Czech Republic
- **Languages:** English, Czech
- **Founded:** 2016
- **Legal entity:** chelautotrans s.r.o. (trading as PRESTIGO), IČO 05650801, Spojovací 685, Vysoký Újezd, Czech Republic

---

## Founder

**Roman Ustyugov** — Founder & Chief Experience Officer. Personally curates every aspect of the service: driver selection, route planning, vehicle standards, and the hospitality protocols that separate Prestigo from commodity transfer services. Positioning: "The first person in Prague who is already on your side." Public profile: ${BASE}/authors/roman-ustyugov.

---

## Fleet

All vehicles are late-model Mercedes-Benz, fully insured, non-smoking, equipped with Wi-Fi and phone chargers.

### Mercedes-Benz E-Class — Business Sedan
- Seating: up to 3 passengers
- Luggage: 2 large cases + 2 cabin bags
- Ideal for: airport transfers, city rides, solo business travel
- ${hourlyLine(eClassHourly)}
- Transmission: automatic · Fuel: hybrid · Drive: RWD

### Mercedes-Benz S-Class — Executive Sedan
- Seating: up to 3 passengers
- Luggage: 2 large cases + 2 cabin bags
- Ideal for: VIP travel, diplomatic missions, extended intercity routes
- ${hourlyLine(sClassHourly)}
- Transmission: automatic · Fuel: hybrid · Drive: RWD

### Mercedes-Benz V-Class — Executive Van
- Seating: up to 6 passengers
- Luggage: 6 large cases + 6 cabin bags
- Ideal for: groups, families, conference transfers
- ${hourlyLine(vClassHourly)}
- Transmission: automatic · Fuel: diesel

For larger groups (up to 50 passengers), Prestigo operates a V-Class convoy model via the Group Transfers service.

---

## Services

### Airport Transfer (Václav Havel Airport, PRG)
- Meet-and-greet at Arrivals with a name board
- Real-time flight tracking — delays cost nothing extra
- 60 minutes of free waiting on arrival
- Fixed price, all tolls included
- From ${eur(airport)} (E-Class)
- Page: ${BASE}/services/airport-transfer

### Intercity Routes
- 30 fixed-price routes across Central Europe
- Door-to-door, no transfers, no waiting at stations
- Page: ${BASE}/routes

### City Rides & Hourly Hire
- Point-to-point transfers within Prague
- Hourly chauffeur hire — driver stays with you for meetings, shopping, events
- Page: ${BASE}/services/city-rides

### Corporate Accounts
- Monthly invoicing (no per-ride card charges)
- Dedicated account manager
- Priority dispatch, preferred driver assignment
- Custom reporting and cost centre allocation
- Page: ${BASE}/corporate

### VIP & Events
- Galas, private events, weddings, film production
- Hotel-to-venue coordination, multi-car convoys
- Discreet drivers, branded or unbranded service
- Page: ${BASE}/services/vip-events

### Group Transfers
- Up to 50 passengers via V-Class fleet
- Conference, wedding, sports team, incentive travel
- Single dispatch contact, synchronised arrivals
- Page: ${BASE}/services/group-transfers

---

## Intercity Route Prices (from €, one-way, fixed, Mercedes E-Class)

${priceList}

Full route list with per-page detail: ${BASE}/routes

---

## Operating Details

- **Hours:** 24/7, every day of the year
- **Minimum lead time:** 12 hours for online bookings; last-minute via phone/WhatsApp +420 725 986 855
- **Booking confirmation:** instant — no callback wait
- **Payment:** card at booking (Stripe) or corporate monthly invoicing
- **Currencies:** EUR, CZK
- **Driver communication:** contact number provided before pickup
- **Vehicle amenities:** Wi-Fi, phone charger, bottled water

---

## Pricing Policy

- **Fixed pricing.** The price shown at booking is the price paid. No surge, no hidden tolls, no extras unless requested.
- **Tolls included** on all routes.
- **No waiting-time fee** at airport pickups (first 60 minutes).
- **Free child seats** on request at booking (infant, toddler, booster).
- **Multi-stop and hourly rates** are configured per booking.

---

## Cancellation & Changes

- **Free cancellation** up to 1 hour before scheduled pickup.
- **Later cancellations** may incur a fee.
- **Time changes** — unlimited before the journey; contact the assigned driver or use the booking portal.
- **Flight cancellations** — full refund or free reschedule.

---

## Frequently Asked Questions

**How do I book?** Online at ${BASE}/book — select route, vehicle, date, confirm. Instant confirmation. For bookings under 12 hours out, call +420 725 986 855.

**Is the price fixed?** Yes. No surge pricing, no hidden tolls, no extras unless requested.

**Are tolls included?** Yes, on every route.

**What happens if my flight is delayed?** The driver monitors your flight in real time. Delays cost nothing extra.

**How will I find my driver at the airport?** The driver waits at Arrivals with a name board. Contact number sent before landing.

**Can I book for someone else?** Yes. Enter the passenger's name at checkout.

**Do you offer corporate accounts?** Yes — monthly invoicing, dedicated account manager, priority dispatch. ${BASE}/corporate

**Can I request a specific vehicle?** Yes, at the time of booking.

**Is there Wi-Fi?** Yes, in every vehicle, plus phone chargers on request.

**What languages do drivers speak?** English and Czech. Other languages available on request for corporate and VIP bookings.

---

## Service Area

- **Primary:** Prague and Václav Havel Airport (PRG)
- **Intercity:** 30 fixed-price routes across Austria, Germany, Poland, Hungary, Slovakia, and the Czech Republic
- **Door-to-door:** pickup and drop-off at any address — hotel, residence, office, venue, station, airport

---

## Guides & Comparisons (Editorial)

${posts.map((p) => `- ${p.title}: ${BASE}/blog/${p.slug}`).join('\n')}

---

## Contact

- **Phone / WhatsApp:** +420 725 986 855 (24/7)
- **Email:** info@rideprestigo.com
- **Booking:** ${BASE}/book
- **Contact form:** ${BASE}/contact
- **Instagram:** https://www.instagram.com/rideprestigo/
- **Facebook:** https://www.facebook.com/profile.php?id=61574283117859

---

## Legal

- **Trading name:** PRESTIGO
- **Legal entity:** chelautotrans s.r.o.
- **IČO (company ID):** 05650801
- **Registered address:** Spojovací 685, Vysoký Újezd, Czech Republic
- **Privacy Policy:** ${BASE}/privacy
- **Terms of Service:** ${BASE}/terms

---

*Last updated: ${today}*
`
}
