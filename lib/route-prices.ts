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

export async function getRoutePrice(slug: string): Promise<RoutePrice | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('route_prices')
    .select(SELECT_COLS)
    .eq('slug', slug)
    .single()

  if (error || !data) return null
  return toRoutePrice(data as Row)
}

export async function getAllRoutes(
  orderBy: 'display_order' | 'slug' = 'display_order'
): Promise<RoutePrice[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('route_prices')
    .select(SELECT_COLS)
    .order(orderBy, { ascending: true })

  if (error || !data) return []
  return (data as Row[]).map(toRoutePrice)
}

// Phase 44 stub — place_ids are all empty per D-02. Phase 47 (Calculator)
// fills in the actual matching strategy.
export async function findRouteByPlaceIds(
  _originId: string,
  _destinationId: string
): Promise<RoutePrice | null> {
  return null
}
