// Phase 45: JSON-LD factory for route and airport-transfer pages.
// Consumed by Plan 45-02 (route pages) and Plan 45-03 (airport-transfer page).
// Prices come from DB (RoutePrice / PricingGlobals) — no hardcoded € values.

import type { RoutePrice } from '@/lib/route-prices'
import type { PricingGlobals } from '@/lib/pricing-config'
import { BCP47_TAG, type AppLocale } from '@/i18n/locales'
import { BUSINESS_PHONE_E164 } from '@/lib/contact-channels'

const BASE_URL = 'https://rideprestigo.com'

// Shared return shape so downstream callers (Plan 02 & 03 spread ['@graph'])
// get proper typing — no 'as' casts needed in page files.
export type JsonLdDocument = {
  '@context': 'https://schema.org'
  '@graph': Array<Record<string, unknown>>
}

export function futureIsoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000)
    .toISOString()
    .split('T')[0]
}

// Service-area business: the Google Business Profile hides the street
// address, so schema exposes only city/country (no street, no postal code,
// no geo pin) plus the served area — keeps NAP consistent with the profile.
// schema.org has no "LimousineService" type: LocalBusiness+TaxiService is the
// closest valid pair, and additionalType names the limousine category.
export const BUSINESS_TYPES = ['LocalBusiness', 'TaxiService']
export const LIMOUSINE_ADDITIONAL_TYPE = 'http://www.productontology.org/id/Limousine'

export const SERVICE_AREA_ADDRESS = {
  '@type': 'PostalAddress',
  addressLocality: 'Prague',
  addressRegion: 'Prague',
  addressCountry: 'CZ',
}

const wd = (q: string) => `https://www.wikidata.org/wiki/${q}`
export const AREA_SERVED = [
  { '@type': 'City', name: 'Prague', sameAs: wd('Q1085') },
  {
    '@type': 'Airport',
    name: 'Václav Havel Airport Prague',
    iataCode: 'PRG',
    icaoCode: 'LKPR',
  },
  { '@type': 'Country', name: 'Czech Republic', sameAs: wd('Q213') },
  { '@type': 'Country', name: 'Germany', sameAs: wd('Q183') },
  { '@type': 'Country', name: 'Austria', sameAs: wd('Q40') },
  { '@type': 'Country', name: 'Slovakia', sameAs: wd('Q214') },
  { '@type': 'Country', name: 'Poland', sameAs: wd('Q36') },
  { '@type': 'Country', name: 'Hungary', sameAs: wd('Q28') },
]

// Schema.org business entity node for the canonical #business @id, so pages
// whose Service nodes reference the provider by @id resolve it on-page.
// aggregateRating is attached ONLY when the caller passes a rating — i.e. a
// page that also renders the visible Google rating badge (HeroRating), as
// Google's review snippet guidelines require the rating to be shown on-page.
export type AggregateRatingInput = { ratingValue: number; reviewCount: number }

export function businessNode(rating?: AggregateRatingInput | null): Record<string, unknown> {
  return {
    '@type': BUSINESS_TYPES,
    additionalType: LIMOUSINE_ADDITIONAL_TYPE,
    '@id': `${BASE_URL}/#business`,
    name: 'PRESTIGO',
    url: BASE_URL,
    telephone: BUSINESS_PHONE_E164,
    email: 'info@rideprestigo.com',
    priceRange: '€€€',
    image: `${BASE_URL}/og-image.jpg`,
    logo: {
      '@type': 'ImageObject',
      url: `${BASE_URL}/logo.png`,
      width: 512,
      height: 512,
    },
    address: SERVICE_AREA_ADDRESS,
    areaServed: AREA_SERVED,
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
    ...(rating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: rating.ratingValue.toFixed(1),
            reviewCount: rating.reviewCount,
            bestRating: '5',
            worstRating: '1',
          },
        }
      : {}),
  }
}

// Wraps businessNode() in a complete JSON-LD document so service-style
// pages can drop in a single <script> tag without composing their own @graph.
export function businessNodeDoc(rating?: AggregateRatingInput | null): JsonLdDocument {
  return { '@context': 'https://schema.org', '@graph': [businessNode(rating)] }
}

// Fleet vehicles as defined on /fleet (Vehicle @ids). Referenced from the
// business entity via `owns` so crawlers link the fleet to the company.
export const FLEET_VEHICLE_IDS = ['e-class', 's-class', 'v-class'].map(
  (m) => `${BASE_URL}/fleet#mercedes-benz-${m}`,
)

type ClassPrices = { e: number | null; s: number | null; v: number | null }

