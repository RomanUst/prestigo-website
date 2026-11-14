// Operator alerts of the quote flow (Phase 92, plan 92-18; QUOTE-05, D-18, T-92-61).
//
// One plain-text English email through Resend to MANAGER_EMAIL when money or a booking of a quote needs a person: a
// deposit that arrived without bookings, an automatic refund, a refund that failed, a dispute. sendPaymentOperatorAlert
// (lib/payments/alerts.ts) needs a booking, and a quote payment can exist before any booking does, so quote alerts have
// their own small sender that dedups through the quote event ledger.
//
// Exactly once per event key, send THEN record (the contract of lib/payments/notify.ts): an alert_sent quote event under
// the key means "delivered". A failed send keeps no delivered row and appends one `<key>:send_failed` row, so a later
// caller (a webhook redelivery, the tick) sends it again; every try carries the key as the Resend idempotency key, so
// two callers racing on one key deliver one message.
//
// The mail carries the quote reference, the admin link, the amount and a short code. Never a client name, email, phone
// or address: the owner opens the quote in admin for those.
//
// Server only. Lazy Resend client like lib/email.ts (RESEND_API_KEY is not present in every environment).

import { Resend } from 'resend'
import { formatMinor } from '@/lib/payments/money'
import { appendQuoteEvent, hasQuoteEvent } from '@/lib/quotes/events'

export const QUOTE_ALERT_KINDS = [
  'quote_paid',
  'quote_orphan_refunded',
  'quote_convert_failed',
  'quote_refund_failed',
  'quote_remainder_mismatch',
  'quote_dispute',
  'quote_payment_failed',
] as const
export type QuoteAlertKind = (typeof QUOTE_ALERT_KINDS)[number]

export interface QuoteAlertDetails {
  /** The quote event key, unique per quote: `alert:<kind>:<stripe object id or step>`. 1..180 characters. */
  eventKey: string
  /** A Stripe decline / dispute / error code or one of our reason codes (at most 60 characters). Never a message. */
  code?: string
  /** The amount the alert is about, in minor units of `currency`. */
  amountMinor?: number
  currency?: 'eur' | 'czk'
}

const TITLES: Record<QuoteAlertKind, string> = {
  quote_paid: 'Quote deposit paid',
  quote_orphan_refunded: 'Quote payment refunded automatically',
  quote_convert_failed: 'Quote paid but no bookings were created',
  quote_refund_failed: 'Quote refund failed',
  quote_remainder_mismatch: 'Quote remainder does not match',
  quote_dispute: 'Quote payment disputed',
  quote_payment_failed: 'Quote payment failed',
}

const NEXT_ACTION: Record<QuoteAlertKind, string> = {
  quote_paid: 'The deposit is paid and the bookings were created. Nothing to do.',
  quote_orphan_refunded:
    'A client paid a deposit that this quote does not own (it was voided, cancelled, replaced by a newer version or paid with another payment). The whole payment was refunded automatically. Check that the client knows and, if they still want the trip, send a new quote.',
  quote_convert_failed:
    'The client paid the deposit but the bookings could not be created. Stripe will deliver the payment again and the site retries on its own; if this alert is still the latest news after a few minutes, open the quote, check the payment in the Stripe Dashboard and create the bookings by hand. Do not refund before you have looked.',
  quote_refund_failed:
    'A refund of a quote payment failed. The site retries when Stripe delivers the payment again. If the money is still not back after a few minutes, refund the payment in the Stripe Dashboard and tell the client.',
  quote_remainder_mismatch:
    'The amount collected for the remainder does not match what the quote expects. Open the quote and check the payment in the Stripe Dashboard.',
  quote_dispute: 'The client disputed a quote payment with the bank. Open the quote, then answer the dispute in the Stripe Dashboard before its deadline.',
  quote_payment_failed: 'A payment on this quote failed. Open the quote; the client may need a new link or another card.',
}

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY environment variable is not configured')
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

