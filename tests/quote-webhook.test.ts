// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 92 plan 92-31 (QUOTE-03, QUOTE-05; D-18; T-92-57, T-92-60, T-92-99): the quote payment events through the REAL webhook
 * route (signature check stubbed, everything behind it real). A card_quote_deposit event reaches the quote handler and never the
 * legacy chain that builds a booking from payment_intent.succeeded; failures and cancellations of quote payments never reach the
 * hold-failure handler; a handler throw answers 500 so Stripe redelivers; a replayed event answers 200 and moves no money.
 * The conversion core itself is covered by tests/quote-convert.test.ts; Resend and Stripe are doubles.
 */

const { stripeStub, world, mockHoldFailed, mockHoldCanceled, mockResendSend, legacy } = vi.hoisted(() => ({
  stripeStub: { constructEvent: vi.fn() },
  world: {
    db: null as unknown as FakePaymentsDb,
    stripe: null as unknown,
    processed: new Set<string>(),
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Number of upcoming quote_convert_to_bookings calls that answer a database error. */
    rpcFailures: 0,
  },
  mockHoldFailed: vi.fn(),
  mockHoldCanceled: vi.fn(),
  mockResendSend: vi.fn(),
  legacy: {
    saveBooking: vi.fn(),
    buildBookingRow: vi.fn(),
    buildBookingRows: vi.fn(),
    saveRoundTripBookings: vi.fn(),
    reconcileBookingToConfirmed: vi.fn(),
    reconcileRoundTripToConfirmed: vi.fn(),
    reconcileBookingByIdToConfirmed: vi.fn(),
  },
}))

process.env.RESEND_API_KEY = 're_test'

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => void fn() }
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
    saveBooking: legacy.saveBooking,
    withRetry: (fn: () => Promise<unknown>) => fn(),
    buildBookingRow: legacy.buildBookingRow,
    buildBookingRows: legacy.buildBookingRows,
    saveRoundTripBookings: legacy.saveRoundTripBookings,
    reconcileBookingToConfirmed: legacy.reconcileBookingToConfirmed,
    reconcileRoundTripToConfirmed: legacy.reconcileRoundTripToConfirmed,
    reconcileBookingByIdToConfirmed: legacy.reconcileBookingByIdToConfirmed,
    createSupabaseServiceClient: () => ({
      from: (table: string) => (table === 'stripe_processed_events' ? processedTable : world.db.client.from(table)),
      rpc: async (name: string, args?: Record<string, unknown>) => {
        world.rpcCalls.push({ name, args: args ?? {} })
        if (name === 'quote_convert_to_bookings' && world.rpcFailures > 0) {
          world.rpcFailures -= 1
          return { data: null, error: { message: 'connection reset (secret detail)', code: '08006' } }
        }
        return world.db.client.rpc(name, args)
      },
    }),
  }
})

vi.mock('@/lib/booking-status-service', () => ({ advanceBookingStatus: vi.fn() }))
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
  getPaymentsStripe: () => (world.stripe as FakeStripe).stripe,
}))
// The hold handlers are spies: no quote payment may ever reach them.
vi.mock('@/lib/stripe-webhook/hold-events', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/stripe-webhook/hold-events')>()),
  handleHoldFailed: mockHoldFailed,
  handleHoldCanceled: mockHoldCanceled,
}))
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))
vi.mock('@/lib/ics', () => ({ buildIcs: vi.fn().mockReturnValue('STUB-ICS') }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: vi.fn().mockResolvedValue(true) }))
vi.mock('stripe', () => ({
  default: function MockStripe() {
    return { webhooks: stripeStub }
  },
}))

import { POST } from '@/app/api/webhooks/stripe/route'
import { classifyPaymentEvent } from '@/lib/stripe-webhook/dispatch'
import { quoteMetadata } from '@/lib/payments/stripe'
import { computeHoldAt } from '@/lib/payments/timing'
import { pickupInstantMs } from '@/lib/prague-date'
import type Stripe from 'stripe'

type Row = Record<string, unknown>

const HASH = 'c'.repeat(64)

let db: FakePaymentsDb
let fake: FakeStripe

interface Seeded {
  quoteId: string
  versionId: string
  lineIds: string[]
  intent: string
  reference: string
}

/** An accepted quote with a frozen two-line saved-card version (lines 3000+7000 and 2000+0) and the acceptance owning `intent`. */
async function seed(suffix = 'AAAAAA', intent = 'pi_1'): Promise<Seeded> {
  const c = db.client
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
      remainder_method: 'saved_card',
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
    hold_lead_hours: 72,
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
    })
    .eq('id', quoteId)
  expect(upd.error).toBeNull()
  return { quoteId, versionId, lineIds, intent, reference }
}

