import type { OutboxRow } from '@/lib/outbox-store'
import { OutboxStoreError } from '@/lib/outbox-store'
import { skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import { loadChatwootOpsConversationId } from '@/lib/chatwoot-client'
import type { DispatchDeps } from '@/lib/lead-sync'
import { createSupabaseServiceClient } from '@/lib/supabase'

/**
 * alert.custom_tour handler (Phase 93, plan 93-30, D-18 / D-19). Runs ONLY inside the QStash-invoked
 * outbox dispatcher: reachable from lib/lead-sync.ts, never from a page render. The custom-tour request
 * route inserts an ids-only outbox row; this handler turns it into a Chatwoot PRIVATE note in the
 * operators' ops conversation. The client is answered by the quote email, never from Chatwoot.
 *
 * The note carries the admin URL with the inquiry id and nothing else: no name, email, phone or
 * message. Logs carry the key, outcome and code only.
 */

export interface CustomTourAlertStore {
  /** false when the inquiry no longer exists (erased). Throws OutboxStoreError('db_error') on a database error. */
  exists(inquiryId: string): Promise<boolean>
}

export interface CustomTourAlertDeps {
  store?: CustomTourAlertStore
  /** Operations conversation; null = not configured; undefined = the configured ops conversation. */
  opsConversationId?: number | null
}

const DEFAULT_SITE_URL = 'https://rideprestigo.com'

function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return (raw ? raw : DEFAULT_SITE_URL).replace(/\/+$/, '')
}

/** English operator text: the admin link for this request only. */
export function buildCustomTourNote(inquiryId: string): string {
  return `New custom-tour request: ${siteUrl()}/admin/custom-tours/${inquiryId}`
}

/** Supabase-backed store. The service client is created inside the call, never at module level. */
export function createCustomTourAlertStore(): CustomTourAlertStore {
  return {
    async exists(inquiryId) {
      try {
        const db = createSupabaseServiceClient()
        const { data, error } = await db.from('inquiries').select('id').eq('id', inquiryId).maybeSingle()
        if (error) throw new Error('read')
        return Boolean(data)
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },
  }
}

export async function deliverCustomTourAlert(
  row: OutboxRow,
  d: DispatchDeps,
  deps: CustomTourAlertDeps = {},
): Promise<DispatchResult> {
  const result = await run(row, d, deps)
  console.log(`[custom-tour-alert] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? '-'}`)
  return result
}

async function run(row: OutboxRow, d: DispatchDeps, deps: CustomTourAlertDeps): Promise<DispatchResult> {
  const client = d.chatwoot
  const store = deps.store ?? createCustomTourAlertStore()

  if (!(await store.exists(row.aggregate_id))) return skip(row, d, 'inquiry_gone')

  const opsId = deps.opsConversationId === undefined ? loadChatwootOpsConversationId() : deps.opsConversationId
  if (opsId === null || !client) return skip(row, d, 'no_conversation')

  await client.post(`/conversations/${opsId}/messages`, {
    content: buildCustomTourNote(row.aggregate_id),
    message_type: 'outgoing',
    private: true,
  })

  await d.store.complete(row.idempotency_key, 'sent', null)
  return { outcome: 'sent' }
}

// The enqueue side lives in its own module (no Chatwoot import) so the request route can import it
// without tripping the VPS-isolation guard; re-exported here for the plan's artifact contract.
export { enqueueCustomTourAlert } from '@/lib/custom-tour-enqueue'
