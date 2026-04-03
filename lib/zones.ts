import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'

/**
 * Returns true if (lat, lng) is inside at least one active zone.
 * Returns false if zones array is empty (no restriction applies).
 */
export function isInAnyZone(
  lat: number,
  lng: number,
  zones: Array<{ geojson: unknown }>
): boolean {
  if (zones.length === 0) return false
  const pt = point([lng, lat]) // GeoJSON: longitude first
  return zones.some(zone =>
    booleanPointInPolygon(pt, zone.geojson as Parameters<typeof booleanPointInPolygon>[1])
  )
}