/** A succeeded deposit PaymentIntent of the seeded quote, also in the Stripe double. */
function depositIntent(s: Seeded, over: Record<string, unknown> = {}): Stripe.PaymentIntent {
  const pi = {
    id: s.intent,
    object: 'payment_intent',
    status: 'succeeded',
    amount: 5000,
    amount_received: 5000,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_1',
    metadata: quoteMetadata('card_quote_deposit', { quoteId: s.quoteId, versionId: s.versionId, quoteReference: s.reference }),
    ...over,
  } as unknown as Stripe.PaymentIntent
  fake.state.paymentIntents.set(pi.id, { ...pi, amount_refunded: 0 } as never)
  return pi
}

const eventOf = (type: string, object: unknown, id = 'evt_1') => ({ id, type, data: { object } })
const makeRequest = (): Request =>
  new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'valid-sig' }, body: 'raw-body' })
async function deliver(event: unknown) {
  stripeStub.constructEvent.mockReturnValue(event)
  const res = await POST(makeRequest())
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

const bookingsOf = (quoteId: string) => db.state.bookings.filter((b) => b.quote_id === quoteId)
const quoteEvents = (quoteId: string, kind?: string) =>
  db.state.quote_events.filter((e) => e.quote_id === quoteId && (kind ? e.kind === kind : true))
const convertCalls = () => world.rpcCalls.filter((c) => c.name === 'quote_convert_to_bookings')
const legacyCalls = () => Object.values(legacy).reduce((n, spy) => n + spy.mock.calls.length, 0)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MANAGER_EMAIL = 'owner@example.com'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  mockHoldFailed.mockResolvedValue(undefined)
  mockHoldCanceled.mockResolvedValue(undefined)
  db = createFakePaymentsDb()
  fake = createFakeStripe()
  world.db = db
  world.stripe = fake
  world.processed.clear()
  world.rpcCalls = []
  world.rpcFailures = 0
})

describe('classification: a quote deposit is routed, never null and never unrouted', () => {
  it('payment_intent.succeeded with kind card_quote_deposit is quote_deposit_paid', () => {
    const e = eventOf('payment_intent.succeeded', { id: 'pi_1', metadata: { kind: 'card_quote_deposit', quoteId: 'q' } })
    expect(classifyPaymentEvent(e as unknown as Stripe.Event)).toMatchObject({ route: 'quote_deposit_paid', kind: 'card_quote_deposit' })
  })

  it('the other kinds keep their routes (the remainder stays unrouted until 92-23)', () => {
    const kinds: Array<[string, string, string]> = [
      ['payment_intent.succeeded', 'card_hold', 'charge_succeeded'],
      ['payment_intent.succeeded', 'card_recovery', 'recovery_paid'],
      ['payment_intent.succeeded', 'card_quote_remainder', 'unrouted'],
      ['payment_intent.payment_failed', 'card_hold', 'pi_failed'],
      ['payment_intent.payment_failed', 'card_charge', 'pi_failed'],
      ['payment_intent.canceled', 'card_hold', 'pi_canceled'],
    ]
    for (const [type, kind, route] of kinds) {
      expect(classifyPaymentEvent(eventOf(type, { metadata: { kind } }) as unknown as Stripe.Event)?.route, `${type} ${kind}`).toBe(route)
    }
    // A plain checkout PaymentIntent (no card kind) is still not a card event.
    expect(classifyPaymentEvent(eventOf('payment_intent.succeeded', { metadata: { bookingReference: 'PRG-1' } }) as unknown as Stripe.Event)).toBeNull()
  })
})

