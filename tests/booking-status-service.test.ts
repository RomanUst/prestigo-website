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
  mockBookingsUpdate,
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
  mockBookingsUpdate: vi.fn(),
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
  createSupabaseServiceClient: () => ({ from: mockSupabaseFrom }),
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
  gnetData = { id: GNET_ROW_ID, gnet_res_no: 'RES-123' } as Record<string, unknown> | null,
  flags = null as Record<string, boolean> | null,
} = {}) {
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
        update: (payload: unknown) => {
          mockBookingsUpdate(payload)
          return { eq: async () => ({ error: updateError }) }
        },
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
    expect(mockBookingsUpdate).toHaveBeenCalledTimes(1)
    expect(mockBookingsUpdate.mock.calls[0][0]).toEqual({ status: 'confirmed' })
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
    expect(mockBookingsUpdate.mock.calls[0][0]).toEqual({
      status: 'confirmed',
      operator_notes: 'VIP',
      driver_price_czk: 900,
    })
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
    expect(mockBookingsUpdate).not.toHaveBeenCalled()
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
    const payload = mockBookingsUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(payload.payment_link_url).toBeNull()
    expect(payload.payment_link_id).toBeNull()
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
