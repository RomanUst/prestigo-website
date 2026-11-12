// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { eurToCzk } from '@/lib/currency'
import { LEASE_SECONDS } from '@/lib/payments/config'

/**
 * Phase 91 plan 91-08 (EXTRA-01; D-10, D-12, D-13, D-15, D-16): the extra-charge engine, run for real against the in-memory
 * payments database and the fake Stripe. The HTTP layer is covered in tests/admin-extra-route.test.ts.
 */

const { world, mockSendEmail, mockWaitingRate, mockAlert } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
  },
  mockSendEmail: vi.fn(),
  mockWaitingRate: { value: {} as Record<string, number> },
  mockAlert: vi.fn(),
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
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: mockAlert }))
vi.mock('@/lib/payments/emails/send', () => ({ sendPaymentEmail: mockSendEmail, bookingEmailDataFromRow: (r: unknown) => r }))
vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: async () => ({ waitingRate: mockWaitingRate.value }),
}))

import {
  finalizeExtraFromWebhook,
  isExtraChargeEligible,
  previewWaitingExtra,
  resumeExtraCharge,
  runExtraCharge,
  type ExtraChargeResult,
  type ExtraRequest,
} from '@/lib/payments/extra'

const ID = '77777777-7777-4777-8777-777777777777'
const ADMIN = { type: 'admin', id: 'admin-1' } as const

let db: FakePaymentsDb
let fake: FakeStripe

function booking(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID,
    status: 'completed',
    booking_source: 'online',
    payment_mode: 'card_hold',
    payment_state: 'captured',
    booking_reference: 'PRG-20261101-EXTR02',
    client_email: 'anna@example.com',
    locale: 'en',
    vehicle_class: 'business',
    payment_currency: 'eur',
    payment_amount_minor: 10000,
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_ok',
    ...over,
  }
}

function seed(over: Record<string, unknown> = {}, consentVersion: string | null = '2026-11-3') {
  db = createFakePaymentsDb({ bookings: [booking(over)] })
  if (consentVersion) {
    db.state.booking_payment_consents.push({
      id: 'consent-1',
      booking_id: ID,
      text_version: consentVersion,
      accepted_at: new Date(Date.now() - 86_400_000).toISOString(),
    })
  }
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))
const charges = () => db.state.booking_extra_charges.filter((c) => c.booking_id === ID)

const other = (amountMinor = 1500, description = 'Airport parking'): ExtraRequest => ({ kind: 'other', description, amountMinor })
const run = (request: ExtraRequest) => runExtraCharge({ booking: row(), request, actor: ADMIN })
const waiting = (minutes: number, expectedAmountMinor: number): ExtraRequest => ({ kind: 'waiting', minutes, expectedAmountMinor })

beforeEach(() => {
  vi.clearAllMocks()
  fake = createFakeStripe()
  world.stripe = fake.stripe
  mockSendEmail.mockResolvedValue('sent')
  mockAlert.mockResolvedValue('sent')
  mockWaitingRate.value = { business: 12.5, business_van: 20 }
  seed()
})

