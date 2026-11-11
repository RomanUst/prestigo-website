/**
 * Keyword-variant landing pages (competitor-analysis 2026-10-01, item 3):
 * service variants under /services/<slug> and the FAQ topic cluster under
 * /faq/<slug>. Structural, locale-invariant config lives here; every word of
 * copy lives in content/pages/<locale>/<section>/<slug>.json (LandingContent).
 *
 * Copy may use the price tokens produced by getLandingPrices():
 *   {businessPrice} {vClassAirport} {sClassAirport} — airport transfer fares
 *   {hourlyFrom} {hourlyV} {hourlyS}               — hourly hire rates
 *   {day<Dest>E} {day<Dest>V} {day<Dest>S}          — same-day return fares for
 *     the private day trips (Dest = Krumlov | Kutna | Karlovy | Dresden)
 */

import { getPricingConfig } from '@/lib/pricing-config'
import { AIRPORT_FALLBACK, DAY_TRIP_FALLBACK, HOURLY_FALLBACK } from '@/lib/price-fallbacks'
import { getAllRoutes } from '@/lib/route-prices'

export type LandingSection = 'services' | 'faq' | 'fleet'

/**
 * Structural, locale-invariant facts for the per-vehicle fleet pages
 * (/fleet/<slug>). Mirrors the VehicleSpec table on app/[locale]/fleet —
 * capacities must stay identical to it (tests/fleet-vehicle-pages.test.ts).
 */
export type LandingVehicle = {
  model: string
  /** Cut-out vehicle photo shown in the vehicle section. */
  photo: string
  /** EN body type for the Vehicle JSON-LD node. */
  bodyTypeEn: string
  vehicleConfiguration: string
  seating: number
  luggageCases: number
  luggageBags: number
}

export type LandingPageConfig = {
  slug: string
  section: LandingSection
  /** Hero background; omitted → plain dark hero (FAQ topics). */
  heroImage?: string
  /** Primary CTA target (locale-resolved by the template; may carry a query, e.g. ?class=). */
  ctaHref: string
  /** Fleet pages only — renders the vehicle/spec section and Vehicle JSON-LD. */
  vehicle?: LandingVehicle
}

export const LANDING_PAGES: LandingPageConfig[] = [
  { slug: 'airport-meet-and-greet', section: 'services', heroImage: '/journey-03-arrive.jpg', ctaHref: '/book' },
  { slug: 'prague-airport-taxi', section: 'services', heroImage: '/photohero.jpg', ctaHref: '/book' },
  { slug: 'private-driver-prague', section: 'services', heroImage: '/hero-city-rides.png', ctaHref: '/book' },
  // 2026-11-03: "limousine prague" / "limo service prague" cluster — executive S-Class, no stretch limos.
  { slug: 'limousine-prague', section: 'services', heroImage: '/vehicles/first-int-2.jpg', ctaHref: '/book?class=first_class' },
  // 2026-11-11: private day trips — the largest demand cluster in every
  // English-speaking market ("day trips from prague", "cesky krumlov day trip").
  // Car + chauffeur who waits and drives back the same day; no guide.
  { slug: 'day-trips-from-prague', section: 'services', heroImage: '/hero-intercity-routes.png', ctaHref: '/book' },
  { slug: 'cesky-krumlov-day-trip', section: 'services', heroImage: '/multi-day-hero.png', ctaHref: '/book' },
  { slug: 'kutna-hora-day-trip', section: 'services', heroImage: '/vehicles/van-int-1.jpg', ctaHref: '/book' },
  { slug: 'karlovy-vary-day-trip', section: 'services', heroImage: '/vehicles/business-int-1.jpg', ctaHref: '/book' },
  { slug: 'dresden-day-trip', section: 'services', heroImage: '/hero-group-transfers.png', ctaHref: '/book' },
  { slug: 'child-seats', section: 'faq', ctaHref: '/book' },
  { slug: 'flight-delays', section: 'faq', ctaHref: '/book' },
  { slug: 'tipping-in-prague', section: 'faq', ctaHref: '/book' },
  // Per-vehicle pages (2026-10-31): capture "s class prague", "v class prague",
  // "minivan with driver prague", "e class chauffeur prague". ?class= preselects
  // the vehicle in the booking wizard (components/booking/BookingWizard.tsx).
  {
    slug: 's-class',
    section: 'fleet',
    heroImage: '/vehicles/first-int-1.jpg',
    ctaHref: '/book?class=first_class',
    vehicle: {
      model: 'Mercedes-Benz S-Class',
      photo: '/vehicles/s-class.avif',
      bodyTypeEn: 'Executive Sedan',
      vehicleConfiguration: 'S 450 4MATIC / S 580 e Hybrid',
      seating: 3,
      luggageCases: 2,
      luggageBags: 2,
    },
  },
  {
    slug: 'v-class',
    section: 'fleet',
    heroImage: '/vehicles/van-int-1.jpg',
    ctaHref: '/book?class=business_van',
    vehicle: {
      model: 'Mercedes-Benz V-Class',
      photo: '/vehicles/v-class.avif',
      bodyTypeEn: 'Executive Van',
      vehicleConfiguration: 'V 300 d Extralong AVANTGARDE',
      seating: 6,
      luggageCases: 6,
      luggageBags: 6,
    },
  },
  {
    slug: 'e-class',
    section: 'fleet',
    heroImage: '/vehicles/business-int-1.jpg',
    ctaHref: '/book?class=business',
    vehicle: {
      model: 'Mercedes-Benz E-Class',
      photo: '/vehicles/e-class.avif',
      bodyTypeEn: 'Business Sedan',
      vehicleConfiguration: 'E 220 d / E 300 de Hybrid',
      seating: 3,
      luggageCases: 2,
      luggageBags: 2,
    },
  },
]

