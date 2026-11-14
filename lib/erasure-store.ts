import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { OutboxStoreError } from '@/lib/outbox-store'

// Supabase access for the GDPR erasure saga (Phase 82, plan 82-12, migration 075). Every call goes
// through a SECURITY DEFINER RPC (erasure_requests and the identity tables are deny-all). Deliberately
// has no CRM import (not allowlisted by the VPS isolation guard): the CRM half lives in lib/erasure.ts.
// Every RPC error becomes OutboxStoreError('db_error'), which the dispatcher turns into a retry;
// messages and payloads are never logged (they can hold an address).

export type ErasureStatus = 'previewed' | 'confirmed' | 'running' | 'completed' | 'failed'
export type ErasureStepName = 'chatwoot' | 'espocrm' | 'verify' | 'stripe' | 'supabase' | 'auth'

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
  /** Phase 89 (migration 088): the payment flow's own personal data. */
  consents_scrubbed: number
  manage_tokens_deleted: number
  payment_notes_deleted: number
  fee_cases_scrubbed: number
  stripe_ids_cleared: number
  /** Phase 92 (migration 091): quotes without a booking or money are deleted, the others anonymised in place. */
  quotes_deleted: number
  quotes_anonymised: number
}

export type ConfirmOutcome =
  | 'confirmed'
  | 'not_found'
  | 'already_in_progress'
  | 'not_previewed'
  | 'expired'
  | 'actor_mismatch'
  /** Phase 89 (migration 088): a hold, a pending fee case or an open card flow on a future pickup. */
  | 'payment_open'

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
  /**
   * Phase 89: the distinct Stripe Customer ids of the person's bookings, read BEFORE the Supabase step clears
   * them. A customer on a booking whose payment is still live (hold being placed / held / captured, pending
   * fee case) is left out: deleting it would make the hold unreleasable.
   */
  stripeCustomerIds(bookingIds: string[]): Promise<string[]>
  /**
   * Phase 92 (D-19): the distinct Stripe Customer ids stored on the request person's quotes (migration 091,
   * erasure_quote_customer_ids), without those of a quote with money in flight. Read BEFORE the Supabase step
   * clears them, like stripeCustomerIds.
   */
  quoteStripeCustomerIds(requestId: string): Promise<string[]>
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
  'consents_scrubbed',
  'manage_tokens_deleted',
  'payment_notes_deleted',
  'fee_cases_scrubbed',
  'stripe_ids_cleared',
  'quotes_deleted',
  'quotes_anonymised',
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

const LIVE_PAYMENT_STATES: ReadonlySet<string> = new Set(['placing_hold', 'authorized', 'capturing'])
const BOOKING_CHUNK = 100

/**
 * The distinct Stripe Customer ids of the given bookings, minus every customer that also sits on a booking
 * with a live payment (a hold in flight or a pending fee case). Read straight from bookings with the service
 * client (the table is not deny-all for it); a read error becomes db_error, which the dispatcher retries.
 */
export async function stripeCustomerIds(bookingIds: string[], client?: SupabaseClient): Promise<string[]> {
  if (bookingIds.length === 0) return []
  try {
    const db = client ?? createSupabaseServiceClient()
    const found = new Set<string>()
    const live = new Set<string>()
    for (let i = 0; i < bookingIds.length; i += BOOKING_CHUNK) {
      const { data, error } = await db
        .from('bookings')
        .select('stripe_customer_id, payment_state, fee_case_status')
        .in('id', bookingIds.slice(i, i + BOOKING_CHUNK))
      if (error) throw new Error('select')
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const id = asString(row.stripe_customer_id)
        if (!id) continue
        found.add(id)
        if (
          (typeof row.payment_state === 'string' && LIVE_PAYMENT_STATES.has(row.payment_state)) ||
          row.fee_case_status === 'pending'
        ) {
          live.add(id)
        }
      }
    }
    return [...found].filter((id) => !live.has(id))
  } catch {
    throw new OutboxStoreError('db_error')
  }
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
    'payment_open',
  ])
  if (!outcomes.has(data)) throw new OutboxStoreError('db_error')
  return data as ConfirmOutcome
}

// ── Admin preview / confirm / log (plan 82-13 calls these; Supabase only) ───

export interface ErasureScopeOk {
  outcome: 'ok'
  primaryEmail: string
  emails: string[]
  /** Non-shared numbers only. */
  phones: string[]
  identityId: string | null
  userId: string | null
  bookingIds: string[]
  inquiryIds: string[]
  counts: {
    bookings: number
    upcoming: number
    /** Bookings whose payment is still in play (migration 088); erasure is refused while above zero. */
    paymentOpen: number
    inquiries: number
    quoteLeads: number
    /** Phase 92 (migration 091): the person's quotes (deleted or anonymised by the erasure). */
    quotes: number
    hasAccount: boolean
  }
}

