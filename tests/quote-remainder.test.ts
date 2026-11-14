// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, FakeStripeError, type FakeStripe } from './helpers/fake-stripe'
import { seedPublicQuote, type PublicQuoteFixture } from './helpers/quote-public-fixture'
import { stripeKeys } from '@/lib/payments/stripe'

/**
 * Phase 92 plan 92-23 (QUOTE-04; D-16, D-22; T-92-73, T-92-74, T-92-75): the remainder of a payment-link quote is paid on the
 * quote page. Runs lib/quotes/remainder.ts for real against the in-memory payments database and the in-memory Stripe; the
 * webhook part goes through dispatchPaymentEvent (the route's own router) so the routing is the real one.
 *
 * Seed: a paid payment_link quote with two quote-mode trips whose remainders are 8400 and 12600 (21000 due).
 */

const { world, mockResendSend } = vi.hoisted(() => ({
  world: {
    db: null as unknown as FakePaymentsDb,
    stripe: null as unknown,
    processed: new Set<string>(),
    /** Number of upcoming append_payment_event calls that answer a database error. */
    rpcFailures: 0,
  },
  mockResendSend: vi.fn(),
}))

process.env.RESEND_API_KEY = 're_test'

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
    createSupabaseServiceClient: () => ({
      from: (table: string) => (table === 'stripe_processed_events' ? processedTable : world.db.client.from(table)),
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === 'append_payment_event' && world.rpcFailures > 0) {
          world.rpcFailures -= 1
          return { data: null, error: { message: 'connection reset (secret detail)', code: '08006' } }
        }
        return world.db.client.rpc(name, args)
      },
    }),
  }
})
vi.mock('@/lib/payments/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => (world.stripe as FakeStripe).stripe,
}))
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))

import { createRemainderIntent, applyQuoteRemainderPaid } from '@/lib/quotes/remainder'
import { classifyPaymentEvent, dispatchPaymentEvent } from '@/lib/stripe-webhook/dispatch'
import type Stripe from 'stripe'

// A month before the first pickup (2027-06-10).
const NOW = Date.parse('2027-05-10T10:00:00Z')
const DUE = 21000

let db: FakePaymentsDb
let fake: FakeStripe

const quoteRow = () => db.state.quotes[0]
const eventKinds = () => db.state.quote_events.map((e) => e.kind)
const quoteEvents = (kind: string) => db.state.quote_events.filter((e) => e.kind === kind)
const ledger = () => db.state.booking_payment_events.filter((e) => e.kind === 'quote_remainder')

/** A paid quote with two unpaid quote-mode trips. `method` is the remainder method of the frozen version. */
async function seedPaid(over: Parameters<typeof seedPublicQuote>[1] = {}): Promise<PublicQuoteFixture> {
  const fx = await seedPublicQuote(db, { status: 'paid', remainderMethod: 'payment_link', ...over })
  const upd = await db.client
    .from('quotes')
    .update({ paid_at: '2027-05-01T10:00:00.000Z', accepted_version_id: fx.versionId, deposit_payment_intent_id: 'pi_dep_1' })
    .eq('id', fx.quoteId)
  expect(upd.error).toBeNull()
  const ins = await db.client.from('bookings').insert([
    { booking_reference: 'PR-9101', quote_id: fx.quoteId, quote_line_id: fx.lineIds[0], status: 'confirmed', payment_mode: 'quote', paid_at: null },
    { booking_reference: 'PR-9102', quote_id: fx.quoteId, quote_line_id: fx.lineIds[1], status: 'confirmed', payment_mode: 'quote', paid_at: null },
  ])
  expect(ins.error).toBeNull()
  return fx
}

const create = (fx: PublicQuoteFixture, over: Partial<Parameters<typeof createRemainderIntent>[0]> = {}) =>
  createRemainderIntent({ token: fx.token, displayedAmountMinor: DUE, nowMs: NOW, ...over })

