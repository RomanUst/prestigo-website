import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { logEmail } from '@/lib/email-log'
import { sendDriverAssignmentEmail } from '@/lib/email'

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

  // 5b. Verify booking exists and get trip details
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_reference, pickup_date, pickup_time, origin_address, destination_address, first_name, last_name, phone')
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

  // 5d. Check notification_flags gate
  const { data: config } = await supabase
    .from('pricing_globals')
    .select('notification_flags')
    .eq('id', 1)
    .single()

  const shouldSendEmail = config?.notification_flags?.driver_assigned !== false

  // 5e. Send assignment email (gated on notification_flags + logEmail dedup)
  if (shouldSendEmail) {
    const allowed = await logEmail({
      bookingId,
      emailType: 'driver_assigned',
      recipient: driver.email,
    })

    if (allowed) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com'
      const acceptUrl = `${siteUrl}/driver/response?token=${assignment.token}&action=accepted`
      const declineUrl = `${siteUrl}/driver/response?token=${assignment.token}&action=declined`

      void sendDriverAssignmentEmail({
        driverName: driver.name,
        driverEmail: driver.email,
        bookingReference: booking.booking_reference,
        pickupDate: booking.pickup_date,
        pickupTime: booking.pickup_time,
        originAddress: booking.origin_address,
        destinationAddress: booking.destination_address,
        passengerFirstName: booking.first_name,
        passengerLastName: booking.last_name,
        passengerPhone: booking.phone,
        acceptUrl,
        declineUrl,
      })
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
    },
    { status: 201 }
  )
}
