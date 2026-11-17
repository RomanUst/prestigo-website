// Quote secret link token and reference (Phase 92, plan 92-02; QUOTE-02, T-92-05).
//
// A quote token is a bearer capability in the link the client receives: 32 random bytes in base64url (43 characters,
// 256 bits). Only its lowercase hex SHA-256 is ever stored (quote_links.token_hash); the raw token exists in the
// response of the mint action and in the outgoing message. A 256-bit random secret needs no pepper or slow hash.
// Callers validate with QUOTE_TOKEN_RE before any database lookup.
//
// Server only (node:crypto).

import { createHash, randomBytes } from 'node:crypto'
import { getPathname } from '@/i18n/routing'
import { normalizeSiteLocale } from '@/i18n/locales'
import { getPragueTodayISO } from '@/lib/prague-date'

/** 43 url-safe characters: 32 random bytes, base64url, no padding. */
export const QUOTE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/** A fresh 256-bit token. */
export function newQuoteToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Lowercase hex SHA-256 of the utf8 token string: what quote_links.token_hash stores. */
export function hashQuoteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** The siteUrl without trailing whitespace or slashes (an env value with a trailing newline broke links once). */
function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com').trim().replace(/\/+$/, '')
}

/** Localized absolute URL of the quote page: /quote/<token> for en, /<locale>/quote/<token> for the others. */
export function buildQuoteUrl(token: string, locale: string): string {
  if (!QUOTE_TOKEN_RE.test(token)) throw new Error('buildQuoteUrl: malformed token')
  return `${siteBaseUrl()}${getPathname({ locale: normalizeSiteLocale(locale), href: `/quote/${token}` })}`
}

const REFERENCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Human reference: Q-<Prague date YYYYMMDD>-<6 chars of A-Z0-9>. Matches QUOTE_REFERENCE_RE. */
export function generateQuoteReference(now: Date = new Date()): string {
  const date = getPragueTodayISO(now).replace(/-/g, '')
  const bytes = randomBytes(6)
  let suffix = ''
  for (let i = 0; i < 6; i += 1) {
    // 256 is not a multiple of 36; the small modulo bias is irrelevant for a human reference that is also unique-indexed.
    suffix += REFERENCE_CHARS[bytes[i] % REFERENCE_CHARS.length]
  }
  return `Q-${date}-${suffix}`
}
