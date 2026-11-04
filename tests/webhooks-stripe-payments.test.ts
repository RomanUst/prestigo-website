// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

/**
 * Phase 88 plan 88-09 (PAYF-03, HOLD-01, HOLD-03, MAIL-01): the Stripe webhook routes card-flow events by
 * purpose BEFORE the legacy chain, confirms save-card / hold-now bookings in place exactly once, and sends the
 * localized emails exactly once. The legacy suites (webhooks-stripe*.test.ts) stay unmodified and green.
 */

const { stripeStub, world, mockAdvance, mockClaimPromo } = vi.hoisted(() => ({
  stripeStub: { constructEvent: vi.fn() },
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    processed: new Set<string>(),
  },
  mockAdvance: vi.fn(),
  mockClaimPromo: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => {
      try {
        void fn()
      } catch {
        /* noop */
      }
    },
  }
})

vi.mock('@/lib/supabase', () => {
  const processedTable = {
    select: () => ({
      eq: (_col: string, id: string) => ({
        maybeSingle: async () => ({ data: world.processed.has(id) ? { event_id: id } : null, error: null }),
      }),
    }),
    insert: async (row: { event_id: string }) => {
      if (world.processed.has(row.event_id)) return { error: { code: '23505', message: 'duplicate' } }
      world.processed.add(row.event_id)
      return { error: null }
    },
  }
  return {
    saveBooking: vi.fn().mockResolvedValue([{ id: 'new-booking-uuid' }]),
    withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    buildBookingRow: vi.fn().mockReturnValue({ booking_reference: 'PRG-20260330-1234', booking_type: 'confirmed', leg: 'outbound' }),
    buildBookingRows: vi.fn(),
    saveRoundTripBookings: vi.fn(),
    reconcileBookingToConfirmed: vi.fn().mockResolvedValue([]),
    reconcileRoundTripToConfirmed: vi.fn().mockResolvedValue([]),
    reconcileBookingByIdToConfirmed: vi.fn().mockResolvedValue([]),
    createSupabaseServiceClient: vi.fn(() => ({
      from: (table: string) => (table === 'stripe_processed_events' ? processedTable : world.db!.client.from(table)),
      rpc: (name: string, args?: Record<string, unknown>) =>
        name === 'claim_promo_code' ? mockClaimPromo(args) : world.db!.client.rpc(name, args),
    })),
  }
})

vi.mock('@/lib/booking-status-service', () => ({ advanceBookingStatus: mockAdvance }))

vi.mock('@/lib/email', () => ({
  sendClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendEmergencyAlert: vi.fn().mockResolvedValue(undefined),
  sendRoundTripClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendRoundTripManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendGroupClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendGroupManagerAlert: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/ics', () => ({ buildIcs: vi.fn().mockReturnValue('STUB-ICS') }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: vi.fn().mockResolvedValue(true) }))
vi.mock('stripe', () => ({
  default: function MockStripe() {
    return { webhooks: stripeStub }
  },
}))

import {
  saveBooking,
  reconcileBookingToConfirmed,
  reconcileBookingByIdToConfirmed,
} from '@/lib/supabase'
import { sendClientConfirmation, sendManagerAlert } from '@/lib/email'
import { classifyPaymentEvent, CARD_EVENT_TYPES } from '@/lib/stripe-webhook/dispatch'
import { POST } from '@/app/api/webhooks/stripe/route'
import type Stripe from 'stripe'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const REF = 'PRG-20261201-ABC123'

let db: FakePaymentsDb

function seedBooking(over: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    status: 'unpaid',
    payment_mode: 'card_hold',
    payment_state: 'checkout_pending',
    booking_reference: REF,
    booking_source: 'web',
    client_first_name: 'Anna',
    client_last_name: 'Petrova',
    client_email: 'anna@example.com',
    client_phone: '+420123456789',
    locale: 'ru',
    trip_type: 'transfer',
    origin_address: 'Prague Airport',
    destination_address: 'Hotel Alcron',
    pickup_date: '2026-12-01',
    pickup_time: '14:00',
    pickup_utc: '2026-12-01T13:00:00.000Z',
    vehicle_class: 'business',
    passengers: 2,
    luggage: 1,
    amount_czk: 2500,
    amount_eur: 100,
    payment_currency: 'eur',
    payment_amount_minor: 10000,
    hold_at: '2026-11-28T13:00:00.000Z',
    ...over,
  }
}

function setupIntent(over: Record<string, unknown> = {}, metadata: Record<string, string> | null = null) {
  return {
    id: 'seti_1',
    object: 'setup_intent',
    customer: 'cus_1',
    payment_method: 'pm_1',
    metadata: metadata ?? { kind: 'card_setup', cofBookingId: BOOKING_ID, attempt: '1', bookingReference: REF },
    ...over,
  }
}

function eventOf(type: string, object: unknown, id = 'evt_1') {
  return { id, type, data: { object } }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'valid-sig' },
    body: 'raw-body',
  })
}

