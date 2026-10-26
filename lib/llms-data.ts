// Server-side data loader shared by the /llms.txt and /llms-full.txt route
// handlers. Mirrors the graceful-degradation pattern of app/page.tsx: a
// missing Supabase env or unreachable DB at build time falls back to the
// static price fallbacks instead of failing the build.

import { getAllRoutes } from '@/lib/route-prices'
import { ROUTES_BY_SLUG } from '@/lib/routes'
import { getPricingConfig, type PricingRates } from '@/lib/pricing-config'
import { AIRPORT_FALLBACK, HOURLY_FALLBACK } from '@/lib/price-fallbacks'
import { getAllPosts } from '@/lib/blog'
import { getCachedAggregateRating, getStaticAggregateRating } from '@/lib/google-reviews'
import type { LlmsData } from '@/lib/llms-content'

const PRICING_FALLBACK: PricingRates = {
  globals: {
    airportPromoActive: false,
    airportRegularPriceEur: AIRPORT_FALLBACK.regular,
    airportPromoPriceEur: AIRPORT_FALLBACK.promo,
    airportFee: 0, nightCoefficient: 1, holidayCoefficient: 1,
    extraChildSeat: 0, extraLuggage: 0, holidayDates: [],
    returnDiscountPercent: 0, hourlyMinHours: 1, hourlyMaxHours: 12,
    notificationFlags: null,
  },
  hourlyRate: HOURLY_FALLBACK as Record<string, number>,
  ratePerKm: {},
  dailyRate: {},
  minFare: {},
}

export async function loadLlmsData(): Promise<LlmsData> {
  const [routes, pricing, rating] = await Promise.all([
    getAllRoutes('display_order').catch(() => []),
    getPricingConfig().catch(() => PRICING_FALLBACK),
    getCachedAggregateRating().catch(() => getStaticAggregateRating()),
  ])
  // route_prices still holds rows for the 20 routes removed 2026-04-09 (they
  // 308 to /routes, see next.config.ts) — list only routes with a live page.
  const liveRoutes = routes.filter((r) => r.slug in ROUTES_BY_SLUG)
  return { routes: liveRoutes, pricing, posts: getAllPosts(), rating: rating ?? null }
}
