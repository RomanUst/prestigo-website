// Operator alerts of the card-on-file flow (Phase 88, plan 88-14; HOLD-05, D-14, D-15).
//
// One plain-text English email through Resend to MANAGER_EMAIL, so the owner is warned without any dependency on
// the VPS or a chat tool (D-14). Exactly once per event key: the payment ledger row (kind alert_sent) is claimed
// BEFORE the send, so a replayed webhook, a re-driven sweep or a second tick that reaches the same key sends
// nothing. A failed send keeps its claim and appends one `<key>:send_failed` row, the same contract as the client
// emails (lib/payments/emails/send.ts); the failure is visible in the ledger and in the log (ids only).
//
// No card data and no client contact details beyond the name: the owner needs the name and the pickup to act.
// Server-only by use. Lazy Resend client like lib/email.ts (RESEND_API_KEY is not present in every environment).

import { Resend } from 'resend'
import { deliverOnce } from '@/lib/payments/notify'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'

export const OPERATOR_ALERT_KINDS = [
  'hold_failed',
  'charge_failed',
  'balance_unpaid',
  'hold_expiring',
  'no_valid_hold_24h',
  'refund_failed',
  'dispute',
  'duplicate_payment',
  'stripe_config',
] as const
export type OperatorAlertKind = (typeof OPERATOR_ALERT_KINDS)[number]

export interface OperatorAlertDetails {
  /** The ledger key, unique per booking: `alert:<kind>:<bookingId>[:<attempt>]`. */
  eventKey: string
  /** Stripe decline code / dispute reason (ledger error_code, at most 60 characters). Never a message. */
  code?: string
  /** Amount the alert is about (minor units of the booking currency); defaults to the booking amount. */
  amountMinor?: number
  /** When the one automatic retry runs; null / absent = no retry is left. */
  retryAtIso?: string | null
  /** The declined price difference (balance_unpaid). */
  diffMinor?: number
  /**
   * `link_failed`: the recovery link could not be created, so the client was not emailed. `release`: a hold (not a
   * payment) could not be released. `refunded` / `refund_failed`: the outcome of a duplicate payment's automatic refund.
   */
  note?: string
}

type BookingRow = Record<string, unknown>

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY environment variable is not configured')
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const TITLES: Record<OperatorAlertKind, string> = {
  hold_failed: 'Hold failed',
  charge_failed: 'Charge failed',
  balance_unpaid: 'Balance unpaid',
  hold_expiring: 'Hold expires soon',
  no_valid_hold_24h: 'No valid hold, pickup within 24 h',
  refund_failed: 'Refund failed',
  dispute: 'Dispute opened',
  duplicate_payment: 'Duplicate payment',
  stripe_config: 'Stripe key problem',
}

/** A Prague wall-clock rendering of an instant, e.g. "12 Dec 2026, 14:00". */
function pragueTime(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms))
}

function currencyOf(booking: BookingRow): PaymentCurrency {
  return booking.payment_currency === 'czk' ? 'czk' : 'eur'
}

function nextAction(kind: OperatorAlertKind, booking: BookingRow, d: OperatorAlertDetails): string {
  const currency = currencyOf(booking)
  const retryLine = d.retryAtIso
    ? `One automatic retry runs at ${pragueTime(d.retryAtIso)}.`
    : 'No automatic retries are left. Use Retry or Send payment link.'

  if ((kind === 'hold_failed' || kind === 'charge_failed' || kind === 'balance_unpaid') && d.note === 'link_failed') {
    return 'The payment link could not be created, so the client was NOT emailed. Use Send payment link from the booking.'
  }
  switch (kind) {
    case 'hold_failed':
      return `The client was emailed a payment link. ${retryLine}`
    case 'charge_failed':
      return d.retryAtIso
        ? `The client was emailed a payment link. Retry or send the link again from the booking. ${retryLine}`
        : 'The client was emailed a payment link. Retry or send the link again from the booking.'
    case 'balance_unpaid': {
      const diff = typeof d.diffMinor === 'number' ? formatMinor(d.diffMinor, currency) : 'balance'
      return `The trip amount was captured. The extra ${diff} was declined and the client was emailed a link.`
    }
    case 'hold_expiring':
      return 'Complete the trip or place a new hold.'
    case 'no_valid_hold_24h':
      return 'Contact the client or place a hold from the booking.'
    case 'refund_failed': {
      const amount = formatMinor(d.amountMinor ?? 0, currency)
      // Plan 88-16: a card booking's hold could not be released after the cancel applied.
      if (d.note === 'release') {
        return `The booking is cancelled. Cancel the ${amount} hold manually in the Stripe Dashboard so the card is not blocked.`
      }
      return `The booking is cancelled. Refund ${amount} manually in the Stripe Dashboard.`
    }
    case 'dispute':
      return 'A dispute was opened on the card payment. Review it in the Stripe Dashboard and respond before the deadline.'
    case 'duplicate_payment': {
      // 88-REVIEW T1: a recovery link was paid after the money was already secured another way.
      const amount = formatMinor(d.amountMinor ?? 0, currency)
      const lead = `The client paid ${amount} through a payment link although the booking no longer owed it (state: ${str(booking.payment_state) || 'n/a'}).`
      return d.note === 'refunded'
        ? `${lead} The link payment was refunded automatically; the booking is unchanged.`
        : `${lead} The automatic refund failed: refund ${amount} manually in the Stripe Dashboard.`
    }
    case 'stripe_config':
      // 88-REVIEW A-WR-02: Stripe refused our key, not the client's card. Nothing was charged and the client was not emailed.
      return 'Stripe refused the API key (revoked, expired or missing a permission). The client was NOT emailed and no attempt was used; the engine retries on every run. Check STRIPE_SECRET_KEY in Vercel.'
  }
}

