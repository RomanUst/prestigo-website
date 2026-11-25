// Phase 94 plan 94-03 (DCAB-07, Pitfall 3): which assignment is the newest one of its booking.
// A reassigned booking keeps its older assignment rows (declined / pending / accepted); only the newest one is
// the driver's live answer target, so the cabinet and the respond path both compare against this map.

// Minimal structural type of the service client (same approach as lib/driver-cabinet/auth.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = { from: (table: string) => any }

/**
 * bookingId -> id of its newest assignment (latest created_at; ties go to the larger id).
 * One select; an empty input makes no query. A failed query yields an empty map, so no assignment counts as
 * newest and every caller fails closed (not available).
 */
export async function newestAssignmentByBooking(
  supabase: ServiceClient,
  bookingIds: string[],
): Promise<Map<string, string>> {
  const newest = new Map<string, string>()
  if (bookingIds.length === 0) return newest

  const { data, error } = await supabase
    .from('driver_assignments')
    .select('id, booking_id, created_at')
    .in('booking_id', bookingIds)
  if (error || !Array.isArray(data)) return newest

  // Compare by instant first (offset-safe), then by the raw string (sub-millisecond digits), then by id.
  type Candidate = { id: string; ms: number; raw: string }
  const newer = (a: Candidate, b: Candidate): boolean => {
    if (a.ms !== b.ms) return a.ms > b.ms
    if (a.raw !== b.raw) return a.raw > b.raw
    return a.id > b.id
  }
  const best = new Map<string, Candidate>()
  for (const row of data as Array<{ id: string; booking_id: string; created_at: string }>) {
    const raw = String(row.created_at ?? '')
    const parsed = Date.parse(raw)
    const candidate: Candidate = { id: row.id, ms: Number.isFinite(parsed) ? parsed : 0, raw }
    const current = best.get(row.booking_id)
    if (!current || newer(candidate, current)) best.set(row.booking_id, candidate)
  }
  for (const [bookingId, v] of best) newest.set(bookingId, v.id)
  return newest
}