export type BusinessCatalogPrices = {
  /** Airport transfer fare per class (E / S / V). */
  airport: ClassPrices
  /** Hourly chauffeur rate per class (E / S / V). */
  hourly: ClassPrices
  /** Cheapest intercity route fare per class. */
  intercityFrom: ClassPrices
  /** Published day trips with their lowest price. */
  dayTrips: Array<{ slug: string; title: string; lowestPrice: number | null }>
}

const VEHICLE = {
  e: { id: `${BASE_URL}/fleet#mercedes-benz-e-class`, name: 'Mercedes-Benz E-Class', pax: 3, path: '/fleet/e-class' },
  s: { id: `${BASE_URL}/fleet#mercedes-benz-s-class`, name: 'Mercedes-Benz S-Class', pax: 3, path: '/fleet/s-class' },
  v: { id: `${BASE_URL}/fleet#mercedes-benz-v-class`, name: 'Mercedes-Benz V-Class', pax: 6, path: '/fleet/v-class' },
} as const
type Car = keyof typeof VEHICLE

// Catalog of concrete, bookable services for the #business entity — one
// Offer per thing a client can actually buy (car class × service), so
// search engines and LLMs can answer "S-Class with driver in Prague" or
// "V-Class for 6 passengers" with a price and a landing URL. All prices are
// passed in from the pricing DB (admin /admin/pricing) — no hardcoded €.
export function businessOfferCatalog(p: BusinessCatalogPrices): Record<string, unknown> {
  const spec = (price: number | null, hourly = false) =>
    price != null && price > 0
      ? {
          priceSpecification: hourly
            ? { '@type': 'UnitPriceSpecification', price: String(price), priceCurrency: 'EUR', unitCode: 'HUR', unitText: 'hour' }
            : { '@type': 'PriceSpecification', minPrice: String(price), priceCurrency: 'EUR' },
        }
      : {}
  const offer = (o: {
    name: string
    description: string
    path: string
    serviceType: string
    price?: number | null
    hourly?: boolean
    car?: Car
  }) => ({
    '@type': 'Offer',
    url: `${BASE_URL}${o.path}`,
    itemOffered: {
      '@type': 'Service',
      name: o.name,
      description: o.description,
      serviceType: o.serviceType,
      url: `${BASE_URL}${o.path}`,
      areaServed: { '@type': 'City', name: 'Prague' },
      provider: { '@id': `${BASE_URL}/#business` },
      ...(o.car ? { isRelatedTo: { '@id': VEHICLE[o.car].id } } : {}),
    },
    ...spec(o.price ?? null, o.hourly),
    availability: 'https://schema.org/InStock',
  })

  const chauffeurHire: Record<Car, { name: string; description: string; serviceType: string }> = {
    e: {
      name: 'Mercedes E-Class with chauffeur in Prague',
      description: 'Hire a Mercedes-Benz E-Class with a professional English-speaking chauffeur by the hour — up to 3 passengers.',
      serviceType: 'Business sedan with driver',
    },
    s: {
      name: 'Mercedes S-Class limousine with chauffeur in Prague',
      description: 'Hire a Mercedes-Benz S-Class executive limousine with a professional chauffeur by the hour — up to 3 passengers.',
      serviceType: 'Luxury limousine with driver',
    },
    v: {
      name: 'Mercedes V-Class with chauffeur for up to 6 passengers',
      description: 'Hire a Mercedes-Benz V-Class executive van with a professional chauffeur by the hour — up to 6 passengers with luggage.',
      serviceType: 'Executive van with driver',
    },
  }
  const cars: Car[] = ['e', 's', 'v']

  const items = [
    ...cars.map((c) => offer({ ...chauffeurHire[c], path: VEHICLE[c].path, price: p.hourly[c], hourly: true, car: c })),
    ...cars.map((c) =>
      offer({
        name: `Prague Airport (PRG) transfer — ${VEHICLE[c].name}`,
        description: `Fixed-price private transfer between Václav Havel Airport Prague (PRG) and any Prague address in a ${VEHICLE[c].name}, up to ${VEHICLE[c].pax} passengers, meet & greet and flight tracking included.`,
        path: '/services/airport-transfer',
        serviceType: 'Airport transfer',
        price: p.airport[c],
        car: c,
      }),
    ),
    offer({
      name: 'Prague Airport meet & greet',
      description: 'Chauffeur waiting in the PRG arrivals hall with a name sign, flight tracking and free waiting time.',
      path: '/services/airport-meet-and-greet',
      serviceType: 'Airport meet and greet',
      price: p.airport.e,
    }),
    offer({
      name: 'Premium Prague airport taxi alternative',
      description: 'Pre-booked fixed-price Mercedes transfer from Prague airport instead of a taxi.',
      path: '/services/prague-airport-taxi',
      serviceType: 'Airport taxi',
      price: p.airport.e,
    }),
    offer({
      name: 'Private driver in Prague by the hour',
      description: 'Private driver at your disposal in Prague for meetings, shopping or sightseeing.',
      path: '/services/private-driver-prague',
      serviceType: 'Private driver hire',
      price: p.hourly.e,
      hourly: true,
    }),
    offer({
      name: 'Limousine service Prague',
      description: 'Executive Mercedes S-Class limousine service in Prague for VIP arrivals, weddings and business.',
      path: '/services/limousine-prague',
      serviceType: 'Limousine service',
      price: p.hourly.s,
      hourly: true,
      car: 's',
    }),
    offer({
      name: 'City rides in Prague',
      description: 'Chauffeured city rides and hourly hire around Prague.',
      path: '/services/city-rides',
      serviceType: 'City chauffeur service',
      price: p.hourly.e,
      hourly: true,
    }),
    ...cars.map((c) =>
      offer({
        name: `Intercity private transfer from Prague — ${VEHICLE[c].name}`,
        description: `Door-to-door private transfer from Prague to Vienna, Berlin, Munich, Budapest, Kraków and 30+ cities in a ${VEHICLE[c].name}, up to ${VEHICLE[c].pax} passengers.`,
        path: '/routes',
        serviceType: 'Intercity private transfer',
        price: p.intercityFrom[c],
        car: c,
      }),
    ),
    offer({
      name: 'Group transfers in Prague',
      description: 'Transfers for groups and families in Mercedes V-Class vans, up to 6 passengers per vehicle.',
      path: '/services/group-transfers',
      serviceType: 'Group transfer',
      price: p.airport.v,
      car: 'v',
    }),
    offer({
      name: 'Private day trips from Prague',
      description: 'Private chauffeured day trips from Prague with flexible stops.',
      path: '/services/day-trips-from-prague',
      serviceType: 'Private day trip with chauffeur',
      price: minOf(p.dayTrips.map((t) => t.lowestPrice)),
    }),
    ...p.dayTrips.map((t) =>
      offer({
        name: t.title,
        description: `${t.title} — private day trip from Prague with a chauffeur.`,
        path: `/services/${t.slug}`,
        serviceType: 'Private day trip with chauffeur',
        price: t.lowestPrice,
      }),
    ),
    offer({
      name: 'Corporate chauffeur accounts',
      description: 'Monthly invoicing, priority dispatch and a dedicated contact for companies in Prague.',
      path: '/corporate',
      serviceType: 'Corporate ground transportation',
    }),
    offer({
      name: 'VIP & event transport',
      description: 'Chauffeured transport for conferences, weddings and VIP events in Prague.',
      path: '/services/vip-events',
      serviceType: 'Event chauffeur service',
    }),
    offer({
      name: 'Concierge chauffeur service',
      description: 'Chauffeur with concierge help: reservations, errands and itinerary planning in Prague.',
      path: '/services/concierge',
      serviceType: 'Concierge service',
    }),
  ]
  return { '@type': 'OfferCatalog', name: 'PRESTIGO chauffeur services in Prague', itemListElement: items }
}

