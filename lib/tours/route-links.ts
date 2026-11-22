/**
 * Phase 93-15 (SEO map rule 2): pure helpers linking a route page ("Prague -> X transfer")
 * to its day-trip tour page ("X day trip from Prague"), so the two pages hand the query
 * intent to each other instead of competing for it.
 */
import { ROUTES_BY_SLUG } from '@/lib/routes'

const ROUTE_PREFIX = 'prague-'
const TOUR_SUFFIX = '-day-trip'

/**
 * 'prague-dresden' -> 'dresden-day-trip'. When `publishedSlugs` is given (the published tour
 * list), returns the slug only if that tour is published; otherwise null.
 */
export function tourSlugForRoute(routeSlug: string, publishedSlugs?: readonly string[]): string | null {
  if (!routeSlug.startsWith(ROUTE_PREFIX) || routeSlug.length === ROUTE_PREFIX.length) return null
  const slug = `${routeSlug.slice(ROUTE_PREFIX.length)}${TOUR_SUFFIX}`
  if (publishedSlugs && !publishedSlugs.includes(slug)) return null
  return slug
}

/** 'dresden-day-trip' -> 'prague-dresden' when lib/routes.ts has that route, else null. */
export function routeSlugForTour(tourSlug: string): string | null {
  if (!tourSlug.endsWith(TOUR_SUFFIX) || tourSlug.length === TOUR_SUFFIX.length) return null
  const routeSlug = `${ROUTE_PREFIX}${tourSlug.slice(0, -TOUR_SUFFIX.length)}`
  return ROUTES_BY_SLUG[routeSlug] ? routeSlug : null
}
