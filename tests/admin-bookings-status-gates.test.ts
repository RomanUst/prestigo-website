// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 89 plan 89-09 (WR-02, WR-04, T-89-31): money-bearing status changes go only through their own routes, and a
 * closed booking stays closed.
 *  - PATCH status no_show is 422 use_no_show_route (the no-show route checks the driver request and the wait);
 *  - PATCH status cancelled on a card hold, a cash guarantee or a booking with a payment intent is 422 use_cancel_route;
 *  - PATCH trip edit on a no_show booking is refused like completed and cancelled;
 *  - assign on a completed, cancelled or no_show booking is 422 with no driver_assignments row and no driver email.
 */

const { mockGetAdminUser, mockFrom, mockRpc, mockSendDriverEmail, mockLogEmail } = vi.hoisted(() => ({
  mockGetAdminUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockSendDriverEmail: vi.fn(),
  mockLogEmail: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => ({ from: mockFrom, rpc: mockRpc }) }))
vi.mock('@/lib/request-guards', () => ({ enforceMaxBody: () => null }))
vi.mock('@/lib/email-log', () => ({ logEmail: mockLogEmail }))
vi.mock('@/lib/email', () => ({
  sendDriverAssignmentEmail: mockSendDriverEmail,
  sendStatusConfirmedEmail: vi.fn(),
  sendBookingChangedEmail: vi.fn(),
  sendPaymentRequestEmail: vi.fn(),
}))
vi.mock('@/lib/stripe-payment-links', () => ({
  createBookingPaymentLink: vi.fn(),
  deactivateBookingPaymentLink: vi.fn().mockResolvedValue(undefined),
}))

import { PATCH } from '@/app/api/admin/bookings/route'
import { POST as ASSIGN } from '@/app/api/admin/bookings/[id]/assign/route'

const ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const DRIVER = 'd1d2d3d4-0000-4000-8000-000000000001'

function chain(result: unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'insert', 'update']) c[m] = vi.fn(() => c)
  c.single = vi.fn(async () => result)
  c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return c
}

/** Serve the booking row from `bookings`; every other table answers an empty success. Tables touched are recorded. */
function wire(booking: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'bookings') return chain({ data: { id: ID, ...booking }, error: null })
    if (table in extra) return chain(extra[table])
    return chain({ data: null, error: null })
  })
}
const touched = (table: string) => mockFrom.mock.calls.some((c: unknown[]) => c[0] === table)

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request('http://localhost/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ID, ...body }),
    }),
  )
}

function assign() {
  return ASSIGN(
    new Request(`http://localhost/api/admin/bookings/${ID}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: DRIVER }),
    }),
    { params: Promise.resolve({ id: ID }) },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdminUser.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
  mockRpc.mockResolvedValue({ data: { applied: true }, error: null })
  mockLogEmail.mockResolvedValue(true)
})

describe('PATCH status guards', () => {
  it('no_show is 422 use_no_show_route, with no read, no write and no email', async () => {
    const res = await patch({ status: 'no_show' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'use_no_show_route' })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockLogEmail).not.toHaveBeenCalled()
  })

  it.each([
    ['a card hold', { status: 'confirmed', payment_mode: 'card_hold', payment_state: 'authorized' }],
    ['a cash guarantee', { status: 'confirmed', payment_mode: 'cash_guarantee', payment_state: 'card_saved' }],
    ['a paid booking with a payment intent', { status: 'confirmed', payment_mode: 'pay_now', payment_intent_id: 'pi_paid' }],
  ])('cancelled on %s is 422 use_cancel_route, nothing written', async (_name, row) => {
    wire(row)
    const res = await patch({ status: 'cancelled' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'use_cancel_route' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockLogEmail).not.toHaveBeenCalled()
  })

  it('cancelled on a booking with no money behind it still goes through PATCH', async () => {
    wire({ status: 'confirmed', payment_mode: 'pay_now', payment_intent_id: null, client_email: 'a@b.com' })
    const res = await patch({ status: 'cancelled' })
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('advance_booking_status', expect.objectContaining({ p_to: 'cancelled' }))
  })
})

describe('PATCH trip edit gate', () => {
  it.each(['completed', 'cancelled', 'no_show'])('a %s booking can not be edited', async status => {
    wire({ status, booking_source: 'online', pickup_date: '2026-11-20', pickup_time: '12:00' })
    const res = await patch({ pickup_time: '13:00' })
    expect(res.status).toBe(422)
    expect(((await res.json()) as { error: string }).error).toContain(`${status} bookings are final`)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('assign gate (WR-02)', () => {
  const driverRow = { data: { id: DRIVER, name: 'Jan Driver', email: 'jan@example.com' }, error: null }

  it.each(['completed', 'cancelled', 'no_show'])(
    'a %s booking is 422 booking_closed: no driver_assignments row, no driver email',
    async status => {
      wire({ status, booking_reference: 'PRG-1', booking_source: 'online' }, { drivers: driverRow })
      const res = await assign()
      expect(res.status).toBe(422)
      expect(await res.json()).toMatchObject({ error: 'booking_closed' })
      expect(touched('driver_assignments')).toBe(false)
      expect(mockSendDriverEmail).not.toHaveBeenCalled()
      expect(mockRpc).not.toHaveBeenCalled()
    },
  )

  it('a confirmed booking still reaches the assignment insert', async () => {
    wire(
      { status: 'confirmed', booking_reference: 'PRG-1', booking_source: 'online' },
      {
        drivers: driverRow,
        driver_assignments: { data: { id: 'as-1', driver_id: DRIVER, status: 'pending', token: 't', trip_token: 'tt' }, error: null },
      },
    )
    await assign()
    expect(touched('driver_assignments')).toBe(true)
  })
})
