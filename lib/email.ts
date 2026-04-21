import { Resend } from 'resend'
import { czkToEur, formatCZK, formatEUR } from '@/lib/currency'
import { EXTRAS_CONFIG } from '@/lib/extras'


// Lazy initialisation — avoids module-load crash when RESEND_API_KEY is absent
// (e.g. Preview environment where email sending is not needed)
let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not configured')
    }
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

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

/** Escape user-supplied strings before embedding in HTML */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

  // End = start + 1 hour — use Date arithmetic to handle midnight rollover correctly
  const startDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`)
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000)
  const endYear = String(endDate.getFullYear())
  const endMonth = String(endDate.getMonth() + 1).padStart(2, '0')
  const endDay = String(endDate.getDate()).padStart(2, '0')
  const endHour = String(endDate.getHours()).padStart(2, '0')
  const endMin = String(endDate.getMinutes()).padStart(2, '0')
  const end = `${endYear}${endMonth}${endDay}T${endHour}${endMin}00`

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
        <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(data.flightNumber)}</td>
      </tr>
    `)
  }

  if (data.terminal) {
    rideDetailsRows.push(`
      <tr>
        <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Terminal</td>
        <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(data.terminal)}</td>
      </tr>
    `)
  }

  if (data.specialRequests) {
    rideDetailsRows.push(`
      <tr>
        <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Special Requests</td>
        <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(data.specialRequests)}</td>
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
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(data.originAddress)} &rarr; ${escapeHtml(data.destinationAddress)}</td>
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
        <div style="font-size: 14px; font-weight: 400; color: #9A958F; font-family: 'Montserrat', Arial, sans-serif;">For any queries, contact us at info@rideprestigo.com or +420 725 986 855</div>
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
    const { error } = await getResend().emails.send({
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
Total: €${czkToEur(data.amountCzk)} (${data.amountCzk.toLocaleString('cs-CZ')} Kč)`

  try {
    const { error } = await getResend().emails.send({
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

export interface ContactInquiryData {
  name: string
  email: string
  phone?: string
  service?: string
  message: string
}

export async function sendContactInquiry(data: ContactInquiryData): Promise<void> {
  const text = `New contact inquiry from the website.

Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone || '—'}
Service: ${data.service || '—'}

Message:
${data.message}`

  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Website <bookings@rideprestigo.com>',
      to: [process.env.MANAGER_EMAIL!],
      replyTo: data.email,
      subject: `New inquiry: ${data.name} — ${data.service || 'General'}`,
      text,
    })
    if (error) console.error('Resend contact inquiry error:', error)
  } catch (err) {
    console.error('Resend contact inquiry exception:', err)
  }
}

export async function sendEmergencyAlert(
  bookingReference: string,
  bookingRow: Record<string, unknown>
): Promise<void> {
  // Only include non-PII fields in the alert — client email/phone/name stay out of email.
  const safeSummary = {
    booking_reference: bookingRow.booking_reference,
    trip_type: bookingRow.trip_type,
    vehicle_class: bookingRow.vehicle_class,
    pickup_date: bookingRow.pickup_date,
    pickup_time: bookingRow.pickup_time,
    origin_address: bookingRow.origin_address,
    destination_address: bookingRow.destination_address,
    amount_eur: bookingRow.amount_eur,
    amount_czk: bookingRow.amount_czk,
    stripe_payment_intent_id: bookingRow.stripe_payment_intent_id,
  }
  const text = `Supabase save failed after 3 retries.\nClient confirmation email has been sent.\nRetrieve full booking details from Stripe dashboard using the payment intent ID below.\n\n${JSON.stringify(safeSummary, null, 2)}`

  try {
    const { error } = await getResend().emails.send({
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

// ═══════════════════════════════════════════════════════════════════════════
// ROUND-TRIP (Phase 27) — additive, one-way helpers above remain unchanged
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Data shape for a round-trip confirmation email. The caller (Stripe webhook
 * in Plan 27-04) constructs this from PaymentIntent.metadata after
 * saveRoundTripBookings returns a fresh pair.
 *
 * Phase 27 D-05, D-06, D-07, D-08, D-09 locked decisions.
 */
export interface RoundTripEmailData {
  outboundBookingReference: string
  returnBookingReference: string
  tripType: 'round_trip'
  originAddress: string
  destinationAddress: string
  outboundPickupDate: string
  outboundPickupTime: string
  returnPickupDate: string
  returnPickupTime: string
  vehicleClass: string
  passengers: number
  luggage: number
  distanceKm?: number
  /** Pre-promo outbound amount in CZK (extras folded here) */
  outboundAmountCzk: number
  /** Pre-promo return amount in CZK */
  returnAmountCzk: number
  /** Post-promo combined amount — equals what Stripe actually charged */
  combinedAmountCzk: number
  /** Return discount percentage (e.g. 10 for 10%) */
  returnDiscountPct: number
  extraChildSeat: boolean
  extraMeetGreet: boolean
  extraLuggage: boolean
  promoCode?: string
  promoDiscountPct?: number
  firstName: string
  lastName: string
  email: string
  phone: string
  flightNumber?: string
  terminal?: string
  specialRequests?: string
}

/**
 * Build one Google Calendar template URL per leg. Reuses the existing
 * buildGoogleCalendarUrl helper by constructing a minimal BookingEmailData
 * shim for each leg.
 */
function buildRoundTripCalendarUrls(data: RoundTripEmailData): {
  outbound: string
  return: string
} {
  const outboundShim: BookingEmailData = {
    bookingReference: `${data.outboundBookingReference} (Outbound)`,
    tripType: 'round_trip',
    originAddress: data.originAddress,
    destinationAddress: data.destinationAddress,
    pickupDate: data.outboundPickupDate,
    pickupTime: data.outboundPickupTime,
    vehicleClass: data.vehicleClass,
    passengers: data.passengers,
    luggage: data.luggage,
    amountCzk: data.outboundAmountCzk,
    extraChildSeat: data.extraChildSeat,
    extraMeetGreet: data.extraMeetGreet,
    extraLuggage: data.extraLuggage,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
  }
  const returnShim: BookingEmailData = {
    ...outboundShim,
    bookingReference: `${data.returnBookingReference} (Return)`,
    // Return leg route is swapped
    originAddress: data.destinationAddress,
    destinationAddress: data.originAddress,
    pickupDate: data.returnPickupDate,
    pickupTime: data.returnPickupTime,
    amountCzk: data.returnAmountCzk,
    // Extras belong to outbound only
    extraChildSeat: false,
    extraMeetGreet: false,
    extraLuggage: false,
  }
  return {
    outbound: buildGoogleCalendarUrl(outboundShim),
    return: buildGoogleCalendarUrl(returnShim),
  }
}

/**
 * Build the round-trip confirmation HTML — ONE email with TWO journey blocks
 * stacked vertically (per D-05), TWO Google Calendar ghost buttons (per D-07),
 * per-leg prices with return-discount badge (per D-08), and a combined
 * TOTAL PAID line. All user fields HTML-escaped (T-27-05 mitigation).
 *
 * Exported so downstream tests can inspect the rendered output directly.
 */
export function buildRoundTripConfirmationHtml(data: RoundTripEmailData): string {
  const outboundRefSafe = escapeHtml(data.outboundBookingReference)
  const returnRefSafe = escapeHtml(data.returnBookingReference)
  const originSafe = escapeHtml(data.originAddress)
  const destSafe = escapeHtml(data.destinationAddress)
  const firstNameSafe = escapeHtml(data.firstName)
  const flightSafe = data.flightNumber ? escapeHtml(data.flightNumber) : ''
  const terminalSafe = data.terminal ? escapeHtml(data.terminal) : ''
  const specialSafe = data.specialRequests ? escapeHtml(data.specialRequests) : ''

  const vehicleLabel = escapeHtml(formatVehicleLabel(data.vehicleClass))
  const outboundDateFmt = escapeHtml(formatPickupDate(data.outboundPickupDate))
  const returnDateFmt = escapeHtml(formatPickupDate(data.returnPickupDate))
  const outboundTimeSafe = escapeHtml(data.outboundPickupTime)
  const returnTimeSafe = escapeHtml(data.returnPickupTime)

  const outboundPriceCzk = formatCZK(data.outboundAmountCzk)
  const returnPriceCzk = formatCZK(data.returnAmountCzk)
  const combinedPriceCzk = formatCZK(data.combinedAmountCzk)
  const combinedPriceEur = formatEUR(czkToEur(data.combinedAmountCzk))

  // Two Google Calendar URLs — one per leg (D-07 hybrid CTA)
  const calUrls = buildRoundTripCalendarUrls(data)

  // Extras block — outbound only per RTPR-03
  const selectedExtras = EXTRAS_CONFIG.filter((extra) => {
    if (extra.key === 'childSeat') return data.extraChildSeat
    if (extra.key === 'meetAndGreet') return data.extraMeetGreet
    if (extra.key === 'extraLuggage') return data.extraLuggage
    return false
  })
  const extrasHtml = selectedExtras.length === 0
    ? ''
    : `
          <div style="padding: 0 32px 24px;">
            <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">EXTRAS (OUTBOUND)</div>
            <ul style="list-style: disc; padding-left: 18px; margin: 0;">
              ${selectedExtras.map((e) => `<li style="margin: 4px 0; font-size: 14px; color: #F5F2EE; font-family: 'Montserrat', Arial, sans-serif;">${escapeHtml(e.label)} — CZK ${e.price}</li>`).join('')}
            </ul>
          </div>
        `

  // Ride details (flight / terminal / special) — shared, shown once
  const rideDetailsRows: string[] = []
  if (flightSafe) rideDetailsRows.push(`<tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Flight number</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${flightSafe}</td></tr>`)
  if (terminalSafe) rideDetailsRows.push(`<tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Terminal</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${terminalSafe}</td></tr>`)
  if (specialSafe) rideDetailsRows.push(`<tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Special requests</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${specialSafe}</td></tr>`)
  const rideDetailsHtml = rideDetailsRows.length === 0
    ? ''
    : `
          <div style="padding: 0 32px 24px;">
            <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">RIDE DETAILS</div>
            <table style="width: 100%; border-collapse: collapse;">
              ${rideDetailsRows.join('')}
            </table>
          </div>
        `

  // Promo line (only when applied)
  const promoHtml = (data.promoCode && data.promoDiscountPct && data.promoDiscountPct > 0)
    ? `
          <div style="padding: 0 32px 8px; text-align: right;">
            <span style="font-size: 12px; color: #B87333; font-family: 'Montserrat', Arial, sans-serif;">Promo ${escapeHtml(data.promoCode)} applied (−${data.promoDiscountPct}%)</span>
          </div>
        `
    : ''

  // Full HTML body — matches existing PRESTIGO design tokens (#B87333 copper,
  // #F5F2EE offwhite, #2A2A2D card background, Montserrat + Cormorant Garamond,
  // 9px/3px letter-spacing labels)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>PRESTIGO Round-Trip Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background: #1A1A1A; font-family: 'Montserrat', Arial, sans-serif;">
  <div style="max-width: 640px; margin: 0 auto; background: #1A1A1A; padding: 48px 0;">
    <div style="height: 2px; background: #B87333; margin: 0 32px 24px;"></div>
    <div style="padding: 0 32px 32px;">
      <span style="font-family: 'Cormorant Garamond', serif; font-size: 28px; color: #F5F2EE; letter-spacing: 4px;">PRESTIGO</span>
    </div>

    <div style="padding: 0 32px 24px;">
      <h1 style="font-family: 'Cormorant Garamond', serif; font-weight: 300; font-size: 32px; color: #F5F2EE; margin: 0 0 8px;">Your round-trip booking is confirmed.</h1>
      <p style="font-size: 14px; color: #9A9690; margin: 0;">Thank you, ${firstNameSafe}. Both legs are booked and paid.</p>
    </div>

    <!-- Two booking reference boxes -->
    <div style="padding: 0 32px 24px;">
      <table style="width: 100%; border-collapse: separate; border-spacing: 12px 0;">
        <tr>
          <td style="width: 50%; padding: 16px; background: #2A2A2D; border-left: 3px solid #B87333;">
            <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">OUTBOUND</div>
            <div style="font-family: 'Cormorant Garamond', serif; font-size: 18px; color: #F5F2EE;">${outboundRefSafe}</div>
          </td>
          <td style="width: 50%; padding: 16px; background: #2A2A2D; border-left: 3px solid #B87333;">
            <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">RETURN</div>
            <div style="font-family: 'Cormorant Garamond', serif; font-size: 18px; color: #F5F2EE;">${returnRefSafe}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- YOUR OUTBOUND JOURNEY (stacked section 1) -->
    <div style="padding: 0 32px 24px;">
      <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">YOUR OUTBOUND JOURNEY</div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Route</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${originSafe} → ${destSafe}</td></tr>
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Date</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${outboundDateFmt} at ${outboundTimeSafe}</td></tr>
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Vehicle</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${vehicleLabel}</td></tr>
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Passengers</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${data.passengers}</td></tr>
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Leg price</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${outboundPriceCzk}</td></tr>
      </table>
    </div>

    <!-- YOUR RETURN JOURNEY (stacked section 2 — swapped route) -->
    <div style="padding: 0 32px 24px;">
      <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">YOUR RETURN JOURNEY</div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Route</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${destSafe} → ${originSafe}</td></tr>
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Date</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${returnDateFmt} at ${returnTimeSafe}</td></tr>
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Vehicle</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${vehicleLabel}</td></tr>
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Passengers</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${data.passengers}</td></tr>
        <tr><td style="padding: 4px 0; color: #9A9690; font-size: 12px;">Leg price</td><td style="padding: 4px 0; color: #F5F2EE; font-size: 14px; text-align: right;">${returnPriceCzk} <span style="color: #B87333;">(−${data.returnDiscountPct}%)</span></td></tr>
      </table>
    </div>

    ${rideDetailsHtml}
    ${extrasHtml}
    ${promoHtml}

    <!-- TOTAL PAID -->
    <div style="padding: 16px 32px; border-top: 1px solid #3A3A3A; border-bottom: 1px solid #3A3A3A; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #F5F2EE; font-size: 14px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase;">TOTAL PAID</td>
          <td style="color: #F5F2EE; font-size: 18px; font-weight: 500; text-align: right;">${combinedPriceCzk} <span style="color: #9A9690; font-size: 13px;">(${combinedPriceEur})</span></td>
        </tr>
      </table>
    </div>

    <!-- TWO Google Calendar ghost buttons (D-07 hybrid CTA: buttons + attached ICS) -->
    <div style="padding: 0 32px 24px; text-align: center;">
      <table style="width: 100%; border-collapse: separate; border-spacing: 12px 0;">
        <tr>
          <td style="width: 50%; text-align: center;">
            <a href="${calUrls.outbound}" style="display: inline-block; padding: 12px 24px; border: 1px solid #B87333; color: #B87333; font-family: 'Montserrat', Arial, sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 3px; text-transform: uppercase; text-decoration: none;">ADD OUTBOUND</a>
          </td>
          <td style="width: 50%; text-align: center;">
            <a href="${calUrls.return}" style="display: inline-block; padding: 12px 24px; border: 1px solid #B87333; color: #B87333; font-family: 'Montserrat', Arial, sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 3px; text-transform: uppercase; text-decoration: none;">ADD RETURN</a>
          </td>
        </tr>
      </table>
      <p style="color: #9A9690; font-size: 11px; margin: 16px 0 0;">A calendar file with both trips is also attached to this email.</p>
    </div>

    <div style="padding: 24px 32px; border-top: 1px solid #3A3A3A;">
      <p style="color: #9A9690; font-size: 12px; margin: 0 0 4px;">Questions? Reply to this email or contact roman@rideprestigo.com.</p>
      <p style="color: #9A9690; font-size: 11px; margin: 0;">PRESTIGO Chauffeur Service · Prague</p>
    </div>
    <div style="height: 2px; background: #B87333; margin: 24px 32px 0;"></div>
  </div>
</body>
</html>`
}

/**
 * Send the round-trip confirmation email to the client with the multi-event
 * ICS attached. The `ics` string is produced by buildIcs in @/lib/ics
 * (Plan 27-01) — this helper is oblivious to how it was generated.
 *
 * D-06 subject line: `Your PRESTIGO round-trip booking is confirmed — ${outboundRef}`
 * D-07 attachment filename: `prestigo-round-trip-${outboundRef}.ics`
 *
 * Idempotency: NOT enforced here. Caller (Plan 27-04) MUST only call this
 * after saveRoundTripBookings returns a non-null pair. Calling it twice
 * WILL send two emails.
 */
export async function sendRoundTripClientConfirmation(
  data: RoundTripEmailData,
  ics: string
): Promise<void> {
  const html = buildRoundTripConfirmationHtml(data)
  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [data.email],
      replyTo: 'roman@rideprestigo.com',
      subject: `Your PRESTIGO round-trip booking is confirmed — ${data.outboundBookingReference}`,
      html,
      attachments: [
        {
          filename: `prestigo-round-trip-${data.outboundBookingReference}.ics`,
          content: ics,
        },
      ],
    })
    if (error) console.error('Resend round-trip client email error:', error)
  } catch (err) {
    console.error('Resend round-trip client email exception:', err)
    // Non-fatal — do not throw
  }
}

/**
 * Send the manager alert for a round-trip booking as ONE plain-text email
 * listing both legs + combined total. D-10 — parallel to sendManagerAlert,
 * but consolidated (NOT two emails, anti-Pitfall-8).
 */
export async function sendRoundTripManagerAlert(data: RoundTripEmailData): Promise<void> {
  const selectedExtras = EXTRAS_CONFIG
    .filter((extra) => {
      if (extra.key === 'childSeat') return data.extraChildSeat
      if (extra.key === 'meetAndGreet') return data.extraMeetGreet
      if (extra.key === 'extraLuggage') return data.extraLuggage
      return false
    })
    .map((extra) => extra.label)
  const extrasText = selectedExtras.length > 0 ? selectedExtras.join(', ') : 'None'

  const promoText = (data.promoCode && data.promoDiscountPct && data.promoDiscountPct > 0)
    ? `Promo: ${data.promoCode} (−${data.promoDiscountPct}%)`
    : 'Promo: None'

  const text = `New ROUND-TRIP booking received. Both legs confirmed & paid.

─── OUTBOUND ───
Booking Reference: ${data.outboundBookingReference}
Route: ${data.originAddress} → ${data.destinationAddress}
Pickup: ${data.outboundPickupDate} at ${data.outboundPickupTime}
Leg price: ${formatCZK(data.outboundAmountCzk)}

─── RETURN ───
Booking Reference: ${data.returnBookingReference}
Route: ${data.destinationAddress} → ${data.originAddress}
Pickup: ${data.returnPickupDate} at ${data.returnPickupTime}
Leg price: ${formatCZK(data.returnAmountCzk)} (−${data.returnDiscountPct}% discount)

─── CLIENT ───
Name: ${data.firstName} ${data.lastName}
Email: ${data.email}
Phone: ${data.phone}
Vehicle: ${formatVehicleLabel(data.vehicleClass)}
Passengers: ${data.passengers}
Luggage: ${data.luggage}
Flight: ${data.flightNumber || 'N/A'}
Terminal: ${data.terminal || 'N/A'}
Extras (outbound only): ${extrasText}
Special Requests: ${data.specialRequests || 'None'}
${promoText}

─── TOTAL PAID ───
${formatCZK(data.combinedAmountCzk)} (${formatEUR(czkToEur(data.combinedAmountCzk))})`

  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [process.env.MANAGER_EMAIL!],
      replyTo: 'roman@rideprestigo.com',
      subject: `New round-trip booking: ${data.outboundBookingReference} — ${data.firstName} ${data.lastName}`,
      text,
    })
    if (error) console.error('Resend round-trip manager alert error:', error)
  } catch (err) {
    console.error('Resend round-trip manager alert exception:', err)
    // Non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-day quote emails (Phase 31 — MULTIDAY-05)
// Quotes are NOT persisted to Supabase — email is the sole record (D-11).
// ─────────────────────────────────────────────────────────────────────────────

export interface MultidayDaySummary {
  index: number                           // 1-based day number for display
  type: 'transfer' | 'hourly'
  date?: string                           // 'YYYY-MM-DD' or undefined
  time?: string                           // 'HH:MM', default '09:00'
  // Transfer fields
  from?: string
  to?: string
  stops?: string[]                        // addresses only; []-safe
  // Hourly fields
  city?: string
  hours?: number
}

export interface MultidayEmailData {
  quoteReference: string                  // e.g. 'MQ-20260411-ABC123'
  days: MultidayDaySummary[]
  startDate?: string                      // 'YYYY-MM-DD' or undefined
  firstName: string
  lastName: string
  email: string
  phone: string
  specialRequests?: string
}

function formatMultidayStartDate(iso?: string): string {
  if (!iso) return 'Flexible — to be confirmed'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDayDateTime(date?: string, time?: string): string {
  const timePart = time || '09:00'
  if (!date) return timePart
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return `${date} ${timePart}`
  const [, y, m, d] = match
  const dateObj = new Date(Number(y), Number(m) - 1, Number(d))
  const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${dateStr} · ${timePart}`
}

function buildMultidayDayRowHtml(day: MultidayDaySummary): string {
  const dayLabel = `Day ${day.index}`
  const datetime = escapeHtml(formatDayDateTime(day.date, day.time))
  if (day.type === 'transfer') {
    const from = escapeHtml(day.from ?? '')
    const to = escapeHtml(day.to ?? '')
    const stopCount = day.stops?.length ?? 0
    const stopsHtml =
      stopCount > 0
        ? `<div style="color:#9A958F;font-size:12px;margin-top:4px;">Stops: ${day.stops!
            .map((s) => escapeHtml(s))
            .join(' · ')}</div>`
        : ''
    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #3A3A3F;vertical-align:top;width:72px;">
          <div style="font-family:'Montserrat',sans-serif;font-size:10px;letter-spacing:0.2em;color:#D4924A;text-transform:uppercase;">${dayLabel}</div>
          <div style="font-family:'Montserrat',sans-serif;font-size:11px;color:#9A958F;margin-top:4px;">${datetime}</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #3A3A3F;color:#F5F2EE;">
          <div style="font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:0.16em;color:#E8B87A;text-transform:uppercase;margin-bottom:4px;">Transfer</div>
          <div style="font-size:14px;line-height:1.5;">${from} → ${to}</div>
          ${stopsHtml}
        </td>
      </tr>
    `
  }
  const city = escapeHtml(day.city ?? '')
  const hours = Number.isFinite(day.hours) ? day.hours : 0
  return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #3A3A3F;vertical-align:top;width:72px;">
        <div style="font-family:'Montserrat',sans-serif;font-size:10px;letter-spacing:0.2em;color:#D4924A;text-transform:uppercase;">${dayLabel}</div>
        <div style="font-family:'Montserrat',sans-serif;font-size:11px;color:#9A958F;margin-top:4px;">${datetime}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #3A3A3F;color:#F5F2EE;">
        <div style="font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:0.16em;color:#E8B87A;text-transform:uppercase;margin-bottom:4px;">Hourly hire</div>
        <div style="font-size:14px;line-height:1.5;">${city} — ${hours} ${hours === 1 ? 'hour' : 'hours'}</div>
      </td>
    </tr>
  `
}

function buildMultidayOperatorHtml(data: MultidayEmailData): string {
  const first = escapeHtml(data.firstName)
  const last = escapeHtml(data.lastName)
  const email = escapeHtml(data.email)
  const phone = escapeHtml(data.phone)
  const reference = escapeHtml(data.quoteReference)
  const startDate = escapeHtml(formatMultidayStartDate(data.startDate))
  const specialRequests = data.specialRequests ? escapeHtml(data.specialRequests) : ''
  const rowsHtml = data.days.map(buildMultidayDayRowHtml).join('')

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#1C1C1E;font-family:'Montserrat',Helvetica,Arial,sans-serif;color:#F5F2EE;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1C1C1E;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#141416;border:1px solid #3A3A3F;">
        <tr><td style="padding:32px 24px;border-bottom:1px solid #3A3A3F;background:linear-gradient(180deg,#141416,#1C1C1E);">
          <div style="font-size:10px;letter-spacing:0.32em;color:#D4924A;text-transform:uppercase;">PRESTIGO · Multi-day quote request</div>
          <h1 style="margin:12px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;color:#F5F2EE;">New multi-day quote</h1>
          <div style="margin-top:8px;font-size:12px;color:#9A958F;">Reference ${reference}</div>
        </td></tr>

        <tr><td style="padding:24px;">
          <div style="font-size:10px;letter-spacing:0.32em;color:#D4924A;text-transform:uppercase;margin-bottom:12px;">Client</div>
          <div style="font-size:14px;line-height:1.6;">${first} ${last}</div>
          <div style="font-size:13px;color:#9A958F;line-height:1.6;">${email} · ${phone}</div>
          <div style="font-size:13px;color:#9A958F;margin-top:8px;">Start date: ${startDate}</div>
        </td></tr>

        <tr><td style="padding:0 24px 24px;">
          <div style="font-size:10px;letter-spacing:0.32em;color:#D4924A;text-transform:uppercase;margin:16px 0 12px;">Itinerary (${data.days.length} ${data.days.length === 1 ? 'day' : 'days'})</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #3A3A3F;">
            ${rowsHtml}
          </table>
        </td></tr>

        ${
          specialRequests
            ? `<tr><td style="padding:0 24px 24px;">
                 <div style="font-size:10px;letter-spacing:0.32em;color:#D4924A;text-transform:uppercase;margin-bottom:8px;">Special requests</div>
                 <div style="font-size:13px;color:#F5F2EE;line-height:1.6;white-space:pre-wrap;">${specialRequests}</div>
               </td></tr>`
            : ''
        }

        <tr><td style="padding:20px 24px;border-top:1px solid #3A3A3F;font-size:11px;color:#9A958F;">
          Respond within 24 hours · Reference ${reference}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function buildMultidayClientAckHtml(data: MultidayEmailData): string {
  const first = escapeHtml(data.firstName)
  const reference = escapeHtml(data.quoteReference)
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#1C1C1E;font-family:'Montserrat',Helvetica,Arial,sans-serif;color:#F5F2EE;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1C1C1E;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141416;border:1px solid #3A3A3F;">
        <tr><td style="padding:40px 32px;text-align:center;background:linear-gradient(180deg,#141416,#1C1C1E);border-bottom:1px solid #3A3A3F;">
          <div style="font-size:10px;letter-spacing:0.32em;color:#D4924A;text-transform:uppercase;">PRESTIGO</div>
          <h1 style="margin:16px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;color:#F5F2EE;font-weight:400;">Your request is in our hands.</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:14px;line-height:1.7;color:#F5F2EE;margin:0 0 16px;">Dear ${first},</p>
          <p style="font-size:14px;line-height:1.7;color:#F5F2EE;margin:0 0 16px;">Thank you for your multi-day chauffeur request. We have received your itinerary and our team will review it personally.</p>
          <p style="font-size:14px;line-height:1.7;color:#F5F2EE;margin:0 0 16px;">You can expect a tailored quote by email <strong style="color:#E8B87A;">within 24 hours</strong>. If anything is urgent, please reply to this email and we&rsquo;ll respond immediately.</p>
          <div style="margin:24px 0;padding:16px;border:1px solid #3A3A3F;background:#1C1C1E;text-align:center;">
            <div style="font-size:10px;letter-spacing:0.2em;color:#9A958F;text-transform:uppercase;">Reference</div>
            <div style="font-size:18px;color:#E8B87A;margin-top:4px;font-family:'Cormorant Garamond',Georgia,serif;">${reference}</div>
          </div>
          <p style="font-size:13px;line-height:1.6;color:#9A958F;margin:0;">— The PRESTIGO team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export async function sendMultidayOperatorAlert(data: MultidayEmailData): Promise<void> {
  const to = process.env.MANAGER_EMAIL
  if (!to) {
    console.warn('[email] MANAGER_EMAIL not set — skipping multi-day operator alert')
    return
  }
  try {
    await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [to],
      subject: `New multi-day quote: ${data.quoteReference} — ${data.firstName} ${data.lastName}`,
      html: buildMultidayOperatorHtml(data),
      replyTo: data.email,
    })
  } catch (err) {
    console.warn('[email] sendMultidayOperatorAlert failed (non-fatal)', err)
  }
}

export async function sendMultidayClientAck(data: MultidayEmailData): Promise<void> {
  try {
    await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [data.email],
      subject: `Your PRESTIGO multi-day quote request — ${data.quoteReference}`,
      html: buildMultidayClientAckHtml(data),
    })
  } catch (err) {
    console.warn('[email] sendMultidayClientAck failed (non-fatal)', err)
  }
}

interface StatusEmailBooking {
  id: string
  booking_reference: string
  origin_address: string
  destination_address: string | null
  pickup_date: string
  pickup_time: string
  vehicle_class: string
  client_first_name: string
  client_last_name: string
  client_email: string
}

function buildStatusEmailHtml(booking: StatusEmailBooking, heading: string, closingLine: string): string {
  const formattedDate = formatPickupDate(booking.pickup_date)
  const route = booking.destination_address
    ? `${escapeHtml(booking.origin_address)} &rarr; ${escapeHtml(booking.destination_address)}`
    : escapeHtml(booking.origin_address)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading)} — Prestigo</title>
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

      <!-- Heading -->
      <h1 style="font-family: 'Montserrat', Arial, sans-serif; font-size: 28px; font-weight: 400; color: #F5F2EE; text-align: center; margin: 0 0 32px;">${escapeHtml(heading)}</h1>

      <!-- Booking reference box -->
      <div style="background-color: #2A2A2D; border-left: 3px solid #B87333; padding: 24px; margin: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">BOOKING REFERENCE</div>
        <div style="font-size: 22px; font-weight: 600; color: #B87333;">${escapeHtml(booking.booking_reference)}</div>
      </div>

      <!-- Journey section -->
      <div style="padding: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">YOUR JOURNEY</div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Route</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${route}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Date</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${formattedDate} at ${escapeHtml(booking.pickup_time)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Vehicle</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${formatVehicleLabel(booking.vehicle_class)}</td>
          </tr>
        </table>
      </div>

      <!-- Closing line -->
      <div style="padding: 0 32px 32px; font-size: 14px; color: #9A958F; font-family: 'Montserrat', Arial, sans-serif;">
        ${escapeHtml(closingLine)}
      </div>

      <!-- Support contact -->
      <div style="padding: 0 32px 24px; color: #9A958F; font-size: 14px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">NEED ASSISTANCE?</div>
        <div style="font-size: 14px; font-weight: 400; color: #9A958F; font-family: 'Montserrat', Arial, sans-serif;">Contact us at info@rideprestigo.com or +420 725 986 855</div>
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

export async function sendStatusConfirmedEmail(booking: StatusEmailBooking): Promise<void> {
  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [booking.client_email],
      subject: `Your booking ${escapeHtml(booking.booking_reference)} is confirmed — Prestigo`,
      html: buildStatusEmailHtml(booking, 'Booking Confirmed', 'We look forward to your trip.'),
    })
    if (error) console.error('[booking-notify] confirmed email error:', error)
  } catch (err) {
    console.error('[booking-notify] confirmed email failed:', err)
  }
}

export async function sendStatusCancelledEmail(booking: StatusEmailBooking): Promise<void> {
  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [booking.client_email],
      subject: `Booking ${escapeHtml(booking.booking_reference)} cancelled — Prestigo`,
      html: buildStatusEmailHtml(booking, 'Booking Cancelled', 'If you have any questions, please contact us.'),
    })
    if (error) console.error('[booking-notify] cancelled email error:', error)
  } catch (err) {
    console.error('[booking-notify] cancelled email failed:', err)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DRIVER ASSIGNMENT EMAILS (Phase 40)
// ═══════════════════════════════════════════════════════════════════════════

export interface DriverAssignmentEmailData {
  driverName: string
  driverEmail: string
  bookingReference: string
  pickupDate: string
  pickupTime: string
  originAddress: string
  destinationAddress: string
  passengerFirstName: string
  passengerLastName: string
  passengerPhone: string
  acceptUrl: string
  declineUrl: string
}

function buildDriverAssignmentHtml(data: DriverAssignmentEmailData): string {
  const formattedDate = formatPickupDate(data.pickupDate)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trip Assignment — PRESTIGO</title>
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

      <!-- Heading -->
      <h1 style="font-family: 'Montserrat', Arial, sans-serif; font-size: 24px; font-weight: 400; color: #F5F2EE; text-align: center; margin: 0 0 32px;">You have been assigned a trip.</h1>

      <!-- Booking reference box -->
      <div style="background-color: #2A2A2D; border-left: 3px solid #B87333; padding: 24px; margin: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">BOOKING REFERENCE</div>
        <div style="font-size: 22px; font-weight: 600; color: #B87333;">${escapeHtml(data.bookingReference)}</div>
      </div>

      <!-- TRIP DETAILS section -->
      <div style="padding: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">TRIP DETAILS</div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Pickup Date</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(formattedDate)} at ${escapeHtml(data.pickupTime)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">From</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(data.originAddress)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">To</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(data.destinationAddress)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Passenger</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(data.passengerFirstName)} ${escapeHtml(data.passengerLastName)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Passenger Phone</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(data.passengerPhone)}</td>
          </tr>
        </table>
      </div>

      <!-- CTA buttons -->
      <div style="text-align: center; padding: 24px 32px; display: flex; gap: 16px; justify-content: center;">
        <a href="${escapeHtml(data.acceptUrl)}" style="display: inline-block; border: 1px solid #B87333; color: #B87333; padding: 14px 28px; text-decoration: none; font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; font-family: 'Montserrat', Arial, sans-serif; margin-right: 12px;">ACCEPT TRIP</a>
        <a href="${escapeHtml(data.declineUrl)}" style="display: inline-block; border: 1px solid #CC3333; color: #CC3333; padding: 14px 28px; text-decoration: none; font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; font-family: 'Montserrat', Arial, sans-serif;">DECLINE TRIP</a>
      </div>

      <!-- Note about link expiry -->
      <div style="padding: 0 32px 24px; text-align: center;">
        <p style="font-size: 12px; color: #9A958F; font-family: 'Montserrat', Arial, sans-serif; margin: 0;">These links are valid for 48 hours. Please respond as soon as possible.</p>
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

/**
 * Send driver assignment email with Accept/Decline CTA links.
 * Non-fatal — catches and logs errors, does not throw.
 */
export async function sendDriverAssignmentEmail(data: DriverAssignmentEmailData): Promise<void> {
  try {
    const formattedDate = formatPickupDate(data.pickupDate)
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [data.driverEmail],
      subject: `Trip assignment: ${data.bookingReference} - ${formattedDate} at ${data.pickupTime}`,
      html: buildDriverAssignmentHtml(data),
    })
    if (error) console.error('[driver-assign] assignment email error:', error)
  } catch (err) {
    console.error('[driver-assign] assignment email exception:', err)
    // Non-fatal — do not throw
  }
}

