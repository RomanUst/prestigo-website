// Live prices for editorial content (blog articles, MDX and JSX).
// Articles never spell out a Prestigo fare: they read it from the same
// sources as the route and airport pages — route_prices (admin → Pricing)
// and pricing_config — so a price change in the admin reaches every article
// on the next ISR revalidation, with no code edit.
//
// Use <Price route="prague-vienna" car="v" /> in MDX (registered in
// mdx-components.tsx) or getPriceTable() + priceOf() in JSX pages.
// tests/blog-live-prices.test.ts fails on any hard-coded Prestigo fare.

import { cache } from 'react'
import { getAllRoutes } from '@/lib/route-prices'
import { getPricingConfig } from '@/lib/pricing-config'
import { airportFromPrice } from '@/lib/llms-content'
import { AIRPORT_FALLBACK } from '@/lib/price-fallbacks'

export type CarClass = 'e' | 's' | 'v'
type ClassPrices = Record<CarClass, number>

export type PriceTable = {
  /** Prague airport ↔ city transfer, per vehicle. */
  airport: ClassPrices
  /** route_prices rows keyed by slug, e.g. 'prague-vienna'. */
  routes: Record<string, ClassPrices>
  /** Night-tariff multiplier from pricing_config (1 = no surcharge). */
  nightCoefficient: number
}

/** Pseudo-route name for the airport transfer in <Price route="airport" />. */
export const AIRPORT_ROUTE = 'airport'

// cache(): one DB round-trip per render, however many <Price> an article has.
export const getPriceTable = cache(async (): Promise<PriceTable> => {
  const [routes, pricing] = await Promise.all([
    getAllRoutes('display_order').catch(() => []),
    getPricingConfig().catch(() => null),
  ])
  return {
    airport: {
      e: pricing ? airportFromPrice(pricing) : AIRPORT_FALLBACK.regular,
      s: AIRPORT_FALLBACK.sClass,
      v: AIRPORT_FALLBACK.vClass,
    },
    routes: Object.fromEntries(
      routes.map((r) => [r.slug, { e: r.eClassEur, s: r.sClassEur, v: r.vClassEur }]),
    ),
    nightCoefficient: pricing?.globals.nightCoefficient ?? 1,
  }
})

export type Fares = ClassPrices & { night: ClassPrices; nightPercent: number }

/**
 * All three fares of one route for JSX articles that build prose and JSON-LD
 * from them. A missing price is 0, like ROUTE_FALLBACK on the route pages.
 */
export async function getFares(route: string): Promise<Fares> {
  const table = await getPriceTable()
  const fare = (car: CarClass) => priceOf(table, route, car) ?? 0
  const night = (car: CarClass) => Math.round(fare(car) * table.nightCoefficient)
  return {
    e: fare('e'), s: fare('s'), v: fare('v'),
    night: { e: night('e'), s: night('s'), v: night('v') },
    nightPercent: Math.round((table.nightCoefficient - 1) * 100),
  }
}

/** Fare split per person, rounded: perPerson(505, 6) → 84. */
export function perPerson(fare: number, people: number): number {
  return Math.round(fare / people)
}

/** Fare for one vehicle, or null when the route has no live price. */
export function priceOf(table: PriceTable, route: string, car: CarClass = 'e'): number | null {
  const prices = route === AIRPORT_ROUTE ? table.airport : table.routes[route]
  const value = prices?.[car]
  return value && value > 0 ? value : null
}
