/**
 * Phase 66: driver permanent trip-link validity predicate (D-03 security boundary).
 *
 * The trip link is valid only when BOTH hold:
 *   (a) the assignment's driver is still the booking's current driver
 *       (driver_id match — self-invalidates on reassignment, no revoke step needed)
 *   (b) the booking's status is NOT terminal (completed / cancelled)
 *
 * Pure, no Supabase/I/O — this is the single source of truth reused by
 * app/driver/trip/[token]/page.tsx (Plan 01) and Phase 67.
 *
 * TERMINAL_STATUSES is hardcoded (not derived at runtime) — matches the two
 * empty-array keys of VALID_TRANSITIONS in lib/booking-transitions.ts.
 */

export const TERMINAL_STATUSES: Set<string> = new Set(['completed', 'cancelled'])

export interface TripLinkValidityInput {
  assignmentDriverId: string
  bookingDriverId: string | null
  bookingStatus: string
}

export function isTripLinkValid(input: TripLinkValidityInput): boolean {
  const { assignmentDriverId, bookingDriverId, bookingStatus } = input
  return (
    bookingDriverId !== null &&
    assignmentDriverId === bookingDriverId &&
    !TERMINAL_STATUSES.has(bookingStatus)
  )
}