export interface DriverDeclineNotificationData {
  bookingReference: string
  pickupDate: string
  pickupTime: string
  originAddress: string
  destinationAddress: string
  driverName: string
}

/**
 * Send decline notification to MANAGER_EMAIL when a driver declines a trip.
 * Non-fatal — catches and logs errors, does not throw.
 */
export async function sendDriverDeclineNotification(data: DriverDeclineNotificationData): Promise<void> {
  const formattedDate = formatPickupDate(data.pickupDate)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Driver Declined — ${escapeHtml(data.bookingReference)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #1C1C1E; font-family: 'Montserrat', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px; color: #F5F2EE;">
    <div style="height: 2px; background: linear-gradient(90deg, #B87333 0%, #E8B87A 50%, transparent 100%); margin-bottom: 32px;"></div>
    <h1 style="font-size: 20px; font-weight: 400; color: #F5F2EE; margin: 0 0 24px;">Driver Declined Assignment</h1>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Booking Reference</td>
        <td style="font-size: 14px; color: #B87333; padding: 8px 0; font-weight: 600;">${escapeHtml(data.bookingReference)}</td>
      </tr>
      <tr>
        <td style="font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0;">Pickup Date</td>
        <td style="font-size: 14px; color: #F5F2EE; padding: 8px 0;">${escapeHtml(formattedDate)} at ${escapeHtml(data.pickupTime)}</td>
      </tr>
      <tr>
        <td style="font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0;">Route</td>
        <td style="font-size: 14px; color: #F5F2EE; padding: 8px 0;">${escapeHtml(data.originAddress)} &rarr; ${escapeHtml(data.destinationAddress)}</td>
      </tr>
      <tr>
        <td style="font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0;">Declined By</td>
        <td style="font-size: 14px; color: #CC3333; padding: 8px 0; font-weight: 600;">${escapeHtml(data.driverName)}</td>
      </tr>
    </table>
    <p style="margin-top: 24px; font-size: 14px; color: #9A958F;">Please assign a different driver as soon as possible.</p>
    <div style="height: 1px; background-color: #B87333; margin: 32px 0 16px;"></div>
    <div style="text-align: center;">
      <span style="font-size: 12px; letter-spacing: 0.4em; color: #F5F2EE;">PRESTI</span><span style="font-size: 12px; letter-spacing: 0.4em; color: #B87333;">GO</span>
    </div>
  </div>
</body>
</html>`

  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [process.env.MANAGER_EMAIL!],
      subject: `Driver declined: ${data.bookingReference}`,
      html,
    })
    if (error) console.error('[driver-assign] decline notification error:', error)
  } catch (err) {
    console.error('[driver-assign] decline notification exception:', err)
    // Non-fatal — do not throw
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REMINDER EMAILS (Phase 41)
// ═══════════════════════════════════════════════════════════════════════════

/** Shape of a driver record returned from a joined driver_assignments query. */
export interface DriverInfo {
  name: string
  email: string
  vehicle_info: string
}

/**
 * Extracts the accepted driver from a booking's driver_assignments array.
 * Returns undefined if no assignment with status='accepted' is found.
 */
export function getAcceptedDriver(
  driverAssignments: Array<{ status: string; drivers?: unknown }> | null | undefined
): DriverInfo | undefined {
  const assignment = (driverAssignments ?? []).find(da => da.status === 'accepted')
  return assignment?.drivers as DriverInfo | undefined
}

export interface ReminderEmailBooking {
  booking_reference: string
  pickup_date: string        // 'YYYY-MM-DD'
  pickup_time: string        // 'HH:MM'
  origin_address: string
  destination_address: string | null
  vehicle_class: string
  client_email: string
  // Driver info (optional — only present if driver assigned+accepted)
  driver_name?: string
  driver_email?: string
  driver_vehicle_info?: string
  // Passenger info (for driver emails)
  client_first_name?: string
  client_last_name?: string
  client_phone?: string
}

function buildClientReminderHtml(booking: ReminderEmailBooking, horizon: '24h' | '2h'): string {
  const formattedDate = formatPickupDate(booking.pickup_date)
  const heading = horizon === '24h' ? 'Your Transfer Tomorrow' : 'Your Transfer in 2 Hours'
  const closingLine = horizon === '24h'
    ? 'We look forward to your trip.'
    : 'Your driver will be at the pickup point shortly.'
  const destination = booking.destination_address
    ? escapeHtml(booking.destination_address)
    : 'As directed'

  const driverSection = booking.driver_name
    ? `
      <!-- YOUR DRIVER section -->
      <div style="padding: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">YOUR DRIVER</div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Name</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(booking.driver_name)}</td>
          </tr>
          ${booking.driver_vehicle_info ? `
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Vehicle</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(booking.driver_vehicle_info)}</td>
          </tr>
          ` : ''}
        </table>
      </div>
    `
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading)} — Prestigo</title>
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

      <!-- Heading -->
      <h1 style="font-family: 'Montserrat', Arial, sans-serif; font-size: 24px; font-weight: 400; color: #F5F2EE; text-align: center; margin: 0 0 32px;">${escapeHtml(heading)}</h1>

      <!-- Booking reference box -->
      <div style="background-color: #2A2A2D; border-left: 3px solid #B87333; padding: 24px; margin: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">BOOKING REFERENCE</div>
        <div style="font-size: 22px; font-weight: 600; color: #B87333;">${escapeHtml(booking.booking_reference)}</div>
      </div>

      <!-- YOUR JOURNEY section -->
      <div style="padding: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">YOUR JOURNEY</div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Route</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(booking.origin_address)} &rarr; ${destination}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Date</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(formattedDate)} at ${escapeHtml(booking.pickup_time)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Vehicle</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${formatVehicleLabel(booking.vehicle_class)}</td>
          </tr>
        </table>
      </div>

      ${driverSection}

      <!-- Closing message -->
      <div style="padding: 0 32px 24px;">
        <p style="font-size: 14px; color: #9A958F; margin: 0;">${escapeHtml(closingLine)}</p>
      </div>

      <!-- Support contact -->
      <div style="padding: 24px 32px; color: #9A958F; font-size: 14px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">NEED ASSISTANCE?</div>
        <div style="font-size: 14px; font-weight: 400; color: #9A958F; font-family: 'Montserrat', Arial, sans-serif;">For any queries, contact us at info@rideprestigo.com or +420 725 986 855</div>
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

function buildDriverReminderHtml(booking: ReminderEmailBooking, horizon: '24h' | '2h'): string {
  const formattedDate = formatPickupDate(booking.pickup_date)
  const heading = horizon === '24h' ? 'Trip Reminder — Tomorrow' : 'Trip Reminder — 2 Hours'
  const closingLine = horizon === '24h'
    ? 'Please ensure you are ready at the pickup location.'
    : 'Please head to the pickup location now.'
  const destination = booking.destination_address
    ? escapeHtml(booking.destination_address)
    : 'As directed'
  const passengerName = [booking.client_first_name, booking.client_last_name]
    .filter(Boolean)
    .map((s) => escapeHtml(s!))
    .join(' ') || 'Not provided'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading)} — ${escapeHtml(booking.booking_reference)}</title>
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

      <!-- Heading -->
      <h1 style="font-family: 'Montserrat', Arial, sans-serif; font-size: 24px; font-weight: 400; color: #F5F2EE; text-align: center; margin: 0 0 32px;">${escapeHtml(heading)}</h1>

      <!-- Booking reference box -->
      <div style="background-color: #2A2A2D; border-left: 3px solid #B87333; padding: 24px; margin: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">BOOKING REFERENCE</div>
        <div style="font-size: 22px; font-weight: 600; color: #B87333;">${escapeHtml(booking.booking_reference)}</div>
      </div>

      <!-- TRIP DETAILS section -->
      <div style="padding: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">TRIP DETAILS</div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Date</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(formattedDate)} at ${escapeHtml(booking.pickup_time)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">From</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(booking.origin_address)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">To</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${destination}</td>
          </tr>
        </table>
      </div>

      <!-- PASSENGER section -->
      <div style="padding: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">PASSENGER</div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Name</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${passengerName}</td>
          </tr>
          ${booking.client_phone ? `
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Phone</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${escapeHtml(booking.client_phone)}</td>
          </tr>
          ` : ''}
        </table>
      </div>

      <!-- Closing message -->
      <div style="padding: 0 32px 24px;">
        <p style="font-size: 14px; color: #9A958F; margin: 0;">${escapeHtml(closingLine)}</p>
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

/**
 * Send client reminder email for 24h or 2h before pickup.
 * Non-fatal — catches and logs errors, does not throw.
 */
export async function sendClientReminderEmail(
  booking: ReminderEmailBooking,
  horizon: '24h' | '2h'
): Promise<void> {
  try {
    const subject = horizon === '24h'
      ? 'Your transfer tomorrow — Prestigo'
      : 'Your transfer in 2 hours — Prestigo'
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [booking.client_email],
      subject,
      html: buildClientReminderHtml(booking, horizon),
    })
    if (error) console.error('[reminder] client email error:', error)
  } catch (err) {
    console.error('[reminder] client email failed:', err)
  }
}

/**
 * Send driver reminder email for 24h or 2h before pickup.
 * Non-fatal — catches and logs errors, does not throw.
 * Silently skips if driver_email is not set.
 */
export async function sendDriverReminderEmail(
  booking: ReminderEmailBooking,
  horizon: '24h' | '2h'
): Promise<void> {
  if (!booking.driver_email) return
  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [booking.driver_email],
      subject: `Trip reminder — ${booking.booking_reference}`,
      html: buildDriverReminderHtml(booking, horizon),
    })
    if (error) console.error('[reminder] driver email error:', error)
  } catch (err) {
    console.error('[reminder] driver email failed:', err)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-TRIP THANK-YOU + REVIEW REQUEST EMAIL
// ═══════════════════════════════════════════════════════════════════════════

function buildPostTripHtml(booking: StatusEmailBooking): string {
  const formattedDate = formatPickupDate(booking.pickup_date)
  const route = booking.destination_address
    ? `${escapeHtml(booking.origin_address)} &rarr; ${escapeHtml(booking.destination_address)}`
    : escapeHtml(booking.origin_address)
  const firstName = escapeHtml(booking.client_first_name)
  const reviewUrl = process.env.GOOGLE_REVIEW_URL ?? 'https://g.page/r/CdQIkiuHQ1UOEBM/review'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank you for riding with Prestigo</title>
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

      <!-- Heading -->
      <h1 style="font-family: 'Montserrat', Arial, sans-serif; font-size: 26px; font-weight: 400; color: #F5F2EE; text-align: center; margin: 0 0 8px;">Thank You, ${firstName}</h1>
      <p style="font-family: 'Montserrat', Arial, sans-serif; font-size: 14px; color: #9A958F; text-align: center; margin: 0 32px 32px; line-height: 1.7;">It was a pleasure to have you on board. We hope your journey was everything you expected — and more.</p>

      <!-- Booking reference box -->
      <div style="background-color: #2A2A2D; border-left: 3px solid #B87333; padding: 24px; margin: 0 32px 24px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 8px;">BOOKING REFERENCE</div>
        <div style="font-size: 22px; font-weight: 600; color: #B87333;">${escapeHtml(booking.booking_reference)}</div>
      </div>

      <!-- Journey summary -->
      <div style="padding: 0 32px 32px;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 12px;">YOUR JOURNEY</div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0; width: 40%;">Route</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${route}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0;">Date</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${formattedDate} at ${escapeHtml(booking.pickup_time)}</td>
          </tr>
          <tr>
            <td style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #9A958F; padding: 8px 16px 8px 0;">Vehicle</td>
            <td style="font-size: 14px; font-weight: 400; color: #F5F2EE; padding: 8px 0;">${formatVehicleLabel(booking.vehicle_class)}</td>
          </tr>
        </table>
      </div>

      <!-- Review request -->
      <div style="background-color: #2A2A2D; margin: 0 32px 32px; padding: 32px; text-align: center;">
        <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #B87333; margin-bottom: 16px;">SHARE YOUR EXPERIENCE</div>
        <p style="font-size: 14px; color: #9A958F; margin: 0 0 24px; line-height: 1.7;">Your feedback means the world to us. If you enjoyed the service, a quick review helps other travellers discover Prestigo.</p>
        <a href="${escapeHtml(reviewUrl)}"
           style="display: inline-block; background-color: #B87333; color: #F5F2EE; padding: 16px 36px; text-decoration: none; font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; font-family: 'Montserrat', Arial, sans-serif;">
          LEAVE A REVIEW
        </a>
      </div>

      <!-- Book again hint -->
      <div style="padding: 0 32px 32px; text-align: center;">
        <p style="font-size: 14px; color: #9A958F; margin: 0; line-height: 1.7;">
          Planning another trip? Book at
          <a href="https://rideprestigo.com" style="color: #B87333; text-decoration: none;">rideprestigo.com</a>
          or contact us at
          <a href="mailto:info@rideprestigo.com" style="color: #B87333; text-decoration: none;">info@rideprestigo.com</a>.
        </p>
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

/**
 * Send post-trip thank-you + review request to the client.
 * Triggered when admin marks a booking as completed.
 * Non-fatal — catches and logs errors, does not throw.
 */
export async function sendPostTripEmail(booking: StatusEmailBooking): Promise<void> {
  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [booking.client_email],
      subject: `Thank you for riding with Prestigo — ${escapeHtml(booking.booking_reference)}`,
      html: buildPostTripHtml(booking),
    })
    if (error) console.error('[booking-notify] post-trip email error:', error)
  } catch (err) {
    console.error('[booking-notify] post-trip email failed:', err)
  }
}
