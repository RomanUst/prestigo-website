// @vitest-environment node
/**
 * Phase 92 plan 92-18 (QUOTE-03, QUOTE-04, QUOTE-05; D-15, D-18): applyQuoteDepositPaid, the conversion core.
 *
 * The real module runs on the stateful fakes: the payments database (which emulates quote_convert_to_bookings of
 * migration 091 with the same reasons and rows) and the Stripe double. Resend is a double. Tracer: a succeeded deposit of
 * a two-line saved-card quote becomes two linked card_hold bookings with hold_at set, and the claim picks the first up.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { FakeStripeError, createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

const { world, mockResendSend } = vi.hoisted(() => ({
  world: {
    db: null as unknown as FakePaymentsDb,
    stripe: null as unknown,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Number of upcoming quote_convert_to_bookings calls that answer a database error. */
    rpcFailures: 0,
    /** The next quote_convert_to_bookings call answers this instead of running (a race the code can not see). */
    rpcAnswer: null as null | Record<string, unknown>,
  },
  mockResendSend: vi.fn(),
}))

process.env.RESEND_API_KEY = 're_test'

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db.client.from(table),
    rpc: async (name: string, args?: Record<string, unknown>) => {
      world.rpcCalls.push({ name, args: args ?? {} })
      if (name === 'quote_convert_to_bookings' && world.rpcFailures > 0) {
        world.rpcFailures -= 1
        return { data: null, error: { message: 'connection reset (secret detail)', code: '08006' } }
      }
      if (name === 'quote_convert_to_bookings' && world.rpcAnswer) {
        const data = world.rpcAnswer
        world.rpcAnswer = null
        return { data, error: null }
      }
      return world.db.client.rpc(name, args)
    },
  }),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => (world.stripe as FakeStripe).stripe,
}))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))

import { applyQuoteDepositPaid } from '@/lib/quotes/convert'
import { QUOTE_ALERT_KINDS, sendQuoteOperatorAlert } from '@/lib/quotes/alerts'
import { computeHoldAt } from '@/lib/payments/timing'
import { pickupInstantMs } from '@/lib/prague-date'
import { quoteMetadata } from '@/lib/payments/stripe'
import type Stripe from 'stripe'

type Row = Record<string, unknown>

const NOW = Date.parse('2026-11-14T10:00:00.000Z')
const HASH = 'c'.repeat(64)
const WEBHOOK = { type: 'webhook', id: 'evt_1' } as const

let db: FakePaymentsDb
let fake: FakeStripe

interface SeedOptions {
  method?: 'saved_card' | 'payment_link' | 'cash' | 'invoice'
  suffix?: string
  intent?: string
  holdLeadHours?: number | null
  quote?: Row
}

interface Seeded {
  quoteId: string
  versionId: string
  lineIds: string[]
  intent: string
  reference: string
}

