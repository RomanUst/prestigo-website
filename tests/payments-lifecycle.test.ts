// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 88 plan 88-17 (tracer; PAYF-04, PAYF-05, HOLD-01..05, HOLD-07, MAIL-01, PAYF-01, PAYF-03): the whole card
 * lifecycle end to end, through the REAL route handlers and engine modules, over the in-memory payments DB and the
 * fake Stripe. No per-step mock of the engine: the only doubles are the outside world (Stripe, the database, Resend,
 * QStash, GA4, the operator mail, the admin session) and a virtual clock.
 *
 *   SC1  init -> intent (setup) -> setup_intent.succeeded -> confirmed + card_saved + card_saved email
 *   SC2  clock to hold_at -> payment tick -> authorized + hold_placed email
 *   SC3  admin PATCH status completed -> emitBookingCompleted -> settle -> captured + charged email
 *   SC4  admin GET shows the state and the ledger newest first
 *        the same path with an expired hold -> fallback charge; with a declined fallback -> failed + recovery link +
 *        client email + operator alert; paying the link -> captured
 *        a partner (gnet) or pay-now booking never gets a Stripe call through any entry point
 */

process.env.CRON_SECRET = 'lifecycle-cron-secret'
process.env.RESEND_API_KEY = 're_test'
process.env.MANAGER_EMAIL = 'ops@example.com'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

const { world, stripeStub, afterQueue, rateLimitMock, pricingConfigMock, resendSend, managerAlert, ga4, qstash, deactivate } = vi.hoisted(
  () => ({
    world: {
      client: null as unknown,
      stripe: null as unknown,
      processed: new Set<string>(),
    },
    stripeStub: { constructEvent: vi.fn() },
    afterQueue: [] as Promise<unknown>[],
    rateLimitMock: vi.fn(),
    pricingConfigMock: vi.fn(),
    resendSend: vi.fn(),
    managerAlert: vi.fn(),
    ga4: vi.fn(),
    qstash: vi.fn(),
    deactivate: vi.fn(),
  }),
)

// The service client of every module (lib/supabase, state.ts, config.ts ...) is built by createClient.
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => world.client) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })),
  getAdminUser: vi.fn().mockResolvedValue({ user: { id: 'admin-1' }, error: null }),
}))
vi.mock('@/lib/pricing-config', () => ({ getPricingConfig: pricingConfigMock }))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: rateLimitMock,
}))
vi.mock('@/lib/payments/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/stripe-payment-links', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe-payment-links')>()),
  deactivateBookingPaymentLink: deactivate,
}))

