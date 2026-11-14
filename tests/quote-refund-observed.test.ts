// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { seedPaidQuote } from './helpers/quote-cancel-fixture'

/**
 * Phase 92 plan 92-22 (QUOTE-04; D-12): a Stripe refund on a quote payment (also one made in the Stripe Dashboard) is
 * observed: one refund_observed quote event and the stored refunded total raised to Stripe's amount_refunded, never
 * lowered, never doubled. A refund the site made itself (a cancel or a partial refund, or the orphan refund of 92-18) is
 * recognised and counts once. Bookings are never touched.
 */

const { world } = vi.hoisted(() => ({ world: { db: null as unknown as FakePaymentsDb } }))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) => world.db.client.rpc(name, args),
  }),
}))

import { appendQuoteEvent } from '@/lib/quotes/events'
import { observeQuoteRefund } from '@/lib/stripe-webhook/charge-events'

let db: FakePaymentsDb
let fake: FakeStripe

const quoteRow = (id: string) => db.state.quotes.find((q) => q.id === id)!
const observed = (id: string) => db.state.quote_events.filter((e) => e.quote_id === id && e.kind === 'refund_observed')

function refundEvent(paymentIntent: string | { id: string } | null, amountRefunded: number, chargeId = 'ch_1'): Stripe.Event {
  return fake.buildEvent('charge.refunded', {
    id: chargeId,
    object: 'charge',
    payment_intent: paymentIntent,
    amount: 5000,
    amount_refunded: amountRefunded,
    currency: 'eur',
    refunded: amountRefunded >= 5000,
  }) as unknown as Stripe.Event
}

beforeEach(() => {
  db = createFakePaymentsDb({ nowMs: Date.parse('2026-11-14T10:00:00Z') })
  fake = createFakeStripe()
  world.db = db
})

describe('charge.refunded on a quote deposit', () => {
  it('tracer: a Dashboard refund is recorded as refund_observed and raises the stored total; a replay changes nothing', async () => {
    const f = await seedPaidQuote(db, fake)
    const event = refundEvent(f.depositIntent, 1500)

    await observeQuoteRefund(event)
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(1500)
    expect(observed(f.quoteId)).toHaveLength(1)
    expect(observed(f.quoteId)[0]).toMatchObject({
      event_key: 'refund_observed:ch_1:1500',
      amount_minor: 1500,
      currency: 'eur',
      stripe_object_id: 'ch_1',
      actor_type: 'webhook',
    })

    await observeQuoteRefund(event)
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(1500)
    expect(observed(f.quoteId)).toHaveLength(1)
  })

  it('a later, larger total raises it again; a smaller or equal one never lowers it', async () => {
    const f = await seedPaidQuote(db, fake)
    await observeQuoteRefund(refundEvent(f.depositIntent, 1000))
    await observeQuoteRefund(refundEvent(f.depositIntent, 2500))
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(2500)
    // An older event delivered late.
    await observeQuoteRefund(refundEvent(f.depositIntent, 1000))
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(2500)
    expect(observed(f.quoteId)).toHaveLength(2)
  })

  it('a refund the site made itself is counted once: the stored total already equals Stripe\'s', async () => {
    const f = await seedPaidQuote(db, fake, { depositRefunded: 1000 })
    await observeQuoteRefund(refundEvent(f.depositIntent, 1000))
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(1000)
  })

  it('a payment_intent that arrives expanded as an object matches too', async () => {
    const f = await seedPaidQuote(db, fake)
    await observeQuoteRefund(refundEvent({ id: f.depositIntent }, 700))
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(700)
  })

  it('a refund on a cancelled quote is observed too', async () => {
    const f = await seedPaidQuote(db, fake, { quote: { cancelled_at: '2026-11-14T09:00:00.000Z', cancel_initiator: 'admin_client', cancel_outcome: 'free' } })
    await observeQuoteRefund(refundEvent(f.depositIntent, 5000))
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(5000)
  })
})

describe('charge.refunded on a quote remainder', () => {
  it('raises remainder_refunded_minor and leaves the deposit total alone', async () => {
    const f = await seedPaidQuote(db, fake, { remainderPaid: { intent: 'pi_rem_obs', amount: 7000 } })
    await observeQuoteRefund(refundEvent('pi_rem_obs', 2000, 'ch_rem'))
    expect(quoteRow(f.quoteId)).toMatchObject({ remainder_refunded_minor: 2000, deposit_refunded_minor: 0 })
    expect(observed(f.quoteId)[0]).toMatchObject({ event_key: 'refund_observed:ch_rem:2000', amount_minor: 2000 })
    await observeQuoteRefund(refundEvent('pi_rem_obs', 2000, 'ch_rem'))
    expect(observed(f.quoteId)).toHaveLength(1)
    expect(quoteRow(f.quoteId).remainder_refunded_minor).toBe(2000)
  })
})

describe('refunds that are not a quote payment, or not the quote\'s to count', () => {
  it('an unknown payment intent and an event without one change nothing', async () => {
    const f = await seedPaidQuote(db, fake)
    await observeQuoteRefund(refundEvent('pi_unknown', 1000))
    await observeQuoteRefund(refundEvent(null, 1000))
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(0)
    expect(db.state.quote_events).toHaveLength(0)
  })

  it('the orphan refund of 92-18 is the site\'s own: a deposit the quote never recorded as paid is not counted', async () => {
    // The quote was voided before payment: it names the intent but is not paid, and 92-18 refunded the payment.
    const f = await seedPaidQuote(db, fake, { quote: { paid_at: null, status: 'voided', voided_at: '2026-11-14T08:00:00.000Z' } })
    await appendQuoteEvent(f.quoteId, {
      key: `orphan_refunded:${f.depositIntent}`,
      kind: 'orphan_refunded',
      stripeObjectId: f.depositIntent,
      amountMinor: 5000,
      currency: 'eur',
      actor: { type: 'webhook' },
    })

    await observeQuoteRefund(refundEvent(f.depositIntent, 5000))

    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(0)
    expect(observed(f.quoteId)).toHaveLength(0)
  })

  it('the same refund seen before the orphan_refunded row is written is not counted either (the quote is not paid)', async () => {
    const f = await seedPaidQuote(db, fake, { quote: { paid_at: null, status: 'accepted' } })
    await observeQuoteRefund(refundEvent(f.depositIntent, 5000))
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(0)
  })

  it('an orphan refund of a second payment on an already paid quote (another intent) matches no quote', async () => {
    const f = await seedPaidQuote(db, fake)
    await observeQuoteRefund(refundEvent('pi_second_payment', 5000))
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(0)
    expect(db.state.quote_events).toHaveLength(0)
  })

  it('no booking changes status: the trips of the quote stay as they are', async () => {
    const f = await seedPaidQuote(db, fake)
    const before = JSON.stringify(db.state.bookings)
    await observeQuoteRefund(refundEvent(f.depositIntent, 5000))
    expect(JSON.stringify(db.state.bookings)).toBe(before)
    expect(db.state.bookings.filter((b) => b.quote_id === f.quoteId).map((b) => b.status)).toEqual(['confirmed', 'confirmed'])
  })
})
