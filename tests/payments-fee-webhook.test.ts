// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

/**
 * Phase 89 plan 89-26 (CASH-03, HOLD-06): the webhook side of the fee engine. card_fee PaymentIntents are observed
 * (success and failure), a paid fee recovery link closes the pending case as charged and sends fee_charged, a dispute
 * on a cash_guarantee booking reaches the operator, and a refund on a cash row reaches the ledger.
 * The mock world is the same as tests/webhooks-stripe-payments.test.ts.
 */

const { stripeStub, world, mockAdvance, mockClaimPromo, mockResendSend, mockPiRetrieve, mockPiCancel, mockRefundCreate, mockLinkCreate, mockDeactivate } = vi.hoisted(() => ({
  stripeStub: { constructEvent: vi.fn() },
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    processed: new Set<string>(),
  },
  mockAdvance: vi.fn(),
  mockClaimPromo: vi.fn(),
  mockResendSend: vi.fn(),
  mockPiRetrieve: vi.fn(),
  mockPiCancel: vi.fn(),
  mockRefundCreate: vi.fn(),
  mockLinkCreate: vi.fn(),
  mockDeactivate: vi.fn(),
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
      rpc: (name: string, args?: Record<string, unknown>) =>
        name === 'claim_promo_code' ? mockClaimPromo(args) : world.db!.client.rpc(name, args),
    })),
  }
})

vi.mock('@/lib/booking-status-service', () => ({ advanceBookingStatus: mockAdvance }))

// The real module stays (render.ts and the calendar link import from it); only the senders are spies.
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
  getPaymentsStripe: () => ({
    paymentIntents: { retrieve: mockPiRetrieve, cancel: mockPiCancel },
    paymentLinks: { create: mockLinkCreate },
    refunds: { create: mockRefundCreate },
  }),
}))
vi.mock('@/lib/stripe-payment-links', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/stripe-payment-links')>()),
  deactivateBookingPaymentLink: mockDeactivate,
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockResendSend }
  },
}))
vi.mock('@/lib/ics', () => ({ buildIcs: vi.fn().mockReturnValue('STUB-ICS') }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: vi.fn().mockResolvedValue(true) }))
vi.mock('stripe', () => ({
  default: function MockStripe() {
    return { webhooks: stripeStub }
  },
}))

import { saveBooking } from '@/lib/supabase'
import { DEFAULT_POLICY } from '@/lib/cancellation-policy'
import { classifyPaymentEvent } from '@/lib/stripe-webhook/dispatch'
import { POST } from '@/app/api/webhooks/stripe/route'
import type Stripe from 'stripe'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const CASE_ID = '22222222-2222-4222-8222-222222222222'
const REF = 'PRG-20261201-ABC123'

let db: FakePaymentsDb

