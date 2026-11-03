import { describe, it, expect, beforeEach, vi } from 'vitest'

// Phase 87 Plan 01 — unit tests for lib/booking-status-service.ts (D-01) and the
// single GNet push helper lib/gnet-push.ts (D-04). The PATCH / GNet / assignment
// suites are the parity net; this file pins the service contract itself.

const afterCallbacks: Array<() => unknown> = []

const {
  mockPushGnetStatus,
  mockLogEmail,
  mockScheduleQStash,
  mockDeactivateLink,
  mockSendConfirmed,
  mockSendCancelled,
  mockSendPostTrip,
  mockSupabaseFrom,
  mockRpc,
  mockEmitCompleted,
  mockGnetBookingsUpdate,
} = vi.hoisted(() => ({
  mockPushGnetStatus: vi.fn(),
  mockLogEmail: vi.fn(),
  mockScheduleQStash: vi.fn(),
  mockDeactivateLink: vi.fn(),
  mockSendConfirmed: vi.fn(),
  mockSendCancelled: vi.fn(),
  mockSendPostTrip: vi.fn(),
  mockSupabaseFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockEmitCompleted: vi.fn(),
  mockGnetBookingsUpdate: vi.fn(),
}))

async function flushAfterCallbacks() {
  const cbs = afterCallbacks.splice(0)
  await Promise.all(cbs.map(cb => cb()))
}

vi.mock('@/lib/gnet-client', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/gnet-client')>()
  return { ...actual, pushGnetStatus: mockPushGnetStatus }
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ from: mockSupabaseFrom, rpc: mockRpc }),
}))

vi.mock('@/lib/booking-events', () => ({ emitBookingCompleted: mockEmitCompleted }))

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

vi.mock('next/server', async (importActual) => {
  const actual = await importActual<typeof import('next/server')>()
  return {
    ...actual,
    after: (cb: () => unknown) => {
      afterCallbacks.push(cb)
    },
  }
})

import {
  advanceBookingStatus,
  advanceResultToResponse,
  type AdvanceBookingStatusResult,
} from '@/lib/booking-status-service'

const BOOKING_ID = 'a1b2c3d4-e5f6-4789-a1b2-c3d4e5f6a7b8'
const GNET_ROW_ID = 'b2c3d4e5-f6a7-4890-b1c2-d3e4f5a6b7c8'

const baseRow = {
  id: BOOKING_ID,
  status: 'pending',
  booking_source: 'website',
  client_email: 'a@b.com',
  pickup_utc: null as string | null,
  amount_eur: 120,
  payment_link_id: null as string | null,
}

function buildSupabaseMock({
  bookingData = baseRow as Record<string, unknown> | null,
  selectError = null as unknown,
  updateError = null as unknown,
  rpcData = undefined as unknown,
  gnetData = { id: GNET_ROW_ID, gnet_res_no: 'RES-123' } as Record<string, unknown> | null,
  flags = null as Record<string, boolean> | null,
} = {}) {
  // advance_booking_status RPC (migration 084): applied row by default, or the supplied result
  mockRpc.mockImplementation(async (_fn: string, args: Record<string, unknown>) => {
    if (updateError) return { data: null, error: updateError }
    if (rpcData !== undefined) return { data: rpcData, error: null }
    return {
      data: {
        applied: true,
        previous_status: args.p_from,
        booking: {
          ...(bookingData ?? {}),
          status: args.p_to,
          completed_at: args.p_to === 'completed' ? '2026-11-03T10:00:00.000Z' : null,
        },
      },
      error: null,
    }
  })
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'bookings') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: selectError ? null : bookingData,
              error: selectError ?? (bookingData ? null : 'not found'),
            }),
          }),
        }),
      }
    }
    if (table === 'gnet_bookings') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: gnetData, error: gnetData ? null : 'not found' }),
          }),
        }),
        update: (payload: unknown) => {
          mockGnetBookingsUpdate(payload)
          return { eq: async () => ({ error: null }) }
        },
      }
    }
    if (table === 'pricing_globals') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { notification_flags: flags }, error: null }),
          }),
        }),
      }
    }
    return {}
  })
}

const adminActor = { type: 'admin' as const, id: 'admin-1' }

function rpcPatch() {
  return (mockRpc.mock.calls[0][1] as Record<string, unknown>).p_patch
}

