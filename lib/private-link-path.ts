/**
 * Phase 89 (HOLD-06, D-02): paths whose URL is itself a secret or is operator-only.
 *
 * - /manage/<token>  guest self-service page; the token in the URL is the credential
 * - /driver/...      driver trip page; the trip token is in the URL (Phase 87)
 * - /quote/<token>   client quote page (Phase 92); the token in the URL is the credential
 * - /admin/...       operator back office
 *
 * Analytics, the cookie banner and chat must not run on these paths, because each of
 * them would send the page address (and so the token) to a third party. One predicate,
 * used by all seven components, so a new tracker has one thing to import.
 *
 * Client-safe: no server imports. The locale prefix list comes from i18n/locales.ts
 * (a plain module with no next-intl import).
 */
import { locales } from '@/i18n/locales'

const PRIVATE_SEGMENTS = ['admin', 'driver', 'manage', 'quote'] as const

// English is unprefixed in routing, but a literal /en/... is still treated as a prefix: it is
// redirected, never a different page, so the guard must not be bypassable through it.
const PREFIXES: readonly string[] = locales

/** True when `pathname` is (or sits under) a private link path, with or without a locale prefix. */
export function isPrivateLinkPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const segments = pathname.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) return false
  const first = PREFIXES.includes(segments[0]) ? segments[1] : segments[0]
  if (!first) return false
  return (PRIVATE_SEGMENTS as readonly string[]).includes(first)
}
