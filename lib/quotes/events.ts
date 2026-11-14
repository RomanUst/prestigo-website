import { createSupabaseServiceClient } from '@/lib/supabase'

/**
 * Phase 92 (QUOTE-05): the quote event ledger. One row per (quote, key) in `quote_events`, so a webhook replay or a
 * re-driven step can never write an event twice. This module is the only writer of quote_events used by the quote
 * code; it carries ids, amounts and codes only - never a name, an email, a phone or an address.
 *
 * Server only. The table is deny-all (migration 091): every read and write goes through the service client, which is
 * created inside each call and never at module load. Errors and logs carry the quote id, the key and a database
 * error code only, never a database message (it can echo a column value).
 */

/** Same values, same order as `quote_events_kind_check` in migration 091 (tests/quote-events.test.ts compares them). */
export const QUOTE_EVENT_KINDS = [
  'created',
  'sent',
  'link_minted',
  'viewed',
  'revised',
  'voided',
  'accepted',
  'deposit_started',
  'deposit_paid',
  'deposit_failed',
  'deposit_canceled',
  'converted',
  'convert_failed',
  'orphan_refunded',
  'dispute_opened',
  'email_sent',
  'email_failed',
  'alert_sent',
  'reminder_scheduled',
  'invoice_requested',
  'invoice_paid',
  'remainder_requested',
  'remainder_started',
  'remainder_paid',
  'remainder_failed',
  'cancelled',
  'deposit_refunded',
  'remainder_refunded',
  'refund_failed',
  'refund_observed',
  'admin_action',
] as const
export type QuoteEventKind = (typeof QUOTE_EVENT_KINDS)[number]

export interface QuoteEventInput {
  /** Exactly-once key, unique per quote (webhook replays and re-driven steps reuse it). 1..200 characters. */
  key: string
  kind: QuoteEventKind
  versionId?: string | null
  stripeObjectId?: string | null
  amountMinor?: number | null
  currency?: 'eur' | 'czk' | null
  actor: { type: 'admin' | 'webhook' | 'system' | 'client'; id?: string | null }
  errorCode?: string | null
}

const ERROR_CODE_MAX = 60
const UNIQUE_VIOLATION = '23505'

/**
 * Appends one event. A repeat of the same (quote, key) is reported as { inserted: false }, never as an error. Any other
 * database error throws Error('quote event write failed').
 */
export async function appendQuoteEvent(quoteId: string, e: QuoteEventInput): Promise<{ inserted: boolean }> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.from('quote_events').insert({
    quote_id: quoteId,
    event_key: e.key,
    kind: e.kind,
    version_id: e.versionId ?? null,
    stripe_object_id: e.stripeObjectId ?? null,
    amount_minor: e.amountMinor ?? null,
    currency: e.currency ?? null,
    actor_type: e.actor.type,
    actor_id: e.actor.id ?? null,
    error_code: e.errorCode == null ? null : e.errorCode.slice(0, ERROR_CODE_MAX),
  })

  if (!error) return { inserted: true }
  if (error.code === UNIQUE_VIOLATION) return { inserted: false }

  console.error('[quote-events] write failed', { quoteId, key: e.key, code: error.code ?? null })
  throw new Error('quote event write failed')
}

/** True when an event with this key exists for the quote. Throws Error('quote event read failed') on a database error. */
export async function hasQuoteEvent(quoteId: string, key: string): Promise<boolean> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('quote_events')
    .select('id')
    .eq('quote_id', quoteId)
    .eq('event_key', key)
    .limit(1)

  if (error) {
    console.error('[quote-events] read failed', { quoteId, key, code: error.code ?? null })
    throw new Error('quote event read failed')
  }
  return Array.isArray(data) && data.length > 0
}
