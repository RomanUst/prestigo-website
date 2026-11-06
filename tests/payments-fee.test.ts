// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 89 plan 89-06 (CASH-03, HOLD-06, D-10, D-14, D-21): a fee chosen by a person is collected through the one
 * collector (settleBooking with opts.collect), with the amount locked on the case and Stripe keys that come from the
 * case id and the attempt, never from the amount. Without opts.collect nothing of Phase 88 changes.
 */

const { world, mockSendEmail, mockFailure, mockDeactivateLink } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
  },
  mockSendEmail: vi.fn(),
  mockFailure: vi.fn(),
  mockDeactivateLink: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db!.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/emails/send', () => ({ sendPaymentEmail: mockSendEmail, bookingEmailDataFromRow: (r: unknown) => r }))
// The link / email / alert of a declined charge are covered by tests/payments-failure.test.ts; here only the call is pinned.
vi.mock('@/lib/payments/recovery', () => ({ handlePaymentFailure: mockFailure }))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: mockDeactivateLink }))

import { settleBooking } from '@/lib/payments/settle'
import {
  feeBaseFor,
  isFeeEligible,
  loadFeeCase,
  lockFeeAmount,
  markFeeCharged,
  markFeeWaived,
  openFeeCase,
  runCashCardCharge,
  runFeeCharge,
  unlockFeeAmount,
  type FeeCaseRow,
} from '@/lib/payments/fee'

const ID = '77777777-7777-4777-8777-777777777777'
const HOUR = 3_600_000
const ADMIN = { type: 'admin', id: 'admin-1' } as const

let db: FakePaymentsDb
let fake: FakeStripe

function seed(over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({
    bookings: [
      {
        id: ID,
        status: 'cancelled',
        booking_source: 'web',
        payment_mode: 'card_hold',
        payment_state: 'authorized',
        booking_reference: 'PRG-20261101-FEE001',
        client_email: 'anna@example.com',
        locale: 'en',
        pickup_date: '2026-11-01',
        pickup_time: '14:00',
        pickup_utc: new Date(Date.now() + 2 * HOUR).toISOString(),
        payment_currency: 'eur',
        payment_amount_minor: 10000,
        stripe_customer_id: 'cus_1',
        stripe_payment_method_id: 'pm_ok',
        charge_attempts: 0,
        ...over,
      },
    ],
  })
  world.db = db
}

/** A cancelled booking whose full-amount hold sits at Stripe in requires_capture. */
async function seedWithHold(over: Record<string, unknown> = {}, holdAmount = 10000) {
  const hold = (await fake.stripe.paymentIntents.create({
    amount: holdAmount,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_ok',
    capture_method: 'manual',
    off_session: true,
    confirm: true,
    metadata: { kind: 'card_hold', cofBookingId: ID, attempt: '0', bookingReference: 'PRG-20261101-FEE001' },
  })) as { id: string }
  seed({ hold_payment_intent_id: hold.id, hold_amount_minor: holdAmount, payment_state: 'authorized', ...over })
  return hold.id
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))

async function openCase(over: Partial<Parameters<typeof openFeeCase>[0]> = {}): Promise<FeeCaseRow> {
  const { caseRow } = await openFeeCase({
    booking: row(),
    kind: 'late_cancel',
    baseMinor: 10000,
    currency: 'eur',
    proposedMinor: 10000,
    freeUntilIso: new Date(Date.now() - HOUR).toISOString(),
    evidence: { cancelledMinBeforePickup: 120 },
    actor: ADMIN,
    ...over,
  })
  return caseRow
}

beforeEach(() => {
  vi.clearAllMocks()
  fake = createFakeStripe()
  world.stripe = fake.stripe
  mockSendEmail.mockResolvedValue('sent')
  mockFailure.mockResolvedValue(undefined)
  mockDeactivateLink.mockResolvedValue(undefined)
})