beforeEach(() => {
  vi.clearAllMocks()
  afterCallbacks.splice(0)
  mockLogEmail.mockResolvedValue(false)
  mockDeactivateLink.mockResolvedValue(undefined)
  mockSendConfirmed.mockResolvedValue(undefined)
  mockSendCancelled.mockResolvedValue(undefined)
  mockSendPostTrip.mockResolvedValue(undefined)
  mockPushGnetStatus.mockResolvedValue(undefined)
})

describe('advanceBookingStatus — profile full (admin PATCH parity)', () => {
  it('pending -> confirmed succeeds and writes only { status }', async () => {
    buildSupabaseMock()
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.applied).toBe(true)
      expect(result.previous).toBe('pending')
      expect(result.current).toBe('confirmed')
    }
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('advance_booking_status', {
      p_booking_id: BOOKING_ID,
      p_from: 'pending',
      p_to: 'confirmed',
      p_actor_type: 'admin',
      p_actor_id: 'admin-1',
      p_source: 'admin_patch',
      p_patch: {},
    })
  })

  it('includes operator_notes and driver_price_czk only when given in patch', async () => {
    buildSupabaseMock()
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
      patch: { operator_notes: 'VIP', driver_price_czk: 900 },
    })
    expect(rpcPatch()).toEqual({ operator_notes: 'VIP', driver_price_czk: 900 })
  })

  it('completed -> pending is invalid_transition with the exact message and no write', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'completed' } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'pending',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_transition',
      message: "Cannot transition from 'completed' to 'pending'",
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('select error -> not_found', async () => {
    buildSupabaseMock({ selectError: { message: 'boom' } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    expect(result).toMatchObject({ ok: false, code: 'not_found', message: 'Booking not found' })
  })

  it('no row -> not_found', async () => {
    buildSupabaseMock({ bookingData: null })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    expect(result).toMatchObject({ ok: false, code: 'not_found', message: 'Booking not found' })
  })

  it('update error -> db_error', async () => {
    buildSupabaseMock({ updateError: { message: 'write failed' } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    expect(result).toMatchObject({ ok: false, code: 'db_error', message: 'DB update failed' })
  })

  it('clears a stale payment link on unpaid -> confirmed and deactivates it via after()', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'unpaid', payment_link_id: 'plink_1' } })
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    expect(rpcPatch()).toEqual({ clear_payment_link: true })
    expect(mockDeactivateLink).not.toHaveBeenCalled()
    await flushAfterCallbacks()
    expect(mockDeactivateLink).toHaveBeenCalledWith('plink_1')
  })

  it('sends the dedup-gated confirmed email and schedules the QStash reminder', async () => {
    mockLogEmail.mockResolvedValue(true)
    const pickup = '2026-12-01T10:00:00.000Z'
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'pending', pickup_utc: pickup } })
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    await flushAfterCallbacks()
    expect(mockLogEmail).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      emailType: 'booking_confirmed',
      recipient: 'a@b.com',
    })
    expect(mockSendConfirmed).toHaveBeenCalledTimes(1)
    expect(mockScheduleQStash).toHaveBeenCalledWith(BOOKING_ID, new Date(pickup).getTime())
  })

  it('skips the email when notification_flags disables the status', async () => {
    mockLogEmail.mockResolvedValue(true)
    buildSupabaseMock({ flags: { confirmed: false } })
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    await flushAfterCallbacks()
    expect(mockLogEmail).not.toHaveBeenCalled()
    expect(mockSendConfirmed).not.toHaveBeenCalled()
  })

  it('gnet booking confirmed -> assigned pushes ASSIGNED exactly once', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'confirmed', booking_source: 'gnet' } })
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'assigned',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    await flushAfterCallbacks()
    expect(mockPushGnetStatus).toHaveBeenCalledTimes(1)
    expect(mockPushGnetStatus).toHaveBeenCalledWith('RES-123', 'ASSIGNED', '120.00')
    expect(mockGnetBookingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ last_push_status: 'ASSIGNED', last_push_error: null }),
    )
  })

  it('non-gnet booking never pushes to GNet', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'confirmed', booking_source: 'website' } })
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'assigned',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    await flushAfterCallbacks()
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
    const gnetCalls = mockSupabaseFrom.mock.calls.filter(args => args[0] === 'gnet_bookings')
    expect(gnetCalls.length).toBe(0)
  })
})

