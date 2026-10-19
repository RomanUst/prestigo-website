import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { OutboxStoreError } from '@/lib/outbox-store'

// Supabase access for the GDPR erasure saga (Phase 82, plan 82-12, migration 075). Every call goes
// through a SECURITY DEFINER RPC (erasure_requests and the identity tables are deny-all). Deliberately
// has no CRM import (not allowlisted by the VPS isolation guard): the CRM half lives in lib/erasure.ts.
// Every RPC error becomes OutboxStoreError('db_error'), which the dispatcher turns into a retry;
// messages and payloads are never logged (they can hold an address).

export type ErasureStatus = 'previewed' | 'confirmed' | 'running' | 'completed' | 'failed'
export type ErasureStepName = 'chatwoot' | 'espocrm' | 'verify' | 'supabase' | 'auth'

/** Per-step result: counts and flags only, never an address, name or id of a record. */
export type ErasureStepResult = Record<string, unknown>
export type ErasureSteps = Partial<Record<ErasureStepName, ErasureStepResult>>

/** One request as erasure_load emits it (migration 075). */
export interface ErasureRequest {
  id: string
  status: ErasureStatus
  requestedBy: string
  emailHmac: string
  expiresAt: string
  /** Null for a person without an identity row (inquiry-only), or once the identity is deleted. */
  identity: {
    id: string
    espoContactId: string | null
    chatwootContactId: number | null
    userId: string | null
  } | null
  userId: string | null
  emails: string[]
  phones: string[]
  bookingIds: string[]
  inquiryIds: string[]
  counts: Record<string, unknown>
  steps: ErasureSteps
}

/** Counts erasure_anonymise_person returns (and stores as the 'supabase' step). */
export interface AnonymiseCounts {
  bookings_anonymised: number
  inquiries_deleted: number
  quote_leads_deleted: number
  audit_values_scrubbed: number
  email_log_scrubbed: number
  gnet_payloads_scrubbed: number
  trip_notes_scrubbed: number
  identity_deleted: number
}

export type ConfirmOutcome =
  | 'confirmed'
  | 'not_found'
  | 'already_in_progress'
  | 'not_previewed'
  | 'expired'
  | 'actor_mismatch'

