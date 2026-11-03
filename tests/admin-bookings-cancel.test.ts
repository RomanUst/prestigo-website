import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 87 Plan 01 Task 2 — characterization of POST /api/admin/bookings/cancel.
// Written against the route BEFORE its status write moved into
// advanceBookingStatus (profile 'cancel-route') and kept unchanged afterwards:
// it pins the refund-before-status order, every response, and the fact that the
// cancel route sends no email, deactivates no link, schedules nothing and
// pushes nothing to GNet.

const {
  mockGetAdminUser,
  mockSupabaseFrom,
  mockRpc,
  mockRefundsCreate,
  MockStripeInvalidRequestError,
  mockLogEmail,
  mockSendConfirmed,
  mockSendCancelled,
  mockSendPostTrip,
  mockScheduleQStash,
  mockDeactivateLink,
  mockPushGnetStatus,
  mockAfter,
} = vi.hoisted(() => {
  class MockStripeInvalidRequestError extends Error {
    type = 'StripeInvalidRequestError'
    constructor(message: string) {
      super(message)
      this.name = 'StripeInvalidRequestError'
    }
  }
  return {
    mockGetAdminUser: vi.fn(),
    mockSupabaseFrom: vi.fn(),
    mockRpc: vi.fn(),
    mockRefundsCreate: vi.fn(),
    MockStripeInvalidRequestError,
    mockLogEmail: vi.fn(),
    mockSendConfirmed: vi.fn(),
    mockSendCancelled: vi.fn(),
    mockSendPostTrip: vi.fn(),
    mockScheduleQStash: vi.fn(),
    mockDeactivateLink: vi.fn(),
    mockPushGnetStatus: vi.fn(),
    mockAfter: vi.fn(),
  }
})

vi.mock('next/server', async (importActual) => {
  const actual = await importActual<typeof import('next/server')>()
  return { ...actual, after: mockAfter }
})

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: mockGetAdminUser,
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ from: mockSupabaseFrom, rpc: mockRpc }),
}))

vi.mock('stripe', () => {
  const MockStripeDefault = function MockStripe() {
    return { refunds: { create: mockRefundsCreate } }
  } as unknown as {
    (...args: unknown[]): unknown
    errors: { StripeInvalidRequestError: typeof MockStripeInvalidRequestError }
  }
  MockStripeDefault.errors = { StripeInvalidRequestError: MockStripeInvalidRequestError }
  return { default: MockStripeDefault }
})

vi.mock('@/lib/email-log', () => ({ logEmail: mockLogEmail }))
vi.mock('@/lib/email', () => ({
  sendStatusConfirmedEmail: mockSendConfirmed,
  sendStatusCancelledEmail: mockSendCancelled,
  sendPostTripEmail: mockSendPostTrip,
}))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: mockScheduleQStash }))
vi.mock('@/lib/stripe-payment-links', () => ({
  deactivateBookingPaymentLink: mockDeactivateLink,
}))
vi.mock('@/lib/gnet-client', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/gnet-client')>()
  return { ...actual, pushGnetStatus: mockPushGnetStatus }
})

import { POST } from '@/app/api/admin/bookings/cancel/route'
import { czkToEur } from '@/lib/currency'

const ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Wires supabase: from() call 1 = the booking select (single); the status change is the
 * advance_booking_status compare-and-set RPC (Phase 87-03). rpcFn records the call;
 * `rpcResult` overrides the RPC answer (default: applied).
 */
function wireSupabase(opts: {
  booking: Record<string, unknown> | null
  selectError?: unknown
  updateError?: unknown
  rpcResult?: unknown
}) {
  const singleFn = vi.fn().mockResolvedValue({
    data: opts.booking,
    error: opts.selectError ?? (opts.booking ? null : { message: 'not found' }),
  })
  const selectEq = vi.fn().mockReturnValue({ single: singleFn })
  const selectFn = vi.fn().mockReturnValue({ eq: selectEq })

  mockSupabaseFrom.mockReturnValueOnce({ select: selectFn })
  mockRpc.mockImplementation(async () => {
    if (opts.updateError) return { data: null, error: opts.updateError }
    return { data: opts.rpcResult ?? { applied: true }, error: null }
  })

  return { selectFn, rpcFn: mockRpc }
}

function expectNoSideEffects() {
  expect(mockLogEmail).not.toHaveBeenCalled()
  expect(mockSendConfirmed).not.toHaveBeenCalled()
  expect(mockSendCancelled).not.toHaveBeenCalled()
  expect(mockSendPostTrip).not.toHaveBeenCalled()
  expect(mockScheduleQStash).not.toHaveBeenCalled()
  expect(mockDeactivateLink).not.toHaveBeenCalled()
  expect(mockPushGnetStatus).not.toHaveBeenCalled()
  expect(mockAfter).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSupabaseFrom.mockReset()
  mockRpc.mockReset()
  mockGetAdminUser.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
})

