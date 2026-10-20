import type { publishOutboxDispatch } from '@/lib/outbox'
import type { OutboxRow, OutboxStore } from '@/lib/outbox-store'
import { AUTH_BREAKER_SECONDS, isTerminalAttempt, nextAttemptDelaySeconds } from '@/lib/outbox-backoff'

// Shared outcome helpers for every dispatcher branch (Phase 81 lead sync, Phase 82 resolver and
// per-person syncs). Pure move out of lib/lead-sync.ts: behaviour is unchanged. Imports only the
// outbox modules, never a CRM client, so it stays usable from branches that are not CRM-gated.

export type DispatchResult = {
  outcome: 'sent' | 'skipped' | 'deferred' | 'rescheduled' | 'failed' | 'already_done' | 'unknown_key' | 'breaker'
  code?: string
}

/** The slice of the dispatcher dependencies the outcome helpers need. */
export type OutcomeDeps = {
  store: OutboxStore
  publish: typeof publishOutboxDispatch
  now: () => Date
}

export async function skip(row: OutboxRow, d: OutcomeDeps, code: string): Promise<DispatchResult> {
  await d.store.complete(row.idempotency_key, 'skipped', code)
  return { outcome: 'skipped', code }
}

/** Re-arm after AUTH_BREAKER_SECONDS: bad credentials or no config must never be retried quickly. */
export async function breaker(row: OutboxRow, code: string, d: OutcomeDeps): Promise<DispatchResult> {
  const key = row.idempotency_key
  await d.store.reschedule(key, new Date(d.now().getTime() + AUTH_BREAKER_SECONDS * 1000), code)
  await d.publish(key, { delaySeconds: AUTH_BREAKER_SECONDS, dedupSuffix: `a${row.attempts}` })
  return { outcome: 'breaker', code }
}

/** Transient failure: growing delay, terminal after OUTBOX_MAX_ATTEMPTS. */
export async function retryLater(row: OutboxRow, code: string, d: OutcomeDeps): Promise<DispatchResult> {
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
