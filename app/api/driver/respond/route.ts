import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { sendDriverDeclineNotification } from '@/lib/email'

const respondSchema = z.object({
  token: z.string().uuid(),
  action: z.enum(['accepted', 'declined']),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = respondSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const { token, action } = parsed.data
  const supabase = createSupabaseServiceClient()

  // Look up assignment by token
  const { data: assignment, error: lookupError } = await supabase
    .from('driver_assignments')
    .select('id, booking_id, driver_id, status, token_used_at, token_expires_at')
    .eq('token', token)
    .single()

  if (lookupError || !assignment) {
    return NextResponse.json({ error: 'not_found' }, { status: 400 })
  }

  // Check if already used
  if (assignment.token_used_at) {
    return NextResponse.json({ error: 'used' }, { status: 400 })
  }

  // Check if expired
  if (new Date(assignment.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 400 })
  }

  // Atomically update: set status + token_used_at
  // Use gt(token_expires_at, now) + is(token_used_at, null) as double guard
  const { data: updated, error: updateError } = await supabase
    .from('driver_assignments')
    .update({ status: action, token_used_at: new Date().toISOString() })
    .eq('id', assignment.id)
    .gt('token_expires_at', new Date().toISOString())
    .is('token_used_at', null)
    .select('id, status, token_used_at')
    .single()

  if (updateError || !updated) {
    // Race condition — token was used or expired between check and update
    return NextResponse.json({ error: 'used' }, { status: 400 })
  }

  // If declined, send notification to manager (fire-and-forget)
  if (action === 'declined') {
    // Fetch driver name and booking details for notification
    const { data: driver } = await supabase
      .from('drivers')
      .select('name')
      .eq('id', assignment.driver_id)
      .single()

    const { data: booking } = await supabase
      .from('bookings')
      .select('booking_reference, pickup_date, pickup_time, origin_address, destination_address')
      .eq('id', assignment.booking_id)
      .single()

    if (driver && booking) {
      void sendDriverDeclineNotification({
        bookingReference: booking.booking_reference,
        pickupDate: booking.pickup_date,
        pickupTime: booking.pickup_time,
        originAddress: booking.origin_address,
        destinationAddress: booking.destination_address,
        driverName: driver.name,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
