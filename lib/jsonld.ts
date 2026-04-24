// Phase 45: JSON-LD factory for route pages and airport transfer page.
// buildRouteJsonLd — used by all /routes/{slug} pages (Plans 45-02, 45-02b)
// buildAirportTransferJsonLd — used by /services/airport-transfer (Plan 45-03)

import type { RoutePrice } from '@/lib/route-prices'
import type { PricingGlobals } from '@/lib/pricing-config'

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

export function buildRouteJsonLd(route: RoutePrice, slug: string): JsonLdDocument {
  const priceValidUntil = futureIsoDate(365)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${BASE_URL}/routes/${slug}#service`,
        name: `Private Chauffeur Transfer from ${route.fromLabel} to ${route.toLabel}`,
        serviceType: 'Private ground transfer',
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
): JsonLdDocument {
  const priceValidUntil = futureIsoDate(365)
  const businessPrice = globals.airportPromoActive
    ? globals.airportPromoPriceEur
    : globals.airportRegularPriceEur
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${BASE_URL}/services/airport-transfer#service`,
        name: 'Airport Transfer Prague',
        description: 'Premium airport transfer service at Prague Václav Havel Airport.',
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