/** An accepted quote with a frozen two-line version and the acceptance that owns `intent`; lines: 3000+7000, 2000+0. */
async function seed(opts: SeedOptions = {}): Promise<Seeded> {
  const c = db.client
  const suffix = opts.suffix ?? 'AAAAAA'
  const intent = opts.intent ?? 'pi_1'
  const reference = `Q-20261114-${suffix}`
  const quote = await c
    .from('quotes')
    .insert({
      reference,
      client_first_name: 'Eva',
      client_last_name: 'Novakova',
      client_email: `eva-${suffix}@example.com`,
      client_phone: null,
      lead_channel: 'whatsapp',
    })
    .select('*')
    .single()
  const quoteId = (quote.data as { id: string }).id
  const version = await c
    .from('quote_versions')
    .insert({ quote_id: quoteId, version_no: 1, locale: 'en', currency: 'eur' })
    .select('*')
    .single()
  const versionId = (version.data as { id: string }).id

  const specs = [
    { share: 3000, remainder: 7000, time: '08:30' },
    { share: 2000, remainder: 0, time: '09:30' },
  ]
  const lineIds: string[] = []
  let total = 0
  let deposit = 0
  for (const [i, spec] of specs.entries()) {
    const amount = spec.share + spec.remainder
    total += amount
    deposit += spec.share
    const line = await c
      .from('quote_version_lines')
      .insert({
        version_id: versionId,
        position: i + 1,
        trip_type: 'transfer',
        pickup_date: '2026-12-20',
        pickup_time: spec.time,
        origin_address: 'Letiste Vaclava Havla, Praha',
        destination_address: 'Karlovo namesti 1, Praha',
        vehicle_class: 'business',
        passengers: 2,
        luggage: 1,
        amount_minor: amount,
        deposit_share_minor: spec.share,
        remainder_minor: spec.remainder,
        amount_eur: amount / 100,
        amount_czk: Math.round((amount / 100) * 25),
      })
      .select('*')
      .single()
    expect(line.error).toBeNull()
    lineIds.push((line.data as { id: string }).id)
  }
  const frozen = await c
    .from('quote_versions')
    .update({
      frozen_at: '2026-11-13T09:00:00.000Z',
      total_minor: total,
      deposit_kind: 'fixed',
      deposit_value: deposit,
      deposit_minor: deposit,
      remainder_method: opts.method ?? 'saved_card',
      cancel_free_hours: 48,
      cancel_fee_percent: 100,
      cancel_policy: { freeHours: 48, feePercent: 100 },
      cancel_policy_version: 'quote-policy-v1',
      terms_version: 'quote-2026-11-1',
    })
    .eq('id', versionId)
  expect(frozen.error).toBeNull()

  const acceptance = await c.from('quote_acceptances').insert({
    quote_id: quoteId,
    version_id: versionId,
    locale: 'en',
    terms_version: 'quote-2026-11-1',
    terms_sha256: HASH,
    terms_rendered: 'Terms of this quote.',
    deposit_minor: deposit,
    currency: 'eur',
    ip: '203.0.113.7',
    user_agent: 'test-agent',
    hold_lead_hours: opts.holdLeadHours === undefined ? 72 : opts.holdLeadHours,
    payment_intent_id: intent,
  })
  expect(acceptance.error).toBeNull()

  const upd = await c
    .from('quotes')
    .update({
      status: 'accepted',
      current_version_id: versionId,
      accepted_version_id: versionId,
      deposit_payment_intent_id: intent,
      ...(opts.quote ?? {}),
    })
    .eq('id', quoteId)
  expect(upd.error).toBeNull()
  return { quoteId, versionId, lineIds, intent, reference }
}

/** A succeeded deposit PaymentIntent for the seeded quote, also stored in the Stripe double (so it can be refunded). */
function depositIntent(s: Seeded, over: Partial<Stripe.PaymentIntent> & { metadata?: Record<string, string> } = {}): Stripe.PaymentIntent {
  const pi = {
    id: s.intent,
    object: 'payment_intent',
    status: 'succeeded',
    amount: 5000,
    amount_received: 5000,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_1',
    metadata: quoteMetadata('card_quote_deposit', {
      quoteId: s.quoteId,
      versionId: s.versionId,
      quoteReference: s.reference,
    }),
    ...over,
  } as unknown as Stripe.PaymentIntent
  fake.state.paymentIntents.set(pi.id, { ...pi, amount_refunded: 0 } as never)
  return pi
}

const bookingsOf = (quoteId: string) =>
  db.state.bookings
    .filter((b) => b.quote_id === quoteId)
    .sort((a, b) => String(a.booking_reference).localeCompare(String(b.booking_reference)))
const convertCalls = () => world.rpcCalls.filter((c) => c.name === 'quote_convert_to_bookings')

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MANAGER_EMAIL = 'owner@example.com'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  db = createFakePaymentsDb({ nowMs: NOW })
  fake = createFakeStripe()
  world.db = db
  world.stripe = fake
  world.rpcCalls = []
  world.rpcFailures = 0
  world.rpcAnswer = null
})

