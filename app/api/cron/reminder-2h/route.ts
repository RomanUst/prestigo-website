import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Receiver } from '@upstash/qstash'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { logEmail } from '@/lib/email-log'
import { sendClientReminderEmail, sendDriverReminderEmail, getAcceptedDriver } from '@/lib/email'
import { enforceMaxBody } from '@/lib/request-guards'
import type { ReminderEmailBooking } from '@/lib/email'

const bodySchema = z.object({ booking_id: z.string().min(1) })

// Lazy singleton — mirrors qstash.ts pattern; avoids crash when signing keys absent in test/preview
let _receiver: Receiver | null = null
function getReceiver(): Receiver {
  if (!_receiver) {
    _receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? '',
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? '',
    })
  }
  return _receiver
}

export async function POST(request: Request) {
  // 0. Body size guard (QStash payload is tiny; 1 KB is generous)
  const sizeError = enforceMaxBody(request, 1024)
  if (sizeError) return sizeError

  // 1. QStash signature verification — T-41-02
  const receiver = getReceiver()

  // MUST read body as text BEFORE verify — body stream is single-read
  const rawBody = await request.text()
  const signature = request.headers.get('Upstash-Signature') ?? ''

  const isValid = await receiver.verify({ signature, body: rawBody }).catch(() => false)
  if (!isValid) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Validate body shape — returns 400 on missing/invalid booking_id
  const parsed = bodySchema.safeParse(JSON.parse(rawBody))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const { booking_id } = parsed.data

  const supabase = createSupabaseServiceClient()

  // 3. Fetch booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select(`
      id, client_email, booking_reference, pickup_date, pickup_time,
      origin_address, destination_address, vehicle_class, status,
      client_first_name, client_last_name, client_phone,
      driver_assignments!left(
        status,
        drivers!inner(name, email, vehicle_info)
      )
    `)
    .eq('id', booking_id)
    .single()

  if (fetchError || !booking) {
    // Return 200 to prevent QStash retry on missing booking — T-41-04
    return NextResponse.json({ ok: true, skipped: true, reason: 'not_found' })
  }

  // Skip silently if not confirmed — return 200 to prevent QStash retry
  if (booking.status !== 'confirmed') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not_confirmed' })
  }

  // 3. Check notification_flags.reminder_2h
  const { data: flagsRow } = await supabase
    .from('pricing_globals')
    .select('notification_flags')
    .eq('id', 1)
    .single()

  const flags = flagsRow?.notification_flags as Record<string, boolean> | null
  const isEnabled = !flags || flags['reminder_2h'] !== false

  if (!isEnabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'flag_disabled' })
  }

  // 4. Build reminder data
  const driver = getAcceptedDriver(booking.driver_assignments)

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

  // 5. Client + driver dedup-check and send in parallel
  await Promise.all([
    logEmail({ bookingId: booking.id, emailType: 'reminder_2h', recipient: booking.client_email })
      .then(ok => ok ? sendClientReminderEmail(reminderBooking, '2h') : undefined),
    driver?.email
      ? logEmail({ bookingId: booking.id, emailType: 'reminder_2h', recipient: driver.email })
          .then(ok => ok ? sendDriverReminderEmail(reminderBooking, '2h') : undefined)
      : undefined,
  ])

  return NextResponse.json({ ok: true })
}
