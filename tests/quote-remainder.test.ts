// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
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