describe('tracer: a succeeded deposit converts the quote through the single RPC wrapper', () => {
  it('a two-line saved-card quote becomes two card_hold bookings with hold_at, the customer and the card', async () => {
    const s = await seed()
    const result = await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)

    expect(result.outcome).toBe('converted')
    expect(result.bookingIds).toHaveLength(2)
    const [b1, b2] = bookingsOf(s.quoteId)
    expect(new Set(result.bookingIds)).toEqual(new Set([b1.id, b2.id]))

    const pickup = pickupInstantMs({ pickup_utc: null, pickup_date: '2026-12-20', pickup_time: '08:30' }) as number
    const expectedHold = new Date(computeHoldAt(pickup, 72).holdAtMs).toISOString()
    // Line 1 holds a card for its remainder; line 2 has nothing left to collect (D-15: quote mode, no hold).
    const first = db.state.bookings.find((b) => b.quote_line_id === s.lineIds[0]) as Row
    const second = db.state.bookings.find((b) => b.quote_line_id === s.lineIds[1]) as Row
    expect(result.bookingIds).toEqual([first.id, second.id])
    expect(first).toMatchObject({
      payment_mode: 'card_hold',
      payment_state: 'card_saved',
      payment_amount_minor: 7000,
      stripe_customer_id: 'cus_1',
      stripe_payment_method_id: 'pm_1',
      hold_at: expectedHold,
      quote_id: s.quoteId,
    })
    expect(first.payment_intent_id).toBeNull()
    expect(second).toMatchObject({ payment_mode: 'quote', payment_state: 'none', hold_at: null })
    expect(second.payment_intent_id).toBeNull()

    // The references are fresh public booking references, unique per line.
    expect(first.booking_reference).toMatch(/^PRG-\d{8}-[0-9A-F]{6}$/)
    expect(second.booking_reference).toMatch(/^PRG-\d{8}-[0-9A-F]{6}$/)
    expect(first.booking_reference).not.toBe(second.booking_reference)

    // The one RPC call carries exactly the documented p_lines shape and the actor.
    expect(convertCalls()).toHaveLength(1)
    const args = convertCalls()[0].args
    expect(args).toMatchObject({
      p_quote_id: s.quoteId,
      p_version_id: s.versionId,
      p_payment_intent_id: 'pi_1',
      p_customer_id: 'cus_1',
      p_payment_method_id: 'pm_1',
      p_actor_type: 'webhook',
      p_actor_id: 'evt_1',
    })
    expect(args.p_lines).toEqual([
      { position: 1, booking_reference: first.booking_reference, hold_at: expectedHold },
      { position: 2, booking_reference: second.booking_reference, hold_at: null },
    ])
    // No money moved on the way: converting never calls Stripe.
    expect(fake.calls).toHaveLength(0)
  })

  it('the same intent again answers replayed with the same ids and creates nothing', async () => {
    const s = await seed()
    const pi = depositIntent(s)
    const first = await applyQuoteDepositPaid(pi, WEBHOOK)
    const snapshot = JSON.stringify([db.state.bookings, db.state.booking_payment_events, db.state.quote_events, db.state.booking_payment_consents])

    const again = await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(again.outcome).toBe('replayed')
    expect(again.bookingIds).toEqual(first.bookingIds)
    expect(bookingsOf(s.quoteId)).toHaveLength(2)
    expect(JSON.stringify([db.state.bookings, db.state.booking_payment_events, db.state.quote_events, db.state.booking_payment_consents])).toBe(
      snapshot,
    )
    // The recorded deposit is answered from the quote itself: the conversion RPC is not even called again.
    expect(convertCalls()).toHaveLength(1)
    expect(fake.calls).toHaveLength(0)
  })

  it('the claim picks the first booking up once its hold_at has passed and never a quote-mode booking', async () => {
    const s = await seed()
    await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)

    const early = await db.client.rpc('claim_due_payment_work', { p_limit: 10, p_lease_seconds: 60 })
    expect(early.data).toEqual([])

    const first = db.state.bookings.find((b) => b.quote_line_id === s.lineIds[0]) as Row
    db.state.nowMs = Date.parse(first.hold_at as string) + 60_000
    const due = await db.client.rpc('claim_due_payment_work', { p_limit: 10, p_lease_seconds: 60 })
    const claimed = due.data as Row[]
    expect(claimed).toHaveLength(1)
    expect(claimed[0]).toMatchObject({ id: first.id, payment_mode: 'card_hold', payment_state: 'placing_hold', quote_id: s.quoteId })
  })
})

