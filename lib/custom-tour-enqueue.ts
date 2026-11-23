import { customTourAlertKey, dispatchAfterResponse, enqueueOutboxEvent } from '@/lib/outbox'

// Request-path side of the custom-tour alert (Phase 93, plan 93-30, D-18). Imports no Chatwoot code:
// it only writes an ids-only outbox row and arms the QStash dispatcher, which delivers the note
// (lib/custom-tour-alert.ts). Accepting the request never depends on the VPS.

/**
 * Queue the alert for a stored custom-tour inquiry and arm the dispatcher after the response.
 * Never throws: the visitor's request is already accepted, a failed enqueue is only logged (id only).
 */
export async function enqueueCustomTourAlert(inquiryId: string): Promise<void> {
  try {
    const key = customTourAlertKey(inquiryId)
    const queued = await enqueueOutboxEvent({
      eventType: 'alert.custom_tour',
      aggregateType: 'inquiry',
      aggregateId: inquiryId,
      idempotencyKey: key,
    })
    if (queued) dispatchAfterResponse(key)
  } catch {
    console.error('[custom-tour-alert] enqueue failed', { inquiryId })
  }
}
