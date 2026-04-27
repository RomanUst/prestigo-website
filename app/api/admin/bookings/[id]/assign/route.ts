import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { logEmail } from '@/lib/email-log'
import { sendDriverAssignmentEmail } from '@/lib/email'
import { pushGnetStatus, prestigoToGnetStatus } from '@/lib/gnet-client'

const assignSchema = z.object({
  driver_id: z.string().uuid(),
})

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['assigned', 'cancelled', 'completed'],
  assigned: ['en_route', 'cancelled', 'completed'],
  en_route: ['on_location', 'cancelled', 'completed'],
  on_location: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Enforce max body size
  const bodyCheck = enforceMaxBody(request, 50_000)
  if (bodyCheck) return bodyCheck

  // 2. Auth guard
  const { error } = await getAdminUser()
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
    .select('id, booking_reference, pickup_date, pickup_time, origin_address, destination_address, client_first_name, client_last_name, client_phone, status, booking_source')
    .eq('id', bookingId)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // 5c. Insert assignment (DB generates token + token_expires_at)
  const { data: assignment, error: insertError } = await supabase
    .from('driver_assignments')
    .insert({ booking_id: bookingId, driver_id: driverId })
    .select('id, driver_id, status, token')
    .single()

  if (insertError || !assignment) {
    console.error('[assign] insert error:', insertError?.message)
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
  }

  // 5c-bis: Update bookings.driver_id (+ status if first assign) per D-04 + D-07
  // Use status and booking_source already fetched in 5b — no second round-trip needed.
  const previousStatus: string | null = booking.status as string
  const bookingSource: string | null = booking.booking_source as string
  const isFirstAssign = previousStatus !== null && previousStatus !== 'assigned'
  const canTransitionToAssigned =
    isFirstAssign && (VALID_TRANSITIONS[previousStatus ?? '']?.includes('assigned') ?? false)

  if (previousStatus !== null) {
    if (canTransitionToAssigned) {
      // confirmed → assigned (or any other valid → assigned transition)
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ driver_id: driverId, status: 'assigned' })
        .eq('id', bookingId)
      if (updateErr) {
        console.error('[assign] bookings update failed:', updateErr.message)
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

  // 5c-tris: Fire-and-forget GNet ASSIGNED push per D-05 (only on FIRST assign — D-07)
  if (canTransitionToAssigned && bookingSource === 'gnet') {
    const gnetStatus = prestigoToGnetStatus('assigned') // → 'ASSIGNED'
    if (gnetStatus) {
      after(async () => {
        const svcSupabase = createSupabaseServiceClient()
        const { data: gnetRow } = await svcSupabase
          .from('gnet_bookings')
          .select('id, gnet_res_no')
          .eq('booking_id', bookingId)
          .single()

        if (!gnetRow) {
          console.error('[assign:gnet-push] no gnet_bookings row for', bookingId)
          return
        }

        let pushError: string | null = null
        try {
          await pushGnetStatus(gnetRow.gnet_res_no, gnetStatus)
        } catch (err) {
          pushError = err instanceof Error ? err.message : String(err)
          console.error('[assign:gnet-push] failed', { bookingId, gnetResNo: gnetRow.gnet_res_no, error: pushError })
        }

        await svcSupabase
          .from('gnet_bookings')
          .update({
            last_push_status: gnetStatus,
            last_push_error: pushError,
            last_pushed_at: new Date().toISOString(),
          })
          .eq('id', gnetRow.id)
      })
    }
  }

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
        acceptUrl,
        declineUrl,
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
        token: assignment.token,
      },
      booking_status: canTransitionToAssigned ? 'assigned' : (previousStatus ?? 'unknown'),
    },
    { status: 201 }
  )
}
