import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Phase 82, D-02: /admin/bookings?search=<email> must find a customer's bookings.
// Two layers: the migration text (SQL contract) and the route (search -> p_query).

const { authStub, serviceStub } = vi.hoisted(() => ({
  authStub: { auth: { getUser: vi.fn() } },
  serviceStub: { from: vi.fn(), rpc: vi.fn() },
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } } }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(authStub)),
  getAdminUser: vi.fn(async () => {
    const { data: { user }, error } = await authStub.auth.getUser()
    if (error || !user) return { user: null, error: '401' as const }
    if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
    return { user, error: null }
  }),
}))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn(() => serviceStub) }))
vi.mock('@/lib/booking-reference', () => ({ generateBookingReference: vi.fn() }))
vi.mock('@/lib/currency', () => ({ eurToCzk: vi.fn(), czkToEur: vi.fn() }))
vi.mock('@/lib/server-pricing', () => ({ computeOutboundLegTotal: vi.fn() }))
vi.mock('@/lib/extras', () => ({ computeExtrasTotal: vi.fn() }))
vi.mock('@/lib/email-log', () => ({ logEmail: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendStatusConfirmedEmail: vi.fn(),
  sendStatusCancelledEmail: vi.fn(),
  sendPostTripEmail: vi.fn(),
  sendBookingChangedEmail: vi.fn(),
  sendPaymentRequestEmail: vi.fn(),
}))
vi.mock('@/lib/stripe-payment-links', () => ({
  createBookingPaymentLink: vi.fn(),
  deactivateBookingPaymentLink: vi.fn(),
}))
vi.mock('@/lib/gnet-client', () => ({
  pushGnetStatus: vi.fn(),
  prestigoToGnetStatus: vi.fn(),
}))

import { GET } from '@/app/api/admin/bookings/route'

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/071_admin_search_bookings_email.sql'),
  'utf8',
)
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('migration 071: admin_search_bookings email clause (D-02)', () => {
  it('adds exactly one email clause to the search block', () => {
    expect(CODE.match(/OR b\.client_email ILIKE v_like/g)).toHaveLength(1)
  })

  it('keeps the first name, last name and reference matches', () => {
    expect(CODE).toContain('OR b.client_first_name ILIKE v_like')
    expect(CODE).toContain('OR b.client_last_name  ILIKE v_like')
    expect(CODE).toContain('OR b.booking_reference ILIKE v_like')
  })

  it('keeps SECURITY DEFINER and the fixed search_path of the live function', () => {
    expect(CODE).toContain('SECURITY DEFINER')
    expect(CODE).toContain("SET search_path TO 'public', 'pg_temp'")
  })

  it('keeps the 8-argument signature and the return shape', () => {
    expect(CODE).toContain('RETURNS TABLE(rows jsonb, total_count bigint)')
    for (const arg of ['p_query', 'p_start_date', 'p_end_date', 'p_trip_type', 'p_status', 'p_sort', 'p_offset', 'p_limit']) {
      expect(CODE).toContain(arg)
    }
  })

  it('keeps both ORDER BY sites (paged CTE and jsonb_agg)', () => {
    expect(CODE).toContain("CASE WHEN p_sort = 'pickup_asc'  THEN pickup_date END ASC")
    expect(CODE).toContain("CASE WHEN p_sort = 'pickup_asc'  THEN paged.pickup_date END ASC")
    expect(CODE).toContain('paged.created_at DESC')
  })

  it('revokes PUBLIC/anon/authenticated and grants service_role only (T-82-10)', () => {
    const sig = 'public.admin_search_bookings(text, text, text, text, text, text, integer, integer)'
    expect(CODE).toContain(`REVOKE EXECUTE ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`)
    expect(CODE).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`)
    expect(CODE).not.toMatch(/GRANT EXECUTE[^;]*TO\s+(PUBLIC|anon|authenticated)/)
  })

  it('uses no dynamic SQL', () => {
    expect(CODE).not.toMatch(/\bEXECUTE\s+(format|')/i)
  })
})

describe('GET /api/admin/bookings?search=<email> (D-02 deep link)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    authStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '1', app_metadata: { is_admin: true } } },
      error: null,
    })
    serviceStub.rpc.mockResolvedValue({ data: [{ rows: [], total_count: 0 }], error: null })
  })

  it('passes the email unchanged as p_query', async () => {
    const res = await GET(new Request('http://localhost/api/admin/bookings?search=jane.doe%40example.com'))
    expect(res.status).toBe(200)
    expect(serviceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_query: 'jane.doe@example.com' }),
    )
  })
})
