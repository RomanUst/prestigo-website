/**
 * Phase 66: driver permanent trip-link validity predicate (D-03 security boundary).
 * Phase 87: extended with the no_show terminal status (D-09), declined assignments and the
 * three-way view state (D-17).
 *
 * The trip link MAY WRITE (isTripLinkValid) only when ALL hold:
 *   (a) the assignment's driver is still the booking's current driver
 *       (driver_id match — self-invalidates on reassignment, no revoke step needed)
 *   (b) the assignment was not declined
 *   (c) the booking's status is NOT terminal (completed / cancelled / no_show)
 *
 * tripLinkViewState decides what the page shows:
 *   'active'    — may write, render the step flow
 *   'completed' — matching, non-declined assignment on a completed booking: "Trip completed"
 *                 screen with the details hidden
 *   'ended'     — everything else (cancelled, no_show, reassigned, declined, driverless): the single
 *                 uniform "link no longer active" state. Unknown tokens render the same view, so the
 *                 anti-enumeration rule holds.
 *
 * Pure, no Supabase/I/O — this is the single source of truth reused by
 * app/(internal)/driver/trip/[token]/page.tsx and the progress route.
 */

import { TERMINAL_BOOKING_STATUSES } from '@/lib/booking-status'

export const TERMINAL_STATUSES: Set<string> = new Set<string>(TERMINAL_BOOKING_STATUSES)

export interface TripLinkValidityInput {
  assignmentDriverId: string
  bookingDriverId: string | null
  bookingStatus: string
  assignmentStatus?: string | null
}

function isCurrentDriver(input: TripLinkValidityInput): boolean {
  return (
    input.bookingDriverId !== null &&
    input.assignmentDriverId === input.bookingDriverId &&
    input.assignmentStatus !== 'declined'
  )
}

export function isTripLinkValid(input: TripLinkValidityInput): boolean {
  return isCurrentDriver(input) && !TERMINAL_STATUSES.has(input.bookingStatus)
}

export type TripLinkViewState = 'active' | 'completed' | 'ended'

export function tripLinkViewState(input: TripLinkValidityInput): TripLinkViewState {
  if (!isCurrentDriver(input)) return 'ended'
  if (input.bookingStatus === 'completed') return 'completed'
  if (TERMINAL_STATUSES.has(input.bookingStatus)) return 'ended'
  return 'active'
}