async function deliver(event: unknown) {
  stripeStub.constructEvent.mockReturnValue(event)
  const res = await POST(makeRequest())
  return { status: res.status, json: await res.json() }
}

const bookingRow = () => db.state.bookings.find((b) => b.id === BOOKING_ID)!
const ledger = (kind?: string) =>
  db.state.booking_payment_events.filter((e) => e.booking_id === BOOKING_ID && (kind ? e.kind === kind : true))

beforeEach(() => {
  vi.clearAllMocks()
  world.processed.clear()
  db = createFakePaymentsDb({ bookings: [seedBooking()] })
  world.db = db
  mockClaimPromo.mockResolvedValue({ data: null, error: null })
  // The real status service needs the advance_booking_status RPC; here it is a faithful compare-and-set on the fake row.
  mockAdvance.mockImplementation(async (input: { bookingId: string; to: string; expectedFrom?: string }) => {
    const row = db.state.bookings.find((b) => b.id === input.bookingId)
    if (!row) return { ok: false, code: 'not_found', message: 'Booking not found' }
    if (input.expectedFrom !== undefined && input.expectedFrom !== row.status) {
      return { ok: false, code: 'conflict', message: 'status_conflict', currentStatus: row.status }
    }
    const previous = row.status as string
    row.status = input.to
    return { ok: true, applied: true, previous, current: input.to, booking: { ...row } }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('classifyPaymentEvent', () => {
  it('returns null for events without a card kind so the legacy chain handles them', () => {
    expect(classifyPaymentEvent(eventOf('checkout.session.completed', { metadata: { bookingId: 'b' } }) as unknown as Stripe.Event)).toBeNull()
    expect(classifyPaymentEvent(eventOf('payment_intent.succeeded', { metadata: {} }) as unknown as Stripe.Event)).toBeNull()
    expect(classifyPaymentEvent(eventOf('payment_intent.payment_failed', {}) as unknown as Stripe.Event)).toBeNull()
  })

  it("returns 'unrouted' for an unknown card_ kind", () => {
    const cls = classifyPaymentEvent(
      eventOf('payment_intent.succeeded', { metadata: { kind: 'card_mystery', cofBookingId: BOOKING_ID } }) as unknown as Stripe.Event,
    )
    expect(cls).toEqual({ route: 'unrouted', kind: 'card_mystery', bookingId: BOOKING_ID })
  })

  it('routes each card kind to its purpose', () => {
    const route = (type: string, kind: string) =>
      classifyPaymentEvent(eventOf(type, { metadata: { kind, cofBookingId: BOOKING_ID } }) as unknown as Stripe.Event)?.route
    expect(route('setup_intent.succeeded', 'card_setup')).toBe('setup_succeeded')
    expect(route('setup_intent.setup_failed', 'card_setup')).toBe('setup_failed')
    expect(route('payment_intent.amount_capturable_updated', 'card_hold_now')).toBe('hold_now_authorized')
    expect(route('payment_intent.amount_capturable_updated', 'card_hold')).toBe('hold_authorized')
    expect(route('payment_intent.payment_failed', 'card_hold')).toBe('pi_failed')
    expect(route('payment_intent.canceled', 'card_hold')).toBe('pi_canceled')
    expect(route('payment_intent.succeeded', 'card_charge')).toBe('charge_succeeded')
    expect(route('payment_intent.succeeded', 'card_recovery')).toBe('recovery_paid')
    expect(route('checkout.session.completed', 'card_recovery')).toBe('recovery_paid')
  })

  it('knows the six card event types', () => {
    expect(CARD_EVENT_TYPES).toHaveLength(6)
  })
})

describe('setup_intent.succeeded (HOLD-01 tracer)', () => {
  it('confirms the booking once, moves checkout_pending -> card_saved and never runs the legacy chain', async () => {
    const { status, json } = await deliver(eventOf('setup_intent.succeeded', setupIntent()))
    expect(status).toBe(200)
    expect(json).toEqual({ received: true })

    expect(mockAdvance).toHaveBeenCalledTimes(1)
    expect(mockAdvance).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        to: 'confirmed',
        profile: 'payment-engine',
        expectedFrom: 'unpaid',
        actor: { type: 'system', id: 'stripe_webhook' },
      }),
    )
    expect(bookingRow().status).toBe('confirmed')
    expect(bookingRow().payment_state).toBe('card_saved')
    expect(bookingRow().stripe_customer_id).toBe('cus_1')
    expect(bookingRow().stripe_payment_method_id).toBe('pm_1')
    expect(bookingRow().setup_intent_id).toBe('seti_1')
    expect(ledger('setup_succeeded')).toHaveLength(1)
    expect(ledger('setup_succeeded')[0].actor_type).toBe('webhook')

    expect(saveBooking).not.toHaveBeenCalled()
    expect(reconcileBookingToConfirmed).not.toHaveBeenCalled()
    expect(reconcileBookingByIdToConfirmed).not.toHaveBeenCalled()
    expect(sendClientConfirmation).not.toHaveBeenCalled()
  })

  it('answers duplicate for the same event id and does not confirm twice', async () => {
    await deliver(eventOf('setup_intent.succeeded', setupIntent(), 'evt_same'))
    const second = await deliver(eventOf('setup_intent.succeeded', setupIntent(), 'evt_same'))
    expect(second.status).toBe(200)
    expect(second.json).toEqual({ received: true, duplicate: true })
    expect(mockAdvance).toHaveBeenCalledTimes(1)
  })

  it('a redelivery under a new event id for the same SetupIntent is a no-op (ledger event_key)', async () => {
    await deliver(eventOf('setup_intent.succeeded', setupIntent(), 'evt_a'))
    await deliver(eventOf('setup_intent.succeeded', setupIntent(), 'evt_b'))
    expect(ledger('setup_succeeded')).toHaveLength(1)
    expect(bookingRow().payment_state).toBe('card_saved')
  })

  it('a booking cancelled meanwhile moves checkout_pending -> released and is never re-confirmed', async () => {
    bookingRow().status = 'cancelled'
    const { status } = await deliver(eventOf('setup_intent.succeeded', setupIntent()))
    expect(status).toBe(200)
    expect(bookingRow().status).toBe('cancelled')
    expect(bookingRow().payment_state).toBe('released')
    expect(ledger('setup_succeeded')[0].error_code).toBe('booking_cancelled')
  })

  it('an already confirmed booking still records card_saved without confirming again', async () => {
    bookingRow().status = 'confirmed'
    await deliver(eventOf('setup_intent.succeeded', setupIntent()))
    expect(bookingRow().payment_state).toBe('card_saved')
    expect(bookingRow().status).toBe('confirmed')
  })

  it('without cofBookingId: 200, no write, ids only in the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { status } = await deliver(eventOf('setup_intent.succeeded', setupIntent({}, { kind: 'card_setup' })))
    expect(status).toBe(200)
    expect(mockAdvance).not.toHaveBeenCalled()
    expect(db.state.booking_payment_events).toHaveLength(0)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('anna@example.com')
  })

  it('for a missing booking: 200, no write, ids only in the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { status } = await deliver(
      eventOf('setup_intent.succeeded', setupIntent({}, { kind: 'card_setup', cofBookingId: '99999999-9999-4999-8999-999999999999' })),
    )
    expect(status).toBe(200)
    expect(mockAdvance).not.toHaveBeenCalled()
    expect(db.state.booking_payment_events).toHaveLength(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown booking'), expect.objectContaining({ stripeObjectId: 'seti_1' }))
  })

  it('a partner booking is acknowledged without any write', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    bookingRow().booking_source = 'gnet'
    const { status } = await deliver(eventOf('setup_intent.succeeded', setupIntent()))
    expect(status).toBe(200)
    expect(mockAdvance).not.toHaveBeenCalled()
    expect(bookingRow().payment_state).toBe('checkout_pending')
  })

  it('a status service failure answers 500 so Stripe retries, and claims nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdvance.mockResolvedValueOnce({ ok: false, code: 'db_error', message: 'boom' })
    const { status } = await deliver(eventOf('setup_intent.succeeded', setupIntent(), 'evt_retry'))
    expect(status).toBe(500)
    expect(world.processed.has('evt_retry')).toBe(false)
    const retry = await deliver(eventOf('setup_intent.succeeded', setupIntent(), 'evt_retry'))
    expect(retry.status).toBe(200)
    expect(bookingRow().payment_state).toBe('card_saved')
  })
})

