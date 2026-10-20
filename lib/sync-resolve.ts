import { syncBucketKey } from '@/lib/outbox'
import { OutboxStoreError, type OutboxRow } from '@/lib/outbox-store'
import { retryLater, skip, type DispatchResult, type OutcomeDeps } from '@/lib/dispatch-outcomes'
import type { IdentityStore, ResolveResult } from '@/lib/identity-store'

/**
 * Resolver hop (Phase 82): a captured `sync.booking` / `sync.signup` row says "something about this
 * booking / user changed". The hop resolves it to ONE person in Supabase (identity_resolve_booking /
 * identity_resolve_user: email rule, one global advisory lock, the RPC reads the source row itself)
 * and fans out the per-person `sync.espo` / `sync.chatwoot` rows. A booking with no usable email gets
 * one orphan `sync.espo` row keyed by the booking so its CBooking still syncs without a Contact.
 *
 * No CRM is called here and no EspoCRM gate applies: resolution only touches Supabase, so it keeps
 * running (and the fan-out rows keep queueing) while the CRM is down or unconfigured.
 * Rows carry ids only; the log line of the caller carries key, outcome and code.
 */

const PERSON_SYNC_TYPES = ['sync.espo', 'sync.chatwoot'] as const

export async function deliverResolve(
  row: OutboxRow,
  d: OutcomeDeps & { identity: IdentityStore },
): Promise<DispatchResult> {
  try {
    if (row.event_type === 'sync.booking') return await resolveBooking(row, d)
    if (row.event_type === 'sync.signup') return await resolveSignup(row, d)
    await d.store.complete(row.idempotency_key, 'failed', 'unsupported_event')
    return { outcome: 'failed', code: 'unsupported_event' }
  } catch (err) {
    // A resolver or enqueue RPC error: retry the whole hop. Every enqueue is idempotent on its key,
    // so a half-finished fan-out is completed by the next attempt and never lost.
    if (err instanceof OutboxStoreError) return retryLater(row, 'db_error', d)
    throw err
  }
}

async function resolveBooking(
  row: OutboxRow,
  d: OutcomeDeps & { identity: IdentityStore },
): Promise<DispatchResult> {
  const r = await d.identity.resolveBooking(row.aggregate_id)

  switch (r.outcome) {
    case 'source_missing':
      // GNet inserts a booking and deletes it again on a duplicate transaction: nothing to sync.
      return skip(row, d, 'source_missing')
    case 'erasing':
      return retryLater(row, 'identity_erasing', d)
    case 'abandoned':
      // The booking left an identity (it became an abandoned checkout again): refresh that person.
      await fanOutPrevious(r, d)
      return skip(row, d, 'abandoned_checkout')
    case 'no_identity':
      await fanOutOrphan(row.aggregate_id, d)
      await fanOutPrevious(r, d)
      return complete(row, d)
    case 'resolved':
      await fanOutResolved(r, d)
      return complete(row, d)
  }
}

async function resolveSignup(
  row: OutboxRow,
  d: OutcomeDeps & { identity: IdentityStore },
): Promise<DispatchResult> {
  const r = await d.identity.resolveUser(row.aggregate_id)

  switch (r.outcome) {
    case 'source_missing':
      return skip(row, d, 'source_missing')
    case 'erasing':
      return retryLater(row, 'identity_erasing', d)
    case 'no_identity':
    case 'abandoned':
      await fanOutPrevious(r, d)
      return skip(row, d, 'no_email')
    case 'resolved':
      await fanOutResolved(r, d)
      return complete(row, d)
  }
}

async function complete(row: OutboxRow, d: OutcomeDeps): Promise<DispatchResult> {
  await d.store.complete(row.idempotency_key, 'sent', null)
  return { outcome: 'sent' }
}

async function fanOutResolved(r: ResolveResult, d: OutcomeDeps & { identity: IdentityStore }): Promise<void> {
  if (r.identityId) await fanOutPerson(r.identityId, d)
  await fanOutPrevious(r, d)
}

async function fanOutPrevious(r: ResolveResult, d: OutcomeDeps & { identity: IdentityStore }): Promise<void> {
  if (r.previousIdentityId && r.previousIdentityId !== r.identityId) await fanOutPerson(r.previousIdentityId, d)
}

/** One `sync.espo` and one `sync.chatwoot` row for the person, available when the bucket closes. */
async function fanOutPerson(identityId: string, d: OutcomeDeps & { identity: IdentityStore }): Promise<void> {
  const nowMs = d.now().getTime()
  for (const eventType of PERSON_SYNC_TYPES) {
    const { key, availableAt } = syncBucketKey(eventType, identityId, nowMs)
    await d.identity.enqueueSync({ eventType, aggregateType: 'person', aggregateId: identityId, key, availableAt })
    await d.publish(key, { delaySeconds: delayUntil(availableAt, nowMs), dedupSuffix: 'f' })
  }
}

/** The booking has no person: one CBooking-only row keyed by the booking id. */
async function fanOutOrphan(bookingId: string, d: OutcomeDeps & { identity: IdentityStore }): Promise<void> {
  const nowMs = d.now().getTime()
  const { key, availableAt } = syncBucketKey('sync.espo', bookingId, nowMs)
  await d.identity.enqueueSync({
    eventType: 'sync.espo',
    aggregateType: 'booking',
    aggregateId: bookingId,
    key,
    availableAt,
  })
  await d.publish(key, { delaySeconds: delayUntil(availableAt, nowMs), dedupSuffix: 'f' })
}

function delayUntil(availableAt: Date, nowMs: number): number {
  return Math.max(1, Math.ceil((availableAt.getTime() - nowMs) / 1000))
}