describe('tracer: a late-cancel case with a live hold becomes a partial capture', () => {
  it('captures the decided amount from the hold, closes the case and sends the fee_charged receipt once', async () => {
    const holdId = await seedWithHold()
    const c = await openCase()
    expect(ledger('fee_opened')).toHaveLength(1)
    expect(row().fee_case_status).toBe('pending')

    const result = await runFeeCharge({ booking: row(), caseRow: c, amountMinor: 4000, actor: ADMIN })
    expect(result).toEqual({ outcome: 'ok' })

    // One partial capture with the case-derived key; the rest of the hold is released by Stripe.
    const captures = fake.callsTo('paymentIntents.capture')
    expect(captures).toHaveLength(1)
    expect(captures[0].targetId).toBe(holdId)
    expect(captures[0].params).toEqual({ amount_to_capture: 4000 })
    expect(captures[0].idempotencyKey).toBe(`feecap:${c.id}:0`)
    expect(fake.callsTo('paymentIntents.create').filter((x) => x.idempotencyKey !== undefined && x.params.kind !== 'card_hold')).toHaveLength(0)

    expect(row()).toMatchObject({ payment_state: 'captured', captured_amount_minor: 4000, payment_intent_id: holdId })
    const after = await loadFeeCase(ID)
    expect(after).toMatchObject({ status: 'charged', decided_minor: 4000, decided_by: 'admin-1' })
    expect(after?.decided_at).toBeTruthy()
    expect(row().fee_case_status).toBe('charged')

    // The Phase 88 "charged" mail is not sent in collect mode; the fee receipt is, keyed by the case.
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({
      kind: 'fee_charged',
      variant: 'late_cancel',
      eventKey: `email:fee_charged:${c.id}`,
      feeMinor: 4000,
    })
    expect(ledger('admin_action').some((e) => e.error_code === 'fee_charge')).toBe(true)
    expect(mockFailure).not.toHaveBeenCalled()
  })

  it('a no-show case sends the no_show variant', async () => {
    await seedWithHold({ status: 'no_show' })
    const c = await openCase({ kind: 'no_show' })
    expect(await runFeeCharge({ booking: row(), caseRow: c, amountMinor: 10000, actor: ADMIN })).toEqual({ outcome: 'ok' })
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ kind: 'fee_charged', variant: 'no_show', feeMinor: 10000 })
  })

  it('a fee below the hold is not a shortfall: no difference charge, no second Stripe create', async () => {
    await seedWithHold()
    const c = await openCase()
    await runFeeCharge({ booking: row(), caseRow: c, amountMinor: 2500, actor: ADMIN })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1) // only the hold seeded by the test
    expect(ledger('difference_charged')).toHaveLength(0)
    expect(row().captured_amount_minor).toBe(2500)
  })

  it('a hold smaller than the fee is not partly used: the saved card pays the fee and the hold is released', async () => {
    const holdId = await seedWithHold({}, 3000)
    const c = await openCase()
    expect(await runFeeCharge({ booking: row(), caseRow: c, amountMinor: 5000, actor: ADMIN })).toEqual({ outcome: 'ok' })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    const charges = fake.callsTo('paymentIntents.create').filter((x) => x.params.off_session === true && x.params.capture_method === undefined)
    expect(charges).toHaveLength(1)
    expect(charges[0].idempotencyKey).toBe(`fee:${c.id}:0`)
    expect(charges[0].params).toMatchObject({ amount: 5000, metadata: { kind: 'card_fee' } })
    expect(fake.state.paymentIntents.get(holdId)?.status).toBe('canceled')
    expect(row().captured_amount_minor).toBe(5000)
  })
})

