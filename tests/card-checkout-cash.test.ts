// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 89 plan 89-10 (CASH-01, CANC-02; D-08, D-09, D-10, D-12, D-16): pay cash to the driver, server side.
 *
 * Tracer: a cash intent through the REAL init and intent routes to a cash_guarantee row with a SetupIntent only,
 * then setup_intent.succeeded through the REAL webhook route to confirmed + card_saved + the cash email. The only
 * doubles are the outside world (Stripe, the database, Resend, QStash, GA4, the operator mail) and a virtual clock.
 */

process.env.CRON_SECRET = 'cash-cron-secret'
process.env.RESEND_API_KEY = 're_test'
process.env.MANAGER_EMAIL = 'ops@example.com'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

const { world, stripeStub, afterQueue, rateLimitMock, pricingConfigMock, resendSend, managerAlert, ga4, qstash } = vi.hoisted(() => ({
  world: { client: null as unknown, stripe: null as unknown, processed: new Set<string>() },
  stripeStub: { constructEvent: vi.fn() },
  afterQueue: [] as Promise<unknown>[],
  rateLimitMock: vi.fn(),
  pricingConfigMock: vi.fn(),
  resendSend: vi.fn(),
  managerAlert: vi.fn(),
  ga4: vi.fn(),
  qstash: vi.fn(),
}))

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
import { AttemptFlowConflictError, buildBookingRow, captureUnpaidBooking } from '@/lib/supabase'
import { claimDueHolds } from '@/lib/payments/state'
import { buildConsentText, consentSha256 } from '@/lib/payments/consent'
import { CARD_CONSENT_VERSION } from '@/lib/payments/consent-text'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { computeCombinedTotalMinor, computeOutboundLegTotal } from '@/lib/server-pricing'
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

// Pickup 2027-01-16 10:00 Prague (09:00Z); free cancellation until 08:00Z (one hour, default short window, 50 km).
const NOW0 = Date.parse('2027-01-10T09:00:00Z')
const PICKUP_UTC = '2027-01-16T09:00:00.000Z'
const PICKUP_MS = Date.parse(PICKUP_UTC)
const FREE_UNTIL_ISO = '2027-01-16T08:00:00.000Z'
const HOLD_AT = '2027-01-13T09:00:00.000Z'
const HOLD_AT_MS = Date.parse(HOLD_AT)
const MINUTE = 60_000
const HOUR = 3_600_000
const OWNER = 'owner@example.com'
const ATTEMPT = '11111111-1111-4111-8111-111111111111'

let db: FakePaymentsDb
let fake: FakeStripe

function setNow(ms: number) {
  vi.setSystemTime(ms)
  db.state.nowMs = ms
}

async function flushAfter() {
  while (afterQueue.length) await Promise.all(afterQueue.splice(0))
}

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
      if (name === 'advance_booking_status') {
        const b = db.state.bookings.find((r) => r.id === args.p_booking_id)
        if (!b) return { data: { applied: false, current_status: null }, error: null }
        if (b.status !== args.p_from) return { data: { applied: false, current_status: b.status }, error: null }
        b.status = args.p_to
        return { data: { applied: true, booking: { ...b } }, error: null }
      }
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

function serverAmount(): number {
  const outbound = computeOutboundLegTotal('business', 50, 2, 1, 'transfer', '2027-01-16', '10:00', false, PRICING)
  return computeCombinedTotalMinor({ outboundLegEur: outbound, extrasEur: 0, returnLegEur: 0, promoPct: 0, currency: 'eur' }).stripeAmountMinor
}

function bookingData(over: Record<string, string> = {}) {
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
    ...over,
  }
}

function jsonRequest(url: string, payload: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (cash)' },
    body: JSON.stringify(payload),
  })
}

async function deliver(event: unknown) {
  stripeStub.constructEvent.mockReturnValue(event)
  const res = await webhookPOST(
    new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'valid-sig' }, body: 'raw-body' }),
  )
  await flushAfter()
  return { status: res.status }
}

