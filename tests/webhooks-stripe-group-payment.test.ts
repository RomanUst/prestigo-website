import { describe, it, expect, vi, beforeEach } from 'vitest'

// Group payment link: one Stripe link settles several manual bookings
// (metadata.groupBookingIds). The webhook must confirm every unpaid row and
// send ONE combined client confirmation + ONE manager alert with the total
// Stripe captured — and nothing on a retry where no row was newly confirmed.

const { stripeStub } = vi.hoisted(() => ({ stripeStub: { constructEvent: vi.fn() } }))

const { db } = vi.hoisted(() => {
  const db = {
    unpaidRows: [] as Array<{ id: string; operator_notes: string | null }>,
    fullRows: {} as Record<string, Record<string, unknown>>,
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  }
  return { db }
})

// Minimal chainable Supabase stub covering the calls the route makes.
function makeBuilder(table: string) {
  const state: { op: string; patch?: Record<string, unknown>; id?: string } = { op: 'select' }
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = vi.fn(chain)
  builder.in = vi.fn(chain)
  builder.eq = vi.fn((col: string, val: string) => {
    if (col === 'id') state.id = val
    return builder
  })
  builder.update = vi.fn((patch: Record<string, unknown>) => {
    state.op = 'update'
    state.patch = patch
    return builder
  })
  builder.insert = vi.fn(() => Promise.resolve({ error: null }))
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null }))
  builder.then = (resolve: (v: unknown) => unknown) => {
    if (table === 'bookings' && state.op === 'update' && state.id) {
      db.updates.push({ id: state.id, patch: state.patch! })
      const row = db.fullRows[state.id]
      return Promise.resolve(resolve({ data: row ? [{ ...row, ...state.patch }] : [], error: null }))
    }
    return Promise.resolve(resolve({ data: db.unpaidRows, error: null }))
  }
  return builder
}

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } } }
})

vi.mock('@/lib/supabase', () => ({
  saveBooking: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
  buildBookingRow: vi.fn(),
  buildBookingRows: vi.fn(),
  saveRoundTripBookings: vi.fn(),
  reconcileBookingToConfirmed: vi.fn(),
  reconcileRoundTripToConfirmed: vi.fn(),
  reconcileBookingByIdToConfirmed: vi.fn(),
  createSupabaseServiceClient: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
}))

vi.mock('@/lib/email', () => ({
  sendClientConfirmation: vi.fn(),
  sendManagerAlert: vi.fn(),
  sendEmergencyAlert: vi.fn(),
  sendRoundTripClientConfirmation: vi.fn(),
  sendRoundTripManagerAlert: vi.fn(),
  sendGroupClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendGroupManagerAlert: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ics', () => ({ buildIcs: vi.fn() }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: vi.fn().mockResolvedValue(true) }))
vi.mock('stripe', () => ({ default: function MockStripe() { return { webhooks: stripeStub } } }))

import { sendGroupClientConfirmation, sendGroupManagerAlert, sendClientConfirmation } from '@/lib/email'
import { scheduleQStashReminder } from '@/lib/qstash'
import { sendGa4Purchase } from '@/lib/analytics-server'
import { POST } from '@/app/api/webhooks/stripe/route'

const ID_A = '11111111-1111-1111-1111-111111111111'
const ID_B = '22222222-2222-2222-2222-222222222222'

function row(id: string, ref: string, date: string) {
  return {
    id,
    booking_reference: ref,
    trip_type: 'transfer',
    origin_address: `From ${ref}`,
    destination_address: `To ${ref}`,
    pickup_date: date,
    pickup_time: '10:00',
    vehicle_class: 'business',
    passengers: 2,
    amount_czk: 0,
    amount_eur: null,
    client_first_name: 'Travel',
    client_last_name: 'Agency',
    client_email: 'ops@agency.example',
    client_phone: '',
    flight_number: null,
    special_requests: 'internal note',
    pickup_utc: `${date}T08:00:00Z`,
    locale: null,
  }
}

function request(): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: 'raw',
  })
}

function paymentIntentEvent() {
  return {
    id: 'evt_group_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_group_1',
        amount: 185250,
        amount_received: 185250,
        currency: 'eur',
        metadata: { groupBookingIds: `${ID_B},${ID_A}` },
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.updates = []
  db.fullRows = {
    [ID_A]: row(ID_A, 'PRG-A', '2026-10-01'),
    [ID_B]: row(ID_B, 'PRG-B', '2026-10-04'),
  }
  db.unpaidRows = [
    { id: ID_B, operator_notes: null },
    { id: ID_A, operator_notes: 'existing' },
  ]
})

describe('group payment link webhook', () => {
  it('confirms every row and sends one combined client + manager email with the Stripe total', async () => {
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())

    const res = await POST(request())
    expect(res.status).toBe(200)

    expect(db.updates.map((u) => u.id).sort()).toEqual([ID_A, ID_B])
    expect(db.updates.every((u) => u.patch.status === 'confirmed')).toBe(true)

    expect(sendGroupClientConfirmation).toHaveBeenCalledTimes(1)
    expect(sendGroupManagerAlert).toHaveBeenCalledTimes(1)
    expect(sendClientConfirmation).not.toHaveBeenCalled()

    const data = vi.mocked(sendGroupClientConfirmation).mock.calls[0][0]
    expect(data.amountEur).toBe(1852.5)
    expect(data.clientEmail).toBe('ops@agency.example')
    // Legs sorted chronologically regardless of metadata order
    expect(data.legs.map((l) => l.bookingReference)).toEqual(['PRG-A', 'PRG-B'])

    expect(scheduleQStashReminder).toHaveBeenCalledTimes(2)
    expect(sendGa4Purchase).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendGa4Purchase).mock.calls[0][0].valueEur).toBe(1852.5)
  })

  it('reads the total from checkout.session.completed amount_total', async () => {
    stripeStub.constructEvent.mockReturnValue({
      id: 'evt_group_cs',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          payment_status: 'paid',
          payment_intent: 'pi_group_1',
          amount_total: 50000,
          currency: 'eur',
          metadata: { groupBookingIds: ID_A },
        },
      },
    })

    await POST(request())
    expect(vi.mocked(sendGroupClientConfirmation).mock.calls[0][0].amountEur).toBe(500)
  })

  it('sends nothing on a retry where no row is still unpaid', async () => {
    db.unpaidRows = []
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())

    await POST(request())
    expect(sendGroupClientConfirmation).not.toHaveBeenCalled()
    expect(sendGroupManagerAlert).not.toHaveBeenCalled()
    expect(scheduleQStashReminder).not.toHaveBeenCalled()
    expect(sendGa4Purchase).not.toHaveBeenCalled()
  })
})
