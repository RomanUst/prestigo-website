/**
 * Phase 87 (D-02): the single TypeScript status vocabulary for bookings.status.
 *
 * Pure, no I/O, no Next imports: importable from client components and server code alike.
 *
 * BOOKING_STATUSES lists the values of the latest bookings_status_check in
 * supabase/migrations (084), in the same order. tests/booking-status.test.ts reads that CHECK and
 * fails when this list drifts from it, so adding a status means a migration AND this file.
 *
 * The driver's "I have arrived" step maps to the existing `on_location` status (D-08): there is no
 * `arrived` booking status. The string 'arrived' below is only the driver_assignments.trip_progress
 * mirror value written for that step.
 */

export const BOOKING_STATUSES = [
  'unpaid',
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'assigned',
  'en_route',
  'on_location',
  'on_board',
  'no_show',
] as const

export type BookingStatus = (typeof BOOKING_STATUSES)[number]

export function isBookingStatus(v: unknown): v is BookingStatus {
  return typeof v === 'string' && (BOOKING_STATUSES as readonly string[]).includes(v)
}

/** No further transition is possible (D-09: no_show is terminal). */
export const TERMINAL_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'completed',
  'cancelled',
  'no_show',
])

/**
 * Statuses that count as revenue (stats_trips, panel_bookings, chatwoot value). `no_show` is
 * excluded until Phase 89 introduces a "charged" fact (D-11).
 */
export const REVENUE_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'confirmed',
  'assigned',
  'en_route',
  'on_location',
  'on_board',
  'completed',
])

/** Statuses whose booking keeps a Google Calendar event (a no-show stays on the calendar). */
export const CALENDAR_ACTIVE_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'confirmed',
  'assigned',
  'en_route',
  'on_location',
  'on_board',
  'completed',
  'no_show',
])

/** Admin title-case labels (match the BookingsTable labels). */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  unpaid: 'Unpaid',
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  assigned: 'Assigned',
  en_route: 'En Route',
  on_location: 'On Location',
  on_board: 'On Board',
  no_show: 'No-Show',
}

// ── Driver step flow (D-12) ────────────────────────────────────────────────────

export const DRIVER_STEPS = ['en_route', 'on_site', 'on_board', 'completed'] as const

export type DriverStep = (typeof DRIVER_STEPS)[number]

/** Booking status each driver step moves the booking to. */
export const DRIVER_STEP_TARGET: Record<DriverStep, BookingStatus> = {
  en_route: 'en_route',
  on_site: 'on_location',
  on_board: 'on_board',
  completed: 'completed',
}

/** Button label shown to the driver for each step (87-UI-SPEC). */
export const DRIVER_STEP_LABEL: Record<DriverStep, string> = {
  en_route: 'On my way',
  on_site: 'I have arrived',
  on_board: 'Passenger on board',
  completed: 'Complete trip',
}

/** driver_assignments.trip_progress mirror value written after the status change wins. */
export const DRIVER_STEP_TRIP_PROGRESS: Record<DriverStep, string> = {
  en_route: 'en_route',
  on_site: 'arrived',
  on_board: 'on_board',
  completed: 'completed',
}

const NEXT_STEP: Record<string, DriverStep> = {
  assigned: 'en_route',
  en_route: 'on_site',
  on_location: 'on_board',
  on_board: 'completed',
}

/** The one step a driver may take from the given booking status, or null when none applies. */
export function nextStepFor(status: string): DriverStep | null {
  return Object.prototype.hasOwnProperty.call(NEXT_STEP, status) ? NEXT_STEP[status] : null
}

// ── Partner bookings (D-05) ────────────────────────────────────────────────────

/** True only for bookings farmed in from GNet; they carry no Prestigo money flow. */
export function isPartnerBooking(b: { booking_source?: string | null }): boolean {
  return b.booking_source === 'gnet'
}

export class PartnerBookingMoneyError extends Error {
  constructor(message = 'Partner bookings have no Prestigo money flow') {
    super(message)
    this.name = 'PartnerBookingMoneyError'
  }
}

/** Every Phase 88/89 money entry point must call this first. */
export function assertMoneyEligible(b: { booking_source?: string | null }): void {
  if (isPartnerBooking(b)) throw new PartnerBookingMoneyError()
}
