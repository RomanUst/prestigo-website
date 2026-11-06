import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/admin/bookings/cancel.
// Phase 87 Plan 01 characterized the route; Phase 88 plan 16 (D-20, Phase 87 WR-01) rewrote the order:
// the status compare-and-set runs FIRST, only the writer whose cancel applied refunds (pay-now) or releases the
// hold (card_hold), and a money failure after the cancel keeps the booking cancelled (502 refund_failed + ledger
// row + operator alert). After the money step succeeded the client gets the cancelled email; the route still
// deactivates no link, schedules nothing and pushes nothing to GNet.

const {
  mockGetAdminUser,
  mockSupabaseFrom,
  mockRpc,
  mockRefundsCreate,
  mockAlert,
  mockReleaseHold,
  mockLogEmail,
  mockSendConfirmed,
  mockSendCancelled,
  mockSendPostTrip,
  mockScheduleQStash,
  mockDeactivateLink,
  mockPushGnetStatus,
  mockAfter,
} = vi.hoisted(() => {
  return {
    mockGetAdminUser: vi.fn(),
    mockSupabaseFrom: vi.fn(),
    mockRpc: vi.fn(),
    mockRefundsCreate: vi.fn(),
    mockAlert: vi.fn(),
    mockReleaseHold: vi.fn(),
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

vi.mock('@/lib/payments/stripe', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments/stripe')>()
  return { ...actual, getPaymentsStripe: () => ({ refunds: { create: mockRefundsCreate } }) }
})
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: mockAlert }))
vi.mock('@/lib/payments/hold', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/hold')>()),
  releaseHold: mockReleaseHold,
}))

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
 * advance_booking_status compare-and-set RPC (Phase 87-03); the refund_failed marker is the
 * append_payment_event RPC (Phase 88-01). `rpcResult` overrides the status RPC answer (default: applied).
 */
function wireSupabase(opts: {
  booking: Record<string, unknown> | null
  selectError?: unknown
  updateError?: unknown
  rpcResult?: unknown
  /** The payment columns read again after the status CAS (88-REVIEW C-WR-01); default: the same booking. */
  fresh?: Record<string, unknown> | null
}) {
  const singleFn = vi.fn().mockResolvedValue({
    data: opts.booking,
    error: opts.selectError ?? (opts.booking ? null : { message: 'not found' }),
  })
  const selectEq = vi.fn().mockReturnValue({ single: singleFn })
  const selectFn = vi.fn().mockReturnValue({ eq: selectEq })
  const freshMaybe = vi.fn().mockResolvedValue({ data: opts.fresh === undefined ? opts.booking : opts.fresh, error: null })
  const freshSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: freshMaybe }) })

  mockSupabaseFrom.mockReturnValueOnce({ select: selectFn }).mockReturnValue({ select: freshSelect })
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'append_payment_event') return { data: { inserted: true }, error: null }
    if (opts.updateError) return { data: null, error: opts.updateError }
    return { data: opts.rpcResult ?? { applied: true }, error: null }
  })

  return { selectFn, rpcFn: mockRpc }
}

/** The advance_booking_status calls only (the ledger append is a second RPC). */
const statusCalls = () => mockRpc.mock.calls.filter((c) => c[0] === 'advance_booking_status')
const ledgerCalls = () => mockRpc.mock.calls.filter((c) => c[0] === 'append_payment_event')

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
  mockRefundsCreate.mockReset()
  mockReleaseHold.mockReset()
  mockAlert.mockReset()
  mockAlert.mockResolvedValue('sent')
  mockGetAdminUser.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
})

