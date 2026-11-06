// Secret manage-booking link (Phase 89, plan 89-04; CANC-02, D-01, D-02).
//
// A manage token is a bearer capability that travels in confirmation emails: 32 random bytes in base64url (43
// characters, 256 bits), one per booking, stored in the deny-all table booking_manage_tokens (migration 087) and
// looked up by equality. It is never a bookings column: bookings_select_own would hand it to the signed-in client's
// own query, and the same link must be re-embedded in later emails, so a hash-only store cannot work.
//
// Stored-terms gate (D-18): a booking gets a token only when it stored a cancellation policy
// (bookings.cancel_policy_version). Plan 89-07 writes that column only while the policy is public, so nothing here is
// visible to a client before go-live, and legacy bookings keep their terms and their old emails. Partner bookings
// (GNet) never get one (Pitfall 15).
//
// Anti-enumeration (T-89-11, T-89-12): resolveManageToken answers `null` for a malformed, unknown, revoked,
// anonymised, partner or long-past token, with no way to tell the reasons apart. A token is never logged.
//
// Server-only by use (service client).

import { randomBytes } from 'node:crypto'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getPathname } from '@/i18n/routing'
import { normalizeSiteLocale } from '@/i18n/locales'
import { isPartnerBooking } from '@/lib/booking-status'
import { pickupInstantMs } from '@/lib/prague-date'

/** 43 url-safe characters: 32 random bytes, base64url, no padding. Matches the CHECK in migration 087. */
export const MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/** The link stops working this long after the pickup instant (research A6). */
export const MANAGE_LINK_LIFETIME_AFTER_PICKUP_MS = 30 * 24 * 3_600_000

/** A fresh 256-bit token. */
export function newManageToken(): string {
  return randomBytes(32).toString('base64url')
}

type Row = Record<string, unknown>

const PG_UNIQUE_VIOLATION = '23505'

function isEligibleBooking(booking: Row): boolean {
  const version = booking.cancel_policy_version
  if (typeof version !== 'string' || version.length === 0) return false
  if (booking.anonymised_at) return false
  return !isPartnerBooking({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
}

/**
 * The booking's manage token, created on first use. Returns null when the booking is not eligible (no stored
 * policy, partner, anonymised, unknown id) or its token was revoked deliberately. Two concurrent calls return one
 * token: the loser of the unique race reads the winner's row.
 */
export async function ensureManageToken(bookingId: string): Promise<string | null> {
  if (typeof bookingId !== 'string' || bookingId.length === 0) return null
  const supabase = createSupabaseServiceClient()

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, cancel_policy_version, booking_source, anonymised_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (bookingError || !booking || !isEligibleBooking(booking as Row)) return null

  const readExisting = async (): Promise<{ token: string; revoked: boolean } | null> => {
    const { data, error } = await supabase
      .from('booking_manage_tokens')
      .select('token, revoked_at')
      .eq('booking_id', bookingId)
      .maybeSingle()
    if (error || !data) return null
    const row = data as Row
    if (typeof row.token !== 'string' || !MANAGE_TOKEN_RE.test(row.token)) return null
    return { token: row.token, revoked: Boolean(row.revoked_at) }
  }

  const existing = await readExisting()
  if (existing) return existing.revoked ? null : existing.token

  const { error: insertError } = await supabase
    .from('booking_manage_tokens')
    .insert({ booking_id: bookingId, token: newManageToken() })
  if (insertError && (insertError as { code?: string }).code !== PG_UNIQUE_VIOLATION) return null

  const stored = await readExisting()
  return stored && !stored.revoked ? stored.token : null
}

/**
 * The booking id behind a token, or null. One identical null for every invalid reason: malformed (no database call),
 * unknown, revoked, anonymised, partner, pickup more than 30 days ago, or a read problem. Records last_used_at.
 */
export async function resolveManageToken(token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !MANAGE_TOKEN_RE.test(token)) return null
  try {
    const supabase = createSupabaseServiceClient()
    const { data: tokenRow, error: tokenError } = await supabase
      .from('booking_manage_tokens')
      .select('booking_id, revoked_at')
      .eq('token', token)
      .maybeSingle()
    if (tokenError || !tokenRow) return null
    const found = tokenRow as Row
    if (found.revoked_at || typeof found.booking_id !== 'string') return null

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, booking_source, anonymised_at, pickup_utc, pickup_date, pickup_time')
      .eq('id', found.booking_id)
      .maybeSingle()
    if (bookingError || !booking) return null
    const b = booking as Row
    if (b.anonymised_at) return null
    if (isPartnerBooking({ booking_source: typeof b.booking_source === 'string' ? b.booking_source : null })) return null

    const pickupMs = pickupInstantMs({
      pickup_utc: typeof b.pickup_utc === 'string' ? b.pickup_utc : null,
      pickup_date: typeof b.pickup_date === 'string' ? b.pickup_date : '',
      pickup_time: typeof b.pickup_time === 'string' ? b.pickup_time : '',
    })
    if (pickupMs === null || Date.now() > pickupMs + MANAGE_LINK_LIFETIME_AFTER_PICKUP_MS) return null

    // Best effort: a failed write must not turn a valid link into an invalid one.
    await supabase
      .from('booking_manage_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token)
    return found.booking_id
  } catch {
    console.error('[manage-link] resolve failed')
    return null
  }
}

/** The siteUrl without trailing whitespace or slashes (an env value with a trailing newline broke links once). */
function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com').trim().replace(/\/+$/, '')
}

/** Localized absolute URL of the manage page: /manage/<token> for en, /<locale>/manage/<token> for the others. */
export function buildManageUrl(token: string, localeInput?: unknown): string {
  if (!MANAGE_TOKEN_RE.test(token)) throw new Error('buildManageUrl: malformed token')
  const locale = normalizeSiteLocale(localeInput)
  return `${siteBaseUrl()}${getPathname({ locale, href: `/manage/${token}` })}`
}

/** Revoke a booking's link deliberately (erasure, abuse). True when a live token was revoked. */
export async function revokeManageToken(bookingId: string): Promise<boolean> {
  if (typeof bookingId !== 'string' || bookingId.length === 0) return false
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('booking_manage_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .is('revoked_at', null)
    .select('booking_id')
  return !error && Array.isArray(data) && data.length > 0
}
