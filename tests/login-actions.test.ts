/**
 * login-actions.test.ts (Phase 70, Plan 02, Task 2; extended Phase 75, Plan
 * 15, Task 1)
 *
 * Proves the Server-Action locale-threading pattern (Pattern E) round-trips
 * correctly: sendMagicLink is called with an explicit `locale` (as
 * `.bind(null, locale)` binds it from the client in login/page.tsx), hits
 * its rate-limited error branch, and the returned English error text is
 * byte-identical to the prior hardcoded literal — because
 * getTranslations({namespace: 'Errors', locale}) now resolves it from
 * messages/en.json's Errors.rateLimited key.
 *
 * 75-15 Task 1 additions (D-04 — locale-continuous sign-in/account path):
 *  - signInWithPassword's return-to fallback is now a localized /account
 *    path (via getPathname), not the hardcoded English one — the
 *    open-redirect guard itself (safeReturnTo) is untouched.
 *  - safeReturnTo(raw, fallback?) — the new optional fallback parameter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import enMessages from '../messages/en.json'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories (must precede the
// vi.mock('next-intl/config', ...) factory below, which reads
// mockLocaleRef.value at CALL time — a plain top-level `let` would hit a TDZ
// ReferenceError because vi.mock() factories are hoisted above ordinary
// statements, but vi.hoisted() output is hoisted even higher, specifically
// so mock factories can safely reference it).
// ---------------------------------------------------------------------------
const {
  mockCheckRateLimit,
  mockSignInWithOtp,
  mockSignInWithPassword,
  mockRedirect,
  mockLocaleRef,
} = vi.hoisted(() => {
  return {
    mockCheckRateLimit: vi.fn(),
    mockSignInWithOtp: vi.fn(),
    mockSignInWithPassword: vi.fn(),
    mockRedirect: vi.fn(),
    // getLocale()/getTranslations() resolve against this per-test-mutable
    // ref (see next-intl/config mock below) — plain object so tests can
    // reassign `.value` without re-registering the mock factory.
    mockLocaleRef: { value: 'en' },
  }
})

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
//
// `locale` reads mockLocaleRef.value at CALL time (not import time), so
// individual tests can flip it (e.g. to 'ru'/'ar') before invoking an action
// — proven safe because React's `cache()` wrapper around next-intl's
// getConfig()/getLocale() is a pass-through (no memoization) outside of an
// actual React render/request lifecycle.
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
    default: getRequestConfig(async () => ({
      locale: mockLocaleRef.value,
      messages: enMessages,
    })),
  }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      signInWithPassword: mockSignInWithPassword,
    },
  }),
}))

// ---------------------------------------------------------------------------
// Import (production target)
// ---------------------------------------------------------------------------
import { sendMagicLink, signInWithPassword } from '@/app/[locale]/login/actions'
import { safeReturnTo } from '@/app/[locale]/login/auth-helpers'

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('login/actions.ts — Server-Action locale threading (Pattern E)', () => {
  beforeEach(() => {
    mockLocaleRef.value = 'en'
  })

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

// ---------------------------------------------------------------------------
// 75-15 Task 1 (tracer): safeReturnTo(raw, fallback?) — the open-redirect
// guard's rules are untouched; only the fallback value is now configurable.
// ---------------------------------------------------------------------------
describe('safeReturnTo — optional localized fallback (D-04, T-75-28)', () => {
  it('safeReturnTo(null) === "/account" (no fallback arg — unchanged default)', () => {
    expect(safeReturnTo(null)).toBe('/account')
  })

  it('safeReturnTo("", "/ar/account") === "/ar/account" — empty string falls to the provided fallback', () => {
    expect(safeReturnTo('', '/ar/account')).toBe('/ar/account')
  })

  it('safeReturnTo("/\\evil", "/ar/account") === "/ar/account" — backslash form still rejected, fallback still applies', () => {
    expect(safeReturnTo('/\\evil', '/ar/account')).toBe('/ar/account')
  })

  it('safeReturnTo("https://evil.com", "/ru/account") === "/ru/account" — absolute URL rejected', () => {
    expect(safeReturnTo('https://evil.com', '/ru/account')).toBe('/ru/account')
  })

  it('safeReturnTo("//evil.com", "/ru/account") === "/ru/account" — protocol-relative rejected', () => {
    expect(safeReturnTo('//evil.com', '/ru/account')).toBe('/ru/account')
  })

  it('safeReturnTo("/ru/book", "/ru/account") === "/ru/book" — a valid relative path always wins over the fallback', () => {
    expect(safeReturnTo('/ru/book', '/ru/account')).toBe('/ru/book')
  })
})

// ---------------------------------------------------------------------------
// 75-15 Task 1 (tracer): signInWithPassword — localized post-login
// destination (D-04's "RU/AR account path" truth).
// ---------------------------------------------------------------------------
describe('signInWithPassword — localized return-to fallback (D-04, T-75-28)', () => {
  beforeEach(() => {
    mockLocaleRef.value = 'en'
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 5, limit: 5 })
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null })
    mockRedirect.mockClear()
  })

  function formWith(fields: Record<string, string>): FormData {
    const fd = new FormData()
    fd.set('email', 'user@example.com')
    fd.set('password', 'correct-password')
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
  }

  it('locale="ru", no return-to -> redirects to "/ru/account"', async () => {
    await signInWithPassword('ru', null, formWith({}))
    expect(mockRedirect).toHaveBeenCalledWith('/ru/account')
  })

  it('locale="ru", return-to="/ru/book" -> redirects to "/ru/book"', async () => {
    await signInWithPassword('ru', null, formWith({ 'return-to': '/ru/book' }))
    expect(mockRedirect).toHaveBeenCalledWith('/ru/book')
  })

  it('locale="ru", return-to="https://evil.com" -> falls back to "/ru/account" (open-redirect guard intact)', async () => {
    await signInWithPassword('ru', null, formWith({ 'return-to': 'https://evil.com' }))
    expect(mockRedirect).toHaveBeenCalledWith('/ru/account')
  })

  it('locale="ru", return-to="//evil.com" -> falls back to "/ru/account" (protocol-relative rejected)', async () => {
    await signInWithPassword('ru', null, formWith({ 'return-to': '//evil.com' }))
    expect(mockRedirect).toHaveBeenCalledWith('/ru/account')
  })

  it('locale="en", no return-to -> redirects to "/account" (unprefixed default locale, regression backstop)', async () => {
    await signInWithPassword('en', null, formWith({}))
    expect(mockRedirect).toHaveBeenCalledWith('/account')
  })
})
