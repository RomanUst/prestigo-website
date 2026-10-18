import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import type { BookingRow, InquiryRow, ReturnLegInfo } from '@/lib/lead-mapping'

// Supabase access for the outbox domain (Phase 81). Reads of integration_outbox
// use select; every write goes through the SECURITY DEFINER RPCs of migration
// 064. Deliberately has no CRM import (not allowlisted by the VPS isolation guard).

export interface OutboxRow {
  idempotency_key: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  status: string
  attempts: number
  available_at: string
  lease_until: string | null
  last_error: string | null
}

/** A bookings row as the dispatcher reads it (ids and mapper inputs only). */
export type BookingRecord = BookingRow & { payment_intent_id: string | null; attempt_id: string | null }

export class OutboxStoreError extends Error {
  code: string
  constructor(code = 'db_error') {
    super(`outbox store: ${code}`)
    this.name = 'OutboxStoreError'
    this.code = code
  }
}

export interface OutboxStore {
  claim(key: string, leaseSeconds: number): Promise<OutboxRow | null>
  getByKey(key: string): Promise<OutboxRow | null>
  complete(key: string, status: 'sent' | 'skipped' | 'failed', code: string | null): Promise<boolean>
  reschedule(key: string, availableAt: Date, code: string): Promise<boolean>
  readInquiry(id: string): Promise<InquiryRow | null>
  readBooking(id: string): Promise<BookingRecord | null>
  /** The return leg of a round trip (shared payment intent, else shared attempt), or null. */
  readReturnLeg(outbound: BookingRecord): Promise<ReturnLegInfo>
  /** integration_config `lead_capture_start`; null when absent or unparsable (capture off). */
  readCaptureStart(): Promise<Date | null>
}

const OUTBOX_COLUMNS =
  'idempotency_key,event_type,aggregate_type,aggregate_id,status,attempts,available_at,lease_until,last_error'
const INQUIRY_COLUMNS = 'id,kind,email,name,phone,company,payload,created_at'
const BOOKING_COLUMNS =
  'id,booking_reference,status,booking_source,lead_channel,leg,trip_type,payment_intent_id,attempt_id,' +
  'payment_link_id,pickup_utc,pickup_date,pickup_time,origin_address,destination_address,vehicle_class,' +
  'passengers,hours,amount_eur,outbound_amount_czk,return_amount_czk,client_first_name,client_last_name,client_email,client_phone,created_at'

// ── Daily sweep RPCs (migration 068) ────────────────────────────────────────
// Plain functions, not OutboxStore members: only the sweep route calls them, and the
// dispatcher's store double does not need to grow. Each throws OutboxStoreError('db_error').

async function sweepRpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createSupabaseServiceClient().rpc(fn, args)
    if (error) throw new Error('rpc')
    return data
  } catch {
    throw new OutboxStoreError('db_error')
  }
}

function toCount(data: unknown): number {
  return typeof data === 'number' && Number.isFinite(data) ? data : 0
}

/** D-03: enqueue `lead.booking:<id>:dead` for unpaid bookings past pickup. Returns rows inserted. */
export async function enqueueExpiredUnpaid(): Promise<number> {
  return toCount(await sweepRpc('outbox_enqueue_expired_unpaid'))
}

/** D-15 / D-20: enqueue `lead.purge:<id>` for abandoned online checkouts > 90 days past pickup. */
export async function enqueueAbandonedPurge(): Promise<number> {
  return toCount(await sweepRpc('outbox_enqueue_abandoned_purge'))
}

/** Keys of pending-and-due rows and of processing rows whose lease expired (max 500). */
export async function dueKeys(limit: number): Promise<string[]> {
  const data = await sweepRpc('outbox_due_keys', { p_limit: limit })
  return Array.isArray(data) ? data.filter((k): k is string => typeof k === 'string') : []
}

/**
 * WR-02: rows that became `failed` (terminal, never swept) in the last `hours`. Ids and counts only:
 * the sweep reports it so a lost Lead is visible instead of silent.
 */
export async function recentFailedCount(hours: number): Promise<number> {
  try {
    const since = new Date(Date.now() - hours * 3600_000).toISOString()
    const { count, error } = await createSupabaseServiceClient()
      .from('integration_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('updated_at', since)
    if (error) throw new Error('select')
    return typeof count === 'number' ? count : 0
  } catch {
    throw new OutboxStoreError('db_error')
  }
}

export function createOutboxStore(client?: SupabaseClient): OutboxStore {
  // Built lazily inside each method's try so a missing env var surfaces as db_error, not a crash.
  const db = (): SupabaseClient => client ?? createSupabaseServiceClient()

  return {
    async claim(key, leaseSeconds) {
      try {
        const { data, error } = await db().rpc('outbox_claim', { p_key: key, p_lease_seconds: leaseSeconds })
        if (error) throw new Error('rpc')
        const rows = Array.isArray(data) ? data : data ? [data] : []
        return rows.length > 0 ? (rows[0] as OutboxRow) : null
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },

    async getByKey(key) {
      try {
        const { data, error } = await db()
          .from('integration_outbox')
          .select(OUTBOX_COLUMNS)
          .eq('idempotency_key', key)
          .maybeSingle()
        if (error) throw new Error('select')
        return (data as OutboxRow | null) ?? null
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },

    async complete(key, status, code) {
      try {
        const { data, error } = await db().rpc('outbox_complete', {
          p_key: key,
          p_status: status,
          p_error_code: code,
        })
        if (error) throw new Error('rpc')
        return data === true
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },

    async reschedule(key, availableAt, code) {
      try {
        const { data, error } = await db().rpc('outbox_reschedule', {
          p_key: key,
          p_available_at: availableAt.toISOString(),
          p_error_code: code,
        })
        if (error) throw new Error('rpc')
        return data === true
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },

    async readInquiry(id) {
      try {
        const { data, error } = await db().from('inquiries').select(INQUIRY_COLUMNS).eq('id', id).maybeSingle()
        if (error) throw new Error('select')
        return (data as InquiryRow | null) ?? null
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },

    async readBooking(id) {
      try {
        const { data, error } = await db().from('bookings').select(BOOKING_COLUMNS).eq('id', id).maybeSingle()
        if (error) throw new Error('select')
        return (data as unknown as BookingRecord | null) ?? null
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },

    async readReturnLeg(outbound) {
      // Both legs share payment_intent_id (and attempt_id on captured unpaid rows).
      const column = outbound.payment_intent_id ? 'payment_intent_id' : outbound.attempt_id ? 'attempt_id' : null
      const value = outbound.payment_intent_id ?? outbound.attempt_id
      if (!column || !value) return null
      try {
        const { data, error } = await db()
          .from('bookings')
          .select('id,booking_reference')
          .eq(column, value)
          .eq('leg', 'return')
          .limit(1)
          .maybeSingle()
        if (error) throw new Error('select')
        return (data as ReturnLegInfo) ?? null
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },

    async readCaptureStart() {
      try {
        const { data, error } = await db()
          .from('integration_config')
          .select('value')
          .eq('key', 'lead_capture_start')
          .maybeSingle()
        if (error) throw new Error('select')
        const raw = (data as { value?: unknown } | null)?.value
        if (typeof raw !== 'string') return null
        const parsed = new Date(raw)
        return Number.isNaN(parsed.getTime()) ? null : parsed
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },
  }
}
