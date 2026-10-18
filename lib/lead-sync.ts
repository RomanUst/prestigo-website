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
import {
  buildLeadFromBooking,
  buildLeadFromInquiry,
  diffSyncOwned,
  isPurgeEligible,
  LEAD_ATTR,
  LEAD_STATUS_VALUE,
  leadRefForBooking,
  type LeadDraft,
} from '@/lib/lead-mapping'

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

/**
 * WR-01: a blocked row does not change `attempts`, so a dedup id of `d<attempts>` repeats on the
 * second deferral and QStash silently drops it (the row then waits for the daily sweep). The id
 * carries the target delivery second instead: every deferral to a new time is a new message, while
 * two deferrals aimed at the same instant (a duplicate delivery) still collapse into one.
 */
export function deferDedupSuffix(attempts: number, nowMs: number, delaySeconds: number): string {
  return `d${attempts}_${Math.floor(nowMs / 1000) + delaySeconds}`
}

/** The claim returned nothing: decide between unknown, already done and a deferral. */
async function deferOrFinish(key: string, d: DispatchDeps): Promise<DispatchResult> {
  const current = await d.store.getByKey(key)
  if (!current) return { outcome: 'unknown_key' }
  if (current.status === 'sent' || current.status === 'skipped' || current.status === 'failed') {
    return { outcome: 'already_done' }
  }

  const nowMs = d.now().getTime()
  let delay = BUSY_DEFER_SECONDS
  if (current.status === 'pending') {
    const remainingMs = Date.parse(current.available_at) - nowMs
    if (remainingMs > 0) delay = Math.max(1, Math.ceil(remainingMs / 1000))
  }
  // A row held by another (possibly crashed) worker keeps the fixed 30 s step: with a fresh dedup
  // id per deferral the chain re-checks every 30 s and claims as soon as the 120 s lease expires.
  await d.publish(key, { delaySeconds: delay, dedupSuffix: deferDedupSuffix(current.attempts, nowMs, delay) })
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

  if (row.event_type === 'lead.inquiry') return deliverInquiry(row, d, crm, config)
  if (row.event_type === 'lead.booking') return deliverBooking(row, d, crm, config)
  if (row.event_type === 'lead.purge') return deliverPurge(row, d, crm)

  await d.store.complete(key, 'failed', 'unsupported_event')
  return { outcome: 'failed', code: 'unsupported_event' }
}

async function skip(row: OutboxRow, d: DispatchDeps, code: string): Promise<DispatchResult> {
  await d.store.complete(row.idempotency_key, 'skipped', code)
  return { outcome: 'skipped', code }
}

async function deliverInquiry(
  row: OutboxRow,
  d: DispatchDeps,
  crm: SiteEspoClient,
  config: SiteEspoConfig,
): Promise<DispatchResult> {
  const inquiry = await d.store.readInquiry(row.aggregate_id)
  if (!inquiry) return skip(row, d, 'source_missing')

  await upsertLead(crm, config, buildLeadFromInquiry(inquiry))
  await d.store.complete(row.idempotency_key, 'sent', null)
  return { outcome: 'sent' }
}

/**
 * Booking Lead (D-05..D-09, D-19, D-21). The event key only says "something changed": the Lead is
 * built from the CURRENT booking row, so late, duplicated or out-of-order events converge on the
 * same Lead. No Contact, CBooking or Account is written and no Lead is converted (D-09).
 */
async function deliverBooking(
  row: OutboxRow,
  d: DispatchDeps,
  crm: SiteEspoClient,
  config: SiteEspoConfig,
): Promise<DispatchResult> {
  const booking = await d.store.readBooking(row.aggregate_id)
  // GNet inserts a booking and deletes it again on a duplicate transaction: no ghost Lead.
  if (!booking) return skip(row, d, 'source_missing')
  if (booking.leg === 'return') return skip(row, d, 'return_leg')

  // D-21: capture is forward-only; no start instant means capture is off.
  const start = await d.store.readCaptureStart()
  if (!start || Date.parse(booking.created_at) < start.getTime()) return skip(row, d, 'before_capture_start')

  const returnLeg = booking.trip_type === 'round_trip' ? await d.store.readReturnLeg(booking) : null
  const draft = buildLeadFromBooking(booking, returnLeg, d.now())
  if (!draft) return skip(row, d, 'unmapped_status')

  await upsertLead(crm, config, draft)
  await d.store.complete(row.idempotency_key, 'sent', null)
  return { outcome: 'sent' }
}

/**
 * D-15 / D-20 (T-81-31): delete the Lead of an abandoned ONLINE checkout 90 days after pickup.
 * The key only says "consider purging": eligibility is re-checked on the LIVE booking row, and the
 * Lead is deleted only while it is still Dead (a Lead the owner re-opened is kept). The Supabase
 * booking row is never written (the store has no booking write method): the admin recovery queue
 * stays as it is today. No Task, reminder or notification is created (D-04).
 */
async function deliverPurge(row: OutboxRow, d: DispatchDeps, crm: SiteEspoClient): Promise<DispatchResult> {
  const booking = await d.store.readBooking(row.aggregate_id)
  if (!booking) return skip(row, d, 'source_missing')
  if (!isPurgeEligible(booking, d.now())) return skip(row, d, 'purge_not_eligible')

  const res = (await crm.get(
    `/Lead?select=id,status&maxSize=2&where[0][type]=equals&where[0][attribute]=${LEAD_ATTR.supabaseRef}&where[0][value]=${q(leadRefForBooking(booking.id))}`,
  )) as { list?: Array<{ id?: unknown; status?: unknown }> } | null
  const found = (Array.isArray(res?.list) ? res.list : []).filter(
    (lead): lead is { id: string; status?: unknown } => typeof lead.id === 'string' && lead.id !== '',
  )

  // Nothing to delete (never created, or already purged): the work is done.
  if (found.length === 0) {
    await d.store.complete(row.idempotency_key, 'sent', null)
    return { outcome: 'sent' }
  }
  // The owner re-opened it: keep it. Any non-Dead Lead for this reference blocks the purge.
  if (found.some((lead) => lead.status !== LEAD_STATUS_VALUE.dead)) return skip(row, d, 'purge_lead_not_dead')

  for (const lead of found) {
    try {
      await crm.del(`/Lead/${lead.id}`)
    } catch (err) {
      // 404 = already gone = success; every other error follows the shared classification.
      if (!(err instanceof SiteEspoError && err.status === 404)) throw err
    }
  }
  await d.store.complete(row.idempotency_key, 'sent', null)
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
