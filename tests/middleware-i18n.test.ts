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
})
