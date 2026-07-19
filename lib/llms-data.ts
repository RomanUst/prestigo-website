// Server-side data loader shared by the /llms.txt and /llms-full.txt route
// handlers. Mirrors the graceful-degradation pattern of app/page.tsx: a
// missing Supabase env or unreachable DB at build time falls back to the
// static price fallbacks instead of failing the build.

import { getAllRoutes } from '@/lib/route-prices'
import { getPricingConfig, type PricingRates } from '@/lib/pricing-config'
import { AIRPORT_FALLBACK, HOURLY_FALLBACK } from '@/lib/price-fallbacks'
import { getAllPosts } from '@/lib/blog'
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
  const [routes, pricing] = await Promise.all([
    getAllRoutes('display_order').catch(() => []),
    getPricingConfig().catch(() => PRICING_FALLBACK),
  ])
  return { routes, pricing, posts: getAllPosts() }
}
