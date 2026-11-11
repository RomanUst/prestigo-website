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
import { renderPaymentEmail, type PaymentEmailKind, type PaymentEmailVars, type PolicyBoxVars } from '@/lib/payments/emails/render'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { buildBookUrl, buildManageUrl, ensureManageToken } from '@/lib/manage-link'
import { evaluateCancellation, policyFromSnapshot, proposedFeeMinor, tripFactsFromRow } from '@/lib/cancellation-policy'
import { getNoShowThresholds, isAirportPickup } from '@/lib/no-show-wait'
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

/** The stored-terms gate (D-18): a booking made before the policy was public has no stored version. */
export function hasStoredPolicy(booking: BookingRow): boolean {
  return typeof booking.cancel_policy_version === 'string' && booking.cancel_policy_version.length > 0
}

/**
 * Terms for the cancellation box, from the policy the booking was made under (never today's settings). Null when the
 * booking stored none or any input is unusable; a failure drops the box, never the email.
 */
export async function policyBoxFromRow(booking: BookingRow, amountMinor: number): Promise<PolicyBoxVars | null> {
  if (!hasStoredPolicy(booking) || amountMinor <= 0) return null
  try {
    const policy = policyFromSnapshot(booking.cancel_policy)
    const facts = tripFactsFromRow({
      trip_type: str(booking.trip_type),
      distance_km: num(booking.distance_km) ?? null,
      pickup_utc: str(booking.pickup_utc) || null,
      pickup_date: str(booking.pickup_date),
      pickup_time: str(booking.pickup_time),
    })
    if (!facts) return null
    // Judged at send time, like the checkout (card-checkout/init: freeUntilPassed = outcome is not 'free'): a booking made
    // after its own deadline, and a reminder sent after it, must not promise free cancellation until a moment that is past.
    const outcome = evaluateCancellation(policy, facts, Date.now())
    const thresholds = await getNoShowThresholds(createSupabaseServiceClient())
    const airport = isAirportPickup({
      origin_lat: num(booking.origin_lat) ?? null,
      origin_lng: num(booking.origin_lng) ?? null,
      origin_address: str(booking.origin_address) || null,
    })
    return {
      freeUntilMs: outcome.freeUntilMs,
      freeUntilPassed: outcome.kind !== 'free',
      percent: policy.feePercent,
      feeAmountMinor: proposedFeeMinor(amountMinor, policy.feePercent),
      waitMin: airport ? thresholds.airportMin : thresholds.cityMin,
    }
  } catch {
    console.error('[payment-email] policy box dropped', { bookingId: str(booking.id) })
    return null
  }
}

/** The localized Manage booking URL, only for a booking that stored a policy; a failure drops the button. */
export async function manageUrlFromRow(booking: BookingRow): Promise<string | undefined> {
  if (!hasStoredPolicy(booking)) return undefined
  try {
    const token = await ensureManageToken(str(booking.id))
    if (!token) return undefined
    const url = buildManageUrl(token, booking.locale)
    // The renderer only accepts https; a misconfigured site URL must not cost the client the whole email.
    return new URL(url).protocol === 'https:' ? url : undefined
  } catch {
    console.error('[payment-email] manage link dropped', { bookingId: str(booking.id) })
    return undefined
  }
}

/** The localized "Book another ride" URL; a failure drops the button, never the email. */
function bookAgainUrlFromRow(booking: BookingRow): string | undefined {
  try {
    const url = buildBookUrl(booking.locale)
    return new URL(url).protocol === 'https:' ? url : undefined
  } catch {
    console.error('[payment-email] book link dropped', { bookingId: str(booking.id) })
    return undefined
  }
}

/**
 * What an engine plan may hand the sender besides the kind: the variant and the facts of the Phase 89 mails
 * (UI-SPEC 8.2). There is deliberately no reason or note field (T-89-13): operator text never reaches a client.
 */
