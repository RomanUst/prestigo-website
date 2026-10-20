import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { OutboxStoreError } from '@/lib/outbox-store'

// Supabase access for the identity domain (Phase 82, migration 069). Every call goes through a
// SECURITY DEFINER RPC (the identity tables are deny-all). Deliberately has no CRM import (not
// allowlisted by the VPS isolation guard). Every RPC error becomes OutboxStoreError('db_error'),
// which the dispatcher turns into a retry; messages and payloads are never logged.

export type ResolveOutcome = 'resolved' | 'no_identity' | 'abandoned' | 'source_missing' | 'erasing'

export interface ResolveResult {
  identityId: string | null
  previousIdentityId: string | null
  outcome: ResolveOutcome
}

/** One booking as migration 069 crm_booking() emits it. */
export interface CrmBookingRecord {
  id: string
  booking_reference: string
  status: string
  booking_source: string
  lead_channel: string | null
  leg: string
  trip_type: string
  payment_intent_id: string | null
  payment_link_id: string | null
  invoice_number: string | null
  pickup_utc: string | null
  pickup_date: string
  pickup_time: string
  origin_address: string | null
  destination_address: string | null
  vehicle_class: string
  passengers: number | null
  hours: number | null
  amount_eur: number | null
  amount_czk: number | null
  outbound_amount_czk: number | null
  return_amount_czk: number | null
  client_first_name: string
  client_last_name: string
  client_email: string
  client_phone: string
  flight_number: string | null
  driver_name: string | null
  user_id: string | null
  anonymised_at: string | null
  created_at: string
  abandoned: boolean
}

/** One person as migration 069 identity_person() emits it. */
export interface PersonRecord {
  identity: {
    id: string
    user_id: string | null
    espo_contact_id: string | null
    chatwoot_contact_id: number | null
    erasing_at: string | null
  }
  emails: Array<{ email: string; basis: string; via_phone: string | null }>
  /** E.164 numbers that are not flagged shared. */
  phones: string[]
  profile: { email: string | null; full_name: string | null; phone: string | null } | null
  bookings: CrmBookingRecord[]
}

export interface IdentityStore {
  resolveBooking(bookingId: string): Promise<ResolveResult>
  resolveUser(userId: string): Promise<ResolveResult>
  person(identityId: string): Promise<PersonRecord | null>
  crmBooking(bookingId: string): Promise<CrmBookingRecord | null>
  /** email (normalised) -> identity id, for the addresses that already belong to an identity. */
  emailOwners(emails: string[]): Promise<Map<string, string>>
  setEspoContact(identityId: string, contactId: string | null): Promise<boolean>
  setChatwootContact(identityId: string, contactId: number | null): Promise<boolean>
  /** outbox_enqueue: true when a row was inserted, false only on a key conflict; THROWS on an RPC error. */
  enqueueSync(input: {
    eventType: string
    aggregateType: 'person' | 'booking'
    aggregateId: string
    key: string
    availableAt: Date
  }): Promise<boolean>
}

const OUTCOMES: ReadonlySet<string> = new Set(['resolved', 'no_identity', 'abandoned', 'source_missing', 'erasing'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function toResolveResult(data: unknown): ResolveResult {
  const row = Array.isArray(data) ? data[0] : data
  if (!isRecord(row) || typeof row.outcome !== 'string' || !OUTCOMES.has(row.outcome)) {
    throw new Error('shape')
  }
  return {
    identityId: asString(row.identity_id),
    previousIdentityId: asString(row.previous_identity_id),
    outcome: row.outcome as ResolveOutcome,
  }
}

export function createIdentityStore(client?: SupabaseClient): IdentityStore {
  // Built lazily inside each method's try so a missing env var surfaces as db_error, not a crash.
  const db = (): SupabaseClient => client ?? createSupabaseServiceClient()

  async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const { data, error } = await db().rpc(fn, args)
      if (error) throw new Error('rpc')
      return data
    } catch {
      throw new OutboxStoreError('db_error')
    }
  }

  return {
    async resolveBooking(bookingId) {
      const data = await rpc('identity_resolve_booking', { p_booking_id: bookingId })
      try {
        return toResolveResult(data)
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },

    async resolveUser(userId) {
      const data = await rpc('identity_resolve_user', { p_user_id: userId })
      try {
        return toResolveResult(data)
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },

    async person(identityId) {
      const data = await rpc('identity_person', { p_identity_id: identityId })
      return isRecord(data) ? (data as unknown as PersonRecord) : null
    },

    async crmBooking(bookingId) {
      const data = await rpc('crm_booking', { p_booking_id: bookingId })
      return isRecord(data) ? (data as unknown as CrmBookingRecord) : null
    },

    async emailOwners(emails) {
      const owners = new Map<string, string>()
      if (emails.length === 0) return owners
      const data = await rpc('identity_email_owners', { p_emails: emails })
      for (const row of Array.isArray(data) ? data : []) {
        if (isRecord(row) && typeof row.email === 'string' && typeof row.identity_id === 'string') {
          owners.set(row.email, row.identity_id)
        }
      }
      return owners
    },

    async setEspoContact(identityId, contactId) {
      const data = await rpc('identity_set_espo_contact', { p_identity_id: identityId, p_contact_id: contactId })
      return data === true
    },

    async setChatwootContact(identityId, contactId) {
      const data = await rpc('identity_set_chatwoot_contact', { p_identity_id: identityId, p_contact_id: contactId })
      return data === true
    },

    async enqueueSync(input) {
      const data = await rpc('outbox_enqueue', {
        p_event_type: input.eventType,
        p_aggregate_type: input.aggregateType,
        p_aggregate_id: input.aggregateId,
        p_key: input.key,
        p_available_at: input.availableAt.toISOString(),
      })
      return data === true
    },
  }
}
