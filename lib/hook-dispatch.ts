import type { OutboxRow } from '@/lib/outbox-store'
import { breaker, type DispatchResult } from '@/lib/dispatch-outcomes'
import type { DispatchDeps } from '@/lib/lead-sync'
import { deliverChatIntake } from '@/lib/chat-intake'

/**
 * hook.* router of the outbox dispatcher (Phase 83, D-15). Runs only when QStash calls
 * /api/integrations/dispatch with a signed message; reached from lib/lead-sync.ts handleClaimed.
 *
 * Every hook handler talks to BOTH systems (the Chatwoot payload is only a hint, the CRM is where the
 * result lands), so the two configuration gates sit here, in front of the switch: Chatwoot first
 * (`chatwoot_unconfigured`), then EspoCRM (`crm_unconfigured`). A missing configuration makes zero
 * requests and waits the long breaker interval; it is never retried quickly.
 *
 * Runtime imports never include lib/lead-sync (the DispatchDeps import is type-only), so the inbound
 * webhook import closure stays free of the Phase 81 lead writers (tests/webhook-isolation-guard).
 * Handler plans add their `case` here: 83-08 chat_resolve / chat_label, 83-10 chat_contact,
 * 83-11 espo_contact. Until then those types complete `failed` with `unsupported_event`.
 */
export async function deliverHook(row: OutboxRow, d: DispatchDeps): Promise<DispatchResult> {
  if (!d.chatwootConfig || !d.chatwoot) return breaker(row, 'chatwoot_unconfigured', d)
  if (!d.crm || !d.config) return breaker(row, 'crm_unconfigured', d)

  const clients = { cw: d.chatwoot, cwConfig: d.chatwootConfig, crm: d.crm, config: d.config }

  switch (row.event_type) {
    case 'hook.chat_intake':
      return deliverChatIntake(row, d, clients)
    default:
      await d.store.complete(row.idempotency_key, 'failed', 'unsupported_event')
      return { outcome: 'failed', code: 'unsupported_event' }
  }
}
