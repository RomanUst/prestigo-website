import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { logEmail } from '@/lib/email-log'
import { sendDriverAssignmentEmail } from '@/lib/email'
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'
import { TERMINAL_BOOKING_STATUSES } from '@/lib/booking-status'
import { advanceBookingStatus } from '@/lib/booking-status-service'

const assignSchema = z.object({
  driver_id: z.string().uuid(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Enforce max body size
  const bodyCheck = enforceMaxBody(request, 50_000)
  if (bodyCheck) return bodyCheck

  // 2. Auth guard
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 3. Extract booking ID from params
  const { id: bookingId } = await params

  // 4. Zod parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = assignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const { driver_id: driverId } = parsed.data
  const supabase = createSupabaseServiceClient()

  // 5a. Verify driver exists
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, name, email')
    .eq('id', driverId)
    .single()

  if (driverError || !driver) {
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
  }

  // 5b. Verify booking exists and get trip details for email (blocking — required for email)
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_reference, pickup_date, pickup_time, origin_address, destination_address, client_first_name, client_last_name, client_phone, status, booking_source, amount_eur, amount_czk, driver_price_czk, special_requests, landing_date, landing_time, pickup_offset_min')
    .eq('id', bookingId)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // 5b-bis. WR-02 (Phase 89): a closed booking (completed, cancelled, no_show) can not be assigned. Before this gate the
  // insert below ran first and only the status logic after it was skipped, so a cancelled booking still got an
  // assignment row, a live driver trip link and a driver email. Checked before the insert: no row, no email.
  if ((TERMINAL_BOOKING_STATUSES as ReadonlySet<string>).has(booking.status as string)) {
    return NextResponse.json(
      { error: 'booking_closed', message: `A ${booking.status} booking can not be assigned to a driver` },
      { status: 422 },
    )
  }

  // 5c. Insert assignment (DB generates token + token_expires_at)
  const { data: assignment, error: insertError } = await supabase
    .from('driver_assignments')
    .insert({ booking_id: bookingId, driver_id: driverId })
    .select('id, driver_id, status, token, trip_token')
    .single()

  if (insertError || !assignment) {
    console.error('[assign] insert error:', insertError?.message)
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
  }

  // 5c-bis: Update bookings.driver_id (+ status if first assign) per D-04 + D-07
  // Use status and booking_source already fetched in 5b — no second round-trip needed.
  const previousStatus: string | null = booking.status as string
  const isFirstAssign = previousStatus !== null && previousStatus !== 'assigned'
  const canTransitionToAssigned =
    isFirstAssign && (VALID_TRANSITIONS[previousStatus ?? '']?.includes('assigned') ?? false)

  // Status reported back to the caller: 'assigned' on a won first-assign, the winner's status
  // when the compare-and-set was lost (the booking changed under the assignment).
  let reportedStatus: string = canTransitionToAssigned ? 'assigned' : (previousStatus ?? 'unknown')

  if (previousStatus !== null) {
    if (canTransitionToAssigned) {
      // confirmed → assigned (or any other valid → assigned transition).
      // Phase 87 D-01/D-04: the status write and the GNet ASSIGNED push (first
      // assign only, D-05/D-07) go through the status service.
      const assignResult = await advanceBookingStatus({
        bookingId,
        to: 'assigned',
        actor: { type: 'admin', id: user?.id ?? null },
        source: 'admin_assign',
        profile: 'assign-route',
        current: booking,
        expectedFrom: previousStatus,
        patch: { driver_id: driverId },
      })
      if (!assignResult.ok) {
        if (assignResult.code === 'conflict') {
          // Lost the race (e.g. the booking was cancelled meanwhile): the assignment row stays,
          // bookings.status is untouched and nothing is pushed to GNet.
          console.error('[assign] status changed concurrently', {
            bookingId,
            expected: previousStatus,
            currentStatus: assignResult.currentStatus,
          })
          reportedStatus = assignResult.currentStatus ?? reportedStatus
        } else {
          console.error('[assign] bookings update failed:', assignResult.message)
        }
      }
    } else if (previousStatus === 'assigned') {
      // D-07: reassign — only driver_id, do not touch status
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ driver_id: driverId })
        .eq('id', bookingId)
      if (updateErr) {
        console.error('[assign] bookings reassign update failed:', updateErr.message)
      }
    }
    // else: status not in valid transition AND not 'assigned' (e.g. pending) —
    // driver_assignments row is still created; bookings.status untouched (admin must
    // first confirm the booking via PATCH /api/admin/bookings before assigning).
  }

  // 5c-tris (GNet ASSIGNED push on first assign, D-05/D-07) now runs inside
  // advanceBookingStatus — one GNet push implementation (Phase 87 D-04).

  // 5d. Check notification_flags gate
  const { data: config } = await supabase
    .from('pricing_globals')
    .select('notification_flags')
    .eq('id', 1)
    .single()

  const shouldSendEmail = config?.notification_flags?.driver_assigned !== false

  // 5e. Send assignment email (gated on notification_flags + logEmail dedup)
  // Dedup key: assignment.id encoded in emailType so each new assignment gets
  // its own 10-min dedup window, even for the same driver re-assigned to the
  // same booking. bookingId=null avoids FK collision while still logging.
  if (shouldSendEmail) {
    const allowed = await logEmail({
      bookingId: null,
      emailType: `driver_assigned:${assignment.id}`,
      recipient: driver.email,
    })

    if (allowed) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com'
      const acceptUrl = `${siteUrl}/driver/response?token=${assignment.token}&action=accepted`
      const declineUrl = `${siteUrl}/driver/response?token=${assignment.token}&action=declined`
      const tripUrl = `${siteUrl}/driver/trip/${assignment.trip_token}`

      after(() => sendDriverAssignmentEmail({
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
        driverPriceCzk: (booking.driver_price_czk as number | null) ?? null,
        specialRequests: booking.special_requests,
        // Phase 91 (STOP-04, STOP-05): the email reads the stored stops by id and shows the landing and pickup rows.
        bookingId: booking.id as string,
        landingDate: (booking.landing_date as string | null) ?? null,
        landingTime: (booking.landing_time as string | null) ?? null,
        pickupOffsetMin: (booking.pickup_offset_min as number | null) ?? null,
        acceptUrl,
        declineUrl,
        tripUrl,
      }).catch(err => console.error('[driver-assign]:', err)))
    }
  }

  // 6. Return assignment
  return NextResponse.json(
    {
      assignment: {
        id: assignment.id,
        driver_id: assignment.driver_id,
        status: assignment.status,
        // SEC-18: token omitted — used only server-side for email URL, must not be returned to browser
      },
      booking_status: reportedStatus,
    },
    { status: 201 }
  )
}