/** The remainder PaymentIntent the quote stored, as the succeeded event Stripe would deliver. */
function succeeded(piId: string, over: Record<string, unknown> = {}): Stripe.PaymentIntent {
  const stored = fake.state.paymentIntents.get(piId)
  if (!stored) throw new Error(`no such intent ${piId}`)
  stored.status = 'succeeded'
  stored.amount_received = stored.amount as number
  return { ...(stored as object), ...over } as unknown as Stripe.PaymentIntent
}

const eventOf = (pi: unknown, id = 'evt_rem_1') =>
  ({ id, type: 'payment_intent.succeeded', data: { object: pi } }) as unknown as Stripe.Event

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MANAGER_EMAIL = 'owner@example.com'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  db = createFakePaymentsDb()
  fake = createFakeStripe({ nowSec: () => Math.floor(NOW / 1000) })
  world.db = db
  world.stripe = fake
  world.processed.clear()
  world.rpcFailures = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createRemainderIntent (tracer)', () => {
  it('creates one card-only intent for the sum of the unpaid quote-mode trips, on the quote customer, stored on the quote', async () => {
    const fx = await seedPaid()
    const res = await create(fx)

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.amountMinor).toBe(DUE)
    expect(res.currency).toBe('eur')
    expect(res.clientSecret).toMatch(/^pi_\d+_secret_fake$/)

    const pis = fake.callsTo('paymentIntents.create')
    expect(pis).toHaveLength(1)
    const p = pis[0].params as Record<string, unknown>
    expect(p.amount).toBe(DUE)
    expect(p.currency).toBe('eur')
    expect(p.payment_method_types).toEqual(['card'])
    // D-22: the card is not saved for the operator to charge later.
    expect('setup_future_usage' in p).toBe(false)
    expect('capture_method' in p).toBe(false)
    expect('confirm' in p).toBe(false)
    expect(p.customer).toBe(quoteRow().stripe_customer_id)
    expect(p.metadata).toEqual({
      kind: 'card_quote_remainder',
      quoteId: fx.quoteId,
      versionId: fx.versionId,
      quoteReference: 'Q-20261114-ABC123',
      attempt: '1',
    })
    expect(pis[0].idempotencyKey).toBe(`qrem:${fx.quoteId}:1`)
    expect(pis[0].idempotencyKey).toBe(stripeKeys.quoteRemainder(fx.quoteId, 1))

    const piId = [...fake.state.paymentIntents.keys()][0]
    expect(quoteRow().remainder_payment_intent_id).toBe(piId)
    expect(Number(quoteRow().remainder_amount_minor)).toBe(DUE)
    expect(quoteRow().remainder_attempt).toBe(1)
    expect(quoteRow().remainder_paid_at).toBeNull()
    // Never on a booking.
    expect(db.state.bookings.every((b) => b.payment_intent_id == null && b.hold_payment_intent_id == null)).toBe(true)

    const started = db.state.quote_events.filter((e) => e.kind === 'remainder_started')
    expect(started).toHaveLength(1)
    expect(started[0].stripe_object_id).toBe(piId)
    expect(started[0].amount_minor).toBe(DUE)
  })

  it('only the trips that are quote-mode, not cancelled and not paid count', async () => {
    const fx = await seedPaid()
    await db.client.from('bookings').update({ status: 'cancelled' }).eq('booking_reference', 'PR-9101')
    const res = await create(fx, { displayedAmountMinor: 12600 })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.amountMinor).toBe(12600)
  })

  it('a due amount below the Stripe minimum is not_payable and Stripe is never called', async () => {
    const fx = await seedPaid()
    // A frozen version can not be updated through the client (the guard of migration 091), so the rows are changed directly.
    const remainders = [20, 10]
    fx.lineIds.forEach((id, i) => {
      const line = db.state.quote_version_lines.find((l) => l.id === id)!
      line.remainder_minor = remainders[i]
    })
    expect(await create(fx, { displayedAmountMinor: 30 })).toEqual({ ok: false, code: 'not_payable' })
    expect(fake.calls).toHaveLength(0)
  })

  it('a second call while the first intent is open reuses it: same secret, no second PaymentIntent', async () => {
    const fx = await seedPaid()
    const a = await create(fx)
    const b = await create(fx)
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(b.clientSecret).toBe(a.clientSecret)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
    expect(quoteEvents('remainder_started')).toHaveLength(1)
  })

  it('a canceled stored intent is replaced with the next attempt number', async () => {
    const fx = await seedPaid()
    await create(fx)
    const first = [...fake.state.paymentIntents.keys()][0]
    fake.state.paymentIntents.get(first)!.status = 'canceled'
    const res = await create(fx)
    expect(res.ok).toBe(true)
    const calls = fake.callsTo('paymentIntents.create')
    expect(calls).toHaveLength(2)
    expect(calls[1].idempotencyKey).toBe(`qrem:${fx.quoteId}:2`)
    expect(quoteRow().remainder_attempt).toBe(2)
    expect(quoteRow().remainder_payment_intent_id).not.toBe(first)
  })

  it('a processing or succeeded stored intent answers already_paying and creates nothing', async () => {
    const fx = await seedPaid()
    await create(fx)
    const first = [...fake.state.paymentIntents.keys()][0]
    for (const status of ['processing', 'succeeded']) {
      fake.state.paymentIntents.get(first)!.status = status
      expect(await create(fx)).toEqual({ ok: false, code: 'already_paying' })
    }
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })

  it('refuses without touching Stripe: offer-state quote, saved_card quote, cancelled quote, unknown token, nothing due, wrong amount', async () => {
    const offer = await seedPaid({ status: 'sent' })
    expect(await create(offer), 'offer state').toEqual({ ok: false, code: 'not_payable' })
    expect(await create(offer, { token: 'x'.repeat(43) }), 'unknown token').toEqual({ ok: false, code: 'invalid_link' })

    db = createFakePaymentsDb()
    world.db = db
    const savedCard = await seedPaid({ remainderMethod: 'saved_card' })
    expect(await create(savedCard)).toEqual({ ok: false, code: 'not_payable' })

    db = createFakePaymentsDb()
    world.db = db
    const cancelled = await seedPaid({ cancelledAt: '2027-05-02T10:00:00.000Z' })
    expect(await create(cancelled)).toEqual({ ok: false, code: 'invalid_link' })

    db = createFakePaymentsDb()
    world.db = db
    const paidUp = await seedPaid()
    await db.client.from('bookings').update({ paid_at: '2027-05-03T10:00:00.000Z' }).eq('quote_id', paidUp.quoteId)
    expect(await create(paidUp)).toEqual({ ok: false, code: 'nothing_due' })

    db = createFakePaymentsDb()
    world.db = db
    const wrong = await seedPaid()
    expect(await create(wrong, { displayedAmountMinor: DUE - 1 })).toEqual({ ok: false, code: 'amount_changed' })
    expect(await create(wrong, { displayedAmountMinor: 100 })).toEqual({ ok: false, code: 'amount_changed' })

    expect(fake.calls).toHaveLength(0)
    expect(db.state.quote_events).toHaveLength(0)
  })
})

