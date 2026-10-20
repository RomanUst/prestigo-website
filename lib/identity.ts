/**
 * Identity normalisers for the admin routes (Phase 82, plan 82-05).
 *
 * The identity resolver lives in Postgres (migration 069 / 072) and decides
 * which person a booking or signup belongs to. These two functions are the
 * TypeScript twins of its normalisers, so an admin route that looks an
 * address or number up (Identities page, split / shared-number actions)
 * speaks exactly the same language as the database:
 *
 *   - `normalizeIdentityEmail`  <->  public.identity_normalize_email (069)
 *   - `normalizeIdentityPhone`  <->  public.identity_normalize_phone (072)
 *
 * tests/fixtures/identity-cases.json drives the TypeScript test AND the live
 * SQL smoke (82-05-smoke.sql), so the two sides cannot drift apart.
 *
 * No CRM import and no network: this module is pure.
 */

import { normalizePhone } from '@/lib/phone'

/** Domain written over an address by the erasure job; never an identity. */
export const ERASED_EMAIL_DOMAIN = 'erased.invalid'

/** GNet placeholder addresses never identify a person. */
const GNET_PLACEHOLDER_DOMAIN = 'gnet.local'

const MAX_EMAIL_LENGTH = 254

/**
 * Trim + lower-case. Null for blank, no usable local part before '@', longer
 * than 254 characters, the GNet placeholder domain or the erased domain.
 */
export function normalizeIdentityEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email === '' || email.indexOf('@') < 1) return null
  if (email.length > MAX_EMAIL_LENGTH) return null
  if (email.endsWith(`@${GNET_PLACEHOLDER_DOMAIN}`)) return null
  if (email.endsWith(`@${ERASED_EMAIL_DOMAIN}`)) return null
  return email
}

/**
 * The one phone rule of the live flow: E.164 via lib/phone.ts, never guessed.
 * (The backfill-only +420 guessing of earlier tooling must not appear here.)
 */
export const normalizeIdentityPhone = normalizePhone