async function runTick() {
  const res = await tickGET(
    new Request('https://example.test/api/cron/payment-tick', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }),
  )
  await flushAfter()
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

interface InitOut {
  eligible: boolean
  mode?: string
  cashAvailable?: boolean
  policy?: { freeUntilIso: string; freeUntilPassed: boolean }
}

async function init(data = bookingData()): Promise<InitOut> {
  const res = await initPOST(jsonRequest('http://localhost/api/card-checkout/init', { bookingData: data, currency: 'eur' }))
  return (await res.json()) as InitOut
}

/** The body the checkout sends for a payment choice, built from what init showed the client. */
function intentBody(initOut: InitOut, payment: 'card' | 'cash', over: Record<string, unknown> = {}, data = bookingData()) {
  return {
    bookingData: data,
    currency: 'eur',
    mode: initOut.mode,
    payment,
    consent: true,
    displayedAmountMinor: serverAmount(),
    displayedHoldDateIso: '2027-01-13',
    displayedFreeUntilIso: initOut.policy?.freeUntilIso,
    displayedFreeUntilPassed: initOut.policy?.freeUntilPassed,
    ...over,
  }
}

async function intent(payload: unknown) {
  const res = await intentPOST(jsonRequest('http://localhost/api/card-checkout/intent', payload))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const rows = () => db.state.bookings
const consents = () => db.state.booking_payment_consents
const ledger = (id: string) => db.state.booking_payment_events.filter((e) => e.booking_id === id)
const moneyKinds = (id: string) => ledger(id).map((e) => e.kind as string).filter((k) => k !== 'email_sent' && k !== 'alert_sent')
const piCreates = () => fake.callsTo('paymentIntents.create')
const siCreates = () => fake.callsTo('setupIntents.create')

/** The browser confirmed the SetupIntent with a good card; Stripe sends setup_intent.succeeded. */
async function saveCard(setupIntentId: string) {
  const si = fake.state.setupIntents.get(setupIntentId)!
  Object.assign(si, { status: 'succeeded', payment_method: 'pm_ok' })
  const result = await deliver(fake.buildEvent('setup_intent.succeeded', si))
  expect(result.status).toBe(200)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW0)
  afterQueue.length = 0
  world.processed.clear()
  fake = createFakeStripe({ nowSec: () => Math.floor(Date.now() / 1000) })
  world.stripe = fake.stripe
  db = createFakePaymentsDb({ nowMs: NOW0 })
  Object.assign(db.state.pricing_globals[0], {
    card_flow_mode: 'canary',
    card_flow_canary_emails: [OWNER],
    payment_hold_lead_hours: 72,
  })
  world.client = lifecycleClient(db)
  pricingConfigMock.mockResolvedValue(PRICING)
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  resendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  managerAlert.mockResolvedValue(undefined)
  ga4.mockResolvedValue(true)
  qstash.mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('tracer: cash intent -> cash_guarantee row -> setup_intent.succeeded -> confirmed + cash email (CASH-01)', () => {
  it('books pay cash to the driver with a SetupIntent only, no hold, and confirms it from the webhook', async () => {
    const initOut = await init()
    expect(initOut).toMatchObject({ eligible: true, mode: 'setup', cashAvailable: true })

    const { status, body } = await intent(intentBody(initOut, 'cash'))
    expect(status).toBe(200)
    expect(body).toMatchObject({ payment: 'cash', mode: 'setup', amountMinor: serverAmount(), currency: 'eur' })
    expect(body.clientSecret).toMatch(/_secret_/)

    // The row: cash_guarantee, nothing planned for a hold, a SetupIntent and no PaymentIntent.
    expect(rows()).toHaveLength(1)
    const b = rows()[0]
    expect(b).toMatchObject({
      status: 'unpaid',
      payment_mode: 'cash_guarantee',
      payment_state: 'checkout_pending',
      payment_intent_id: null,
      hold_at: null,
      payment_amount_minor: serverAmount(),
      payment_currency: 'eur',
    })
    expect(typeof b.setup_intent_id).toBe('string')
    expect(piCreates()).toHaveLength(0)
    expect(siCreates()).toHaveLength(1)
    expect(siCreates()[0].params).toMatchObject({ usage: 'off_session', payment_method_types: ['card'] })

    // The consent: mode cash_setup, the server-rendered text and its hash, no hold date, the free-until moment named.
    expect(consents()).toHaveLength(1)
    const text = await buildConsentText({
      locale: 'en',
      mode: 'cash_setup',
      amountMinor: serverAmount(),
      currency: 'eur',
      holdDateIso: null,
      freeUntilMs: Date.parse(FREE_UNTIL_ISO),
      freeUntilPassed: false,
    })
    expect(consents()[0]).toMatchObject({
      booking_id: b.id,
      mode: 'cash_setup',
      text_version: CARD_CONSENT_VERSION,
      text_rendered: text,
      text_sha256: consentSha256(text),
      planned_hold_at: null,
      setup_intent_id: b.setup_intent_id,
    })
    expect(text).toContain('in cash')
    expect(text).toContain('16 January 2027')
    expect(text).not.toMatch(/\{[A-Za-z]+\}/)

    // setup_intent.succeeded: confirmed, card_saved, NO hold_scheduled, the cash variant of the card_saved mail.
    booking_pickup(b)
    setNow(NOW0 + 5 * MINUTE)
    await saveCard(b.setup_intent_id as string)
    expect(rows()[0]).toMatchObject({
      status: 'confirmed',
      payment_mode: 'cash_guarantee',
      payment_state: 'card_saved',
      payment_intent_id: null,
      hold_at: null,
      stripe_payment_method_id: 'pm_ok',
    })
    expect(moneyKinds(b.id as string)).toEqual(['setup_started', 'setup_succeeded'])
    expect(consents()[0].confirmed_at).toEqual(expect.any(String))
    const mails = resendSend.mock.calls.filter((c) => ((c[0] as { to: string[] }).to ?? []).includes(OWNER))
    expect(mails).toHaveLength(1)
    const html = (mails[0][0] as { html: string }).html
    expect(html).toContain('no hold is placed')
    expect(html).toContain('in cash to your driver')
    expect(html).not.toContain('we hold')
  })
})

/** pickup_utc is a GENERATED column of the live table (D-22); the fake does not generate it. */
function booking_pickup(b: Row) {
  b.pickup_utc = PICKUP_UTC
}

describe('no hold can ever be placed on a cash booking (D-09, T-89-34)', () => {
  it('inside the hold lead window cash is still a SetupIntent: no PaymentIntent, no hold_now', async () => {
    setNow(PICKUP_MS - 48 * HOUR)
    const initOut = await init()
    expect(initOut).toMatchObject({ eligible: true, mode: 'hold_now', cashAvailable: true })

    const { status, body } = await intent(intentBody(initOut, 'cash', { mode: 'hold_now' }))
    expect(status).toBe(200)
    expect(body).toMatchObject({ payment: 'cash', mode: 'setup' })
    expect(piCreates()).toHaveLength(0)
    expect(siCreates()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({ payment_mode: 'cash_guarantee', hold_at: null, hold_payment_intent_id: null })
    expect(consents()[0]).toMatchObject({ mode: 'cash_setup', planned_hold_at: null })
  })

  it('the cash path ignores the hold-date and mode cross-checks (a card-only concern)', async () => {
    const initOut = await init()
    const { status } = await intent(intentBody(initOut, 'cash', { mode: 'hold_now', displayedHoldDateIso: '1999-01-01' }))
    expect(status).toBe(200)
  })

  it('a card intent on the same data still gets MODE_CHANGED and HOLD_DATE_CHANGED', async () => {
    const initOut = await init()
    const modeChanged = await intent(intentBody(initOut, 'card', { mode: 'hold_now' }))
    expect(modeChanged.status).toBe(409)
    expect(modeChanged.body.code).toBe('MODE_CHANGED')
    const dateChanged = await intent(intentBody(initOut, 'card', { displayedHoldDateIso: '1999-01-01' }))
    expect(dateChanged.status).toBe(409)
    expect(dateChanged.body.code).toBe('HOLD_DATE_CHANGED')
  })

  it('the consent must be the JSON boolean true for cash as well', async () => {
    const initOut = await init()
    for (const consent of [false, 'true', 1, undefined]) {
      const { status, body } = await intent(intentBody(initOut, 'cash', { consent }))
      expect(status).toBe(422)
      expect(body.code).toBe('CONSENT_REQUIRED')
    }
    expect(rows()).toHaveLength(0)
  })

  it('the payment tick never claims a cash row, even with hold_at set by hand and the clock past it', async () => {
    const initOut = await init()
    await intent(intentBody(initOut, 'cash'))
    const b = rows()[0]
    booking_pickup(b)
    setNow(NOW0 + 5 * MINUTE)
    await saveCard(b.setup_intent_id as string)

    // Someone sets hold_at by hand: the database filter (payment_mode = card_hold) is the guarantee.
    b.hold_at = HOLD_AT
    setNow(HOLD_AT_MS + MINUTE)
    expect(await claimDueHolds(10, 60)).toEqual([])
    const tick = await runTick()
    expect(tick.json).toMatchObject({ ok: true, placed: 0 })
    expect(piCreates()).toHaveLength(0)
    expect(rows()[0].payment_state).toBe('card_saved')
    expect(moneyKinds(b.id as string)).not.toContain('hold_started')
  })

  it('control: the same row as card_hold IS claimed (the fake mirrors 085, so the cash exclusion is the filter)', async () => {
    const initOut = await init()
    await intent(intentBody(initOut, 'cash'))
    const b = rows()[0]
    booking_pickup(b)
    setNow(NOW0 + 5 * MINUTE)
    await saveCard(b.setup_intent_id as string)
    b.hold_at = HOLD_AT
    b.payment_mode = 'card_hold'
    setNow(HOLD_AT_MS + MINUTE)
    const claimed = await claimDueHolds(10, 60)
    expect(claimed).toHaveLength(1)
  })
})

describe('pay cash is offered exactly where the card flow is (D-08)', () => {
  it('has no amount limit', async () => {
    const initOut = await init(bookingData({ distanceKm: '900', vehicleClass: 'business_van' }))
    expect(initOut).toMatchObject({ eligible: true, cashAvailable: true })
  })

  it('a round trip never gets it: the answer is not eligible and carries no cash flag', async () => {
    const out = await init(bookingData({ tripType: 'round_trip', returnDate: '2027-01-18', returnTime: '10:00' }))
    expect(out.eligible).toBe(false)
    expect(out.cashAvailable).toBeUndefined()
  })

  it('a client who is not on the canary list gets the old opaque answer', async () => {
    const out = await init(bookingData({ email: 'stranger@example.com' }))
    expect(out).toEqual({ eligible: false })
  })

  it('the intent route refuses cash for an ineligible client and for a round trip', async () => {
    const initOut = await init()
    const stranger = await intent(intentBody(initOut, 'cash', {}, bookingData({ email: 'stranger@example.com' })))
    expect(stranger.status).toBe(422)
    expect(stranger.body.code).toBe('NOT_ELIGIBLE')
    const round = await intent(intentBody(initOut, 'cash', {}, bookingData({ tripType: 'round_trip' })))
    expect(round.status).toBe(422)
    expect(round.body.code).toBe('NOT_ELIGIBLE')
    expect(rows()).toHaveLength(0)
  })

  it('a booking without a payment field is a card booking (Phase 88 clients)', async () => {
    const initOut = await init()
    const payload = intentBody(initOut, 'card') as Record<string, unknown>
    delete payload.payment
    const { status, body } = await intent(payload)
    expect(status).toBe(200)
    expect(body.payment).toBe('card')
    expect(rows()[0].payment_mode).toBe('card_hold')
  })
})

describe('one payment flow per attempt, symmetric (Pitfall 5, T-89-36)', () => {
  it('a card attempt cannot become cash and a cash attempt cannot become card: ATTEMPT_CLOSED, row untouched', async () => {
    const initOut = await init()
    expect((await intent(intentBody(initOut, 'card'))).status).toBe(200)
    const toCash = await intent(intentBody(initOut, 'cash'))
    expect(toCash.status).toBe(409)
    expect(toCash.body.code).toBe('ATTEMPT_CLOSED')
    expect(rows()).toHaveLength(1)
    expect(rows()[0].payment_mode).toBe('card_hold')

    // Another attempt: cash first, then card.
    const other = '22222222-2222-4222-8222-222222222222'
    const data = bookingData({ attemptId: other })
    expect((await intent(intentBody(initOut, 'cash', {}, data))).status).toBe(200)
    const toCard = await intent(intentBody(initOut, 'card', {}, data))
    expect(toCard.status).toBe(409)
    expect(toCard.body.code).toBe('ATTEMPT_CLOSED')
    expect(rows()).toHaveLength(2)
    expect(rows()[1]).toMatchObject({ payment_mode: 'cash_guarantee', hold_at: null })
  })

  it('a new attempt id after a switch books normally', async () => {
    const initOut = await init()
    await intent(intentBody(initOut, 'card'))
    const fresh = bookingData({ attemptId: '33333333-3333-4333-8333-333333333333' })
    const { status } = await intent(intentBody(initOut, 'cash', {}, fresh))
    expect(status).toBe(200)
    expect(rows().map((r) => r.payment_mode)).toEqual(['card_hold', 'cash_guarantee'])
  })

  async function seedUnpaid(mode: string, extra: Row = {}) {
    const meta = { ...buildBookingRow(minimalMeta(), null, 'unpaid'), payment_mode: mode, ...extra }
    const out = await captureUnpaidBooking(meta, ATTEMPT, 'outbound', mode as 'pay_now' | 'card_hold' | 'cash_guarantee')
    expect(out).toHaveLength(1)
  }

  function minimalMeta() {
    return {
      bookingReference: 'PRG-20270110-ABC123',
      returnBookingReference: '',
      firstName: 'Anna',
      lastName: 'Novak',
      email: OWNER,
      phone: '+420725986855',
      tripType: 'transfer',
      vehicleClass: 'business',
      distanceKm: '50',
      pickupDate: '2027-01-16',
      pickupTime: '10:00',
      passengers: '2',
      originAddress: 'Prague Airport',
      destinationAddress: 'Hotel Aria',
      amountEur: '125',
      locale: 'en',
    } as unknown as Parameters<typeof buildBookingRow>[0]
  }

  it('flowConflict matrix on captureUnpaidBooking: every cross-flow capture throws, same-flow updates in place', async () => {
    const flows = ['pay_now', 'card_hold', 'cash_guarantee'] as const
    for (const existingFlow of flows) {
      for (const capturing of flows) {
        const fresh = createFakePaymentsDb({ nowMs: NOW0 })
        db = fresh
        world.client = lifecycleClient(fresh)
        await seedUnpaid(existingFlow)
        const row = { ...buildBookingRow(minimalMeta(), null, 'unpaid'), payment_mode: capturing }
        if (existingFlow === capturing) {
          await expect(captureUnpaidBooking(row, ATTEMPT, 'outbound', capturing)).resolves.toHaveLength(1)
        } else {
          await expect(captureUnpaidBooking(row, ATTEMPT, 'outbound', capturing)).rejects.toBeInstanceOf(AttemptFlowConflictError)
        }
      }
    }
  })

  it('a cash capture never overwrites a pay-now row that already carries its PaymentIntent', async () => {
    await seedUnpaid('pay_now', { payment_intent_id: 'pi_paid' })
    const row = { ...buildBookingRow(minimalMeta(), null, 'unpaid'), payment_mode: 'cash_guarantee' }
    await expect(captureUnpaidBooking(row, ATTEMPT, 'outbound', 'cash_guarantee')).rejects.toBeInstanceOf(AttemptFlowConflictError)
    expect(rows()[0].payment_intent_id).toBe('pi_paid')
  })
})
