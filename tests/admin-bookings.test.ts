import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseAuthStub, supabaseServiceStub } = vi.hoisted(() => {
  const supabaseAuthStub = {
    auth: {
      getUser: vi.fn(),
    },
  }

  const supabaseServiceStub = {
    from: vi.fn(),
    rpc: vi.fn(),
  }

  return { supabaseAuthStub, supabaseServiceStub }
})

const { stripeRefundsStub, MockStripeInvalidRequestError } = vi.hoisted(() => {
  const create = vi.fn()

  class MockStripeInvalidRequestError extends Error {
    type = 'StripeInvalidRequestError'
    constructor(message: string) {
      super(message)
      this.name = 'StripeInvalidRequestError'
    }
  }

  return { stripeRefundsStub: { create }, MockStripeInvalidRequestError }
})

// Phase 63 Plan 02 — trip-edit branch: notification AND-gate spies (logEmail
// dedup gate + the new sendBookingChangedEmail branded diff email).
const { stubLogEmail, stubSendBookingChangedEmail } = vi.hoisted(() => {
  return {
    stubLogEmail: vi.fn(),
    stubSendBookingChangedEmail: vi.fn(),
  }
})

// Phase 63 Plan 03 — price-affecting trip-edit branch: spy on pushGnetStatus
// so tests can assert it is NEVER called for a trip-detail edit (local-only,
// no GNet trip-detail-push API exists).
const { stubPushGnetStatus } = vi.hoisted(() => {
  return { stubPushGnetStatus: vi.fn().mockResolvedValue(undefined) }
})

// Phase 64 Plan 01 — ANEW-02/03: collect-payment POST branch spies.
const { stubCreateBookingPaymentLink, stubSendPaymentRequestEmail } = vi.hoisted(() => {
  return {
    stubCreateBookingPaymentLink: vi.fn(),
    stubSendPaymentRequestEmail: vi.fn(),
  }
})

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } },
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
  getAdminUser: vi.fn(async () => {
    const { data: { user }, error } = await supabaseAuthStub.auth.getUser()
    if (error || !user) return { user: null, error: '401' as const }
    if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
    return { user, error: null }
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

vi.mock('@/lib/booking-reference', () => ({
  generateBookingReference: vi.fn(() => 'PRG-20260403-AB12CD'),
}))

vi.mock('@/lib/currency', () => ({
  czkToEur: vi.fn((czk: number) => Math.round(czk * 0.04)),
  eurToCzk: vi.fn((_eur: number) => 1500),
}))

vi.mock('@/lib/server-pricing', () => ({
  computeOutboundLegTotal: vi.fn(() => 60),
}))

vi.mock('@/lib/extras', () => ({
  computeExtrasTotal: vi.fn(() => 0),
}))

vi.mock('@/lib/email-log', () => ({
  logEmail: stubLogEmail,
}))

vi.mock('@/lib/email', () => ({
  sendStatusConfirmedEmail: vi.fn().mockResolvedValue(undefined),
  sendStatusCancelledEmail: vi.fn().mockResolvedValue(undefined),
  sendPostTripEmail: vi.fn().mockResolvedValue(undefined),
  sendBookingChangedEmail: stubSendBookingChangedEmail,
  sendPaymentRequestEmail: stubSendPaymentRequestEmail,
}))

vi.mock('@/lib/stripe-payment-links', () => ({
  createBookingPaymentLink: stubCreateBookingPaymentLink,
}))

vi.mock('@/lib/gnet-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/gnet-client')>('@/lib/gnet-client')
  return {
    ...actual,
    pushGnetStatus: stubPushGnetStatus,
  }
})

vi.mock('stripe', () => {
  const MockStripeDefault = function MockStripe() {
    return { refunds: stripeRefundsStub }
  } as unknown as { (...args: unknown[]): unknown; errors: { StripeInvalidRequestError: typeof MockStripeInvalidRequestError } }
  MockStripeDefault.errors = { StripeInvalidRequestError: MockStripeInvalidRequestError }
  return { default: MockStripeDefault }
})

import { GET, PATCH, POST } from '@/app/api/admin/bookings/route'
import { POST as CANCEL_POST } from '@/app/api/admin/bookings/cancel/route'
import { GET as AUDIT_LOG_GET } from '@/app/api/admin/bookings/[id]/audit-log/route'
import { computeOutboundLegTotal } from '@/lib/server-pricing'

function makeRequest(url?: string): Request {
  return new Request(url ?? 'http://localhost/api/admin/bookings', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

function makePatchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCancelRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}


// ═══════════════════════════════════════════════════════════════════════════
// Wave 0 shared fixtures — PATCH trip-edit describe block (Phase 63, Plan 02/03)
// Seeded in Plan 01 (63-01) so downstream plans can import/extend without
// re-deriving the mock shape. See 63-RESEARCH.md "Validation Architecture".
// ═══════════════════════════════════════════════════════════════════════════

/** A representative "current row" for a trip-editable booking (confirmed, non-GNet, standalone leg). */
const mockCurrentTripEditBooking: Record<string, unknown> = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  status: 'confirmed',
  booking_source: 'website',
  linked_booking_id: null,
  leg: null,
  payment_intent_id: 'pi_test_123',
  trip_type: 'transfer',
  pickup_date: '2026-04-10',
  pickup_time: '14:00',
  return_date: null,
  origin_address: 'Prague Airport Terminal 1',
  destination_address: 'Hotel Four Seasons Prague',
  distance_km: 20,
  vehicle_class: 'business',
  hours: 2,
  is_airport: true,
  amount_czk: 1500,
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'jan@example.com',
  client_phone: '+420600123456',
  flight_number: 'OK123',
  special_requests: null,
}