describe('POST /api/admin/bookings/cancel', () => {
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

  it('400 for malformed JSON, nothing read or written', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      }),
    )
    expect(res.status).toBe(400)
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
    expect(mockRefundsCreate).not.toHaveBeenCalled()
  })

  it('404 Booking not found when the select fails', async () => {
    wireSupabase({ booking: null })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Booking not found' })
  })

  it.each(['completed', 'cancelled', 'no_show'])(
    "422 for status '%s' with no refund and no bookings update",
    async (status) => {
      wireSupabase({ booking: { id: ID, status, payment_intent_id: 'pi_xxx' } })
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({
        error: `Cannot cancel a booking with status '${status}'`,
      })
      expect(mockRefundsCreate).not.toHaveBeenCalled()
      expect(mockRpc).not.toHaveBeenCalled()
      // only the select ran
      expect(mockSupabaseFrom).toHaveBeenCalledTimes(1)
    },
  )

  it('a completed card booking cannot be cancelled: 422, no release, no write', async () => {
    wireSupabase({
      booking: { id: ID, status: 'completed', payment_mode: 'card_hold', payment_state: 'captured', payment_intent_id: 'pi_cap' },
    })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(422)
    expect(mockReleaseHold).not.toHaveBeenCalled()
    expect(mockRefundsCreate).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

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

  it('paid booking without leg: the status CAS runs BEFORE the full refund (key refund:<id>:full), response carries refund_id', async () => {
    const { rpcFn } = wireSupabase({
      booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_xxx' },
    })
    mockRefundsCreate.mockResolvedValue({ id: 're_full' })

    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, refund_id: 're_full' })
    expect(mockRefundsCreate).toHaveBeenCalledWith(
      { payment_intent: 'pi_xxx' },
      { idempotencyKey: `refund:${ID}:full` },
    )
    expect(rpcFn).toHaveBeenCalledWith(
      'advance_booking_status',
      expect.objectContaining({ p_from: 'confirmed', p_to: 'cancelled' }),
    )

    const refundOrder = mockRefundsCreate.mock.invocationCallOrder[0]
    const updateOrder = rpcFn.mock.invocationCallOrder[0]
    expect(updateOrder).toBeLessThan(refundOrder)
    expect(ledgerCalls()).toHaveLength(0)
    expect(mockAlert).not.toHaveBeenCalled()
    expectNoSideEffects()
  })

  it('leg=return with return_amount_czk 2500: CAS first, then the partial refund amount, metadata.leg and key', async () => {
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
    expect(mockRefundsCreate).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_rt',
        amount: Math.round(czkToEur(2500) * 100),
        metadata: { leg: 'return' },
      },
      { idempotencyKey: `refund:${ID}:return` },
    )
    expect(rpcFn.mock.invocationCallOrder[0]).toBeLessThan(mockRefundsCreate.mock.invocationCallOrder[0])
    // the status write is scoped to the booking id ONLY so the paired leg is untouched
    expect(statusCalls()).toHaveLength(1)
    const rpcArgs = statusCalls()[0][1] as Record<string, unknown>
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
    expect(mockRefundsCreate).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_rt',
        amount: Math.round(czkToEur(5000) * 100),
        metadata: { leg: 'outbound' },
      },
      { idempotencyKey: `refund:${ID}:outbound` },
    )
  })

  it('missing leg amount: 422, no CAS, no refund', async () => {
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
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(1)
  })

  // ── D-20: a money failure after the cancel applied keeps the cancel ─────────────────────────

  it('StripeInvalidRequestError after the CAS: 502 refund_failed, booking stays cancelled, one ledger row, one alert', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    wireSupabase({
      booking: {
        id: ID,
        status: 'confirmed',
        payment_intent_id: 'pi_over',
        amount_eur: 120,
        booking_reference: 'PR-1',
      },
    })
    mockRefundsCreate.mockRejectedValue(
      Object.assign(new Error('already refunded'), { type: 'StripeInvalidRequestError', code: 'charge_already_refunded' }),
    )

    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'refund_failed', cancelled: true, amount_minor: 12000, currency: 'eur' })

    // the cancel was applied (and never rolled back)
    expect(statusCalls()).toHaveLength(1)
    // one refund_failed ledger row: error code only, no message
    expect(ledgerCalls()).toHaveLength(1)
    const event = (ledgerCalls()[0][1] as { p_event: Record<string, unknown> }).p_event
    expect(event).toMatchObject({
      key: `refund_failed:${ID}:full`,
      kind: 'refund_failed',
      amount_minor: 12000,
      currency: 'eur',
      error_code: 'charge_already_refunded',
      actor_type: 'admin',
      actor_id: 'admin-1',
    })
    expect(JSON.stringify(event)).not.toContain('already refunded')
    // one operator alert
    expect(mockAlert).toHaveBeenCalledTimes(1)
    expect(mockAlert).toHaveBeenCalledWith(
      'refund_failed',
      expect.objectContaining({ id: ID, booking_reference: 'PR-1' }),
      expect.objectContaining({ eventKey: `alert:refund_failed:${ID}:full`, amountMinor: 12000, code: 'charge_already_refunded' }),
    )
    errorSpy.mockRestore()
  })

  it('other Stripe error after the CAS: 502 refund_failed with the leg amount, key refund_failed:<id>:return', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    wireSupabase({
      booking: { id: ID, status: 'pending', payment_intent_id: 'pi_boom', return_amount_czk: 2500 },
    })
    mockRefundsCreate.mockRejectedValue(new Error('network down'))

    const res = await POST(makeRequest({ id: ID, leg: 'return' }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      error: 'refund_failed',
      cancelled: true,
      amount_minor: Math.round(czkToEur(2500) * 100),
      currency: 'eur',
    })
    expect(statusCalls()).toHaveLength(1)
    expect(ledgerCalls()).toHaveLength(1)
    expect((ledgerCalls()[0][1] as { p_event: { key: string; error_code: string } }).p_event).toMatchObject({
      key: `refund_failed:${ID}:return`,
      error_code: 'unknown',
    })
    expect(mockAlert).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it('a ledger or alert problem does not change the 502 answer', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    wireSupabase({ booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_x', amount_eur: 50 } })
    const original = mockRpc.getMockImplementation()!
    mockRpc.mockImplementation(async (name: string, args: unknown) =>
      name === 'append_payment_event' ? { data: null, error: { message: 'ledger down' } } : original(name, args),
    )
    mockAlert.mockRejectedValue(new Error('resend down'))
    mockRefundsCreate.mockRejectedValue(new Error('stripe down'))

    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'refund_failed', cancelled: true })
    errorSpy.mockRestore()
  })

  it('DB update error on a paid booking: 500 DB update failed and NO refund (the cancel did not apply)', async () => {
    wireSupabase({
      booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_xxx' },
      updateError: { message: 'write failed' },
    })

    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'DB update failed' })
    expect(mockRefundsCreate).not.toHaveBeenCalled()
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

  // ── Phase 87-03: compare-and-set, explicit lost-race responses (D-01) ──────────────────────

  it('manual booking confirmed: rpc p_from confirmed, p_to cancelled, p_source admin_cancel, 200', async () => {
    const { rpcFn } = wireSupabase({
      booking: { id: ID, status: 'confirmed', payment_intent_id: null },
    })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(rpcFn).toHaveBeenCalledWith(
      'advance_booking_status',
      expect.objectContaining({ p_from: 'confirmed', p_to: 'cancelled', p_source: 'admin_cancel' }),
    )
  })

  it('a booking already on board can still be cancelled (on_board -> cancelled)', async () => {
    const { rpcFn } = wireSupabase({
      booking: { id: ID, status: 'on_board', payment_intent_id: null },
    })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(200)
    expect(rpcFn).toHaveBeenCalledWith(
      'advance_booking_status',
      expect.objectContaining({ p_from: 'on_board', p_to: 'cancelled' }),
    )
  })

  it('no_show is terminal: 422 with the exact message and no refund, no status write', async () => {
    wireSupabase({ booking: { id: ID, status: 'no_show', payment_intent_id: 'pi_ns' } })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: "Cannot cancel a booking with status 'no_show'" })
    expect(mockRefundsCreate).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('lost race, no payment: 409 status_conflict with the winner status (driver completed meanwhile)', async () => {
    wireSupabase({
      booking: { id: ID, status: 'on_board', payment_intent_id: null },
      rpcResult: { applied: false, current_status: 'completed' },
    })
    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'status_conflict', currentStatus: 'completed' })
    expect(mockRefundsCreate).not.toHaveBeenCalled()
    expectNoSideEffects()
  })

  it('lost race on a paid booking (WR-01): 409 status_conflict, NO refund attempted, no ledger row, no alert', async () => {
    wireSupabase({
      booking: { id: ID, status: 'on_board', payment_intent_id: 'pi_race' },
      rpcResult: { applied: false, current_status: 'completed' },
    })
    mockRefundsCreate.mockResolvedValue({ id: 're_race' })

    const res = await POST(makeRequest({ id: ID }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'status_conflict', currentStatus: 'completed' })
    expect(mockRefundsCreate).not.toHaveBeenCalled()
    expect(mockReleaseHold).not.toHaveBeenCalled()
    expect(ledgerCalls()).toHaveLength(0)
    expect(mockAlert).not.toHaveBeenCalled()
  })

  describe('client email', () => {
    const CLIENT = { client_email: 'client@example.com', booking_reference: 'PR-1' }

    /** Runs the deferred email work against the given notification flags. */
    async function runDeferredEmail(flags: Record<string, boolean> | null = null) {
      mockSupabaseFrom.mockReturnValue({
        select: () => ({ eq: () => ({ single: async () => ({ data: { notification_flags: flags } }) }) }),
      })
      mockLogEmail.mockResolvedValue(true)
      expect(mockAfter).toHaveBeenCalledTimes(1)
      await (mockAfter.mock.calls[0][0] as () => Promise<void>)()
    }

    it('pay-now refund: says the payment is being refunded', async () => {
      wireSupabase({ booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_xxx', ...CLIENT } })
      mockRefundsCreate.mockResolvedValue({ id: 're_1' })
      await POST(makeRequest({ id: ID }))
      await runDeferredEmail()
      expect(mockLogEmail).toHaveBeenCalledWith({
        bookingId: ID,
        emailType: 'booking_cancelled',
        recipient: 'client@example.com',
      })
      expect(mockSendCancelled).toHaveBeenCalledWith(expect.objectContaining(CLIENT), 'refund')
    })

    it('card hold released: says nothing was charged', async () => {
      const booking = { id: ID, status: 'confirmed', payment_mode: 'card_hold', payment_state: 'card_saved', ...CLIENT }
      wireSupabase({ booking })
      mockReleaseHold.mockResolvedValue('released')
      await POST(makeRequest({ id: ID }))
      await runDeferredEmail()
      expect(mockSendCancelled).toHaveBeenCalledWith(expect.objectContaining(CLIENT), 'no_charge')
    })

    it('manual booking: the plain email, no money line', async () => {
      wireSupabase({ booking: { id: ID, status: 'confirmed', payment_intent_id: null, ...CLIENT } })
      await POST(makeRequest({ id: ID }))
      await runDeferredEmail()
      expect(mockSendCancelled).toHaveBeenCalledWith(expect.objectContaining(CLIENT), null)
    })

    it('a failed refund promises nothing: no email', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      wireSupabase({ booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_xxx', ...CLIENT } })
      mockRefundsCreate.mockRejectedValue(new Error('stripe down'))
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(502)
      expect(mockAfter).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('respects the cancelled notification flag', async () => {
      wireSupabase({ booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_xxx', ...CLIENT } })
      mockRefundsCreate.mockResolvedValue({ id: 're_1' })
      await POST(makeRequest({ id: ID }))
      await runDeferredEmail({ cancelled: false })
      expect(mockLogEmail).not.toHaveBeenCalled()
      expect(mockSendCancelled).not.toHaveBeenCalled()
    })

    it.each([
      ['an abandoned unpaid checkout', { status: 'unpaid' }],
      ['a partner passenger', { status: 'confirmed', booking_source: 'gnet' }],
    ])('sends nothing to %s', async (_name, extra) => {
      wireSupabase({ booking: { id: ID, payment_intent_id: null, ...CLIENT, ...extra } })
      await POST(makeRequest({ id: ID }))
      expect(mockAfter).not.toHaveBeenCalled()
    })
  })

  it('runs no payment-link deactivation, QStash or GNet push on any successful cancel path', async () => {
    wireSupabase({
      booking: { id: ID, status: 'confirmed', payment_intent_id: 'pi_xxx' },
    })
    mockRefundsCreate.mockResolvedValue({ id: 're_none' })
    await POST(makeRequest({ id: ID }))
    expectNoSideEffects()
  })

  // ── Phase 88 D-04: card_hold bookings release the hold after the CAS ────────────────────────

  describe('card_hold booking', () => {
    const holdBooking = (state: string, extra: Record<string, unknown> = {}) => ({
      id: ID,
      status: 'confirmed',
      payment_intent_id: null,
      payment_mode: 'card_hold',
      payment_state: state,
      payment_currency: 'eur',
      payment_amount_minor: 12000,
      hold_amount_minor: state === 'authorized' ? 12000 : null,
      booking_reference: 'PR-HOLD',
      ...extra,
    })

    it('authorized: CAS first, then releaseHold(reason cancel) -> 200 { ok, released }; no refund', async () => {
      const { rpcFn } = wireSupabase({ booking: holdBooking('authorized') })
      mockReleaseHold.mockResolvedValue('released')

      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, released: true })
      expect(mockReleaseHold).toHaveBeenCalledTimes(1)
      expect(mockReleaseHold).toHaveBeenCalledWith(
        expect.objectContaining({ id: ID, payment_state: 'authorized' }),
        { actor: { type: 'admin', id: 'admin-1' }, reason: 'cancel' },
      )
      expect(rpcFn.mock.invocationCallOrder[0]).toBeLessThan(mockReleaseHold.mock.invocationCallOrder[0])
      expect(mockRefundsCreate).not.toHaveBeenCalled()
      expect(mockAlert).not.toHaveBeenCalled()
      expectNoSideEffects()
    })

    it('card_saved: released without a Stripe call -> 200', async () => {
      wireSupabase({ booking: holdBooking('card_saved') })
      mockReleaseHold.mockResolvedValue('released')
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, released: true })
      expect(mockRefundsCreate).not.toHaveBeenCalled()
    })

    it('a noop release (nothing to release) still answers 200 { ok }', async () => {
      wireSupabase({ booking: holdBooking('none') })
      mockReleaseHold.mockResolvedValue('noop')
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })

    // 88-REVIEW T4 (C-CR-01): a card booking the client already paid (recovery link) before the trip.
    it('captured before the trip: CAS first, then a full refund of the collected payment -> 200; no release', async () => {
      const { rpcFn } = wireSupabase({
        booking: holdBooking('captured', { payment_intent_id: 'pi_rec', captured_amount_minor: 12000 }),
      })
      mockRefundsCreate.mockResolvedValue({ id: 're_card_1' })
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, refund_id: 're_card_1' })
      expect(mockRefundsCreate).toHaveBeenCalledWith({ payment_intent: 'pi_rec' }, { idempotencyKey: `refund:${ID}:full` })
      expect(rpcFn.mock.invocationCallOrder[0]).toBeLessThan(mockRefundsCreate.mock.invocationCallOrder[0])
      expect(mockReleaseHold).not.toHaveBeenCalled()
      expect(mockAlert).not.toHaveBeenCalled()
      expectNoSideEffects()
    })

    it('captured, refund fails: the booking stays cancelled, 502 with the collected amount, refund_failed row + alert (D-20)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      wireSupabase({
        booking: holdBooking('captured', { payment_intent_id: 'pi_rec', captured_amount_minor: 9000, payment_currency: 'czk' }),
      })
      mockRefundsCreate.mockRejectedValue(Object.assign(new Error('no'), { code: 'charge_disputed' }))
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'refund_failed', cancelled: true, amount_minor: 9000, currency: 'czk' })
      expect(statusCalls()).toHaveLength(1)
      expect((ledgerCalls()[0][1] as { p_event: Record<string, unknown> }).p_event).toMatchObject({
        kind: 'refund_failed',
        amount_minor: 9000,
        currency: 'czk',
        error_code: 'charge_disputed',
      })
      expect(mockAlert).toHaveBeenCalledWith('refund_failed', expect.anything(), expect.objectContaining({ amountMinor: 9000, note: undefined }))
      errorSpy.mockRestore()
    })

    it('captured without a payment id: never answers ok, the operator refunds by hand', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      wireSupabase({ booking: holdBooking('captured', { payment_intent_id: null, captured_amount_minor: 12000 }) })
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(502)
      expect((ledgerCalls()[0][1] as { p_event: Record<string, unknown> }).p_event).toMatchObject({ error_code: 'no_payment_intent' })
      expect(mockRefundsCreate).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    // 88-REVIEW C-WR-01: the tick claimed the row between the route's read and the status CAS.
    it('releases from the payment state read AFTER the status CAS, not the stale snapshot', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      wireSupabase({ booking: holdBooking('card_saved'), fresh: { payment_state: 'placing_hold', payment_mode: 'card_hold' } })
      mockReleaseHold.mockResolvedValue('busy')
      const res = await POST(makeRequest({ id: ID }))
      expect(mockReleaseHold).toHaveBeenCalledWith(expect.objectContaining({ payment_state: 'placing_hold' }), expect.anything())
      expect(res.status).toBe(502)
      expect(mockAlert).toHaveBeenCalledTimes(1)
      errorSpy.mockRestore()
    })

    it('a noop release while a hold is still live is never answered ok (D-20 trail instead)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      wireSupabase({ booking: holdBooking('card_saved'), fresh: { payment_state: 'authorized', payment_mode: 'card_hold' } })
      mockReleaseHold.mockResolvedValue('noop')
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(502)
      expect(await res.json()).toMatchObject({ error: 'refund_failed', cancelled: true })
      expect((ledgerCalls()[0][1] as { p_event: Record<string, unknown> }).p_event).toMatchObject({ error_code: 'state_moved' })
      expect(mockAlert).toHaveBeenCalledWith('refund_failed', expect.anything(), expect.objectContaining({ note: 'release' }))
      errorSpy.mockRestore()
    })

    it('a noop release on an already released booking answers 200 { ok }', async () => {
      wireSupabase({ booking: holdBooking('card_saved'), fresh: { payment_state: 'released', payment_mode: 'card_hold' } })
      mockReleaseHold.mockResolvedValue('noop')
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })

    it.each(['placing_hold', 'capturing'])('%s: 409 payment_busy with no CAS and no release', async (state) => {
      wireSupabase({ booking: holdBooking(state) })
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'payment_busy' })
      expect(mockRpc).not.toHaveBeenCalled()
      expect(mockReleaseHold).not.toHaveBeenCalled()
      expect(mockRefundsCreate).not.toHaveBeenCalled()
    })

    it('88-REVIEW A-WR-06: placing_hold whose lease lapsed (dead worker) is no longer busy: the cancel releases it', async () => {
      wireSupabase({
        booking: holdBooking('placing_hold', { payment_lease_until: new Date(Date.now() - 60_000).toISOString() }),
      })
      mockReleaseHold.mockResolvedValue('released')
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(200)
      expect(mockReleaseHold).toHaveBeenCalledWith(expect.objectContaining({ payment_state: 'placing_hold' }), expect.anything())
    })

    it('88-REVIEW A-WR-06: placing_hold with a live lease stays busy', async () => {
      wireSupabase({
        booking: holdBooking('placing_hold', { payment_lease_until: new Date(Date.now() + 60_000).toISOString() }),
      })
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(409)
      expect(mockReleaseHold).not.toHaveBeenCalled()
    })

    it('lost race: 409 status_conflict and the hold is NOT released', async () => {
      wireSupabase({
        booking: holdBooking('authorized'),
        rpcResult: { applied: false, current_status: 'completed' },
      })
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'status_conflict', currentStatus: 'completed' })
      expect(mockReleaseHold).not.toHaveBeenCalled()
    })

    it('releaseHold throwing after the CAS: 502 refund_failed with the hold amount, ledger row, alert that says release', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      wireSupabase({ booking: holdBooking('authorized') })
      mockReleaseHold.mockRejectedValue(Object.assign(new Error('stripe down'), { code: 'api_connection_error' }))

      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'refund_failed', cancelled: true, amount_minor: 12000, currency: 'eur' })
      expect(statusCalls()).toHaveLength(1)
      expect(ledgerCalls()).toHaveLength(1)
      expect((ledgerCalls()[0][1] as { p_event: Record<string, unknown> }).p_event).toMatchObject({
        key: `refund_failed:${ID}:full`,
        kind: 'refund_failed',
        amount_minor: 12000,
        error_code: 'api_connection_error',
      })
      expect(mockAlert).toHaveBeenCalledTimes(1)
      expect(mockAlert).toHaveBeenCalledWith(
        'refund_failed',
        expect.objectContaining({ id: ID }),
        expect.objectContaining({ note: 'release', amountMinor: 12000 }),
      )
      errorSpy.mockRestore()
    })

    it('a release that turns busy after the CAS is reported as a failed release (the operator must act)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      wireSupabase({ booking: holdBooking('card_saved') })
      mockReleaseHold.mockResolvedValue('busy')
      const res = await POST(makeRequest({ id: ID }))
      expect(res.status).toBe(502)
      expect(await res.json()).toMatchObject({ error: 'refund_failed', cancelled: true })
      expect((ledgerCalls()[0][1] as { p_event: Record<string, unknown> }).p_event).toMatchObject({ error_code: 'busy' })
      errorSpy.mockRestore()
    })
  })
})
