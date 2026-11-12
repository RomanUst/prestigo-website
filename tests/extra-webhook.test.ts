// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

/**
 * Phase 91 plan 91-08 (EXTRA-01; T-91-29): the webhook side of the extra charge. card_extra PaymentIntents are routed like a
 * fee (never unrouted), their success finalises a charging row exactly once together with the synchronous path (same ledger
 * and email keys), their failure marks the row failed and never reaches the hold-failure handler, and a refund of the extra
 * PaymentIntent never changes the booking's status or payment_state. The mock world is the one of
 * tests/payments-fee-webhook.test.ts.
 */

const { stripeStub, world, mockHoldFailed, mockSendEmail, mockPiRetrieve, mockAlert } = vi.hoisted(() => ({
  stripeStub: { constructEvent: vi.fn() },
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    processed: new Set<string>(),
  },
  mockHoldFailed: vi.fn(),
  mockSendEmail: vi.fn(),
  mockPiRetrieve: vi.fn(),
  mockAlert: vi.fn(),
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
    buildBookingRow: vi.fn().mockReturnValue({}),
    buildBookingRows: vi.fn(),
    saveRoundTripBookings: vi.fn(),
    reconcileBookingToConfirmed: vi.fn().mockResolvedValue([]),
    reconcileRoundTripToConfirmed: vi.fn().mockResolvedValue([]),
    reconcileBookingByIdToConfirmed: vi.fn().mockResolvedValue([]),
    createSupabaseServiceClient: vi.fn(() => ({
      from: (table: string) => {
        if (table === 'stripe_processed_events') return processedTable
        const query = world.db!.client.from(table) as { not: (c: string, o: string, v: string) => unknown; neq: (c: string, v: string) => unknown }
        if (table !== 'bookings') return query
        // The fake query builder has no not('in'); the shipped refund handler uses it to protect finished trips.
        return new Proxy(query, {
          get(target, prop, receiver) {
            if (prop !== 'not') return Reflect.get(target, prop, receiver)
            return (col: string, op: string, val: string) => {
              if (op !== 'in') return target.not(col, op, val)
              let q: unknown = target
              for (const v of val.replace(/[()]/g, '').split(',')) q = (q as typeof target).neq(col, v)
              return q
            }
          },
        })
      },
      rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
    })),
  }
})

vi.mock('@/lib/booking-status-service', () => ({ advanceBookingStatus: vi.fn() }))
vi.mock('@/lib/email', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/email')>()),
  sendClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendEmergencyAlert: vi.fn().mockResolvedValue(undefined),
  sendRoundTripClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendRoundTripManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendGroupClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendGroupManagerAlert: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => ({ paymentIntents: { retrieve: mockPiRetrieve } }),
}))
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: mockAlert }))
vi.mock('@/lib/payments/emails/send', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/emails/send')>()),
  sendPaymentEmail: mockSendEmail,
}))
// The hold-failure handler is a spy: a card_extra failure must never reach it.
vi.mock('@/lib/stripe-webhook/hold-events', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/stripe-webhook/hold-events')>()),
  handleHoldFailed: mockHoldFailed,
}))
vi.mock('resend', () => ({ Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }) } } }))
vi.mock('@/lib/ics', () => ({ buildIcs: vi.fn().mockReturnValue('STUB-ICS') }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: vi.fn().mockResolvedValue(true) }))
vi.mock('stripe', () => ({
  default: function MockStripe() {
    return { webhooks: stripeStub }
  },
}))

import { saveBooking } from '@/lib/supabase'
import { classifyPaymentEvent } from '@/lib/stripe-webhook/dispatch'
import { POST } from '@/app/api/webhooks/stripe/route'
import type Stripe from 'stripe'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const CHARGE_ID = '33333333-3333-4333-8333-333333333333'
const REF = 'PRG-20261201-EXTW01'

let db: FakePaymentsDb