describe('the Phase 88 gates hold for every caller that does not pass opts.collect', () => {
  it('a cancelled card_hold booking is still skipped', async () => {
    await seedWithHold()
    const out = await settleBooking(ID, { type: 'system', id: 'completion_event' })
    expect(out.outcome).toBe('skipped')
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(row().payment_state).toBe('authorized')
  })

  it('a no-show card_hold booking is still skipped', async () => {
    await seedWithHold({ status: 'no_show' })
    expect((await settleBooking(ID, { type: 'system', id: 'tick' })).outcome).toBe('skipped')
  })

  it('a cash_guarantee row is still skipped, completed or not', async () => {
    seed({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', status: 'completed', completed_at: new Date().toISOString() })
    const out = await settleBooking(ID, { type: 'system', id: 'tick' })
    expect(out).toMatchObject({ outcome: 'skipped', code: 'not_card_hold' })
    expect(fake.calls).toHaveLength(0)
  })
})

describe('opts.collect on a row that is settled answers noop and calls no Stripe method', () => {
  it('cash_settled with a fee request', async () => {
    seed({ payment_mode: 'cash_guarantee', payment_state: 'cash_settled' })
    const out = await settleBooking(ID, ADMIN, { collect: { kind: 'fee', caseId: 'c1', amountMinor: 1000 } })
    expect(out).toMatchObject({ outcome: 'noop', code: 'cash_settled' })
    expect(fake.calls).toHaveLength(0)
  })

  it('cash_settled with a cash card request', async () => {
    seed({ payment_mode: 'cash_guarantee', payment_state: 'cash_settled', status: 'completed' })
    const out = await settleBooking(ID, ADMIN, { collect: { kind: 'cash_card' } })
    expect(out).toMatchObject({ outcome: 'noop', code: 'cash_settled' })
    expect(fake.calls).toHaveLength(0)
  })
})

describe('opts.collect is checked against what it may do (T-89-20, Pitfall 15)', () => {
  it('a partner booking is skipped before any other gate', async () => {
    await seedWithHold({ booking_source: 'gnet' })
    const out = await settleBooking(ID, ADMIN, { collect: { kind: 'fee', caseId: 'c1', amountMinor: 1000 } })
    expect(out).toMatchObject({ outcome: 'skipped', code: 'partner_booking' })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })

  it('a fee needs a card_hold or cash_guarantee row', async () => {
    seed({ payment_mode: 'pay_now', payment_state: 'none' })
    expect(await settleBooking(ID, ADMIN, { collect: { kind: 'fee', caseId: 'c1', amountMinor: 1000 } })).toMatchObject({
      outcome: 'skipped',
      code: 'mode_not_allowed',
    })
  })

  it('a fee needs a closed booking', async () => {
    await seedWithHold({ status: 'confirmed' })
    expect(await settleBooking(ID, ADMIN, { collect: { kind: 'fee', caseId: 'c1', amountMinor: 1000 } })).toMatchObject({
      outcome: 'skipped',
      code: 'status_not_allowed',
    })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })

  it('a fee above the row amount, zero or fractional is refused', async () => {
    await seedWithHold()
    for (const amountMinor of [10001, 0, -5, 12.5]) {
      expect(await settleBooking(ID, ADMIN, { collect: { kind: 'fee', caseId: 'c1', amountMinor } })).toMatchObject({
        outcome: 'skipped',
        code: 'invalid_amount',
      })
    }
    expect(row().payment_state).toBe('authorized')
  })

  it('a cash card charge needs a cash_guarantee row on a trip that is not cancelled or no-show', async () => {
    await seedWithHold({ status: 'completed' })
    expect(await settleBooking(ID, ADMIN, { collect: { kind: 'cash_card' } })).toMatchObject({ outcome: 'skipped', code: 'mode_not_allowed' })
    seed({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', status: 'cancelled' })
    expect(await settleBooking(ID, ADMIN, { collect: { kind: 'cash_card' } })).toMatchObject({ outcome: 'skipped', code: 'status_not_allowed' })
    seed({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', status: 'no_show' })
    expect(await settleBooking(ID, ADMIN, { collect: { kind: 'cash_card' } })).toMatchObject({ outcome: 'skipped', code: 'status_not_allowed' })
  })

  it('runFeeCharge and runCashCardCharge never touch a partner booking', async () => {
    await seedWithHold({ booking_source: 'gnet' })
    const c = await openCase().catch(() => null)
    expect(c).toBeNull() // openFeeCase refuses a partner booking
    const fakeCase = { id: 'c1', booking_id: ID, kind: 'late_cancel', status: 'pending', currency: 'eur', base_minor: 10000 } as FeeCaseRow
    expect(await runFeeCharge({ booking: row(), caseRow: fakeCase, amountMinor: 1000, actor: ADMIN })).toEqual({ error: 'action_not_allowed' })
    expect(await runCashCardCharge({ booking: row(), actor: ADMIN })).toEqual({ error: 'action_not_allowed' })
    expect(ledger('admin_action')).toHaveLength(0)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })
})

describe('lockFeeAmount', () => {
  it('the same amount twice is allowed, another amount while a charge is in flight answers amount_locked', async () => {
    seed()
    const c = await openCase()
    expect(await lockFeeAmount(c.id, 4000)).toBe('locked')
    expect(await lockFeeAmount(c.id, 4000)).toBe('locked')
    expect(await lockFeeAmount(c.id, 5000)).toBe('amount_locked')
    const stored = await loadFeeCase(ID)
    expect(stored).toMatchObject({ decided_minor: 4000, status: 'pending' })
    expect(stored?.charge_requested_at).toBeTruthy()
  })

  it('unlocking lets another amount through', async () => {
    seed()
    const c = await openCase()
    await lockFeeAmount(c.id, 4000)
    await unlockFeeAmount(c.id)
    expect(await lockFeeAmount(c.id, 5000)).toBe('locked')
    expect((await loadFeeCase(ID))?.decided_minor).toBe(5000)
  })

  it('a decided case answers action_not_allowed, and so does an amount above the base or below one cent', async () => {
    seed()
    const c = await openCase()
    expect(await lockFeeAmount(c.id, 10001)).toBe('action_not_allowed')
    expect(await lockFeeAmount(c.id, 0)).toBe('action_not_allowed')
    expect(await lockFeeAmount(c.id, 4000)).toBe('locked')
    expect(await markFeeCharged(c.id, { decidedBy: 'admin-1' })).toBe(true)
    expect(await lockFeeAmount(c.id, 4000)).toBe('action_not_allowed')
    expect(await markFeeCharged(c.id, { decidedBy: 'admin-1' })).toBe(false)
  })

  it('reason and contact note land on the case row only, never in the ledger', async () => {
    seed()
    const c = await openCase()
    await lockFeeAmount(c.id, 4000, { reason: 'client called late', contactNote: 'spoke to client at 10:00' })
    expect(await loadFeeCase(ID)).toMatchObject({ reason: 'client called late', contact_note: 'spoke to client at 10:00' })
    expect(JSON.stringify(db.state.booking_payment_events)).not.toContain('client called late')
    expect(JSON.stringify(db.state.booking_payment_events)).not.toContain('spoke to client')
  })

  it('a waive cannot race a charge in flight', async () => {
    seed()
    const c = await openCase()
    await lockFeeAmount(c.id, 4000)
    expect(await markFeeWaived(c.id, { decidedBy: 'admin-1' })).toBe(false)
    await unlockFeeAmount(c.id)
    expect(await markFeeWaived(c.id, { decidedBy: 'admin-1', reason: 'goodwill' })).toBe(true)
    expect(row().fee_case_status).toBe('waived')
  })
})

describe('openFeeCase, isFeeEligible, feeBaseFor', () => {
  it('opens the case once per booking and appends fee_opened once', async () => {
    seed()
    const first = await openFeeCase({
      booking: row(),
      kind: 'no_show',
      baseMinor: 10000,
      currency: 'eur',
      proposedMinor: 10000,
      actor: ADMIN,
    })
    const second = await openFeeCase({
      booking: row(),
      kind: 'no_show',
      baseMinor: 10000,
      currency: 'eur',
      proposedMinor: 10000,
      actor: ADMIN,
    })
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.caseRow.id).toBe(first.caseRow.id)
    expect(db.state.booking_fee_cases).toHaveLength(1)
    expect(ledger('fee_opened')).toHaveLength(1)
    expect(ledger('fee_opened')[0].event_key).toBe(`fee_opened:${first.caseRow.id}`)
  })

  it('refuses amounts the table would reject', async () => {
    seed()
    await expect(
      openFeeCase({ booking: row(), kind: 'late_cancel', baseMinor: 10000, currency: 'eur', proposedMinor: 10001, actor: ADMIN }),
    ).rejects.toThrow()
  })

  it('isFeeEligible: card on file or live hold, money collected, never partner', () => {
    expect(isFeeEligible({ payment_mode: 'card_hold', payment_state: 'authorized', hold_payment_intent_id: 'pi_1' })).toBe(true)
    expect(isFeeEligible({ payment_mode: 'card_hold', payment_state: 'card_saved', stripe_payment_method_id: 'pm_1' })).toBe(true)
    expect(isFeeEligible({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', stripe_payment_method_id: 'pm_1' })).toBe(true)
    expect(isFeeEligible({ payment_mode: 'card_hold', payment_state: 'captured' })).toBe(true)
    expect(isFeeEligible({ payment_mode: 'pay_now', payment_intent_id: 'pi_2' })).toBe(true)
    expect(isFeeEligible({ payment_mode: 'pay_now', payment_intent_id: null })).toBe(false)
    expect(isFeeEligible({ payment_mode: 'card_hold', payment_state: 'checkout_pending', stripe_payment_method_id: 'pm_1' })).toBe(false)
    expect(isFeeEligible({ payment_mode: 'card_hold', payment_state: 'released', stripe_payment_method_id: 'pm_1' })).toBe(false)
    expect(isFeeEligible({ payment_mode: 'cash_guarantee', payment_state: 'cash_settled', stripe_payment_method_id: 'pm_1' })).toBe(false)
    expect(isFeeEligible({ payment_mode: 'card_hold', payment_state: 'authorized', hold_payment_intent_id: 'pi_1', booking_source: 'gnet' })).toBe(false)
    expect(isFeeEligible({ payment_mode: 'quote' })).toBe(false)
  })

  it('feeBaseFor: card and cash rows use the row amount, pay-now the leg or the booking in EUR cents', () => {
    expect(feeBaseFor({ payment_mode: 'card_hold', payment_amount_minor: 12000, payment_currency: 'czk' })).toEqual({ baseMinor: 12000, currency: 'czk' })
    expect(feeBaseFor({ payment_mode: 'cash_guarantee', payment_amount_minor: 9000, payment_currency: 'eur' })).toEqual({ baseMinor: 9000, currency: 'eur' })
    expect(feeBaseFor({ payment_mode: 'card_hold', payment_amount_minor: null, payment_currency: 'eur' })).toBeNull()
    expect(feeBaseFor({ payment_mode: 'pay_now', amount_eur: 80.5 })).toEqual({ baseMinor: 8050, currency: 'eur' })
    expect(feeBaseFor({ payment_mode: 'pay_now', amount_eur: 160, outbound_amount_czk: 2000, return_amount_czk: 2500 }, 'outbound')).toEqual({
      baseMinor: 8000,
      currency: 'eur',
    })
    expect(feeBaseFor({ payment_mode: 'pay_now', amount_eur: 160, outbound_amount_czk: 2000, return_amount_czk: 2500 }, 'return')).toEqual({
      baseMinor: 10000,
      currency: 'eur',
    })
    expect(feeBaseFor({ payment_mode: 'pay_now', amount_eur: 160, outbound_amount_czk: 2000 }, 'return')).toBeNull()
    expect(feeBaseFor({ payment_mode: 'pay_now' })).toBeNull()
  })
})
