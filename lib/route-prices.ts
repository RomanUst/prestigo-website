// Phase 44: route_prices helpers (PRICE-06).
// Pattern follows lib/pricing-config.ts exactly — service-role client, no unstable_cache,
// Number() cast for NUMERIC columns.

import { createSupabaseServiceClient } from '@/lib/supabase'
import { getPricingConfig, type PricingRates } from '@/lib/pricing-config'

export type RoutePrice = {
  slug: string
  fromLabel: string
  toLabel: string
  distanceKm: number
  eClassEur: number
  sClassEur: number
  vClassEur: number
  displayOrder: number
  placeIds: string[]
}

const SELECT_COLS =
  'slug, from_label, to_label, distance_km, e_class_eur, s_class_eur, v_class_eur, display_order, place_ids'

type Row = {
  slug: string
  from_label: string
  to_label: string
  distance_km: number | string
  e_class_eur: number | string
  s_class_eur: number | string
  v_class_eur: number | string
  display_order: number | string
  place_ids: string[] | null
}

function toRoutePrice(r: Row): RoutePrice {
  return {
    slug: r.slug,
    fromLabel: r.from_label,
    toLabel: r.to_label,
    distanceKm: Number(r.distance_km),
    eClassEur: Number(r.e_class_eur),
    sClassEur: Number(r.s_class_eur),
    vClassEur: Number(r.v_class_eur),
    displayOrder: Number(r.display_order),
    placeIds: r.place_ids ?? [],
  }
}

/**
 * Public "from" fares = what the booking form charges for a centre-to-centre
 * trip: road distance (route_prices.distance_km) × per-km rate from admin →
 * pricing, clamped to the class minimum fare. Same formula as
 * /api/calculate-price (buildPriceMap + applyGlobals without night, holiday or
 * airport surcharges), so the route page never shows less than the form asks.
 * The stored e/s/v columns stay as a fallback when the pricing config is
 * unavailable, and are what the admin editor reads (`raw: true`).
 */
export function applyDistanceFares(route: RoutePrice, rates: PricingRates): RoutePrice {
  if (!(route.distanceKm > 0)) return route
  const fare = (vc: 'business' | 'first_class' | 'business_van', stored: number) => {
    const perKm = rates.ratePerKm?.[vc]
    if (!(perKm > 0)) return stored
    return Math.max(Math.round(route.distanceKm * perKm), rates.minFare?.[vc] ?? 0)
  }
  return {
    ...route,
    eClassEur: fare('business', route.eClassEur),
    sClassEur: fare('first_class', route.sClassEur),
    vClassEur: fare('business_van', route.vClassEur),
  }
}

async function withDistanceFares(routes: RoutePrice[]): Promise<RoutePrice[]> {
  if (routes.length === 0) return routes
  try {
    const rates = await getPricingConfig()
    return routes.map((r) => applyDistanceFares(r, rates))
  } catch {
    return routes
  }
}

// Route pages are statically prerendered (ISR, revalidate=120) and always have
// a ROUTE_FALLBACK price to fall back on. So a missing Supabase env or an
// unreachable DB at build time must degrade to null — NOT throw and fail the
// whole static export. createSupabaseServiceClient() throws synchronously when
// SUPABASE_URL is absent, so the try/catch must wrap construction too.
export async function getRoutePrice(slug: string, opts: { raw?: boolean } = {}): Promise<RoutePrice | null> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('route_prices')
      .select(SELECT_COLS)
      .eq('slug', slug)
      .single()

    if (error || !data) return null
    const route = toRoutePrice(data as Row)
    return opts.raw ? route : (await withDistanceFares([route]))[0]
  } catch {
    return null
  }
}

export async function getAllRoutes(
  orderBy: 'display_order' | 'slug' = 'display_order',
  opts: { raw?: boolean } = {},
): Promise<RoutePrice[]> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('route_prices')
      .select(SELECT_COLS)
      .order(orderBy, { ascending: true })

    if (error || !data) return []
    const routes = (data as Row[]).map(toRoutePrice)
    return opts.raw ? routes : await withDistanceFares(routes)
  } catch {
    return []
  }
}

export async function findRouteByPlaceIds(
  originId: string,
  destinationId: string
): Promise<RoutePrice | null> {
  if (!originId || !destinationId) return null
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('route_prices')
    .select(SELECT_COLS)
  if (error || !data) return null
  const routes = (data as Row[]).map(toRoutePrice)
  // Order-independent match: both placeIds must be in the route's place_ids[]
  const match = routes.find(
    (r) =>
      r.placeIds.length >= 2 &&
      r.placeIds.includes(originId) &&
      r.placeIds.includes(destinationId)
  )
  return match ?? null
}
