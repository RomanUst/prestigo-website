import { createSupabaseServiceClient } from '@/lib/supabase'
import { OutboxStoreError } from '@/lib/outbox-store'

// Supabase access for the admin Outbox page (Phase 82, SYNC-05). Every call goes through the
// SECURITY DEFINER RPCs of migration 070. Rows are ids, references and codes only — no name,
// email or phone is ever selected. Deliberately has no CRM or Chatwoot import (not allowlisted by
// the VPS isolation guard).

export type OutboxOpenStatus = 'pending' | 'processing' | 'failed'

export interface OutboxHealth {
  pending: number
  processing: number
  failed: number
  stuck: number
  open_total: number
  /** Age in seconds of the oldest pending row; null when nothing is pending. */
  oldest_pending_seconds: number | null
  sent_last_24h: number
  by_type: Array<{ event_type: string; status: string; count: number }>
}

export interface OpenOutboxEvent {
  idempotency_key: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  status: OutboxOpenStatus
  stuck: boolean
  attempts: number
  last_error: string | null
  available_at: string
  updated_at: string
  booking_reference: string | null
}

async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createSupabaseServiceClient().rpc(fn, args)
    if (error) throw new Error('rpc')
    return data
  } catch {
    throw new OutboxStoreError('db_error')
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Counts for the KPI row and the health banner. */
export async function outboxHealth(): Promise<OutboxHealth> {
  const data = await rpc('outbox_health')
  const h = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const byType = Array.isArray(h.by_type) ? h.by_type : []
  return {
    pending: num(h.pending),
    processing: num(h.processing),
    failed: num(h.failed),
    stuck: num(h.stuck),
    open_total: num(h.open_total),
    oldest_pending_seconds:
      typeof h.oldest_pending_seconds === 'number' && Number.isFinite(h.oldest_pending_seconds)
        ? h.oldest_pending_seconds
        : null,
    sent_last_24h: num(h.sent_last_24h),
    by_type: byType
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({
        event_type: String(r.event_type ?? ''),
        status: String(r.status ?? ''),
        count: num(r.count),
      })),
  }
}

/** The latest open events (max 100), optionally one status only. */
export async function openOutboxEvents(status: OutboxOpenStatus | null, limit: number): Promise<OpenOutboxEvent[]> {
  const data = await rpc('outbox_open_events', { p_status: status, p_limit: limit })
  return Array.isArray(data) ? (data as OpenOutboxEvent[]) : []
}

/** Put one failed (or pending) event back on the queue. False when the row is not retryable. */
export async function retryOutboxEvent(key: string): Promise<boolean> {
  return (await rpc('outbox_retry', { p_key: key })) === true
}

/** Put every failed event back on the queue (max `limit`, cap 500). Returns the keys to publish. */
export async function retryFailedOutbox(limit: number): Promise<string[]> {
  const data = await rpc('outbox_retry_failed', { p_limit: limit })
  return Array.isArray(data) ? data.filter((k): k is string => typeof k === 'string') : []
}