describe('classification', () => {
  it('payment_intent.succeeded of kind card_quote_remainder is quote_remainder_paid and never the legacy chain', () => {
    const e = eventOf({ id: 'pi_1', metadata: { kind: 'card_quote_remainder', quoteId: 'q' } })
    expect(classifyPaymentEvent(e)).toMatchObject({ route: 'quote_remainder_paid', kind: 'card_quote_remainder' })
  })
})

describe('a succeeded remainder through the webhook dispatch (tracer)', () => {
  async function paidFixture() {
    const fx = await seedPaid()
    const res = await create(fx)
    if (!res.ok) throw new Error('seed: intent not created')
    const piId = quoteRow().remainder_payment_intent_id as string
    return { fx, piId }
  }

  it('marks both trips paid, stamps the quote, writes one ledger row per trip and a remainder_paid event; no booking gets the intent', async () => {
    const { fx, piId } = await paidFixture()
    const out = await dispatchPaymentEvent(eventOf(succeeded(piId)))

    expect(out.handled).toBe(true)
    if (out.handled) expect(out.response.status).toBe(200)

    const trips = db.state.bookings.filter((b) => b.quote_id === fx.quoteId)
    expect(trips).toHaveLength(2)
    for (const b of trips) {
      expect(b.paid_at).not.toBeNull()
      expect(b.payment_mode).toBe('quote')
      expect(b.payment_intent_id ?? null).toBeNull()
      expect(b.hold_payment_intent_id ?? null).toBeNull()
    }
    expect(quoteRow().remainder_paid_at).not.toBeNull()
    expect(Number(quoteRow().remainder_amount_minor)).toBe(DUE)

    // 21000 split by trip: the remainder of each line.
    const rows = ledger()
    expect(rows).toHaveLength(2)
    const byBooking = new Map(rows.map((r) => [r.booking_id, r]))
    const first = trips.find((b) => b.quote_line_id === fx.lineIds[0])!
    const second = trips.find((b) => b.quote_line_id === fx.lineIds[1])!
    expect(byBooking.get(first.id)).toMatchObject({ amount_minor: 8400, currency: 'eur', stripe_object_id: piId, event_key: `quote_remainder:${piId}` })
    expect(byBooking.get(second.id)).toMatchObject({ amount_minor: 12600, currency: 'eur', stripe_object_id: piId })

    const paid = quoteEvents('remainder_paid')
    expect(paid).toHaveLength(1)
    expect(paid[0]).toMatchObject({ stripe_object_id: piId, amount_minor: DUE, currency: 'eur' })
  })

  it('a replay (the same event, then a new event id for the same intent) changes nothing', async () => {
    const { piId } = await paidFixture()
    await dispatchPaymentEvent(eventOf(succeeded(piId)))
    const before = JSON.stringify([db.state.bookings, db.state.quotes, db.state.quote_events, db.state.booking_payment_events])

    const again = await dispatchPaymentEvent(eventOf(succeeded(piId)))
    expect(again.handled && again.response.status).toBe(200)
    const fresh = await dispatchPaymentEvent(eventOf(succeeded(piId), 'evt_rem_2'))
    expect(fresh.handled && fresh.response.status).toBe(200)

    expect(JSON.stringify([db.state.bookings, db.state.quotes, db.state.quote_events, db.state.booking_payment_events])).toBe(before)
  })

  it('a handler failure answers 500 (Stripe redelivers) and the redelivery finishes the work exactly once', async () => {
    const { piId } = await paidFixture()
    world.rpcFailures = 1
    const failed = await dispatchPaymentEvent(eventOf(succeeded(piId)))
    expect(failed.handled && failed.response.status).toBe(500)
    expect(world.processed.has('evt_rem_1')).toBe(false)

    const redelivered = await dispatchPaymentEvent(eventOf(succeeded(piId)))
    expect(redelivered.handled && redelivered.response.status).toBe(200)
    expect(db.state.bookings.every((b) => b.paid_at != null)).toBe(true)
    expect(ledger()).toHaveLength(2)
    expect(quoteEvents('remainder_paid')).toHaveLength(1)
  })

  it('the webhook and the tick at the same moment: one paid, one replayed, one set of rows, receipts share one idempotency key', async () => {
    const { fx, piId } = await paidFixture()
    const pi = succeeded(piId)
    const [a, b] = await Promise.all([
      applyQuoteRemainderPaid(pi, { type: 'webhook', id: 'evt_x' }),
      applyQuoteRemainderPaid(pi, { type: 'system', id: 'tick_reconcile' }),
    ])
    expect([a.outcome, b.outcome].sort()).toEqual(['paid', 'replayed'])
    expect(ledger()).toHaveLength(2)
    expect(quoteEvents('remainder_paid')).toHaveLength(1)
    expect(db.state.bookings.filter((x) => x.quote_id === fx.quoteId).every((x) => x.paid_at != null)).toBe(true)
    const keys = new Set(mockResendSend.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey))
    expect(keys.size).toBe(1)
  })

  it('applyQuoteRemainderPaid ignores an intent that is not succeeded, is not a remainder or has unusable metadata', async () => {
    const { fx, piId } = await paidFixture()
    const actor = { type: 'system', id: 'tick_reconcile' } as const
    const open = { ...(fake.state.paymentIntents.get(piId) as object) } as unknown as Stripe.PaymentIntent
    expect((await applyQuoteRemainderPaid(open, actor)).outcome).toBe('ignored')

    const good = succeeded(piId)
    const metas = [
      { ...good.metadata, kind: 'card_quote_deposit' },
      { ...good.metadata, quoteId: 'nope' },
      { ...good.metadata, versionId: 'nope' },
      { ...good.metadata, quoteId: '00000000-0000-4000-8000-0000000000ff' },
    ]
    for (const metadata of metas) {
      expect((await applyQuoteRemainderPaid({ ...good, metadata } as Stripe.PaymentIntent, actor)).outcome).toBe('ignored')
    }
    expect(db.state.bookings.every((b) => b.paid_at == null)).toBe(true)
    expect(quoteRow().remainder_paid_at).toBeNull()
    expect(fx.quoteId).toBeTruthy()
  })
})

