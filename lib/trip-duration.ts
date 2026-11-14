// Client-safe trip-length estimate shared by the Google Calendar sync and the dispatch calendar.
// Pure and import-free on purpose: lib/google-calendar.ts pulls in crypto and the Supabase
// client, which a client component must not bundle.

/** Rough trip length: hourly bookings use their hours, transfers ~70 km/h + 15 min, min 1 h. */
export function estimateDurationMinutes(b: { hours?: number | null; distance_km?: number | null }): number {
  if (b.hours && b.hours > 0) return b.hours * 60
  if (b.distance_km && b.distance_km > 0) {
    return Math.max(60, Math.round(((b.distance_km / 70) * 60 + 15) / 15) * 15)
  }
  return 60
}