describe('advanceBookingStatus — profile cancel-route', () => {
  const cancelRow = {
    ...baseRow,
    status: 'confirmed',
    booking_source: 'gnet',
    payment_link_id: 'plink_9',
    pickup_utc: '2026-12-01T10:00:00.000Z',
  }

  it('uses the supplied row (no select), writes only { status } scoped by id', async () => {
    buildSupabaseMock({ bookingData: cancelRow })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'cancelled',
      actor: adminActor,
      source: 'admin_cancel',
      profile: 'cancel-route',
      current: cancelRow,
    })
    expect(result.ok).toBe(true)
    // no select and no table write: the status change is one RPC call
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_from: 'confirmed', p_to: 'cancelled', p_source: 'admin_cancel' })
    expect(rpcPatch()).toEqual({})
  })

  it('runs no side effect at all (no email, no link deactivation, no QStash, no GNet push, no after)', async () => {
    mockLogEmail.mockResolvedValue(true)
    buildSupabaseMock({ bookingData: cancelRow })
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'cancelled',
      actor: adminActor,
      source: 'admin_cancel',
      profile: 'cancel-route',
      current: cancelRow,
    })
    await flushAfterCallbacks()
    expect(afterCallbacks.length).toBe(0)
    expect(mockLogEmail).not.toHaveBeenCalled()
    expect(mockSendCancelled).not.toHaveBeenCalled()
    expect(mockDeactivateLink).not.toHaveBeenCalled()
    expect(mockScheduleQStash).not.toHaveBeenCalled()
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
  })

  it('db error surfaces as db_error', async () => {
    buildSupabaseMock({ updateError: { message: 'write failed' } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'cancelled',
      actor: adminActor,
      source: 'admin_cancel',
      profile: 'cancel-route',
      current: cancelRow,
    })
    expect(result).toMatchObject({ ok: false, code: 'db_error' })
  })

  it('a terminal row is rejected by VALID_TRANSITIONS', async () => {
    buildSupabaseMock()
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'cancelled',
      actor: adminActor,
      source: 'admin_cancel',
      profile: 'cancel-route',
      current: { ...cancelRow, status: 'completed' },
    })
    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_transition',
      message: "Cannot transition from 'completed' to 'cancelled'",
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('advanceBookingStatus — profile assign-route', () => {
  const assignRow = {
    ...baseRow,
    status: 'confirmed',
    booking_source: 'gnet',
    payment_link_id: 'plink_7',
    pickup_utc: '2026-12-01T10:00:00.000Z',
  }
  const DRIVER_ID = 'c3d4e5f6-a7b8-4901-92d3-e4f5a6b7c8d9'

  it('writes { driver_id, status: assigned } in one update from the supplied row (no select)', async () => {
    buildSupabaseMock({ bookingData: assignRow })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'assigned',
      actor: adminActor,
      source: 'admin_assign',
      profile: 'assign-route',
      current: assignRow,
      patch: { driver_id: DRIVER_ID },
    })
    expect(result.ok).toBe(true)
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_from: 'confirmed', p_to: 'assigned', p_source: 'admin_assign' })
    expect(rpcPatch()).toEqual({ driver_id: DRIVER_ID })
  })

  it('gnet booking: pushes ASSIGNED once after the write, with the assign log prefix on failure', async () => {
    mockPushGnetStatus.mockRejectedValueOnce(new Error('GNet 503'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    buildSupabaseMock({ bookingData: assignRow })
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'assigned',
      actor: adminActor,
      source: 'admin_assign',
      profile: 'assign-route',
      current: assignRow,
      patch: { driver_id: DRIVER_ID },
    })
    await flushAfterCallbacks()
    expect(mockPushGnetStatus).toHaveBeenCalledTimes(1)
    expect(mockPushGnetStatus).toHaveBeenCalledWith('RES-123', 'ASSIGNED', '120.00')
    expect(errorSpy).toHaveBeenCalledWith(
      '[assign:gnet-push] failed',
      expect.objectContaining({ bookingId: BOOKING_ID, error: 'GNet 503' }),
    )
    expect(mockGnetBookingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ last_push_status: 'ASSIGNED', last_push_error: 'GNet 503' }),
    )
    errorSpy.mockRestore()
  })

  it('non-gnet booking: no push, and no after() scheduled', async () => {
    const row = { ...assignRow, booking_source: 'website' }
    buildSupabaseMock({ bookingData: row })
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'assigned',
      actor: adminActor,
      source: 'admin_assign',
      profile: 'assign-route',
      current: row,
      patch: { driver_id: DRIVER_ID },
    })
    await flushAfterCallbacks()
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
    expect(afterCallbacks.length).toBe(0)
  })

  it('sends no status email, schedules no QStash reminder and clears no payment link', async () => {
    mockLogEmail.mockResolvedValue(true)
    buildSupabaseMock({ bookingData: assignRow })
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'assigned',
      actor: adminActor,
      source: 'admin_assign',
      profile: 'assign-route',
      current: assignRow,
      patch: { driver_id: DRIVER_ID },
    })
    await flushAfterCallbacks()
    expect(mockLogEmail).not.toHaveBeenCalled()
    expect(mockSendConfirmed).not.toHaveBeenCalled()
    expect(mockScheduleQStash).not.toHaveBeenCalled()
    expect(mockDeactivateLink).not.toHaveBeenCalled()
    expect(rpcPatch()).not.toHaveProperty('clear_payment_link')
  })

  it('a failed write returns db_error and pushes nothing to GNet', async () => {
    buildSupabaseMock({ bookingData: assignRow, updateError: { message: 'write failed' } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'assigned',
      actor: adminActor,
      source: 'admin_assign',
      profile: 'assign-route',
      current: assignRow,
      patch: { driver_id: DRIVER_ID },
    })
    await flushAfterCallbacks()
    expect(result).toMatchObject({ ok: false, code: 'db_error' })
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
  })
})