export function landingPagesFor(section: LandingSection): LandingPageConfig[] {
  return LANDING_PAGES.filter((p) => p.section === section)
}

export function findLandingPage(section: LandingSection, slug: string): LandingPageConfig | undefined {
  return LANDING_PAGES.find((p) => p.section === section && p.slug === slug)
}

export type LandingContent = {
  metadata: { title: string; description: string; ogTitle: string }
  breadcrumbName: string
  hero: {
    label: string
    headlineLine1: string
    headlineItalic: string
    intro: string
    ctaPrimary: string
    ctaSecondary: string
    imageAlt: string
  }
  glance: { label: string; items: { label: string; value: string }[] }
  intro: { headingLine1: string; headingItalic: string; paragraphs: string[] }
  features: { label: string; headingLine1: string; headingItalic: string; items: { title: string; body: string }[] }
  steps: { label: string; heading: string; items: { title: string; body: string }[] }
  editorial: { label: string; headingLine1: string; headingItalic: string; paragraphs: string[] }
  faqsHeading: string
  faqs: { q: string; a: string }[]
  related: { label: string; heading: string; links: { href: string; title: string; body: string }[] }
  /** buttonText omitted → the bottom CTA reuses hero.ctaPrimary. */
  cta: { headingLine1: string; headingItalic: string; buttonText?: string }
  /** Fleet pages only — copy for the vehicle/spec section. */
  vehicle?: {
    label: string
    headingLine1: string
    headingItalic: string
    photoAlt: string
    seatsLabel: string
    seatsValue: string
    luggageLabel: string
    luggageValue: string
    includedLabel: string
    included: string[]
  }
}

/** Day-trip destinations → the route whose distance prices the trip. */
export const DAY_TRIP_ROUTES = {
  Krumlov: 'prague-cesky-krumlov',
  Kutna: 'prague-kutna-hora',
  Karlovy: 'prague-karlovy-vary',
  Dresden: 'prague-dresden',
} as const

/**
 * A day trip is a same-day return booking: the outbound fare plus the return
 * leg with the admin return discount — the same sum the booking form charges
 * for a round trip (lib/server-pricing.ts computeReturnLegEur, no night or
 * holiday coefficient). The chauffeur's waiting time on site is not charged.
 */
export function dayTripFare(oneWayEur: number, returnDiscountPercent: number): number {
  return oneWayEur + Math.round(oneWayEur * (1 - returnDiscountPercent / 100))
}

async function getDayTripPrices(returnDiscountPercent: number): Promise<Record<string, number>> {
  const routes = await getAllRoutes('slug')
  const out: Record<string, number> = {}
  for (const [dest, slug] of Object.entries(DAY_TRIP_ROUTES) as [keyof typeof DAY_TRIP_ROUTES, string][]) {
    const r = routes.find((x) => x.slug === slug)
    const fb = DAY_TRIP_FALLBACK[dest]
    out[`day${dest}E`] = r && r.eClassEur > 0 ? dayTripFare(r.eClassEur, returnDiscountPercent) : fb.e
    out[`day${dest}V`] = r && r.vClassEur > 0 ? dayTripFare(r.vClassEur, returnDiscountPercent) : fb.v
    out[`day${dest}S`] = r && r.sClassEur > 0 ? dayTripFare(r.sClassEur, returnDiscountPercent) : fb.s
  }
  return out
}

export async function getLandingPrices(): Promise<Record<string, number>> {
  const { globals, hourlyRate } = await getPricingConfig()
  const dayTrips = await getDayTripPrices(Number(globals.returnDiscountPercent ?? 10))
  return {
    ...dayTrips,
    businessPrice: globals.airportPromoActive ? globals.airportPromoPriceEur : globals.airportRegularPriceEur,
    vClassAirport: AIRPORT_FALLBACK.vClass,
    sClassAirport: AIRPORT_FALLBACK.sClass,
    hourlyFrom: hourlyRate['business'] ?? HOURLY_FALLBACK.business,
    hourlyV: hourlyRate['business_van'] ?? HOURLY_FALLBACK.business_van,
    hourlyS: hourlyRate['first_class'] ?? HOURLY_FALLBACK.first_class,
  }
}
