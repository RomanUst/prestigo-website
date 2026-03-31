import { Resend } from 'resend'
import { czkToEur, formatCZK, formatEUR } from '@/lib/currency'
import { EXTRAS_CONFIG } from '@/lib/extras'


const resend = new Resend(process.env.RESEND_API_KEY!)

export interface BookingEmailData {
  bookingReference: string
  tripType: string
  originAddress: string
  destinationAddress: string
  pickupDate: string        // 'YYYY-MM-DD'
  pickupTime: string        // 'HH:MM'
  returnDate?: string
  vehicleClass: string
  passengers: number
  luggage: number
  hours?: number
  distanceKm?: number
  amountCzk: number
  extraChildSeat: boolean
  extraMeetGreet: boolean
  extraLuggage: boolean
  firstName: string
  lastName: string
  email: string
  phone: string
  flightNumber?: string
  terminal?: string
  specialRequests?: string
}

function formatVehicleLabel(vehicleClass: string): string {
  if (vehicleClass === 'first_class') return 'First Class'
  if (vehicleClass === 'business_van') return 'Business Van'
  return vehicleClass.charAt(0).toUpperCase() + vehicleClass.slice(1)
}

function formatPickupDate(dateStr: string): string {
  // dateStr is 'YYYY-MM-DD'
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function buildGoogleCalendarUrl(data: BookingEmailData): string {
  const title = `PRESTIGO Transfer — ${data.bookingReference}`
  const details = `Booking ${data.bookingReference}. ${data.originAddress} to ${data.destinationAddress}. Vehicle: ${data.vehicleClass}.`
  const location = data.originAddress

  // Convert 'YYYY-MM-DD' + 'HH:MM' to 'YYYYMMDDTHHMMSS'
  const [year, month, day] = data.pickupDate.split('-')
  const [hour, minute] = data.pickupTime.split(':')
  const start = `${year}${month}${day}T${hour}${minute}00`

  // End = start + 1 hour
  const endHour = String(Number(hour) + 1).padStart(2, '0')
  const end = `${year}${month}${day}T${endHour}${minute}00`

  const enc = encodeURIComponent
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(title)}&dates=${start}/${end}&details=${enc(details)}&location=${enc(location)}`
}

function buildExtrasRows(data: BookingEmailData): string {
  const selected = EXTRAS_CONFIG.filter((extra) => {
    if (extra.key === 'childSeat') return data.extraChildSeat
    if (extra.key === 'meetAndGreet') return data.extraMeetGreet
    if (extra.key === 'extraLuggage') return data.extraLuggage
    return false
  })

  if (selected.length === 0) return ''

  const items = selected
    .map(
      (extra) =>
        `<li style="margin: 4px 0; font-size: 14px; color: #F5F2EE; font-family: 'Montserrat', Arial, sans-serif;">
          ${extra.label} — CZK ${extra.price}
        </li>`
    )
    .join('')

  return `
    <div style="padding: 0 32px 24px;">
      <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">RIDE DETAILS</div>
      <ul style="list-style: disc; padding-left: 18px; margin: 0;">
        ${items}
      </ul>
    </div>
  `
}

function buildConfirmationHtml(data: BookingEmailData): string {
  const calendarUrl = buildGoogleCalendarUrl(data)
  const extrasRows = buildExtrasRows(data)
  const formattedDate = formatPickupDate(data.pickupDate)

  const rideDetailsRows: string[] = []

  if (data.tripType === 'hourly' && data.hours) {
    rideDetailsRows.push(`
      <tr>
        <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Duration</td>
        <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${data.hours} hour${data.hours !== 1 ? 's' : ''}</td>
      </tr>
    `)
  }

  if (data.tripType === 'daily' && data.returnDate) {
    rideDetailsRows.push(`
      <tr>
        <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Return Date</td>
        <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${formatPickupDate(data.returnDate)}</td>
      </tr>
    `)
  }

  if (data.flightNumber) {
    rideDetailsRows.push(`
      <tr>
        <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Flight Number</td>
        <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${data.flightNumber}</td>
      </tr>
    `)
  }

  if (data.terminal) {
    rideDetailsRows.push(`
      <tr>
        <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Terminal</td>
        <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${data.terminal}</td>
      </tr>
    `)
  }

  if (data.specialRequests) {
    rideDetailsRows.push(`
      <tr>
        <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Special Requests</td>
        <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${data.specialRequests}</td>
      </tr>
    `)
  }

  const rideDetailsSection =
    rideDetailsRows.length > 0
      ? `
    <div style="padding: 0 32px 24px;">
      <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">RIDE DETAILS</div>
      <table style="width: 100%; border-collapse: collapse;">
        ${rideDetailsRows.join('')}
      </table>
    </div>
  `
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your PRESTIGO Booking Confirmation</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #1C1C1E;">
  <div style="background-color: #1C1C1E; padding: 0; margin: 0; font-family: 'Montserrat', Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #1C1C1E;">

      <!-- Header copper gradient line -->
      <div style="height: 2px; background: linear-gradient(90deg, #B87333 0%, #E8B87A 50%, transparent 100%);"></div>

      <!-- Logo wordmark -->
      <div style="padding: 32px 32px 16px; text-align: center;">
        <span style="font-size: 22px; font-weight: 400; letter-spacing: 0.6em; color: #F5F2EE;">PRESTI</span><span style="font-size: 22px; font-weight: 400; letter-spacing: 0.6em; color: #B87333;">GO</span>
      </div>

      <!-- Confirmed heading -->
      <h1 style="font-family: 'Montserrat', Arial, sans-serif; font-size: 28px; font-weight: 400; color: #F5F2EE; text-align: center; margin: 0 0 32px;">Your booking is confirmed.</h1>

      <!-- Booking reference box -->
      <div style="background-color: #2A2A2D; border-left: 3px solid #B87333; padding: 24px; margin: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">BOOKING REFERENCE</div>
        <div style="font-size: 22px; font-weight: 600; color: #B87333;">${data.bookingReference}</div>
      </div>

      <!-- YOUR JOURNEY section -->
      <div style="padding: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">YOUR JOURNEY</div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Route</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${data.originAddress} &rarr; ${data.destinationAddress}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Date</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${formattedDate} at ${data.pickupTime}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Vehicle</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${formatVehicleLabel(data.vehicleClass)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Passengers</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${data.passengers}</td>
          </tr>
        </table>
      </div>

      <!-- RIDE DETAILS section (optional fields) -->
      ${rideDetailsSection}

      <!-- Extras section (omitted entirely if no extras selected) -->
      ${extrasRows}

      <!-- Total paid line -->
      <div style="border-top: 1px solid #3A3A3F; padding: 16px 32px; margin-top: 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">TOTAL PAID</div>
        <div style="font-size: 14px; font-weight: 600; color: #F5F2EE;">${formatCZK(data.amountCzk)} (${formatEUR(czkToEur(data.amountCzk))})</div>
      </div>

      <!-- Add to Calendar button -->
      <div style="text-align: center; padding: 24px 32px;">
        <a href="${calendarUrl}" style="display: inline-block; border: 1px solid #B87333; color: #B87333; padding: 12px 24px; text-decoration: none; font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; font-family: 'Montserrat', Arial, sans-serif;">ADD TO CALENDAR</a>
      </div>

      <!-- Support contact -->
      <div style="padding: 24px 32px; color: #9A958F; font-size: 14px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">NEED ASSISTANCE?</div>
        <div style="font-size: 14px; font-weight: 400; color: #9A958F; font-family: 'Montserrat', Arial, sans-serif;">For any queries, contact us at roman@rideprestigo.com or +420 XXX XXX XXX</div>
      </div>

      <!-- Footer -->
      <div style="padding-top: 32px; padding-bottom: 32px;">
        <div style="height: 1px; background-color: #B87333; margin: 0 32px 24px;"></div>
        <div style="text-align: center; margin-bottom: 8px;">
          <span style="font-size: 14px; font-weight: 400; letter-spacing: 0.4em; color: #F5F2EE; font-family: 'Montserrat', Arial, sans-serif;">PRESTI</span><span style="font-size: 14px; font-weight: 400; letter-spacing: 0.4em; color: #B87333; font-family: 'Montserrat', Arial, sans-serif;">GO</span>
        </div>
        <div style="text-align: center; font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; font-family: 'Montserrat', Arial, sans-serif;">PRESTIGE IN EVERY MILE</div>
      </div>

    </div>
  </div>
</body>
</html>`
}