describe('advanceBookingStatus — compare-and-set (D-01, PAYF-02)', () => {
  it('sends p_from = the validated status and the actor, and returns the RPC row (completed_at included)', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'on_location', booking_source: 'website' } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'completed',
      actor: { type: 'driver', id: 'driver-9' },
      source: 'driver_trip',
      profile: 'full',
    })
    expect(mockRpc).toHaveBeenCalledWith(
      'advance_booking_status',
      expect.objectContaining({
        p_from: 'on_location',
        p_to: 'completed',
        p_actor_type: 'driver',
        p_actor_id: 'driver-9',
        p_source: 'driver_trip',
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.booking.completed_at).toBe('2026-11-03T10:00:00.000Z')
  })

  it('an admin actor without an id is sent as p_actor_id null', async () => {
    buildSupabaseMock()
    await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: { type: 'admin', id: null },
      source: 'admin_patch',
      profile: 'full',
    })
    expect((mockRpc.mock.calls[0][1] as Record<string, unknown>).p_actor_id).toBeNull()
  })

  it('RPC applied false -> conflict with the winner status, and no side effect runs', async () => {
    mockLogEmail.mockResolvedValue(true)
    buildSupabaseMock({
      bookingData: { ...baseRow, status: 'pending', booking_source: 'gnet', payment_link_id: 'plink_1', pickup_utc: '2026-12-01T10:00:00.000Z' },
      rpcData: { applied: false, current_status: 'cancelled' },
    })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    await flushAfterCallbacks()
    expect(result).toMatchObject({ ok: false, code: 'conflict', currentStatus: 'cancelled' })
    expect(afterCallbacks.length).toBe(0)
    expect(mockLogEmail).not.toHaveBeenCalled()
    expect(mockSendConfirmed).not.toHaveBeenCalled()
    expect(mockScheduleQStash).not.toHaveBeenCalled()
    expect(mockDeactivateLink).not.toHaveBeenCalled()
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
    expect(mockEmitCompleted).not.toHaveBeenCalled()
  })

  it('RPC applied false with current_status null -> not_found', async () => {
    buildSupabaseMock({ rpcData: { applied: false, current_status: null } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    expect(result).toMatchObject({ ok: false, code: 'not_found', message: 'Booking not found' })
  })

  it('RPC error -> db_error', async () => {
    buildSupabaseMock({ updateError: { message: 'rpc failed' } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    expect(result).toMatchObject({ ok: false, code: 'db_error', message: 'DB update failed' })
  })

  it('RPC returning no data -> db_error', async () => {
    buildSupabaseMock({ rpcData: null })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'confirmed',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
    })
    expect(result).toMatchObject({ ok: false, code: 'db_error' })
  })

  it('expectedFrom different from the stored status -> conflict, RPC never called, no side effect', async () => {
    mockLogEmail.mockResolvedValue(true)
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'en_route', booking_source: 'gnet' } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'cancelled',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
      expectedFrom: 'assigned',
    })
    await flushAfterCallbacks()
    expect(result).toMatchObject({
      ok: false,
      code: 'conflict',
      currentStatus: 'en_route',
      message: 'status_conflict',
    })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockLogEmail).not.toHaveBeenCalled()
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
  })

  it('expectedFrom equal to the stored status proceeds to the RPC', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'assigned' } })
    const result = await advanceBookingStatus({
      bookingId: BOOKING_ID,
      to: 'en_route',
      actor: adminActor,
      source: 'admin_patch',
      profile: 'full',
      expectedFrom: 'assigned',
    })
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('two writers racing from the same status: exactly one applies, the other gets the winner status', async () => {
    // Model the database: the first CAS from 'on_location' wins, the second sees 'completed'.
    let dbStatus = 'on_location'
    mockRpc.mockImplementation(async (_fn: string, args: Record<string, unknown>) => {
      if (dbStatus === args.p_from) {
        dbStatus = args.p_to as string
        return { data: { applied: true, previous_status: args.p_from, booking: { ...baseRow, status: dbStatus } }, error: null }
      }
      return { data: { applied: false, current_status: dbStatus }, error: null }
    })
    mockSupabaseFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { ...baseRow, status: 'on_location' }, error: null }) }),
      }),
    }))
    const [driver, admin] = await Promise.all([
      advanceBookingStatus({
        bookingId: BOOKING_ID, to: 'completed', actor: { type: 'driver', id: 'd1' },
        source: 'driver_trip', profile: 'full',
      }),
      advanceBookingStatus({
        bookingId: BOOKING_ID, to: 'cancelled', actor: adminActor,
        source: 'admin_patch', profile: 'full',
      }),
    ])
    const applied = [driver, admin].filter(r => r.ok)
    const lost = [driver, admin].filter(r => !r.ok)
    expect(applied).toHaveLength(1)
    expect(lost).toHaveLength(1)
    expect(lost[0]).toMatchObject({ ok: false, code: 'conflict', currentStatus: dbStatus })
  })
})

