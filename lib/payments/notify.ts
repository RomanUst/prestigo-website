// Exactly-once delivery of the card-on-file notifications: client emails and operator alerts (Phase 88,
// 88-REVIEW A-WR-10).
//
// Send, THEN record. The ledger row `<key>` means "delivered"; it is written only after Resend accepted the message.
// A transient Resend failure therefore never loses a message for good: the send is retried in the same call, and a
// later caller with the same key (a webhook redelivery, the next tick, the failure-notice backstop of tick step F)
// sends it again. Two callers racing on the same key can not send twice: every attempt carries the ledger key as the
// Resend idempotency key, so Resend delivers one message per key (within its 24 h window, which covers every
// re-driver). A final failure appends `<key>:send_failed` once, so the failure stays visible in the ledger.

import { appendPaymentEvent, paymentEventRecorded, type LedgerEvent } from '@/lib/payments/state'

/** Pauses between the tries of one send (three tries in total). No pause under the test runner. */
const RETRY_DELAYS_MS = [250, 1000]

const pause = (ms: number) =>
  process.env.VITEST ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms))

const SYSTEM_ACTOR = { type: 'system', id: null } as const

export type DeliveryResult = 'sent' | 'duplicate' | 'failed'

/**
 * Deliver one notification exactly once per (booking, eventKey). `send` performs ONE Resend call with the given
 * idempotency key and throws (or returns an error) when Resend did not accept the message. Never throws.
 */
export async function deliverOnce(input: {
  bookingId: string
  eventKey: string
  kind: 'email_sent' | 'alert_sent'
  /** Extra columns of the "delivered" ledger row (amount, currency, a code). */
  record?: Pick<LedgerEvent, 'amountMinor' | 'currency' | 'errorCode'>
  send: (idempotencyKey: string) => Promise<{ error?: unknown } | void>
  /** Log label, ids only. */
  label: string
}): Promise<DeliveryResult> {
  const { bookingId, eventKey, kind, label } = input

  try {
    if (await paymentEventRecorded(bookingId, eventKey)) return 'duplicate'
  } catch {
    // Without the ledger we can not tell whether it went out already; Resend's idempotency still prevents a double send.
    console.error(`[${label}] delivery lookup failed`, { bookingId })
  }

  let delivered = false
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length && !delivered; attempt += 1) {
    if (attempt > 0) await pause(RETRY_DELAYS_MS[attempt - 1])
    try {
      const result = await input.send(eventKey)
      if (result && result.error) throw new Error('resend rejected the message')
      delivered = true
    } catch {
      // Ids only: the recipient and the message text never reach the log.
      console.error(`[${label}] send failed`, { bookingId, attempt: attempt + 1 })
    }
  }

  if (!delivered) {
    try {
      await appendPaymentEvent(bookingId, {
        key: `${eventKey}:send_failed`,
        kind,
        errorCode: 'send_failed',
        actor: SYSTEM_ACTOR,
      })
    } catch {
      console.error(`[${label}] send_failed row not written`, { bookingId })
    }
    return 'failed'
  }

  try {
    const recorded = await appendPaymentEvent(bookingId, { key: eventKey, kind, actor: SYSTEM_ACTOR, ...(input.record ?? {}) })
    return recorded.inserted ? 'sent' : 'duplicate'
  } catch {
    // Delivered but not recorded: a later caller re-sends with the same idempotency key and Resend drops the copy.
    console.error(`[${label}] delivered row not written`, { bookingId })
    return 'sent'
  }
}