describe('isExtraChargeEligible (D-15, D-12)', () => {
  const ctx = { consentVersion: '2026-11-3', inFlight: null }
  const reason = (b: Record<string, unknown>, c: Parameters<typeof isExtraChargeEligible>[1] = ctx) => {
    const r = isExtraChargeEligible(b, c)
    return r.ok ? 'ok' : r.reason
  }

  it('a completed captured card_hold booking with the extras consent is eligible', () => {
    expect(reason(booking())).toBe('ok')
  })

  it('gnet (partner) bookings are refused: partner', () => {
    expect(reason(booking({ booking_source: 'gnet' }))).toBe('partner')
  })

  it('a booking that is not completed is refused: not_completed', () => {
    for (const status of ['confirmed', 'assigned', 'en_route', 'cancelled', 'no_show']) {
      expect(reason(booking({ status }))).toBe('not_completed')
    }
  })

  it('pay-now and a card_hold that was not captured are refused: payment_mode', () => {
    expect(reason(booking({ payment_mode: 'pay_now', payment_state: 'none' }))).toBe('payment_mode')
    expect(reason(booking({ payment_mode: 'card_hold', payment_state: 'authorized' }))).toBe('payment_mode')
    expect(reason(booking({ payment_mode: 'quote' }))).toBe('payment_mode')
    expect(reason(booking({ payment_mode: 'cash_guarantee', payment_state: 'released' }))).toBe('payment_mode')
  })

  it('cash_guarantee needs a saved card: no_saved_card', () => {
    expect(reason(booking({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', stripe_payment_method_id: null }))).toBe(
      'no_saved_card',
    )
    expect(reason(booking({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', stripe_customer_id: '' }))).toBe('no_saved_card')
  })

  it('cash_guarantee with a saved card is eligible in card_saved, cash_settled, captured and failed', () => {
    for (const payment_state of ['card_saved', 'cash_settled', 'captured', 'failed']) {
      expect(reason(booking({ payment_mode: 'cash_guarantee', payment_state }))).toBe('ok')
    }
  })

  it('a consent older than the extras sentence, or none, is refused: consent_not_covered', () => {
    expect(reason(booking(), { consentVersion: '2026-11-2', inFlight: null })).toBe('consent_not_covered')
    expect(reason(booking(), { consentVersion: null, inFlight: null })).toBe('consent_not_covered')
  })

  it('WR-05: an erased (anonymised) booking is never eligible: erased', () => {
    const erased = '2026-11-10T10:00:00.000Z'
    expect(reason(booking({ anonymised_at: erased }))).toBe('erased')
    expect(reason(booking({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', anonymised_at: erased }))).toBe('erased')
    expect(reason(booking({ anonymised_at: null }))).toBe('ok')
  })

  it('a charging row blocks another extra: in_flight', () => {
    const inFlight = { id: 'c1' } as never
    expect(reason(booking(), { consentVersion: '2026-11-3', inFlight })).toBe('in_flight')
  })
})

describe('refusals: nothing is written, nothing is charged', () => {
  it('gnet: runExtraCharge answers 422 action_not_allowed', async () => {
    seed({ booking_source: 'gnet' })
    expect(await run(other())).toEqual({ status: 422, error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('consent_not_covered: an old consent version is refused', async () => {
    seed({}, '2026-11-2')
    expect(await run(other())).toEqual({ status: 422, error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('no consent row at all is refused', async () => {
    seed({}, null)
    expect(await run(other())).toEqual({ status: 422, error: 'action_not_allowed' })
  })

  it('the latest consent decides, not an older one', async () => {
    seed({}, '2026-11-3')
    db.state.booking_payment_consents.push({
      id: 'consent-2',
      booking_id: ID,
      text_version: '2026-11-2',
      accepted_at: new Date().toISOString(),
    })
    expect(await run(other())).toEqual({ status: 422, error: 'action_not_allowed' })
  })

  it('a booking without a payment currency is refused (the currency always comes from the row)', async () => {
    seed({ payment_currency: null })
    expect(await run(other())).toEqual({ status: 422, error: 'action_not_allowed' })
  })
})

describe('WR-05: the engine decides on the booking as it is now, not on the row the caller loaded', () => {
  it('a booking cancelled after the route loaded it: refused, nothing written, no Stripe call', async () => {
    const stale = { ...row() }
    row().status = 'cancelled'
    expect(await runExtraCharge({ booking: stale, request: other(), actor: ADMIN })).toEqual({ status: 422, error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('a booking erased after the route loaded it: refused', async () => {
    const stale = { ...row() }
    row().anonymised_at = '2026-11-12T08:00:00.000Z'
    expect(await runExtraCharge({ booking: stale, request: waiting(45, 3800), actor: ADMIN })).toEqual({ status: 422, error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('a payment mode or state that changed meanwhile is refused too', async () => {
    const stale = { ...row() }
    row().payment_state = 'refunded'
    expect(await runExtraCharge({ booking: stale, request: other(), actor: ADMIN })).toEqual({ status: 422, error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('the saved card is the one stored NOW: a replaced payment method is used, the stale one is not', async () => {
    const stale = { ...row(), stripe_payment_method_id: 'pm_decline_insufficient' }
    const res = await runExtraCharge({ booking: stale, request: other(), actor: ADMIN })
    expect(res).toMatchObject({ outcome: 'charged' })
    expect(fake.callsTo('paymentIntents.create')[0].params.payment_method).toBe('pm_ok')
  })

  it('a booking row that no longer exists is refused', async () => {
    const stale = { ...row() }
    db.state.bookings.length = 0
    expect(await runExtraCharge({ booking: stale, request: other(), actor: ADMIN })).toEqual({ status: 422, error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('resume re-reads the booking as well: an erased booking cannot be resumed', async () => {
    fake.failNextWith('paymentIntents.create', 'connection')
    await run(other())
    const chargeId = charges()[0].id as string
    charges()[0].updated_at = new Date(Date.now() - (LEASE_SECONDS + 60) * 1000).toISOString()
    const stale = { ...row() }
    row().anonymised_at = '2026-11-12T08:00:00.000Z'
    expect(await resumeExtraCharge({ booking: stale, chargeId, actor: ADMIN })).toEqual({ status: 422, error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.list')).toHaveLength(0)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })

  it('the preview refuses an erased booking', async () => {
    expect(await previewWaitingExtra({ ...row(), anonymised_at: '2026-11-12T08:00:00.000Z' }, 30)).toEqual({ ok: false, error: 'action_not_allowed' })
  })
})

describe('D-13: the amount of an other extra', () => {
  it('amount 1 and 99 999 999 are charged as typed, never re-rounded', async () => {
    for (const amount of [1, 99_999_999]) {
      seed()
      const res = await run(other(amount))
      expect(res).toMatchObject({ status: 200, outcome: 'charged', amountMinor: amount })
      expect(fake.callsTo('paymentIntents.create').at(-1)?.params.amount).toBe(amount)
    }
  })

  it('0, negative, fractional and above Stripe ceiling are refused by the engine as well', async () => {
    for (const amount of [0, -100, 12.5, 100_000_000, Number.NaN]) {
      expect(await run(other(amount))).toEqual({ status: 422, error: 'action_not_allowed' })
    }
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('a description of 2 or 201 characters is refused by the engine as well', async () => {
    expect(await run(other(500, 'ab'))).toEqual({ status: 422, error: 'action_not_allowed' })
    expect(await run(other(500, 'x'.repeat(201)))).toEqual({ status: 422, error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('a large amount has no business cap: 5 000 000 minor on a 10 000 booking is charged', async () => {
    expect(await run(other(5_000_000))).toMatchObject({ status: 200, outcome: 'charged', amountMinor: 5_000_000 })
  })
})

describe('D-16: waiting extra amount', () => {
  it('rate 12.5, 45 minutes: 3 blocks = 37.5 -> 38 EUR -> 3800 minor; row keeps minutes, blocks and the rate snapshot', async () => {
    const res = await run(waiting(45, 3800))
    expect(res).toMatchObject({ status: 200, outcome: 'charged', amountMinor: 3800, currency: 'eur' })
    expect(charges()[0]).toMatchObject({ kind: 'waiting', minutes: 45, blocks: 3, rate_per_block_eur: 12.5, amount_minor: 3800, description: null })
    expect(fake.callsTo('paymentIntents.create')[0].params.amount).toBe(3800)
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ kind: 'extra_charged', variant: 'waiting', feeMinor: 3800, extraMinutes: 45 })
    expect(mockSendEmail.mock.calls[0][0]).not.toHaveProperty('extraItem')
  })

  it('a CZK booking is converted from the rounded EUR amount: eurToCzk(38) x 100', async () => {
    seed({ payment_currency: 'czk' })
    const expected = eurToCzk(38) * 100
    const res = await run(waiting(45, expected))
    expect(res).toMatchObject({ status: 200, outcome: 'charged', amountMinor: expected, currency: 'czk' })
    expect(fake.callsTo('paymentIntents.create')[0].params).toMatchObject({ amount: expected, currency: 'czk' })
  })

  it('block boundaries: 1 -> 1, 15 -> 1, 16 -> 2, 480 -> 32', async () => {
    mockWaitingRate.value = { business: 10 }
    const cases: Array<[number, number]> = [
      [1, 1],
      [15, 1],
      [16, 2],
      [480, 32],
    ]
    for (const [minutes, blocks] of cases) {
      const p = await previewWaitingExtra(row(), minutes)
      expect(p).toMatchObject({ ok: true, blocks, amountMinor: blocks * 1000, currency: 'eur', ratePerBlockEur: 10 })
    }
  })

  it('minutes outside 1..480 are refused by the preview', async () => {
    for (const minutes of [0, 481, -5, 1.5, Number.NaN]) {
      expect(await previewWaitingExtra(row(), minutes)).toEqual({ ok: false, error: 'action_not_allowed' })
    }
  })

  it('a class without a rate answers waiting_rate_missing and nothing is written', async () => {
    seed({ vehicle_class: 'first_class' })
    expect(await previewWaitingExtra(row(), 30)).toEqual({ ok: false, error: 'waiting_rate_missing' })
    expect(await run(waiting(30, 2500))).toEqual({ status: 422, error: 'waiting_rate_missing' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('a rate that rounds to nothing is no rate: waiting_rate_missing', async () => {
    mockWaitingRate.value = { business: 0.2 }
    expect(await previewWaitingExtra(row(), 15)).toEqual({ ok: false, error: 'waiting_rate_missing' })
  })

  it('amount_changed: a stated amount that differs from the server answers 409 with the server amount, no write, no Stripe call', async () => {
    const res: ExtraChargeResult = await run(waiting(45, 3700))
    expect(res).toEqual({ status: 409, error: 'amount_changed', amountMinor: 3800 })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('the rate changing between the preview and the click is caught by the stated amount', async () => {
    mockWaitingRate.value = { business: 15 }
    expect(await run(waiting(45, 3800))).toEqual({ status: 409, error: 'amount_changed', amountMinor: 4500 })
  })
})

describe('decline: final for the row, no email, no retry', () => {
  it('declined: a card_declined answers declined with the decline code; row failed; extra_failed in the ledger', async () => {
    seed({ stripe_payment_method_id: 'pm_decline_insufficient' })
    const res = await run(other())
    expect(res).toMatchObject({ status: 200, outcome: 'declined', code: 'insufficient_funds' })
    const chargeId = (res as { chargeId: string }).chargeId
    expect(charges()[0]).toMatchObject({ id: chargeId, status: 'failed', last_error_code: 'insufficient_funds' })
    expect(ledger().map((e) => e.kind)).toEqual(['admin_action', 'extra_failed'])
    expect(ledger('extra_failed')[0]).toMatchObject({
      event_key: `extra_failed:${chargeId}:1`,
      error_code: 'insufficient_funds',
      amount_minor: 1500,
      currency: 'eur',
    })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
    // The booking's own payment is untouched.
    expect(row().payment_state).toBe('captured')
  })

  it('requires_action is declined with authentication_required, and its PaymentIntent is cancelled so it cannot succeed later', async () => {
    seed({ stripe_payment_method_id: 'pm_auth_required' })
    expect(await run(other())).toMatchObject({ status: 200, outcome: 'declined', code: 'authentication_required' })
    expect(charges()[0]).toMatchObject({ status: 'failed', last_error_code: 'authentication_required' })
    const cancels = fake.callsTo('paymentIntents.cancel')
    expect(cancels).toHaveLength(1)
    expect(cancels[0].idempotencyKey).toBe(`extra_void:${charges()[0].id}:1`)
    expect(fake.state.paymentIntents.get(cancels[0].targetId!)?.status).toBe('canceled')
  })

  it('a plain card decline leaves a dead PaymentIntent: nothing to cancel', async () => {
    seed({ stripe_payment_method_id: 'pm_decline_insufficient' })
    await run(other())
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
  })

  it('after a decline the operator may start a NEW charge (new row, new key); nothing was retried automatically', async () => {
    seed({ stripe_payment_method_id: 'pm_decline_insufficient' })
    const first = (await run(other())) as { chargeId: string }
    row().stripe_payment_method_id = 'pm_ok'
    const second = (await run(other())) as { chargeId: string; outcome: string }
    expect(second.outcome).toBe('charged')
    expect(second.chargeId).not.toBe(first.chargeId)
    expect(fake.callsTo('paymentIntents.create').map((c) => c.idempotencyKey)).toEqual([
      `extra:${first.chargeId}:1`,
      `extra:${second.chargeId}:1`,
    ])
  })
})

describe('CR-01: a PaymentIntent that answers without succeeding is never called a decline while it is alive', () => {
  it('a confirm that answers processing: the PaymentIntent is cancelled first, then the row is declined (unexpected_status)', async () => {
    fake.forceNextCreateStatus('processing')
    const res = await run(other())
    expect(res).toMatchObject({ status: 200, outcome: 'declined', code: 'unexpected_status' })
    const cancels = fake.callsTo('paymentIntents.cancel')
    expect(cancels).toHaveLength(1)
    expect(fake.state.paymentIntents.get(cancels[0].targetId!)?.status).toBe('canceled')
    expect(charges()[0].status).toBe('failed')
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('if the cancel fails and the PaymentIntent is still alive: no "declined", the row stays charging (blocks a new charge) and the operator is alerted', async () => {
    fake.forceNextCreateStatus('processing')
    fake.failNextWith('paymentIntents.cancel', 'connection')
    const res = await run(other())
    expect(res).toMatchObject({ status: 200, outcome: 'unconfirmed' })
    expect(res).not.toHaveProperty('code')
    expect(charges()[0].status).toBe('charging')
    expect(ledger('extra_failed')).toHaveLength(0)
    expect(ledger('extra_charged')).toHaveLength(0)
    expect(mockAlert).toHaveBeenCalledTimes(1)
    expect(mockAlert.mock.calls[0][0]).toBe('ops_attention')
    expect(mockAlert.mock.calls[0][2]).toMatchObject({ eventKey: `alert:extra_unresolved:${charges()[0].id}`, note: 'extra_unresolved', amountMinor: 1500 })
    // The description never reaches the alert.
    expect(JSON.stringify(mockAlert.mock.calls)).not.toContain('Airport parking')
    // A new charge is blocked while the row is charging.
    expect(await run(other(900, 'Another thing'))).toEqual({ status: 409, error: 'payment_busy' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })

  it('if the cancel fails because the PaymentIntent succeeded meanwhile: it is recorded as charged, not as a decline', async () => {
    fake.forceNextCreateStatus('processing')
    const original = fake.stripe.paymentIntents.cancel
    fake.stripe.paymentIntents.cancel = async (id: string, ...rest: [Record<string, unknown>?, { idempotencyKey?: string }?]) => {
      fake.setPaymentIntentStatus(id, 'succeeded')
      return original(id, ...rest)
    }
    const res = await run(other())
    expect(res).toMatchObject({ status: 200, outcome: 'charged', amountMinor: 1500 })
    expect(charges()[0].status).toBe('charged')
    expect(ledger('extra_charged')).toHaveLength(1)
    expect(ledger('extra_failed')).toHaveLength(0)
  })

  it('the modal never says "nothing was charged" for an unconfirmed outcome (source)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/admin/ExtraChargeModal.tsx'), 'utf8')
    const line = src.split('\n').find((l) => l.includes("outcome === 'unconfirmed'"))
    expect(line).toBeDefined()
    expect(line).toContain('COPY_UNCONFIRMED')
    const copy = /const COPY_UNCONFIRMED =\s*'([^']+)'/.exec(src)?.[1] ?? ''
    expect(copy).toMatch(/not confirmed/i)
    expect(copy).not.toMatch(/nothing was charged/i)
  })
})

describe('WR-01: a receipt that is not sent after a successful charge is never silent', () => {
  it('sendPaymentEmail answering failed: the charge stays charged, the operator is alerted once (ids only), nothing is re-charged', async () => {
    mockSendEmail.mockResolvedValue('failed')
    const res = await run(other(1500, 'Confidential errand'))
    expect(res).toMatchObject({ status: 200, outcome: 'charged' })
    expect(charges()[0].status).toBe('charged')
    expect(mockAlert).toHaveBeenCalledTimes(1)
    expect(mockAlert.mock.calls[0][0]).toBe('ops_attention')
    expect(mockAlert.mock.calls[0][2]).toEqual({
      eventKey: `alert:extra_receipt:${charges()[0].id}`,
      code: 'extra_receipt_failed',
      amountMinor: 1500,
      note: 'extra_receipt_failed',
    })
    expect(JSON.stringify(mockAlert.mock.calls)).not.toContain('Confidential')
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })

  it('sendPaymentEmail throwing is handled the same way', async () => {
    mockSendEmail.mockRejectedValue(new Error('resend down'))
    expect(await run(other())).toMatchObject({ status: 200, outcome: 'charged' })
    expect(mockAlert).toHaveBeenCalledTimes(1)
    expect(mockAlert.mock.calls[0][2]).toMatchObject({ note: 'extra_receipt_failed' })
  })

  it('a sent receipt raises no alert', async () => {
    await run(other())
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('the webhook cannot finalise on a booking row it cannot read: it throws so Stripe redelivers, nothing is written', async () => {
    db.state.booking_extra_charges.push({
      id: '55555555-5555-4555-8555-555555555555',
      booking_id: 'ghost-booking',
      kind: 'other',
      status: 'charging',
      currency: 'eur',
      amount_minor: 1500,
      description: 'x',
      attempt: 1,
      requested_at: new Date().toISOString(),
    })
    const pi = { id: 'pi_g', metadata: { extraChargeId: '55555555-5555-4555-8555-555555555555' }, amount: 1500 } as never
    await expect(finalizeExtraFromWebhook('ghost-booking', pi, 'succeeded')).rejects.toThrow('extra booking missing')
    expect(db.state.booking_payment_events).toHaveLength(0)
    expect(db.state.booking_extra_charges[0].status).toBe('charging')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe('transient answers, payment_busy and resume', () => {
  async function transient(): Promise<string> {
    fake.failNextWith('paymentIntents.create', 'connection')
    const res = await run(other())
    expect(res).toEqual({ status: 409, error: 'payment_busy' })
    expect(charges()).toHaveLength(1)
    return charges()[0].id as string
  }

  it('a transient Stripe error keeps the row charging and writes no extra_failed', async () => {
    await transient()
    expect(charges()[0].status).toBe('charging')
    expect(ledger('extra_failed')).toHaveLength(0)
    expect(ledger('extra_charged')).toHaveLength(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('payment_busy: a new request while a row is charging is refused with no second Stripe call', async () => {
    await transient()
    expect(await run(other(900, 'Another thing'))).toEqual({ status: 409, error: 'payment_busy' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
    expect(charges()).toHaveLength(1)
  })

  it('resume before the lease is refused with payment_busy and no Stripe call', async () => {
    const chargeId = await transient()
    expect(await resumeExtraCharge({ booking: row(), chargeId, actor: ADMIN })).toEqual({ status: 409, error: 'payment_busy' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })

  it('resume after the lease replays the same key and the same amount, then charges', async () => {
    const chargeId = await transient()
    charges()[0].updated_at = new Date(Date.now() - (LEASE_SECONDS + 60) * 1000).toISOString()

    const res = await resumeExtraCharge({ booking: row(), chargeId, actor: ADMIN })
    expect(res).toMatchObject({ status: 200, outcome: 'charged', chargeId, amountMinor: 1500 })

    const creates = fake.callsTo('paymentIntents.create')
    expect(creates).toHaveLength(2)
    expect(creates[1].idempotencyKey).toBe(creates[0].idempotencyKey)
    expect(creates[1].idempotencyKey).toBe(`extra:${chargeId}:1`)
    expect(creates[1].params.amount).toBe(creates[0].params.amount)
    expect(charges()[0].status).toBe('charged')
    expect(ledger('extra_charged')).toHaveLength(1)
    expect(ledger('admin_action').map((e) => e.error_code)).toEqual(['extra_charge', 'extra_resume'])
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('resume of a row that is not charging, or of another booking, is refused', async () => {
    const first = (await run(other())) as { chargeId: string }
    expect(await resumeExtraCharge({ booking: row(), chargeId: first.chargeId, actor: ADMIN })).toEqual({
      status: 422,
      error: 'action_not_allowed',
    })
    expect(
      await resumeExtraCharge({ booking: row(), chargeId: '00000000-0000-4000-8000-0000000000ff', actor: ADMIN }),
    ).toEqual({ status: 422, error: 'action_not_allowed' })
  })

  it('two concurrent requests make exactly one Stripe create; the other answers payment_busy', async () => {
    const [a, b] = await Promise.all([run(other()), run(other())])
    expect([a, b].filter((r) => 'outcome' in r && r.outcome === 'charged')).toHaveLength(1)
    expect([a, b].filter((r) => 'error' in r && r.error === 'payment_busy')).toHaveLength(1)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
    expect(charges()).toHaveLength(1)
  })

  it('a config error (broken key) also keeps the row charging and never blames the client', async () => {
    const { FakeStripeError } = await import('./helpers/fake-stripe')
    fake.failNextWithError('paymentIntents.create', new FakeStripeError('StripeAuthenticationError', 'Invalid API Key', { statusCode: 401 }))
    expect(await run(other())).toEqual({ status: 409, error: 'payment_busy' })
    expect(charges()[0].status).toBe('charging')
    expect(ledger('extra_failed')).toHaveLength(0)
  })
})

describe('WR-02: resume reads Stripe before it can create anything', () => {
  const EXPIRED = () => new Date(Date.now() - (LEASE_SECONDS + 60) * 1000).toISOString()

  /** A row left charging by a lost answer, with the lease passed. */
  async function stuck(): Promise<string> {
    fake.failNextWith('paymentIntents.create', 'connection')
    expect(await run(other())).toEqual({ status: 409, error: 'payment_busy' })
    charges()[0].updated_at = EXPIRED()
    return charges()[0].id as string
  }

  /** Stripe's side of that row: a PaymentIntent that exists although our answer was lost (the original call went through). */
  async function stripeHas(chargeId: string, status?: string): Promise<string> {
    const pi = (await fake.stripe.paymentIntents.create(
      {
        amount: 1500,
        currency: 'eur',
        customer: 'cus_1',
        payment_method: 'pm_ok',
        confirm: true,
        metadata: { kind: 'card_extra', cofBookingId: ID, extraChargeId: chargeId, attempt: '1' },
      },
      { idempotencyKey: `manual-${chargeId}` },
    )) as { id: string }
    if (status) fake.setPaymentIntentStatus(pi.id, status)
    return pi.id
  }
  const createsAfter = (n: number) => fake.callsTo('paymentIntents.create').length - n

  it('the original call had succeeded and its webhook was missed: the row is finalised as charged, NOTHING new is created', async () => {
    const chargeId = await stuck()
    const piId = await stripeHas(chargeId)
    const before = fake.callsTo('paymentIntents.create').length
    const res = await resumeExtraCharge({ booking: row(), chargeId, actor: ADMIN })
    expect(res).toMatchObject({ status: 200, outcome: 'charged', chargeId, amountMinor: 1500 })
    expect(createsAfter(before)).toBe(0)
    expect(charges()[0]).toMatchObject({ status: 'charged', stripe_payment_intent_id: piId })
    expect(ledger('extra_charged')).toHaveLength(1)
    expect(ledger('extra_charged')[0].stripe_object_id).toBe(piId)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('a cancelled or unpaid PaymentIntent ends the row failed, with no new PaymentIntent', async () => {
    for (const status of ['canceled', 'requires_payment_method']) {
      seed()
      const chargeId = await stuck()
      await stripeHas(chargeId, status)
      const before = fake.callsTo('paymentIntents.create').length
      const res = await resumeExtraCharge({ booking: row(), chargeId, actor: ADMIN })
      expect(res).toMatchObject({ status: 200, outcome: 'declined', chargeId })
      expect(createsAfter(before)).toBe(0)
      expect(charges()[0].status).toBe('failed')
      expect(ledger('extra_failed')).toHaveLength(1)
      expect(mockSendEmail).not.toHaveBeenCalled()
    }
  })

  it('a PaymentIntent still processing answers busy: the row stays charging and nothing is created', async () => {
    const chargeId = await stuck()
    await stripeHas(chargeId, 'processing')
    const before = fake.callsTo('paymentIntents.create').length
    expect(await resumeExtraCharge({ booking: row(), chargeId, actor: ADMIN })).toEqual({ status: 409, error: 'payment_busy' })
    expect(createsAfter(before)).toBe(0)
    expect(charges()[0].status).toBe('charging')
  })

  it('a live requires_action PaymentIntent is cancelled, then the row is failed', async () => {
    const chargeId = await stuck()
    const piId = await stripeHas(chargeId, 'requires_action')
    expect(await resumeExtraCharge({ booking: row(), chargeId, actor: ADMIN })).toMatchObject({ outcome: 'declined' })
    expect(fake.state.paymentIntents.get(piId)?.status).toBe('canceled')
    expect(charges()[0].status).toBe('failed')
  })

  it('Stripe cannot be read: busy, the row stays charging, nothing is created', async () => {
    const chargeId = await stuck()
    const before = fake.callsTo('paymentIntents.create').length
    fake.failNextWith('paymentIntents.list', 'connection')
    expect(await resumeExtraCharge({ booking: row(), chargeId, actor: ADMIN })).toEqual({ status: 409, error: 'payment_busy' })
    expect(createsAfter(before)).toBe(0)
    expect(charges()[0].status).toBe('charging')
  })

  it('PaymentIntents of other extras on the same card are not mistaken for this row', async () => {
    const chargeId = await stuck()
    await stripeHas('99999999-9999-4999-8999-999999999999')
    const before = fake.callsTo('paymentIntents.create').length
    // Stripe shows none for THIS row: the create is replayed with the row's own key.
    expect(await resumeExtraCharge({ booking: row(), chargeId, actor: ADMIN })).toMatchObject({ outcome: 'charged' })
    expect(createsAfter(before)).toBe(1)
    expect(fake.callsTo('paymentIntents.create').at(-1)?.idempotencyKey).toBe(`extra:${chargeId}:1`)
  })

  it('the way out of a stuck row: a key conflict after Stripe confirmed no PaymentIntent ends the row failed (never charged), no automatic retry', async () => {
    const { FakeStripeError } = await import('./helpers/fake-stripe')
    const chargeId = await stuck()
    fake.failNextWithError(
      'paymentIntents.create',
      new FakeStripeError('StripeIdempotencyError', 'Keys for idempotent requests can only be used with the same parameters', {
        code: 'idempotency_key_in_use',
        statusCode: 400,
      }),
    )
    const res = await resumeExtraCharge({ booking: row(), chargeId, actor: ADMIN })
    expect(res).toMatchObject({ status: 200, outcome: 'declined', code: 'idempotency_conflict' })
    expect(charges()[0]).toMatchObject({ status: 'failed', last_error_code: 'idempotency_conflict' })
    // the booking is free again: a new extra is a new row with a new key
    expect(await run(other(900, 'Another thing'))).toMatchObject({ outcome: 'charged' })
  })

  it('a key conflict on the FIRST click (not a resume) is not turned into a decline', async () => {
    const { FakeStripeError } = await import('./helpers/fake-stripe')
    fake.failNextWithError('paymentIntents.create', new FakeStripeError('StripeIdempotencyError', 'conflict', { statusCode: 400 }))
    expect(await run(other())).toEqual({ status: 409, error: 'payment_busy' })
    expect(charges()[0].status).toBe('charging')
  })
})

describe('the booking itself and the privacy of the description', () => {
  it('an extra never touches payment_intent_id, payment_state or status of the booking', async () => {
    seed({ payment_intent_id: 'pi_original', hold_payment_intent_id: 'pi_hold', captured_amount_minor: 10000 })
    const before = { ...row() }
    await run(other())
    expect(row()).toEqual(before)
  })

  it('the key never contains the amount', async () => {
    await run(other(123456))
    const key = String(fake.callsTo('paymentIntents.create')[0].idempotencyKey)
    expect(key).toMatch(/^extra:[0-9a-f-]{36}:1$/)
    expect(key).not.toContain('123456')
  })

  it('no ledger row, log line or error message contains the description text', async () => {
    const spies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')]
    const text = 'Confidential errand for Mr Smith'
    await run(other(700, text))
    seed({ stripe_payment_method_id: 'pm_decline_insufficient' })
    await run(other(700, text))
    fake.failNextWith('paymentIntents.create', 'connection')
    seed()
    await run(other(700, text))
    expect(JSON.stringify(db.state.booking_payment_events)).not.toContain('Confidential')
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain('Confidential')
    spies.forEach((s) => s.mockRestore())
  })

  it('source: the engine never calls settleBooking and never names payment_state or the payment RPCs', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/payments/extra.ts'), 'utf8')
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    expect(code).not.toMatch(/settleBooking\(/)
    expect(code).not.toMatch(/payment_state\s*:/)
    expect(code).not.toMatch(/apply_payment_transition|claim_due_payment_work/)
    // bookings.payment_intent_id (not the extra row's own stripe_payment_intent_id) is never written.
    expect(code).not.toMatch(/(?<![a-z_])payment_intent_id\s*:/)
  })
})
