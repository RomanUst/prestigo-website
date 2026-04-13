import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { logEmail } from '@/lib/email-log'
import { sendClientReminderEmail, sendDriverReminderEmail } from '@/lib/email'
import type { ReminderEmailBooking } from '@/lib/email'

export const maxDuration = 300

export async function GET(request: Request) {
  // 1. CRON_SECRET guard (fail-closed: also 401 if env var not set) — T-41-01
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createSupabaseServiceClient()

  // 2. Check notification_flags.reminder_24h
  const { data: flagsRow } = await supabase
    .from('pricing_globals')
    .select('notification_flags')
    .eq('id', 1)
    .single()

  const flags = flagsRow?.notification_flags as Record<string, boolean> | null
  const isEnabled = !flags || flags['reminder_24h'] !== false

  if (!isEnabled) {
    return NextResponse.json({ ok: true, processed: 0, failed: 0, skipped_reason: 'flag_disabled' })
  }

  // 3. Query bookings with pickup_utc in 24-25h window, status=confirmed
  const now = Date.now()
  const windowStart = new Date(now + 24 * 3600 * 1000).toISOString()
  const windowEnd = new Date(now + 25 * 3600 * 1000).toISOString()

  const { data: bookings, error: dbError } = await supabase
    .from('bookings')
    .select(`
      id, client_email, booking_reference, pickup_date, pickup_time,
      origin_address, destination_address, vehicle_class,
      client_first_name, client_last_name, client_phone,
      driver_assignments!left(
        status,
        drivers!inner(name, email, vehicle_info)
      )
    `)
    .in('status', ['confirmed'])
    .gte('pickup_utc', windowStart)
    .lte('pickup_utc', windowEnd)
    .order('pickup_utc', { ascending: true })

  if (dbError) {
    console.error('[cron/reminder-24h] query failed:', dbError.message)
    return NextResponse.json({ ok: false, error: 'DB_QUERY_FAILED' }, { status: 500 })
  }

  // 4. Per-booking loop — skip-and-continue on failure
  const results = { processed: 0, failed: 0 }

  for (const booking of (bookings ?? [])) {
    try {
      // Find accepted driver assignment (if any)
      const acceptedAssignment = (booking.driver_assignments ?? [])
        .find((da: { status: string }) => da.status === 'accepted')
      const driver = acceptedAssignment?.drivers as { name: string; email: string; vehicle_info: string } | undefined

      const reminderBooking: ReminderEmailBooking = {
        booking_reference: booking.booking_reference,
        pickup_date: booking.pickup_date,
        pickup_time: booking.pickup_time,
        origin_address: booking.origin_address,
        destination_address: booking.destination_address,
        vehicle_class: booking.vehicle_class,
        client_email: booking.client_email,
        client_first_name: booking.client_first_name,
        client_last_name: booking.client_last_name,
        client_phone: booking.client_phone,
        driver_name: driver?.name,
        driver_email: driver?.email,
        driver_vehicle_info: driver?.vehicle_info,
      }

      // Client email: logEmail dedup → send
      const shouldSendClient = await logEmail({
        bookingId: booking.id,
        emailType: 'reminder_24h',
        recipient: booking.client_email,
      })
      if (shouldSendClient) {
        await sendClientReminderEmail(reminderBooking, '24h')
      }

      // Driver email: only if assigned+accepted
      if (driver?.email) {
        const shouldSendDriver = await logEmail({
          bookingId: booking.id,
          emailType: 'reminder_24h',
          recipient: driver.email,
        })
        if (shouldSendDriver) {
          await sendDriverReminderEmail(reminderBooking, '24h')
        }
      }

      results.processed++
    } catch (err) {
      console.error('[cron/reminder-24h] error for booking', booking.id, err)
      results.failed++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