/**
 * Wires supabaseServiceStub.from() to the realistic call sequence a
 * PATCH-trip-edit request drives once Plan 02 lands: current-row select ->
 * bookings.update -> booking_edit_audit_log.insert -> (optional)
 * pricing_globals select -> (optional) email_log insert (logEmail dedup).
 * Plan 02/03 tests call this then override any returned mock as needed —
 * e.g. `mockTripEditSupabaseChain({ notificationFlags: { booking_changed: false } })`.
 *
 * Deviation (63-02, Task 1): the shipped PATCH trip-edit branch resolves the
 * notification decision (pricing_globals flags select + logEmail) BEFORE the
 * booking_edit_audit_log insert, so the audit rows' `notified` column can be
 * set correctly in a single insert — the opposite order this Wave-0 helper
 * assumed. 63-02's own tests build their own inline mock chains instead (see
 * the "PATCH /api/admin/bookings — trip-edit" describe block below). Left
 * here, unused-but-not-deleted, in case Plan 03 finds its (still-representative)
 * shape useful for the price-affecting branch.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see deviation note above
function mockTripEditSupabaseChain(overrides?: {
  currentRow?: Record<string, unknown> | null
  notificationFlags?: Record<string, boolean> | null
}) {
  const currentRow = overrides?.currentRow ?? mockCurrentTripEditBooking

  const singleFn = vi.fn().mockResolvedValue({ data: currentRow, error: null })
  const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
  const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

  const updateEqFn = vi.fn().mockResolvedValue({ error: null })
  const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

  const auditInsertFn = vi.fn().mockResolvedValue({ error: null })

  const flagsSingleFn = vi.fn().mockResolvedValue({
    data: { notification_flags: overrides?.notificationFlags ?? null },
    error: null,
  })
  const flagsEqFn = vi.fn().mockReturnValue({ single: flagsSingleFn })
  const flagsSelectFn = vi.fn().mockReturnValue({ eq: flagsEqFn })

  const emailLogInsertFn = vi.fn().mockResolvedValue({ error: null })

  supabaseServiceStub.from
    .mockReturnValueOnce({ select: selectChainFn })    // 1. current booking row (SELECT * WHERE id = ...)
    .mockReturnValueOnce({ update: updateFn })         // 2. bookings.update(...)
    .mockReturnValueOnce({ insert: auditInsertFn })    // 3. booking_edit_audit_log.insert([...])
    .mockReturnValueOnce({ select: flagsSelectFn })    // 4. pricing_globals.select('notification_flags')
    .mockReturnValueOnce({ insert: emailLogInsertFn }) // 5. email_log.insert(...) (logEmail dedup gate)

  return { singleFn, selectEqFn, updateFn, updateEqFn, auditInsertFn, flagsSelectFn, flagsSingleFn, emailLogInsertFn }
}

const validPostPayload = {
  trip_type: 'transfer',
  pickup_date: '2026-04-10',
  pickup_time: '14:00',
  origin_address: 'Prague Airport Terminal 1',
  destination_address: 'Hotel Four Seasons Prague',
  vehicle_class: 'business',
  passengers: 2,
  luggage: 3,
  // amount_czk matches eurToCzk mock return value (1500) so price check passes
  amount_czk: 1500,
  distance_km: 20,
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'jan@example.com',
  client_phone: '+420600123456',
}

beforeEach(() => {
  vi.resetAllMocks()

  // Default to admin user
  supabaseAuthStub.auth.getUser.mockResolvedValue({
    data: { user: { id: '1', app_metadata: { is_admin: true } } },
    error: null,
  })

  // Phase 63 Plan 02 trip-edit notification spies — default to "send succeeds".
  // Individual tests override with .mockResolvedValueOnce(false) etc. as needed.
  stubLogEmail.mockResolvedValue(true)
  stubSendBookingChangedEmail.mockResolvedValue(undefined)

  // Phase 63 Plan 03 — pushGnetStatus spy: default resolved; trip-edit tests
  // assert it is never called (no GNet trip-detail-push API exists).
  stubPushGnetStatus.mockResolvedValue(undefined)

  // Phase 64 Plan 01 — collect-payment POST branch: default happy-path resolves.
  stubCreateBookingPaymentLink.mockResolvedValue({ url: 'https://buy.stripe.com/test_x', id: 'plink_123' })
  stubSendPaymentRequestEmail.mockResolvedValue(undefined)

  // Default rpc: returns empty result set (used by GET handler via admin_search_bookings)
  supabaseServiceStub.rpc.mockResolvedValue({
    data: [{ rows: [], total_count: 0 }],
    error: null,
  })

  // Default from() chain: fully chainable so ancillary calls
  // (pricing_globals, email_log) don't throw in PATCH/POST tests.
  const makeChainable = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {}
    const chainFn = () => chain
    chain.select   = vi.fn(chainFn)
    chain.insert   = vi.fn(chainFn)
    chain.update   = vi.fn(chainFn)
    chain.upsert   = vi.fn(chainFn)
    chain.delete   = vi.fn(chainFn)
    chain.eq       = vi.fn(chainFn)
    chain.neq      = vi.fn(chainFn)
    chain.gte      = vi.fn(chainFn)
    chain.lte      = vi.fn(chainFn)
    chain.or       = vi.fn(chainFn)
    chain.order    = vi.fn(chainFn)
    chain.range    = vi.fn(() => Promise.resolve({ data: [], count: 0, error: null }))
    chain.limit    = vi.fn(chainFn)
    chain.single   = vi.fn(() => Promise.resolve({ data: null, error: null }))
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    // Make the chain itself thenable so `await supabase.from(...).insert(...)` resolves
    chain.then     = undefined
    return chain
  }
  supabaseServiceStub.from.mockImplementation(() => makeChainable())
})

describe('/api/admin/bookings', () => {
  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '2', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 200 with { bookings, total, page, limit } for admin', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ bookings: [], total: 0, page: 0, limit: 20 })
  })

  it('Test 4: page=1&limit=5 passes p_offset=5, p_limit=5 to rpc', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?page=1&limit=5'))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_offset: 5, p_limit: 5 }),
    )
  })

  it('Test 5: search=Smith passes p_query="Smith" to rpc', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?search=Smith'))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_query: 'Smith' }),
    )
  })

  it('Test 6: tripType=hourly passes p_trip_type="hourly" to rpc', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?tripType=hourly'))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_trip_type: 'hourly' }),
    )
  })

  it('Test 7: GET calls rpc("admin_search_bookings") with all expected params', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-uid', app_metadata: { is_admin: true } } },
      error: null,
    })

    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [{ id: 'b1', booking_reference: 'PRG-20260401-AA00BB' }], total_count: 1 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?page=0&limit=20'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ total: 1, page: 0, limit: 20 })
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_offset: 0, p_limit: 20, p_query: null }),
    )
  })

  it('Test 8: status=unpaid passes p_status="unpaid" to rpc (D-08, ABND-04)', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?status=unpaid'))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_status: 'unpaid' }),
    )
  })

  it('Test 9: no status param passes p_status=null to rpc (Pitfall 5 — never mixes in pending)', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings'))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_status: null }),
    )
  })

  it('Test 10: an unknown status value is whitelisted away — p_status=null, not forwarded raw', async () => {
    supabaseServiceStub.rpc.mockResolvedValue({
      data: [{ rows: [], total_count: 0 }],
      error: null,
    })

    const res = await GET(makeRequest('http://localhost/api/admin/bookings?status=not-a-real-status'))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub.rpc).toHaveBeenCalledWith(
      'admin_search_bookings',
      expect.objectContaining({ p_status: null }),
    )
  })
})

describe('PATCH /api/admin/bookings', () => {
  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '2', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 200 for valid transition (pending -> confirmed)', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'pending' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectChainFn })
      .mockReturnValueOnce({ update: updateFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })
  })

  it('Test 4: returns 422 for invalid transition (completed -> pending)', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'completed' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectChainFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'pending' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot transition from 'completed' to 'pending'")
  })

  it('Test 5: returns 422 for invalid transition (cancelled -> confirmed)', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'cancelled' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectChainFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot transition from 'cancelled' to 'confirmed'")
  })

  it('Test 6: returns 404 when booking not found', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectChainFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(404)
  })

  it('Test 7: returns 400 when neither status nor operator_notes provided', async () => {
    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(400)
  })

  it('Test 8: returns 200 for operator_notes update (no status)', async () => {
    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ update: updateFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', operator_notes: 'VIP client' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })
  })

  it('Test 9: returns 200 for valid transition (unpaid -> confirmed) — D-04, D-10', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'unpaid', client_email: 'a@b.com' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectChainFn })
      .mockReturnValueOnce({ update: updateFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })
  })

  it('Test 10: returns 200 for valid transition (unpaid -> cancelled) — D-04, D-10', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'unpaid', client_email: 'a@b.com' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectChainFn })
      .mockReturnValueOnce({ update: updateFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'cancelled' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })
  })

  it('Test 11: returns 422 for invalid transition (unpaid -> completed) — no transition into unpaid skips other statuses', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'unpaid' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectChainFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'completed' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot transition from 'unpaid' to 'completed'")
  })

  it('Test 12: returns 422 for a manual transition INTO unpaid (confirmed -> unpaid is never allowed)', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { status: 'confirmed' }, error: null })
    const selectEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectChainFn = vi.fn().mockReturnValue({ eq: selectEqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectChainFn })

    const res = await PATCH(makePatchRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'unpaid' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot transition from 'confirmed' to 'unpaid'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/bookings — trip-edit branch (Phase 63 Plan 02)
// TRACER: cheap-field edit (pickup date/time + passenger/contact + flight
// number) -> persist -> per-field audit -> notify_client && booking_changed
// AND-gate -> optional branded email. See 63-02-PLAN.md Task 1.
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH /api/admin/bookings — trip-edit (Phase 63 Plan 02)', () => {
  function makeSelectSingleChain(data: unknown, error: unknown = null) {
    const singleFn = vi.fn().mockResolvedValue({ data, error })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    return { chain: { select: selectFn }, singleFn, eqFn, selectFn }
  }

  function makeUpdateChain(error: unknown = null) {
    const updateEqFn = vi.fn().mockResolvedValue({ error })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })
    return { chain: { update: updateFn }, updateFn, updateEqFn }
  }

  function makeInsertChain(error: unknown = null) {
    const insertFn = vi.fn().mockResolvedValue({ error })
    return { chain: { insert: insertFn }, insertFn }
  }

  it('Test 1: pickup_time edit persists, DB update scoped by id, inserts one audit row', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })

    expect(update.updateFn).toHaveBeenCalledWith({ pickup_time: '11:00' })
    expect(update.updateEqFn).toHaveBeenCalledWith('id', mockCurrentTripEditBooking.id)

    expect(audit.insertFn).toHaveBeenCalledTimes(1)
    const insertedRows = audit.insertFn.mock.calls[0][0]
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0]).toMatchObject({
      booking_id: mockCurrentTripEditBooking.id,
      field: 'pickup_time',
      old_value: '14:00',
      new_value: '11:00',
      notified: false,
    })
  })

  it('Test 2: changing 3 cheap fields inserts exactly 3 audit rows sharing one changed_at', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
      flight_number: 'OK999',
      client_phone: '+420600999999',
    }))

    expect(res.status).toBe(200)
    expect(audit.insertFn).toHaveBeenCalledTimes(1)
    const insertedRows = audit.insertFn.mock.calls[0][0] as Array<{ changed_at: string; field: string }>
    expect(insertedRows).toHaveLength(3)
    const changedAts = new Set(insertedRows.map(r => r.changed_at))
    expect(changedAts.size).toBe(1)
    expect(insertedRows.map(r => r.field).sort()).toEqual(['client_phone', 'flight_number', 'pickup_time'])
  })

  it('Test 3: client_email with CRLF injection returns 400 (NO_CRLF guard)', async () => {
    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      client_email: 'a@b.com\r\nBcc:x@y.com',
    }))
    expect(res.status).toBe(400)
  })

  it('Test 4: notify_client=true + booking_changed flag enabled -> logEmail called once, then sendBookingChangedEmail fired via after()', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()
    const flags = makeSelectSingleChain({ notification_flags: null })
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(flags.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
      notify_client: true,
    }))

    expect(res.status).toBe(200)
    expect(stubLogEmail).toHaveBeenCalledTimes(1)
    expect(stubLogEmail).toHaveBeenCalledWith({
      bookingId: mockCurrentTripEditBooking.id,
      emailType: 'booking_changed',
      recipient: mockCurrentTripEditBooking.client_email,
    })
    expect(stubSendBookingChangedEmail).toHaveBeenCalledTimes(1)

    // logEmail is the dedup gate — it must fire BEFORE the send.
    const logEmailOrder = stubLogEmail.mock.invocationCallOrder[0]
    const sendOrder = stubSendBookingChangedEmail.mock.invocationCallOrder[0]
    expect(logEmailOrder).toBeLessThan(sendOrder)

    const insertedRows = audit.insertFn.mock.calls[0][0]
    expect(insertedRows[0].notified).toBe(true)
  })

  it('Test 5: notify_client=false -> logEmail and sendBookingChangedEmail NOT called (toggle off)', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
      notify_client: false,
    }))

    expect(res.status).toBe(200)
    expect(stubLogEmail).not.toHaveBeenCalled()
    expect(stubSendBookingChangedEmail).not.toHaveBeenCalled()

    const insertedRows = audit.insertFn.mock.calls[0][0]
    expect(insertedRows[0].notified).toBe(false)
  })

  it('Test 6: notify_client=true but notification_flags.booking_changed=false -> not sent (flag off) even though toggle on', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()
    const flags = makeSelectSingleChain({ notification_flags: { booking_changed: false } })
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(flags.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
      notify_client: true,
    }))

    expect(res.status).toBe(200)
    expect(stubLogEmail).not.toHaveBeenCalled()
    expect(stubSendBookingChangedEmail).not.toHaveBeenCalled()

    const insertedRows = audit.insertFn.mock.calls[0][0]
    expect(insertedRows[0].notified).toBe(false)
  })

  it('Test 7: trip-field edit on a completed booking returns 422 (terminal status)', async () => {
    const current = makeSelectSingleChain({ ...mockCurrentTripEditBooking, status: 'completed' })
    supabaseServiceStub.from.mockReturnValueOnce(current.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
    }))

    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain('completed')
  })

  it('Test 8: trip-field edit on a cancelled booking returns 422 (terminal status)', async () => {
    const current = makeSelectSingleChain({ ...mockCurrentTripEditBooking, status: 'cancelled' })
    supabaseServiceStub.from.mockReturnValueOnce(current.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
    }))

    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain('cancelled')
  })

  it('Test 9: a no-op edit (new value equals current) writes no audit row and sends no email', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: mockCurrentTripEditBooking.pickup_time as string, // same value — no-op
      notify_client: true,
    }))

    expect(res.status).toBe(200)
    // Only 2 supabase.from calls: select current + update. No flags lookup, no audit insert.
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(2)
    expect(stubLogEmail).not.toHaveBeenCalled()
    expect(stubSendBookingChangedEmail).not.toHaveBeenCalled()
  })

  it('Test 10: update is scoped strictly by booking id — never payment_intent_id or linked leg (AEDIT-06)', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
    }))

    for (const call of update.updateEqFn.mock.calls) {
      expect(call[0]).toBe('id')
      expect(call[0]).not.toBe('payment_intent_id')
      expect(call[0]).not.toBe('linked_booking_id')
    }
    expect(update.updateEqFn).toHaveBeenCalledWith('id', mockCurrentTripEditBooking.id)
    expect(current.eqFn).toHaveBeenCalledWith('id', mockCurrentTripEditBooking.id)
  })

  it('Test 11: returns 404 when booking not found', async () => {
    const current = makeSelectSingleChain(null, { message: 'not found' })
    supabaseServiceStub.from.mockReturnValueOnce(current.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
    }))

    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/bookings — price-affecting trip-edit (Phase 63 Plan 03)
// AEDIT-02 (vehicle class), AEDIT-03 (route), AEDIT-07 (review/override).
// computeOutboundLegTotal is mocked to always return 60 EUR, computeExtrasTotal
// always returns 0, and eurToCzk is mocked to always return 1500 CZK (see
// top-of-file mocks) — so the server-recomputed price is deterministic across
// every test: computedCzk is always 1500 regardless of the actual inputs.
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH /api/admin/bookings — price-affecting trip-edit (Phase 63 Plan 03)', () => {
  function makeSelectSingleChain(data: unknown, error: unknown = null) {
    const singleFn = vi.fn().mockResolvedValue({ data, error })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    return { chain: { select: selectFn }, singleFn, eqFn, selectFn }
  }

  function makeUpdateChain(error: unknown = null) {
    const updateEqFn = vi.fn().mockResolvedValue({ error })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })
    return { chain: { update: updateFn }, updateFn, updateEqFn }
  }

  function makeInsertChain(error: unknown = null) {
    const insertFn = vi.fn().mockResolvedValue({ error })
    return { chain: { insert: insertFn }, insertFn }
  }

  it('Test 1: vehicle_class change with matching recomputed amount_czk -> 200, saves recomputed amount, audits vehicle_class + amount_czk', async () => {
    const currentRow: Record<string, unknown> = { ...mockCurrentTripEditBooking, amount_czk: 1400 }
    const current = makeSelectSingleChain(currentRow)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: currentRow.id as string,
      vehicle_class: 'first_class',
      amount_czk: 1500, // matches the mocked recompute (eurToCzk always returns 1500)
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })

    expect(update.updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ vehicle_class: 'first_class', amount_czk: 1500, amount_eur: 60 })
    )
    expect(update.updateEqFn).toHaveBeenCalledWith('id', currentRow.id)

    expect(audit.insertFn).toHaveBeenCalledTimes(1)
    const insertedRows = audit.insertFn.mock.calls[0][0] as Array<{ field: string; old_value: string | null; new_value: string | null }>
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows.find(r => r.field === 'amount_czk')).toMatchObject({ old_value: '1400', new_value: '1500' })
    expect(insertedRows.find(r => r.field === 'vehicle_class')).toMatchObject({ old_value: 'business', new_value: 'first_class' })
  })

  it('Test 2: submitted amount diverges by more than tolerance without override_price -> 422 with computedCzk/submittedCzk', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    supabaseServiceStub.from.mockReturnValueOnce(current.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      vehicle_class: 'first_class',
      amount_czk: 1550, // off by 50 from the mocked 1500 recompute (tolerance is 2)
    }))

    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json).toMatchObject({ computedCzk: 1500, submittedCzk: 1550 })
    // No DB write occurred — only the current-row select happened.
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })

  it('Test 3: same divergence WITH override_price=true -> 200, saves submitted amount, appends override note, audits amount_czk', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      vehicle_class: 'first_class',
      amount_czk: 1550,
      override_price: true,
    }))

    expect(res.status).toBe(200)
    expect(update.updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_czk: 1550,
        operator_notes: expect.stringContaining(
          'Price manually overridden by admin: 1550 CZK (standard rate would be 1500 CZK).'
        ),
      })
    )

    const insertedRows = audit.insertFn.mock.calls[0][0] as Array<{ field: string; old_value: string | null; new_value: string | null }>
    expect(insertedRows.find(r => r.field === 'amount_czk')).toMatchObject({ old_value: '1500', new_value: '1550' })
  })

  it('Test 4: route edit recomputes using the supplied distance_km (no second geocode call)', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      origin_address: 'New Origin Address',
      destination_address: 'New Destination Address',
      distance_km: 35,
      amount_czk: 1500,
    }))

    expect(res.status).toBe(200)
    // Recompute uses the freshly supplied distance_km, everything else overlaid from current row.
    expect(computeOutboundLegTotal).toHaveBeenCalledWith(
      mockCurrentTripEditBooking.vehicle_class,
      35,
      mockCurrentTripEditBooking.hours,
      1,
      mockCurrentTripEditBooking.trip_type,
      mockCurrentTripEditBooking.pickup_date,
      mockCurrentTripEditBooking.pickup_time,
      mockCurrentTripEditBooking.is_airport,
      expect.any(Object),
    )
    expect(update.updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        origin_address: 'New Origin Address',
        destination_address: 'New Destination Address',
        distance_km: 35,
      })
    )
  })

  it('Test 5: price change on a booking_source=gnet booking persists+audits locally; pushGnetStatus is NOT called', async () => {
    const gnetRow: Record<string, unknown> = { ...mockCurrentTripEditBooking, booking_source: 'gnet', amount_czk: 1400 }
    const current = makeSelectSingleChain(gnetRow)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: gnetRow.id as string,
      vehicle_class: 'first_class',
      amount_czk: 1500,
    }))

    expect(res.status).toBe(200)
    expect(stubPushGnetStatus).not.toHaveBeenCalled()
  })

  it('Test 6 (CR-02): price edit on a booking with a live payment_link_url is blocked with 409 unless override_price is set', async () => {
    const linkedRow: Record<string, unknown> = {
      ...mockCurrentTripEditBooking,
      status: 'unpaid',
      payment_link_url: 'https://buy.stripe.com/live_link',
      payment_link_id: 'plink_live_123',
    }
    const current = makeSelectSingleChain(linkedRow)
    supabaseServiceStub.from.mockReturnValueOnce(current.chain)

    const res = await PATCH(makePatchRequest({
      id: linkedRow.id as string,
      vehicle_class: 'first_class',
      amount_czk: 1500,
    }))

    expect(res.status).toBe(409)
    // No DB write occurred — only the current-row select happened.
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })

  it('Test 6b (CR-02): price edit on a live-link booking succeeds when override_price=true', async () => {
    const linkedRow: Record<string, unknown> = {
      ...mockCurrentTripEditBooking,
      status: 'unpaid',
      payment_link_url: 'https://buy.stripe.com/live_link',
      payment_link_id: 'plink_live_123',
    }
    const current = makeSelectSingleChain(linkedRow)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: linkedRow.id as string,
      vehicle_class: 'first_class',
      amount_czk: 1500,
      override_price: true,
    }))

    expect(res.status).toBe(200)
    expect(update.updateFn).toHaveBeenCalledWith(expect.objectContaining({ vehicle_class: 'first_class' }))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/bookings — leg isolation, idempotency, precision
// (Phase 63 Plan 03, Task 2 — AEDIT-06, AEDIT-05, AEDIT-07)
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH /api/admin/bookings — leg isolation, idempotency, precision (Phase 63 Plan 03, Task 2)', () => {
  function makeSelectSingleChain(data: unknown, error: unknown = null) {
    const singleFn = vi.fn().mockResolvedValue({ data, error })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    return { chain: { select: selectFn }, singleFn, eqFn, selectFn }
  }

  function makeUpdateChain(error: unknown = null) {
    const updateEqFn = vi.fn().mockResolvedValue({ error })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })
    return { chain: { update: updateFn }, updateFn, updateEqFn }
  }

  function makeInsertChain(error: unknown = null) {
    const insertFn = vi.fn().mockResolvedValue({ error })
    return { chain: { insert: insertFn }, insertFn }
  }

  const OUTBOUND_ID = mockCurrentTripEditBooking.id as string
  const RETURN_LEG_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'
  const SHARED_PAYMENT_INTENT_ID = 'pi_test_shared_roundtrip'

  it('Test 1: AEDIT-06 — a price-affecting edit on the outbound leg never references the linked return leg id or payment_intent_id', async () => {
    const outboundRow: Record<string, unknown> = {
      ...mockCurrentTripEditBooking,
      id: OUTBOUND_ID,
      leg: 'outbound',
      linked_booking_id: RETURN_LEG_ID,
      payment_intent_id: SHARED_PAYMENT_INTENT_ID,
      amount_czk: 1400,
    }
    const current = makeSelectSingleChain(outboundRow)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: OUTBOUND_ID,
      vehicle_class: 'first_class',
      amount_czk: 1500,
    }))

    expect(res.status).toBe(200)
    // Exactly 3 supabase.from() calls — no extra query was ever issued against
    // the return leg (a payment_intent_id-scoped read/write would show up here).
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(3)

    // Every .eq() scoping call — on the select AND the update — must reference
    // ONLY the outbound booking's own id.
    const allEqCalls = [...current.eqFn.mock.calls, ...update.updateEqFn.mock.calls]
    expect(allEqCalls.length).toBeGreaterThan(0)
    for (const [key, value] of allEqCalls) {
      expect(key).toBe('id')
      expect(key).not.toBe('payment_intent_id')
      expect(key).not.toBe('linked_booking_id')
      expect(value).toBe(OUTBOUND_ID)
      expect(value).not.toBe(RETURN_LEG_ID)
    }

    // The audit trail is scoped to the outbound booking_id only — the return
    // leg's row is never touched, i.e. byte-identical afterward.
    const insertedRows = audit.insertFn.mock.calls[0][0] as Array<{ booking_id: string }>
    expect(insertedRows.length).toBeGreaterThan(0)
    for (const row of insertedRows) {
      expect(row.booking_id).toBe(OUTBOUND_ID)
      expect(row.booking_id).not.toBe(RETURN_LEG_ID)
    }
  })

  it('Test 2: AEDIT-05 — repeating the same edit twice consults logEmail on each request but sends at most once (dedup gate)', async () => {
    // First PATCH — logEmail's dedup window is fresh -> should send.
    const current1 = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update1 = makeUpdateChain()
    const flags1 = makeSelectSingleChain({ notification_flags: null })
    const audit1 = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current1.chain)
      .mockReturnValueOnce(update1.chain)
      .mockReturnValueOnce(flags1.chain)
      .mockReturnValueOnce(audit1.chain)

    stubLogEmail.mockResolvedValueOnce(true)

    const res1 = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
      notify_client: true,
    }))
    expect(res1.status).toBe(200)

    // Second PATCH — the identical edit repeated. logEmail's own dedup window
    // (out of scope here — lib/email-log.ts owns that) reports "already sent".
    const current2 = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update2 = makeUpdateChain()
    const flags2 = makeSelectSingleChain({ notification_flags: null })
    const audit2 = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current2.chain)
      .mockReturnValueOnce(update2.chain)
      .mockReturnValueOnce(flags2.chain)
      .mockReturnValueOnce(audit2.chain)

    stubLogEmail.mockResolvedValueOnce(false)

    const res2 = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      pickup_time: '11:00',
      notify_client: true,
    }))
    expect(res2.status).toBe(200)

    // The dedup gate is consulted on EVERY request...
    expect(stubLogEmail).toHaveBeenCalledTimes(2)
    // ...but the actual branded email fires at most once across both requests.
    expect(stubSendBookingChangedEmail).toHaveBeenCalledTimes(1)

    // Both audit inserts still record `notified` correctly per-request outcome.
    const firstAuditRows = audit1.insertFn.mock.calls[0][0] as Array<{ notified: boolean }>
    const secondAuditRows = audit2.insertFn.mock.calls[0][0] as Array<{ notified: boolean }>
    expect(firstAuditRows[0].notified).toBe(true)
    expect(secondAuditRows[0].notified).toBe(false)
  })

  it('Test 3: AEDIT-07 — saved amount_czk is an integer equal to the recomputed CZK amount on the non-override path', async () => {
    const current = makeSelectSingleChain(mockCurrentTripEditBooking)
    const update = makeUpdateChain()
    const audit = makeInsertChain()

    supabaseServiceStub.from
      .mockReturnValueOnce(current.chain)
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(audit.chain)

    const res = await PATCH(makePatchRequest({
      id: mockCurrentTripEditBooking.id as string,
      vehicle_class: 'first_class',
      amount_czk: 1500, // matches the mocked recompute exactly — non-override path
    }))

    expect(res.status).toBe(200)
    const savedPayload = update.updateFn.mock.calls[0][0] as { amount_czk: number }
    expect(Number.isInteger(savedPayload.amount_czk)).toBe(true)
    // eurToCzk is mocked to always return 1500 (the "recomputed EUR -> CZK"
    // value) — the saved amount must equal it exactly on the non-diverging,
    // non-override path (no second rounding rule is introduced).
    expect(savedPayload.amount_czk).toBe(1500)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/bookings/[id]/audit-log — history read (Phase 63 Plan 02, Task 2)
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/bookings/[id]/audit-log', () => {
  function makeAuditLogRequest(bookingId: string): Request {
    return new Request(`http://localhost/api/admin/bookings/${bookingId}/audit-log`, {
      method: 'GET',
    })
  }

  function makeAuditLogCtx(bookingId: string) {
    return { params: Promise.resolve({ id: bookingId }) }
  }

  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await AUDIT_LOG_GET(
      makeAuditLogRequest(mockCurrentTripEditBooking.id as string),
      makeAuditLogCtx(mockCurrentTripEditBooking.id as string),
    )
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '2', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await AUDIT_LOG_GET(
      makeAuditLogRequest(mockCurrentTripEditBooking.id as string),
      makeAuditLogCtx(mockCurrentTripEditBooking.id as string),
    )
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 200 with rows ordered changed_at DESC for an admin session', async () => {
    const rows = [
      { id: 'audit-2', field: 'pickup_time', old_value: '10:00', new_value: '11:00', operator_id: '1', changed_at: '2026-04-10T12:00:00Z', notified: true },
      { id: 'audit-1', field: 'flight_number', old_value: 'OK100', new_value: 'OK123', operator_id: '1', changed_at: '2026-04-09T08:00:00Z', notified: false },
    ]
    const orderFn = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eqFn = vi.fn().mockReturnValue({ order: orderFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await AUDIT_LOG_GET(
      makeAuditLogRequest(mockCurrentTripEditBooking.id as string),
      makeAuditLogCtx(mockCurrentTripEditBooking.id as string),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ rows })
    expect(eqFn).toHaveBeenCalledWith('booking_id', mockCurrentTripEditBooking.id)
    expect(orderFn).toHaveBeenCalledWith('changed_at', { ascending: false })
  })

  it('Test 4: returns 200 with { rows: [] } for a booking with zero audit rows (not 404)', async () => {
    const orderFn = vi.fn().mockResolvedValue({ data: [], error: null })
    const eqFn = vi.fn().mockReturnValue({ order: orderFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await AUDIT_LOG_GET(
      makeAuditLogRequest(mockCurrentTripEditBooking.id as string),
      makeAuditLogCtx(mockCurrentTripEditBooking.id as string),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ rows: [] })
  })

  it('Test 5: returns 500 when the DB read fails', async () => {
    const orderFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } })
    const eqFn = vi.fn().mockReturnValue({ order: orderFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await AUDIT_LOG_GET(
      makeAuditLogRequest(mockCurrentTripEditBooking.id as string),
      makeAuditLogCtx(mockCurrentTripEditBooking.id as string),
    )

    expect(res.status).toBe(500)
  })
})

describe('POST /api/admin/bookings', () => {
  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await POST(makePostRequest(validPostPayload))
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '2', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await POST(makePostRequest(validPostPayload))
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 400 when required fields missing (no trip_type)', async () => {
    const { trip_type: _omitted, ...payloadWithoutTripType } = validPostPayload
    const res = await POST(makePostRequest(payloadWithoutTripType))
    expect(res.status).toBe(400)
  })

  it('Test 4: returns 400 when amount_czk is zero or negative', async () => {
    const res = await POST(makePostRequest({ ...validPostPayload, amount_czk: 0 }))
    expect(res.status).toBe(400)
  })

  it('Test 5: returns 201 with { booking } for valid payload and correct DB fields', async () => {
    // getPricingConfig() short-circuits to PRICING_FALLBACK when SUPABASE_URL /
    // SUPABASE_SERVICE_ROLE_KEY are absent (as in this test env) — it issues
    // ZERO supabase.from() calls in that path. computeOutboundLegTotal /
    // eurToCzk / czkToEur are separately mocked above and ignore `rates`
    // entirely, so the fallback's actual field values never matter here.
    // The bookings insert is therefore the FIRST and ONLY supabase.from() call.
    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })

    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    const res = await POST(makePostRequest(validPostPayload))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toHaveProperty('booking')
    expect(json.booking).toMatchObject({ id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' })

    // Verify insert was called with correct booking_source, payment_intent_id, status, booking_type.
    // Phase 64 D-02: a no-link save (no collect_payment, no explicit status)
    // defaults to 'confirmed' — 'pending' was the pre-Phase-64 default.
    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          booking_source: 'manual',
          payment_intent_id: null,
          status: 'confirmed',
          booking_type: 'confirmed',
        }),
      ])
    )
    expect(stubCreateBookingPaymentLink).not.toHaveBeenCalled()
    expect(stubSendPaymentRequestEmail).not.toHaveBeenCalled()
  })

  it('Test 6: POST generates booking_reference matching PRG-YYYYMMDD-XXXX pattern', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })

    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    await POST(makePostRequest(validPostPayload))

    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          booking_reference: expect.stringMatching(/^PRG-\d{8}-[A-F0-9]{6}$/),
        }),
      ])
    )
  })

  // Phase 64 Plan 01 — ANEW-01/02/03/05 (D-01/D-02): collect-payment branch +
  // operator status choice for no-link saves.

  it('Test 7: collect_payment=true yields status "unpaid", generates + persists a payment link, sends the payment-request email, returns paymentLinkUrl', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })

    const updateEqFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    // First from('bookings') call is the insert; every subsequent call
    // (the payment-link persist UPDATE) gets the update chain.
    supabaseServiceStub.from
      .mockReturnValueOnce({ insert: insertFn })
      .mockReturnValue({ update: updateFn })

    const res = await POST(makePostRequest({ ...validPostPayload, collect_payment: true }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.paymentLinkUrl).toBe('https://buy.stripe.com/test_x')
    expect(json.booking).toMatchObject({ id: 'test-id' })

    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'unpaid', payment_intent_id: null, booking_source: 'manual' }),
      ])
    )

    // T-64-01: amount is the server-recomputed amount_eur, never a client field.
    expect(stubCreateBookingPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'test-id',
        bookingReference: 'PRG-20260403-AB12CD',
        amountEur: 60,
        leg: null,
      })
    )
    expect(updateFn).toHaveBeenCalledWith({ payment_link_url: 'https://buy.stripe.com/test_x', payment_link_id: 'plink_123' })
    expect(updateEqFn).toHaveBeenCalledWith('id', 'test-id')

    expect(stubLogEmail).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'test-id', emailType: 'payment_request', recipient: 'jan@example.com' })
    )
    expect(stubSendPaymentRequestEmail).toHaveBeenCalledTimes(1)
  })

  it('Test 8: explicit status="pending" (no collect_payment) persists status "pending", no Stripe call, no email, response has no paymentLinkUrl key (D-02)', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })

    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    const res = await POST(makePostRequest({ ...validPostPayload, status: 'pending' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).not.toHaveProperty('paymentLinkUrl')

    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'pending', payment_intent_id: null }),
      ])
    )
    expect(stubCreateBookingPaymentLink).not.toHaveBeenCalled()
    expect(stubSendPaymentRequestEmail).not.toHaveBeenCalled()
  })

  it('Test 9: collect_payment=true still returns 201 with paymentLinkUrl: null when the payment-link step throws — booking is never lost', async () => {
    stubCreateBookingPaymentLink.mockRejectedValueOnce(new Error('stripe down'))

    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'test-id', booking_reference: 'PRG-20260403-AB12CD' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })

    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    const res = await POST(makePostRequest({ ...validPostPayload, collect_payment: true }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.paymentLinkUrl).toBeNull()
    expect(json.booking).toMatchObject({ id: 'test-id' })

    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ status: 'unpaid' })])
    )
    expect(stubSendPaymentRequestEmail).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/bookings/cancel', () => {
  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(401)
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: '2', app_metadata: { is_admin: false } } },
      error: null,
    })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(403)
  })

  it('Test 3: returns 404 when booking not found', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(404)
  })

  it("Test 4: returns 422 when booking status is 'cancelled'", async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'cancelled', payment_intent_id: null }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot cancel a booking with status 'cancelled'")
  })

  it("Test 5: returns 422 when booking status is 'completed'", async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'completed', payment_intent_id: null }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain("Cannot cancel a booking with status 'completed'")
  })

  it('Test 6: returns 200 and sets status=cancelled for manual booking, stripe NOT called', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'pending', payment_intent_id: null }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true })
    expect(stripeRefundsStub.create).not.toHaveBeenCalled()
    expect(updateFn).toHaveBeenCalledWith({ status: 'cancelled' })
  })

  it('Test 7: returns 200 and calls stripe.refunds.create for Stripe-paid booking', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'confirmed', payment_intent_id: 'pi_xxx' }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    stripeRefundsStub.create.mockResolvedValue({ id: 're_test123' })

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, refund_id: 're_test123' })
    expect(stripeRefundsStub.create).toHaveBeenCalledWith({ payment_intent: 'pi_xxx' })
    expect(updateFn).toHaveBeenCalledWith({ status: 'cancelled' })
  })

  it('Test 8: returns 502 when stripe.refunds.create throws, booking status NOT updated', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', status: 'pending', payment_intent_id: 'pi_xxx' }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    stripeRefundsStub.create.mockRejectedValue(new Error('charge_already_refunded'))

    const res = await CANCEL_POST(makeCancelRequest({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))
    expect(res.status).toBe(502)
    // DB update should NOT have been called (only 1 supabase.from call for the select)
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })

  it('Test 9: partial refund with leg=outbound — calls Stripe with per-leg amount + metadata.leg', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_xxx',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
      },
      error: null,
    })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    stripeRefundsStub.create.mockResolvedValue({ id: 're_test123' })

    const res = await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'outbound',
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, refund_id: 're_test123' })
    // czkToEur(5000) = 200 EUR -> 200 * 100 = 20000 cents
    expect(stripeRefundsStub.create).toHaveBeenCalledWith({
      payment_intent: 'pi_xxx',
      amount: 20000,
      metadata: { leg: 'outbound' },
    })
    expect(updateFn).toHaveBeenCalledWith({ status: 'cancelled' })
    // DB update scoped to id, not payment_intent_id
    expect(updateEqFn).toHaveBeenCalledWith('id', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')
  })

  it('Test 10: partial refund with leg=return — uses return_amount_czk', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_yyy',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
      },
      error: null,
    })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    stripeRefundsStub.create.mockResolvedValue({ id: 're_test456' })

    const res = await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'return',
    }))
    expect(res.status).toBe(200)
    // czkToEur(4500) = Math.round(4500 * 0.04) = 180 EUR -> 180 * 100 = 18000 cents
    expect(stripeRefundsStub.create).toHaveBeenCalledWith({
      payment_intent: 'pi_yyy',
      amount: 18000,
      metadata: { leg: 'return' },
    })
  })

  it('Test 11: DB update after partial refund is scoped to id, never payment_intent_id', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_shared_round_trip',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
      },
      error: null,
    })
    const fetchEqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: fetchEqFn })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    supabaseServiceStub.from
      .mockReturnValueOnce({ select: selectFn })
      .mockReturnValueOnce({ update: updateFn })

    stripeRefundsStub.create.mockResolvedValue({ id: 're_scope' })

    await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'outbound',
    }))

    // CRITICAL regression guard: the .eq() call on the update chain must use 'id', not 'payment_intent_id'
    const allEqCalls = updateEqFn.mock.calls
    expect(allEqCalls.length).toBeGreaterThan(0)
    for (const call of allEqCalls) {
      expect(call[0]).toBe('id')
      expect(call[0]).not.toBe('payment_intent_id')
    }
  })

  it('Test 12: returns 422 (not 502) when Stripe throws StripeInvalidRequestError (over-refund)', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_overrefund',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
      },
      error: null,
    })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    // Throw the mocked error class so route's instanceof check matches
    const overRefundError = new MockStripeInvalidRequestError('Amount exceeds remaining refundable')
    stripeRefundsStub.create.mockRejectedValue(overRefundError)

    const res = await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'outbound',
    }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('Refund amount exceeds remaining refundable balance. Contact Stripe support.')
    // DB update NOT called — only 1 supabase.from call (the select)
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })

  it('Test 13: returns 422 when leg is present but leg amount column is null', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'confirmed',
        payment_intent_id: 'pi_missing_amount',
        outbound_amount_czk: null,
        return_amount_czk: null,
      },
      error: null,
    })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

    supabaseServiceStub.from.mockReturnValueOnce({ select: selectFn })

    const res = await CANCEL_POST(makeCancelRequest({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      leg: 'outbound',
    }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('Cannot compute per-leg refund: missing leg amount')
    // Stripe NOT called
    expect(stripeRefundsStub.create).not.toHaveBeenCalled()
    // DB update NOT called — only 1 supabase.from call (the select)
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })
})