// == Task 2: amount changes, ownership, mismatch and the receipt ======================================================

describe('amount changes (T-92-73, T-92-74)', () => {
  it('a trip cancelled meanwhile: the live 21000 intent is cancelled with qrem_void:<pi> and attempt 2 creates a 12600 intent', async () => {
    const fx = await seedPaid()
    await create(fx)
    const first = quoteRow().remainder_payment_intent_id as string

    await db.client.from('bookings').update({ status: 'cancelled' }).eq('booking_reference', 'PR-9101')
    const res = await create(fx, { displayedAmountMinor: 12600 })

    expect(res.ok).toBe(true)
    if (res.ok) expect(res.amountMinor).toBe(12600)
    const cancels = fake.callsTo('paymentIntents.cancel')
    expect(cancels).toHaveLength(1)
    expect(cancels[0].idempotencyKey).toBe(`qrem_void:${first}`)
    expect(cancels[0].idempotencyKey).toBe(stripeKeys.quoteRemainderVoid(first))
    expect(fake.state.paymentIntents.get(first)!.status).toBe('canceled')

    const creates = fake.callsTo('paymentIntents.create')
    expect(creates).toHaveLength(2)
    expect((creates[1].params as { amount: number }).amount).toBe(12600)
    expect(creates[1].idempotencyKey).toBe(`qrem:${fx.quoteId}:2`)
    expect((creates[1].params as { metadata: Record<string, string> }).metadata.attempt).toBe('2')

    expect(quoteRow().remainder_payment_intent_id).not.toBe(first)
    expect(Number(quoteRow().remainder_amount_minor)).toBe(12600)
    expect(quoteRow().remainder_attempt).toBe(2)
    expect(quoteEvents('remainder_started')).toHaveLength(2)
  })

  it('the stale displayed amount is a 409 amount_changed and leaves the old intent exactly as it is', async () => {
    const fx = await seedPaid()
    await create(fx)
    const first = quoteRow().remainder_payment_intent_id as string
    await db.client.from('bookings').update({ status: 'cancelled' }).eq('booking_reference', 'PR-9101')

    expect(await create(fx, { displayedAmountMinor: DUE })).toEqual({ ok: false, code: 'amount_changed' })
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
    expect(fake.state.paymentIntents.get(first)!.status).toBe('requires_payment_method')
    expect(quoteRow().remainder_payment_intent_id).toBe(first)
  })

  it('a stale intent that can not be cancelled answers busy and creates nothing', async () => {
    const fx = await seedPaid()
    await create(fx)
    await db.client.from('bookings').update({ status: 'cancelled' }).eq('booking_reference', 'PR-9101')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    fake.failNextWithError(
      'paymentIntents.cancel',
      new FakeStripeError('StripeInvalidRequestError', 'cannot cancel', { code: 'payment_intent_unexpected_state', statusCode: 400 }),
    )

    expect(await create(fx, { displayedAmountMinor: 12600 })).toEqual({ ok: false, code: 'busy' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })

  it('two requests at once leave one live intent: the loser of the attempt compare-and-set is told to retry and creates nothing', async () => {
    const fx = await seedPaid()
    const [a, b] = await Promise.all([create(fx), create(fx)])
    const results = [a, b]
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, code: 'busy' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
    expect(quoteRow().remainder_attempt).toBe(1)
    // The retry reuses the winner's intent.
    const again = await create(fx)
    const winner = results.find((r) => r.ok)
    expect(again.ok && winner?.ok && again.clientSecret === winner.clientSecret).toBe(true)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })
})

describe('ownership: a succeeded intent the quote does not own is refunded and alerted once (T-92-74)', () => {
  const actor = { type: 'webhook', id: 'evt_o' } as const
  const alertsSent = () => mockResendSend.mock.calls.filter((c) => String((c[0] as { subject?: string }).subject).startsWith('[Quote]'))

  /** A remainder intent of the quote that the quote never stored (for example one replaced earlier). */
  async function strayIntent(fx: PublicQuoteFixture, amount = DUE): Promise<string> {
    const pi = await fake.stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      metadata: { kind: 'card_quote_remainder', quoteId: fx.quoteId, versionId: fx.versionId, quoteReference: 'Q-20261114-ABC123', attempt: '1' },
    })
    return pi.id
  }

  it('an intent that is not quotes.remainder_payment_intent_id is refunded in full, recorded and alerted; nothing is marked paid', async () => {
    const fx = await seedPaid()
    await create(fx)
    const stray = await strayIntent(fx)

    const res = await applyQuoteRemainderPaid(succeeded(stray), actor)
    expect(res.outcome).toBe('orphan_refunded')

    const refunds = fake.callsTo('refunds.create')
    expect(refunds).toHaveLength(1)
    expect(refunds[0].idempotencyKey).toBe(`refund:quote:${fx.quoteId}:orphan:${stray}`)
    expect(refunds[0].idempotencyKey).toBe(stripeKeys.quoteRefund(fx.quoteId, `orphan:${stray}`))
    expect(refunds[0].params).toMatchObject({ payment_intent: stray })
    expect(quoteEvents('orphan_refunded')).toHaveLength(1)
    expect(alertsSent()).toHaveLength(1)
    expect(String((alertsSent()[0][0] as { subject: string }).subject)).toContain('refunded automatically')

    expect(db.state.bookings.every((b) => b.paid_at == null)).toBe(true)
    expect(quoteRow().remainder_paid_at).toBeNull()
    expect(ledger()).toHaveLength(0)
    expect(quoteEvents('remainder_paid')).toHaveLength(0)

    // Delivered again: no second refund, no second alert.
    const again = await applyQuoteRemainderPaid(succeeded(stray), actor)
    expect(again.outcome).toBe('orphan_refunded')
    expect(fake.callsTo('refunds.create')).toHaveLength(1)
    expect(alertsSent()).toHaveLength(1)
  })

  it('a second payment after the remainder is already recorded (another intent) is refunded; the recorded one is untouched', async () => {
    const fx = await seedPaid()
    await create(fx)
    const first = quoteRow().remainder_payment_intent_id as string
    await applyQuoteRemainderPaid(succeeded(first), actor)
    expect(quoteRow().remainder_paid_at).not.toBeNull()
    const paidAt = quoteRow().remainder_paid_at

    const stray = await strayIntent(fx)
    expect((await applyQuoteRemainderPaid(succeeded(stray), actor)).outcome).toBe('orphan_refunded')
    expect(fake.callsTo('refunds.create').map((c) => (c.params as { payment_intent: string }).payment_intent)).toEqual([stray])
    expect(quoteRow().remainder_paid_at).toBe(paidAt)
    expect(quoteRow().remainder_payment_intent_id).toBe(first)
  })

  it('the stored intent of a quote that was cancelled before the payment landed is refunded, not recorded', async () => {
    const fx = await seedPaid()
    await create(fx)
    const stored = quoteRow().remainder_payment_intent_id as string
    await db.client.from('quotes').update({ cancelled_at: '2027-05-11T10:00:00.000Z' }).eq('id', fx.quoteId)

    expect((await applyQuoteRemainderPaid(succeeded(stored), actor)).outcome).toBe('orphan_refunded')
    expect(fake.callsTo('refunds.create')).toHaveLength(1)
    expect(quoteRow().remainder_paid_at).toBeNull()
    expect(db.state.bookings.every((b) => b.paid_at == null)).toBe(true)
  })

  it('a refund that fails is recorded and alerted once and thrown, so Stripe redelivers; the redelivery completes it', async () => {
    const fx = await seedPaid()
    await create(fx)
    const stray = await strayIntent(fx)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fake.failNextWithError('refunds.create', new FakeStripeError('StripeAPIError', 'boom', { code: 'rate_limit', statusCode: 500 }))

    await expect(applyQuoteRemainderPaid(succeeded(stray), actor)).rejects.toBeDefined()
    expect(quoteEvents('refund_failed')).toHaveLength(1)
    expect(quoteEvents('orphan_refunded')).toHaveLength(0)

    expect((await applyQuoteRemainderPaid(succeeded(stray), actor)).outcome).toBe('orphan_refunded')
    expect(quoteEvents('orphan_refunded')).toHaveLength(1)
    expect(quoteEvents('refund_failed')).toHaveLength(1)
  })
})

