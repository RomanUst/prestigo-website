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

export type BusinessCatalogPrices = {
  airportFrom: number
  intercityFrom: number | null
  hourlyFrom: number | null
  dayTripFrom: number | null
}

// Catalog of the main services with "from" prices for the #business entity.
// All prices are passed in from the pricing DB (admin /admin/pricing) — no
// hardcoded € values here.
export function businessOfferCatalog(p: BusinessCatalogPrices): Record<string, unknown> {
  const fromPrice = (price: number, unit?: string) => ({
    '@type': unit ? 'UnitPriceSpecification' : 'PriceSpecification',
    minPrice: String(price),
    priceCurrency: 'EUR',
    ...(unit ? { price: String(price), unitCode: unit, unitText: 'hour' } : {}),
  })
  const offer = (name: string, path: string, serviceType: string, price: number | null, unit?: string) => ({
    '@type': 'Offer',
    itemOffered: {
      '@type': 'Service',
      name,
      serviceType,
      url: `${BASE_URL}${path}`,
      provider: { '@id': `${BASE_URL}/#business` },
    },
    ...(price != null ? { priceSpecification: fromPrice(price, unit) } : {}),
    availability: 'https://schema.org/InStock',
  })
  return {
    '@type': 'OfferCatalog',
    name: 'PRESTIGO chauffeur services',
    itemListElement: [
      offer('Prague Airport Transfer', '/services/airport-transfer', 'Airport transfer', p.airportFrom),
      offer('Intercity Private Transfers', '/routes', 'Intercity private transfer', p.intercityFrom),
      offer('Hourly Chauffeur Hire', '/services/city-rides', 'Chauffeur hire by the hour', p.hourlyFrom, 'HUR'),
      offer('Private Day Trips from Prague', '/services/day-trips-from-prague', 'Private day trip with chauffeur', p.dayTripFrom),
      offer('Limousine Service Prague', '/services/limousine-prague', 'Limousine service', null),
      offer('Corporate Chauffeur Accounts', '/corporate', 'Corporate ground transportation', null),
      offer('VIP & Event Transport', '/services/vip-events', 'Event chauffeur service', null),
    ],
  }
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
