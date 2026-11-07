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
    siblingLookupDown: false,
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
    from: (table: string) => {
      const query = world.db.client.from(table) as unknown as Record<string, unknown>
      // neq on bookings is the sibling lookup of a shared PaymentIntent: the one read a refund must not guess past.
      if (world.siblingLookupDown && table === 'bookings') query.neq = async () => ({ data: null, error: { message: 'down' } })
      return query
    },
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
import { buildManageView } from '@/lib/manage-view'
import { legShareMinor } from '@/lib/payments/pay-now'

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
  world.siblingLookupDown = false
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

describe('CR-02 (public CR-01): one leg of a round trip is cancelled and refunded alone, whoever asks', () => {
  // 30,000 EUR cents paid for 4250 + 3250 CZK legs: outbound 17,000, return 13,000.
  const OUT_SHARE = 17000
  const RET_SHARE = 13000

  it.each([
    ['the client, through the manage link', 'client_token' as const, 'free' as const],
    ['the operator for the client', 'admin_client' as const, undefined],
    ['Prestigo', 'admin_prestigo' as const, undefined],
  ])('%s cancels the return leg in time: only its share goes back, tagged with the leg', async (_who, initiator, acknowledge) => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi)

    const result = await cancel(RET, initiator, FREE_NOW, acknowledge)

    expect(result).toMatchObject({ kind: 'ok', money: 'refunded', refundedMinor: RET_SHARE, currency: 'eur' })
    expect(refunds()).toHaveLength(1)
    expect(refunds()[0].params).toEqual({ payment_intent: pi, amount: RET_SHARE, metadata: { leg: 'return' } })
    expect(refunds()[0].idempotencyKey).toBe(`refund:${RET}:return`)
    expect(fake.state.paymentIntents.get(pi)!.amount_refunded).toBe(RET_SHARE)
    expect(rowOf(RET).status).toBe('cancelled')
    expect(rowOf(OUT).status).toBe('confirmed')
  })

  it('the outbound row holds the combined amount_eur, its refund is still only its own share', async () => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi)
    await cancel(OUT, 'client_token', FREE_NOW, 'free')
    expect(refunds()[0].params).toEqual({ payment_intent: pi, amount: OUT_SHARE, metadata: { leg: 'outbound' } })
    expect(rowOf(RET).status).toBe('confirmed')
  })

  it('cancelling both legs one after the other returns exactly what was paid', async () => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi)
    await cancel(OUT, 'admin_client', FREE_NOW)
    await cancel(RET, 'admin_client', FREE_NOW)
    expect(fake.state.paymentIntents.get(pi)!.amount_refunded).toBe(30000)
  })

  it('a CZK round trip refunds the leg in CZK', async () => {
    const pi = await paidPi(750000, 'czk')
    seedRoundTrip(pi)
    expect(await cancel(RET, 'admin_client', FREE_NOW)).toMatchObject({ refundedMinor: 325000, currency: 'czk' })
  })

  it('the sibling can not be looked up: nothing is written and nothing is refunded', async () => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi)
    world.siblingLookupDown = true
    expect(await cancel(RET, 'admin_client', FREE_NOW)).toEqual({ kind: 'db_failed' })
    expect(rowOf(RET).status).toBe('confirmed')
    expect(refunds()).toHaveLength(0)
  })

  it('two rows share a payment but the leg amounts are gone: refused before any write', async () => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi, { ret: { return_amount_czk: null } })
    expect(await cancel(RET, 'admin_client', FREE_NOW)).toEqual({ kind: 'leg_amount_missing' })
    expect(rowOf(RET).status).toBe('confirmed')
    expect(refunds()).toHaveLength(0)
  })

  it('one-way rows also write leg outbound: they refund the whole payment with no leg', async () => {
    const pi = await paidPi(50000, 'eur')
    seedOneWay(pi)
    expect(await cancel(OUT, 'admin_client', FREE_NOW)).toMatchObject({ money: 'refunded', refundedMinor: 50000 })
    expect(refunds()[0].params).toEqual({ payment_intent: pi })
    expect(refunds()[0].idempotencyKey).toBe(`refund:${OUT}:full`)
  })

  describe('the manage page promises what cancelBooking does', () => {
    const facts = (shareMinor: number, currency: 'eur' | 'czk' = 'eur') => ({
      payNow: { currency, paidMinor: 30000, shareMinor, collectedMinor: shareMinor },
    })
    const manageRow = (over: Record<string, unknown>) => ({
      ...BASE_ROW,
      trip_type: 'round_trip',
      booking_reference: 'PRG-RET',
      payment_intent_id: 'pi_rt',
      outbound_amount_czk: 4250,
      return_amount_czk: 3250,
      ...over,
    })

    it('the return row, whose amount_eur is NULL, shows the leg refund instead of "nothing charged"', () => {
      const v = buildManageView(manageRow({ id: RET, leg: 'return', amount_eur: null }), facts(RET_SHARE), FREE_NOW)
      expect(v.cancel).toMatchObject({ freeMoney: 'refund', refundMinor: RET_SHARE, payNow: true })
      expect(v.fare).toEqual({ amountMinor: RET_SHARE, currency: 'eur' })
      expect(v.payment).toMatchObject({ key: 'paidCard', amountMinor: RET_SHARE })
    })

    it('the outbound row does not show the combined total', () => {
      const v = buildManageView(manageRow({ id: OUT, leg: 'outbound', amount_eur: 300 }), facts(OUT_SHARE), LATE_NOW)
      expect(v.cancel).toMatchObject({ refundMinor: OUT_SHARE, proposedFeeMinor: OUT_SHARE, currency: 'eur' })
    })

    it('a CZK payment is shown in CZK', () => {
      const v = buildManageView(manageRow({ id: RET, leg: 'return', amount_eur: null }), facts(325000, 'czk'), FREE_NOW)
      expect(v.fare).toEqual({ amountMinor: 325000, currency: 'czk' })
    })

    it('Stripe could not be read: the leg estimate, never the combined total and never "nothing"', () => {
      const out = buildManageView(manageRow({ id: OUT, leg: 'outbound', amount_eur: 300 }), {}, FREE_NOW)
      expect(out.cancel?.freeMoney).toBe('refund')
      expect(out.cancel?.refundMinor).toBeLessThan(30000)
      const ret = buildManageView(manageRow({ id: RET, leg: 'return', amount_eur: null }), {}, FREE_NOW)
      expect(ret.cancel?.freeMoney).toBe('refund')
    })

    it('a row still unpaid promises nothing: no refund, no payment line', () => {
      const v = buildManageView(
        manageRow({ id: OUT, leg: 'outbound', amount_eur: 300, status: 'unpaid', trip_type: 'transfer' }),
        {},
        FREE_NOW,
      )
      expect(v.cancel).toMatchObject({ freeMoney: 'none', refundMinor: null })
      expect(v.payment).toBeNull()
    })
  })

  it('legShareMinor: the two shares always add up to the payment', () => {
    for (const paid of [1, 99, 30000, 1250001]) {
      const out = legShareMinor(paid, 4250, 3250, 'outbound')!
      const ret = legShareMinor(paid, 4250, 3250, 'return')!
      expect(out + ret).toBe(paid)
    }
    expect(legShareMinor(30000, null, 3250, 'return')).toBeNull()
    expect(legShareMinor(30000, 0, 0, 'return')).toBeNull()
  })
})