// after() callbacks are collected and awaited by flushAfter(), so the settle that follows a completion is deterministic.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => {
      afterQueue.push(Promise.resolve().then(fn).catch(() => undefined))
    },
  }
})

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSend }
  },
}))
vi.mock('stripe', () => ({
  default: function MockStripe() {
    return { webhooks: stripeStub }
  },
}))
// The real module stays (render + calendar link import from it); only the operator-facing senders are spies.
vi.mock('@/lib/email', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/email')>()),
  sendManagerAlert: managerAlert,
  sendStatusConfirmedEmail: vi.fn().mockResolvedValue(undefined),
  sendStatusCancelledEmail: vi.fn().mockResolvedValue(undefined),
  sendPostTripEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/email-log', () => ({ logEmail: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: qstash }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: ga4 }))

import { POST as initPOST } from '@/app/api/card-checkout/init/route'
import { POST as intentPOST } from '@/app/api/card-checkout/intent/route'
import { POST as webhookPOST } from '@/app/api/webhooks/stripe/route'
import { GET as tickGET } from '@/app/api/cron/payment-tick/route'
import { PATCH as adminPATCH } from '@/app/api/admin/bookings/route'
import { GET as paymentGET } from '@/app/api/admin/bookings/[id]/payment/route'
import { placeHold, releaseHold } from '@/lib/payments/hold'
import { settleBooking } from '@/lib/payments/settle'
import { handlePaymentFailure } from '@/lib/payments/recovery'
import { reevaluateAfterEdit } from '@/lib/payments/edit-hook'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { computeCombinedTotalMinor, computeOutboundLegTotal } from '@/lib/server-pricing'
import { cardMetadata } from '@/lib/payments/stripe'
import type { PricingRates } from '@/lib/pricing-config'

type Row = Record<string, unknown>

const PRICING: PricingRates = {
  ratePerKm: { business: 2.5, first_class: 3.5, business_van: 3.0 },
  hourlyRate: { business: 20, first_class: 30, business_van: 25 },
  dailyRate: { business: 150, first_class: 250, business_van: 200 },
  minFare: { business: 30, first_class: 50, business_van: 40 },
  globals: {
    airportFee: 10,
    nightCoefficient: 1.3,
    holidayCoefficient: 1.2,
    extraChildSeat: 10,
    extraLuggage: 5,
    holidayDates: [],
    returnDiscountPercent: 10,
    hourlyMinHours: 2,
    hourlyMaxHours: 8,
    notificationFlags: null,
    airportPromoActive: false,
    airportRegularPriceEur: 0,
    airportPromoPriceEur: 0,
  },
}

// Virtual timeline. Pickup 2027-01-16 10:00 Prague (09:00Z); hold lead 72 h -> hold_at 2027-01-13 09:00Z.
const NOW0 = Date.parse('2027-01-10T09:00:00Z')
const PICKUP_UTC = '2027-01-16T09:00:00.000Z'
const PICKUP_MS = Date.parse(PICKUP_UTC)
const HOLD_AT = '2027-01-13T09:00:00.000Z'
const HOLD_AT_MS = Date.parse(HOLD_AT)
const MINUTE = 60_000
const HOUR = 3_600_000

const OWNER = 'owner@example.com'
const MANAGER = 'ops@example.com'
const ATTEMPT = '11111111-1111-4111-8111-111111111111'

let db: FakePaymentsDb
let fake: FakeStripe

// ── doubles ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The compare-and-set the real advance_booking_status RPC (migration 084) performs, on the fake rows. */
function advanceStatusRpc(args: Row) {
  const b = db.state.bookings.find((r) => r.id === args.p_booking_id)
  if (!b) return { data: { applied: false, current_status: null }, error: null }
  if (b.status !== args.p_from) return { data: { applied: false, current_status: b.status }, error: null }
  b.status = args.p_to
  if (args.p_to === 'completed' && !b.completed_at) b.completed_at = new Date().toISOString()
  return { data: { applied: true, booking: { ...b } }, error: null }
}

/** Tables and RPCs the payments fake does not model: processed webhook events, promo codes, the status CAS. */
function lifecycleClient(target: FakePaymentsDb) {
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
  const promoTable = (() => {
    const b = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: null, error: null }) }
    return b
  })()
  return {
    rpc: async (name: string, args: Row = {}) => {
      if (name === 'advance_booking_status') return advanceStatusRpc(args)
      if (name === 'claim_promo_code') return { data: null, error: null }
      return target.client.rpc(name, args)
    },
    from: (table: string) => {
      if (table === 'stripe_processed_events') return processedTable
      if (table === 'promo_codes') return promoTable
      return target.client.from(table)
    },
  }
}

function useDb(next: FakePaymentsDb) {
  db = next
  world.client = lifecycleClient(next)
}

function setNow(ms: number) {
  vi.setSystemTime(ms)
  db.state.nowMs = ms
}

async function flushAfter() {
  while (afterQueue.length) await Promise.all(afterQueue.splice(0))
}

// ── request helpers ────────────────────────────────────────────────────────────────────────────────────────────────

function serverAmount(): number {
  const outbound = computeOutboundLegTotal('business', 50, 2, 1, 'transfer', '2027-01-16', '10:00', false, PRICING)
  return computeCombinedTotalMinor({ outboundLegEur: outbound, extrasEur: 0, returnLegEur: 0, promoPct: 0, currency: 'eur' }).stripeAmountMinor
}

function bookingData() {
  return {
    tripType: 'transfer',
    vehicleClass: 'business',
    distanceKm: '50',
    pickupDate: '2027-01-16',
    pickupTime: '10:00',
    passengers: '2',
    firstName: 'Anna',
    lastName: 'Novak',
    email: OWNER,
    phone: '+420725986855',
    locale: 'en',
    originAddress: 'Prague Airport',
    destinationAddress: 'Hotel Aria',
    attemptId: ATTEMPT,
  }
}

function jsonRequest(url: string, payload: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (lifecycle)' },
    body: JSON.stringify(payload),
  })
}

async function deliver(event: unknown) {
  stripeStub.constructEvent.mockReturnValue(event)
  const res = await webhookPOST(
    new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'valid-sig' }, body: 'raw-body' }),
  )
  await flushAfter()
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function runTick() {
  const res = await tickGET(
    new Request('https://example.test/api/cron/payment-tick', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }),
  )
  await flushAfter()
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function completeTrip(id: string) {
  const res = await adminPATCH(
    jsonRequest('http://localhost/api/admin/bookings', { id, status: 'completed', expected_status: 'confirmed' }, 'PATCH'),
  )
  await flushAfter()
  return res
}

