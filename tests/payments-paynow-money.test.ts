// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 89 money review CR-01, CR-02, CR-03 (and public CR-01): the money facts of a pay-now booking come from its
 * PaymentIntent, and a round trip is two rows sharing one PaymentIntent. Cancel, the fee cap and the refund act on one leg
 * only, whoever asks. The cancel orchestrator, the fee route and the fee module run for real on the stateful fakes.
 */

const { world, mockSendEmail, mockAlert, mockCancelMail, mockDeactivateLink } = vi.hoisted(() => ({
  world: {
    db: null as unknown as FakePaymentsDb,
    stripe: null as unknown,
  },
  mockSendEmail: vi.fn(),
  mockAlert: vi.fn(),
  mockCancelMail: vi.fn(),
  mockDeactivateLink: vi.fn(),
}))

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'

/** advance_booking_status (migration 084) is not part of the payments fake: a compare-and-set on bookings.status. */
async function advanceRpc(args: Record<string, unknown>) {
  const b = world.db.state.bookings.find((x) => x.id === args.p_booking_id)
  if (!b) return { data: { applied: false, current_status: null }, error: null }
  if (b.status !== args.p_from) return { data: { applied: false, current_status: b.status }, error: null }
  b.status = args.p_to
  return { data: { applied: true, booking: { ...b } }, error: null }
}

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn(async () => ({ user: { id: ADMIN_ID }, error: null })) }))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) =>
      name === 'advance_booking_status' ? advanceRpc(args ?? {}) : world.db.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/alerts', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/alerts')>()),
  sendPaymentOperatorAlert: mockAlert,
}))
vi.mock('@/lib/payments/emails/send', () => ({ sendPaymentEmail: mockSendEmail, bookingEmailDataFromRow: (r: unknown) => r }))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: mockDeactivateLink }))
vi.mock('@/lib/booking-status-service', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/booking-status-service')>()),
  scheduleCancelRouteEmail: mockCancelMail,
}))
vi.mock('next/server', async (importActual) => ({
  ...(await importActual<typeof import('next/server')>()),
  after: (fn: () => unknown) => void fn(),
}))

import { POST as FEE_POST } from '@/app/api/admin/bookings/[id]/fee/route'
import { cancelBooking, type CancelBookingInput } from '@/lib/payments/cancel'
import { isFeeEligible, loadFeeCase } from '@/lib/payments/fee'

const OUT = '77777777-7777-4777-8777-777777777777'
const RET = '66666666-6666-4666-8666-666666666666'
const HOUR = 3_600_000
const MIN = 60_000
const PICKUP = Date.parse('2026-12-10T12:00:00Z')
const FREE_NOW = PICKUP - 48 * HOUR
const LATE_NOW = PICKUP - 30 * MIN
const ADMIN = { type: 'admin', id: 'admin-1' } as const
const CLIENT = { type: 'system', id: 'client_token' } as const

let db: FakePaymentsDb
let fake: FakeStripe

const BASE_ROW = {
  status: 'confirmed',
  booking_source: 'web',
  payment_mode: 'pay_now',
  payment_state: 'none',
  payment_currency: null,
  payment_amount_minor: null,
  stripe_payment_method_id: null,
  client_email: 'anna@example.com',
  locale: 'en',
  distance_km: 50,
  pickup_date: '2026-12-10',
  pickup_time: '13:00',
  pickup_utc: new Date(PICKUP).toISOString(),
  linked_booking_id: null,
}

/** A paid pay-now PaymentIntent in the client's currency. */
async function paidPi(amount: number, currency: 'eur' | 'czk'): Promise<string> {
  const pi = (await fake.stripe.paymentIntents.create({
    amount,
    currency,
    payment_method: 'pm_ok',
    off_session: true,
    confirm: true,
    metadata: {},
  })) as { id: string }
  fake.calls.length = 0
  return pi.id
}

/** A one-way booking: buildBookingRow writes leg 'outbound' on every row, one-way ones included. */
function seedOneWay(paymentIntentId: string | null, over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({
    nowMs: LATE_NOW,
    bookings: [
      {
        ...BASE_ROW,
        id: OUT,
        leg: 'outbound',
        trip_type: 'transfer',
        booking_reference: 'PRG-ONEWAY',
        amount_eur: 500,
        amount_czk: 12500,
        payment_intent_id: paymentIntentId,
        ...over,
      },
    ],
  })
  world.db = db
}