export interface PaymentEmailExtra {
  kind?: PaymentEmailKind
  variant?: PaymentEmailVars['variant']
  diffMinor?: number
  payUrl?: string
  /** Fee or charge the mail is about (minor units): cancelled late proposal, fee_charged amount, payment_failed fee. */
  feeMinor?: number
  /** Amount refunded when moneyOutcome is 'refunded'. */
  refundMinor?: number
  /** cancelled and fee_waived: hold released, payment refunded, or nothing taken. */
  moneyOutcome?: PaymentEmailVars['moneyOutcome']
  /** payment_failed fee: cancellation fee, no-show fee or the trip itself. */
  feeLabel?: PaymentEmailVars['feeLabel']
  /** End of the free period (epoch ms or ISO); taken from the booking's stored policy when absent. */
  freeUntil?: number | string
  /** Minutes the driver waited; taken from the no-show thresholds of the stored policy when absent. */
  waitMin?: number
  /** extra_charged waiting: minutes of waiting beyond the booked time. */
  extraMinutes?: number
  /**
   * extra_charged other: the client-facing item line the operator wrote for the receipt (for example "Airport parking").
   * It is not a reason or a note; it is HTML-escaped by the renderer and never put in the subject, the ledger or a log.
   */
  extraItem?: string
}

export async function emailVarsFromRow(booking: BookingRow, extra: PaymentEmailExtra): Promise<PaymentEmailVars> {
  const holdAtMs = typeof booking.hold_at === 'string' ? Date.parse(booking.hold_at) : NaN
  const currency = booking.payment_currency === 'czk' ? 'czk' : 'eur'
  let calendarUrl: string | undefined
  try {
    calendarUrl = buildGoogleCalendarUrl(bookingEmailDataFromRow(booking))
  } catch {
    calendarUrl = undefined
  }
  const amountMinor = num(booking.payment_amount_minor) ?? 0
  // Only the confirmation family carries the box and the button; no token is minted for a charged or failed mail.
  const confirmation = extra.kind === undefined || extra.kind === 'card_saved' || extra.kind === 'hold_placed'
  const [policy, manageUrl] = confirmation
    ? await Promise.all([policyBoxFromRow(booking, amountMinor), manageUrlFromRow(booking)])
    : [null, undefined]

  // Phase 89 kinds: the engine names the kind and the amounts; the free period, the wait and the proposed fee come
  // from the policy the booking was made under (never today's settings) unless the caller passes them.
  const lateCancel = extra.kind === 'cancelled' && extra.variant === 'late'
  const termsKind = extra.kind === 'cancelled' || extra.kind === 'fee_charged'
  let terms: PolicyBoxVars | null = policy
  if (
    !terms &&
    termsKind &&
    (extra.freeUntil === undefined || extra.waitMin === undefined || (lateCancel && extra.feeMinor === undefined))
  ) {
    terms = await policyBoxFromRow(booking, amountMinor)
  }
  const freeUntil = extra.freeUntil ?? terms?.freeUntilMs
  const waitMin = extra.waitMin ?? terms?.waitMin
  const feeMinor = extra.feeMinor ?? (lateCancel ? terms?.feeAmountMinor : undefined)
  const bookAgainUrl =
    extra.kind === 'cancelled' || extra.kind === 'fee_waived' ? bookAgainUrlFromRow(booking) : undefined
  return {
    reference: str(booking.booking_reference),
    amountMinor,
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
    ...(manageUrl ? { manageUrl } : {}),
    ...(policy ? { policy } : {}),
    ...(feeMinor !== undefined ? { feeMinor } : {}),
    ...(extra.refundMinor !== undefined ? { refundMinor: extra.refundMinor } : {}),
    ...(extra.moneyOutcome ? { moneyOutcome: extra.moneyOutcome } : {}),
    ...(extra.feeLabel ? { feeLabel: extra.feeLabel } : {}),
    ...(freeUntil !== undefined ? { freeUntil } : {}),
    ...(waitMin !== undefined ? { waitMin } : {}),
    ...(extra.extraMinutes !== undefined ? { extraMinutes: extra.extraMinutes } : {}),
    ...(extra.extraItem !== undefined ? { extraItem: extra.extraItem } : {}),
    ...(bookAgainUrl ? { bookAgainUrl } : {}),
  }
}

export async function sendPaymentEmail(
  input: PaymentEmailExtra & {
    kind: PaymentEmailKind
    booking: BookingRow
    /** The ledger key, `email:<kind>:<bookingId>[:<attempt>]`; recorded once the message is delivered. */
    eventKey: string
  },
): Promise<'sent' | 'duplicate' | 'failed'> {
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
      await emailVarsFromRow(booking, {
        kind,
        variant: input.variant,
        diffMinor: input.diffMinor,
        payUrl: input.payUrl,
        feeMinor: input.feeMinor,
        refundMinor: input.refundMinor,
        moneyOutcome: input.moneyOutcome,
        feeLabel: input.feeLabel,
        freeUntil: input.freeUntil,
        waitMin: input.waitMin,
        extraMinutes: input.extraMinutes,
        extraItem: input.extraItem,
      }),
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