function minOf(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => typeof x === 'number' && x > 0)
  return v.length > 0 ? Math.min(...v) : null
}

// /contact: ContactPage whose main entity is the #business node, with the
// 24/7 customer-service contact point spelled out for crawlers and LLMs.
export function contactPageDoc(locale: string): JsonLdDocument {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ContactPage',
        '@id': `${BASE_URL}/contact#page`,
        url: `${BASE_URL}/contact`,
        inLanguage: BCP47_TAG[locale as AppLocale] ?? locale,
        mainEntity: { '@id': `${BASE_URL}/#business` },
      },
      {
        ...businessNode(),
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: BUSINESS_PHONE_E164,
          email: 'info@rideprestigo.com',
          contactType: 'customer service',
          areaServed: 'CZ',
          availableLanguage: ['English', 'Czech', 'Russian'],
          hoursAvailable: {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            opens: '00:00',
            closes: '23:59',
          },
        },
      },
    ],
  }
}

export function buildRouteJsonLd(
  route: RoutePrice,
  slug: string,
  opts?: { locale: string; name: string; description: string; rating?: AggregateRatingInput | null }
): JsonLdDocument {
  const priceValidUntil = futureIsoDate(365)
  // EN template stays byte-for-byte the pre-phase hardcoded string (Pitfall
  // 7) — it does NOT match content/routes/en/*.json's metadata.title
  // verbatim, so switching its source unconditionally would silently drift
  // the EN structured-data output. Only a genuinely non-EN locale branches
  // to the content-sourced opts.name/opts.description.
  const isLocalized = !!opts && opts.locale !== 'en'
  const name = isLocalized
    ? opts.name
    : `Private Chauffeur Transfer from ${route.fromLabel} to ${route.toLabel}`
  const description = isLocalized
    ? opts.description
    : `Private chauffeured transfer from ${route.fromLabel} to ${route.toLabel}. Fixed price from €${route.eClassEur}. ${route.distanceKm} km door-to-door in a Mercedes E, S, or V-Class.`
  const inLanguage = BCP47_TAG[(opts?.locale ?? 'en') as AppLocale] ?? opts?.locale ?? 'en'
  return {
    '@context': 'https://schema.org',
    '@graph': [
      businessNode(opts?.rating),
      {
        '@type': 'Service',
        '@id': `${BASE_URL}/routes/${slug}#service`,
        url: `${BASE_URL}/routes/${slug}`,
        inLanguage,
        name,
        description,
        serviceType: 'Private ground transfer',
        areaServed: [
          { '@type': 'Place', name: route.fromLabel },
          { '@type': 'Place', name: route.toLabel },
        ],
        provider: { '@type': 'LocalBusiness', '@id': `${BASE_URL}/#business` },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          itemListElement: [
            {
              '@type': 'Offer',
              name: 'Mercedes E-Class — Business',
              price: String(route.eClassEur),
              priceCurrency: 'EUR',
              availability: 'https://schema.org/InStock',
              priceValidUntil,
              url: `${BASE_URL}/routes/${slug}#e-class`,
            },
            {
              '@type': 'Offer',
              name: 'Mercedes S-Class — First Class',
              price: String(route.sClassEur),
              priceCurrency: 'EUR',
              availability: 'https://schema.org/InStock',
              priceValidUntil,
              url: `${BASE_URL}/routes/${slug}#s-class`,
            },
            {
              '@type': 'Offer',
              name: 'Mercedes V-Class — Business Van',
              price: String(route.vClassEur),
              priceCurrency: 'EUR',
              availability: 'https://schema.org/InStock',
              priceValidUntil,
              url: `${BASE_URL}/routes/${slug}#v-class`,
            },
          ],
        },
      },
    ],
  }
}