export type ErasureScope =
  | ErasureScopeOk
  | { outcome: 'invalid' }
  | { outcome: 'not_found' }
  | { outcome: 'already_in_progress' }
  | { outcome: 'shared_phone'; identities: number }

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Supabase-only preview data for an email or (non-shared) phone. */
export async function erasureScope(
  email: string | null,
  phone: string | null,
  client?: SupabaseClient,
): Promise<ErasureScope> {
  const data = await rpc('erasure_scope', { p_email: email, p_phone: phone }, client)
  if (!isRecord(data) || typeof data.outcome !== 'string') throw new OutboxStoreError('db_error')
  switch (data.outcome) {
    case 'invalid':
    case 'not_found':
    case 'already_in_progress':
      return { outcome: data.outcome }
    case 'shared_phone':
      return { outcome: 'shared_phone', identities: count(data.identities) }
    case 'ok': {
      const counts = isRecord(data.counts) ? data.counts : {}
      const primaryEmail = asString(data.primary_email)
      if (!primaryEmail) throw new OutboxStoreError('db_error')
      return {
        outcome: 'ok',
        primaryEmail,
        emails: stringList(data.emails),
        phones: stringList(data.phones),
        identityId: asString(data.identity_id),
        userId: asString(data.user_id),
        bookingIds: stringList(data.booking_ids),
        inquiryIds: stringList(data.inquiry_ids),
        counts: {
          bookings: count(counts.bookings),
          upcoming: count(counts.upcoming),
          paymentOpen: count(counts.payment_open),
          inquiries: count(counts.inquiries),
          quoteLeads: count(counts.quote_leads),
          quotes: count(counts.quotes),
          hasAccount: counts.has_account === true,
        },
      }
    }
    default:
      throw new OutboxStoreError('db_error')
  }
}

/** Stores the scope as a 'previewed' request (TTL capped at one hour in the database). */
export async function createErasurePreview(
  input: { actor: string; emailHmac: string; scope: ErasureScopeOk; ttlSeconds: number },
  client?: SupabaseClient,
): Promise<string> {
  const { scope } = input
  const data = await rpc(
    'erasure_preview_create',
    {
      p_actor: input.actor,
      p_email_hmac: input.emailHmac,
      p_scope: {
        outcome: 'ok',
        primary_email: scope.primaryEmail,
        emails: scope.emails,
        phones: scope.phones,
        identity_id: scope.identityId,
        user_id: scope.userId,
        booking_ids: scope.bookingIds,
        inquiry_ids: scope.inquiryIds,
        counts: {
          bookings: scope.counts.bookings,
          upcoming: scope.counts.upcoming,
          payment_open: scope.counts.paymentOpen,
          inquiries: scope.counts.inquiries,
          quote_leads: scope.counts.quoteLeads,
          quotes: scope.counts.quotes,
          has_account: scope.counts.hasAccount,
        },
      },
      p_ttl_seconds: input.ttlSeconds,
    },
    client,
  )
  const id = asString(data)
  if (!id) throw new OutboxStoreError('db_error')
  return id
}

export interface ErasureLogRow {
  id: string
  /** First 10 hex characters of the keyed email hash: the only handle an operator sees. */
  reference: string
  status: ErasureStatus
  requestedAt: string
  completedAt: string | null
  steps: ErasureSteps
  verified: boolean | null
}

export async function erasureLog(limit = 20, client?: SupabaseClient): Promise<ErasureLogRow[]> {
  const data = await rpc('erasure_log', { p_limit: limit }, client)
  if (!Array.isArray(data)) throw new OutboxStoreError('db_error')
  const rows: ErasureLogRow[] = []
  for (const row of data) {
    if (!isRecord(row)) continue
    const id = asString(row.id)
    const reference = asString(row.reference)
    const requestedAt = asString(row.requested_at)
    if (!id || !reference || !requestedAt || typeof row.status !== 'string' || !STATUSES.has(row.status)) continue
    rows.push({
      id,
      reference,
      status: row.status as ErasureStatus,
      requestedAt,
      completedAt: asString(row.completed_at),
      steps: isRecord(row.steps) ? (row.steps as ErasureSteps) : {},
      verified: typeof row.verified === 'boolean' ? row.verified : null,
    })
  }
  return rows
}

/**
 * The Stripe Customer ids stored on the request person's quotes (migration 091). The SQL function already leaves out
 * a quote with a deposit or remainder in flight; a read error or a malformed answer becomes db_error, which the
 * dispatcher retries (the same rule as stripeCustomerIds).
 */
export async function quoteStripeCustomerIds(requestId: string, client?: SupabaseClient): Promise<string[]> {
  const data = await rpc('erasure_quote_customer_ids', { p_request_id: requestId }, client)
  if (data === null || data === undefined) return []
  if (!Array.isArray(data)) throw new OutboxStoreError('db_error')
  return [...new Set(stringList(data).filter((id) => id !== ''))]
}

/** The default store the dispatcher uses. */
export const supabaseErasureStore: ErasureStore = {
  loadErasure: (requestId) => loadErasure(requestId),
  recordErasureStep: (requestId, step, result) => recordErasureStep(requestId, step, result),
  anonymisePerson: (requestId) => anonymisePerson(requestId),
  completeErasure: (requestId, verified, counts, status) => completeErasure(requestId, verified, counts, status),
  deleteAuthUser: (userId) => deleteAuthUser(userId),
  stripeCustomerIds: (bookingIds) => stripeCustomerIds(bookingIds),
  quoteStripeCustomerIds: (requestId) => quoteStripeCustomerIds(requestId),
}