function seedBooking(over: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    status: 'completed',
    payment_mode: 'card_hold',
    payment_state: 'captured',
    booking_reference: REF,
    booking_source: 'online',
    client_email: 'anna@example.com',
    locale: 'en',
    vehicle_class: 'business',
    payment_currency: 'eur',
    payment_amount_minor: 10000,
    captured_amount_minor: 10000,
    payment_intent_id: 'pi_original',
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_ok',
    ...over,
  }
}

function seedCharge(over: Record<string, unknown> = {}) {
  db.state.booking_extra_charges.push({
    id: CHARGE_ID,
    booking_id: BOOKING_ID,
    kind: 'other',
    status: 'charging',
    currency: 'eur',
    amount_minor: 1500,
    description: 'Airport parking',
    attempt: 1,
    requested_at: new Date().toISOString(),
    ...over,
  })
}

function eventOf(type: string, object: unknown, id = 'evt_1') {
  return { id, type, data: { object } }
}
function makeRequest(): Request {
  return new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'valid-sig' }, body: 'raw-body' })
}
async function deliver(event: unknown) {
  stripeStub.constructEvent.mockReturnValue(event)
  const res = await POST(makeRequest())
  return { status: res.status, json: await res.json() }
}

const bookingRow = () => db.state.bookings.find((b) => b.id === BOOKING_ID)!
const chargeRow = () => db.state.booking_extra_charges.find((c) => c.id === CHARGE_ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === BOOKING_ID && (kind ? e.kind === kind : true))

function extraPi(over: Record<string, unknown> = {}) {
  return {
    id: 'pi_extra_1',
    object: 'payment_intent',
    amount: 1500,
    amount_received: 1500,
    currency: 'eur',
    status: 'succeeded',
    // The legacy booking-id key is deliberately present: a card_extra must still never reach the legacy chain.
    metadata: { kind: 'card_extra', cofBookingId: BOOKING_ID, extraChargeId: CHARGE_ID, attempt: '1', bookingReference: REF, bookingId: 'legacy-key' },
    ...over,
  }
}
const failedPi = (code = 'insufficient_funds') =>
  extraPi({ status: 'requires_payment_method', amount_received: 0, last_payment_error: { code: 'card_declined', decline_code: code } })

