// Single source for route distances shown on the site.
//
// The admin (route_prices.distance_km) drives the fares, the JSON-LD and
// /llms.txt, so the prose on the route pages must quote the same number —
// otherwise AI answers cite two different distances for one route. Route
// content JSON therefore stores a `{routeKm}` token instead of a typed number,
// and the related-route cards get their distance from the same map.
//
// lib/routes.ts `distanceKm` is only the fallback when the DB is unreachable
// (build without Supabase env) or a route has no route_prices row.

import { getAllRoutes } from '@/lib/route-prices'
import { ROUTES, MIRROR_ROUTES_BY_SLUG } from '@/lib/routes'
import { getRouteContent, type RouteContent } from '@/lib/route-content'

export const ROUTE_KM_TOKEN = '{routeKm}'

/** Inbound mirror slug ('vienna-prague') → the outbound slug that owns the distance. */
function sourceSlug(slug: string): string {
  return MIRROR_ROUTES_BY_SLUG[slug]?.sourceSlug ?? slug
}

/** Outbound slug → road distance in km: admin value, static fallback. */
export async function getRouteDistances(): Promise<Record<string, number>> {
  const distances: Record<string, number> = Object.fromEntries(
    ROUTES.map((r) => [r.slug, r.distanceKm])
  )
  try {
    const rows = await getAllRoutes('slug', { raw: true })
    for (const r of rows) {
      if (r.distanceKm > 0) distances[r.slug] = Math.round(r.distanceKm)
    }
  } catch {
    // keep the static fallback
  }
  return distances
}

/** Pure part of getLiveRouteContent — exported for tests. */
export function applyRouteDistances(
  content: RouteContent,
  slug: string,
  distances: Record<string, number>
): RouteContent {
  const km = distances[sourceSlug(slug)]
  const filled: RouteContent =
    km === undefined
      ? content
      : JSON.parse(JSON.stringify(content).replaceAll(ROUTE_KM_TOKEN, String(km)))
  return {
    ...filled,
    relatedRoutes: filled.relatedRoutes.map((r) => {
      const relatedKm = distances[sourceSlug(r.slug)]
      return relatedKm === undefined
        ? r
        : { ...r, distance: r.distance.replace(/\d+/, String(relatedKm)) }
    }),
  }
}

/** Route content with every distance resolved from the admin. */
export async function getLiveRouteContent(slug: string, locale: string): Promise<RouteContent> {
  const content = getRouteContent(slug, locale)
  return applyRouteDistances(content, slug, await getRouteDistances())
}
