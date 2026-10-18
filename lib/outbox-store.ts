import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import type { InquiryRow } from '@/lib/lead-mapping'

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
}

const OUTBOX_COLUMNS =
  'idempotency_key,event_type,aggregate_type,aggregate_id,status,attempts,available_at,lease_until,last_error'
const INQUIRY_COLUMNS = 'id,kind,email,name,phone,company,payload,created_at'

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
  }
}