describe('mismatch: a paid amount that differs from the current due stamps nothing and alerts once (T-92-75)', () => {
  const actor = { type: 'system', id: 'tick_reconcile' } as const
  const alertsSent = () => mockResendSend.mock.calls.filter((c) => String((c[0] as { subject?: string }).subject).startsWith('[Quote]'))

  it('a trip cancelled after the intent was paid: recorded, nothing marked paid, one quote_remainder_mismatch alert; a repeat adds nothing', async () => {
    const fx = await seedPaid()
    await create(fx)
    const piId = quoteRow().remainder_payment_intent_id as string
    await db.client.from('bookings').update({ status: 'cancelled' }).eq('booking_reference', 'PR-9101')

    const res = await applyQuoteRemainderPaid(succeeded(piId), actor)
    expect(res.outcome).toBe('mismatch')
    expect(quoteRow().remainder_paid_at).toBeNull()
    expect(db.state.bookings.every((b) => b.paid_at == null)).toBe(true)
    expect(ledger()).toHaveLength(0)
    expect(quoteEvents('remainder_paid')).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)

    const rows = quoteEvents('remainder_failed')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ stripe_object_id: piId, amount_minor: DUE, error_code: 'amount_mismatch' })
    expect(alertsSent()).toHaveLength(1)
    expect(String((alertsSent()[0][0] as { subject: string }).subject)).toContain('Quote remainder does not match')
    expect(String((alertsSent()[0][0] as { text: string }).text)).toContain('quote_remainder_mismatch')

    expect((await applyQuoteRemainderPaid(succeeded(piId), actor)).outcome).toBe('mismatch')
    expect(quoteEvents('remainder_failed')).toHaveLength(1)
    expect(alertsSent()).toHaveLength(1)

    // The client can not pay again while that payment is unresolved.
    expect(await create(fx, { displayedAmountMinor: 12600 })).toEqual({ ok: false, code: 'already_paying' })
  })

  it('a different currency is a mismatch as well', async () => {
    const fx = await seedPaid()
    await create(fx)
    const piId = quoteRow().remainder_payment_intent_id as string
    expect((await applyQuoteRemainderPaid(succeeded(piId, { currency: 'czk' }), actor)).outcome).toBe('mismatch')
    expect(quoteRow().remainder_paid_at).toBeNull()
    expect(fx.quoteId).toBeTruthy()
  })
})