describe('payment routing adjacency (PAYF-03)', () => {
  it('payment_intent.succeeded with kind card_charge never reaches the legacy chain, even with legacy keys', async () => {
    const { status } = await deliver(
      eventOf('payment_intent.succeeded', {
        id: 'pi_card',
        amount: 10000,
        currency: 'eur',
        metadata: { kind: 'card_charge', cofBookingId: BOOKING_ID, bookingId: 'legacy-key', bookingReference: REF },
      }),
    )
    expect(status).toBe(200)
    expect(saveBooking).not.toHaveBeenCalled()
    expect(reconcileBookingByIdToConfirmed).not.toHaveBeenCalled()
    expect(sendClientConfirmation).not.toHaveBeenCalled()
    expect(sendManagerAlert).not.toHaveBeenCalled()
  })

  it('checkout.session.completed with a card kind never reaches the legacy payment-link handler', async () => {
    const { status } = await deliver(
      eventOf('checkout.session.completed', {
        payment_status: 'paid',
        payment_intent: 'pi_x',
        metadata: { kind: 'card_recovery', cofBookingId: BOOKING_ID, bookingId: 'legacy-key' },
      }),
    )
    expect(status).toBe(200)
    expect(reconcileBookingByIdToConfirmed).not.toHaveBeenCalled()
    expect(sendClientConfirmation).not.toHaveBeenCalled()
  })

  it('an unknown card_ kind is acknowledged with no write', async () => {
    const { status, json } = await deliver(
      eventOf('payment_intent.succeeded', { id: 'pi_m', metadata: { kind: 'card_mystery', cofBookingId: BOOKING_ID } }),
    )
    expect(status).toBe(200)
    expect(json).toEqual({ received: true })
    expect(saveBooking).not.toHaveBeenCalled()
    expect(db.state.booking_payment_events).toHaveLength(0)
  })

  it('a legacy payment_intent.succeeded without kind still creates exactly one booking', async () => {
    const { status } = await deliver(
      eventOf('payment_intent.succeeded', {
        id: 'pi_legacy',
        amount: 250000,
        currency: 'czk',
        metadata: {
          bookingReference: 'PRG-20260330-1234',
          tripType: 'transfer',
          originAddress: 'Prague Airport',
          destinationAddress: 'Hotel Alcron',
          pickupDate: '2026-04-15',
          pickupTime: '14:00',
          vehicleClass: 'business',
          passengers: '2',
          luggage: '2',
          amountCzk: '2500',
          firstName: 'Jan',
          lastName: 'Novak',
          email: 'jan@example.com',
          phone: '+420123456789',
        },
      }),
    )
    expect(status).toBe(200)
    expect(saveBooking).toHaveBeenCalledTimes(1)
    expect(mockAdvance).not.toHaveBeenCalled()
  })
})
