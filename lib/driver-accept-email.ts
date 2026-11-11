/**
 * Phase 87-15 (87-UAT gap 1): the email the driver receives after tapping Accept on
 * /driver/response. It carries the order details and the permanent trip link
 * (/driver/trip/<trip_token>), the Phase 87 step page.
 *
 * Called from app/api/driver/respond/route.ts inside after(): it creates its own service
 * client, never throws to the caller's response (the route also catches), and logs only the
 * assignment id and an outcome code (no token, name, email or phone).
 *
 * The client price is never read (D-06): the join selects driver_price_czk only.
 */

import { createSupabaseServiceClient } from '@/lib/supabase'
import { logEmail } from '@/lib/email-log'
import { sendDriverAcceptedEmail } from '@/lib/email'
import { isTripLinkValid } from '@/lib/trip-token'

export type DriverAcceptedOutcome = 'sent' | 'skipped' | 'send_failed'

type BookingRow = {
  id: string
  booking_reference: string
  pickup_date: string
  pickup_time: string
  origin_address: string
  destination_address: string | null
  client_first_name: string
  client_last_name: string
  client_phone: string | null
  vehicle_class: string | null
  passengers: number | null
  luggage: number | null
  flight_number: string | null
  special_requests: string | null
  driver_price_czk: number | null
  status: string
  driver_id: string | null
  // Phase 91 (STOP-05): the airport landing kept beside the pickup.
  landing_date?: string | null
  landing_time?: string | null
  pickup_offset_min?: number | null
}

type DriverRow = { name: string; email: string | null }

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function skip(assignmentId: string, code: string): DriverAcceptedOutcome {
  console.log(`[driver-accept] assignment=${assignmentId} outcome=${code}`)
  return 'skipped'
}

export async function sendDriverAcceptedTripEmail(assignmentId: string): Promise<DriverAcceptedOutcome> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('driver_assignments')
    .select(
      'id, driver_id, status, trip_token, bookings!inner(id, booking_reference, pickup_date, pickup_time, origin_address, destination_address, client_first_name, client_last_name, client_phone, vehicle_class, passengers, luggage, flight_number, special_requests, driver_price_czk, status, driver_id, landing_date, landing_time, pickup_offset_min), drivers(name, email)',
    )
    .eq('id', assignmentId)
    .single()

  if (error || !data) {
    console.error(`[driver-accept] assignment=${assignmentId} outcome=read_failed`)
    return 'skipped'
  }

  const booking = one<BookingRow>(data.bookings as BookingRow | BookingRow[] | null)
  const driver = one<DriverRow>(data.drivers as DriverRow | DriverRow[] | null)
  if (!booking || !driver) return skip(assignmentId, 'no_booking_or_driver')
  if (!driver.email) return skip(assignmentId, 'no_driver_email')
  if (!data.trip_token) return skip(assignmentId, 'no_trip_token')

  // The same boundary the trip page and progress route enforce (D-03): the link must still work.
  // Reassigned, declined, or a terminal booking (completed / cancelled / no_show) -> no email.
  if (
    !isTripLinkValid({
      assignmentDriverId: data.driver_id,
      bookingDriverId: booking.driver_id,
      bookingStatus: booking.status,
      assignmentStatus: data.status,
    })
  ) {
    return skip(assignmentId, 'link_not_valid')
  }

  // Same toggle as the Phase 40 assignment email: missing flags = enabled.
  const { data: config } = await supabase
    .from('pricing_globals')
    .select('notification_flags')
    .eq('id', 1)
    .single()
  if (config?.notification_flags?.driver_assigned === false) return skip(assignmentId, 'flag_off')

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com').trim().replace(/\/+$/, '')
  const tripUrl = `${siteUrl}/driver/trip/${data.trip_token}`

  const allowed = await logEmail({
    bookingId: null,
    emailType: `driver_accepted:${assignmentId}`,
    recipient: driver.email,
  })
  if (!allowed) return skip(assignmentId, 'deduped')

  const delivered = await sendDriverAcceptedEmail({
    driverName: driver.name,
    driverEmail: driver.email,
    bookingReference: booking.booking_reference,
    pickupDate: booking.pickup_date,
    pickupTime: booking.pickup_time,
    originAddress: booking.origin_address,
    destinationAddress: booking.destination_address,
    passengerFirstName: booking.client_first_name,
    passengerLastName: booking.client_last_name,
    passengerPhone: booking.client_phone,
    vehicleClass: booking.vehicle_class,
    passengers: booking.passengers,
    luggage: booking.luggage,
    flightNumber: booking.flight_number,
    specialRequests: booking.special_requests,
    driverPriceCzk: booking.driver_price_czk,
    tripUrl,
    // Phase 91 (STOP-04, STOP-05): the email reads the stored stops by id and shows the landing and pickup rows.
    bookingId: booking.id,
    landingDate: booking.landing_date ?? null,
    landingTime: booking.landing_time ?? null,
    pickupOffsetMin: booking.pickup_offset_min ?? null,
  })

  if (!delivered) {
    console.error(`[driver-accept] assignment=${assignmentId} outcome=send_failed`)
    return 'send_failed'
  }
  console.log(`[driver-accept] assignment=${assignmentId} outcome=sent`)
  return 'sent'
}