/** What lib/erasure.ts needs from Supabase (the saga's store double implements exactly this). */
export interface ErasureStore {
  loadErasure(requestId: string): Promise<ErasureRequest | null>
  recordErasureStep(requestId: string, step: ErasureStepName, result: ErasureStepResult): Promise<void>
  anonymisePerson(requestId: string): Promise<AnonymiseCounts>
  completeErasure(
    requestId: string,
    verified: boolean,
    counts: Record<string, unknown>,
    status: 'completed' | 'failed',
  ): Promise<void>
  deleteAuthUser(userId: string): Promise<'deleted' | 'not_found'>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

const STATUSES: ReadonlySet<string> = new Set(['previewed', 'confirmed', 'running', 'completed', 'failed'])

async function rpc(fn: string, args: Record<string, unknown>, client?: SupabaseClient): Promise<unknown> {
  try {
    // Built lazily inside the try so a missing env var surfaces as db_error, not a crash.
    const db = client ?? createSupabaseServiceClient()
    const { data, error } = await db.rpc(fn, args)
    if (error) throw new Error('rpc')
    return data
  } catch {
    throw new OutboxStoreError('db_error')
  }
}

function parseRequest(data: unknown): ErasureRequest | null {
  if (data === null || data === undefined) return null
  const row = Array.isArray(data) ? data[0] : data
  if (row === null || row === undefined) return null
  if (!isRecord(row)) throw new OutboxStoreError('db_error')
  const id = asString(row.id)
  const requestedBy = asString(row.requested_by)
  const emailHmac = asString(row.email_hmac)
  const expiresAt = asString(row.expires_at)
  if (!id || !requestedBy || !emailHmac || !expiresAt || typeof row.status !== 'string' || !STATUSES.has(row.status)) {
    throw new OutboxStoreError('db_error')
  }
  let identity: ErasureRequest['identity'] = null
  if (isRecord(row.identity) && asString(row.identity.id)) {
    const cw = row.identity.chatwoot_contact_id
    identity = {
      id: row.identity.id as string,
      espoContactId: asString(row.identity.espo_contact_id),
      chatwootContactId: typeof cw === 'number' && Number.isInteger(cw) && cw > 0 ? cw : null,
      userId: asString(row.identity.user_id),
    }
  }
  return {
    id,
    status: row.status as ErasureStatus,
    requestedBy,
    emailHmac,
    expiresAt,
    identity,
    userId: asString(row.user_id),
    emails: stringList(row.emails),
    phones: stringList(row.phones),
    bookingIds: stringList(row.booking_ids),
    inquiryIds: stringList(row.inquiry_ids),
    counts: isRecord(row.counts) ? row.counts : {},
    steps: isRecord(row.steps) ? (row.steps as ErasureSteps) : {},
  }
}

export async function loadErasure(requestId: string, client?: SupabaseClient): Promise<ErasureRequest | null> {
  return parseRequest(await rpc('erasure_load', { p_request_id: requestId }, client))
}

export async function recordErasureStep(
  requestId: string,
  step: ErasureStepName,
  result: ErasureStepResult,
  client?: SupabaseClient,
): Promise<void> {
  await rpc('erasure_record_step', { p_request_id: requestId, p_step: step, p_result: result }, client)
}

const COUNT_KEYS: ReadonlyArray<keyof AnonymiseCounts> = [
  'bookings_anonymised',
  'inquiries_deleted',
  'quote_leads_deleted',
  'audit_values_scrubbed',
  'email_log_scrubbed',
  'gnet_payloads_scrubbed',
  'trip_notes_scrubbed',
  'identity_deleted',
]

export async function anonymisePerson(requestId: string, client?: SupabaseClient): Promise<AnonymiseCounts> {
  const data = await rpc('erasure_anonymise_person', { p_request_id: requestId }, client)
  if (!isRecord(data)) throw new OutboxStoreError('db_error')
  const counts = {} as AnonymiseCounts
  for (const key of COUNT_KEYS) {
    const value = data[key]
    counts[key] = typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return counts
}

export async function completeErasure(
  requestId: string,
  verified: boolean,
  counts: Record<string, unknown>,
  status: 'completed' | 'failed',
  client?: SupabaseClient,
): Promise<void> {
  await rpc(
    'erasure_complete',
    { p_request_id: requestId, p_verified: verified, p_counts: counts, p_status: status },
    client,
  )
}

/**
 * Deletes the person's site account (cascades customer_profiles and saved_passengers; bookings.user_id
 * is already wiped). An account that is already gone counts as done.
 */
export async function deleteAuthUser(userId: string, client?: SupabaseClient): Promise<'deleted' | 'not_found'> {
  try {
    const db = client ?? createSupabaseServiceClient()
    const { error } = await db.auth.admin.deleteUser(userId)
    if (!error) return 'deleted'
    if (error.status === 404 || error.code === 'user_not_found') return 'not_found'
  } catch {
    // fall through to db_error
  }
  throw new OutboxStoreError('db_error')
}

export async function confirmErasure(
  requestId: string,
  actor: string,
  client?: SupabaseClient,
): Promise<ConfirmOutcome> {
  const data = await rpc('erasure_confirm', { p_request_id: requestId, p_actor: actor }, client)
  const outcomes: ReadonlySet<unknown> = new Set([
    'confirmed',
    'not_found',
    'already_in_progress',
    'not_previewed',
    'expired',
    'actor_mismatch',
  ])
  if (!outcomes.has(data)) throw new OutboxStoreError('db_error')
  return data as ConfirmOutcome
}

/** The default store the dispatcher uses. */
export const supabaseErasureStore: ErasureStore = {
  loadErasure: (requestId) => loadErasure(requestId),
  recordErasureStep: (requestId, step, result) => recordErasureStep(requestId, step, result),
  anonymisePerson: (requestId) => anonymisePerson(requestId),
  completeErasure: (requestId, verified, counts, status) => completeErasure(requestId, verified, counts, status),
  deleteAuthUser: (userId) => deleteAuthUser(userId),
}
