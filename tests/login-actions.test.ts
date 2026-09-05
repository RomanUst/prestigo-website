/**
 * login-actions.test.ts (Phase 70, Plan 02, Task 2)
 *
 * Proves the Server-Action locale-threading pattern (Pattern E) round-trips
 * correctly: sendMagicLink is called with an explicit `locale` (as
 * `.bind(null, locale)` binds it from the client in login/page.tsx), hits
 * its rate-limited error branch, and the returned English error text is
 * byte-identical to the prior hardcoded literal — because
 * getTranslations({namespace: 'Errors', locale}) now resolves it from
 * messages/en.json's Errors.rateLimited key.
 */

import { describe, it, expect, vi } from 'vitest'
import enMessages from '../messages/en.json'

// ---------------------------------------------------------------------------
// next-intl/server: force the real react-server build.
//
// Vitest has no concept of the RSC "react-server" export condition Next.js's
// bundler sets when building Server Action/Server Component code, so the
// plain `next-intl/server` specifier resolves to a react-client stub whose
// every export throws "... is not supported in Client Components." Redirect
// both `next-intl/server` and `next-intl/config` (the specifier
// createNextIntlPlugin aliases to i18n/request.ts in the real Next.js build)
// to the real implementation + the real messages/en.json, so this test
// exercises production code end-to-end rather than a hand-rolled stub.
// ---------------------------------------------------------------------------
vi.mock('next-intl/server', async () => {
  return await vi.importActual(
    '../node_modules/next-intl/dist/esm/development/server.react-server.js'
  )
})

vi.mock('next-intl/config', async () => {
  const { getRequestConfig } = await vi.importActual<typeof import('next-intl/server')>(
    '../node_modules/next-intl/dist/esm/development/server.react-server.js'
  )
  return {
    default: getRequestConfig(async () => ({ locale: 'en', messages: enMessages })),
  }
})

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories (modeled on
// tests/nav-auth.test.tsx)
// ---------------------------------------------------------------------------
const { mockCheckRateLimit, mockSignInWithOtp } = vi.hoisted(() => {
  return {
    mockCheckRateLimit: vi.fn(),
    mockSignInWithOtp: vi.fn(),
  }
})

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  }),
}))

// ---------------------------------------------------------------------------
// Import (production target)
// ---------------------------------------------------------------------------
import { sendMagicLink } from '@/app/[locale]/login/actions'

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('login/actions.ts — Server-Action locale threading (Pattern E)', () => {
  it('sendMagicLink(locale="en", ...) on a rate-limited path returns the exact prior English error text via the Errors namespace', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, limit: 5 })

    const formData = new FormData()
    formData.set('email', 'test@example.com')

    const result = await sendMagicLink('en', null, formData)

    // Supabase must never be called once the request is rate-limited.
    expect(mockSignInWithOtp).not.toHaveBeenCalled()

    // Byte-identical to the pre-externalization literal (must_haves truth) —
    // asserted against both a hardcoded string AND the live catalog value,
    // so a future catalog edit that silently changes the English copy fails
    // this test rather than passing vacuously.
    expect(result).toEqual({ error: 'Too many attempts. Please try again in a minute.' })
    expect(result.error).toBe(enMessages.Errors.rateLimited)
  })
})
