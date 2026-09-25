/**
 * middleware-customer.test.ts — Wave-0 test scaffold
 * Phase 57 — Customer Auth Foundation
 *
 * Covers: AUTH-05
 *
 * NOTE: This file is intentionally RED (failing) until Plan 02 modifies
 * @/lib/supabase/middleware to add the customer-route gating branches.
 * The test encodes the full behavioral contract for the middleware update.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const { mockGetUser, mockCreateServerClient } = vi.hoisted(() => {
  const mockGetUser = vi.fn()

  const mockCreateServerClient = vi.fn(() => ({
    auth: { getUser: mockGetUser },
  }))

  return { mockGetUser, mockCreateServerClient }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

// ---------------------------------------------------------------------------
// Import (existing module — will be MODIFIED in Plan 02; tests are RED
// because the new /account gating and non-admin /admin redirect branches
// don't exist yet in updateSession)
// ---------------------------------------------------------------------------
import { updateSession } from '@/lib/supabase/middleware'

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('updateSession middleware — customer route gating (AUTH-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // AUTH-05: Non-admin authenticated user accessing /admin/* → redirect to /
  // -------------------------------------------------------------------------
  describe('non-admin authenticated user on /admin/* routes', () => {
    it('authenticated user WITHOUT app_metadata.is_admin requesting /admin/dashboard is redirected to /', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: makeCustomerUser() },
        error: null,
      })

      const request = makeRequest('/admin/dashboard')
      const response = await updateSession(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      expect(new URL(location!).pathname).toBe('/')
    })

    it('authenticated user WITHOUT is_admin requesting /admin/bookings is redirected to /', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: makeCustomerUser() },
        error: null,
      })

      const request = makeRequest('/admin/bookings')
      const response = await updateSession(request)

      expect(response.status).toBe(307)
      expect(new URL(response.headers.get('location')!).pathname).toBe('/')
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-05: Admin user on /admin remains unchanged (no regression)
  // -------------------------------------------------------------------------
  describe('admin user on /admin routes — existing behavior intact', () => {
    it('admin user (app_metadata.is_admin true) requesting /admin is NOT redirected to /', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: makeAdminUser() },
        error: null,
      })

      const request = makeRequest('/admin')
      const response = await updateSession(request)

      // Must NOT redirect to /
      const location = response.headers.get('location')
      if (location) {
        expect(new URL(location).pathname).not.toBe('/')
      } else {
        // 200 / NextResponse.next() is also correct for an admin on /admin
        expect(response.status).not.toBe(307)
      }
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-05: Unauthenticated user on /admin/* → still redirect to /admin/login
  // -------------------------------------------------------------------------
  describe('unauthenticated user on /admin/* — existing redirect preserved', () => {
    it('unauthenticated user requesting /admin/dashboard is still redirected to /admin/login', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = makeRequest('/admin/dashboard')
      const response = await updateSession(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(new URL(location!).pathname).toBe('/admin/login')
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-05: Unauthenticated user on /account/* → redirect to /login?return-to=
  // -------------------------------------------------------------------------
  describe('unauthenticated user on /account/* routes', () => {
    it('unauthenticated user requesting /account redirects to /login?return-to=%2Faccount', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = makeRequest('/account')
      const response = await updateSession(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      const url = new URL(location!)
      expect(url.pathname).toBe('/login')
      const returnTo = url.searchParams.get('return-to')
      expect(returnTo).toBe('/account')
    })

    it('unauthenticated user requesting /account/profile redirects to /login?return-to=%2Faccount%2Fprofile', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = makeRequest('/account/profile')
      const response = await updateSession(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      const url = new URL(location!)
      expect(url.pathname).toBe('/login')
      const returnTo = decodeURIComponent(url.searchParams.get('return-to') ?? '')
      expect(returnTo).toBe('/account/profile')
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-05: Authenticated customer on /account/* → NOT redirected
  // -------------------------------------------------------------------------
  describe('authenticated customer on /account/* routes', () => {
    it('authenticated customer requesting /account is NOT redirected to /login', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: makeCustomerUser() },
        error: null,
      })

      const request = makeRequest('/account')
      const response = await updateSession(request)

      const location = response.headers.get('location')
      if (location) {
        expect(new URL(location).pathname).not.toBe('/login')
      } else {
        expect(response.status).not.toBe(307)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 75-15 (D-04): unauthenticated /account/* under a non-EN locale prefix
  // redirects to that SAME locale's /login (not the English one), with the
  // RAW (locale-prefixed) pathname preserved in return-to.
  //
  // updateSession()'s 4th arg (pathnameOverride) is the locale-STRIPPED
  // pathname middleware.ts's public branch passes for the `/account` gate
  // CHECK (stripLocalePrefix(pathname, routing.locales)) — mirroring that
  // exact call shape here, while `request.nextUrl.pathname` (used for both
  // the new locale derivation AND the return-to value) stays the RAW,
  // locale-prefixed URL, matching production.
  // -------------------------------------------------------------------------
  describe('75-15 (D-04): locale-aware /login redirect target', () => {
    it('unauthenticated /ru/account/trips redirects to /ru/login?return-to=%2Fru%2Faccount%2Ftrips', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      const request = makeRequest('/ru/account/trips')
      const response = await updateSession(request, undefined, undefined, '/account/trips')

      expect(response.status).toBe(307)
      const url = new URL(response.headers.get('location')!)
      expect(url.pathname).toBe('/ru/login')
      expect(decodeURIComponent(url.searchParams.get('return-to') ?? '')).toBe(
        '/ru/account/trips'
      )
    })

    it('unauthenticated /ar/account redirects to /ar/login?return-to=%2Far%2Faccount', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      const request = makeRequest('/ar/account')
      const response = await updateSession(request, undefined, undefined, '/account')

      expect(response.status).toBe(307)
      const url = new URL(response.headers.get('location')!)
      expect(url.pathname).toBe('/ar/login')
      expect(decodeURIComponent(url.searchParams.get('return-to') ?? '')).toBe('/ar/account')
    })

    it('unauthenticated /account (no locale prefix, EN) still redirects to /login — regression backstop', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      const request = makeRequest('/account')
      const response = await updateSession(request)

      expect(response.status).toBe(307)
      const url = new URL(response.headers.get('location')!)
      expect(url.pathname).toBe('/login')
      expect(decodeURIComponent(url.searchParams.get('return-to') ?? '')).toBe('/account')
    })
  })
})