function seedBooking(over: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    status: 'cancelled',
    payment_mode: 'card_hold',
    payment_state: 'captured',
    booking_reference: REF,
    booking_source: 'web',
    client_first_name: 'Anna',
    client_last_name: 'Petrova',
    client_email: 'anna@example.com',
    client_phone: '+420123456789',
    locale: 'en',
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
    // The fee_charged receipt reads the policy the booking was made under.
    cancel_policy_version: '2026-11-1',
    cancel_policy: DEFAULT_POLICY,
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
const caseRow = () => db.state.booking_fee_cases.find((c) => c.booking_id === BOOKING_ID)

function seedCase(over: Record<string, unknown> = {}) {
  db.state.booking_fee_cases.push({
    id: CASE_ID,
    booking_id: BOOKING_ID,
    kind: 'late_cancel',
    status: 'pending',
    currency: 'eur',
    base_minor: 10000,
    proposed_minor: 4000,
    decided_minor: 4000,
    charge_requested_at: '2026-11-30T10:00:00.000Z',
    free_until: '2026-11-30T13:00:00.000Z',
    evidence: {},
    reason: null,
    contact_note: null,
    opened_at: '2026-11-30T09:00:00.000Z',
    opened_by: null,
    decided_at: null,
    decided_by: null,
    ...over,
  })
  bookingRow().fee_case_status = (over.status as string | undefined) ?? 'pending'
}

const mails = (to: string) =>
  mockResendSend.mock.calls.map((c) => c[0] as { to: string[]; subject: string; text?: string }).filter((m) => m.to[0] === to)

beforeEach(() => {
  vi.clearAllMocks()
  world.processed.clear()
  db = createFakePaymentsDb({ bookings: [seedBooking()] })
  world.db = db
  mockClaimPromo.mockResolvedValue({ data: null, error: null })
  mockResendSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
  mockLinkCreate.mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.test/plink_new' })
  mockDeactivate.mockResolvedValue(undefined)
  mockPiCancel.mockImplementation(async (id: string) => ({ id, status: 'canceled' }))
  mockRefundCreate.mockImplementation(async (params: { payment_intent: string }) => ({ id: `re_${params.payment_intent}`, status: 'succeeded' }))
  process.env.RESEND_API_KEY = 're_test'
  process.env.MANAGER_EMAIL = 'owner@example.com'
  mockAdvance.mockImplementation(async (input: { bookingId: string; to: string; expectedFrom?: string }) => {
    const row = db.state.bookings.find((b) => b.id === input.bookingId)
    if (!row) return { ok: false, code: 'not_found', message: 'Booking not found' }
    const previous = row.status as string
    row.status = input.to
    return { ok: true, applied: true, previous, current: input.to, booking: { ...row } }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function feePi(over: Record<string, unknown> = {}) {
  return {
    id: 'pi_fee_1',
    object: 'payment_intent',
    amount: 4000,
    amount_received: 4000,
    currency: 'eur',
    status: 'succeeded',
    // The legacy booking-id key is deliberately present: a card_fee must still never reach the legacy chain.
    metadata: { kind: 'card_fee', cofBookingId: BOOKING_ID, attempt: '0', bookingReference: REF, bookingId: 'legacy-key' },
    ...over,
  }
}

describe('card_fee classification and observation (tracer, CASH-03)', () => {
  it('classifies card_fee: succeeded -> charge_succeeded, payment_failed -> pi_failed, never unrouted', () => {
    const ok = classifyPaymentEvent(eventOf('payment_intent.succeeded', feePi()) as unknown as Stripe.Event)
    expect(ok).toEqual({ route: 'charge_succeeded', kind: 'card_fee', bookingId: BOOKING_ID })
    const failed = classifyPaymentEvent(
      eventOf('payment_intent.payment_failed', feePi({ status: 'requires_payment_method' })) as unknown as Stripe.Event,
    )
    expect(failed).toEqual({ route: 'pi_failed', kind: 'card_fee', bookingId: BOOKING_ID })
  })

  it('payment_intent.succeeded card_fee writes one charge_succeeded row, no state change, never the legacy chain', async () => {
    const { status } = await deliver(eventOf('payment_intent.succeeded', feePi(), 'evt_f1'))
    expect(status).toBe(200)
    const rows = ledger('charge_succeeded')
    expect(rows).toHaveLength(1)
    expect(rows[0].event_key).toBe('charge_succeeded:pi_fee_1')
    expect(rows[0].amount_minor).toBe(4000)
    expect(rows[0].currency).toBe('eur')
    expect(rows[0].actor_type).toBe('webhook')
    expect(bookingRow().payment_state).toBe('captured')
    expect(saveBooking).not.toHaveBeenCalled()
  })

  it('a redelivery (same event id and a fresh event id) writes nothing new', async () => {
    await deliver(eventOf('payment_intent.succeeded', feePi(), 'evt_f1'))
    const before = ledger().length
    await deliver(eventOf('payment_intent.succeeded', feePi(), 'evt_f1'))
    await deliver(eventOf('payment_intent.succeeded', feePi(), 'evt_f2'))
    expect(ledger().length).toBe(before)
    expect(ledger('charge_succeeded')).toHaveLength(1)
  })

  it('payment_intent.payment_failed card_fee reaches the failure observer (one charge_failed row), not the hold failure path', async () => {
    Object.assign(bookingRow(), { payment_state: 'failed' })
    const pi = feePi({
      status: 'requires_payment_method',
      amount_received: 0,
      last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' },
    })
    const { status } = await deliver(eventOf('payment_intent.payment_failed', pi, 'evt_f3'))
    expect(status).toBe(200)
    const rows = ledger('charge_failed')
    expect(rows).toHaveLength(1)
    expect(rows[0].event_key).toBe('fee_failed_obs:pi_fee_1')
    expect(rows[0].error_code).toBe('insufficient_funds')
    expect(rows[0].amount_minor).toBe(4000)
    expect(bookingRow().payment_state).toBe('failed')
    // No hold failure handling: no client mail, no operator mail, no link.
    expect(mockResendSend).not.toHaveBeenCalled()
    expect(mockLinkCreate).not.toHaveBeenCalled()

    await deliver(eventOf('payment_intent.payment_failed', pi, 'evt_f4'))
    expect(ledger('charge_failed')).toHaveLength(1)
  })

  it('a card_fee without cofBookingId is acknowledged with no write', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pi = feePi({ metadata: { kind: 'card_fee' } })
    const { status } = await deliver(eventOf('payment_intent.succeeded', pi, 'evt_f5'))
    expect(status).toBe(200)
    expect(ledger()).toHaveLength(0)
  })

  it('charge.refunded on a cash_guarantee row writes refund_observed; a pay_now row writes nothing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    Object.assign(bookingRow(), { payment_mode: 'cash_guarantee', status: 'completed', payment_intent_id: 'pi_cash' })
    const refund = (id: string) =>
      eventOf(
        'charge.refunded',
        { id: 'ch_cash', payment_intent: 'pi_cash', refunded: true, amount: 4000, amount_refunded: 4000, currency: 'eur', refunds: { data: [] } },
        id,
      )
    const { status } = await deliver(refund('evt_rf1'))
    expect(status).toBe(200)
    expect(ledger('refund_observed').map((e) => e.event_key)).toEqual(['refund_observed:ch_cash:4000'])
    await deliver(refund('evt_rf2'))
    expect(ledger('refund_observed')).toHaveLength(1)

    db.state.booking_payment_events.length = 0
    bookingRow().payment_mode = 'pay_now'
    await deliver(refund('evt_rf3'))
    expect(ledger('refund_observed')).toHaveLength(0)
  })
})

describe('a paid fee recovery link closes the case (CASH-03)', () => {
  const RECOVERY_PI = 'pi_feerec_1'

  function recoverySession(over: Record<string, unknown> = {}) {
    return {
      id: 'cs_feerec_1',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: RECOVERY_PI,
      amount_total: 4000,
      currency: 'eur',
      metadata: { kind: 'card_recovery', cofBookingId: BOOKING_ID, attempt: 'f1', bookingReference: REF },
      ...over,
    }
  }

  function recoveryPi(over: Record<string, unknown> = {}) {
    return {
      id: RECOVERY_PI,
      object: 'payment_intent',
      status: 'succeeded',
      amount: 4000,
      amount_received: 4000,
      currency: 'eur',
      metadata: { kind: 'card_recovery', cofBookingId: BOOKING_ID, attempt: 'f1', bookingReference: REF },
      ...over,
    }
  }

  function declinedFee(over: Record<string, unknown> = {}) {
    Object.assign(bookingRow(), {
      status: 'cancelled',
      payment_state: 'failed',
      captured_amount_minor: 0,
      payment_intent_id: null,
      recovery_link_id: 'plink_rec',
      recovery_link_url: 'https://buy.stripe.test/plink_rec',
      payment_failed_at: new Date().toISOString(),
      last_payment_error: 'insufficient_funds',
      payment_lease_until: null,
      ...over,
    })
  }

  it('a recovery payment on a failed row with a pending case: captured, case charged with the paid amount, fee_charged and not charged', async () => {
    declinedFee()
    seedCase()
    const { status } = await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_p1'))
    expect(status).toBe(200)

    expect(bookingRow().payment_state).toBe('captured')
    expect(bookingRow().captured_amount_minor).toBe(4000)
    expect(bookingRow().status).toBe('cancelled')

    const c = caseRow()!
    expect(c.status).toBe('charged')
    expect(c.decided_minor).toBe(4000)
    expect(c.decided_by).toBe('webhook')
    expect(c.decided_at).toBeTruthy()
    expect(bookingRow().fee_case_status).toBe('charged')

    expect(ledger('email_sent').map((e) => e.event_key)).toEqual([`email:fee_charged:${CASE_ID}`])
    expect(mails('anna@example.com')).toHaveLength(1)
    expect(mockDeactivate).toHaveBeenCalledWith('plink_rec')
  })

  it('the paid amount, not the proposal, is what the case records', async () => {
    declinedFee()
    seedCase({ decided_minor: 4000 })
    await deliver(eventOf('checkout.session.completed', recoverySession({ amount_total: 3500 }), 'evt_p2'))
    expect(caseRow()!.status).toBe('charged')
    expect(caseRow()!.decided_minor).toBe(3500)
  })

  it('a no-show case closes from a payment_intent.succeeded alone and sends fee_charged', async () => {
    declinedFee({ status: 'no_show' })
    seedCase({ kind: 'no_show' })
    await deliver(eventOf('payment_intent.succeeded', recoveryPi(), 'evt_p3'))
    expect(caseRow()!.status).toBe('charged')
    expect(ledger('email_sent').map((e) => e.event_key)).toEqual([`email:fee_charged:${CASE_ID}`])
  })

  it('the second event of the same payment changes nothing and sends nothing', async () => {
    declinedFee()
    seedCase()
    await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_p4'))
    const mailsBefore = mockResendSend.mock.calls.length
    const ledgerBefore = ledger().length
    const caseBefore = { ...caseRow()! }

    const { status } = await deliver(eventOf('payment_intent.succeeded', recoveryPi(), 'evt_p5'))
    expect(status).toBe(200)
    expect(mockResendSend.mock.calls.length).toBe(mailsBefore)
    expect(ledger().length).toBe(ledgerBefore)
    expect(caseRow()).toEqual(caseBefore)
    expect(bookingRow().captured_amount_minor).toBe(4000)
    expect(mockRefundCreate).not.toHaveBeenCalled()
  })

  it('without a case the charged email goes out as today', async () => {
    declinedFee({ status: 'completed' })
    await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_p6'))
    expect(bookingRow().payment_state).toBe('captured')
    expect(ledger('email_sent').map((e) => e.event_key)).toEqual([`email:charged:${BOOKING_ID}`])
    expect(db.state.booking_fee_cases).toHaveLength(0)
  })

  it('a case that is already waived is left alone and the charged email goes out', async () => {
    declinedFee()
    seedCase({ status: 'waived', decided_minor: null, decided_by: 'admin-1' })
    await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_p7'))
    expect(caseRow()!.status).toBe('waived')
    expect(caseRow()!.decided_by).toBe('admin-1')
    expect(ledger('email_sent').map((e) => e.event_key)).toEqual([`email:charged:${BOOKING_ID}`])
  })

  it('a payment for a booking that is not failed leaves the pending case alone (duplicate refund path)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.assign(bookingRow(), { payment_state: 'captured', captured_amount_minor: 4000, payment_intent_id: 'pi_other' })
    seedCase()
    await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_p8'))
    expect(caseRow()!.status).toBe('pending')
    expect(mockRefundCreate).toHaveBeenCalledTimes(1)
  })

  it('the only writer of booking_fee_cases stays lib/payments/fee.ts: the webhook sources do not name the table', () => {
    for (const f of ['dispatch.ts', 'recovery-events.ts', 'charge-events.ts']) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/stripe-webhook', f), 'utf8')
      expect(src).not.toMatch(/booking_fee_cases/)
    }
  })
})

describe('charge.dispute.created on a fee or cash card charge (T-89-74)', () => {
  const dispute = (over: Record<string, unknown> = {}) => ({
    id: 'dp_cash_1',
    object: 'dispute',
    charge: 'ch_1',
    payment_intent: 'pi_cash',
    amount: 4000,
    currency: 'eur',
    reason: 'fraudulent',
    ...over,
  })

  it('a dispute on a cash_guarantee booking alerts the operator exactly once, as on card_hold', async () => {
    Object.assign(bookingRow(), { payment_mode: 'cash_guarantee', payment_state: 'captured', payment_intent_id: 'pi_cash' })
    const { status } = await deliver(eventOf('charge.dispute.created', dispute(), 'evt_d1'))
    expect(status).toBe(200)
    expect(mails('owner@example.com')).toHaveLength(1)
    expect(mails('owner@example.com')[0].subject).toBe(`[Payment] Dispute opened — ${REF}`)
    expect(ledger('alert_sent').map((e) => e.event_key)).toEqual([`alert:dispute:${BOOKING_ID}:dp_cash_1`])
    expect(bookingRow().payment_state).toBe('captured')

    await deliver(eventOf('charge.dispute.created', dispute(), 'evt_d2'))
    expect(mails('owner@example.com')).toHaveLength(1)
  })

  it('a dispute on a fee PaymentIntent of a card_hold booking is matched through its metadata and alerts once', async () => {
    Object.assign(bookingRow(), { payment_state: 'captured', payment_intent_id: 'pi_main' })
    mockPiRetrieve.mockResolvedValueOnce({ id: 'pi_fee_x', metadata: { kind: 'card_fee', cofBookingId: BOOKING_ID, attempt: '0' } })
    await deliver(eventOf('charge.dispute.created', dispute({ id: 'dp_fee', payment_intent: 'pi_fee_x' }), 'evt_d3'))
    expect(mails('owner@example.com')).toHaveLength(1)
    expect(ledger('alert_sent').map((e) => e.event_key)).toEqual([`alert:dispute:${BOOKING_ID}:dp_fee`])
  })

  it('a pay_now booking is still not alerted through this path', async () => {
    Object.assign(bookingRow(), { payment_mode: 'pay_now', payment_state: 'none', payment_intent_id: 'pi_cash' })
    await deliver(eventOf('charge.dispute.created', dispute(), 'evt_d4'))
    expect(mockResendSend).not.toHaveBeenCalled()
  })
})

describe('money CR-05: a cash card charge that executed after we gave up on it', () => {
  const lateCharge = (id: string) => ({
    id,
    object: 'payment_intent',
    status: 'succeeded',
    currency: 'eur',
    amount: 9000,
    amount_received: 9000,
    metadata: { kind: 'card_charge', cofBookingId: BOOKING_ID, attempt: '0', bookingReference: 'PRG-CASH' },
  })
  const seedCash = (state: string) =>
    Object.assign(bookingRow(), { payment_mode: 'cash_guarantee', payment_state: state, status: 'on_board', payment_amount_minor: 9000 })

  it('the booking is still unpaid: the payment is recorded and the row is paid', async () => {
    seedCash('card_saved')
    expect((await deliver(eventOf('payment_intent.succeeded', lateCharge('pi_late'), 'evt_late1'))).status).toBe(200)
    expect(bookingRow()).toMatchObject({ payment_state: 'captured', payment_intent_id: 'pi_late', captured_amount_minor: 9000 })
    expect(mockRefundCreate).not.toHaveBeenCalled()
  })

  it('the driver already confirmed the cash: the card money goes back and the operator is told', async () => {
    seedCash('cash_settled')
    mockRefundCreate.mockResolvedValue({ id: 're_dup' })
    expect((await deliver(eventOf('payment_intent.succeeded', lateCharge('pi_late2'), 'evt_late2'))).status).toBe(200)
    expect(mockRefundCreate).toHaveBeenCalledWith(
      { payment_intent: 'pi_late2' },
      { idempotencyKey: `refund:${BOOKING_ID}:cash_dup:pi_late2` },
    )
    expect(bookingRow().payment_state).toBe('cash_settled')
    expect(mockResendSend.mock.calls.some((c) => String(c[0]?.subject).includes('Duplicate payment'))).toBe(true)
  })

  it('a row still capturing belongs to the settle that owns it: the webhook only observes', async () => {
    seedCash('capturing')
    expect((await deliver(eventOf('payment_intent.succeeded', lateCharge('pi_late3'), 'evt_late3'))).status).toBe(200)
    expect(bookingRow().payment_state).toBe('capturing')
    expect(mockRefundCreate).not.toHaveBeenCalled()
  })
})