describe('advanceBookingStatus — completion event (D-05, D-06)', () => {
  const completeInput = {
    bookingId: BOOKING_ID,
    to: 'completed',
    actor: adminActor,
    source: 'admin_patch',
    profile: 'full' as const,
  }

  it('applied completion: emitBookingCompleted runs once, from after(), with the RPC completed_at and partner false', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'on_location', booking_source: 'website' } })
    const result = await advanceBookingStatus(completeInput)
    expect(result.ok).toBe(true)
    // scheduled in after(), not run inline
    expect(mockEmitCompleted).not.toHaveBeenCalled()
    await flushAfterCallbacks()
    expect(mockEmitCompleted).toHaveBeenCalledTimes(1)
    expect(mockEmitCompleted).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      completedAt: '2026-11-03T10:00:00.000Z',
      partner: false,
      actorType: 'admin',
      source: 'admin_patch',
    })
  })

  it('a gnet booking completes with partner true', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'on_location', booking_source: 'gnet' } })
    await advanceBookingStatus(completeInput)
    await flushAfterCallbacks()
    expect(mockEmitCompleted).toHaveBeenCalledTimes(1)
    expect(mockEmitCompleted.mock.calls[0][0]).toMatchObject({ partner: true })
  })

  it('a driver completion carries the driver actor type and source', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'on_board' } })
    await advanceBookingStatus({
      ...completeInput,
      actor: { type: 'driver', id: 'driver-1' },
      source: 'driver_trip',
    })
    await flushAfterCallbacks()
    expect(mockEmitCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'driver', source: 'driver_trip' }),
    )
  })

  it('completedAt is null when the RPC row carries no completed_at', async () => {
    buildSupabaseMock({
      bookingData: { ...baseRow, status: 'on_location' },
      rpcData: { applied: true, previous_status: 'on_location', booking: { ...baseRow, status: 'completed' } },
    })
    await advanceBookingStatus(completeInput)
    await flushAfterCallbacks()
    expect(mockEmitCompleted.mock.calls[0][0]).toMatchObject({ completedAt: null })
  })

  it('never emits on a lost race (conflict)', async () => {
    buildSupabaseMock({
      bookingData: { ...baseRow, status: 'on_location' },
      rpcData: { applied: false, current_status: 'cancelled' },
    })
    const result = await advanceBookingStatus(completeInput)
    await flushAfterCallbacks()
    expect(result).toMatchObject({ ok: false, code: 'conflict' })
    expect(mockEmitCompleted).not.toHaveBeenCalled()
  })

  it('never emits on a stale expectedFrom (conflict, no RPC)', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'on_location' } })
    await advanceBookingStatus({ ...completeInput, expectedFrom: 'en_route' })
    await flushAfterCallbacks()
    expect(mockEmitCompleted).not.toHaveBeenCalled()
  })

  it('never emits on an invalid transition', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'cancelled' } })
    const result = await advanceBookingStatus(completeInput)
    await flushAfterCallbacks()
    expect(result).toMatchObject({ ok: false, code: 'invalid_transition' })
    expect(mockEmitCompleted).not.toHaveBeenCalled()
  })

  it('never emits on a db error', async () => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: 'on_location' }, updateError: { message: 'boom' } })
    const result = await advanceBookingStatus(completeInput)
    await flushAfterCallbacks()
    expect(result).toMatchObject({ ok: false, code: 'db_error' })
    expect(mockEmitCompleted).not.toHaveBeenCalled()
  })

  it.each(['en_route', 'on_board', 'cancelled', 'no_show'])('never emits for target %s', async (to) => {
    buildSupabaseMock({ bookingData: { ...baseRow, status: to === 'en_route' ? 'assigned' : 'on_location' } })
    const result = await advanceBookingStatus({ ...completeInput, to })
    await flushAfterCallbacks()
    expect(result.ok).toBe(true)
    expect(mockEmitCompleted).not.toHaveBeenCalled()
  })
})

