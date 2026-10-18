import { parseOutboxKey, publishOutboxDispatch } from '@/lib/outbox'
import { createOutboxStore, type OutboxRow, type OutboxStore } from '@/lib/outbox-store'
import {
  createSiteEspoClient,
  loadSiteEspoConfig,
  type SiteEspoClient,
  type SiteEspoConfig,
} from '@/lib/espocrm-client'
import { buildLeadFromInquiry, diffSyncOwned, LEAD_ATTR, type LeadDraft } from '@/lib/lead-mapping'

/**
 * Outbox dispatcher (Phase 81): claim -> read source -> map -> upsert Lead -> complete.
 * Runs only when QStash calls /api/integrations/dispatch with a signed message.
 * State-convergent: the Lead is always looked up by cSupabaseRef before any write.
 * No Account, Contact or CBooking is ever written and no Lead is converted (D-09, D-11, D-12).
 */

export type DispatchResult = {
  outcome: 'sent' | 'skipped' | 'deferred' | 'rescheduled' | 'failed' | 'already_done' | 'unknown_key' | 'breaker'
  code?: string
}

export interface DispatchDeps {
  store: OutboxStore
  crm: SiteEspoClient | null
  config: SiteEspoConfig | null
  publish: typeof publishOutboxDispatch
  now: () => Date
}

const LEASE_SECONDS = 120
const BUSY_DEFER_SECONDS = 30

function resolveDeps(deps: Partial<DispatchDeps>): DispatchDeps {
  const config = 'config' in deps ? (deps.config ?? null) : loadSiteEspoConfig()
  const crm = 'crm' in deps ? (deps.crm ?? null) : config ? createSiteEspoClient({ config }) : null
  return {
    store: deps.store ?? createOutboxStore(),
    crm,
    config,
    publish: deps.publish ?? publishOutboxDispatch,
    now: deps.now ?? (() => new Date()),
  }
}

export async function dispatchOutboxKey(key: string, deps: Partial<DispatchDeps> = {}): Promise<DispatchResult> {
  const result = await run(key, deps)
  // One payload-free line per call: key (ids only), outcome, code.
  const shownKey = parseOutboxKey(key) ? key : 'invalid'
  console.log(`[lead-sync] key=${shownKey} outcome=${result.outcome} code=${result.code ?? '-'}`)
  return result
}

async function run(key: string, partial: Partial<DispatchDeps>): Promise<DispatchResult> {
  if (!parseOutboxKey(key)) return { outcome: 'unknown_key' }

  const d = resolveDeps(partial)
  const row = await d.store.claim(key, LEASE_SECONDS)
  if (!row) return deferOrFinish(key, d)

  return process(row, d)
}

/** The claim returned nothing: decide between unknown, already done and a deferral. */
async function deferOrFinish(key: string, d: DispatchDeps): Promise<DispatchResult> {
  const current = await d.store.getByKey(key)
  if (!current) return { outcome: 'unknown_key' }
  if (current.status === 'sent' || current.status === 'skipped' || current.status === 'failed') {
    return { outcome: 'already_done' }
  }

  let delay = BUSY_DEFER_SECONDS
  if (current.status === 'pending') {
    const remainingMs = Date.parse(current.available_at) - d.now().getTime()
    if (remainingMs > 0) delay = Math.max(1, Math.ceil(remainingMs / 1000))
  }
  await d.publish(key, { delaySeconds: delay, dedupSuffix: `d${current.attempts}` })
  return { outcome: 'deferred' }
}

async function process(row: OutboxRow, d: DispatchDeps): Promise<DispatchResult> {
  const key = row.idempotency_key

  if (row.event_type !== 'lead.inquiry') {
    await d.store.complete(key, 'failed', 'unsupported_event')
    return { outcome: 'failed', code: 'unsupported_event' }
  }

  const inquiry = await d.store.readInquiry(row.aggregate_id)
  if (!inquiry) {
    await d.store.complete(key, 'skipped', 'source_missing')
    return { outcome: 'skipped', code: 'source_missing' }
  }

  if (!d.crm || !d.config) {
    // Replaced by the unconfigured breaker in the resilience task.
    throw new Error('crm not configured')
  }
  await upsertLead(d.crm, d.config, buildLeadFromInquiry(inquiry))
  await d.store.complete(key, 'sent', null)
  return { outcome: 'sent' }
}

// ── EspoCRM upsert ──────────────────────────────────────────────────────────

const q = encodeURIComponent

interface LiveLead {
  id: string
  [attr: string]: unknown
}

async function findLeadByRef(crm: SiteEspoClient, draft: LeadDraft): Promise<LiveLead | null> {
  const select = ['id', 'status', ...Object.keys(draft.syncOwned), LEAD_ATTR.existingCustomer]
  const unique = [...new Set(select)].join(',')
  const res = (await crm.get(
    `/Lead?select=${unique}&maxSize=2&where[0][type]=equals&where[0][attribute]=${LEAD_ATTR.supabaseRef}&where[0][value]=${q(draft.ref)}`,
  )) as { list?: LiveLead[] } | null
  const list = Array.isArray(res?.list) ? res.list : []
  return list.length > 0 ? list[0] : null
}

async function upsertLead(crm: SiteEspoClient, _config: SiteEspoConfig, draft: LeadDraft): Promise<void> {
  const live = await findLeadByRef(crm, draft)
  if (live) {
    const changes = diffSyncOwned(live, draft.syncOwned)
    if (Object.keys(changes).length > 0) await crm.put(`/Lead/${live.id}`, changes)
    return
  }
  // D-10: a second submission from the same email is a second Lead, so the duplicate check is skipped.
  await crm.post('/Lead', { ...draft.create }, { 'X-Skip-Duplicate-Check': 'true' })
}