describe('the remainder method decides the line mode (D-15, QUOTE-04)', () => {
  it('cash: a line with a remainder is cash_guarantee without hold_at, the empty line is quote', async () => {
    const s = await seed({ method: 'cash', suffix: 'CASH01' })
    const result = await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    expect(result.outcome).toBe('converted')
    const first = db.state.bookings.find((b) => b.quote_line_id === s.lineIds[0]) as Row
    const second = db.state.bookings.find((b) => b.quote_line_id === s.lineIds[1]) as Row
    expect(first).toMatchObject({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', hold_at: null })
    expect(second).toMatchObject({ payment_mode: 'quote', hold_at: null })
    expect(convertCalls()[0].args.p_lines).toEqual([
      { position: 1, booking_reference: first.booking_reference, hold_at: null },
      { position: 2, booking_reference: second.booking_reference, hold_at: null },
    ])
  })

  it.each(['payment_link', 'invoice'] as const)('%s: every line is a quote-mode booking with no hold', async (method) => {
    const s = await seed({ method, suffix: method === 'invoice' ? 'INV001' : 'LNK001' })
    const result = await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    expect(result.outcome).toBe('converted')
    for (const b of bookingsOf(s.quoteId)) {
      expect(b).toMatchObject({ payment_mode: 'quote', payment_state: 'none', hold_at: null })
    }
  })

  it('an acceptance without a recorded lead falls back to the default 72 hours', async () => {
    const s = await seed({ holdLeadHours: null, suffix: 'LEAD01' })
    await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    const pickup = pickupInstantMs({ pickup_utc: null, pickup_date: '2026-12-20', pickup_time: '08:30' }) as number
    const first = db.state.bookings.find((b) => b.quote_line_id === s.lineIds[0]) as Row
    expect(first.hold_at).toBe(new Date(computeHoldAt(pickup, 72).holdAtMs).toISOString())
  })

  it('a custom lead hour count moves hold_at', async () => {
    const s = await seed({ holdLeadHours: 24, suffix: 'LEAD02' })
    await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    const pickup = pickupInstantMs({ pickup_utc: null, pickup_date: '2026-12-20', pickup_time: '08:30' }) as number
    const first = db.state.bookings.find((b) => b.quote_line_id === s.lineIds[0]) as Row
    expect(first.hold_at).toBe(new Date(computeHoldAt(pickup, 24).holdAtMs).toISOString())
  })
})

describe('what is not a deposit of a quote is ignored', () => {
  it('a PaymentIntent that has not succeeded', async () => {
    const s = await seed()
    for (const status of ['requires_payment_method', 'processing', 'requires_action', 'canceled']) {
      const result = await applyQuoteDepositPaid(depositIntent(s, { status } as never), WEBHOOK)
      expect(result.outcome).toBe('ignored')
    }
    expect(convertCalls()).toHaveLength(0)
    expect(db.state.bookings).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
  })

  it('another kind, a missing or malformed quote id, an unknown quote', async () => {
    const s = await seed()
    const good = depositIntent(s).metadata
    const cases: Array<Record<string, string>> = [
      { ...good, kind: 'card_quote_remainder' },
      { ...good, kind: 'card_hold' },
      { kind: 'card_quote_deposit' },
      { ...good, quoteId: 'not-a-uuid' },
      { ...good, quoteId: '00000000-0000-4000-8000-0000000000ff' },
      { ...good, versionId: 'nope' },
    ]
    for (const metadata of cases) {
      const result = await applyQuoteDepositPaid(depositIntent(s, { metadata }), WEBHOOK)
      expect(result.outcome).toBe('ignored')
    }
    expect(convertCalls()).toHaveLength(0)
    expect(db.state.bookings).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
  })
})

// ── Task 2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const quoteRow = (quoteId: string) => db.state.quotes.find((q) => q.id === quoteId) as Row
const eventsOf = (quoteId: string, kind: string) => db.state.quote_events.filter((e) => e.quote_id === quoteId && e.kind === kind)
const refundCalls = () => fake.callsTo('refunds.create')
const mails = () => mockResendSend.mock.calls.map((c) => c[0] as { to: string[]; subject: string; text: string })
const PRIVATE_FRAGMENTS = ['Eva', 'Novakova', 'example.com', 'Letiste', 'Karlovo']

/** Seeds, converts and pays: the state every W2 case starts from. */
async function paidQuote(): Promise<{ s: Seeded; pi: Stripe.PaymentIntent; bookingIds: string[] }> {
  const s = await seed()
  const pi = depositIntent(s)
  const first = await applyQuoteDepositPaid(pi, WEBHOOK)
  expect(first.outcome).toBe('converted')
  // The mails of the first conversion (plan 92-21) are not what these cases count: they start from a paid quote.
  mockResendSend.mockClear()
  return { s, pi, bookingIds: first.bookingIds as string[] }
}

describe('W2: a deposit the quote recorded is never refunded by a replay', () => {
  it('W2: a late cancel with the deposit kept (deposit_refunded_minor 0), then a second succeeded event, answers replayed', async () => {
    const { s, pi, bookingIds } = await paidQuote()
    const cancel = await db.client
      .from('quotes')
      .update({ cancelled_at: '2026-11-20T10:00:00.000Z', cancel_outcome: 'late', cancel_initiator: 'admin_client', deposit_refunded_minor: 0 })
      .eq('id', s.quoteId)
    expect(cancel.error).toBeNull()
    const before = JSON.stringify([db.state.bookings, db.state.quote_events, db.state.booking_payment_events])

    const replay = await applyQuoteDepositPaid(pi, WEBHOOK)

    expect(replay).toEqual({ outcome: 'replayed', bookingIds })
    expect(refundCalls()).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
    expect(eventsOf(s.quoteId, 'orphan_refunded')).toHaveLength(0)
    expect(mockResendSend).not.toHaveBeenCalled()
    expect(bookingsOf(s.quoteId)).toHaveLength(2)
    expect(JSON.stringify([db.state.bookings, db.state.quote_events, db.state.booking_payment_events])).toBe(before)
  })

  it('W2: the same after a free cancel that already returned the whole deposit', async () => {
    const { s, pi, bookingIds } = await paidQuote()
    await db.client
      .from('quotes')
      .update({ cancelled_at: '2026-11-15T10:00:00.000Z', cancel_outcome: 'free', cancel_initiator: 'admin_prestigo', deposit_refunded_minor: 5000 })
      .eq('id', s.quoteId)
    // Stripe shows the refund the cancel made.
    fake.state.paymentIntents.get(pi.id)!.amount_refunded = 5000

    const replay = await applyQuoteDepositPaid(pi, WEBHOOK)

    expect(replay).toEqual({ outcome: 'replayed', bookingIds })
    expect(refundCalls()).toHaveLength(0)
    expect(eventsOf(s.quoteId, 'orphan_refunded')).toHaveLength(0)
    expect(mockResendSend).not.toHaveBeenCalled()
    expect(bookingsOf(s.quoteId)).toHaveLength(2)
  })

  it('W2: the same after a void that followed payment', async () => {
    const { s, pi, bookingIds } = await paidQuote()
    await db.client.from('quotes').update({ status: 'voided', voided_at: '2026-11-21T10:00:00.000Z' }).eq('id', s.quoteId)

    const replay = await applyQuoteDepositPaid(pi, WEBHOOK)

    expect(replay).toEqual({ outcome: 'replayed', bookingIds })
    expect(refundCalls()).toHaveLength(0)
    expect(eventsOf(s.quoteId, 'orphan_refunded')).toHaveLength(0)
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('W2: the same when a new version became current after payment', async () => {
    const { s, pi, bookingIds } = await paidQuote()
    const v2 = await db.client.from('quote_versions').insert({ quote_id: s.quoteId, version_no: 2, locale: 'en', currency: 'eur' }).select('*').single()
    await db.client.from('quotes').update({ current_version_id: (v2.data as { id: string }).id }).eq('id', s.quoteId)

    expect(await applyQuoteDepositPaid(pi, WEBHOOK)).toEqual({ outcome: 'replayed', bookingIds })
    expect(refundCalls()).toHaveLength(0)
  })
})

describe('D-18: a succeeded deposit the quote does not own goes back, once, and the operator is told once', () => {
  async function expectOrphan(s: Seeded, pi: Stripe.PaymentIntent) {
    const bookingsBefore = bookingsOf(s.quoteId).length
    const result = await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(result).toEqual({ outcome: 'orphan_refunded' })

    // Refunded in full, with the fixed key; recorded as orphan_refunded; no booking.
    expect(refundCalls()).toHaveLength(1)
    expect(refundCalls()[0].params).toEqual({ payment_intent: pi.id })
    expect(refundCalls()[0].idempotencyKey).toBe(`refund:quote:${s.quoteId}:orphan:${pi.id}`)
    expect(fake.state.paymentIntents.get(pi.id)!.amount_refunded).toBe(5000)
    const orphan = eventsOf(s.quoteId, 'orphan_refunded')
    expect(orphan).toHaveLength(1)
    expect(orphan[0]).toMatchObject({ stripe_object_id: pi.id, amount_minor: 5000, currency: 'eur', actor_type: 'webhook' })
    expect(bookingsOf(s.quoteId)).toHaveLength(bookingsBefore)
    expect(convertCalls().filter((c) => c.args.p_payment_intent_id === pi.id && c.args.p_quote_id === s.quoteId)).toHaveLength(0)

    // One alert mail: the reference and the admin link, no client details.
    expect(mails()).toHaveLength(1)
    const mail = mails()[0]
    expect(mail.to).toEqual(['owner@example.com'])
    expect(mail.subject).toContain(s.reference)
    expect(mail.text).toContain(s.reference)
    expect(mail.text).toContain(`https://rideprestigo.com/admin/quotes/${s.quoteId}`)
    expect(mail.text).toContain('quote_orphan_refunded')
    for (const fragment of PRIVATE_FRAGMENTS) {
      expect(mail.text).not.toContain(fragment)
      expect(mail.subject).not.toContain(fragment)
    }
    // (the quote_paid alert of a conversion that came earlier, plan 92-21, is not the orphan alert)
    expect(eventsOf(s.quoteId, 'alert_sent').filter((e) => String(e.event_key).startsWith('alert:quote_orphan_refunded'))).toHaveLength(1)

    // A replay refunds nothing more, records nothing more, mails nothing more.
    const again = await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(again).toEqual({ outcome: 'orphan_refunded' })
    expect(refundCalls()).toHaveLength(1)
    expect(eventsOf(s.quoteId, 'orphan_refunded')).toHaveLength(1)
    expect(mails()).toHaveLength(1)
    expect(bookingsOf(s.quoteId)).toHaveLength(bookingsBefore)
  }

  it('a quote voided before it was paid', async () => {
    const s = await seed()
    await db.client.from('quotes').update({ status: 'voided', voided_at: '2026-11-14T11:00:00.000Z' }).eq('id', s.quoteId)
    await expectOrphan(s, depositIntent(s))
  })

  it('a quote cancelled before it was paid', async () => {
    const s = await seed()
    await db.client.from('quotes').update({ cancelled_at: '2026-11-14T11:00:00.000Z' }).eq('id', s.quoteId)
    await expectOrphan(s, depositIntent(s))
  })

  it('a superseded version: version 1 paid while version 2 is current', async () => {
    const s = await seed()
    const v2 = await db.client.from('quote_versions').insert({ quote_id: s.quoteId, version_no: 2, locale: 'en', currency: 'eur' }).select('*').single()
    await db.client.from('quotes').update({ current_version_id: (v2.data as { id: string }).id }).eq('id', s.quoteId)
    await expectOrphan(s, depositIntent(s))
  })

  it('an intent other than the recorded one, on a quote that is still open', async () => {
    const s = await seed()
    await expectOrphan(s, depositIntent(s, { id: 'pi_2' }))
  })

  it('an intent other than the recorded one, on a quote already paid with the first', async () => {
    const { s, bookingIds } = await paidQuote()
    const second = depositIntent(s, { id: 'pi_2' })
    await expectOrphan({ ...s, intent: 'pi_2' }, second)
    // The paid quote and its bookings are untouched.
    expect(db.state.bookings.filter((b) => b.quote_id === s.quoteId).map((b) => b.id).sort()).toEqual([...bookingIds].sort())
    expect(quoteRow(s.quoteId).deposit_payment_intent_id).toBe('pi_1')
    // The pi_1 refund count stays zero: only pi_2 went back.
    expect(refundCalls().every((c) => c.params.payment_intent === 'pi_2')).toBe(true)
  })

  it('a race the code can not see: the database answers voided / cancelled / intent_mismatch / version_mismatch for an owned-looking payment', async () => {
    for (const reason of ['voided', 'cancelled', 'intent_mismatch', 'version_mismatch']) {
      db = createFakePaymentsDb({ nowMs: NOW })
      fake = createFakeStripe()
      world.db = db
      world.stripe = fake
      mockResendSend.mockClear()
      const s = await seed({ suffix: reason === 'voided' ? 'RACE01' : reason === 'cancelled' ? 'RACE02' : reason === 'intent_mismatch' ? 'RACE03' : 'RACE04' })
      world.rpcAnswer = { converted: false, reason }
      const result = await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
      expect(result, reason).toEqual({ outcome: 'orphan_refunded' })
      expect(refundCalls(), reason).toHaveLength(1)
      expect(eventsOf(s.quoteId, 'orphan_refunded'), reason).toHaveLength(1)
      expect(eventsOf(s.quoteId, 'convert_failed'), reason).toHaveLength(0)
      expect(mails(), reason).toHaveLength(1)
    }
  })

  it('a refund that fails is recorded and alerted once, throws so Stripe retries, and the retry refunds', async () => {
    const s = await seed()
    await db.client.from('quotes').update({ status: 'voided', voided_at: '2026-11-14T11:00:00.000Z' }).eq('id', s.quoteId)
    const pi = depositIntent(s)
    fake.failNextWithError('refunds.create', new FakeStripeError('StripeAPIError', 'down', { code: 'api_error', statusCode: 500 }))

    await expect(applyQuoteDepositPaid(pi, WEBHOOK)).rejects.toThrow()
    expect(eventsOf(s.quoteId, 'orphan_refunded')).toHaveLength(0)
    const failed = eventsOf(s.quoteId, 'refund_failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ stripe_object_id: 'pi_1', error_code: 'api_error' })
    expect(mails()).toHaveLength(1)
    expect(mails()[0].text).toContain('quote_refund_failed')

    // Stripe delivers the event again: the refund goes through, the failure alert is not repeated.
    await expect(applyQuoteDepositPaid(pi, WEBHOOK)).resolves.toEqual({ outcome: 'orphan_refunded' })
    expect(eventsOf(s.quoteId, 'orphan_refunded')).toHaveLength(1)
    expect(fake.state.paymentIntents.get('pi_1')!.amount_refunded).toBe(5000)
    expect(eventsOf(s.quoteId, 'refund_failed')).toHaveLength(1)
    expect(mails().filter((m) => m.text.includes('quote_refund_failed'))).toHaveLength(1)
    expect(mails().filter((m) => m.text.includes('quote_orphan_refunded'))).toHaveLength(1)
  })
})

describe('a conversion that fails inside the database: money taken, no bookings', () => {
  it('records convert_failed once, alerts once, throws; the retry after the fix converts', async () => {
    const s = await seed()
    const pi = depositIntent(s)
    world.rpcFailures = 2

    await expect(applyQuoteDepositPaid(pi, WEBHOOK)).rejects.toThrow('quote conversion failed')
    expect(eventsOf(s.quoteId, 'convert_failed')).toHaveLength(1)
    expect(eventsOf(s.quoteId, 'convert_failed')[0]).toMatchObject({ stripe_object_id: 'pi_1', amount_minor: 5000, currency: 'eur' })
    expect(mails()).toHaveLength(1)
    expect(mails()[0].text).toContain('quote_convert_failed')
    expect(mails()[0].text).toContain(`/admin/quotes/${s.quoteId}`)
    expect(bookingsOf(s.quoteId)).toHaveLength(0)
    // The database message ("secret detail") never reaches an event, a mail or the thrown error.
    expect(JSON.stringify(db.state.quote_events)).not.toContain('secret detail')
    expect(mails()[0].text).not.toContain('secret detail')

    // The retry fails again: still one event, still one alert, still an error.
    await expect(applyQuoteDepositPaid(pi, WEBHOOK)).rejects.toThrow()
    expect(eventsOf(s.quoteId, 'convert_failed')).toHaveLength(1)
    expect(mails()).toHaveLength(1)

    // The cause is fixed: the next delivery converts, with no refund and no further alert.
    const ok = await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(ok.outcome).toBe('converted')
    expect(bookingsOf(s.quoteId)).toHaveLength(2)
    expect(refundCalls()).toHaveLength(0)
    // The conversion's own mails (plan 92-21) are new; the failure alert is still the one it was.
    expect(mails().filter((m) => m.text?.includes('quote_convert_failed'))).toHaveLength(1)
  })

  it('a refusal that is not about ownership (not_accepted, lines_mismatch, hold_at_missing) is a conversion failure, not a refund', async () => {
    for (const reason of ['not_accepted', 'lines_mismatch', 'hold_at_missing']) {
      db = createFakePaymentsDb({ nowMs: NOW })
      fake = createFakeStripe()
      world.db = db
      world.stripe = fake
      mockResendSend.mockClear()
      const s = await seed({ suffix: reason === 'not_accepted' ? 'FAIL01' : reason === 'lines_mismatch' ? 'FAIL02' : 'FAIL03' })
      world.rpcAnswer = { converted: false, reason }
      await expect(applyQuoteDepositPaid(depositIntent(s), WEBHOOK), reason).rejects.toThrow()
      expect(eventsOf(s.quoteId, 'convert_failed'), reason).toHaveLength(1)
      expect(eventsOf(s.quoteId, 'convert_failed')[0].error_code, reason).toBe(reason)
      expect(refundCalls(), reason).toHaveLength(0)
      expect(mails(), reason).toHaveLength(1)
    }
  })
})

describe('sendQuoteOperatorAlert', () => {
  const quote = { id: '00000000-0000-4000-8000-0000000000aa', reference: 'Q-20261114-ALERT1' }
  const seedQuote = async () => {
    const res = await db.client
      .from('quotes')
      .insert({ ...quote, client_first_name: 'Eva', client_last_name: 'Novakova', client_email: 'eva@example.com', lead_channel: 'email' })
      .select('*')
      .single()
    expect(res.error).toBeNull()
  }

  it('the kinds are exactly the documented list', () => {
    expect([...QUOTE_ALERT_KINDS]).toEqual([
      'quote_paid',
      'quote_orphan_refunded',
      'quote_convert_failed',
      'quote_refund_failed',
      'quote_remainder_mismatch',
      'quote_dispute',
      'quote_payment_failed',
    ])
  })

  it('sends an English mail with the kind, reference, admin link, amount and code, claimed once by its event key', async () => {
    await seedQuote()
    const details = { eventKey: 'alert:quote_dispute:dp_1', code: 'fraudulent', amountMinor: 12345, currency: 'czk' as const }
    expect(await sendQuoteOperatorAlert('quote_dispute', quote, details)).toBe('sent')
    expect(mails()).toHaveLength(1)
    const mail = mails()[0]
    expect(mail.subject).toContain(quote.reference)
    expect(mail.text).toContain(`Quote reference: ${quote.reference}`)
    expect(mail.text).toContain('quote_dispute')
    expect(mail.text).toContain(`https://rideprestigo.com/admin/quotes/${quote.id}`)
    expect(mail.text).toContain('fraudulent')
    expect(mail.text).toMatch(/123,45/)
    expect(eventsOf(quote.id, 'alert_sent')).toHaveLength(1)
    expect(eventsOf(quote.id, 'alert_sent')[0].event_key).toBe(details.eventKey)

    expect(await sendQuoteOperatorAlert('quote_dispute', quote, details)).toBe('duplicate')
    expect(mails()).toHaveLength(1)
    // Another key is another alert.
    expect(await sendQuoteOperatorAlert('quote_dispute', quote, { ...details, eventKey: 'alert:quote_dispute:dp_2' })).toBe('sent')
    expect(mails()).toHaveLength(2)
  })

  it('without MANAGER_EMAIL nothing is sent and nothing is claimed', async () => {
    await seedQuote()
    delete process.env.MANAGER_EMAIL
    expect(await sendQuoteOperatorAlert('quote_paid', quote, { eventKey: 'alert:quote_paid:1' })).toBe('failed')
    expect(mockResendSend).not.toHaveBeenCalled()
    expect(eventsOf(quote.id, 'alert_sent')).toHaveLength(0)
  })

  it('a Resend failure answers failed, leaves one send_failed row and no delivered claim; a later call sends it', async () => {
    await seedQuote()
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'rejected' } })
    expect(await sendQuoteOperatorAlert('quote_paid', quote, { eventKey: 'alert:quote_paid:1' })).toBe('failed')
    expect(eventsOf(quote.id, 'alert_sent').map((e) => e.event_key)).toEqual(['alert:quote_paid:1:send_failed'])

    mockResendSend.mockResolvedValue({ data: { id: 'em_2' }, error: null })
    expect(await sendQuoteOperatorAlert('quote_paid', quote, { eventKey: 'alert:quote_paid:1' })).toBe('sent')
    expect(eventsOf(quote.id, 'alert_sent').map((e) => e.event_key).sort()).toEqual(['alert:quote_paid:1', 'alert:quote_paid:1:send_failed'])
  })

  it('every try of one alert carries its event key as the Resend idempotency key', async () => {
    await seedQuote()
    await sendQuoteOperatorAlert('quote_payment_failed', quote, { eventKey: 'alert:quote_payment_failed:pi_9' })
    expect(mockResendSend.mock.calls[0][1]).toEqual({ idempotencyKey: 'alert:quote_payment_failed:pi_9' })
  })
})
