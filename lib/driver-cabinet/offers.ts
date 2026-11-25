// Phase 94 plan 94-03 (DCAB-05, DCAB-07; D-11, D-12): the live offers of one driver.
//
// An offer is live only when the assignment is pending, is the newest assignment of its booking, and the booking is
// neither terminal nor already started. token_expires_at plays no part: the offer stays until the operator reassigns
// or cancels it (D-10). Only the first name, the route, the class and the driver's own fee leave this module.

import { getPragueTodayISO, pickupInstantMs } from '@/lib/prague-date'
import { formatVehicleLabel } from '@/lib/email'
import { IN_PROGRESS_BOOKING_STATUSES, TERMINAL_BOOKING_STATUSES, type BookingStatus } from '@/lib/booking-status'
import { newestAssignmentByBooking } from '@/lib/driver-cabinet/assignments'
import { driverFeeLabel, dropoffText, firstNameOf, pragueDayLabel } from '@/lib/driver-cabinet/format'

// Minimal structural type of the service client: the tests pass an in-memory stand-in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = { from: (table: string) => any }

/**
 * Column gate (D-11, D-12): no client fare, payment, last name, phone or e-mail column is ever selected here.
 * tests/driver-cabinet-offers.test.ts asserts the recorded select strings against that list.
 */
export const OFFER_SELECT =
  'id, status, created_at, booking_id, bookings!inner(id, status, pickup_date, pickup_time, pickup_utc, origin_address, destination_address, client_first_name, vehicle_class, driver_price_czk)'

export interface OfferView {
  assignmentId: string
  pickupDate: string
  dayLabel: string
  time: string
  pickup: string
  dropoff: string
  firstName: string
  vehicleLabel: string
  feeLabel: string | null
}

interface OfferBooking {
  id: string
  status: string
  pickup_date: string
  pickup_time: string
  pickup_utc: string | null
  origin_address: string | null
  destination_address: string | null
  client_first_name: string | null
  vehicle_class: string | null
  driver_price_czk: number | null
}

export interface OfferRow {
  id: string
  status: string
  created_at?: string
  booking_id: string
  bookings: OfferBooking | OfferBooking[] | null
}

/** The started states of a trip: the car is on its way, at the pickup, or carrying the client. */
const STARTED_STATUSES: ReadonlySet<string> = IN_PROGRESS_BOOKING_STATUSES

function bookingOf(row: OfferRow): OfferBooking | null {
  const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
  return b ?? null
}

/** The visibility predicate (Pitfall 3). Whatever token_expires_at says, a pending newest offer on a live booking is live. */
export function isLiveOffer(
  row: Pick<OfferRow, 'id' | 'status' | 'booking_id' | 'bookings'>,
  newestByBooking: Map<string, string>,
): boolean {
  if (row.status !== 'pending') return false
  const booking = bookingOf(row as OfferRow)
  if (!booking) return false
  if (TERMINAL_BOOKING_STATUSES.has(booking.status as BookingStatus)) return false
  if (STARTED_STATUSES.has(booking.status)) return false
  return newestByBooking.get(row.booking_id) === row.id
}

/** The driver's live offers, earliest pickup first. */
export async function listLiveOffers(
  supabase: ServiceClient,
  driverId: string,
  todayIso: string = getPragueTodayISO(),
): Promise<OfferView[]> {
  const { data, error } = await supabase
    .from('driver_assignments')
    .select(OFFER_SELECT)
    .eq('driver_id', driverId)
    .eq('status', 'pending')
    .limit(200)
  if (error || !Array.isArray(data)) return []

  const rows = data as OfferRow[]
  const newest = await newestAssignmentByBooking(
    supabase,
    Array.from(new Set(rows.map((r) => r.booking_id))),
  )

  const live = rows
    .filter((r) => isLiveOffer(r, newest))
    .map((r) => ({ row: r, booking: bookingOf(r) as OfferBooking }))

  const instant = (b: OfferBooking): number => pickupInstantMs(b) ?? Number.MAX_SAFE_INTEGER
  live.sort((a, b) => instant(a.booking) - instant(b.booking))

  return live.map(({ row, booking }) => ({
    assignmentId: row.id,
    pickupDate: booking.pickup_date,
    dayLabel: pragueDayLabel(booking.pickup_date, todayIso),
    time: typeof booking.pickup_time === 'string' ? booking.pickup_time.slice(0, 5) : '',
    pickup: booking.origin_address ?? '',
    dropoff: dropoffText(booking.destination_address),
    firstName: firstNameOf(booking.client_first_name),
    vehicleLabel: formatVehicleLabel(booking.vehicle_class ?? ''),
    feeLabel: driverFeeLabel(booking.driver_price_czk),
  }))
}

/** How many live offers the driver has (the tab badge, 94-06). */
export async function countLiveOffers(supabase: ServiceClient, driverId: string): Promise<number> {
  return (await listLiveOffers(supabase, driverId)).length
}
