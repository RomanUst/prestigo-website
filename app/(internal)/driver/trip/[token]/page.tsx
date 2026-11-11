import type { Metadata } from 'next'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { tripLinkViewState } from '@/lib/trip-token'
import { formatVehicleLabel } from '@/lib/email'
import { buildDriverCash, buildTripView } from '@/lib/driver-trip-step'
import { getNoShowView } from '@/lib/no-show'
import { getNoShowThresholds, isAirportPickup } from '@/lib/no-show-wait'
import { loadStopsSafe } from '@/lib/booking-stops'
import { freeWaitUntilMs } from '@/lib/airport-pickup'
import { pickupInstantMs } from '@/lib/prague-date'
import { formatPragueTime } from '@/lib/prague-calendar'
import type { DriverTripRecord } from '@/lib/driver-trip-step'
import InvalidTripLinkView from './InvalidTripLinkView'
import TripCompleted from './TripCompleted'
import TripScreen from './TripScreen'

// D-08: this page must never be indexed — it is a permanent, unguessable
// per-assignment link presentable to police control, not public content.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ token: string }>
}

// Explicit row shape for the trip-sheet join query. createSupabaseServiceClient()
// is not generic-typed against Database (matches the rest of this codebase's
// service-client call sites), so a `bookings!inner(...)` select-string join is
// otherwise inferred as an array by supabase-js's string-literal parser — cast
// through this interface instead of loosening types with `any` at each use site.
interface TripSheetBookingRow {
  id: string
  booking_reference: string
  booking_source: string | null
  pickup_utc: string | null
  pickup_date: string
  pickup_time: string
  origin_address: string | null
  destination_address: string | null
  origin_lat: number | null
  origin_lng: number | null
  destination_lat: number | null
  destination_lng: number | null
  client_first_name: string
  client_last_name: string
  client_phone: string | null
  flight_number: string | null
  flight_iata: string | null
  special_requests: string | null
  vehicle_class: string
  distance_km: number | null
  completed_at: string | null
  no_show_requested_at: string | null
  status: string
  driver_id: string | null
  // Phase 91 (STOP-05): the flight's landing and how many minutes after it the driver is there (all three or none).
  landing_date?: string | null
  landing_time?: string | null
  pickup_offset_min?: number | null
  // Phase 89 (D-11): read only to build the cash label; none of these four reaches the browser as a number.
  payment_mode?: string | null
  payment_state?: string | null
  payment_amount_minor?: number | null
  payment_currency?: string | null
}

interface TripSheetDriverRow {
  name: string | null
  vehicle_info: string | null
}

interface TripSheetAssignmentRow {
  id: string
  driver_id: string
  status: string | null
  trip_note: string | null
  bookings: TripSheetBookingRow | null
  drivers: TripSheetDriverRow | null
}

// D-06: the driver never sees an amount, so bookings.amount_eur is not selected at all. The one scoped exception
// (Phase 89, D-11, D-12) is a cash_guarantee booking: its payment_amount_minor / payment_currency are turned into a
// formatted label on the server (buildDriverCash), only while the cash is unsettled or just settled.
const TRIP_SELECT =
  'id, driver_id, status, trip_note, ' +
  'bookings!inner(id, booking_reference, booking_source, pickup_utc, pickup_date, pickup_time, ' +
  'origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, ' +
  'client_first_name, client_last_name, client_phone, flight_number, flight_iata, special_requests, ' +
  'vehicle_class, distance_km, completed_at, no_show_requested_at, status, driver_id, ' +
  'payment_mode, payment_state, payment_amount_minor, payment_currency, ' +
  'landing_date, landing_time, pickup_offset_min), ' +
  'drivers(name, vehicle_info)'

function coords(lat: number | null, lng: number | null): { lat: number; lng: number } | null {
  return lat !== null && lat !== undefined && lng !== null && lng !== undefined ? { lat, lng } : null
}

// Request time for the start gate. A named helper keeps the impure read out of the render body.
function currentTimeMs(): number {
  return Date.now()
}

