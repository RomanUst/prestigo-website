// Pure retry schedule for outbox delivery (Phase 81, D-18).

/** Seconds to wait after attempt 1..8; every later attempt waits the last value. */
export const OUTBOX_BACKOFF_SECONDS = [60, 300, 900, 3600, 10800, 21600, 43200, 86400] as const

/** After this many attempts a transient failure becomes terminal. */
export const OUTBOX_MAX_ATTEMPTS = 30

/** EspoCRM 401/403 or missing config: wait 6 h (a repeated 401 can get the egress IP banned). */
export const AUTH_BREAKER_SECONDS = 21_600

/** `attempts` is the already-incremented count of the claimed row (1 = first attempt). */
export function nextAttemptDelaySeconds(attempts: number): number {
  const n = Number.isFinite(attempts) ? Math.floor(attempts) : 1
  const index = Math.min(Math.max(n, 1), OUTBOX_BACKOFF_SECONDS.length) - 1
  return OUTBOX_BACKOFF_SECONDS[index]
}

export function isTerminalAttempt(attempts: number): boolean {
  return attempts >= OUTBOX_MAX_ATTEMPTS
}
