import { describe, it, expect, vi } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseAuthStub, supabaseServiceStub } = vi.hoisted(() => {
  const supabaseAuthStub = {
    auth: {
      getUser: vi.fn(),
    },
  }

  const supabaseServiceStub = {
    from: vi.fn(),
  }

  return { supabaseAuthStub, supabaseServiceStub }
})

// Mock @/lib/supabase/server — createClient returns supabaseAuthStub
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
  getAdminUser: vi.fn(),
}))

// Mock @/lib/supabase — createSupabaseServiceClient returns supabaseServiceStub
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

// Wave 0 RED stubs — admin-settings route does not exist yet (Plan 03)
// These tests are intentionally failing until Plan 03 implements the route.
// Import will fail until app/api/admin/settings/route.ts is created.

describe('NOTIF-06: admin settings API', () => {
  it('GET returns 401 without session', () => {
    expect(true).toBe(false)
  })

  it('GET returns notification_flags from pricing_globals', () => {
    expect(true).toBe(false)
  })

  it('PATCH returns 401 without session', () => {
    expect(true).toBe(false)
  })

  it('PATCH updates notification_flags in pricing_globals', () => {
    expect(true).toBe(false)
  })

  it('PATCH returns 400 on invalid payload', () => {
    expect(true).toBe(false)
  })
})