export default async function TripSheetPage({ params }: PageProps) {
  const { token } = await params

  // V5 input validation (anti-enumeration): reject malformed tokens before
  // ever touching Supabase — mirrors respondSchema's z.string().uuid().
  const parsedToken = z.string().uuid().safeParse(token)
  if (!parsedToken.success) {
    return <InvalidTripLinkView />
  }

  const supabase = createSupabaseServiceClient()

  // Single read-only join — resolves exactly one assignment -> its own
  // booking (bookings!inner) and that assignment's driver. No cross-booking
  // data, no enumeration parameter, no writes anywhere on this page.
  const { data: rawAssignment, error } = await supabase
    .from('driver_assignments')
    .select(TRIP_SELECT)
    .eq('trip_token', parsedToken.data)
    .single()

  const assignment = rawAssignment as unknown as TripSheetAssignmentRow | null

  if (error || !assignment || !assignment.bookings) {
    return <InvalidTripLinkView />
  }

  const booking = assignment.bookings
  const driver = assignment.drivers

  // D-03 / D-17 security boundary: driver_id match (self-invalidates on reassignment), not
  // declined, and the booking status decide the view live on every request — no stored expiry.
  // 'completed' shows the details-free completed screen; every other dead link is one uniform view.
  const viewState = tripLinkViewState({
    assignmentDriverId: assignment.driver_id,
    bookingDriverId: booking.driver_id,
    bookingStatus: booking.status,
    assignmentStatus: assignment.status,
  })

  // Phase 89 (D-03, UI-SPEC 6.3): a cancelled trip on the CURRENT driver's link says so and shows the reference only.
  // Unknown, reassigned and declined links keep the uniform view (no enumeration).
  const isCurrentDriver =
    booking.driver_id !== null && assignment.driver_id === booking.driver_id && assignment.status !== 'declined'
  if (viewState === 'ended') {
    return isCurrentDriver && booking.status === 'cancelled' ? (
      <InvalidTripLinkView cancelledReference={booking.booking_reference} />
    ) : (
      <InvalidTripLinkView />
    )
  }

  // D-11: a label string or nothing; non-cash trips get no cash prop at all (the Phase 87 props).
  const cash = buildDriverCash(booking)

  if (viewState === 'completed') {
    return cash ? (
      <TripCompleted variant="reopened" token={parsedToken.data} cash={cash} />
    ) : (
      <TripCompleted variant="reopened" />
    )
  }

  const record: DriverTripRecord['booking'] = {
    id: booking.id,
    status: booking.status,
    driver_id: booking.driver_id,
    booking_source: booking.booking_source,
    amount_eur: null,
    pickup_utc: booking.pickup_utc,
    pickup_date: booking.pickup_date,
    pickup_time: booking.pickup_time,
    origin_lat: booking.origin_lat,
    origin_lng: booking.origin_lng,
    origin_address: booking.origin_address,
    completed_at: booking.completed_at,
    no_show_requested_at: booking.no_show_requested_at,
  }
  const nowMs = currentTimeMs()
  const view = await buildTripView({ booking: record, nowMs })
  // D-15: when a no-show request unlocks is a server fact (pickup / arrival + waiting time); the page
  // only hands the times to the screen, the progress route stays the authority.
  const noShowView = await getNoShowView({ supabase, booking: record, nowMs })

  // Phase 91 (STOP-04, STOP-05, T-91-39): read only now, for the booking of the validated token and after the view
  // checks, so an invalid or reassigned link never reaches booking_stops. Only position, address, wait and the
  // coordinates go to the driver: the stop fee columns are never mapped (the driver page carries no money).
  const storedStops = await loadStopsSafe(booking.id)
  const stops = storedStops.map((stop) => ({
    position: stop.position,
    address: stop.address ?? '',
    waitMinutes: stop.waitMinutes,
    lat: stop.lat,
    lng: stop.lng,
  }))
  const landing =
    booking.landing_date && booking.landing_time && typeof booking.pickup_offset_min === 'number'
      ? { date: booking.landing_date, time: booking.landing_time, offsetMin: booking.pickup_offset_min }
      : null
  // STOP-05: free waiting is counted from the PICKUP (never from the landing) with the live no-show setting.
  const thresholds = await getNoShowThresholds(supabase)
  const freeMinutes = isAirportPickup(booking) ? thresholds.airportMin : thresholds.cityMin
  const pickupMs = pickupInstantMs(record)
  const freeWaitUntil = pickupMs !== null ? formatPragueTime(freeWaitUntilMs(pickupMs, freeMinutes)) : null

  return (
    <TripScreen
      token={parsedToken.data}
      view={view}
      trip={{
        bookingReference: booking.booking_reference,
        pickupDate: booking.pickup_date,
        pickupTime: booking.pickup_time,
        originAddress: booking.origin_address ?? '',
        destinationAddress: booking.destination_address ?? '',
        origin: coords(booking.origin_lat, booking.origin_lng),
        destination: coords(booking.destination_lat, booking.destination_lng),
        passengerName: `${booking.client_first_name} ${booking.client_last_name}`.trim(),
        passengerPhone: booking.client_phone || null,
        vehicleLabel: formatVehicleLabel(booking.vehicle_class),
        vehicleInfo: driver?.vehicle_info ?? null,
        driverName: driver?.name?.trim() || null,
        flight: booking.flight_number ?? booking.flight_iata ?? null,
        clientNotes: booking.special_requests,
        distanceKm: booking.distance_km,
        landing,
        freeWaitUntil,
        stops,
      }}
      initialNote={assignment.trip_note ?? null}
      noShow={{ availableAt: noShowView.noShowAvailableAt, requestedAt: noShowView.noShowRequestedAt }}
      {...(cash ? { cash } : {})}
    />
  )
}
