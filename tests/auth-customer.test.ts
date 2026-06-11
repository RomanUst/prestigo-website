/**
 * auth-customer.test.ts — Wave-0 test scaffold
 * Phase 57 — Customer Auth Foundation
 *
 * Covers: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-07, ACCT-04
 *
 * NOTE: This file is intentionally RED (failing) until Plan 02 implements
 * the modules imported below. The test suite encodes the full behavioral
 * contract for Plan 02 to satisfy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const {
  mockSignInWithOtp,
  mockSignInWithPassword,
  mockSignInWithOAuth,
  mockSignUp,
  mockSignOut,
  mockUpsert,
  mockInsert,
  mockFrom,
  mockCheckRateLimit,
  mockRedirect,
} = vi.hoisted(() => {
  const mockSignInWithOtp = vi.fn()
  const mockSignInWithPassword = vi.fn()
  const mockSignInWithOAuth = vi.fn()
  const mockSignUp = vi.fn()
  const mockSignOut = vi.fn()
  const mockUpsert = vi.fn()
  const mockInsert = vi.fn()
  const mockFrom = vi.fn(() => ({ upsert: mockUpsert, insert: mockInsert }))

  const mockCheckRateLimit = vi.fn()
  const mockRedirect = vi.fn()

  return {
    mockSignInWithOtp,
    mockSignInWithPassword,
    mockSignInWithOAuth,
    mockSignUp,
    mockSignOut,
    mockUpsert,
    mockInsert,
    mockFrom,
    mockCheckRateLimit,
    mockRedirect,
  }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
      signUp: mockSignUp,
      signOut: mockSignOut,
    },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

// ---------------------------------------------------------------------------
// Imports (from Plan 02 modules — not yet implemented; tests are RED)
// ---------------------------------------------------------------------------
import {
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
  customerSignOut,
} from '@/app/login/actions'

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('auth/customer — server actions (AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-07, ACCT-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // AUTH-01 — Magic-link (sendMagicLink)
  // -------------------------------------------------------------------------
  describe('AUTH-01: sendMagicLink', () => {
    it('calls signInWithOtp with emailRedirectTo ending in /auth/callback and returns { success: true }', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true })
      mockSignInWithOtp.mockResolvedValue({ error: null })

      const formData = new FormData()
      formData.set('email', 'test@example.com')

      const result = await sendMagicLink(null, formData)

      expect(mockSignInWithOtp).toHaveBeenCalledOnce()
      const call = mockSignInWithOtp.mock.calls[0][0]
      expect(call.email).toBe('test@example.com')
      expect(call.options?.emailRedirectTo).toMatch(/\/auth\/callback$/)
      expect(result).toEqual({ success: true })
    })

    it('returns an error object when Supabase returns an auth error', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true })
      mockSignInWithOtp.mockResolvedValue({
        error: { message: 'Email rate limit exceeded' },
      })

      const formData = new FormData()
      formData.set('email', 'test@example.com')

      const result = await sendMagicLink(null, formData)

      expect(result).toHaveProperty('error')
      expect(typeof (result as { error: string }).error).toBe('string')
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-01 — Password sign-in (signInWithPassword)
  // -------------------------------------------------------------------------
  describe('AUTH-01: signInWithPassword', () => {
    it('returns { error: "Invalid email or password." } when Supabase returns an auth error', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true })
      mockSignInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Invalid login credentials' },
      })

      const formData = new FormData()
      formData.set('email', 'user@example.com')
      formData.set('password', 'wrongpassword')

      const result = await signInWithPassword(null, formData)

      expect(result).toEqual({ error: 'Invalid email or password.' })
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-01 — Rate limiting
  // -------------------------------------------------------------------------
  describe('AUTH-01: rate limiting on /login', () => {
    it('the 6th call within the window returns a "Too many attempts" error when checkRateLimit denies', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false })
      mockSignInWithOtp.mockResolvedValue({ error: null })

      const formData = new FormData()
      formData.set('email', 'rate@example.com')

      const result = await sendMagicLink(null, formData)

      // When rate-limited, the action must NOT call signInWithOtp
      expect(mockSignInWithOtp).not.toHaveBeenCalled()
      // Must return a meaningful rate-limit error
      expect(result).toHaveProperty('error')
      const errorText = (result as { error: string }).error.toLowerCase()
      expect(errorText).toMatch(/too many|rate limit|try again/i)
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-02 — Google OAuth
  // -------------------------------------------------------------------------
  describe('AUTH-02: signInWithOAuth Google', () => {
    it('signInWithOAuth is called with provider google and redirectTo path /auth/callback', async () => {
      mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/auth?...' }, error: null })

      // The OAuthButtons component calls createBrowserClient.auth.signInWithOAuth.
      // We verify the server action / callback URL builder constructs the correct
      // redirectTo. Since this is a client-side call, we test the helper that
      // constructs the OAuth options (exported from @/app/login/actions or
      // @/components/auth/OAuthButtons as buildOAuthOptions).
      // If the export shape changes in Plan 02, update the import here.
      const { buildOAuthOptions } = await import('@/app/login/actions')

      const opts = buildOAuthOptions('google', 'https://prestigo.cz')
      expect(opts.provider).toBe('google')
      expect(new URL(opts.options.redirectTo).pathname).toBe('/auth/callback')
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-03 — Apple OAuth
  // -------------------------------------------------------------------------
  describe('AUTH-03: signInWithOAuth Apple', () => {
    it('signInWithOAuth is called with provider apple and redirectTo path /auth/callback', async () => {
      const { buildOAuthOptions } = await import('@/app/login/actions')

      const opts = buildOAuthOptions('apple', 'https://prestigo.cz')
      expect(opts.provider).toBe('apple')
      expect(new URL(opts.options.redirectTo).pathname).toBe('/auth/callback')
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-04 — signUpWithPassword upserts customer_profiles
  // -------------------------------------------------------------------------
  describe('AUTH-04: signUpWithPassword upserts customer_profiles', () => {
    it('upserts a customer_profiles row with account_type "personal" when no type is provided', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true })
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'user-uuid-personal' } },
        error: null,
      })
      mockUpsert.mockResolvedValue({ error: null })

      const formData = new FormData()
      formData.set('email', 'personal@example.com')
      formData.set('password', 'SecurePass1!')

      await signUpWithPassword(null, formData)

      expect(mockFrom).toHaveBeenCalledWith('customer_profiles')
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-uuid-personal',
          account_type: 'personal',
        }),
        expect.objectContaining({ onConflict: 'user_id' })
      )
    })

    it('passes company_name when account_type is "corporate"', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true })
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'user-uuid-corporate' } },
        error: null,
      })
      mockUpsert.mockResolvedValue({ error: null })

      const formData = new FormData()
      formData.set('email', 'corp@example.com')
      formData.set('password', 'SecurePass1!')
      formData.set('account_type', 'corporate')
      formData.set('company_name', 'Acme s.r.o.')

      await signUpWithPassword(null, formData)

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-uuid-corporate',
          account_type: 'corporate',
          company_name: 'Acme s.r.o.',
        }),
        expect.objectContaining({ onConflict: 'user_id' })
      )
    })
  })

  // -------------------------------------------------------------------------
  // AUTH-07 — customerSignOut
  // -------------------------------------------------------------------------
  describe('AUTH-07: customerSignOut', () => {
    it('calls signOut() then redirects to /', async () => {
      mockSignOut.mockResolvedValue({ error: null })
      // redirect() throws (Next.js navigation throws on redirect)
      mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
      })

      await expect(customerSignOut()).rejects.toThrow('NEXT_REDIRECT')

      expect(mockSignOut).toHaveBeenCalledOnce()
      expect(mockRedirect).toHaveBeenCalledWith('/')
    })
  })

  // -------------------------------------------------------------------------
  // ACCT-04 — bookings insert with user_id populated
  // -------------------------------------------------------------------------
  describe('ACCT-04: bookings insert with user_id', () => {
    it('a booking insert that includes user_id is passed to Supabase from(bookings).insert()', async () => {
      // This test verifies that the booking row builder / saveBooking does NOT
      // strip user_id when it is provided, so logged-in bookings can be linked.
      // The insert call should receive a row containing user_id.
      const { saveBookingWithUserId } = await import('@/app/login/actions')

      mockInsert.mockResolvedValue({ data: [{ id: 'booking-uuid' }], error: null })

      const bookingRow = {
        booking_reference: 'PRG-TEST-001',
        user_id: 'user-uuid-booking',
        amount_czk: 1500,
      }
      await saveBookingWithUserId(bookingRow)

      expect(mockFrom).toHaveBeenCalledWith('bookings')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-uuid-booking' })
      )
    })
  })
})
