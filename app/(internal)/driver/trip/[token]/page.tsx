import type { Metadata } from 'next'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { tripLinkViewState } from '@/lib/trip-token'
import { formatVehicleLabel } from '@/lib/email'
import { buildTripView } from '@/lib/driver-trip-step'
import { getNoShowView } from '@/lib/no-show'
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
}

interface TripSheetDriverRow {
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

// D-06: the driver never sees an amount, so the booking amount is not selected at all.
const TRIP_SELECT =
  'id, driver_id, status, trip_note, ' +
  'bookings!inner(id, booking_reference, booking_source, pickup_utc, pickup_date, pickup_time, ' +
  'origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, ' +
  'client_first_name, client_last_name, client_phone, flight_number, flight_iata, special_requests, ' +
  'vehicle_class, distance_km, completed_at, no_show_requested_at, status, driver_id), ' +
  'drivers(vehicle_info)'

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

  if (viewState === 'ended') return <InvalidTripLinkView />
  if (viewState === 'completed') return <TripCompleted variant="reopened" />

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
        flight: booking.flight_number ?? booking.flight_iata ?? null,
        clientNotes: booking.special_requests,
        distanceKm: booking.distance_km,
      }}
      initialNote={assignment.trip_note ?? null}
      noShow={{ availableAt: noShowView.noShowAvailableAt, requestedAt: noShowView.noShowRequestedAt }}
    />
  )
}
