// Sender for the card-on-file client emails (Phase 88, plan 88-09; MAIL-01).
//
// Exactly once per payment ledger event_key, send-then-record (lib/payments/notify.ts, 88-REVIEW A-WR-10): a replayed
// webhook or a re-driven sweep that reaches a key already delivered gets 'duplicate' and sends nothing, while a send
// that failed is retried by the next caller instead of being lost. The shipped email log helper (lib/email-log.ts)
// is deliberately NOT used: its dedupe is a 10-minute window, not exactly-once (Research Pitfall 10).
//
// Server-only by use. Creates its own lazy Resend client the same way lib/email.ts does (RESEND_API_KEY is
// not present in every environment, so nothing may touch it at module load).

import { Resend } from 'resend'
import { deliverOnce } from '@/lib/payments/notify'
import { renderPaymentEmail, type PaymentEmailKind, type PaymentEmailVars } from '@/lib/payments/emails/render'
import { holdDateIso } from '@/lib/payments/timing'
import { eurToCzk } from '@/lib/currency'
import { CUSTOMER_REPLY_TO, buildGoogleCalendarUrl, type BookingEmailData } from '@/lib/email'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY environment variable is not configured')
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

type BookingRow = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** BookingEmailData (the shape the shipped operator alert and calendar link take) from a bookings row. */
export function bookingEmailDataFromRow(row: BookingRow): BookingEmailData {
  const amountEur = num(row.amount_eur)
  return {
    bookingReference: str(row.booking_reference),
    tripType: str(row.trip_type),
    originAddress: str(row.origin_address),
    destinationAddress: str(row.destination_address),
    pickupDate: str(row.pickup_date),
    pickupTime: str(row.pickup_time),
    returnDate: str(row.return_date) || undefined,
    vehicleClass: str(row.vehicle_class),
    passengers: num(row.passengers) ?? 1,
    luggage: num(row.luggage) ?? 0,
    hours: num(row.hours),
    distanceKm: num(row.distance_km),
    amountCzk: num(row.amount_czk) ?? eurToCzk(amountEur ?? 0),
    extraChildSeat: row.extra_child_seat === true,
    extraMeetGreet: row.extra_meet_greet === true,
    extraLuggage: row.extra_luggage === true,
    firstName: str(row.client_first_name),
    lastName: str(row.client_last_name),
    email: str(row.client_email),
    phone: str(row.client_phone),
    flightNumber: str(row.flight_number) || undefined,
    terminal: str(row.terminal) || undefined,
    specialRequests: str(row.special_requests) || undefined,
  }
}

function emailVarsFromRow(
  booking: BookingRow,
  extra: { variant?: PaymentEmailVars['variant']; diffMinor?: number; payUrl?: string },
): PaymentEmailVars {
  const holdAtMs = typeof booking.hold_at === 'string' ? Date.parse(booking.hold_at) : NaN
  const currency = booking.payment_currency === 'czk' ? 'czk' : 'eur'
  let calendarUrl: string | undefined
  try {
    calendarUrl = buildGoogleCalendarUrl(bookingEmailDataFromRow(booking))
  } catch {
    calendarUrl = undefined
  }
  return {
    reference: str(booking.booking_reference),
    amountMinor: num(booking.payment_amount_minor) ?? 0,
    currency,
    pickupDateIso: str(booking.pickup_date),
    pickupTime: str(booking.pickup_time),
    origin: str(booking.origin_address),
    destination: str(booking.destination_address),
    vehicleClass: str(booking.vehicle_class),
    passengers: num(booking.passengers) ?? 1,
    holdDateIso: Number.isFinite(holdAtMs) ? holdDateIso(holdAtMs) : null,
    variant: extra.variant,
    diffMinor: extra.diffMinor,
    payUrl: extra.payUrl,
    calendarUrl,
  }
}

export async function sendPaymentEmail(input: {
  kind: PaymentEmailKind
  booking: BookingRow
  /** The ledger key, `email:<kind>:<bookingId>[:<attempt>]`; recorded once the message is delivered. */
  eventKey: string
  variant?: PaymentEmailVars['variant']
  diffMinor?: number
  payUrl?: string
}): Promise<'sent' | 'duplicate' | 'failed'> {
  const { kind, booking, eventKey } = input
  const bookingId = str(booking.id)
  const to = str(booking.client_email)
  if (!bookingId || !to) {
    console.error('[payment-email] no recipient', { bookingId, kind })
    return 'failed'
  }

  let rendered: { subject: string; html: string }
  try {
    rendered = await renderPaymentEmail(
      kind,
      booking.locale,
      emailVarsFromRow(booking, { variant: input.variant, diffMinor: input.diffMinor, payUrl: input.payUrl }),
    )
  } catch {
    console.error('[payment-email] render failed', { bookingId, kind })
    return 'failed'
  }

  // 88-REVIEW A-WR-10: send, then record (lib/payments/notify.ts); the ledger key doubles as the Resend idempotency key.
  return deliverOnce({
    bookingId,
    eventKey,
    kind: 'email_sent',
    label: 'payment-email',
    send: (idempotencyKey) =>
      getResend().emails.send(
        {
          from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
          to: [to],
          replyTo: CUSTOMER_REPLY_TO,
          subject: rendered.subject,
          html: rendered.html,
        },
        { idempotencyKey },
      ),
  })
}