beforeEach(() => {
  vi.clearAllMocks()
  world.processed.clear()
  db = createFakePaymentsDb({ bookings: [seedBooking()] })
  world.db = db
  mockSendEmail.mockResolvedValue('sent')
  mockAlert.mockResolvedValue('sent')
  mockHoldFailed.mockResolvedValue(undefined)
  process.env.RESEND_API_KEY = 're_test'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('classification: card_extra routes like a fee', () => {
  it('succeeded -> charge_succeeded, payment_failed -> pi_failed, never unrouted', () => {
    expect(classifyPaymentEvent(eventOf('payment_intent.succeeded', extraPi()) as unknown as Stripe.Event)).toEqual({
      route: 'charge_succeeded',
      kind: 'card_extra',
      bookingId: BOOKING_ID,
    })
    expect(classifyPaymentEvent(eventOf('payment_intent.payment_failed', failedPi()) as unknown as Stripe.Event)).toEqual({
      route: 'pi_failed',
      kind: 'card_extra',
      bookingId: BOOKING_ID,
    })
  })
})

describe('payment_intent.succeeded on an extra PaymentIntent', () => {
  it('a row still charging (the synchronous answer was lost): row charged, extra_charged once, one receipt', async () => {
    seedCharge()
    const { status } = await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_s1'))
    expect(status).toBe(200)

    // WR-03: the extra's only ledger row is extra_charged (no generic charge_succeeded observation)
    expect(ledger('charge_succeeded')).toHaveLength(0)
    expect(ledger('extra_charged')).toHaveLength(1)
    expect(ledger('extra_charged')[0]).toMatchObject({
      event_key: `extra_charged:${CHARGE_ID}`,
      stripe_object_id: 'pi_extra_1',
      amount_minor: 1500,
      currency: 'eur',
      actor_type: 'webhook',
    })
    expect(chargeRow()).toMatchObject({ status: 'charged', stripe_payment_intent_id: 'pi_extra_1' })
    expect(typeof chargeRow().charged_at).toBe('string')
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({
      kind: 'extra_charged',
      variant: 'other',
      feeMinor: 1500,
      extraItem: 'Airport parking',
      eventKey: `email:extra_charged:${CHARGE_ID}`,
    })
    expect(saveBooking).not.toHaveBeenCalled()
  })

  it('a redelivery (same event id and a fresh event id) adds nothing', async () => {
    seedCharge()
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_s1'))
    const before = ledger().length
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_s1'))
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_s2'))
    expect(ledger().length).toBe(before)
    expect(ledger('extra_charged')).toHaveLength(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('a row already charged by the synchronous path: no second extra_charged, no second email', async () => {
    seedCharge({ status: 'charged', stripe_payment_intent_id: 'pi_extra_1', charged_at: new Date().toISOString() })
    db.state.booking_payment_events.push({
      id: 900,
      booking_id: BOOKING_ID,
      event_key: `extra_charged:${CHARGE_ID}`,
      kind: 'extra_charged',
      stripe_object_id: 'pi_extra_1',
      amount_minor: 1500,
      currency: 'eur',
      actor_type: 'admin',
      actor_id: 'admin-1',
      error_code: null,
      created_at: new Date().toISOString(),
    })
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_s3'))
    expect(ledger('charge_succeeded')).toHaveLength(0)
    expect(ledger('extra_charged')).toHaveLength(1)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('the booking is never changed: payment_intent_id, payment_state, status', async () => {
    seedCharge()
    const before = { ...bookingRow() }
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_s4'))
    expect(bookingRow()).toEqual(before)
  })

  it('a GNet booking is ignored: no ledger row, the row stays as it was, no email', async () => {
    db = createFakePaymentsDb({ bookings: [seedBooking({ booking_source: 'gnet' })] })
    world.db = db
    seedCharge()
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_g1'))
    expect(ledger()).toHaveLength(0)
    expect(chargeRow().status).toBe('charging')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('an event for an unknown charge id, or without extraChargeId, changes nothing (logged with ids only)', async () => {
    seedCharge()
    const unknown = extraPi({ metadata: { ...extraPi().metadata, extraChargeId: '44444444-4444-4444-8444-444444444444' } })
    await deliver(eventOf('payment_intent.succeeded', unknown, 'evt_u1'))
    const noId = extraPi({ id: 'pi_extra_2', metadata: { kind: 'card_extra', cofBookingId: BOOKING_ID } })
    await deliver(eventOf('payment_intent.succeeded', noId, 'evt_u2'))
    expect(ledger('extra_charged')).toHaveLength(0)
    expect(chargeRow().status).toBe('charging')
    expect(ledger()).toHaveLength(0)
  })
})

describe('CR-01: a PaymentIntent that succeeds after its row was recorded as failed', () => {
  const failedRow = (over: Record<string, unknown> = {}) =>
    seedCharge({ status: 'failed', last_error_code: 'unexpected_status', stripe_payment_intent_id: 'pi_extra_1', ...over })

  it('repairs the row to charged once, writes extra_charged once, sends the receipt once and alerts the operator', async () => {
    failedRow()
    const { status } = await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_c1'))
    expect(status).toBe(200)
    expect(chargeRow()).toMatchObject({ status: 'charged', stripe_payment_intent_id: 'pi_extra_1', last_error_code: null })
    expect(typeof chargeRow().charged_at).toBe('string')
    expect(ledger('extra_charged')).toHaveLength(1)
    expect(ledger('extra_charged')[0]).toMatchObject({ event_key: `extra_charged:${CHARGE_ID}`, stripe_object_id: 'pi_extra_1', amount_minor: 1500 })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockAlert).toHaveBeenCalledTimes(1)
    expect(mockAlert.mock.calls[0][0]).toBe('ops_attention')
    expect(mockAlert.mock.calls[0][2]).toMatchObject({ note: 'extra_late_success', amountMinor: 1500 })
    // ids only: neither the description nor an address is in the alert
    expect(JSON.stringify(mockAlert.mock.calls[0][2])).not.toContain('Airport parking')
  })

  it('a redelivery repairs nothing twice: one extra_charged, one receipt', async () => {
    failedRow()
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_c2'))
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_c3'))
    expect(ledger('extra_charged')).toHaveLength(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('a different PaymentIntent on a failed row is only reported (second payment): row and ledger unchanged', async () => {
    failedRow({ stripe_payment_intent_id: 'pi_other' })
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_c4'))
    expect(chargeRow()).toMatchObject({ status: 'failed', stripe_payment_intent_id: 'pi_other' })
    expect(ledger('extra_charged')).toHaveLength(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledTimes(1)
    expect(mockAlert.mock.calls[0][2]).toMatchObject({ note: 'extra_second_payment' })
  })
})

describe('payment_intent.payment_failed on an extra PaymentIntent', () => {
  it('marks a charging row failed with extra_failed, the extra\'s only ledger row (no generic charge_failed observation)', async () => {
    seedCharge()
    const { status } = await deliver(eventOf('payment_intent.payment_failed', failedPi(), 'evt_f1'))
    expect(status).toBe(200)
    expect(ledger('charge_failed')).toHaveLength(0)
    expect(ledger('extra_failed')).toHaveLength(1)
    expect(ledger('extra_failed')[0]).toMatchObject({ event_key: `extra_failed:${CHARGE_ID}:1`, error_code: 'insufficient_funds' })
    expect(chargeRow()).toMatchObject({ status: 'failed', last_error_code: 'insufficient_funds' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('never reaches the hold-failure handler, and does not touch the booking', async () => {
    seedCharge()
    const before = { ...bookingRow() }
    await deliver(eventOf('payment_intent.payment_failed', failedPi(), 'evt_f2'))
    expect(mockHoldFailed).not.toHaveBeenCalled()
    expect(bookingRow()).toEqual(before)
  })

  it('a redelivery adds nothing', async () => {
    seedCharge()
    await deliver(eventOf('payment_intent.payment_failed', failedPi(), 'evt_f3'))
    const before = ledger().length
    await deliver(eventOf('payment_intent.payment_failed', failedPi(), 'evt_f4'))
    expect(ledger().length).toBe(before)
  })

  it('a row the synchronous path already charged stays charged', async () => {
    seedCharge({ status: 'charged' })
    await deliver(eventOf('payment_intent.payment_failed', failedPi(), 'evt_f5'))
    expect(chargeRow().status).toBe('charged')
    expect(ledger('extra_failed')).toHaveLength(0)
  })

  it('a row already failed by the synchronous path gets no second extra_failed row', async () => {
    seedCharge({ status: 'failed', last_error_code: 'insufficient_funds' })
    db.state.booking_payment_events.push({
      id: 901,
      booking_id: BOOKING_ID,
      event_key: `extra_failed:${CHARGE_ID}:1`,
      kind: 'extra_failed',
      stripe_object_id: 'pi_extra_1',
      amount_minor: 1500,
      currency: 'eur',
      actor_type: 'admin',
      actor_id: 'admin-1',
      error_code: 'insufficient_funds',
      created_at: new Date().toISOString(),
    })
    await deliver(eventOf('payment_intent.payment_failed', failedPi(), 'evt_f6'))
    expect(ledger('extra_failed')).toHaveLength(1)
  })

  it('a GNet booking is ignored', async () => {
    db = createFakePaymentsDb({ bookings: [seedBooking({ booking_source: 'gnet' })] })
    world.db = db
    seedCharge()
    await deliver(eventOf('payment_intent.payment_failed', failedPi(), 'evt_f7'))
    expect(ledger()).toHaveLength(0)
    expect(chargeRow().status).toBe('charging')
    expect(mockHoldFailed).not.toHaveBeenCalled()
  })
})

describe('WR-03: one money event is one ledger meaning', () => {
  it('a card_extra success or failure writes only extra_* rows: no charge_succeeded / charge_failed / difference_failed row the trip and cash logic could read', async () => {
    seedCharge()
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_w1'))
    seedCharge({ id: '66666666-6666-4666-8666-666666666666' })
    await deliver(
      eventOf(
        'payment_intent.payment_failed',
        { ...failedPi('card_declined'), id: 'pi_extra_9', metadata: { ...extraPi().metadata, extraChargeId: '66666666-6666-4666-8666-666666666666' } },
        'evt_w2',
      ),
    )
    const kinds = ledger().map((e) => e.kind)
    expect(kinds.length).toBeGreaterThan(0)
    for (const kind of kinds) expect(['extra_charged', 'extra_failed']).toContain(kind)
    for (const generic of ['charge_succeeded', 'charge_failed', 'difference_failed']) expect(kinds).not.toContain(generic)
    // No ledger row carries a generic observation key of the extra PaymentIntents either.
    const keys = ledger().map((e) => String(e.event_key))
    expect(keys.some((k) => k.startsWith('charge_succeeded:') || k.startsWith('extra_failed_obs:') || k.startsWith('charge_failed_obs:'))).toBe(false)
  })

  it('a cash claim that is running while an extra succeeds sees no charge it could adopt as the cash charge', async () => {
    // settle.chargeSeenSinceClaim reads exactly: a capture_started row, then a later charge_succeeded row with a PaymentIntent.
    db.state.booking_payment_events.push({
      id: 800,
      booking_id: BOOKING_ID,
      event_key: 'capture_started:1',
      kind: 'capture_started',
      stripe_object_id: null,
      amount_minor: null,
      currency: null,
      actor_type: 'system',
      actor_id: null,
      error_code: null,
      created_at: new Date(Date.now() - 1000).toISOString(),
    })
    seedCharge()
    await deliver(eventOf('payment_intent.succeeded', extraPi(), 'evt_w3'))
    const adoptable = ledger().filter((e) => e.kind === 'charge_succeeded' && typeof e.stripe_object_id === 'string' && e.stripe_object_id !== '')
    expect(adoptable).toHaveLength(0)
  })
})

describe('charge.refunded on the extra PaymentIntent', () => {
  it('a completed booking keeps its status and payment_state; only the refund is observed', async () => {
    seedCharge({ status: 'charged', stripe_payment_intent_id: 'pi_extra_1' })
    mockPiRetrieve.mockResolvedValue(extraPi())
    const before = { ...bookingRow() }
    const charge = { id: 'ch_extra_1', object: 'charge', payment_intent: 'pi_extra_1', refunded: true, amount_refunded: 1500, currency: 'eur' }
    const { status } = await deliver(eventOf('charge.refunded', charge, 'evt_r1'))
    expect(status).toBe(200)
    expect(bookingRow().status).toBe('completed')
    expect(bookingRow().payment_state).toBe('captured')
    expect(bookingRow()).toEqual(before)
    expect(ledger('refund_observed')).toHaveLength(1)
    expect(chargeRow().status).toBe('charged')
  })
})

describe('payment_intent.canceled on an extra PaymentIntent (the cancel CR-01 issues for an unfinished confirm)', () => {
  it('changes nothing on the booking, the charge row or the ledger', async () => {
    seedCharge()
    const before = { ...bookingRow() }
    const chargeBefore = { ...chargeRow() }
    const rowsBefore = ledger().length
    const { status } = await deliver(eventOf('payment_intent.canceled', extraPi({ status: 'canceled', amount_received: 0 }), 'evt_c1'))
    expect(status).toBe(200)
    expect(bookingRow()).toEqual(before)
    expect(chargeRow()).toEqual(chargeBefore)
    expect(ledger().length).toBe(rowsBefore)
    expect(ledger('hold_released')).toHaveLength(0)
    expect(ledger('hold_expired')).toHaveLength(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