async function adminPaymentView(id: string) {
  const res = await paymentGET(new Request(`http://localhost/api/admin/bookings/${id}/payment`), { params: Promise.resolve({ id }) })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

// ── world readers ──────────────────────────────────────────────────────────────────────────────────────────────────

const rowOf = (id: string) => db.state.bookings.find((b) => b.id === id)!
const ledger = (id: string) => db.state.booking_payment_events.filter((e) => e.booking_id === id)
/** The money-relevant ledger kinds in order, without the email / alert claim rows. */
const moneyKinds = (id: string) => ledger(id).map((e) => e.kind as string).filter((k) => k !== 'email_sent' && k !== 'alert_sent')
const emailKeys = (id: string) =>
  ledger(id)
    .filter((e) => e.kind === 'email_sent' && !String(e.event_key).endsWith(':send_failed'))
    .map((e) => e.event_key as string)
const mailsTo = (addr: string) => resendSend.mock.calls.filter((c) => ((c[0] as { to: string[] }).to ?? []).includes(addr))
const piCreates = () => fake.callsTo('paymentIntents.create')

// ── flow steps ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** init -> intent: one unpaid card_hold booking, a SetupIntent, nothing charged. */
async function startBooking() {
  const init = await initPOST(jsonRequest('http://localhost/api/card-checkout/init', { bookingData: bookingData(), currency: 'eur' }))
  expect(await init.json()).toMatchObject({ eligible: true, mode: 'setup', holdDateIso: '2027-01-13', currency: 'eur', amountMinor: serverAmount() })

  const res = await intentPOST(
    jsonRequest('http://localhost/api/card-checkout/intent', {
      bookingData: bookingData(),
      currency: 'eur',
      mode: 'setup',
      consent: true,
      displayedAmountMinor: serverAmount(),
    }),
  )
  expect(res.status).toBe(200)
  const out = (await res.json()) as Record<string, unknown>
  expect(out).toMatchObject({ mode: 'setup', amountMinor: serverAmount() })

  const booking = db.state.bookings[0]
  // pickup_utc is a GENERATED column of the live table (D-22); the fake does not generate it.
  booking.pickup_utc = PICKUP_UTC
  return { id: booking.id as string, reference: out.bookingReference as string, setupIntentId: booking.setup_intent_id as string }
}

/** The browser confirmed the SetupIntent with a good card; Stripe sends setup_intent.succeeded. */
async function saveCard(setupIntentId: string) {
  const si = fake.state.setupIntents.get(setupIntentId)!
  Object.assign(si, { status: 'succeeded', payment_method: 'pm_ok' })
  const event = fake.buildEvent('setup_intent.succeeded', si)
  const result = await deliver(event)
  expect(result.status).toBe(200)
  return event
}

/** Booking saved with a card, clock at hold_at + 1 min, the tick placed the hold. */
async function bookAndHold() {
  const t = await startBooking()
  setNow(NOW0 + 5 * MINUTE)
  await saveCard(t.setupIntentId)
  setNow(HOLD_AT_MS + MINUTE)
  const tick = await runTick()
  expect(tick.json).toMatchObject({ ok: true, placed: 1, errors: [] })
  const holdId = rowOf(t.id).hold_payment_intent_id as string
  expect(holdId).toMatch(/^pi_/)
  return { ...t, holdId, amount: serverAmount() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW0)
  afterQueue.length = 0
  world.processed.clear()
  fake = createFakeStripe({ nowSec: () => Math.floor(Date.now() / 1000) })
  world.stripe = fake.stripe
  const fresh = createFakePaymentsDb({ nowMs: NOW0 })
  Object.assign(fresh.state.pricing_globals[0], {
    card_flow_mode: 'canary',
    card_flow_canary_emails: [OWNER],
    payment_hold_lead_hours: 72,
  })
  useDb(fresh)
  pricingConfigMock.mockResolvedValue(PRICING)
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  resendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  managerAlert.mockResolvedValue(undefined)
  ga4.mockResolvedValue(true)
  qstash.mockResolvedValue(undefined)
  deactivate.mockImplementation(async (id: string) => {
    await fake.stripe.paymentLinks.update(id, { active: false })
  })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('tracer: save card -> scheduled hold -> trip completed -> capture (SC1-SC4)', () => {
  it('runs the whole lifecycle through the real routes with exactly one hold, one capture and three client emails', async () => {
    // ── SC1: init + intent (setup). Nothing charged, one unpaid card_hold booking, consent stored.
    const t = await startBooking()
    const amount = serverAmount()
    let b = rowOf(t.id)
    expect(b).toMatchObject({ status: 'unpaid', payment_mode: 'card_hold', payment_state: 'checkout_pending', payment_intent_id: null, hold_at: HOLD_AT })
    expect(piCreates()).toHaveLength(0)
    expect(moneyKinds(t.id)).toEqual(['setup_started'])
    expect(db.state.booking_payment_consents).toHaveLength(1)
    expect(db.state.booking_payment_consents[0]).toMatchObject({ booking_id: t.id, mode: 'setup', text_version: expect.any(String), text_sha256: expect.any(String) })

    // ── SC1: the card is saved. setup_intent.succeeded confirms the booking in place, once.
    setNow(NOW0 + 5 * MINUTE)
    const savedEvent = await saveCard(t.setupIntentId)
    b = rowOf(t.id)
    expect(b).toMatchObject({
      status: 'confirmed',
      payment_state: 'card_saved',
      payment_intent_id: null,
      stripe_payment_method_id: 'pm_ok',
      setup_intent_id: t.setupIntentId,
      hold_at: HOLD_AT,
    })
    expect(typeof b.stripe_customer_id).toBe('string')
    expect(db.state.booking_payment_consents[0].confirmed_at).toEqual(expect.any(String))
    expect(moneyKinds(t.id)).toEqual(['setup_started', 'setup_succeeded', 'hold_scheduled'])
    expect(emailKeys(t.id)).toEqual([`email:card_saved:${t.id}`])
    expect(mailsTo(OWNER)).toHaveLength(1)
    expect(managerAlert).toHaveBeenCalledTimes(1)
    expect(qstash).toHaveBeenCalledWith(t.id, PICKUP_MS)
    expect(ga4).toHaveBeenCalledTimes(1)
    expect(piCreates()).toHaveLength(0)

    // A replayed event changes nothing and sends nothing.
    const replay = await deliver(savedEvent)
    expect(replay.json).toMatchObject({ received: true, duplicate: true })
    expect(mailsTo(OWNER)).toHaveLength(1)
    expect(managerAlert).toHaveBeenCalledTimes(1)
    expect(moneyKinds(t.id)).toEqual(['setup_started', 'setup_succeeded', 'hold_scheduled'])

    // ── SC2: before hold_at the tick does nothing.
    setNow(HOLD_AT_MS - MINUTE)
    const early = await runTick()
    expect(early.json).toMatchObject({ ok: true, placed: 0, errors: [] })
    expect(piCreates()).toHaveLength(0)
    expect(rowOf(t.id).payment_state).toBe('card_saved')

    // ── SC2: at hold_at the tick places the full-amount manual-capture hold, once.
    setNow(HOLD_AT_MS + MINUTE)
    const tick = await runTick()
    expect(tick.json).toMatchObject({ ok: true, placed: 1, failed: 0, errors: [] })
    b = rowOf(t.id)
    expect(b.payment_state).toBe('authorized')
    expect(b.hold_amount_minor).toBe(amount)
    expect(b.payment_intent_id).toBeNull() // a hold is not a collected payment
    const holdId = b.hold_payment_intent_id as string
    expect(piCreates()).toHaveLength(1)
    expect(piCreates()[0].params).toMatchObject({
      amount,
      currency: 'eur',
      payment_method: 'pm_ok',
      capture_method: 'manual',
      off_session: true,
      confirm: true,
      metadata: { kind: 'card_hold', cofBookingId: t.id, attempt: '0' },
    })
    expect(piCreates()[0].idempotencyKey).toBe(`hold:${t.id}:0`)
    expect(emailKeys(t.id)).toEqual([`email:card_saved:${t.id}`, `email:hold_placed_scheduled:${t.id}:0`])
    expect(mailsTo(OWNER)).toHaveLength(2)

    // The hold webhook arriving after the tick (or the tick running again) adds nothing.
    const holdEvent = fake.buildEvent('payment_intent.amount_capturable_updated', fake.state.paymentIntents.get(holdId)!)
    await deliver(holdEvent)
    await runTick()
    expect(piCreates()).toHaveLength(1)
    expect(mailsTo(OWNER)).toHaveLength(2)
    expect(moneyKinds(t.id)).toEqual(['setup_started', 'setup_succeeded', 'hold_scheduled', 'hold_started', 'hold_authorized'])

    // ── SC3: the trip is done. The admin completes it; the single completion event captures the hold.
    setNow(PICKUP_MS + 2 * HOUR)
    const res = await completeTrip(t.id)
    expect(res.status).toBe(200)
    b = rowOf(t.id)
    expect(b.status).toBe('completed')
    expect(b.payment_state).toBe('captured')
    expect(b.captured_amount_minor).toBe(amount)
    expect(b.payment_intent_id).toBe(holdId) // set only now that money is collected
    expect(piCreates()).toHaveLength(1)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(fake.callsTo('paymentIntents.capture')[0]).toMatchObject({ targetId: holdId, params: { amount_to_capture: amount } })
    expect(fake.callsTo('paymentIntents.capture')[0].idempotencyKey).toBe(`cap:${t.id}:0`)
    expect(fake.state.paymentIntents.get(holdId)).toMatchObject({ status: 'succeeded', amount_received: amount })

    expect(moneyKinds(t.id)).toEqual([
      'setup_started',
      'setup_succeeded',
      'hold_scheduled',
      'hold_started',
      'hold_authorized',
      'capture_started',
      'captured',
    ])
    expect(emailKeys(t.id)).toEqual([
      `email:card_saved:${t.id}`,
      `email:hold_placed_scheduled:${t.id}:0`,
      `email:charged:${t.id}`,
    ])
    expect(mailsTo(OWNER)).toHaveLength(3)
    expect(mailsTo(MANAGER)).toHaveLength(0) // no failure, no alert

    // Sweeps and a duplicate completion never collect twice.
    setNow(PICKUP_MS + 3 * HOUR)
    const sweep = await runTick()
    expect(sweep.json).toMatchObject({ ok: true, captured: 0, errors: [] })
    expect(await settleBooking(t.id, { type: 'system', id: 'completion_event' })).toMatchObject({ outcome: 'noop' })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(piCreates()).toHaveLength(1)
    expect(mailsTo(OWNER)).toHaveLength(3)

    // ── SC4: the admin view shows the state and the ledger, newest first.
    const view = await adminPaymentView(t.id)
    expect(view.status).toBe(200)
    const payment = view.json.payment as Row
    expect(payment).toMatchObject({ mode: 'card_hold', state: 'captured', captured_amount_minor: amount, amount_minor: amount, completed: true })
    expect(view.json.allowed_actions).toEqual([])
    expect(view.json.refund_failed).toBe(false)
    const events = view.json.events as Array<Row>
    const ids = events.map((e) => e.id as number)
    expect([...ids].sort((a, c) => c - a)).toEqual(ids)
    expect(events.map((e) => e.kind)).toEqual(ledger(t.id).map((e) => e.kind as string).reverse())
    expect(events[1].kind).toBe('captured') // the charged email claim is the newest row, the capture right behind it
    expect(view.json.events_total).toBe(ledger(t.id).length)
    for (const e of events) expect(e).not.toHaveProperty('event_key')
  })
})

describe('expired hold: the saved card is charged instead', () => {
  it('ends in one fallback charge and captured, with the charged email once', async () => {
    const t = await bookAndHold()

    // The authorization lapses at Stripe before the trip is completed; the webhook marks it expired.
    fake.expireHold(t.holdId, 'expired')
    await deliver(fake.buildEvent('payment_intent.canceled', fake.state.paymentIntents.get(t.holdId)!))
    expect(rowOf(t.id).payment_state).toBe('expired')
    expect(moneyKinds(t.id)).toContain('hold_expired')

    setNow(PICKUP_MS + 2 * HOUR)
    expect((await completeTrip(t.id)).status).toBe(200)

    const b = rowOf(t.id)
    expect(b.payment_state).toBe('captured')
    expect(b.captured_amount_minor).toBe(t.amount)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(piCreates()).toHaveLength(2) // the hold and exactly one fallback charge
    const charge = piCreates()[1]
    expect(charge.params).toMatchObject({
      amount: t.amount,
      payment_method: 'pm_ok',
      off_session: true,
      confirm: true,
      metadata: { kind: 'card_charge', cofBookingId: t.id, attempt: '0' },
    })
    expect(charge.params).not.toHaveProperty('capture_method')
    expect(charge.idempotencyKey).toBe(`chg:${t.id}:0`)
    const chargeId = b.payment_intent_id as string
    expect(chargeId).toMatch(/^pi_/)
    expect(chargeId).not.toBe(t.holdId)

    // Stripe reports the charge; the webhook only observes it.
    const before = ledger(t.id).length
    await deliver(fake.buildEvent('payment_intent.succeeded', fake.state.paymentIntents.get(chargeId)!))
    expect(ledger(t.id).length).toBe(before + 1)
    expect(ledger(t.id).at(-1)).toMatchObject({ kind: 'charge_succeeded', event_key: `charge_succeeded:${chargeId}` })
    expect(rowOf(t.id).payment_state).toBe('captured')

    expect(emailKeys(t.id).filter((k) => k.startsWith('email:charged:'))).toEqual([`email:charged:${t.id}`])
    expect(mailsTo(OWNER)).toHaveLength(3) // card_saved, hold_placed, charged
    expect(mailsTo(MANAGER)).toHaveLength(0)
  })
})

describe('declined fallback: failed, recovery link, client email, operator alert, then paid', () => {
  it('records the failure once, mails the client and the operator once, and a paid link ends in captured', async () => {
    const t = await bookAndHold()

    fake.expireHold(t.holdId, 'expired')
    await deliver(fake.buildEvent('payment_intent.canceled', fake.state.paymentIntents.get(t.holdId)!))
    // By the time the trip is over the saved card declines.
    rowOf(t.id).stripe_payment_method_id = 'pm_decline_insufficient'

    setNow(PICKUP_MS + 2 * HOUR)
    expect((await completeTrip(t.id)).status).toBe(200)

    const failed = rowOf(t.id)
    expect(failed.payment_state).toBe('failed')
    expect(failed.last_payment_error).toBe('insufficient_funds')
    expect(failed.payment_intent_id).toBeNull() // nothing was collected
    expect(failed.captured_amount_minor).toBe(0)
    expect(failed.charge_attempts).toBe(1)
    expect(typeof failed.recovery_link_url).toBe('string')
    expect(piCreates()).toHaveLength(2) // the hold and the one declined fallback attempt

    // One recovery link for the full outstanding amount, card-flow metadata only.
    expect(fake.state.paymentLinks.size).toBe(1)
    const link = [...fake.state.paymentLinks.values()][0]
    expect(link.metadata).toMatchObject({ kind: 'card_recovery', cofBookingId: t.id })
    expect(link.metadata).not.toHaveProperty('bookingId')
    expect(JSON.stringify(link)).toContain(String(t.amount))
    expect(link.id).toBe(failed.recovery_link_id)

    // One payment_failed email to the client (card_saved, hold_placed, payment_failed) and one operator alert.
    expect(emailKeys(t.id)).toEqual([
      `email:card_saved:${t.id}`,
      `email:hold_placed_scheduled:${t.id}:0`,
      `email:payment_failed:${t.id}:charge:1`,
    ])
    expect(mailsTo(OWNER)).toHaveLength(3)
    expect(mailsTo(MANAGER)).toHaveLength(1)
    expect(ledger(t.id).filter((e) => e.event_key === `alert:charge_failed:${t.id}:1`)).toHaveLength(1)
    expect(moneyKinds(t.id)).toEqual(
      expect.arrayContaining(['capture_started', 'charge_failed', 'recovery_link_created']),
    )

    // A sweep right after the failure neither charges again nor re-sends: the one automatic retry is due 12 h later.
    setNow(PICKUP_MS + 3 * HOUR)
    expect((await runTick()).json).toMatchObject({ ok: true, captured: 0, errors: [] })
    expect(piCreates()).toHaveLength(2)
    expect(mailsTo(OWNER)).toHaveLength(3)
    expect(mailsTo(MANAGER)).toHaveLength(1)

    // The client pays the recovery link: checkout.session.completed closes the booking.
    const paid = fake.buildEvent('checkout.session.completed', {
      id: 'cs_recovery_1',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: 'pi_recovery_paid',
      amount_total: t.amount,
      metadata: cardMetadata('card_recovery', { bookingId: t.id, attempt: 'c1', bookingReference: t.reference }),
    })
    const result = await deliver(paid)
    expect(result.status).toBe(200)

    const closed = rowOf(t.id)
    expect(closed.payment_state).toBe('captured')
    expect(closed.captured_amount_minor).toBe(t.amount)
    expect(closed.payment_intent_id).toBe('pi_recovery_paid')
    expect(deactivate).toHaveBeenCalledWith(link.id)
    expect(fake.state.paymentLinks.get(link.id as string)!.active).toBe(false)
    expect(emailKeys(t.id).filter((k) => k.startsWith('email:charged:'))).toEqual([`email:charged:${t.id}`])
    expect(mailsTo(OWNER)).toHaveLength(4)
    expect(ledger(t.id).filter((e) => e.kind === 'recovery_paid')).toHaveLength(1)

    // The same payment arriving as a second event (PaymentIntent) or again is a duplicate.
    const again = await deliver(paid)
    expect(again.json).toMatchObject({ duplicate: true })
    expect(mailsTo(OWNER)).toHaveLength(4)
    expect(ledger(t.id).filter((e) => e.kind === 'recovery_paid')).toHaveLength(1)
  })
})

describe('partner and non-card bookings never reach Stripe', () => {
  const partnerRow = (over: Row = {}): Row => ({
    id: '33333333-3333-4333-8333-333333333333',
    status: 'completed',
    completed_at: new Date(NOW0 - HOUR).toISOString(),
    booking_source: 'gnet',
    payment_mode: 'card_hold',
    payment_state: 'authorized',
    booking_reference: 'PRG-20270116-GNET01',
    client_email: 'passenger@gnet.local',
    locale: 'en',
    pickup_date: '2027-01-16',
    pickup_time: '10:00',
    pickup_utc: PICKUP_UTC,
    payment_currency: 'eur',
    payment_amount_minor: 12000,
    hold_amount_minor: 12000,
    hold_payment_intent_id: 'pi_foreign',
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_ok',
    ...over,
  })

  const actor = { type: 'system', id: 'lifecycle' } as const

  async function everyEntryPoint(row: Row) {
    const a = await placeHold({ ...row, payment_state: 'placing_hold' }, actor)
    const b = await releaseHold(row, { actor, reason: 'operator' })
    const c = await settleBooking(row.id as string, actor)
    await handlePaymentFailure(row, { phase: 'charge', code: 'insufficient_funds', amountMinor: 12000, attempt: 1 })
    const d = await reevaluateAfterEdit({ bookingId: row.id as string, before: row, priceChanged: true, pickupChanged: true, actor })
    return { a, b, c, d }
  }

  it('a gnet booking gets no Stripe call, no link, no email and no state change through any entry point or the tick', async () => {
    useDb(createFakePaymentsDb({ nowMs: NOW0, bookings: [partnerRow()] }))
    const id = '33333333-3333-4333-8333-333333333333'
    const out = await everyEntryPoint(rowOf(id))
    expect(out.a).toMatchObject({ outcome: 'skipped', code: 'partner_booking' })
    expect(out.b).toBe('noop')
    expect(out.c).toMatchObject({ outcome: 'skipped', code: 'partner_booking' })
    expect(out.d).toBeNull()

    // A due partner booking claimed by the tick is skipped by the engine the same way.
    Object.assign(rowOf(id), { status: 'confirmed', completed_at: null, payment_state: 'card_saved', hold_at: new Date(NOW0 - HOUR).toISOString() })
    expect((await runTick()).status).toBe(200)

    expect(fake.calls).toHaveLength(0)
    expect(fake.state.paymentLinks.size).toBe(0)
    expect(resendSend).not.toHaveBeenCalled()
    expect(ledger(id).filter((e) => e.kind !== 'hold_started' && e.kind !== 'hold_failed')).toEqual([])
    expect(rowOf(id).captured_amount_minor).toBe(0)
    expect(rowOf(id).payment_intent_id).toBeNull()
  })

  it('a pay-now booking gets no Stripe call through any entry point even when its columns look like a hold', async () => {
    const id = '44444444-4444-4444-8444-444444444444'
    useDb(createFakePaymentsDb({ nowMs: NOW0, bookings: [partnerRow({ id, booking_source: 'web', payment_mode: 'pay_now', payment_state: 'authorized' })] }))
    const out = await everyEntryPoint(rowOf(id))
    expect(out.a).toMatchObject({ outcome: 'skipped', code: 'not_card_hold' })
    expect(out.b).toBe('noop')
    expect(out.c).toMatchObject({ outcome: 'skipped', code: 'not_card_hold' })
    expect(out.d).toBeNull()

    expect(fake.calls).toHaveLength(0)
    expect(fake.state.paymentLinks.size).toBe(0)
    expect(resendSend).not.toHaveBeenCalled()
    expect(rowOf(id).payment_state).toBe('authorized')
    expect(ledger(id)).toEqual([])
  })
})

describe('hold at checkout keeps the saved card (88-REVIEW T3: A-CR-03, B-CR-01)', () => {
  it('a price raise after a hold-now authorization is charged as a difference to the card the hold saved', async () => {
    // Pickup 48 h away: inside the 72 h lead, so the checkout authorizes the amount right away (D-11).
    setNow(PICKUP_MS - 48 * HOUR)
    const init = await initPOST(jsonRequest('http://localhost/api/card-checkout/init', { bookingData: bookingData(), currency: 'eur' }))
    expect(await init.json()).toMatchObject({ eligible: true, mode: 'hold_now' })
    const res = await intentPOST(
      jsonRequest('http://localhost/api/card-checkout/intent', {
        bookingData: bookingData(),
        currency: 'eur',
        mode: 'hold_now',
        consent: true,
        displayedAmountMinor: serverAmount(),
      }),
    )
    expect(res.status).toBe(200)
    const booking = db.state.bookings[0]
    booking.pickup_utc = PICKUP_UTC
    const id = booking.id as string
    const holdId = booking.hold_payment_intent_id as string
    expect(holdId).toMatch(/^pi_/)

    // The browser confirms the PaymentIntent with a good card; Stripe reports the authorization.
    const pi = fake.state.paymentIntents.get(holdId)!
    Object.assign(pi, { status: 'requires_capture', amount_capturable: pi.amount, payment_method: 'pm_ok' })
    expect((await deliver(fake.buildEvent('payment_intent.amount_capturable_updated', pi))).status).toBe(200)
    expect(rowOf(id)).toMatchObject({ status: 'confirmed', payment_state: 'authorized', stripe_payment_method_id: 'pm_ok' })
    expect(rowOf(id).stripe_customer_id).toBe(pi.customer)

    // The operator raises the agreed amount by 20.00 after the hold (D-16).
    rowOf(id).payment_amount_minor = serverAmount() + 2000

    setNow(PICKUP_MS + 2 * HOUR)
    expect((await completeTrip(id)).status).toBe(200)
    const b = rowOf(id)
    expect(b.payment_state).toBe('captured')
    expect(b.captured_amount_minor).toBe(serverAmount() + 2000)
    const diff = piCreates().find((c) => (c.params.metadata as Record<string, string>).kind === 'card_difference')
    expect(diff).toBeDefined()
    expect(diff!.params).toMatchObject({ amount: 2000, payment_method: 'pm_ok', customer: pi.customer, off_session: true })
    expect(ledger(id).map((e) => e.kind)).not.toContain('difference_failed')
  })
})

describe('a recovery link never outlives the debt (88-REVIEW T1: A-CR-01, B-CR-02, C-CR-02)', () => {
  it('declined hold -> link -> the automatic retry holds -> link deactivated; a late link payment is refunded; one capture', async () => {
    const t = await startBooking()
    setNow(NOW0 + 5 * MINUTE)
    await saveCard(t.setupIntentId)
    // The scheduled hold declines: failed, a recovery link and a payment_failed email.
    rowOf(t.id).stripe_payment_method_id = 'pm_decline_insufficient'
    setNow(HOLD_AT_MS + MINUTE)
    expect((await runTick()).json).toMatchObject({ ok: true, failed: 1 })
    const failed = rowOf(t.id)
    expect(failed.payment_state).toBe('failed')
    const linkId = failed.recovery_link_id as string
    expect(fake.state.paymentLinks.get(linkId)!.active).toBe(true)

    // The client opens the link's checkout page but does not pay yet. The card works again; the one automatic
    // retry 12 h later places the hold, and the link is deactivated in the same step.
    rowOf(t.id).stripe_payment_method_id = 'pm_ok'
    setNow(HOLD_AT_MS + 12 * HOUR + 2 * MINUTE)
    expect((await runTick()).json).toMatchObject({ ok: true, errors: [] })
    const held = rowOf(t.id)
    expect(held).toMatchObject({ payment_state: 'authorized', recovery_link_id: null, recovery_link_url: null })
    expect(fake.state.paymentLinks.get(linkId)!.active).toBe(false)

    // The checkout page opened before the deactivation is paid anyway: a second payment for the same debt.
    const recoveryPi = (await fake.stripe.paymentIntents.create({
      amount: serverAmount(),
      currency: 'eur',
      payment_method: 'pm_ok',
      confirm: true,
      metadata: cardMetadata('card_recovery', { bookingId: t.id, attempt: '1', bookingReference: t.reference }),
    })) as { id: string }
    const paid = fake.buildEvent('checkout.session.completed', {
      id: 'cs_late_1',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: recoveryPi.id,
      amount_total: serverAmount(),
      metadata: cardMetadata('card_recovery', { bookingId: t.id, attempt: '1', bookingReference: t.reference }),
    })
    expect((await deliver(paid)).status).toBe(200)
    expect(fake.callsTo('refunds.create')).toHaveLength(1)
    expect(fake.state.paymentIntents.get(recoveryPi.id)!.amount_refunded).toBe(serverAmount())
    expect(rowOf(t.id).payment_state).toBe('authorized')
    expect(mailsTo(MANAGER).some((c) => String((c[0] as { subject: string }).subject).includes('Duplicate payment'))).toBe(true)

    // The trip is completed: the hold is captured once, the client paid exactly once in total.
    setNow(PICKUP_MS + 2 * HOUR)
    expect((await completeTrip(t.id)).status).toBe(200)
    expect(rowOf(t.id)).toMatchObject({ payment_state: 'captured', captured_amount_minor: serverAmount() })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(fake.callsTo('refunds.create')).toHaveLength(1)
  })
})