describe('tracer: a deposit event converts the quote through the real webhook route', () => {
  it('two saved-card lines become two card_hold bookings with hold_at; the legacy chain is never called (Pitfall 1)', async () => {
    const s = await seed()
    const res = await deliver(eventOf('payment_intent.succeeded', depositIntent(s)))

    expect(res.status).toBe(200)
    expect(res.json).toEqual({ received: true })
    const rows = bookingsOf(s.quoteId)
    expect(rows).toHaveLength(2)
    const first = rows.find((b) => b.quote_line_id === s.lineIds[0]) as Row
    const second = rows.find((b) => b.quote_line_id === s.lineIds[1]) as Row
    const pickup = pickupInstantMs({ pickup_utc: null, pickup_date: '2026-12-20', pickup_time: '08:30' }) as number
    expect(first).toMatchObject({
      payment_mode: 'card_hold',
      payment_state: 'card_saved',
      payment_amount_minor: 7000,
      hold_at: new Date(computeHoldAt(pickup, 72).holdAtMs).toISOString(),
    })
    expect(first.payment_intent_id).toBeNull()
    expect(second).toMatchObject({ payment_mode: 'quote', payment_state: 'none', hold_at: null })
    expect(second.payment_intent_id).toBeNull()

    // The conversion ran with the webhook actor and the event id.
    expect(convertCalls()).toHaveLength(1)
    expect(convertCalls()[0].args).toMatchObject({ p_actor_type: 'webhook', p_actor_id: 'evt_1' })
    // Pitfall 1: no booking was built from the PaymentIntent metadata by the legacy chain, and no hold handler ran.
    expect(legacyCalls()).toBe(0)
    expect(mockHoldFailed).not.toHaveBeenCalled()
    // The event id is claimed once the side effect is done.
    expect(world.processed.has('evt_1')).toBe(true)
  })

  it('a second delivery of the same event answers duplicate and creates nothing', async () => {
    const s = await seed()
    const event = eventOf('payment_intent.succeeded', depositIntent(s))
    await deliver(event)
    const again = await deliver(event)
    expect(again.status).toBe(200)
    expect(again.json).toMatchObject({ duplicate: true })
    expect(bookingsOf(s.quoteId)).toHaveLength(2)
    expect(convertCalls()).toHaveLength(1)
    expect(legacyCalls()).toBe(0)
  })

  it('a NEW event id for the same paid intent answers 200 replayed: same bookings, nothing created, no Stripe call', async () => {
    const s = await seed()
    await deliver(eventOf('payment_intent.succeeded', depositIntent(s), 'evt_1'))
    const ids = bookingsOf(s.quoteId).map((b) => b.id)
    fake.calls.length = 0

    const again = await deliver(eventOf('payment_intent.succeeded', depositIntent(s), 'evt_2'))
    expect(again.status).toBe(200)
    expect(again.json).toEqual({ received: true })
    expect(bookingsOf(s.quoteId).map((b) => b.id)).toEqual(ids)
    expect(convertCalls()).toHaveLength(1)
    expect(fake.calls).toHaveLength(0)
    expect(legacyCalls()).toBe(0)
  })

  it('W2: after the quote is cancelled with the deposit kept, a new event for the succeeded intent creates nothing and refunds nothing', async () => {
    const s = await seed()
    await deliver(eventOf('payment_intent.succeeded', depositIntent(s), 'evt_1'))
    const quote = db.state.quotes.find((q) => q.id === s.quoteId) as Row
    expect(quote.paid_at).toBeTruthy()
    Object.assign(quote, { cancelled_at: new Date().toISOString(), cancel_outcome: 'late', deposit_refunded_minor: 0 })
    fake.calls.length = 0
    const snapshot = JSON.stringify([db.state.bookings, db.state.quote_events])

    const again = await deliver(eventOf('payment_intent.succeeded', depositIntent(s), 'evt_late'))
    expect(again.status).toBe(200)
    expect(JSON.stringify([db.state.bookings, db.state.quote_events])).toBe(snapshot)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
    expect(quoteEvents(s.quoteId, 'orphan_refunded')).toHaveLength(0)
    expect(legacyCalls()).toBe(0)
  })

  it('a deposit for a quote the site does not know is acknowledged 200 without a write and without the legacy chain', async () => {
    const stray = {
      id: 'pi_stray',
      object: 'payment_intent',
      status: 'succeeded',
      amount: 5000,
      currency: 'eur',
      metadata: {
        kind: 'card_quote_deposit',
        quoteId: '99999999-9999-4999-8999-999999999999',
        versionId: '88888888-8888-4888-8888-888888888888',
        quoteReference: 'Q-X',
      },
    }
    const res = await deliver(eventOf('payment_intent.succeeded', stray))
    expect(res.status).toBe(200)
    expect(db.state.bookings).toHaveLength(0)
    expect(convertCalls()).toHaveLength(0)
    expect(legacyCalls()).toBe(0)
  })

  it('malformed deposit metadata (no versionId) is acknowledged 200 and never reaches the legacy chain', async () => {
    const s = await seed()
    const bad = depositIntent(s, { metadata: { kind: 'card_quote_deposit', quoteId: s.quoteId, bookingId: 'legacy-key', tripType: 'one_way' } })
    const res = await deliver(eventOf('payment_intent.succeeded', bad))
    expect(res.status).toBe(200)
    expect(bookingsOf(s.quoteId)).toHaveLength(0)
    expect(legacyCalls()).toBe(0)
  })

  it('an RPC error inside the conversion answers 500 (Stripe retries); the retry after the error is fixed converts', async () => {
    const s = await seed()
    world.rpcFailures = 1
    const event = eventOf('payment_intent.succeeded', depositIntent(s))

    const failed = await deliver(event)
    expect(failed.status).toBe(500)
    expect(bookingsOf(s.quoteId)).toHaveLength(0)
    // The event id was NOT claimed: Stripe's redelivery runs the handler again.
    expect(world.processed.has('evt_1')).toBe(false)
    expect(legacyCalls()).toBe(0)
    expect(JSON.stringify(failed.json)).not.toContain('secret detail')

    const retry = await deliver(event)
    expect(retry.status).toBe(200)
    expect(bookingsOf(s.quoteId)).toHaveLength(2)
    expect(legacyCalls()).toBe(0)
  })
})
