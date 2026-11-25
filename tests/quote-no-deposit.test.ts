// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { seedPublicQuote, type PublicQuoteFixture } from './helpers/quote-public-fixture'

/**
 * Migration 098 (owner request 2026-11-24): a quote without a deposit.
 *   payment link / invoice: the client only confirms; the bookings are made at once, no Stripe call at all.
 *   saved card / cash:      the client saves a card (a SetupIntent, nothing charged); when it succeeds the bookings are
 *                           made with that card, each trip held (saved card) or guaranteed (cash) for its whole amount.
 * Runs lib/quotes/accept.ts and convert.ts for real against the in-memory database and Stripe.
 */

const { world, settingsMock } = vi.hoisted(() => ({
  world: { client: null as unknown, stripe: null as unknown },
  settingsMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => world.client }))
vi.mock('@/lib/payments/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/config')>()),
  getPaymentSettings: settingsMock,
}))
// The paid effects (emails, alerts, reminders) are covered elsewhere; here they must not reach the network.
vi.mock('@/lib/quotes/emails/shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/quotes/emails/shell')>()),
  sendQuoteEmail: vi.fn(async () => 'sent'),
}))
vi.mock('@/lib/quotes/alerts', () => ({ sendQuoteOperatorAlert: vi.fn(async () => undefined) }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn(async () => null) }))

import { acceptQuote } from '@/lib/quotes/accept'
import { applyQuoteCardSaved } from '@/lib/quotes/convert'
import { renderQuoteTerms } from '@/lib/quotes/consent'
import { resolveQuoteToken } from '@/lib/quotes/resolve'
import type Stripe from 'stripe'

const NOW = Date.parse('2027-05-10T10:00:00Z')

let db: FakePaymentsDb
let fake: FakeStripe

function accept(fx: PublicQuoteFixture, displayedDepositMinor = 0) {
  return acceptQuote({ token: fx.token, displayedVersionNo: 1, displayedDepositMinor, ip: '203.0.113.9', userAgent: 'UA', nowMs: NOW })
}

beforeEach(() => {
  db = createFakePaymentsDb()
  fake = createFakeStripe({ nowSec: () => Math.floor(NOW / 1000) })
  world.client = db.client
  world.stripe = fake.stripe
  settingsMock.mockReset()
  settingsMock.mockResolvedValue({ mode: 'on', leadHours: 72, canaryEmails: [] })
})

const quoteRow = () => db.state.quotes[0]
const bookings = () => db.state.bookings

describe('no deposit, payment link or invoice: a plain confirmation', () => {
  for (const method of ['payment_link', 'invoice'] as const) {
    it(`${method}: accept makes the bookings at once, quote paid, no Stripe call, no deposit ledger row`, async () => {
      const fx = await seedPublicQuote(db, { noDeposit: true, remainderMethod: method })
      const res = await accept(fx)
      expect(res).toEqual({ ok: true, confirmed: true, amountMinor: 0, currency: 'eur' })
      expect(fake.calls.length).toBe(0)
      expect(quoteRow().status).toBe('paid')
      expect(quoteRow().paid_at).not.toBeNull()
      expect(bookings()).toHaveLength(2)
      expect(bookings().every((b) => b.payment_mode === 'quote' && b.quote_deposit_minor === 0)).toBe(true)
      expect(db.state.booking_payment_events.filter((e) => e.kind === 'quote_deposit')).toHaveLength(0)
      expect(db.state.quote_events.map((e) => e.kind)).not.toContain('deposit_paid')
      expect(db.state.quote_events.map((e) => e.kind)).toContain('converted')
      expect(db.state.quote_acceptances[0]).toMatchObject({ deposit_minor: 0, payment_intent_id: null })
    })
  }

  it('a second accept of a confirmed quote is already_paid and makes nothing twice', async () => {
    const fx = await seedPublicQuote(db, { noDeposit: true, remainderMethod: 'invoice' })
    await accept(fx)
    expect(await accept(fx)).toEqual({ ok: false, code: 'already_paid' })
    expect(bookings()).toHaveLength(2)
  })

  it('the displayed deposit must be 0', async () => {
    const fx = await seedPublicQuote(db, { noDeposit: true, remainderMethod: 'invoice' })
    expect(await accept(fx, 9000)).toEqual({ ok: false, code: 'quote_changed' })
    expect(bookings()).toHaveLength(0)
  })
})