describe('POST /api/admin/bookings/cancel — characterization', () => {
  it('401 without a session', async () => {
    mockGetAdminUser.mockResolvedValue({ user: null, error: '401' })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
  })

  it('403 for a non-admin user', async () => {
    mockGetAdminUser.mockResolvedValue({ user: null, error: '403' })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('400 Invalid payload for a bad id', async () => {
    const res = await POST(makeRequest({ id: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid payload' })
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
  })

  it('404 Booking not found when the select fails', async () => {
    wireSupabase({ booking: null })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Booking not found' })
  })

  it.each(['completed', 'cancelled'])(
    "422 for status '%s' with no refund and no bookings update",
    async (status) => {
      wireSupabase({ booking: { id: ID, status, payment_intent_id: 'pi_xxx' } })
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({
        error: `Cannot cancel a booking with status '${status}'`,
      })
      expect(mockRefundsCreate).not.toHaveBeenCalled()
      // only the select ran
      expect(mockSupabaseFrom).toHaveBeenCalledTimes(1)
    },
  )

  it('manual booking (no payment_intent_id): compare-and-set to cancelled scoped by id, 200 { ok: true }', async () => {
    const { rpcFn } = wireSupabase({
      booking: { id: ID, status: 'pending', payment_intent_id: null },
    })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockRefundsCreate).not.toHaveBeenCalled()
    expect(rpcFn).toHaveBeenCalledWith('advance_booking_status', {
      p_booking_id: ID,
      p_from: 'pending',
      p_to: 'cancelled',
      p_actor_type: 'admin',
      p_actor_id: 'admin-1',
      p_source: 'admin_cancel',
      p_patch: {},
    })
    expectNoSideEffects()
  })

  it('paid booking without leg: full refund is created BEFORE the status update, response carries refund_id', async () => {
    const { rpcFn } = wireSupabase({
      booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_xxx' },
    })
    mockRefundsCreate.mockResolvedValue({ id: 're_full' })

    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, refund_id: 're_full' })
    expect(mockRefundsCreate).toHaveBeenCalledWith({ payment_intent: 'pi_xxx' })
    expect(rpcFn).toHaveBeenCalledWith(
      'advance_booking_status',
      expect.objectContaining({ p_from: 'confirmed', p_to: 'cancelled' }),
    )

    const refundOrder = mockRefundsCreate.mock.invocationCallOrder[0]
    const updateOrder = rpcFn.mock.invocationCallOrder[0]
    expect(refundOrder).toBeLessThan(updateOrder)
    expectNoSideEffects()
  })

  it('leg=return with return_amount_czk 2500: partial refund amount and metadata.leg', async () => {
    const { rpcFn } = wireSupabase({
      booking: {
        id: ID,
        status: 'confirmed',
        payment_intent_id: 'pi_rt',
        outbound_amount_czk: 5000,
        return_amount_czk: 2500,
      },
    })
    mockRefundsCreate.mockResolvedValue({ id: 're_leg' })

    const res = await POST(makeRequest({ id: ID, leg: 'return' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, refund_id: 're_leg' })
    expect(mockRefundsCreate).toHaveBeenCalledWith({
      payment_intent: 'pi_rt',
      amount: Math.round(czkToEur(2500) * 100),
      metadata: { leg: 'return' },
    })
    // the status write is scoped to the booking id ONLY so the paired leg is untouched
    expect(rpcFn).toHaveBeenCalledTimes(1)
    const rpcArgs = rpcFn.mock.calls[0][1] as Record<string, unknown>
    expect(rpcArgs.p_booking_id).toBe(ID)
    expect(rpcArgs.p_to).toBe('cancelled')
    expect(JSON.stringify(rpcArgs)).not.toContain('pi_rt')
  })

  it('leg=outbound uses outbound_amount_czk', async () => {
    wireSupabase({
      booking: {
        id: ID,
        status: 'confirmed',
        payment_intent_id: 'pi_rt',
        outbound_amount_czk: 5000,
        return_amount_czk: 2500,
      },
    })
    mockRefundsCreate.mockResolvedValue({ id: 're_out' })

    await POST(makeRequest({ id: ID, leg: 'outbound' }))
    expect(mockRefundsCreate).toHaveBeenCalledWith({
      payment_intent: 'pi_rt',
      amount: Math.round(czkToEur(5000) * 100),
      metadata: { leg: 'outbound' },
    })
  })

  it('missing leg amount: 422 and no refund, no update', async () => {
    wireSupabase({
      booking: {
        id: ID,
        status: 'confirmed',
        payment_intent_id: 'pi_rt',
        outbound_amount_czk: 5000,
        return_amount_czk: null,
      },
    })
    const res = await POST(makeRequest({ id: ID, leg: 'return' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: 'Cannot compute per-leg refund: missing leg amount',
    })
    expect(mockRefundsCreate).not.toHaveBeenCalled()
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(1)
  })

  it('StripeInvalidRequestError: 422 over-refund message, bookings not updated', async () => {
    wireSupabase({
      booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_over' },
    })
    mockRefundsCreate.mockRejectedValue(new MockStripeInvalidRequestError('already refunded'))

    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: 'Refund amount exceeds remaining refundable balance. Contact Stripe support.',
    })
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(1)
  })

  it('other Stripe error: 502 with the message, bookings not updated', async () => {
    wireSupabase({
      booking: { id: ID, status: 'pending', payment_intent_id: 'pi_boom' },
    })
    mockRefundsCreate.mockRejectedValue(new Error('network down'))

    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'network down' })
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(1)
  })

  it('DB update error after a refund: 500 DB update failed', async () => {
    wireSupabase({
      booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_xxx' },
      updateError: { message: 'write failed' },
    })
    mockRefundsCreate.mockResolvedValue({ id: 're_db' })

    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'DB update failed' })
  })

  it('DB update error on a manual booking: 500 DB update failed', async () => {
    wireSupabase({
      booking: { id: ID, status: 'pending', payment_intent_id: null },
      updateError: { message: 'write failed' },
    })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'DB update failed' })
  })

  it('runs no email, payment-link deactivation, QStash or GNet push on any successful cancel path', async () => {
    wireSupabase({
      booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_xxx' },
    })
    mockRefundsCreate.mockResolvedValue({ id: 're_none' })
    await POST(makeRequest({ id: ID }))
    expectNoSideEffects()
  })
})