function buildBody(kind: OperatorAlertKind, booking: BookingRow, d: OperatorAlertDetails): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com').trim()
  const name = [str(booking.client_first_name), str(booking.client_last_name)].filter(Boolean).join(' ') || 'n/a'
  const pickup = [str(booking.pickup_date), str(booking.pickup_time)].filter(Boolean).join(' ') || 'n/a'
  const amountMinor =
    d.amountMinor ?? (typeof booking.payment_amount_minor === 'number' ? booking.payment_amount_minor : undefined)
  const amount = typeof amountMinor === 'number' ? formatMinor(amountMinor, currencyOf(booking)) : 'n/a'

  return [
    `Booking reference: ${str(booking.booking_reference) || 'n/a'}`,
    `Client name: ${name}`,
    `Pickup (Prague): ${pickup}`,
    `Amount: ${amount}`,
    `State: ${str(booking.payment_state) || 'n/a'}`,
    `Reason code: ${d.code ? d.code.slice(0, 60) : 'n/a'}`,
    `Open in admin: ${base}/admin/bookings`,
    '',
    nextAction(kind, booking, d),
  ].join('\n')
}

/**
 * Send one operator alert. Never throws: the result says what happened.
 *   'sent'       Resend accepted the message and it is recorded under the event key
 *   'duplicate'  the event key was already delivered (nothing sent)
 *   'failed'     MANAGER_EMAIL missing, or Resend rejected the message on every try (a later caller retries)
 */
export async function sendPaymentOperatorAlert(
  kind: OperatorAlertKind,
  booking: BookingRow,
  details: OperatorAlertDetails,
): Promise<'sent' | 'duplicate' | 'failed'> {
  const bookingId = str(booking.id)
  if (!bookingId) {
    console.error('[payment-alert] no booking id', { kind })
    return 'failed'
  }

  const manager = process.env.MANAGER_EMAIL
  if (!manager) {
    console.error('[payment-alert] MANAGER_EMAIL is not set, alert not sent', { bookingId, kind })
    return 'failed'
  }

  const amountMinor =
    details.amountMinor ?? (typeof booking.payment_amount_minor === 'number' ? booking.payment_amount_minor : undefined)
  // 88-REVIEW A-WR-10: send, then record (lib/payments/notify.ts); the ledger key doubles as the Resend idempotency key.
  return deliverOnce({
    bookingId,
    eventKey: details.eventKey,
    kind: 'alert_sent',
    label: 'payment-alert',
    record: {
      amountMinor: typeof amountMinor === 'number' && Number.isFinite(amountMinor) ? amountMinor : undefined,
      currency: currencyOf(booking),
      errorCode: details.code ? details.code.slice(0, 60) : undefined,
    },
    send: (idempotencyKey) =>
      getResend().emails.send(
        {
          from: 'PRESTIGO System <bookings@rideprestigo.com>',
          to: [manager],
          replyTo: manager,
          subject: `[Payment] ${TITLES[kind]} — ${str(booking.booking_reference) || bookingId}`,
          text: buildBody(kind, booking, details),
        },
        { idempotencyKey },
      ),
  })
}
