/**
 * passenger-actions.test.ts — Wave-0 test scaffold
 * Phase 58 — Sign-in UI + Account Dashboard
 *
 * Covers: ACCT-02
 *
 * NOTE: This file is intentionally RED (failing) until Plan 04 creates
 * app/account/actions.ts. The module import fails at this stage — that is
 * the intended RED result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import enMessages from '../messages/en.json'

// ---------------------------------------------------------------------------
// next-intl/server: force the real react-server build (Phase 70, Pattern E).
//
// The passenger actions now resolve error strings via
// getTranslations({ namespace: 'Errors', locale }). Vitest has no RSC
// "react-server" export condition, so redirect both `next-intl/server` and
// `next-intl/config` (aliased to i18n/request.ts by createNextIntlPlugin in the
// real build) to the real react-server impl + messages/en.json, exercising the
// live Errors catalog end-to-end.
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
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const {
  mockGetUser,
  mockEqDelete,
  mockEqUpdate,
  mockDelete,
  mockUpdate,
  mockInsert,
  mockFrom,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn()

  // Separate eq mocks for delete and update chains so we can track calls cleanly
  const mockEqDelete = vi.fn().mockResolvedValue({ error: null })
  const mockEqUpdate = vi.fn().mockResolvedValue({ error: null })

  const mockDelete = vi.fn(() => ({ eq: mockEqDelete }))
  const mockUpdate = vi.fn(() => ({ eq: mockEqUpdate }))
  const mockInsert = vi.fn().mockResolvedValue({ error: null })

  const mockFrom = vi.fn(() => ({
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  }))

  return {
    mockGetUser,
    mockEqDelete,
    mockEqUpdate,
    mockDelete,
    mockUpdate,
    mockInsert,
    mockFrom,
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
  revalidatePath: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import (does not exist yet → RED)
// ---------------------------------------------------------------------------
import { addPassenger, updatePassenger, deletePassenger } from '@/app/[locale]/account/actions'

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

describe('Passenger server actions — addPassenger, updatePassenger, deletePassenger (ACCT-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mocks to successful defaults.
    // mockEqDelete supports chaining: .eq(id).eq(user_id).
    // It returns an object with { eq: mockEqDelete } so the chain can continue,
    // AND it is thenable (has a .then that resolves { error: null }) so the last
    // .eq() in the chain can be awaited.
    mockEqDelete.mockReturnValue({
      eq: mockEqDelete,
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    })
    // mockEqUpdate supports the same double-eq pattern for updatePassenger.
    mockEqUpdate.mockReturnValue({
      eq: mockEqUpdate,
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    })
    mockInsert.mockResolvedValue({ error: null })
    mockDelete.mockReturnValue({ eq: mockEqDelete })
    mockUpdate.mockReturnValue({ eq: mockEqUpdate })
    mockFrom.mockReturnValue({
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    })
  })

  // -------------------------------------------------------------------------
  // ACCT-02: addPassenger — success path
  // -------------------------------------------------------------------------
  describe('addPassenger', () => {
    it('inserts a saved_passengers row with user_id from session and submitted full_name/phone', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({
        full_name: 'Jane Smith',
        phone: '+420 777 888 999',
      })

      const result = await addPassenger('en', null, formData)

      expect(result).toEqual({ success: true })
      expect(mockFrom).toHaveBeenCalledWith('saved_passengers')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'session-user-uuid',
          full_name: 'Jane Smith',
          phone: '+420 777 888 999',
        })
      )
    })

    it('returns { error: "Not authenticated." } when unauthenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const formData = makeFormData({ full_name: 'Ghost', phone: '+1 000 000 000' })

      const result = await addPassenger('en', null, formData)

      // Errors round-trip: byte-identical to the prior literal AND sourced from
      // the live Errors catalog (a future EN copy edit fails here, not silently).
      expect(result).toEqual({ error: 'Not authenticated.' })
      expect(result.error).toBe(enMessages.Errors.notAuthenticated)
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('returns the exact "Full name is required." string from the Errors catalog', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({ full_name: '   ', phone: '+420 777 888 999' })

      const result = await addPassenger('en', null, formData)

      expect(result).toEqual({ error: 'Full name is required.' })
      expect(result.error).toBe(enMessages.Errors.fullNameRequired)
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('does NOT trust user_id from FormData (ownership from session only)', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({
        user_id: 'victim-uuid',      // forged — must be stripped
        full_name: 'Attacker',
        phone: '+1 555 000 000',
      })

      await addPassenger('en', null, formData)

      // Insert must use the session user_id, never the forged value
      const insertArg = mockInsert.mock.calls[0]?.[0] ?? {}
      expect(insertArg.user_id).toBe('session-user-uuid')
      expect(insertArg.user_id).not.toBe('victim-uuid')
    })
  })

  // -------------------------------------------------------------------------
  // ACCT-02: deletePassenger — ownership safety
  // -------------------------------------------------------------------------
  describe('deletePassenger', () => {
    it('scopes delete by BOTH the passenger id AND session user_id', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({ id: 'passenger-row-uuid' })

      await deletePassenger('en', null, formData)

      expect(mockFrom).toHaveBeenCalledWith('saved_passengers')
      expect(mockDelete).toHaveBeenCalled()
      // Must scope by BOTH id AND user_id to prevent cross-user deletion
      // The eq chain is called twice: once for id, once for user_id
      const eqCalls = mockEqDelete.mock.calls
      const hasIdScope = eqCalls.some(
        ([col, val]) => col === 'id' && val === 'passenger-row-uuid'
      )
      const hasUserScope = eqCalls.some(
        ([col, val]) => col === 'user_id' && val === 'session-user-uuid'
      )
      expect(hasIdScope).toBe(true)
      expect(hasUserScope).toBe(true)
    })

    it('returns { error: "Not authenticated." } when unauthenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const formData = makeFormData({ id: 'passenger-row-uuid' })

      const result = await deletePassenger('en', null, formData)

      expect(result).toEqual({ error: 'Not authenticated.' })
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('does NOT allow a forged user_id in FormData to widen the delete scope', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      // Attacker supplies a different user_id hoping to delete other users' passengers
      const formData = makeFormData({
        id: 'passenger-row-uuid',
        user_id: 'victim-uuid',       // forged — must be ignored
      })

      await deletePassenger('en', null, formData)

      // All user_id scopes in eq calls must be the session user id
      const eqCalls = mockEqDelete.mock.calls
      const userIdCalls = eqCalls.filter(([col]) => col === 'user_id')
      for (const [, val] of userIdCalls) {
        expect(val).toBe('session-user-uuid')
        expect(val).not.toBe('victim-uuid')
      }
    })
  })

  // -------------------------------------------------------------------------
  // ACCT-02: updatePassenger — only explicit fields updated (no raw FormData spread)
  // -------------------------------------------------------------------------
  describe('updatePassenger', () => {
    it('updates only explicitly named fields (no raw FormData spread)', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({
        id: 'passenger-row-uuid',
        full_name: 'Updated Name',
        phone: '+420 111 000 000',
        // extra field that must NOT end up in the update object
        evil_field: 'injected',
      })

      await updatePassenger('en', null, formData)

      expect(mockFrom).toHaveBeenCalledWith('saved_passengers')
      const updateArg = mockUpdate.mock.calls[0]?.[0] ?? {}

      // Only named fields should be present
      expect(updateArg).toHaveProperty('full_name', 'Updated Name')
      expect(updateArg).toHaveProperty('phone', '+420 111 000 000')
      // Evil field must NOT be present in the update
      expect(updateArg).not.toHaveProperty('evil_field')
      // user_id must NOT be in the update object
      expect(updateArg).not.toHaveProperty('user_id')
    })

    it('scopes the update to the passenger id AND session user_id', async () => {
      mockGetUser.mockResolvedValue(makeAuthenticatedUser('session-user-uuid'))

      const formData = makeFormData({
        id: 'passenger-row-uuid',
        full_name: 'Updated',
        phone: '+420 000 000 000',
      })

      await updatePassenger('en', null, formData)

      const eqCalls = mockEqUpdate.mock.calls
      const hasIdScope = eqCalls.some(
        ([col, val]) => col === 'id' && val === 'passenger-row-uuid'
      )
      const hasUserScope = eqCalls.some(
        ([col, val]) => col === 'user_id' && val === 'session-user-uuid'
      )
      expect(hasIdScope).toBe(true)
      expect(hasUserScope).toBe(true)
    })

    it('returns { error: "Not authenticated." } when unauthenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const formData = makeFormData({ id: 'p-uuid', full_name: 'Ghost' })

      const result = await updatePassenger('en', null, formData)

      expect(result).toEqual({ error: 'Not authenticated.' })
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })
})
