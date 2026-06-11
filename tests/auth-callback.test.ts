/**
 * auth-callback.test.ts — Wave-0 test scaffold
 * Phase 57 — Customer Auth Foundation
 *
 * Covers: AUTH-06
 *
 * NOTE: This file is intentionally RED (failing) until Plan 02 implements
 * @/app/auth/callback/route. The test suite encodes the full behavioral
 * contract for the OAuth code exchange + email confirm + open-redirect guard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const {
  mockExchangeCodeForSession,
  mockVerifyOtp,
  mockUpsert,
  mockFrom,
} = vi.hoisted(() => {
  const mockExchangeCodeForSession = vi.fn()
  const mockVerifyOtp = vi.fn()
  const mockUpsert = vi.fn()
  const mockFrom = vi.fn(() => ({ upsert: mockUpsert }))

  return {
    mockExchangeCodeForSession,
    mockVerifyOtp,
    mockUpsert,
    mockFrom,
  }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      verifyOtp: mockVerifyOtp,
    },
    from: mockFrom,
  }),
}))

// ---------------------------------------------------------------------------
// Import (from Plan 02 module — not yet implemented; tests are RED)
// ---------------------------------------------------------------------------
import { GET } from '@/app/auth/callback/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string): NextRequest {
  return new NextRequest(url)
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GET /auth/callback (AUTH-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // OAuth code exchange path
  // -------------------------------------------------------------------------
  describe('OAuth code exchange path', () => {
    it('valid ?code= calls exchangeCodeForSession, upserts customer_profiles with ignoreDuplicates, then redirects to /account', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-oauth-uuid' } },
        error: null,
      })
      mockUpsert.mockResolvedValue({ error: null })

      const request = makeRequest('https://prestigo.cz/auth/callback?code=valid-oauth-code')
      const response = await GET(request)

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-oauth-code')
      expect(mockFrom).toHaveBeenCalledWith('customer_profiles')
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-oauth-uuid' }),
        expect.objectContaining({ onConflict: 'user_id', ignoreDuplicates: true })
      )
      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      expect(new URL(location!).pathname).toBe('/account')
    })

    it('valid ?code= with ?return-to=/booking/confirm redirects to /booking/confirm after exchange', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-return-uuid' } },
        error: null,
      })
      mockUpsert.mockResolvedValue({ error: null })

      const request = makeRequest(
        'https://prestigo.cz/auth/callback?code=valid-code&return-to=%2Fbooking%2Fconfirm'
      )
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(new URL(location!).pathname).toBe('/booking/confirm')
    })

    it('exchangeCodeForSession failure redirects to /login?error=auth_callback_error', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: null },
        error: { message: 'invalid code' },
      })

      const request = makeRequest('https://prestigo.cz/auth/callback?code=bad-code')
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      const url = new URL(location!)
      expect(url.pathname).toBe('/login')
      expect(url.searchParams.get('error')).toBe('auth_callback_error')
    })
  })

  // -------------------------------------------------------------------------
  // Email confirmation (token_hash) path
  // -------------------------------------------------------------------------
  describe('email confirmation / token_hash path', () => {
    it('valid token_hash + type=signup calls verifyOtp then upserts customer_profiles then redirects to /account', async () => {
      mockVerifyOtp.mockResolvedValue({
        data: { user: { id: 'user-email-confirm-uuid' } },
        error: null,
      })
      mockUpsert.mockResolvedValue({ error: null })

      const request = makeRequest(
        'https://prestigo.cz/auth/callback?token_hash=abc123&type=signup'
      )
      const response = await GET(request)

      expect(mockVerifyOtp).toHaveBeenCalledWith(
        expect.objectContaining({ token_hash: 'abc123', type: 'signup' })
      )
      expect(mockFrom).toHaveBeenCalledWith('customer_profiles')
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-email-confirm-uuid' }),
        expect.objectContaining({ onConflict: 'user_id', ignoreDuplicates: true })
      )
      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(new URL(location!).pathname).toBe('/account')
    })

    it('verifyOtp failure redirects to /login?error=auth_callback_error', async () => {
      mockVerifyOtp.mockResolvedValue({
        data: { user: null },
        error: { message: 'expired token' },
      })

      const request = makeRequest(
        'https://prestigo.cz/auth/callback?token_hash=expired&type=signup'
      )
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(new URL(location!).pathname).toBe('/login')
      expect(new URL(location!).searchParams.get('error')).toBe('auth_callback_error')
    })
  })

  // -------------------------------------------------------------------------
  // Open-redirect guard
  // -------------------------------------------------------------------------
  describe('open-redirect protection', () => {
    it('return-to=https://evil.com is rejected — redirect falls back to /account', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-safe-uuid' } },
        error: null,
      })
      mockUpsert.mockResolvedValue({ error: null })

      const request = makeRequest(
        'https://prestigo.cz/auth/callback?code=valid&return-to=https%3A%2F%2Fevil.com%2Fsteal'
      )
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      // Must NOT redirect to evil.com
      expect(location).not.toMatch(/evil\.com/)
      // Must redirect to /account (safe fallback)
      expect(new URL(location!).pathname).toBe('/account')
    })

    it('return-to=//evil.com (protocol-relative) is rejected — falls back to /account', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-safe2-uuid' } },
        error: null,
      })
      mockUpsert.mockResolvedValue({ error: null })

      const request = makeRequest(
        'https://prestigo.cz/auth/callback?code=valid2&return-to=%2F%2Fevil.com'
      )
      const response = await GET(request)

      const location = response.headers.get('location')
      expect(location).not.toMatch(/evil\.com/)
      expect(new URL(location!).pathname).toBe('/account')
    })
  })

  // -------------------------------------------------------------------------
  // No code and no token_hash
  // -------------------------------------------------------------------------
  describe('missing code and token_hash', () => {
    it('GET with no code and no token_hash redirects to /login?error=auth_callback_error', async () => {
      const request = makeRequest('https://prestigo.cz/auth/callback')
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      const url = new URL(location!)
      expect(url.pathname).toBe('/login')
      expect(url.searchParams.get('error')).toBe('auth_callback_error')
    })
  })
})
