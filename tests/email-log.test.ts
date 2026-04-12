import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseServiceStub } = vi.hoisted(() => {
  // Chainable select stub
  const selectStub = {
    eq: vi.fn(),
    gte: vi.fn(),
    limit: vi.fn(),
  }
  selectStub.eq.mockReturnValue(selectStub)
  selectStub.gte.mockReturnValue(selectStub)
  selectStub.limit.mockResolvedValue({ data: [], error: null })

  const insertStub = vi.fn().mockResolvedValue({ error: null })

  const supabaseServiceStub = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'email_log') {
        return {
          select: vi.fn(() => selectStub),
          insert: insertStub,
        }
      }
      return {}
    }),
    _selectStub: selectStub,
    _insertStub: insertStub,
  }

  return { supabaseServiceStub }
})

// Mock @/lib/supabase — createSupabaseServiceClient returns supabaseServiceStub
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

import { logEmail } from '@/lib/email-log'
import { createSupabaseServiceClient } from '@/lib/supabase'

describe('NOTIF-01/03: logEmail dedup helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset chainable select stub
    const selectStub = supabaseServiceStub._selectStub
    selectStub.eq.mockReturnValue(selectStub)
    selectStub.gte.mockReturnValue(selectStub)
    selectStub.limit.mockResolvedValue({ data: [], error: null })

    // Reset insert stub
    supabaseServiceStub._insertStub.mockResolvedValue({ error: null })

    // Reset from
    supabaseServiceStub.from.mockImplementation(() => ({
      select: vi.fn(() => selectStub),
      insert: supabaseServiceStub._insertStub,
    }))

    // Reset createSupabaseServiceClient mock
    ;(createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(supabaseServiceStub)
  })

  it('Test 1: returns true when no duplicate exists (SELECT returns empty, INSERT succeeds)', async () => {
    supabaseServiceStub._selectStub.limit.mockResolvedValue({ data: [], error: null })
    supabaseServiceStub._insertStub.mockResolvedValue({ error: null })

    const result = await logEmail({
      bookingId: 'booking-uuid-1',
      emailType: 'confirmed',
      recipient: 'client@example.com',
    })

    expect(result).toBe(true)
  })

  it('Test 2: returns false when duplicate exists within 10 minutes (SELECT returns a row)', async () => {
    supabaseServiceStub._selectStub.limit.mockResolvedValue({
      data: [{ id: 'existing-log-uuid' }],
      error: null,
    })

    const result = await logEmail({
      bookingId: 'booking-uuid-1',
      emailType: 'confirmed',
      recipient: 'client@example.com',
    })

    expect(result).toBe(false)
    // INSERT should NOT be called on duplicate
    expect(supabaseServiceStub._insertStub).not.toHaveBeenCalled()
  })

  it('Test 3: uses createSupabaseServiceClient (not anon client)', async () => {
    supabaseServiceStub._selectStub.limit.mockResolvedValue({ data: [], error: null })

    await logEmail({
      bookingId: 'booking-uuid-1',
      emailType: 'confirmed',
      recipient: 'client@example.com',
    })

    expect(createSupabaseServiceClient).toHaveBeenCalledTimes(1)
  })

  it('Test 4: handles null bookingId (for system emails)', async () => {
    supabaseServiceStub._selectStub.limit.mockResolvedValue({ data: [], error: null })
    supabaseServiceStub._insertStub.mockResolvedValue({ error: null })

    const result = await logEmail({
      bookingId: null,
      emailType: 'system_alert',
      recipient: 'admin@example.com',
    })

    expect(result).toBe(true)
  })

  it('Test 5: returns true and does not crash when INSERT fails after dedup check passes (graceful degradation)', async () => {
    supabaseServiceStub._selectStub.limit.mockResolvedValue({ data: [], error: null })
    supabaseServiceStub._insertStub.mockResolvedValue({
      error: { message: 'DB connection error' },
    })

    const result = await logEmail({
      bookingId: 'booking-uuid-1',
      emailType: 'confirmed',
      recipient: 'client@example.com',
    })

    // Still returns true — allow send even when logging fails
    expect(result).toBe(true)
  })
})
