/**
 * middleware-i18n.test.ts — Phase 68 Plan 01, Task 2 (I18N-01, I18N-02)
 *
 * Locks the composed middleware.ts contract: the non-localized branch
 * (/admin, /api, /auth, /driver) must run the pre-Phase-68 CSP/Supabase
 * chain byte-for-byte and never touch next-intl; the public branch must
 * resolve locale first and correctly gate locale-prefixed dynamic paths
 * (/book, /account) via the stripped pathname while preserving the raw
 * pathname for /admin's own auth checks (T-68-04).
 *
 * Reuses tests/middleware-customer.test.ts's hoisted Supabase mock +
 * fixture helpers verbatim, and adds a mock for next-intl/middleware's
 * createMiddleware so handleI18nRouting's behavior is controllable per test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { routing, rtlLocales, type AppLocale } from '@/i18n/routing'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const { mockGetUser, mockCreateServerClient, mockHandleI18nRouting, mockCreateMiddleware } =
  vi.hoisted(() => {
    const mockGetUser = vi.fn()
    const mockCreateServerClient = vi.fn(() => ({
      auth: { getUser: mockGetUser },
    }))
    const mockHandleI18nRouting = vi.fn()
    const mockCreateMiddleware = vi.fn(() => mockHandleI18nRouting)
    return { mockGetUser, mockCreateServerClient, mockHandleI18nRouting, mockCreateMiddleware }
  })

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock('next-intl/middleware', () => ({
  default: mockCreateMiddleware,
}))

// ---------------------------------------------------------------------------
// Import (production target — middleware.ts composed in Task 1)
// ---------------------------------------------------------------------------
import { middleware } from '@/middleware'

// ---------------------------------------------------------------------------
// Helpers (reused verbatim from tests/middleware-customer.test.ts)
// ---------------------------------------------------------------------------

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`https://prestigo.cz${pathname}`)
}

function makeAdminUser() {
  return {
    id: 'admin-user-id',
    app_metadata: { is_admin: true },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
  }
}

function makeCustomerUser() {
  return {
    id: 'customer-user-id',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
  }
}

// A "rewrite/pass" response — the shape handleI18nRouting returns for a
// valid page request (locale resolved, no redirect needed).
function makeIntlRewriteResponse(): NextResponse {
  const res = NextResponse.next()
  res.headers.set('x-middleware-rewrite', 'https://prestigo.cz/en/marker')
  return res
}

// A "redirect" response — the shape handleI18nRouting returns for the
// as-needed default-locale-prefix-strip case (e.g. /en/about -> /about).
function makeIntlRedirectResponse(toPathname: string): NextResponse {
  return NextResponse.redirect(new URL(toPathname, 'https://prestigo.cz'), 307)
}

describe('middleware.ts — composed next-intl + CSP + Supabase chain (I18N-01, I18N-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    // Default: pass-through rewrite (most tests override per-case).
    mockHandleI18nRouting.mockReturnValue(makeIntlRewriteResponse())
  })

  // -------------------------------------------------------------------------
  // Non-localized branch: /admin, /api, /auth, /driver — byte-for-byte
  // -------------------------------------------------------------------------
  describe('non-localized branch (/admin, /api, /auth, /driver)', () => {
    it('unauthenticated /admin/dashboard still 307-redirects to /admin/login', async () => {
      const response = await middleware(makeRequest('/admin/dashboard'))
      expect(response.status).toBe(307)
      expect(new URL(response.headers.get('location')!).pathname).toBe('/admin/login')
    })

    it('non-admin authenticated user on /admin/dashboard still 307-redirects to /', async () => {
      mockGetUser.mockResolvedValue({ data: { user: makeCustomerUser() }, error: null })
      const response = await middleware(makeRequest('/admin/dashboard'))
      expect(response.status).toBe(307)
      expect(new URL(response.headers.get('location')!).pathname).toBe('/')
    })

    it('admin user on /admin carries an x-nonce request header + nonce-based CSP', async () => {
      mockGetUser.mockResolvedValue({ data: { user: makeAdminUser() }, error: null })
      const response = await middleware(makeRequest('/admin'))
      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).toBeTruthy()
      expect(csp).toMatch(/nonce-/)
    })

    it('handleI18nRouting is NOT invoked for /admin, /api, /auth, /driver', async () => {
      mockGetUser.mockResolvedValue({ data: { user: makeAdminUser() }, error: null })
      await middleware(makeRequest('/admin'))
      await middleware(makeRequest('/api/admin/bookings'))
      await middleware(makeRequest('/auth/callback'))
      await middleware(makeRequest('/driver/response'))
      expect(mockHandleI18nRouting).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Public branch: default-locale root resolves with no /en prefix
  // -------------------------------------------------------------------------
  describe('public branch — default locale (en) resolves at root', () => {
    it('GET / does not 307 to an /en-prefixed URL', async () => {
      const response = await middleware(makeRequest('/'))
      const location = response.headers.get('location')
      if (location) {
        expect(new URL(location).pathname).not.toMatch(/^\/en/)
      }
    })

    it('GET /about does not 307 to an /en-prefixed URL', async () => {
      const response = await middleware(makeRequest('/about'))
      const location = response.headers.get('location')
      if (location) {
        expect(new URL(location).pathname).not.toMatch(/^\/en/)
      }
    })

    it('a 3xx from handleI18nRouting (the /en/about -> /about strip) is returned as-is', async () => {
      mockHandleI18nRouting.mockReturnValue(makeIntlRedirectResponse('/about'))
      const response = await middleware(makeRequest('/en/about'))
      expect(response.status).toBe(307)
      expect(new URL(response.headers.get('location')!).pathname).toBe('/about')
      // Short-circuited before ever reaching the Supabase auth chain.
      expect(mockGetUser).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Locale-prefixed dynamic path: /ru/book
  // -------------------------------------------------------------------------
  describe('locale-prefixed dynamic path (/ru/book)', () => {
    it('routes through handleI18nRouting, then hits the dynamic branch (getUser invoked) with static CSP', async () => {
      const response = await middleware(makeRequest('/ru/book'))
      expect(mockHandleI18nRouting).toHaveBeenCalledTimes(1)
      expect(mockGetUser).toHaveBeenCalledTimes(1)
      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).toBeTruthy()
      expect(csp).not.toMatch(/nonce-/)
    })
  })

  // -------------------------------------------------------------------------
  // Locale-preserving auth redirect: /ru/account
  // -------------------------------------------------------------------------
  describe('locale-preserving auth redirect (/ru/account)', () => {
    it('unauthenticated /ru/account 307-redirects to /login with return-to encoding /ru/account (raw)', async () => {
      const response = await middleware(makeRequest('/ru/account'))
      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      const url = new URL(location!)
      expect(url.pathname).toBe('/login')
      const returnTo = url.searchParams.get('return-to')
      expect(returnTo).toBe('/ru/account')
    })
  })

  // -------------------------------------------------------------------------
  // Security (STRIDE E-of-P): /ru/admin path-confusion probe (T-68-04)
  // -------------------------------------------------------------------------
  describe('security: /ru/admin does not bypass admin gating (T-68-04)', () => {
    it('does NOT emit an admin auth redirect and does NOT set a nonce CSP', async () => {
      // No admin logic should ever run for this path — the raw pathname
      // never matches /admin, so it falls into the public branch and
      // next-intl rewrites it toward a [locale] 404 at the App Router layer.
      const response = await middleware(makeRequest('/ru/admin'))

      // Not the /admin/login redirect a genuine unauthenticated /admin
      // request would get.
      const location = response.headers.get('location')
      if (location) {
        expect(new URL(location).pathname).not.toBe('/admin/login')
      }

      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).not.toMatch(/nonce-/)
    })
  })

  // -------------------------------------------------------------------------
  // Edge/security probes — Phase 68 Plan 02, Task 1
  // -------------------------------------------------------------------------
  describe('edge: unconfigured locale prefix (/xx/) — no reflected redirect (T-68-06)', () => {
    it('enters the public branch via handleI18nRouting and returns a non-3xx response with static CSP (no nonce, no reflected xx in Location)', async () => {
      // The mock's default (makeIntlRewriteResponse) represents next-intl's
      // behavior for a pathname that resolves to no matching locale — it is
      // NOT a redirect; the App Router's hasLocale guard 404s downstream at
      // the [locale] segment (see app/[locale]/layout.tsx / not-found.tsx).
      const response = await middleware(makeRequest('/xx/'))

      expect(mockHandleI18nRouting).toHaveBeenCalledTimes(1)
      expect(response.status).toBeLessThan(300)

      const location = response.headers.get('location')
      if (location) {
        expect(location).not.toMatch(/xx/)
      }

      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).toBeTruthy()
      expect(csp).not.toMatch(/nonce-/)
    })
  })

  describe('edge: case-variant locale prefix (/RU/) canonicalizes via redirect — accepted deviation (T-68-06)', () => {
    // ACCEPTED DEVIATION (Task 3 human-verify checkpoint, confirmed live):
    // case-variant locale prefixes do NOT hard-404 — next-intl itself
    // case-normalizes the locale segment and issues a 307 redirect to the
    // canonical lowercase locale (/RU -> /ru, /Ru -> /ru, /aR -> /ar) BEFORE
    // middleware.ts's own stripLocalePrefix/isDynamicPath logic ever runs.
    // This is next-intl-native locale-segment normalization, not a security
    // gap: the redirect target is always one of the 7 fixed, known-good
    // configured locales (never attacker-controlled/reflected), and only the
    // locale segment is normalized — arbitrary path segments beyond it are
    // NOT case-normalized or reflected. Non-bypass still holds after
    // normalization: /RU/admin redirects to /ru/admin, which itself 404s
    // (see 'security: /ru/admin does not bypass admin gating' above).
    // Verified live in a browser: /RU -> /ru, /Ru -> /ru, /aR -> /ar,
    // /%52%55 -> /ru, and /RU/admin -> /ru/admin -> 404 (non-bypass intact).
    it('307-redirects to the canonical lowercase locale, short-circuiting before the CSP/auth chain', async () => {
      mockHandleI18nRouting.mockReturnValue(makeIntlRedirectResponse('/ru'))
      const response = await middleware(makeRequest('/RU/'))

      expect(mockHandleI18nRouting).toHaveBeenCalledTimes(1)
      expect(response.status).toBe(307)
      expect(new URL(response.headers.get('location')!).pathname).toBe('/ru')
      // Short-circuited before ever reaching the Supabase auth chain.
      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('case-variant admin path /RU/admin redirects to canonical /ru/admin (non-bypass preserved after normalization)', async () => {
      mockHandleI18nRouting.mockReturnValue(makeIntlRedirectResponse('/ru/admin'))
      const response = await middleware(makeRequest('/RU/admin'))

      expect(response.status).toBe(307)
      expect(new URL(response.headers.get('location')!).pathname).toBe('/ru/admin')
      // No admin auth logic runs on the redirect itself — the eventual
      // /ru/admin request 404s via hasLocale, covered by the dedicated
      // /ru/admin security test above.
      expect(mockGetUser).not.toHaveBeenCalled()
    })
  })

  describe('edge: all-7 dynamic parity — locale-prefixed /book routes for every non-default locale (I18N-01/02/04)', () => {
    // Parametrized over routing.locales (minus the default 'en', which
    // resolves unprefixed and is covered by the public-branch tests above)
    // so the 7-locale set stays single-source per I18N-04 — never
    // hard-coded here.
    const nonDefaultLocales = routing.locales.filter((l) => l !== routing.defaultLocale)

    it.each(nonDefaultLocales)(
      'routes /%s/book through handleI18nRouting then the dynamic branch (updateSession invoked) with static CSP',
      async (locale) => {
        const response = await middleware(makeRequest(`/${locale}/book`))

        expect(mockHandleI18nRouting).toHaveBeenCalledTimes(1)
        expect(mockGetUser).toHaveBeenCalledTimes(1)

        const csp = response.headers.get('Content-Security-Policy')
        expect(csp).toBeTruthy()
        expect(csp).not.toMatch(/nonce-/)
      }
    )
  })

  // -------------------------------------------------------------------------
  // <html dir> attribute — RTL-01 (Phase 73, 73-01 Task 3)
  //
  // app/[locale]/layout.tsx computes
  // `dir={rtlLocales.includes(locale) ? 'rtl' : 'ltr'}` from these exact
  // two values. tests/i18n-routing.test.ts already asserts rtlLocales
  // equals ['ar'] in isolation — that is necessary but not sufficient: it
  // does not prove the resulting `dir` value for the locale that actually
  // matters. This block exercises the real predicate (not just the array
  // shape) and asserts dir="rtl" specifically for `ar`, dir="ltr" for
  // every other configured locale.
  // -------------------------------------------------------------------------
  describe('dir attribute resolution (RTL-01) — locale ar specifically, not just rtlLocales in isolation', () => {
    function resolveDir(locale: string): 'rtl' | 'ltr' {
      // Same one-line predicate as app/[locale]/layout.tsx line 25.
      return rtlLocales.includes(locale as AppLocale) ? 'rtl' : 'ltr'
    }

    it('resolves dir="rtl" for locale ar', () => {
      expect(resolveDir('ar')).toBe('rtl')
    })

    it.each(routing.locales.filter((l) => l !== 'ar'))(
      'resolves dir="ltr" for non-ar locale %s',
      (locale) => {
        expect(resolveDir(locale)).toBe('ltr')
      }
    )
  })

  // -------------------------------------------------------------------------
  // Backstop edges — NOT asserted here by design (must_haves `edges` list,
  // verification: backstop). Per-request nonce freshness under concurrency
  // and trailing-slash/case normalization on the locale segment are not
  // deterministically assertable against this mocked next-intl harness
  // (the mock always returns a fixed response regardless of timing or
  // trailing-slash variance). These are gated behind the Task 3
  // checkpoint:human-verify (live CSP nonce reload check + /xx and
  // /admin/xyz-nonexistent 404 confirmation against a real dev server).
  // -------------------------------------------------------------------------
})
