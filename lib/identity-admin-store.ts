import { createSupabaseServiceClient } from '@/lib/supabase'

// Supabase access for the identities admin (Phase 82, plan 82-08, migration 073). Every call goes
// through a SECURITY DEFINER RPC (the identity tables are deny-all). Deliberately has no CRM or
// Chatwoot import (not allowlisted by the VPS isolation guard): a split only enqueues outbox rows,
// the handlers converge EspoCRM and Chatwoot. Every RPC error becomes Error('db_error'); the
// message and payload are never logged or echoed.

async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createSupabaseServiceClient().rpc(fn, args)
    if (error) throw new Error('rpc')
    return data
  } catch {
    throw new Error('db_error')
  }
}

export type SplitOutcome = 'split' | 'not_found' | 'not_phone_merge' | 'erasing'

export interface SplitResult {
  outcome: SplitOutcome
  oldIdentityId: string | null
  newIdentityId: string | null
  keys: string[]
}

const SPLIT_OUTCOMES: readonly string[] = ['split', 'not_found', 'not_phone_merge', 'erasing']

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Move one phone-merged email into a new identity; returns the sync keys to publish. */
export async function splitIdentity(email: string, actorId: string): Promise<SplitResult> {
  const data = await rpc('identity_split', { p_email: email, p_actor: actorId })
  const r = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  if (typeof r.outcome !== 'string' || !SPLIT_OUTCOMES.includes(r.outcome)) {
    throw new Error('db_error')
  }
  const keys = Array.isArray(r.keys) ? r.keys.filter((k): k is string => typeof k === 'string') : []
  return {
    outcome: r.outcome as SplitOutcome,
    oldIdentityId: str(r.old_identity_id),
    newIdentityId: str(r.new_identity_id),
    keys,
  }
}

// ── Lists for the identities page ───────────────────────────────────────────

/** One email that joined an identity because of a shared phone number. */
export interface PhoneMergeRow {
  identityId: string
  contactEmail: string | null
  mergedEmail: string
  phone: string | null
  bookings: number
  mergedAt: string
}

/** One number flagged as shared, with the emails that use it. */
export interface SharedPhoneRow {
  phone: string
  source: 'auto' | 'manual' | 'split'
  note: string | null
  markedAt: string
  emails: string[]
}

function rows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data)
    ? data.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    : []
}

export async function listPhoneMerges(): Promise<PhoneMergeRow[]> {
  const data = await rpc('identity_phone_merges')
  return rows(data)
    .filter((r) => typeof r.identity_id === 'string' && typeof r.merged_email === 'string')
    .map((r) => ({
      identityId: r.identity_id as string,
      contactEmail: str(r.contact_email),
      mergedEmail: r.merged_email as string,
      phone: str(r.phone),
      bookings: typeof r.bookings === 'number' && Number.isFinite(r.bookings) ? r.bookings : 0,
      mergedAt: typeof r.merged_at === 'string' ? r.merged_at : '',
    }))
}

export async function listSharedPhones(): Promise<SharedPhoneRow[]> {
  const data = await rpc('identity_shared_phones')
  return rows(data)
    .filter((r) => typeof r.phone === 'string')
    .map((r) => ({
      phone: r.phone as string,
      source: (r.source === 'manual' || r.source === 'split' ? r.source : 'auto') as SharedPhoneRow['source'],
      note: str(r.note),
      markedAt: typeof r.marked_at === 'string' ? r.marked_at : '',
      emails: Array.isArray(r.emails) ? r.emails.filter((e): e is string => typeof e === 'string') : [],
    }))
}

export type MarkSharedResult = 'marked' | 'already_shared' | 'invalid'

/** D-05 manual mark of an E.164 number as shared. There is no unmark operation. */
export async function markPhoneShared(
  phone: string,
  note: string | null,
  actorId: string,
): Promise<MarkSharedResult> {
  const data = await rpc('identity_mark_shared', { p_phone: phone, p_note: note, p_actor: actorId })
  if (data === 'marked' || data === 'already_shared' || data === 'invalid') return data
  throw new Error('db_error')
}
