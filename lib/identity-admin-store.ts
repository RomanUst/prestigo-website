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