/** Pauses between the tries of one send (three tries in total). No pause under the test runner. */
const RETRY_DELAYS_MS = [250, 1000]
const pause = (ms: number) => (process.env.VITEST ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms)))

const siteBase = (): string => (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com').trim().replace(/\/+$/, '')
const SYSTEM_ACTOR = { type: 'system', id: null } as const

function buildBody(kind: QuoteAlertKind, quote: { id: string; reference: string }, d: QuoteAlertDetails): string {
  const amount =
    typeof d.amountMinor === 'number' && Number.isFinite(d.amountMinor) ? formatMinor(d.amountMinor, d.currency ?? 'eur') : 'n/a'
  return [
    `Quote reference: ${quote.reference}`,
    `Alert: ${kind}`,
    `Amount: ${amount}`,
    `Reason code: ${d.code ? d.code.slice(0, 60) : 'n/a'}`,
    `Open in admin: ${siteBase()}/admin/quotes/${quote.id}`,
    '',
    NEXT_ACTION[kind],
  ].join('\n')
}

/**
 * Send one quote alert. Never throws: the result says what happened.
 *   'sent'       Resend accepted the message and it is recorded under the event key
 *   'duplicate'  the event key was already delivered (nothing sent)
 *   'failed'     MANAGER_EMAIL missing, or Resend rejected the message on every try (a later caller retries)
 */
export async function sendQuoteOperatorAlert(
  kind: QuoteAlertKind,
  quote: { id: string; reference: string },
  details: QuoteAlertDetails,
): Promise<'sent' | 'duplicate' | 'failed'> {
  const manager = process.env.MANAGER_EMAIL
  if (!manager) {
    console.error('[quote-alert] MANAGER_EMAIL is not set, alert not sent', { quoteId: quote.id, kind })
    return 'failed'
  }

  try {
    if (await hasQuoteEvent(quote.id, details.eventKey)) return 'duplicate'
  } catch {
    // Without the ledger we can not tell whether it went out already; Resend's idempotency still prevents a double send.
    console.error('[quote-alert] delivery lookup failed', { quoteId: quote.id, kind })
  }

  let delivered = false
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length && !delivered; attempt += 1) {
    if (attempt > 0) await pause(RETRY_DELAYS_MS[attempt - 1])
    try {
      const result = await getResend().emails.send(
        {
          from: 'PRESTIGO System <bookings@rideprestigo.com>',
          to: [manager],
          replyTo: manager,
          subject: `[Quote] ${TITLES[kind]} — ${quote.reference}`,
          text: buildBody(kind, quote, details),
        },
        { idempotencyKey: details.eventKey },
      )
      if (result && result.error) throw new Error('resend rejected the message')
      delivered = true
    } catch {
      // Ids only: the recipient and the message text never reach the log.
      console.error('[quote-alert] send failed', { quoteId: quote.id, kind, attempt: attempt + 1 })
    }
  }

  if (!delivered) {
    try {
      await appendQuoteEvent(quote.id, {
        key: `${details.eventKey}:send_failed`,
        kind: 'alert_sent',
        errorCode: 'send_failed',
        actor: SYSTEM_ACTOR,
      })
    } catch {
      console.error('[quote-alert] send_failed row not written', { quoteId: quote.id, kind })
    }
    return 'failed'
  }

  try {
    const recorded = await appendQuoteEvent(quote.id, {
      key: details.eventKey,
      kind: 'alert_sent',
      amountMinor: details.amountMinor ?? null,
      currency: details.currency ?? null,
      errorCode: details.code ?? null,
      actor: SYSTEM_ACTOR,
    })
    return recorded.inserted ? 'sent' : 'duplicate'
  } catch {
    // Delivered but not recorded: a later caller re-sends with the same idempotency key and Resend drops the copy.
    console.error('[quote-alert] delivered row not written', { quoteId: quote.id, kind })
    return 'sent'
  }
}
