// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { REQUIRED_EVENTS, KEPT_EVENTS } from '../infra/stripe/webhook-events.mjs'

/**
 * Phase 88 plan 88-09 (PAYF-03, HOLD-01, HOLD-03, MAIL-01): the Stripe webhook routes card-flow events by
 * purpose BEFORE the legacy chain, confirms save-card / hold-now bookings in place exactly once, and sends the
 * localized emails exactly once. The legacy suites (webhooks-stripe*.test.ts) stay unmodified and green.
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

import {
  saveBooking,
  reconcileBookingToConfirmed,
  reconcileBookingByIdToConfirmed,
} from '@/lib/supabase'
import { sendClientConfirmation, sendManagerAlert } from '@/lib/email'
import { scheduleQStashReminder } from '@/lib/qstash'
import { sendGa4Purchase } from '@/lib/analytics-server'
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
  mockResendSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
  mockLinkCreate.mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.test/plink_new' })
  mockDeactivate.mockResolvedValue(undefined)
  mockPiCancel.mockImplementation(async (id: string) => ({ id, status: 'canceled' }))
  mockRefundCreate.mockImplementation(async (params: { payment_intent: string }) => ({ id: `re_${params.payment_intent}`, status: 'succeeded' }))
  process.env.RESEND_API_KEY = 're_test'
  process.env.MANAGER_EMAIL = 'owner@example.com'
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

describe('setup success side effects (HOLD-01, MAIL-01)', () => {
  const emails = () => mockResendSend.mock.calls.map((c) => c[0] as { to: string[]; subject: string; html: string; replyTo: string; from: string })

  beforeEach(() => {
    db.state.booking_payment_consents.push({
      id: 'consent-1',
      booking_id: BOOKING_ID,
      setup_intent_id: 'seti_1',
      mode: 'setup',
      confirmed_at: null,
    })
  })

  it('sends one card_saved email to the client in the booking locale and one English operator alert', async () => {
    await deliver(eventOf('setup_intent.succeeded', setupIntent()))
    expect(emails()).toHaveLength(1)
    const mail = emails()[0]
    expect(mail.to).toEqual(['anna@example.com'])
    expect(mail.from).toContain('bookings@rideprestigo.com')
    expect(mail.replyTo).toBe('bookings@rideprestigo.com')
    expect(mail.html).toContain('lang="ru"')
    // The hold day (hold_at in Prague time) is shown, formatted for the locale.
    const { formatLocaleDate } = await import('@/lib/locale-date')
    const { holdDateIso } = await import('@/lib/payments/timing')
    expect(mail.html).toContain(formatLocaleDate(holdDateIso(Date.parse('2026-11-28T13:00:00.000Z')), 'ru'))
    expect(ledger('email_sent').map((e) => e.event_key)).toEqual([`email:card_saved:${BOOKING_ID}`])

    expect(sendManagerAlert).toHaveBeenCalledTimes(1)
    expect(sendManagerAlert).toHaveBeenCalledWith(expect.objectContaining({ bookingReference: REF, email: 'anna@example.com' }))
    expect(ledger('alert_sent').map((e) => e.event_key)).toEqual([`alert:new_booking:${BOOKING_ID}`])
    expect(sendClientConfirmation).not.toHaveBeenCalled()
  })

  it('confirms the consent row of this SetupIntent', async () => {
    await deliver(eventOf('setup_intent.succeeded', setupIntent()))
    expect(db.state.booking_payment_consents[0].confirmed_at).toBeTruthy()
  })

  it('claims the promo code once, schedules GA4 and the reminder once, and records hold_scheduled', async () => {
    await deliver(
      eventOf(
        'setup_intent.succeeded',
        setupIntent({}, { kind: 'card_setup', cofBookingId: BOOKING_ID, attempt: '1', bookingReference: REF, promoCode: 'WELCOME10' }),
      ),
    )
    expect(mockClaimPromo).toHaveBeenCalledTimes(1)
    expect(mockClaimPromo).toHaveBeenCalledWith({ p_code: 'WELCOME10' })
    expect(sendGa4Purchase).toHaveBeenCalledTimes(1)
    expect(sendGa4Purchase).toHaveBeenCalledWith(expect.objectContaining({ transactionId: REF, valueEur: 100, currency: 'EUR' }))
    expect(scheduleQStashReminder).toHaveBeenCalledTimes(1)
    expect(scheduleQStashReminder).toHaveBeenCalledWith(BOOKING_ID, Date.parse('2026-12-01T13:00:00.000Z'))
    const scheduled = ledger('hold_scheduled')
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].event_key).toBe('hold_scheduled:seti_1')
    expect(scheduled[0].amount_minor).toBe(10000)
    expect(scheduled[0].currency).toBe('eur')
  })

  it('a redelivery of the same SetupIntent sends nothing twice', async () => {
    const withPromo = setupIntent({}, { kind: 'card_setup', cofBookingId: BOOKING_ID, attempt: '1', bookingReference: REF, promoCode: 'WELCOME10' })
    await deliver(eventOf('setup_intent.succeeded', withPromo, 'evt_a'))
    await deliver(eventOf('setup_intent.succeeded', withPromo, 'evt_b'))
    expect(emails()).toHaveLength(1)
    expect(sendManagerAlert).toHaveBeenCalledTimes(1)
    expect(mockClaimPromo).toHaveBeenCalledTimes(1)
    expect(sendGa4Purchase).toHaveBeenCalledTimes(1)
    expect(scheduleQStashReminder).toHaveBeenCalledTimes(1)
  })

  it('a retry after a crash between the transition and the emails finishes them once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Delivery 1: the transition applies, then the consent write throws -> 500, Stripe retries.
    const originalFrom = db.client.from
    let thrown = false
    db.client.from = (table: string) => {
      if (table === 'booking_payment_consents' && !thrown) {
        thrown = true
        throw new Error('simulated crash')
      }
      return originalFrom(table)
    }
    const first = await deliver(eventOf('setup_intent.succeeded', setupIntent(), 'evt_crash'))
    expect(first.status).toBe(500)
    expect(bookingRow().payment_state).toBe('card_saved')
    expect(emails()).toHaveLength(0)

    const retry = await deliver(eventOf('setup_intent.succeeded', setupIntent(), 'evt_crash'))
    expect(retry.status).toBe(200)
    expect(emails()).toHaveLength(1)
    expect(sendManagerAlert).toHaveBeenCalledTimes(1)
    // The once-per-confirmation effects ran on the first delivery only.
    expect(sendGa4Purchase).toHaveBeenCalledTimes(1)
    expect(scheduleQStashReminder).toHaveBeenCalledTimes(1)
  })

  it('a Resend error returns failed, writes a send_failed row and still answers 200', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'to anna@example.com rejected' } })
    const { status } = await deliver(eventOf('setup_intent.succeeded', setupIntent()))
    expect(status).toBe(200)
    const rows = ledger('email_sent')
    expect(rows.map((e) => e.event_key)).toContain(`email:card_saved:${BOOKING_ID}:send_failed`)
    expect(rows.find((e) => String(e.event_key).endsWith(':send_failed'))?.error_code).toBe('send_failed')
    expect(JSON.stringify(err.mock.calls)).not.toContain('anna@example.com')
    // The booking is still confirmed and the operator is still alerted.
    expect(bookingRow().payment_state).toBe('card_saved')
    expect(sendManagerAlert).toHaveBeenCalledTimes(1)
  })

  it('a booking cancelled meanwhile gets no client email, no GA4 and no reminder', async () => {
    bookingRow().status = 'cancelled'
    await deliver(eventOf('setup_intent.succeeded', setupIntent()))
    expect(emails()).toHaveLength(0)
    expect(sendManagerAlert).not.toHaveBeenCalled()
    expect(sendGa4Purchase).not.toHaveBeenCalled()
    expect(scheduleQStashReminder).not.toHaveBeenCalled()
    expect(db.state.booking_payment_consents[0].confirmed_at).toBeNull()
  })

  it('falls back to English for a locale whose catalog has no payment emails', async () => {
    bookingRow().locale = 'xx'
    await deliver(eventOf('setup_intent.succeeded', setupIntent()))
    expect(emails()).toHaveLength(1)
    expect(emails()[0].html).toContain('lang="en"')
  })
})

describe('hold-at-checkout confirmation (HOLD-03)', () => {
  const CAPTURE_BEFORE_S = 1_800_000_000

  function holdPi(over: Record<string, unknown> = {}) {
    return {
      id: 'pi_hold',
      object: 'payment_intent',
      amount: 10000,
      amount_capturable: 10000,
      currency: 'eur',
      latest_charge: 'ch_1',
      metadata: { kind: 'card_hold_now', cofBookingId: BOOKING_ID, attempt: '1', bookingReference: REF },
      ...over,
    }
  }
  const emails = () => mockResendSend.mock.calls.map((c) => c[0] as { html: string })

  beforeEach(() => {
    db.state.booking_payment_consents.push({
      id: 'consent-hn',
      booking_id: BOOKING_ID,
      payment_intent_id: 'pi_hold',
      mode: 'hold_now',
      confirmed_at: null,
    })
    mockPiRetrieve.mockResolvedValue({
      id: 'pi_hold',
      latest_charge: { id: 'ch_1', payment_method_details: { card: { capture_before: CAPTURE_BEFORE_S } } },
    })
  })

  it('confirms once and moves checkout_pending -> authorized with the hold fields, never setting payment_intent_id', async () => {
    const { status } = await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi()))
    expect(status).toBe(200)
    expect(mockAdvance).toHaveBeenCalledTimes(1)
    expect(mockAdvance).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'confirmed', profile: 'payment-engine', expectedFrom: 'unpaid', source: 'card_hold_now' }),
    )
    const row = bookingRow()
    expect(row.status).toBe('confirmed')
    expect(row.payment_state).toBe('authorized')
    expect(row.hold_payment_intent_id).toBe('pi_hold')
    expect(row.hold_amount_minor).toBe(10000)
    expect(row.hold_placed_at).toBeTruthy()
    expect(row.capture_before).toBe(new Date(CAPTURE_BEFORE_S * 1000).toISOString())
    expect(row.payment_intent_id).toBeNull()
    expect(mockPiRetrieve).toHaveBeenCalledWith('pi_hold', { expand: ['latest_charge'] })
    expect(ledger('hold_authorized').map((e) => e.event_key)).toEqual(['hold_authorized:pi_hold'])
    expect(saveBooking).not.toHaveBeenCalled()
  })

  it('reads capture_before from an expanded latest_charge without a second Stripe call', async () => {
    await deliver(
      eventOf(
        'payment_intent.amount_capturable_updated',
        holdPi({ latest_charge: { id: 'ch_1', payment_method_details: { card: { capture_before: CAPTURE_BEFORE_S } } } }),
      ),
    )
    expect(mockPiRetrieve).not.toHaveBeenCalled()
    expect(bookingRow().capture_before).toBe(new Date(CAPTURE_BEFORE_S * 1000).toISOString())
  })

  it('still authorizes when the capture_before lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPiRetrieve.mockRejectedValue(new Error('stripe down'))
    await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi()))
    expect(bookingRow().payment_state).toBe('authorized')
    expect(bookingRow().capture_before).toBeNull()
  })

  it('sends the hold_placed at_checkout email once, confirms the consent and alerts the operator once', async () => {
    await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi(), 'evt_h1'))
    await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi(), 'evt_h2'))
    expect(emails()).toHaveLength(1)
    expect(emails()[0].html).toContain('lang="ru"')
    expect(ledger('email_sent').map((e) => e.event_key)).toEqual([`email:hold_placed_at_checkout:${BOOKING_ID}`])
    expect(db.state.booking_payment_consents[0].confirmed_at).toBeTruthy()
    expect(sendManagerAlert).toHaveBeenCalledTimes(1)
    expect(sendGa4Purchase).toHaveBeenCalledTimes(1)
    expect(scheduleQStashReminder).toHaveBeenCalledTimes(1)
    expect(ledger('hold_authorized')).toHaveLength(1)
  })

  it('a booking cancelled meanwhile moves to released with no email, is not re-confirmed and the authorization is voided', async () => {
    bookingRow().status = 'cancelled'
    await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi()))
    expect(bookingRow().status).toBe('cancelled')
    expect(bookingRow().payment_state).toBe('released')
    expect(emails()).toHaveLength(0)
    expect(sendGa4Purchase).not.toHaveBeenCalled()
    // 88-REVIEW T6 (B-CR-03): nobody owns the authorization, so it is voided instead of freezing the fare ~7 days.
    expect(mockPiCancel).toHaveBeenCalledWith('pi_hold', expect.anything(), { idempotencyKey: 'pi_void:pi_hold' })
    expect(ledger('hold_released').map((e) => [e.event_key, e.error_code])).toEqual([['hold_void:pi_hold', 'booking_cancelled']])
  })

  it('a booking already released by the cancel route (checkout_pending -> released) gets its late authorization voided (A-WR-05)', async () => {
    Object.assign(bookingRow(), { status: 'cancelled', payment_state: 'released', hold_payment_intent_id: 'pi_hold' })
    const { status } = await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi()))
    expect(status).toBe(200)
    expect(bookingRow().payment_state).toBe('released')
    expect(mockPiCancel).toHaveBeenCalledWith('pi_hold', expect.anything(), { idempotencyKey: 'pi_void:pi_hold' })
    expect(emails()).toHaveLength(0)
  })

  it('a hold-now PaymentIntent that lost the race to another state is voided, not adopted', async () => {
    Object.assign(bookingRow(), { payment_state: 'card_saved', hold_payment_intent_id: 'pi_hold' })
    await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi()))
    expect(bookingRow().payment_state).toBe('card_saved')
    expect(mockPiCancel).toHaveBeenCalledWith('pi_hold', expect.anything(), { idempotencyKey: 'pi_void:pi_hold' })
    expect(ledger('hold_released')[0].error_code).toBe('state_moved')
  })

  it('a superseded hold-now PaymentIntent (the checkout replaced it) is voided and confirms nothing (B-WR-01)', async () => {
    bookingRow().hold_payment_intent_id = 'pi_newer'
    const { status } = await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi()))
    expect(status).toBe(200)
    expect(mockAdvance).not.toHaveBeenCalled()
    expect(bookingRow()).toMatchObject({ status: 'unpaid', payment_state: 'checkout_pending', hold_payment_intent_id: 'pi_newer' })
    expect(mockPiCancel).toHaveBeenCalledWith('pi_hold', expect.anything(), { idempotencyKey: 'pi_void:pi_hold' })
    expect(ledger('hold_released')[0].error_code).toBe('superseded')
    expect(emails()).toHaveLength(0)
  })

  it('a void that fails answers 500 so Stripe redelivers; the redelivery voids it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bookingRow().status = 'cancelled'
    mockPiCancel.mockRejectedValueOnce(Object.assign(new Error('down'), { type: 'StripeAPIError', statusCode: 500 }))
    mockPiRetrieve.mockResolvedValueOnce({ id: 'pi_hold', status: 'requires_capture' })
    expect((await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi(), 'evt_v1'))).status).toBe(500)
    expect((await deliver(eventOf('payment_intent.amount_capturable_updated', holdPi(), 'evt_v1'))).status).toBe(200)
    expect(mockPiCancel).toHaveBeenCalledTimes(2)
    expect(ledger('hold_released')).toHaveLength(1)
  })

  it('a hold event for a card_hold (scheduled) PaymentIntent is acknowledged without a handler or write', async () => {
    const { status } = await deliver(
      eventOf(
        'payment_intent.amount_capturable_updated',
        holdPi({ metadata: { kind: 'card_hold', cofBookingId: BOOKING_ID } }),
      ),
    )
    expect(status).toBe(200)
    expect(mockAdvance).not.toHaveBeenCalled()
    expect(bookingRow().payment_state).toBe('checkout_pending')
  })
})

describe('setup_intent.setup_failed', () => {
  it('appends one setup_failed row with the error code, leaves the state alone and sends no email', async () => {
    const si = setupIntent({ last_setup_error: { code: 'setup_intent_authentication_failure', decline_code: 'do_not_honor' } })
    await deliver(eventOf('setup_intent.setup_failed', si, 'evt_f1'))
    await deliver(eventOf('setup_intent.setup_failed', si, 'evt_f1'))
    const rows = ledger('setup_failed')
    expect(rows).toHaveLength(1)
    expect(rows[0].error_code).toBe('do_not_honor')
    expect(bookingRow().payment_state).toBe('checkout_pending')
    expect(bookingRow().status).toBe('unpaid')
    expect(mockResendSend).not.toHaveBeenCalled()
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('falls back to the error code, then to unknown', async () => {
    await deliver(eventOf('setup_intent.setup_failed', setupIntent({ last_setup_error: { code: 'card_declined' } }), 'evt_f2'))
    await deliver(eventOf('setup_intent.setup_failed', setupIntent({ last_setup_error: null }), 'evt_f3'))
    expect(ledger('setup_failed').map((e) => e.error_code)).toEqual(['card_declined', 'unknown'])
  })
})

describe('charge.refunded on a card_hold booking (PAYF-03 observer)', () => {
  function refundEvent(id = 'evt_r1') {
    return eventOf(
      'charge.refunded',
      {
        id: 'ch_9',
        payment_intent: 'pi_cap',
        refunded: true,
        amount: 10000,
        amount_refunded: 4000,
        currency: 'eur',
        refunds: { data: [{ id: 're_1', amount: 4000, metadata: {} }] },
      },
      id,
    )
  }

  beforeEach(() => {
    Object.assign(bookingRow(), { status: 'completed', payment_state: 'captured', payment_intent_id: 'pi_cap' })
  })

  it('appends one refund_observed row, runs the shipped handler and keeps the completed trip', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { status } = await deliver(refundEvent())
    expect(status).toBe(200)
    const rows = ledger('refund_observed')
    expect(rows).toHaveLength(1)
    expect(rows[0].event_key).toBe('refund_observed:ch_9:4000')
    expect(rows[0].amount_minor).toBe(4000)
    expect(rows[0].actor_type).toBe('webhook')
    // The shipped handler ran (it logs the finished-trip guard) and did not cancel the trip.
    expect(console.warn).toHaveBeenCalledWith(
      'charge.refunded: refund on a finished trip, status kept',
      expect.objectContaining({ paymentIntentId: 'pi_cap' }),
    )
    expect(bookingRow().status).toBe('completed')
  })

  it('the same event again adds no second ledger row', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await deliver(refundEvent('evt_r1'))
    await deliver(refundEvent('evt_r2'))
    expect(ledger('refund_observed')).toHaveLength(1)
  })

  it('a refund on a pay-now booking records nothing in the card ledger', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    bookingRow().payment_mode = 'pay_now'
    await deliver(refundEvent())
    expect(ledger('refund_observed')).toHaveLength(0)
  })
})

// ── Plan 88-11: scheduled hold lifecycle (HOLD-02, PAYF-03) ───────────────────────────────────────────────

describe('hold lifecycle events (88-11)', () => {
  const PI_ID = 'pi_hold_1'
  const CAPTURE_BEFORE_S = Math.floor(Date.now() / 1000) + 6 * 24 * 3600

  function holdPi(over: Record<string, unknown> = {}, metadata: Record<string, string> = {}) {
    return {
      id: PI_ID,
      object: 'payment_intent',
      status: 'requires_capture',
      amount: 10000,
      amount_capturable: 10000,
      currency: 'eur',
      cancellation_reason: null,
      latest_charge: { id: 'ch_1', payment_method_details: { card: { capture_before: CAPTURE_BEFORE_S } } },
      metadata: { kind: 'card_hold', cofBookingId: BOOKING_ID, attempt: '0', bookingReference: REF, ...metadata },
      ...over,
    }
  }

  function setBooking(over: Record<string, unknown>) {
    Object.assign(bookingRow(), { status: 'confirmed', payment_lease_until: null, ...over })
  }

  const capturable = (id = 'evt_c1', over: Record<string, unknown> = {}, metadata: Record<string, string> = {}) =>
    eventOf('payment_intent.amount_capturable_updated', holdPi(over, metadata), id)
  const canceled = (reason: string | null, id = 'evt_x1') =>
    eventOf('payment_intent.canceled', holdPi({ status: 'canceled', amount_capturable: 0, cancellation_reason: reason }), id)
  const failedEvent = (id = 'evt_f1', metadata: Record<string, string> = {}) =>
    eventOf(
      'payment_intent.payment_failed',
      holdPi(
        {
          status: 'requires_payment_method',
          amount_capturable: 0,
          last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' },
        },
        metadata,
      ),
      id,
    )

  describe('payment_intent.amount_capturable_updated (card_hold)', () => {
    it('a booking still in placing_hold (lost synchronous response) becomes authorized with the hold fields and one email', async () => {
      setBooking({ payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() + 300_000).toISOString() })
      const { status } = await deliver(capturable())
      expect(status).toBe(200)
      const b = bookingRow()
      expect(b.payment_state).toBe('authorized')
      expect(b.hold_payment_intent_id).toBe(PI_ID)
      expect(b.hold_amount_minor).toBe(10000)
      expect(b.capture_before).toBe(new Date(CAPTURE_BEFORE_S * 1000).toISOString())
      expect(b.payment_lease_until).toBeNull()
      expect(b.payment_intent_id).toBeNull()
      expect(ledger('hold_authorized')).toHaveLength(1)
      expect(ledger('hold_authorized')[0].event_key).toBe(`hold_authorized:${PI_ID}`)
      expect(ledger('hold_authorized')[0].actor_type).toBe('webhook')
      expect(mockResendSend).toHaveBeenCalledTimes(1)
    })

    it('the same PaymentIntent again (new event id) changes nothing and sends no second email', async () => {
      setBooking({ payment_state: 'placing_hold' })
      await deliver(capturable('evt_c1'))
      await deliver(capturable('evt_c2'))
      expect(ledger('hold_authorized')).toHaveLength(1)
      expect(mockResendSend).toHaveBeenCalledTimes(1)
    })

    it('an already authorized booking is left alone: no change, no second ledger row', async () => {
      setBooking({ payment_state: 'authorized', hold_payment_intent_id: PI_ID, hold_amount_minor: 10000 })
      await deliver(capturable())
      expect(bookingRow().payment_state).toBe('authorized')
      expect(ledger()).toHaveLength(0)
      expect(mockResendSend).not.toHaveBeenCalled()
    })

    it('an event of an earlier attempt does not authorize the current one', async () => {
      setBooking({ payment_state: 'placing_hold', hold_attempts: 2 })
      await deliver(capturable('evt_c1', {}, { attempt: '1' }))
      expect(bookingRow().payment_state).toBe('placing_hold')
      expect(ledger()).toHaveLength(0)
    })

    it('a hold-now PaymentIntent (card_hold_now) is not handled here', async () => {
      setBooking({ payment_state: 'placing_hold' })
      await deliver(capturable('evt_c1', {}, { kind: 'card_hold_now' }))
      expect(bookingRow().payment_state).toBe('placing_hold')
    })
  })

  describe('payment_intent.canceled', () => {
    it.each(['expired', 'automatic'])('reason %s on the current hold of an authorized booking -> expired with a hold_expired row', async (reason) => {
      setBooking({ payment_state: 'authorized', hold_payment_intent_id: PI_ID, hold_amount_minor: 10000 })
      const { status } = await deliver(canceled(reason))
      expect(status).toBe(200)
      expect(bookingRow().payment_state).toBe('expired')
      expect(ledger('hold_expired')).toHaveLength(1)
      expect(ledger('hold_expired')[0].event_key).toBe(`hold_expired:${PI_ID}`)
    })

    it('a replay of the expiry changes nothing more', async () => {
      setBooking({ payment_state: 'authorized', hold_payment_intent_id: PI_ID })
      await deliver(canceled('expired', 'evt_x1'))
      await deliver(canceled('expired', 'evt_x2'))
      expect(ledger('hold_expired')).toHaveLength(1)
      expect(bookingRow().payment_state).toBe('expired')
    })

    it("a PaymentIntent that is not the booking's current hold is a ledger-free no-op", async () => {
      setBooking({ payment_state: 'authorized', hold_payment_intent_id: 'pi_other' })
      await deliver(canceled('expired'))
      expect(bookingRow().payment_state).toBe('authorized')
      expect(ledger()).toHaveLength(0)
    })

    it('reason requested_by_customer (our own release) changes no state, at most one observation row', async () => {
      setBooking({ payment_state: 'released', hold_payment_intent_id: PI_ID })
      await deliver(canceled('requested_by_customer', 'evt_x1'))
      await deliver(canceled('requested_by_customer', 'evt_x2'))
      expect(bookingRow().payment_state).toBe('released')
      expect(ledger('hold_released')).toHaveLength(1)
      expect(ledger('hold_released')[0].event_key).toBe(`hold_released_obs:${PI_ID}`)
    })

    it('requested_by_customer on a still authorized booking does not move it (releaseHold owns the state)', async () => {
      setBooking({ payment_state: 'authorized', hold_payment_intent_id: PI_ID })
      await deliver(canceled('requested_by_customer'))
      expect(bookingRow().payment_state).toBe('authorized')
    })

    it('an expiry for a booking that is no longer authorized never moves it', async () => {
      setBooking({ payment_state: 'released', hold_payment_intent_id: PI_ID })
      await deliver(canceled('expired'))
      expect(bookingRow().payment_state).toBe('released')
      expect(ledger('hold_expired')).toHaveLength(0)
    })
  })

  describe('payment_intent.payment_failed (card_hold)', () => {
    it('a placing_hold booking fails with the same patch as the synchronous failure', async () => {
      setBooking({ payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() + 300_000).toISOString() })
      const before = Date.now()
      await deliver(failedEvent())
      const b = bookingRow()
      expect(b.payment_state).toBe('failed')
      expect(b.hold_attempts).toBe(1)
      expect(b.last_payment_error).toBe('insufficient_funds')
      expect(b.payment_lease_until).toBeNull()
      expect(Date.parse(b.payment_failed_at as string)).toBeGreaterThanOrEqual(before - 1000)
      expect(typeof b.payment_retry_at).toBe('string')
      expect(ledger('hold_failed')).toHaveLength(1)
      expect(ledger('hold_failed')[0].event_key).toBe(`hold_failed:${PI_ID}:0`)
    })

    it('a booking that already failed or was authorized is left alone', async () => {
      setBooking({ payment_state: 'failed', hold_attempts: 1, last_payment_error: 'card_declined' })
      await deliver(failedEvent('evt_f1'))
      expect(bookingRow().payment_state).toBe('failed')
      expect(bookingRow().hold_attempts).toBe(1)
      setBooking({ payment_state: 'authorized', hold_payment_intent_id: PI_ID })
      await deliver(failedEvent('evt_f2'))
      expect(bookingRow().payment_state).toBe('authorized')
      expect(ledger()).toHaveLength(0)
    })

    it('a failed hold-now PaymentIntent (card_hold_now) is not handled here', async () => {
      setBooking({ payment_state: 'placing_hold' })
      await deliver(failedEvent('evt_f1', { kind: 'card_hold_now' }))
      expect(bookingRow().payment_state).toBe('placing_hold')
    })
  })

  describe('no backwards transitions', () => {
    it.each([
      ['capturable', () => capturable()],
      ['expired', () => canceled('expired')],
      ['automatic', () => canceled('automatic')],
      ['failed', () => failedEvent()],
    ])('a %s event for a captured booking never moves it', async (_name, make) => {
      setBooking({ payment_state: 'captured', hold_payment_intent_id: PI_ID, payment_intent_id: 'pi_cap' })
      const { status } = await deliver(make())
      expect(status).toBe(200)
      expect(bookingRow().payment_state).toBe('captured')
      expect(ledger('hold_authorized')).toHaveLength(0)
      expect(ledger('hold_expired')).toHaveLength(0)
      expect(ledger('hold_failed')).toHaveLength(0)
    })
  })

  it('a hold event for a partner booking is ignored', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setBooking({ payment_state: 'placing_hold', booking_source: 'gnet' })
    await deliver(capturable())
    expect(bookingRow().payment_state).toBe('placing_hold')
    expect(ledger()).toHaveLength(0)
  })

  it('the hold-events source never names the card-flow settings (D-09a)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/stripe-webhook/hold-events.ts'), 'utf8')
    expect(src).not.toMatch(/card_flow_mode|card_flow_canary_emails|payment_hold_lead_hours|getPaymentSettings/)
    expect(src).toMatch(/'expired'/)
    expect(src).toMatch(/'automatic'/)
  })
})

describe('card charge observation (plan 88-13, HOLD-04, PAYF-03)', () => {
  const KINDS = ['card_hold', 'card_hold_now', 'card_charge', 'card_difference'] as const

  function chargePi(kind: string, over: Record<string, unknown> = {}) {
    return {
      id: `pi_${kind}`,
      object: 'payment_intent',
      amount: 12000,
      amount_received: 12000,
      currency: 'eur',
      status: 'succeeded',
      // The legacy booking-id key is deliberately present: the card route must still never reach the legacy chain.
      metadata: { kind, cofBookingId: BOOKING_ID, attempt: '0', bookingReference: REF, bookingId: 'legacy-key' },
      ...over,
    }
  }

  function setBookingState(over: Record<string, unknown>) {
    Object.assign(bookingRow(), over)
  }

  it.each(KINDS)('payment_intent.succeeded %s -> one charge_succeeded row, no state change, never the legacy chain', async (kind) => {
    setBookingState({ status: 'completed', payment_state: 'captured' })
    const { status } = await deliver(eventOf('payment_intent.succeeded', chargePi(kind), 'evt_s1'))
    expect(status).toBe(200)
    const rows = ledger('charge_succeeded')
    expect(rows).toHaveLength(1)
    expect(rows[0].event_key).toBe(`charge_succeeded:pi_${kind}`)
    expect(rows[0].stripe_object_id).toBe(`pi_${kind}`)
    expect(rows[0].amount_minor).toBe(12000)
    expect(rows[0].currency).toBe('eur')
    expect(rows[0].actor_type).toBe('webhook')
    expect(bookingRow().payment_state).toBe('captured')
    expect(bookingRow().status).toBe('completed')
    expect(saveBooking).not.toHaveBeenCalled()
    expect(reconcileBookingByIdToConfirmed).not.toHaveBeenCalled()
    expect(sendClientConfirmation).not.toHaveBeenCalled()
    expect(sendManagerAlert).not.toHaveBeenCalled()
  })

  it('a replay of the same PaymentIntent (same or new event id) adds no second row', async () => {
    setBookingState({ payment_state: 'captured' })
    await deliver(eventOf('payment_intent.succeeded', chargePi('card_charge'), 'evt_r1'))
    await deliver(eventOf('payment_intent.succeeded', chargePi('card_charge'), 'evt_r1'))
    await deliver(eventOf('payment_intent.succeeded', chargePi('card_charge'), 'evt_r2'))
    expect(ledger('charge_succeeded')).toHaveLength(1)
  })

  it('a captured hold reports the amount actually received (a lowered capture is not the authorized amount)', async () => {
    setBookingState({ payment_state: 'captured' })
    await deliver(eventOf('payment_intent.succeeded', chargePi('card_hold', { amount: 12000, amount_received: 9000 }), 'evt_a1'))
    expect(ledger('charge_succeeded')[0].amount_minor).toBe(9000)
  })

  it('an unknown booking and a partner booking are acknowledged with no write', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unknown = chargePi('card_charge', {
      metadata: { kind: 'card_charge', cofBookingId: '99999999-9999-4999-8999-999999999999', attempt: '0' },
    })
    expect((await deliver(eventOf('payment_intent.succeeded', unknown, 'evt_u1'))).status).toBe(200)
    setBookingState({ booking_source: 'gnet' })
    expect((await deliver(eventOf('payment_intent.succeeded', chargePi('card_charge'), 'evt_u2'))).status).toBe(200)
    expect(ledger()).toHaveLength(0)
  })

  it('payment_intent.payment_failed on card_charge / card_difference adds one observation row and leaves the state alone', async () => {
    setBookingState({ payment_state: 'failed' })
    const failed = (kind: string) =>
      chargePi(kind, { status: 'requires_payment_method', last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' } })
    await deliver(eventOf('payment_intent.payment_failed', failed('card_charge'), 'evt_f1'))
    await deliver(eventOf('payment_intent.payment_failed', failed('card_charge'), 'evt_f2'))
    await deliver(eventOf('payment_intent.payment_failed', failed('card_difference'), 'evt_f3'))
    expect(ledger('charge_failed').map((e) => e.event_key)).toEqual(['charge_failed_obs:pi_card_charge'])
    expect(ledger('difference_failed').map((e) => e.event_key)).toEqual(['difference_failed_obs:pi_card_difference'])
    expect(ledger('charge_failed')[0].error_code).toBe('insufficient_funds')
    expect(bookingRow().payment_state).toBe('failed')
    expect(saveBooking).not.toHaveBeenCalled()
  })

  it('payment_failed on a scheduled card_hold still runs the hold failure backup (unchanged)', async () => {
    setBookingState({ payment_state: 'placing_hold', hold_attempts: 0 })
    await deliver(
      eventOf(
        'payment_intent.payment_failed',
        chargePi('card_hold', { status: 'requires_payment_method', last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' } }),
        'evt_h1',
      ),
    )
    expect(bookingRow().payment_state).toBe('failed')
    expect(ledger('hold_failed')).toHaveLength(1)
  })

  it('the charge-events source never names the card-flow settings (D-09a)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/stripe-webhook/charge-events.ts'), 'utf8')
    expect(src).not.toMatch(/card_flow_mode|card_flow_canary_emails|payment_hold_lead_hours|getPaymentSettings/)
  })
})

describe('recovery link payment and disputes (plan 88-14, HOLD-05, PAYF-03)', () => {
  const RECOVERY_PI = 'pi_rec_1'

  function recoverySession(over: Record<string, unknown> = {}, metadata: Record<string, string> = {}) {
    return {
      id: 'cs_rec_1',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: RECOVERY_PI,
      amount_total: 12000,
      currency: 'eur',
      // The legacy booking-id key is deliberately absent: a recovery link never carries it.
      metadata: { kind: 'card_recovery', cofBookingId: BOOKING_ID, attempt: '1', bookingReference: REF, ...metadata },
      ...over,
    }
  }

  function recoveryPi(over: Record<string, unknown> = {}) {
    return {
      id: RECOVERY_PI,
      object: 'payment_intent',
      status: 'succeeded',
      amount: 12000,
      amount_received: 12000,
      currency: 'eur',
      metadata: { kind: 'card_recovery', cofBookingId: BOOKING_ID, attempt: '1', bookingReference: REF },
      ...over,
    }
  }

  function setBooking(over: Record<string, unknown>) {
    Object.assign(bookingRow(), { status: 'confirmed', payment_lease_until: null, ...over })
  }

  function failedBooking(over: Record<string, unknown> = {}) {
    setBooking({
      payment_state: 'failed',
      payment_amount_minor: 12000,
      captured_amount_minor: 0,
      payment_intent_id: null,
      recovery_link_id: 'plink_rec',
      recovery_link_url: 'https://buy.stripe.test/plink_rec',
      payment_failed_at: new Date().toISOString(),
      last_payment_error: 'insufficient_funds',
      payment_retry_at: new Date(Date.now() + 3_600_000).toISOString(),
      ...over,
    })
  }

  const clientMails = () =>
    mockResendSend.mock.calls.map((c) => c[0] as { to: string[]; subject: string; html?: string; text?: string }).filter((m) => m.to[0] === 'anna@example.com')
  const operatorMails = () =>
    mockResendSend.mock.calls.map((c) => c[0] as { to: string[]; subject: string; html?: string; text?: string }).filter((m) => m.to[0] === 'owner@example.com')

  describe('checkout.session.completed with kind card_recovery', () => {
    it('a paid recovery session closes a failed booking: captured, the amount, the PaymentIntent, link deactivated, charged email once', async () => {
      failedBooking()
      const { status, json } = await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_r1'))
      expect(status).toBe(200)
      expect(json).toEqual({ received: true })

      const b = bookingRow()
      expect(b.payment_state).toBe('captured')
      expect(b.captured_amount_minor).toBe(12000)
      expect(b.payment_intent_id).toBe(RECOVERY_PI)
      expect(b.last_payment_error).toBeNull()
      expect(b.payment_failed_at).toBeNull()
      expect(b.payment_retry_at).toBeNull()
      expect(b.status).toBe('confirmed')

      expect(ledger('recovery_paid')).toHaveLength(1)
      expect(ledger('recovery_paid')[0].event_key).toBe(`recovery_paid:${RECOVERY_PI}`)
      expect(ledger('recovery_paid')[0].amount_minor).toBe(12000)
      expect(ledger('recovery_paid')[0].actor_type).toBe('webhook')
      expect(mockDeactivate).toHaveBeenCalledWith('plink_rec')

      expect(mockResendSend).toHaveBeenCalledTimes(1)
      expect(clientMails()).toHaveLength(1)
      expect(ledger('email_sent').map((e) => e.event_key)).toEqual([`email:charged:${BOOKING_ID}`])

      // The legacy checkout.session.completed handler never runs for a card object.
      expect(saveBooking).not.toHaveBeenCalled()
      expect(reconcileBookingByIdToConfirmed).not.toHaveBeenCalled()
      expect(sendClientConfirmation).not.toHaveBeenCalled()
      expect(sendManagerAlert).not.toHaveBeenCalled()
    })

    it('a balance_due booking paying the 3000 difference becomes captured with 15000; payment_intent_id stays the main capture', async () => {
      failedBooking({
        payment_state: 'balance_due',
        payment_amount_minor: 15000,
        captured_amount_minor: 12000,
        payment_intent_id: 'pi_main',
        payment_retry_at: null,
      })
      await deliver(eventOf('checkout.session.completed', recoverySession({ amount_total: 3000 }), 'evt_r2'))

      const b = bookingRow()
      expect(b.payment_state).toBe('captured')
      expect(b.captured_amount_minor).toBe(15000)
      expect(b.payment_intent_id).toBe('pi_main')
      expect(ledger('recovery_paid')[0].amount_minor).toBe(3000)
      expect(clientMails()).toHaveLength(1)
    })

    it('the payment_intent.succeeded of the same payment afterwards changes nothing and sends nothing', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      failedBooking()
      await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_r3'))
      const mailsBefore = mockResendSend.mock.calls.length
      const ledgerBefore = ledger().length

      const { status } = await deliver(eventOf('payment_intent.succeeded', recoveryPi(), 'evt_r4'))
      expect(status).toBe(200)
      expect(bookingRow().captured_amount_minor).toBe(12000)
      expect(bookingRow().payment_state).toBe('captured')
      expect(mockResendSend.mock.calls.length).toBe(mailsBefore)
      expect(ledger().length).toBe(ledgerBefore)
      expect(errors).not.toHaveBeenCalledWith(expect.stringContaining('not payable'), expect.anything())
    })

    it('a payment_intent.succeeded alone also closes the booking (the session event was lost)', async () => {
      failedBooking()
      await deliver(eventOf('payment_intent.succeeded', recoveryPi(), 'evt_r5'))
      expect(bookingRow().payment_state).toBe('captured')
      expect(bookingRow().captured_amount_minor).toBe(12000)
      expect(bookingRow().payment_intent_id).toBe(RECOVERY_PI)
      expect(clientMails()).toHaveLength(1)
    })

    it('a session that is not paid is acknowledged with no ledger row and no state change', async () => {
      failedBooking()
      const { status } = await deliver(eventOf('checkout.session.completed', recoverySession({ payment_status: 'unpaid' }), 'evt_r6'))
      expect(status).toBe(200)
      expect(bookingRow().payment_state).toBe('failed')
      expect(ledger()).toHaveLength(0)
      expect(mockResendSend).not.toHaveBeenCalled()
    })

    it('money for a booking that is already captured is parked in the ledger and logged, never applied twice', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      failedBooking({ payment_state: 'captured', captured_amount_minor: 12000, payment_intent_id: 'pi_other' })
      await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_r7'))
      expect(bookingRow().captured_amount_minor).toBe(12000)
      expect(ledger('recovery_paid')).toHaveLength(1)
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('not payable'), expect.objectContaining({ bookingId: BOOKING_ID }))
      expect(mockResendSend).not.toHaveBeenCalled()
    })

    it('a booking that is busy (capturing) makes the webhook answer 500 so Stripe redelivers', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      failedBooking({ payment_state: 'capturing' })
      const { status } = await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_r8'))
      expect(status).toBe(500)
      expect(ledger()).toHaveLength(0)
    })

    it('an unknown booking and a partner booking are acknowledged with no write', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const unknown = recoverySession({}, { cofBookingId: '99999999-9999-4999-8999-999999999999' })
      expect((await deliver(eventOf('checkout.session.completed', unknown, 'evt_r9'))).status).toBe(200)
      failedBooking({ booking_source: 'gnet' })
      expect((await deliver(eventOf('checkout.session.completed', recoverySession(), 'evt_r10'))).status).toBe(200)
      expect(bookingRow().payment_state).toBe('failed')
      expect(ledger()).toHaveLength(0)
    })
  })

  describe('payment_intent.payment_failed on a scheduled card_hold (backup path)', () => {
    const failedHoldEvent = (id: string) =>
      eventOf(
        'payment_intent.payment_failed',
        {
          id: 'pi_hold_f',
          object: 'payment_intent',
          status: 'requires_payment_method',
          amount: 10000,
          currency: 'eur',
          metadata: { kind: 'card_hold', cofBookingId: BOOKING_ID, attempt: '0', bookingReference: REF },
          last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' },
        },
        id,
      )

    it('placing_hold -> failed, then the recovery link, the payment_failed email and the operator alert once', async () => {
      setBooking({ payment_state: 'placing_hold', hold_attempts: 0, payment_amount_minor: 10000, payment_lease_until: new Date(Date.now() + 300_000).toISOString() })
      const { status } = await deliver(failedHoldEvent('evt_h1'))
      expect(status).toBe(200)

      expect(bookingRow().payment_state).toBe('failed')
      expect(bookingRow().hold_attempts).toBe(1)
      expect(mockLinkCreate).toHaveBeenCalledTimes(1)
      expect(mockLinkCreate.mock.calls[0][1]).toEqual({ idempotencyKey: `link:${BOOKING_ID}:1` })
      expect(bookingRow().recovery_link_id).toBe('plink_new')
      expect(clientMails()).toHaveLength(1)
      expect(operatorMails()).toHaveLength(1)
      expect(operatorMails()[0].subject).toBe(`[Payment] Hold failed — ${REF}`)
    })

    it('the same failure again (new event id, or the synchronous path later) sends nothing twice', async () => {
      setBooking({ payment_state: 'placing_hold', hold_attempts: 0, payment_amount_minor: 10000, payment_lease_until: new Date(Date.now() + 300_000).toISOString() })
      await deliver(failedHoldEvent('evt_h2'))
      await deliver(failedHoldEvent('evt_h3'))
      expect(mockResendSend).toHaveBeenCalledTimes(2)
      expect(mockLinkCreate).toHaveBeenCalledTimes(1)

      const { handlePaymentFailure } = await import('@/lib/payments/recovery')
      await handlePaymentFailure({ ...bookingRow() }, { phase: 'hold', code: 'insufficient_funds', amountMinor: 10000, attempt: 1 })
      expect(mockResendSend).toHaveBeenCalledTimes(2)
      expect(ledger('recovery_link_created')).toHaveLength(1)
    })
  })

  describe('charge.dispute.created', () => {
    const dispute = (over: Record<string, unknown> = {}) => ({
      id: 'dp_1',
      object: 'dispute',
      charge: 'ch_1',
      payment_intent: 'pi_main',
      amount: 12000,
      currency: 'eur',
      reason: 'fraudulent',
      ...over,
    })

    it('a dispute on a card booking sends one operator alert and changes no state', async () => {
      setBooking({ payment_state: 'captured', payment_intent_id: 'pi_main', captured_amount_minor: 10000 })
      const { status } = await deliver(eventOf('charge.dispute.created', dispute(), 'evt_d1'))
      expect(status).toBe(200)

      expect(operatorMails()).toHaveLength(1)
      expect(operatorMails()[0].subject).toBe(`[Payment] Dispute opened — ${REF}`)
      expect(operatorMails()[0].text).toContain('Reason code: fraudulent')
      expect(bookingRow().payment_state).toBe('captured')
      expect(ledger('alert_sent').map((e) => e.event_key)).toEqual([`alert:dispute:${BOOKING_ID}:dp_1`])

      await deliver(eventOf('charge.dispute.created', dispute(), 'evt_d2'))
      expect(operatorMails()).toHaveLength(1)
    })

    it('finds the booking through the hold PaymentIntent too', async () => {
      setBooking({ payment_state: 'captured', payment_intent_id: null, hold_payment_intent_id: 'pi_main' })
      await deliver(eventOf('charge.dispute.created', dispute(), 'evt_d3'))
      expect(operatorMails()).toHaveLength(1)
    })

    it('a dispute that belongs to no card booking is acknowledged without an alert', async () => {
      setBooking({ payment_state: 'captured', payment_intent_id: 'pi_main' })
      const { status } = await deliver(eventOf('charge.dispute.created', dispute({ payment_intent: 'pi_somebody_else' }), 'evt_d4'))
      expect(status).toBe(200)
      expect(mockResendSend).not.toHaveBeenCalled()
    })

    it('a pay-now booking is not alerted through this path', async () => {
      setBooking({ payment_mode: 'pay_now', payment_state: 'none', payment_intent_id: 'pi_main' })
      await deliver(eventOf('charge.dispute.created', dispute(), 'evt_d5'))
      expect(mockResendSend).not.toHaveBeenCalled()
    })
  })

  it('the recovery-events source never names the card-flow settings (D-09a) nor the legacy booking-id key', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/stripe-webhook/recovery-events.ts'), 'utf8')
    expect(src).not.toMatch(/card_flow_mode|card_flow_canary_emails|payment_hold_lead_hours|getPaymentSettings/)
    expect(src).not.toMatch(/metadata\??\.bookingId\b/)
  })
})

describe('event list parity (PAYF-04)', () => {
  const subscribed = new Set<string>([...REQUIRED_EVENTS, ...KEPT_EVENTS])

  it('every card event type is subscribed by the owner script', () => {
    for (const type of CARD_EVENT_TYPES) expect(subscribed.has(type)).toBe(true)
  })

  it('every event type the dispatcher routes is in REQUIRED_EVENTS or KEPT_EVENTS', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'lib/stripe-webhook/dispatch.ts'), 'utf8')
    const routed = [...source.matchAll(/case '([a-z_]+\.[a-z_.]+)':/g)].map((m) => m[1])
    expect(routed.length).toBeGreaterThanOrEqual(8)
    for (const type of routed) expect(subscribed.has(type), `${type} is routed but not subscribed`).toBe(true)
  })
})
