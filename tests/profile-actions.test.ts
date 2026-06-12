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
  mockEq,
  mockUpdate,
  mockFrom,
  mockRevalidatePath,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockEq = vi.fn().mockResolvedValue({ error: null })
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({
    update: mockUpdate,
  }))
  const mockRevalidatePath = vi.fn()

  return {
    mockGetUser,
    mockEq,
    mockUpdate,
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
    // Reset eq mock to resolve success by default
    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ update: mockUpdate })
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

    it('calls from("customer_profiles").update() with full_name and phone', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser())

      const formData = makeFormData({
        full_name: 'John Doe',
        phone: '+420 123 456 789',
        account_type: 'personal',
      })

      await updateProfile(null, formData)

      expect(mockFrom).toHaveBeenCalledWith('customer_profiles')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'John Doe',
          phone: '+420 123 456 789',
        })
      )
    })

    it('scopes the update to the session user via .eq("user_id", userId)', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({
        full_name: 'Jane',
        phone: '+420 999 888 777',
        account_type: 'personal',
      })

      await updateProfile(null, formData)

      expect(mockEq).toHaveBeenCalledWith('user_id', 'session-user-uuid')
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
    it('uses session user id for .eq(), never the forged user_id from FormData', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      // Attempt to inject a different user_id via formData
      const formData = makeFormData({
        user_id: 'victim-uuid',       // forged — must be stripped
        full_name: 'Attacker',
        phone: '+1 555 000 000',
        account_type: 'personal',
      })

      await updateProfile(null, formData)

      // .eq() must be called with the SESSION user id, not the forged value
      expect(mockEq).toHaveBeenCalledWith('user_id', 'session-user-uuid')
      expect(mockEq).not.toHaveBeenCalledWith('user_id', 'victim-uuid')
    })

    it('does NOT pass a caller-supplied user_id in the update object (mass-assignment guard)', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({
        user_id: 'victim-uuid',
        full_name: 'Attacker',
        account_type: 'personal',
      })

      await updateProfile(null, formData)

      // The object passed to update() must NOT contain user_id from FormData
      const updateArg = mockUpdate.mock.calls[0]?.[0] ?? {}
      expect(updateArg).not.toHaveProperty('user_id')
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

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          account_type: 'corporate',
          company_name: 'Acme s.r.o.',
          ico: '12345678',
          vat_id: 'CZ12345678',
        })
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
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ account_type: 'personal' })
      )
    })
  })
})