describe('emitBookingCompleted (booking-events module)', () => {
  it('returns the event and logs ids only: no client name, email, phone or amount', async () => {
    const actual = await vi.importActual<typeof import('@/lib/booking-events')>('@/lib/booking-events')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const event = {
      bookingId: BOOKING_ID,
      completedAt: '2026-11-03T10:00:00.000Z',
      partner: true,
      actorType: 'driver' as const,
      source: 'driver_trip',
    }
    const returned = actual.emitBookingCompleted(event)
    expect(returned).toBe(event)
    expect(logSpy).toHaveBeenCalledTimes(1)
    const line = String(logSpy.mock.calls[0][0])
    expect(line).toContain('[booking-events] completed')
    expect(line).toContain(BOOKING_ID)
    expect(line).toContain('partner=true')
    expect(line).not.toMatch(/@|\+420|amount|name/i)
    logSpy.mockRestore()
  })
})

describe('advanceResultToResponse', () => {
  it('returns null for an ok result', () => {
    const ok: AdvanceBookingStatusResult = {
      ok: true,
      applied: true,
      previous: 'pending',
      current: 'confirmed',
      booking: {},
    }
    expect(advanceResultToResponse(ok)).toBeNull()
  })

  it('maps not_found to 404 { error: "Booking not found" }', async () => {
    const res = advanceResultToResponse({ ok: false, code: 'not_found', message: 'Booking not found' })
    expect(res?.status).toBe(404)
    expect(await res?.json()).toEqual({ error: 'Booking not found' })
  })

  it('maps invalid_transition to 422 with the message', async () => {
    const res = advanceResultToResponse({
      ok: false,
      code: 'invalid_transition',
      message: "Cannot transition from 'completed' to 'pending'",
    })
    expect(res?.status).toBe(422)
    expect(await res?.json()).toEqual({ error: "Cannot transition from 'completed' to 'pending'" })
  })

  it('maps db_error to 500 { error: "DB update failed" }', async () => {
    const res = advanceResultToResponse({ ok: false, code: 'db_error', message: 'DB update failed' })
    expect(res?.status).toBe(500)
    expect(await res?.json()).toEqual({ error: 'DB update failed' })
  })

  it('maps conflict to 409 { error: "status_conflict", currentStatus }', async () => {
    const res = advanceResultToResponse({
      ok: false,
      code: 'conflict',
      message: 'conflict',
      currentStatus: 'assigned',
    })
    expect(res?.status).toBe(409)
    expect(await res?.json()).toEqual({ error: 'status_conflict', currentStatus: 'assigned' })
  })
})