export function buildAirportTransferJsonLd(
  globals: PricingGlobals,
  sClassPrice: number,
  vClassPrice: number,
  opts?: { locale?: string; name?: string; description?: string },
): JsonLdDocument {
  const priceValidUntil = futureIsoDate(365)
  const businessPrice = globals.airportPromoActive
    ? globals.airportPromoPriceEur
    : globals.airportRegularPriceEur
  // EN name/description stay the pre-phase hardcoded strings unless a
  // genuine content-model source supplies non-EN text (same pattern as
  // buildRouteJsonLd, SEO-04/D-09) — defaults to 'en' when opts is omitted.
  const isLocalized = !!opts && opts.locale !== undefined && opts.locale !== 'en'
  const name = isLocalized && opts.name ? opts.name : 'Airport Transfer Prague'
  const description = isLocalized && opts.description
    ? opts.description
    : 'Premium airport transfer service at Prague Václav Havel Airport.'
  const inLanguage = BCP47_TAG[(opts?.locale ?? 'en') as AppLocale] ?? opts?.locale ?? 'en'
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${BASE_URL}/services/airport-transfer#service`,
        inLanguage,
        name,
        description,
        provider: { '@type': 'LocalBusiness', '@id': `${BASE_URL}/#business` },
        areaServed: 'Prague, Czech Republic',
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          itemListElement: [
            {
              '@type': 'Offer',
              name: 'Mercedes E-Class — Business',
              price: String(businessPrice),
              priceCurrency: 'EUR',
              availability: 'https://schema.org/InStock',
              priceValidUntil,
            },
            {
              '@type': 'Offer',
              name: 'Mercedes S-Class — First Class',
              price: String(sClassPrice),
              priceCurrency: 'EUR',
              availability: 'https://schema.org/InStock',
              priceValidUntil,
            },
            {
              '@type': 'Offer',
              name: 'Mercedes V-Class — Business Van',
              price: String(vClassPrice),
              priceCurrency: 'EUR',
              availability: 'https://schema.org/InStock',
              priceValidUntil,
            },
          ],
        },
      },
    ],
  }
}