export async function sendClientConfirmation(data: BookingEmailData): Promise<void> {
  const html = buildConfirmationHtml(data)
  try {
    const { error } = await resend.emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [data.email],
      replyTo: 'roman@rideprestigo.com',
      subject: `Your PRESTIGO booking is confirmed — ${data.bookingReference}`,
      html,
    })
    if (error) console.error('Resend client email error:', error)
  } catch (err) {
    console.error('Resend client email exception:', err)
    // Non-fatal — do not throw
  }
}

export async function sendManagerAlert(data: BookingEmailData): Promise<void> {
  const selectedExtras = EXTRAS_CONFIG
    .filter((extra) => {
      if (extra.key === 'childSeat') return data.extraChildSeat
      if (extra.key === 'meetAndGreet') return data.extraMeetGreet
      if (extra.key === 'extraLuggage') return data.extraLuggage
      return false
    })
    .map((extra) => extra.label)

  const extrasText = selectedExtras.length > 0 ? selectedExtras.join(', ') : 'None'

  const text = `New booking received. Details below.

Booking Reference: ${data.bookingReference}
Client: ${data.firstName} ${data.lastName}
Email: ${data.email}
Phone: ${data.phone}
Route: ${data.originAddress} → ${data.destinationAddress}
Vehicle: ${formatVehicleLabel(data.vehicleClass)}
Pickup: ${data.pickupDate} at ${data.pickupTime}
Passengers: ${data.passengers}
Luggage: ${data.luggage}
Flight Number: ${data.flightNumber || 'N/A'}
Extras: ${extrasText}
Special Requests: ${data.specialRequests || 'None'}
Total: CZK ${data.amountCzk}`

  try {
    const { error } = await resend.emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [process.env.MANAGER_EMAIL!],
      replyTo: 'roman@rideprestigo.com',
      subject: `New booking: ${data.bookingReference} — ${data.firstName} ${data.lastName}`,
      text,
    })
    if (error) console.error('Resend manager alert error:', error)
  } catch (err) {
    console.error('Resend manager alert exception:', err)
    // Non-fatal — do not throw
  }
}

export async function sendEmergencyAlert(
  bookingReference: string,
  bookingRow: Record<string, unknown>
): Promise<void> {
  const text = `Supabase save failed after 3 retries.\nFull booking data as JSON follows.\nClient confirmation email has been sent.\n\n${JSON.stringify(bookingRow, null, 2)}`

  try {
    const { error } = await resend.emails.send({
      from: 'PRESTIGO System <bookings@rideprestigo.com>',
      to: [process.env.MANAGER_EMAIL!],
      replyTo: process.env.MANAGER_EMAIL!,
      subject: `ALERT: Supabase save failed — ${bookingReference}`,
      text,
    })
    if (error) console.error('Resend emergency alert error:', error)
  } catch (err) {
    console.error('Resend emergency alert exception:', err)
    // Non-fatal — do not throw
  }
}
