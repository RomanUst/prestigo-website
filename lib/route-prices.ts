// Phase 44: route_prices helpers (PRICE-06).
// Pattern follows lib/pricing-config.ts exactly — service-role client, no unstable_cache,
// Number() cast for NUMERIC columns.

import { createSupabaseServiceClient } from '@/lib/supabase'

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

// Route pages are statically prerendered (ISR, revalidate=120) and always have
// a ROUTE_FALLBACK price to fall back on. So a missing Supabase env or an
// unreachable DB at build time must degrade to null — NOT throw and fail the
// whole static export. createSupabaseServiceClient() throws synchronously when
// SUPABASE_URL is absent, so the try/catch must wrap construction too.
export async function getRoutePrice(slug: string): Promise<RoutePrice | null> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('route_prices')
      .select(SELECT_COLS)
      .eq('slug', slug)
      .single()

    if (error || !data) return null
    return toRoutePrice(data as Row)
  } catch {
    return null
  }
}

export async function getAllRoutes(
  orderBy: 'display_order' | 'slug' = 'display_order'
): Promise<RoutePrice[]> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('route_prices')
      .select(SELECT_COLS)
      .order(orderBy, { ascending: true })

    if (error || !data) return []
    return (data as Row[]).map(toRoutePrice)
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