describe('no deposit, saved card or cash: the client saves a card', () => {
  it('saved_card: accept creates one SetupIntent (kind card_quote_setup), stores it, charges nothing', async () => {
    const fx = await seedPublicQuote(db, { noDeposit: true, remainderMethod: 'saved_card' })
    const res = await accept(fx)
    expect(res.ok).toBe(true)
    expect(res).toMatchObject({ mode: 'setup', amountMinor: 0, currency: 'eur' })
    expect(fake.executed('paymentIntents.create')).toBe(0)
    expect(fake.executed('setupIntents.create')).toBe(1)
    const [si] = [...fake.state.setupIntents.values()]
    expect(si).toMatchObject({ usage: 'off_session', metadata: { kind: 'card_quote_setup', quoteId: fx.quoteId, versionId: fx.versionId } })
    expect(quoteRow()).toMatchObject({ status: 'accepted', card_setup_intent_id: si.id, deposit_payment_intent_id: null })
    expect(db.state.quote_acceptances[0].payment_intent_id).toBe(si.id)
    expect(bookings()).toHaveLength(0)

    // A second accept while the setup is live reuses it.
    const again = await accept(fx)
    expect((again as { clientSecret?: string }).clientSecret).toBe((res as { clientSecret?: string }).clientSecret)
    expect(fake.executed('setupIntents.create')).toBe(1)
  })

  it('saved_card: the succeeded setup makes the bookings, each trip held for its whole amount on the saved card', async () => {
    const fx = await seedPublicQuote(db, { noDeposit: true, remainderMethod: 'saved_card' })
    await accept(fx)
    const [stored] = [...fake.state.setupIntents.values()]
    const si = { ...stored, status: 'succeeded', payment_method: 'pm_card_visa' } as unknown as Stripe.SetupIntent

    const out = await applyQuoteCardSaved(si, { type: 'webhook', id: 'evt_1' })
    expect(out.outcome).toBe('converted')
    expect(quoteRow()).toMatchObject({ status: 'paid', stripe_payment_method_id: 'pm_card_visa' })
    expect(bookings()).toHaveLength(2)
    const amounts = bookings().map((b) => b.payment_amount_minor).sort()
    expect(amounts).toEqual([12000, 18000])
    expect(bookings().every((b) => b.payment_mode === 'card_hold' && b.payment_state === 'card_saved' && b.hold_at)).toBe(true)

    // A redelivery is a replay, never a second set of bookings.
    expect((await applyQuoteCardSaved(si, { type: 'webhook', id: 'evt_2' })).outcome).toBe('replayed')
    expect(bookings()).toHaveLength(2)
  })

  it('cash: the bookings are cash_guarantee with the saved card', async () => {
    const fx = await seedPublicQuote(db, { noDeposit: true, remainderMethod: 'cash' })
    await accept(fx)
    const [stored] = [...fake.state.setupIntents.values()]
    await applyQuoteCardSaved({ ...stored, status: 'succeeded', payment_method: 'pm_x' } as unknown as Stripe.SetupIntent, {
      type: 'webhook',
      id: 'evt_1',
    })
    expect(bookings().every((b) => b.payment_mode === 'cash_guarantee' && b.stripe_payment_method_id === 'pm_x')).toBe(true)
  })

  it('a setup that is not the quote’s (another id) is ignored and makes nothing', async () => {
    const fx = await seedPublicQuote(db, { noDeposit: true, remainderMethod: 'saved_card' })
    await accept(fx)
    const foreign = {
      id: 'seti_other',
      status: 'succeeded',
      payment_method: 'pm_x',
      metadata: { kind: 'card_quote_setup', quoteId: fx.quoteId, versionId: fx.versionId },
    } as unknown as Stripe.SetupIntent
    expect((await applyQuoteCardSaved(foreign, { type: 'webhook', id: 'evt_1' })).outcome).toBe('ignored')
    expect(bookings()).toHaveLength(0)
  })
})

describe('no deposit: the consent text', () => {
  it('names no deposit amount and says nothing is charged now; the terms say cancelling costs nothing', async () => {
    const fx = await seedPublicQuote(db, { noDeposit: true, remainderMethod: 'saved_card' })
    const resolved = await resolveQuoteToken(fx.token, NOW)
    const terms = await renderQuoteTerms({ resolved: resolved!, nowMs: NOW })
    expect(terms.text).toContain('No deposit is charged now.')
    expect(terms.text).toContain('There is no deposit: cancelling costs nothing.')
    expect(terms.text).not.toMatch(/€/)
  })
})
