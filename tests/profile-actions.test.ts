/**
 * profile-actions.test.ts — Wave-0 test scaffold
 * Phase 58 — Sign-in UI + Account Dashboard
 *
 * Covers: ACCT-02, ACCT-03
 *
 * NOTE: This file is intentionally RED (failing) until Plan 04 creates
 * app/account/actions.ts. The module import fails at this stage — that is
 * the intended RED result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const {
  mockGetUser,
  mockUpsert,
  mockFrom,
  mockRevalidatePath,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockUpsert = vi.fn().mockResolvedValue({ error: null })
  const mockFrom = vi.fn(() => ({
    upsert: mockUpsert,
  }))
  const mockRevalidatePath = vi.fn()

  return {
    mockGetUser,
    mockUpsert,
    mockFrom,
    mockRevalidatePath,
  }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

// ---------------------------------------------------------------------------
// Import (does not exist yet → RED)
// ---------------------------------------------------------------------------
import { updateProfile } from '@/app/account/actions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuthenticatedUser(id = 'session-user-uuid') {
  return {
    data: {
      user: {
        id,
        email: 'user@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2026-01-01T00:00:00Z',
      },
    },
  }
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value)
  }
  return fd
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('updateProfile — server action (ACCT-02, ACCT-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset upsert mock to resolve success by default
    mockUpsert.mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert: mockUpsert })
  })

  // -------------------------------------------------------------------------
  // ACCT-02: Successful profile update
  // -------------------------------------------------------------------------
  describe('ACCT-02: success path', () => {
    it('returns { success: true } when authenticated user updates profile', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser())

      const formData = makeFormData({
        full_name: 'John Doe',
        phone: '+420 123 456 789',
        account_type: 'personal',
      })

      const result = await updateProfile(null, formData)

      expect(result).toEqual({ success: true })
    })

    it('calls from("customer_profiles").upsert() with full_name and phone', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser())

      const formData = makeFormData({
        full_name: 'John Doe',
        phone: '+420 123 456 789',
        account_type: 'personal',
      })

      await updateProfile(null, formData)

      expect(mockFrom).toHaveBeenCalledWith('customer_profiles')
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'John Doe',
          phone: '+420 123 456 789',
        }),
        expect.objectContaining({ onConflict: 'user_id' })
      )
    })

    it('scopes the upsert to the session user via user_id in the payload', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({
        full_name: 'Jane',
        phone: '+420 999 888 777',
        account_type: 'personal',
      })

      await updateProfile(null, formData)

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'session-user-uuid' }),
        expect.objectContaining({ onConflict: 'user_id' })
      )
    })
  })

  // -------------------------------------------------------------------------
  // ACCT-02: Unauthenticated guard
  // -------------------------------------------------------------------------
  describe('ACCT-02: unauthenticated guard', () => {
    it('returns { error: "Not authenticated." } when no session', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const formData = makeFormData({
        full_name: 'Attacker',
        phone: '+1 000 000 000',
        account_type: 'personal',
      })

      const result = await updateProfile(null, formData)

      expect(result).toEqual({ error: 'Not authenticated.' })
    })

    it('does NOT call from() when unauthenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const formData = makeFormData({ full_name: 'Attacker', account_type: 'personal' })
      await updateProfile(null, formData)

      expect(mockFrom).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // ACCT-02/ACCT-03: SECURITY — IDOR / mass-assignment prevention
  // -------------------------------------------------------------------------
  describe('SECURITY: IDOR / mass-assignment guard (T-58-01)', () => {
    it('uses session user id in the upsert payload, never the forged user_id from FormData', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      // Attempt to inject a different user_id via formData
      const formData = makeFormData({
        user_id: 'victim-uuid',       // forged — must be stripped
        full_name: 'Attacker',
        phone: '+1 555 000 000',
        account_type: 'personal',
      })

      await updateProfile(null, formData)

      // The upsert payload's user_id must be the SESSION user id, not the forged value
      const upsertArg = mockUpsert.mock.calls[0]?.[0] ?? {}
      expect(upsertArg.user_id).toBe('session-user-uuid')
      expect(upsertArg.user_id).not.toBe('victim-uuid')
    })

    it('does NOT pass the caller-supplied FormData user_id through to the upsert object (mass-assignment guard)', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({
        user_id: 'victim-uuid',
        full_name: 'Attacker',
        account_type: 'personal',
      })

      await updateProfile(null, formData)

      // user_id in the upsert payload must come from the session, never from FormData
      const upsertArg = mockUpsert.mock.calls[0]?.[0] ?? {}
      expect(upsertArg.user_id).toBe('session-user-uuid')
    })
  })

  // -------------------------------------------------------------------------
  // ACCT-03: Corporate fields update
  // -------------------------------------------------------------------------
  describe('ACCT-03: corporate account fields', () => {
    it('includes company_name, ico, vat_id in update when account_type=corporate', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser())

      const formData = makeFormData({
        full_name: 'Corp Admin',
        phone: '+420 111 222 333',
        account_type: 'corporate',
        company_name: 'Acme s.r.o.',
        ico: '12345678',
        vat_id: 'CZ12345678',
      })

      await updateProfile(null, formData)

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          account_type: 'corporate',
          company_name: 'Acme s.r.o.',
          ico: '12345678',
          vat_id: 'CZ12345678',
        }),
        expect.objectContaining({ onConflict: 'user_id' })
      )
    })

    it('accepts account_type=personal (no corporate fields required)', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser())

      const formData = makeFormData({
        full_name: 'Personal User',
        phone: '+420 444 555 666',
        account_type: 'personal',
      })

      const result = await updateProfile(null, formData)

      expect(result).toEqual({ success: true })
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ account_type: 'personal' }),
        expect.objectContaining({ onConflict: 'user_id' })
      )
    })
  })
})
