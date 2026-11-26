// Phase 94 plan 94-07 (DCAB-05, DCAB-09; D-01, D-11, D-12): which view one ride id opens in the cabinet.
//
// resolveCabinetRide looks the assignment up by (id, driver_id = the session driver) only, so an unknown id, another
// driver's id, a declined assignment and a superseded one (not the newest of its booking) are all the same answer:
// not_available. Read-only: this module never writes, and the trip token is returned to the server page only
// (the cabinet URL holds the assignment id, never a token).
//
// Only data a driver may see goes into the closed-ride summary: reference, day, time, route, class and, for a
// completed ride, the driver's own fee. Never a passenger name, phone, flight, notes, client fare or payment field.

import { formatVehicleLabel } from '@/lib/email'
import { formatPickupDate, formatPickupTime } from '@/lib/driver-trip-format'
import { IN_PROGRESS_BOOKING_STATUSES, TERMINAL_BOOKING_STATUSES } from '@/lib/booking-status'
import { newestAssignmentByBooking } from '@/lib/driver-cabinet/assignments'
import { driverFeeLabel, dropoffText } from '@/lib/driver-cabinet/format'
import { isValidMonth } from '@/lib/driver-cabinet/rides'

// Minimal structural type of the service client: the tests pass an in-memory stand-in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = { from: (table: string) => any }

/** Column gate: no client name, phone, email, flight, notes, client fare or payment column. */
export const RIDE_DETAIL_SELECT =
  'id, driver_id, status, trip_token, booking_id, bookings!inner(id, booking_reference, status, pickup_date, pickup_time, origin_address, destination_address, vehicle_class, driver_price_czk)'

export interface RideSummary {
  bookingReference: string
  dateLabel: string
  pickupTime: string
  pickup: string
  dropoff: string
  vehicleLabel: string
  /** The driver's own fee ('2 500 Kč'); set for a completed ride with a positive-integer fee only. */
  feeLabel: string | null
}

export type CabinetRideResolution =
  | { kind: 'trip'; tripToken: string }
  | { kind: 'closed'; state: 'completed' | 'cancelled' | 'no_show'; backHref: string; summary: RideSummary }
  | { kind: 'offer' }
  | { kind: 'not_available' }

interface DetailBooking {
  id: string
  booking_reference: string | null
  status: string
  pickup_date: string
  pickup_time: string
  origin_address: string | null
  destination_address: string | null
  vehicle_class: string | null
  driver_price_czk: number | null
}

interface DetailRow {
  id: string
  driver_id: string
  status: string
  trip_token: string | null
  booking_id: string
  bookings: DetailBooking | DetailBooking[] | null
}

const NOT_AVAILABLE: CabinetRideResolution = { kind: 'not_available' }
const STARTED_STATUSES: ReadonlySet<string> = IN_PROGRESS_BOOKING_STATUSES
const OFFER_STATUSES: ReadonlySet<string> = new Set(['assigned', 'confirmed'])

/** Back target of a closed ride: the Past view of the ride's Prague month (deterministic, no history dependence). */
function pastBackHref(pickupDate: string): string {
  const month = typeof pickupDate === 'string' ? pickupDate.slice(0, 7) : ''
  return isValidMonth(month) ? `/driver/rides?view=past&month=${month}` : '/driver/rides?view=past'
}

function summaryOf(booking: DetailBooking, withFee: boolean): RideSummary {
  const pickup = typeof booking.origin_address === 'string' ? booking.origin_address.trim() : ''
  return {
    bookingReference: booking.booking_reference ?? '',
    dateLabel: formatPickupDate(booking.pickup_date),
    pickupTime: formatPickupTime(booking.pickup_time ?? ''),
    pickup: pickup === '' ? '-' : pickup,
    dropoff: dropoffText(booking.destination_address),
    vehicleLabel: formatVehicleLabel(booking.vehicle_class ?? ''),
    feeLabel: withFee ? driverFeeLabel(booking.driver_price_czk) : null,
  }
}

/**
 * Resolve a cabinet ride for the signed-in driver. The ownership comes from `driverId` (the session), never from the
 * URL. A failing read, a missing row or any non-live combination fails closed to not_available.
 */
export async function resolveCabinetRide(
  supabase: ServiceClient,
  driverId: string,
  assignmentId: string,
): Promise<CabinetRideResolution> {
  const { data, error } = await supabase
    .from('driver_assignments')
    .select(RIDE_DETAIL_SELECT)
    .eq('id', assignmentId)
    .eq('driver_id', driverId)
    .maybeSingle()
  const row = data as DetailRow | null
  if (error || !row) return NOT_AVAILABLE

  const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
  if (!booking) return NOT_AVAILABLE
  if (row.status !== 'accepted' && row.status !== 'pending') return NOT_AVAILABLE

  // Pitfall 3: a reassigned booking keeps its older rows; only the newest is the driver's live ride.
  const newest = await newestAssignmentByBooking(supabase, [row.booking_id])
  if (newest.get(row.booking_id) !== row.id) return NOT_AVAILABLE

  const accepted = row.status === 'accepted'

  if ((TERMINAL_BOOKING_STATUSES as ReadonlySet<string>).has(booking.status)) {
    // A pending offer on a cancelled booking was never the driver's ride; on completed / no_show it was (started via link).
    if (booking.status === 'cancelled') {
      return accepted
        ? { kind: 'closed', state: 'cancelled', backHref: pastBackHref(booking.pickup_date), summary: summaryOf(booking, false) }
        : NOT_AVAILABLE
    }
    const state = booking.status === 'completed' ? 'completed' : 'no_show'
    return {
      kind: 'closed',
      state,
      backHref: pastBackHref(booking.pickup_date),
      summary: summaryOf(booking, state === 'completed'),
    }
  }

  if (accepted || STARTED_STATUSES.has(booking.status)) {
    // The trip screen needs the assignment's own token; without one there is nothing to drive.
    return typeof row.trip_token === 'string' && row.trip_token !== ''
      ? { kind: 'trip', tripToken: row.trip_token }
      : NOT_AVAILABLE
  }

  // Pending and not started: the offer is answered in the Offers tab (D-12).
  return OFFER_STATUSES.has(booking.status) ? { kind: 'offer' } : NOT_AVAILABLE
}
