import { createHmac, timingSafeEqual } from 'node:crypto'
import { normalizeIdentityEmail } from '@/lib/identity'

/**
 * Keyed email hash for the GDPR erasure flow (Phase 82, plan 82-13, D-07 / D-09).
 *
 * The preview stores only this HMAC-SHA256 of the normalised primary email; the confirm route
 * recomputes it from the email the admin typed and compares it timing-safe, so the server (not the
 * UI) is the gate. A keyed hash is used because a bare hash of an email is dictionary-reversible.
 * The first 10 hex characters double as the only handle the erasure log ever shows.
 *
 * Server-only (node:crypto). Pure: no network, no CRM or Chatwoot import (VPS isolation guard).
 */

const MIN_KEY_LENGTH = 32

/** ERASURE_HMAC_KEY (at least 32 characters) or null. Callers must fail closed on null. */
export function loadErasureHmacKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.ERASURE_HMAC_KEY
  return typeof key === 'string' && key.length >= MIN_KEY_LENGTH ? key : null
}

/** 64 hex characters over the normalised (trimmed, lower-cased) email. */
export function erasureEmailHmac(key: string, email: string): string {
  const normalised = normalizeIdentityEmail(email) ?? email.trim().toLowerCase()
  return createHmac('sha256', key).update(normalised).digest('hex')
}

/** Timing-safe string compare; false on a length mismatch. */
export function hmacEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