describe('the receipt email', () => {
  const actor = { type: 'webhook', id: 'evt_r' } as const
  const receipts = () => mockResendSend.mock.calls.filter((c) => !String((c[0] as { subject?: string }).subject).startsWith('[Quote]'))

  it('one QuoteEmails.remainderPaid receipt in the quote language after a paid outcome, never twice (email:remainder_paid:<pi>)', async () => {
    const fx = await seedPaid({ locale: 'ru' })
    await create(fx)
    const piId = quoteRow().remainder_payment_intent_id as string

    expect((await applyQuoteRemainderPaid(succeeded(piId), actor)).outcome).toBe('paid')
    expect(receipts()).toHaveLength(1)
    const [message, options] = receipts()[0] as [{ to: string[]; subject: string; html: string }, { idempotencyKey: string }]
    expect(message.to).toEqual(['ada.secret@example.com'])
    expect(message.subject).toBe('Платёж получен – Q-20261114-ABC123')
    expect(message.html).toContain('lang="ru"')
    expect(options.idempotencyKey).toContain(piId)
    expect(db.state.quote_events.some((e) => e.event_key === `email:remainder_paid:${piId}` && e.kind === 'email_sent')).toBe(true)

    expect((await applyQuoteRemainderPaid(succeeded(piId), actor)).outcome).toBe('replayed')
    expect(receipts()).toHaveLength(1)
  })

  it('the English receipt names the amount', async () => {
    const fx = await seedPaid()
    await create(fx)
    const piId = quoteRow().remainder_payment_intent_id as string
    await applyQuoteRemainderPaid(succeeded(piId), actor)
    const message = receipts()[0][0] as { subject: string; html: string }
    expect(message.subject).toBe('Payment received – Q-20261114-ABC123')
    expect(message.html).toContain('210')
  })

  it('a failed send is recorded as email_failed and does not fail the payment; a later delivery of the event sends it once', async () => {
    const fx = await seedPaid()
    await create(fx)
    const piId = quoteRow().remainder_payment_intent_id as string
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockResendSend.mockRejectedValueOnce(new Error('resend down'))

    expect((await applyQuoteRemainderPaid(succeeded(piId), actor)).outcome).toBe('paid')
    expect(quoteRow().remainder_paid_at).not.toBeNull()
    expect(quoteEvents('email_failed')).toHaveLength(1)
    expect(quoteEvents('email_sent')).toHaveLength(0)

    expect((await applyQuoteRemainderPaid(succeeded(piId), actor)).outcome).toBe('replayed')
    expect(quoteEvents('email_sent')).toHaveLength(1)
    expect((await applyQuoteRemainderPaid(succeeded(piId), actor)).outcome).toBe('replayed')
    expect(quoteEvents('email_sent')).toHaveLength(1)
    expect(quoteEvents('email_failed')).toHaveLength(1)
  })

  it('every locale renders the receipt with its own subject and the amount', async () => {
    const { renderQuoteRemainderPaidEmail } = await import('@/lib/quotes/emails/remainder-paid')
    // Simplified and Traditional Chinese share the subject; their bodies differ.
    const bodies = new Set<string>()
    for (const locale of ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh', 'zh-hant']) {
      const out = await renderQuoteRemainderPaidEmail({
        quote: { reference: 'Q-20261114-ABC123', client_first_name: 'Ada' },
        version: { locale, currency: 'eur' },
        amountMinor: 12600,
      })
      expect(out.subject, locale).toContain('Q-20261114-ABC123')
      expect(out.html, locale).toContain('126')
      bodies.add(out.html)
    }
    expect(bodies.size).toBe(8)
    await expect(
      renderQuoteRemainderPaidEmail({ quote: { reference: 'Q', client_first_name: 'A' }, version: { locale: 'en', currency: 'eur' }, amountMinor: 0 }),
    ).rejects.toThrow()
  })
})