/**
 * A round trip as buildRoundTripBookings writes it: one PaymentIntent, two rows, linked_booking_id empty, the outbound row
 * carries the combined amount_eur and the return row none. Leg amounts are pre-promo.
 */
function seedRoundTrip(paymentIntentId: string, over: { out?: Record<string, unknown>; ret?: Record<string, unknown> } = {}) {
  const shared = {
    ...BASE_ROW,
    trip_type: 'round_trip',
    payment_intent_id: paymentIntentId,
    outbound_amount_czk: 4250,
    return_amount_czk: 3250,
  }
  db = createFakePaymentsDb({
    nowMs: LATE_NOW,
    bookings: [
      { ...shared, id: OUT, leg: 'outbound', booking_reference: 'PRG-OUT', amount_eur: 300, amount_czk: 4250, ...over.out },
      { ...shared, id: RET, leg: 'return', booking_reference: 'PRG-RET', amount_eur: null, amount_czk: 3250, ...over.ret },
    ],
  })
  world.db = db
}

const rowOf = (id: string) => db.state.bookings.find((b) => b.id === id)!
const refunds = () => fake.callsTo('refunds.create')
const fee = (id: string, body: unknown) =>
  FEE_POST(new Request(`http://localhost/api/admin/bookings/${id}/fee`, { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  })

function cancel(bookingId: string, initiator: CancelBookingInput['initiator'], nowMs: number, acknowledge?: 'free' | 'late') {
  return cancelBooking({
    bookingId,
    initiator,
    actor: initiator === 'client_token' ? CLIENT : ADMIN,
    nowMs,
    ...(acknowledge ? { acknowledge } : {}),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  fake = createFakeStripe()
  world.stripe = fake.stripe
  mockSendEmail.mockResolvedValue('sent')
  mockAlert.mockResolvedValue('sent')
  mockDeactivateLink.mockResolvedValue(undefined)
})

describe('CR-01: the fee of a pay-now booking is in the currency and amount of the PaymentIntent', () => {
  it('a client who paid 12,500 CZK and is waived gets 12,500 CZK back, not 500 CZK', async () => {
    const pi = await paidPi(1250000, 'czk')
    seedOneWay(pi)

    expect(await cancel(OUT, 'admin_client', LATE_NOW)).toMatchObject({ kind: 'ok', outcome: 'late', money: 'kept' })
    expect(await loadFeeCase(OUT)).toMatchObject({ currency: 'czk', base_minor: 1250000, proposed_minor: 1250000 })

    expect((await fee(OUT, { action: 'waive', reason: 'Flight cancelled' })).status).toBe(200)
    expect(refunds()).toHaveLength(1)
    expect(refunds()[0].params).toMatchObject({ payment_intent: pi, amount: 1250000 })
    expect(fake.state.paymentIntents.get(pi)!.amount_refunded).toBe(1250000)
    expect(await loadFeeCase(OUT)).toMatchObject({ status: 'waived' })

    // The client's mail names the money that really moved, in its currency.
    const mail = mockSendEmail.mock.calls.map((c) => c[0]).find((a) => a.kind === 'fee_waived')
    expect(mail).toMatchObject({ refundMinor: 1250000, moneyOutcome: 'refunded' })
    expect(mail.booking.payment_currency).toBe('czk')
  })

  it('a partial fee on a CZK payment keeps the fee and refunds the rest in haler', async () => {
    const pi = await paidPi(1250000, 'czk')
    seedOneWay(pi)
    await cancel(OUT, 'admin_client', LATE_NOW)

    expect((await fee(OUT, { action: 'charge', amount_minor: 500000 })).status).toBe(200)
    expect(refunds()[0].params).toMatchObject({ payment_intent: pi, amount: 750000 })
    expect(await loadFeeCase(OUT)).toMatchObject({ status: 'charged', decided_minor: 500000 })
    const mail = mockSendEmail.mock.calls.map((c) => c[0]).find((a) => a.kind === 'fee_charged')
    expect(mail.feeMinor).toBe(500000)
    expect(mail.booking.payment_currency).toBe('czk')
  })

  it('a trip edit that moved amount_eur changes nothing: the base is what Stripe holds', async () => {
    const pi = await paidPi(50000, 'eur')
    seedOneWay(pi, { amount_eur: 420 })
    await cancel(OUT, 'admin_client', LATE_NOW)
    expect(await loadFeeCase(OUT)).toMatchObject({ currency: 'eur', base_minor: 50000 })
  })

  it('the cap is the money that is still there: an earlier refund lowers it', async () => {
    const pi = await paidPi(50000, 'eur')
    seedOneWay(pi)
    fake.manualRefund(pi, 10000)
    await cancel(OUT, 'admin_client', LATE_NOW)
    expect(await loadFeeCase(OUT)).toMatchObject({ base_minor: 40000 })
  })

  it('an in-time cancel of a CZK payment reports what was refunded in CZK', async () => {
    const pi = await paidPi(1250000, 'czk')
    seedOneWay(pi)
    const result = await cancel(OUT, 'admin_client', FREE_NOW)
    expect(result).toMatchObject({ kind: 'ok', money: 'refunded', refundedMinor: 1250000, currency: 'czk' })
    expect(mockCancelMail.mock.calls[0][0].payment_currency).toBe('czk')
    expect(mockCancelMail.mock.calls[0][2]).toMatchObject({ refundMinor: 1250000 })
  })

  it('a PaymentIntent nobody paid moves nothing and opens no case (an abandoned checkout)', async () => {
    const pi = (await fake.stripe.paymentIntents.create({ amount: 50000, currency: 'eur', metadata: {} })) as { id: string }
    fake.calls.length = 0
    seedOneWay(pi.id, { status: 'unpaid' })
    expect(await cancel(OUT, 'admin_client', LATE_NOW)).toMatchObject({ kind: 'ok', money: 'none' })
    expect(refunds()).toHaveLength(0)
    expect(await loadFeeCase(OUT)).toBeNull()
  })

  it.each([
    ['late', LATE_NOW],
    ['in time', FREE_NOW],
  ])('a row still unpaid is cancelled %s with no Stripe call and no case, whatever its intent says', async (_label, nowMs) => {
    // The intent reads as paid on purpose: only the row status can stop this one (a payment whose webhook has not landed
    // is the webhook's to handle, a direct cancel must not refund or open a case from here).
    const pi = await paidPi(50000, 'eur')
    seedOneWay(pi, { status: 'unpaid' })
    expect(await cancel(OUT, 'admin_client', nowMs)).toMatchObject({ kind: 'ok', money: 'none' })
    expect(fake.calls).toHaveLength(0)
    expect(await loadFeeCase(OUT)).toBeNull()
  })

  it('isFeeEligible: a pay-now row with an intent counts only once it has left unpaid', () => {
    expect(isFeeEligible({ payment_mode: 'pay_now', payment_intent_id: 'pi_1', status: 'unpaid' })).toBe(false)
    expect(isFeeEligible({ payment_mode: 'pay_now', payment_intent_id: 'pi_1', status: 'confirmed' })).toBe(true)
  })

  it('Stripe can not be read during a late cancel: the cancel stands, nothing is guessed, the operator is told', async () => {
    const pi = await paidPi(50000, 'eur')
    seedOneWay(pi)
    fake.failNextWith('paymentIntents.retrieve', 'connection')
    expect(await cancel(OUT, 'admin_client', LATE_NOW)).toEqual({ kind: 'db_failed', cancelled: true })
    expect(rowOf(OUT).status).toBe('cancelled')
    expect(await loadFeeCase(OUT)).toBeNull()
    expect(mockAlert.mock.calls.some((c) => c[0] === 'fee_decision_needed' && c[2].note === 'case_missing')).toBe(true)
  })

  it('a waive never moves money on a case whose currency is not the payment currency', async () => {
    const pi = await paidPi(1250000, 'czk')
    seedOneWay(pi, { status: 'cancelled', fee_case_status: 'pending' })
    db.state.booking_fee_cases.push({
      id: 'case-old',
      booking_id: OUT,
      kind: 'late_cancel',
      status: 'pending',
      currency: 'eur',
      base_minor: 50000,
      proposed_minor: 50000,
      decided_minor: null,
      charge_requested_at: null,
      evidence: {},
      opened_at: new Date(LATE_NOW).toISOString(),
    })
    expect((await fee(OUT, { action: 'waive', reason: 'Flight cancelled' })).status).toBe(422)
    expect(refunds()).toHaveLength(0)
  })
})
