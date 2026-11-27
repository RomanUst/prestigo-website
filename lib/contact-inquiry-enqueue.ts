import { contactInquiryChatwootKey, dispatchAfterResponse, enqueueOutboxEvent } from '@/lib/outbox'

// Request-path side of the contact-inquiry Chatwoot conversation. Imports no Chatwoot code: it only
// writes an ids-only outbox row and arms the QStash dispatcher, which creates the conversation
// (lib/contact-inquiry-chatwoot.ts). Accepting the inquiry never depends on the VPS.

/** Never throws: the visitor's inquiry is already accepted, a failed enqueue is only logged (id only). */
export async function enqueueContactInquiryChatwoot(inquiryId: string): Promise<void> {
  try {
    const key = contactInquiryChatwootKey(inquiryId)
    const queued = await enqueueOutboxEvent({
      eventType: 'alert.contact_inquiry',
      aggregateType: 'inquiry',
      aggregateId: inquiryId,
      idempotencyKey: key,
    })
    if (queued) dispatchAfterResponse(key)
  } catch {
    console.error('[contact-inquiry-chatwoot] enqueue failed', { inquiryId })
  }
}