describe('CR-03: a fee on a leg of a round trip is capped by that leg, and the return leg gets a case too', () => {
  const OUT_SHARE = 17000
  const RET_SHARE = 13000

  it('a late cancel of the outbound leg proposes its share, not the combined fare, in the payment currency', async () => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi)
    expect(await cancel(OUT, 'admin_client', LATE_NOW)).toMatchObject({ kind: 'ok', money: 'kept' })
    expect(await loadFeeCase(OUT)).toMatchObject({ currency: 'eur', base_minor: OUT_SHARE, proposed_minor: OUT_SHARE })
    expect(refunds()).toHaveLength(0)
  })

  it('a late cancel of the return leg, whose amount_eur is NULL, opens a case', async () => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi)
    expect(await cancel(RET, 'client_token', LATE_NOW, 'late')).toMatchObject({ kind: 'ok', outcome: 'late', money: 'kept' })
    expect(await loadFeeCase(RET)).toMatchObject({ base_minor: RET_SHARE })
  })

  it('waiving one leg refunds that leg, tagged, and leaves the live leg alone', async () => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi)
    await cancel(OUT, 'admin_client', LATE_NOW)
    expect((await fee(OUT, { action: 'waive', reason: 'Flight cancelled' })).status).toBe(200)
    expect(refunds()).toHaveLength(1)
    expect(refunds()[0].params).toMatchObject({ payment_intent: pi, amount: OUT_SHARE, metadata: { leg: 'outbound' } })
    expect(fake.state.paymentIntents.get(pi)!.amount_refunded).toBe(OUT_SHARE)
    expect(rowOf(RET).status).toBe('confirmed')
  })

  it('a fee above the leg share is refused, whatever the combined fare is', async () => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi)
    await cancel(OUT, 'admin_client', LATE_NOW)
    const res = await fee(OUT, { action: 'charge', amount_minor: OUT_SHARE + 1 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'amount_above_cap' })
    expect(refunds()).toHaveLength(0)
  })

  it('100% kept on one leg: a later cancel of the other leg refunds only its own share', async () => {
    const pi = await paidPi(30000, 'eur')
    seedRoundTrip(pi)
    await cancel(OUT, 'admin_client', LATE_NOW)
    expect((await fee(OUT, { action: 'charge', amount_minor: OUT_SHARE })).status).toBe(200)
    expect(refunds()).toHaveLength(0)

    await cancel(RET, 'admin_client', FREE_NOW)
    expect(refunds()).toHaveLength(1)
    expect(refunds()[0].params).toMatchObject({ amount: RET_SHARE, metadata: { leg: 'return' } })
    expect(fake.state.paymentIntents.get(pi)!.amount_refunded).toBe(RET_SHARE)
  })

  it('with a promo the two leg caps add up to what was paid, so the second waive still fits', async () => {
    // 4250 + 3250 CZK before the promo, 24,000 cents paid after it.
    const pi = await paidPi(24000, 'eur')
    seedRoundTrip(pi)
    await cancel(OUT, 'admin_client', LATE_NOW)
    await cancel(RET, 'admin_client', LATE_NOW)
    const outCase = await loadFeeCase(OUT)
    const retCase = await loadFeeCase(RET)
    expect(outCase!.base_minor + retCase!.base_minor).toBe(24000)

    expect((await fee(OUT, { action: 'waive', reason: 'Flight cancelled' })).status).toBe(200)
    expect((await fee(RET, { action: 'waive', reason: 'Flight cancelled' })).status).toBe(200)
    expect(fake.state.paymentIntents.get(pi)!.amount_refunded).toBe(24000)
  })
})
