import { parseOutboxKey, publishOutboxDispatch } from '@/lib/outbox'
import { createOutboxStore, OutboxStoreError, type OutboxRow, type OutboxStore } from '@/lib/outbox-store'
import {
  classifyEspoError,
  createSiteEspoClient,
  loadSiteEspoConfig,
  SiteEspoError,
  type SiteEspoClient,
  type SiteEspoConfig,
} from '@/lib/espocrm-client'
import {
  AUTH_BREAKER_SECONDS,
  isTerminalAttempt,
  nextAttemptDelaySeconds,
} from '@/lib/outbox-backoff'
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

  return handleClaimed(row, d)
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

async function handleClaimed(row: OutboxRow, d: DispatchDeps): Promise<DispatchResult> {
  // Missing config: zero requests, long wait. Every other branch needs the CRM.
  if (!d.crm || !d.config) return breaker(row, 'crm_unconfigured', d)

  try {
    return await deliver(row, d, d.crm, d.config)
  } catch (err) {
    return handleFailure(row, err, d)
  }
}

async function deliver(
  row: OutboxRow,
  d: DispatchDeps,
  crm: SiteEspoClient,
  config: SiteEspoConfig,
): Promise<DispatchResult> {
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

  await upsertLead(crm, config, buildLeadFromInquiry(inquiry))
  await d.store.complete(key, 'sent', null)
  return { outcome: 'sent' }
}

// ── Failure handling ────────────────────────────────────────────────────────

/** Re-arm after AUTH_BREAKER_SECONDS: bad credentials or no config must never be retried quickly. */
async function breaker(row: OutboxRow, code: string, d: DispatchDeps): Promise<DispatchResult> {
  const key = row.idempotency_key
  await d.store.reschedule(key, new Date(d.now().getTime() + AUTH_BREAKER_SECONDS * 1000), code)
  await d.publish(key, { delaySeconds: AUTH_BREAKER_SECONDS, dedupSuffix: `a${row.attempts}` })
  return { outcome: 'breaker', code }
}

/** Transient failure: growing delay, terminal after OUTBOX_MAX_ATTEMPTS. */
async function retryLater(row: OutboxRow, code: string, d: DispatchDeps): Promise<DispatchResult> {
  const key = row.idempotency_key
  if (isTerminalAttempt(row.attempts)) {
    const finalCode = `${code}_exhausted`.slice(0, 40)
    await d.store.complete(key, 'failed', finalCode)
    return { outcome: 'failed', code: finalCode }
  }
  const delay = nextAttemptDelaySeconds(row.attempts)
  await d.store.reschedule(key, new Date(d.now().getTime() + delay * 1000), code)
  await d.publish(key, { delaySeconds: delay, dedupSuffix: `a${row.attempts}` })
  return { outcome: 'rescheduled', code }
}

/**
 * Anything thrown while delivering. Only a store that is unreachable even for the
 * reschedule makes this throw (the route then answers 500 and QStash retries).
 */
async function handleFailure(row: OutboxRow, err: unknown, d: DispatchDeps): Promise<DispatchResult> {
  if (err instanceof SiteEspoError) {
    const kind = classifyEspoError(err)
    if (kind === 'transient') return retryLater(row, err.code, d)
    if (kind === 'auth') return breaker(row, 'crm_auth', d)
    // permanent / not_found / conflict: retrying the same request cannot help.
    await d.store.complete(row.idempotency_key, 'failed', err.code)
    return { outcome: 'failed', code: err.code }
  }
  if (err instanceof OutboxStoreError) return retryLater(row, 'db_error', d)
  return retryLater(row, 'internal_error', d)
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

/**
 * D-11: id of a Contact with this (already normalized) email, or null. A failed lookup never blocks
 * the Lead; an auth error is propagated so the breaker stops all further requests.
 */
async function matchContact(crm: SiteEspoClient, email: string | null): Promise<string | null> {
  if (!email) return null
  try {
    const res = (await crm.get(
      `/Contact?select=id&maxSize=1&where[0][type]=equals&where[0][attribute]=emailAddress&where[0][value]=${q(email)}`,
    )) as { list?: Array<{ id?: unknown }> } | null
    const id = Array.isArray(res?.list) && res.list.length > 0 ? res.list[0].id : null
    return typeof id === 'string' && id !== '' ? id : null
  } catch (err) {
    if (err instanceof SiteEspoError && classifyEspoError(err) === 'auth') throw err
    return null
  }
}

/** Sync-owned attributes only (+ the existing-customer mark); create-only fields are never written. */
async function updateLead(crm: SiteEspoClient, draft: LeadDraft, live: LiveLead): Promise<void> {
  const desired: Record<string, unknown> = { ...draft.syncOwned }
  if (live[LEAD_ATTR.existingCustomer] !== true) {
    const contactId = await matchContact(crm, draft.email)
    if (contactId) {
      desired[LEAD_ATTR.existingCustomer] = true
      desired[LEAD_ATTR.existingContactId] = contactId
    }
  }
  const changes = diffSyncOwned(live, desired)
  if (Object.keys(changes).length > 0) await crm.put(`/Lead/${live.id}`, changes)
}

const SKIP_DUPLICATE_CHECK = { 'X-Skip-Duplicate-Check': 'true' }

/** POST /Lead; a 400 on a body with a phone number is retried once without it (Phase 80 precedent). */
async function createLead(crm: SiteEspoClient, body: Record<string, unknown>): Promise<void> {
  try {
    await crm.post('/Lead', body, SKIP_DUPLICATE_CHECK)
  } catch (err) {
    if (err instanceof SiteEspoError && err.status === 400 && body.phoneNumber !== undefined) {
      const { phoneNumber: _dropped, ...withoutPhone } = body
      await crm.post('/Lead', withoutPhone, SKIP_DUPLICATE_CHECK)
      return
    }
    throw err
  }
}

async function upsertLead(crm: SiteEspoClient, config: SiteEspoConfig, draft: LeadDraft): Promise<void> {
  const live = await findLeadByRef(crm, draft)
  if (live) {
    await updateLead(crm, draft, live)
    return
  }

  const body: Record<string, unknown> = { ...draft.create }
  // D-13: the assignee is set on create only; the owner may reassign afterwards.
  if (config.leadAssigneeId) body.assignedUserId = config.leadAssigneeId
  const contactId = await matchContact(crm, draft.email)
  if (contactId) {
    body[LEAD_ATTR.existingCustomer] = true
    body[LEAD_ATTR.existingContactId] = contactId
  }

  try {
    // D-10: a second submission from the same email is a second Lead, so the duplicate check is skipped.
    await createLead(crm, body)
  } catch (err) {
    if (!(err instanceof SiteEspoError) || err.status !== 409) throw err
    // Another delivery created it between our lookup and the POST: converge on that Lead.
    const raced = await findLeadByRef(crm, draft)
    if (!raced) throw err
    await updateLead(crm, draft, raced)
  }
}
