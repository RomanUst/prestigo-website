// Pure auth helpers shared between the login Server Actions, the OAuth callback
// route, and tests.
//
// These MUST live outside the `'use server'` module: a file with the
// `'use server'` directive may only export async functions (every export is
// treated as a Server Action endpoint). Exporting these synchronous helpers
// from app/login/actions.ts makes Next.js fail the build with
// "Server Actions must be async functions", which 500s the whole /login flow.

import type { Provider } from '@supabase/supabase-js'

/**
 * Validate a `return-to` param before using it as a redirect destination.
 * Only same-origin relative paths are trusted: must start with a single `/`
 * and NOT be protocol-relative. Both `//evil.com` and `/\evil.com` (which
 * Chromium-family browsers normalize to `//evil.com` → external origin) are
 * rejected. Absolute URLs and any backslash form fall back to `fallback`
 * (defaults to `/account`, unchanged from the pre-75-15 behavior).
 *
 * `fallback` (75-15, D-04) lets locale-aware callers pass an already-
 * localized destination (e.g. `getPathname({ locale, href: '/account' })`)
 * instead of always landing on the English `/account` route. The guard
 * rules themselves are untouched — only the fallback value is configurable.
 *
 * This is the single source of truth for the open-redirect guard (WR-05);
 * import it instead of re-declaring the check.
 */
export function safeReturnTo(raw: string | null, fallback: string = '/account'): string {
  return raw &&
    raw.startsWith('/') &&
    !raw.startsWith('//') &&
    !raw.startsWith('/\\')
    ? raw
    : fallback
}

/** OAuth options builder (exported so tests can assert it). */
export function buildOAuthOptions(provider: Provider, origin: string) {
  return {
    provider,
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  }
}
