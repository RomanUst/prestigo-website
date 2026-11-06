// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 88 plan 88-08 (HOLD-01, D-05, D-09a, D-11, D-12): POST /api/card-checkout/intent in setup mode.
// Real route + real checkout/state/consent modules over the in-memory payments DB and the fake Stripe.

const { dbHolder, stripeHolder, pricingConfigMock, rateLimitMock, promoState } = vi.hoisted(() => ({
  dbHolder: { client: null as unknown },
  stripeHolder: { stripe: null as unknown },
  pricingConfigMock: vi.fn(),
  rateLimitMock: vi.fn(),
  promoState: { row: null as null | { discount_value: number; max_uses: number | null; current_uses: number; is_active: boolean } },
}))

// captureUnpaidBooking / state.ts reach the client through createClient, so mock it at that boundary.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => dbHolder.client),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } }),
  ),
}))
vi.mock('@/lib/pricing-config', () => ({ getPricingConfig: pricingConfigMock }))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: rateLimitMock,
}))
vi.mock('@/lib/payments/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => stripeHolder.stripe,
}))

import { POST } from '@/app/api/card-checkout/intent/route'
import { AttemptFlowConflictError, buildBookingRow, captureUnpaidBooking } from '@/lib/supabase'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { computeCombinedTotalMinor, computeOutboundLegTotal } from '@/lib/server-pricing'
import { computeHoldAt, holdDateIso } from '@/lib/payments/timing'
import { ensureStripeCustomer } from '@/lib/payments/customer'
import { cardMetadata, classifyStripeError, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
import { pickupInstantMs } from '@/lib/prague-date'
import { buildConsentText, consentSha256 } from '@/lib/payments/consent'
import { CARD_CONSENT_VERSION } from '@/lib/payments/consent-text'
import type { PricingRates } from '@/lib/pricing-config'

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

// Fixed "now": 2027-01-10 09:00Z (10:00 Prague, CET).
const NOW = Date.parse('2027-01-10T09:00:00Z')
const OWNER = 'owner@example.com'
const ATTEMPT = '11111111-1111-4111-8111-111111111111'
const PHONE = '+420725986855'

let db: FakePaymentsDb
let fake: FakeStripe
let log: string[]

function serverAmount(pickupDate = '2027-01-16', pickupTime = '10:00', promoPct = 0): number {
  const outbound = computeOutboundLegTotal('business', 50, 2, 1, 'transfer', pickupDate, pickupTime, false, PRICING)
  return computeCombinedTotalMinor({
    outboundLegEur: outbound,
    extrasEur: 0,
    returnLegEur: 0,
    promoPct,
    currency: 'eur',
  }).stripeAmountMinor
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
    phone: PHONE,
    locale: 'en',
    originAddress: 'Prague Airport',
    destinationAddress: 'Hotel Aria',
    attemptId: ATTEMPT,
    ...over,
  }
}

/** The hold date the client's consent shows for a booking (lead 72 h, the fake's default setting). */
function shownHoldDate(data: { pickupDate: string; pickupTime: string }): string | null {
  const pickupMs = pickupInstantMs({ pickup_utc: null, pickup_date: data.pickupDate, pickup_time: data.pickupTime })
  return pickupMs === null ? null : holdDateIso(computeHoldAt(pickupMs, 72).holdAtMs)
}

function body(over: Record<string, unknown> = {}, data: Record<string, string> = {}) {
  const bd = bookingData(data)
  return {
    bookingData: bd,
    currency: 'eur',
    mode: 'setup',
    consent: true,
    displayedAmountMinor: serverAmount(),
    displayedHoldDateIso: shownHoldDate(bd),
    ...over,
  }
}

function req(payload: unknown, headers: Record<string, string> = {}, raw?: string): Request {
  return new Request('http://localhost/api/card-checkout/intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', ...headers },
    body: raw ?? JSON.stringify(payload),
  })
}

async function call(payload: unknown, headers: Record<string, string> = {}) {
  const res = await POST(req(payload, headers))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** Wraps the fake client so inserts / updates / rpc calls are appended to the shared ordered log. */
function loggingClient(client: FakePaymentsDb['client']) {
  return {
    rpc: (name: string, args?: Record<string, unknown>) => {
      log.push(`rpc:${name}`)
      return client.rpc(name, args)
    },
    from: (table: string) => {
      if (table === 'promo_codes') {
        const row = promoState.row
        const b = {
          select: () => b,
          eq: () => b,
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }
        return b
      }
      return new Proxy(client.from(table), {
        get(target, prop, receiver) {
          const v = Reflect.get(target, prop, receiver)
          if (prop === 'insert' || prop === 'update') {
            return (...a: unknown[]) => {
              log.push(`${prop}:${table}`)
              return (v as (...x: unknown[]) => unknown).apply(target, a)
            }
          }
          return v
        },
      })
    },
  }
}

function seedSettings(over: Record<string, unknown> = {}) {
  Object.assign(db.state.pricing_globals[0], {
    card_flow_mode: 'canary',
    card_flow_canary_emails: [OWNER],
    payment_hold_lead_hours: 72,
    ...over,
  })
}

const bookings = () => db.state.bookings
const consents = () => db.state.booking_payment_consents

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  log = []
  db = createFakePaymentsDb({ nowMs: NOW })
  fake = createFakeStripe({ nowSec: () => Math.floor(NOW / 1000) })
  const original = fake.stripe.setupIntents.create
  fake.stripe.setupIntents.create = async (...a: Parameters<typeof original>) => {
    log.push('stripe:setupIntents.create')
    return original(...a)
  }
  dbHolder.client = loggingClient(db.client)
  stripeHolder.stripe = fake.stripe
  promoState.row = null
  pricingConfigMock.mockReset()
  pricingConfigMock.mockResolvedValue(PRICING)
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  seedSettings()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/card-checkout/intent: cancellation terms are stored on the row (Phase 89, D-18)', () => {
  it('canary-listed client: the unpaid card row carries the version and the settings snapshot from the same read', async () => {
    Object.assign(db.state.pricing_globals[0], {
      cancel_free_km_threshold: 60,
      cancel_free_hours_short: 2,
      cancel_free_hours_long: 24,
      cancel_free_hours_hourly: 8,
      cancel_fee_percent: 75,
    })
    const { status } = await call(body())
    expect(status).toBe(200)
    expect(bookings()[0].cancel_policy_version).toBe('2026-11-1')
    expect(bookings()[0].cancel_policy).toEqual({
      version: '2026-11-1',
      kmThreshold: 60,
      freeHoursShort: 2,
      freeHoursLong: 24,
      freeHoursHourly: 8,
      feePercent: 75,
    })
  })

  it('mode on: a client who is not on any list gets the terms stored as well', async () => {
    seedSettings({ card_flow_mode: 'on', card_flow_canary_emails: [] })
    const { status } = await call(body({}, { email: 'stranger@example.com' }))
    expect(status).toBe(200)
    expect(bookings()[0].cancel_policy_version).toBe('2026-11-1')
  })

  it('a client-supplied policy field in the body is ignored (T-89-23)', async () => {
    const payload = body({ cancelPolicy: { version: 'evil', freeHoursLong: 0 }, cancel_policy_version: 'evil' })
    const { status } = await call(payload)
    expect(status).toBe(200)
    expect(bookings()[0].cancel_policy_version).toBe('2026-11-1')
    expect((bookings()[0].cancel_policy as Record<string, unknown>).freeHoursLong).toBe(12)
  })
})

describe('POST /api/card-checkout/intent: setup mode happy path (tracer)', () => {
  it('returns a client secret and leaves one unpaid card_hold booking with nothing charged', async () => {
    const { status, body: out } = await call(body(), { 'user-agent': 'Mozilla/5.0 (test)' })
    expect(status).toBe(200)
    expect(out).toMatchObject({ mode: 'setup', currency: 'eur', amountMinor: serverAmount() })
    expect(typeof out.clientSecret).toBe('string')
    expect(out.clientSecret).toMatch(/_secret_/)
    expect(out.bookingReference).toMatch(/^PRG-\d{8}-[0-9A-F]{6}$/)

    expect(bookings()).toHaveLength(1)
    const b = bookings()[0]
    const pickupMs = pickupInstantMs({ pickup_utc: null, pickup_date: '2027-01-16', pickup_time: '10:00' }) as number
    expect(b).toMatchObject({
      status: 'unpaid',
      payment_mode: 'card_hold',
      payment_intent_id: null,
      payment_state: 'checkout_pending',
      payment_currency: 'eur',
      payment_amount_minor: serverAmount(),
      attempt_id: ATTEMPT,
      booking_reference: out.bookingReference,
    })
    expect(b.setup_intent_id).toBe(fake.state.setupIntents.keys().next().value)
    expect(b.stripe_customer_id).toBe(fake.state.customers.keys().next().value)
    expect(b.hold_at).toBe(new Date(computeHoldAt(pickupMs, 72).holdAtMs).toISOString())
    expect(b.hold_at).toBe('2027-01-13T09:00:00.000Z')

    const events = db.state.booking_payment_events
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'setup_started', from_state: 'none', to_state: 'checkout_pending', actor_type: 'system' })
  })

  it('stores the consent record: version, server-rendered text, sha256, locale, amount, hold time, IP, clamped user agent', async () => {
    const longUa = 'U'.repeat(450)
    await call(body(), { 'user-agent': longUa })
    expect(consents()).toHaveLength(1)
    const c = consents()[0]
    const text = await buildConsentText({
      locale: 'en',
      mode: 'setup',
      amountMinor: serverAmount(),
      currency: 'eur',
      holdDateIso: '2027-01-13',
    })
    expect(c).toMatchObject({
      booking_id: bookings()[0].id,
      // The webhook confirms the consent by this id (found by the 88-17 lifecycle test: it was never stored).
      setup_intent_id: bookings()[0].setup_intent_id,
      mode: 'setup',
      text_version: CARD_CONSENT_VERSION,
      text_rendered: text,
      text_sha256: consentSha256(text),
      locale: 'en',
      amount_minor: serverAmount(),
      currency: 'eur',
      planned_hold_at: '2027-01-13T09:00:00.000Z',
      ip: '203.0.113.7',
    })
    expect(c.accepted_at).toBe(new Date(NOW).toISOString())
    expect((c.user_agent as string).length).toBe(300)
    expect(text).toContain('2027')
  })

  it('creates one Customer and one SetupIntent (off_session, card, 3DS any) and never a PaymentIntent', async () => {
    await call(body())
    expect(fake.executed('customers.create')).toBe(1)
    expect(fake.executed('setupIntents.create')).toBe(1)
    expect(fake.calls.filter((c) => c.method.startsWith('paymentIntents.'))).toHaveLength(0)

    const bookingId = bookings()[0].id as string
    const si = fake.callsTo('setupIntents.create')[0]
    expect(si.params).toMatchObject({
      usage: 'off_session',
      payment_method_types: ['card'],
      payment_method_options: { card: { request_three_d_secure: 'any' } },
      customer: bookings()[0].stripe_customer_id,
    })
    expect(si.params.metadata).toEqual({
      kind: 'card_setup',
      cofBookingId: bookingId,
      attempt: '1',
      bookingReference: bookings()[0].booking_reference,
    })
    expect(si.idempotencyKey).toBe(`si:${bookingId}:${consents()[0].id}`)
    expect(fake.callsTo('customers.create')[0].idempotencyKey).toBe(`cus:${bookingId}`)
  })

  it('adds promoCode to the SetupIntent metadata only when a promo applied', async () => {
    promoState.row = { discount_value: 10, max_uses: null, current_uses: 0, is_active: true }
    const withPromo = body({ displayedAmountMinor: serverAmount('2027-01-16', '10:00', 10) }, { promoCode: 'welcome10' })
    const { status } = await call(withPromo)
    expect(status).toBe(200)
    expect(fake.callsTo('setupIntents.create')[0].params.metadata).toMatchObject({ promoCode: 'WELCOME10' })

    db = createFakePaymentsDb({ nowMs: NOW })
    dbHolder.client = loggingClient(db.client)
    seedSettings()
    fake = createFakeStripe()
    stripeHolder.stripe = fake.stripe
    promoState.row = null
    await call(body())
    expect(fake.callsTo('setupIntents.create')[0].params.metadata).not.toHaveProperty('promoCode')
  })

  it('sends no first name, last name, email or phone in any Stripe metadata, SetupIntent params or idempotency key', async () => {
    await call(body())
    const pii = ['Anna', 'Novak', OWNER, PHONE]
    for (const c of fake.calls) {
      expect(c.idempotencyKey ?? '').not.toMatch(/Anna|Novak|owner|example|\+420/)
      const metadata = (c.params.metadata ?? {}) as Record<string, string>
      for (const p of pii) expect(JSON.stringify(metadata)).not.toContain(p)
      if (c.method !== 'customers.create') {
        for (const p of pii) expect(JSON.stringify(c.params)).not.toContain(p)
      }
    }
    // The Customer object itself is the one place contact details belong (dedicated fields, not metadata).
    expect(fake.callsTo('customers.create')[0].params.metadata).toEqual({ prestigoBookingId: bookings()[0].id })
  })

  it('writes the consent row and the checkout_pending transition before the response, consent before the SetupIntent', async () => {
    await call(body())
    const consentAt = log.indexOf('insert:booking_payment_consents')
    const siAt = log.indexOf('stripe:setupIntents.create')
    const transitionAt = log.indexOf('rpc:apply_payment_transition')
    expect(consentAt).toBeGreaterThanOrEqual(0)
    expect(siAt).toBeGreaterThanOrEqual(0)
    expect(consentAt).toBeLessThan(siAt)
    expect(transitionAt).toBeGreaterThanOrEqual(0)
    expect(siAt).toBeLessThan(transitionAt)
    // The booking row is captured before any Stripe call.
    const bookingAt = log.indexOf('insert:bookings')
    expect(bookingAt).toBeGreaterThanOrEqual(0)
    expect(bookingAt).toBeLessThan(consentAt)
    expect(bookings()[0].payment_state).toBe('checkout_pending')
  })
})

/** Nothing was written anywhere: no booking, no consent, no ledger row, no Stripe call. */
function expectNoWrites() {
  expect(bookings()).toHaveLength(0)
  expect(consents()).toHaveLength(0)
  expect(db.state.booking_payment_events).toHaveLength(0)
  expect(fake.calls).toHaveLength(0)
}

// ── Plan 88-12 (HOLD-03, D-11): hold_now ────────────────────────────────────────
// now = 2027-01-10 10:00 Prague; pickup 2027-01-12 12:00 is 50 h away, inside the 72 h hold lead.
const NEAR = { pickupDate: '2027-01-12', pickupTime: '12:00' }

function nearAmount(promoPct = 0) {
  return serverAmount('2027-01-12', '12:00', promoPct)
}

function holdNowBody(over: Record<string, unknown> = {}, data: Record<string, string> = {}) {
  return body({ mode: 'hold_now', displayedAmountMinor: nearAmount(), ...over }, { ...NEAR, ...data })
}

describe('POST /api/card-checkout/intent: hold_now mode (HOLD-03, tracer)', () => {
  it('creates one on-session manual-capture PaymentIntent for the full server amount and no SetupIntent', async () => {
    const { status, body: out } = await call(holdNowBody(), { 'user-agent': 'Mozilla/5.0 (test)' })
    expect(status).toBe(200)
    expect(out).toMatchObject({ mode: 'hold_now', currency: 'eur', amountMinor: nearAmount() })
    expect(out.clientSecret).toMatch(/_secret_/)

    expect(fake.executed('paymentIntents.create')).toBe(1)
    expect(fake.calls.filter((c) => c.method.startsWith('setupIntents.'))).toHaveLength(0)
    const b = bookings()[0]
    const pi = fake.callsTo('paymentIntents.create')[0]
    expect(pi.params).toMatchObject({
      amount: nearAmount(),
      currency: 'eur',
      customer: b.stripe_customer_id,
      payment_method_types: ['card'],
      capture_method: 'manual',
      setup_future_usage: 'off_session',
    })
    expect(pi.params).not.toHaveProperty('confirm')
    expect(pi.params.metadata).toEqual({
      kind: 'card_hold_now',
      cofBookingId: b.id,
      attempt: '1',
      bookingReference: b.booking_reference,
    })
    expect(pi.idempotencyKey).toBe(`pi_now:${b.id}:${consents()[0].id}`)
  })

  it('leaves the booking checkout_pending with the hold id and amount, hold_at null, payment_intent_id null', async () => {
    await call(holdNowBody())
    const piId = fake.state.paymentIntents.keys().next().value
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0]).toMatchObject({
      status: 'unpaid',
      payment_mode: 'card_hold',
      payment_state: 'checkout_pending',
      payment_currency: 'eur',
      payment_amount_minor: nearAmount(),
      hold_payment_intent_id: piId,
      hold_amount_minor: nearAmount(),
      hold_at: null,
      payment_intent_id: null,
      setup_intent_id: null,
    })
    expect(db.state.booking_payment_events).toHaveLength(1)
    expect(db.state.booking_payment_events[0]).toMatchObject({
      kind: 'setup_started',
      from_state: 'none',
      to_state: 'checkout_pending',
    })
  })

  it('stores the held-now consent with the PaymentIntent id and the server-rendered text (no hold date)', async () => {
    await call(holdNowBody())
    const piId = fake.state.paymentIntents.keys().next().value
    expect(consents()).toHaveLength(1)
    const text = await buildConsentText({
      locale: 'en',
      mode: 'hold_now',
      amountMinor: nearAmount(),
      currency: 'eur',
      holdDateIso: null,
    })
    expect(consents()[0]).toMatchObject({
      booking_id: bookings()[0].id,
      mode: 'hold_now',
      payment_intent_id: piId,
      text_version: CARD_CONSENT_VERSION,
      text_rendered: text,
      text_sha256: consentSha256(text),
      planned_hold_at: null,
      amount_minor: nearAmount(),
    })
  })

  it('writes the consent before the PaymentIntent and the transition after it', async () => {
    const original = fake.stripe.paymentIntents.create
    fake.stripe.paymentIntents.create = async (...a: Parameters<typeof original>) => {
      log.push('stripe:paymentIntents.create')
      return original(...a)
    }
    await call(holdNowBody())
    const consentAt = log.indexOf('insert:booking_payment_consents')
    const piAt = log.indexOf('stripe:paymentIntents.create')
    const transitionAt = log.indexOf('rpc:apply_payment_transition')
    expect(consentAt).toBeGreaterThanOrEqual(0)
    expect(consentAt).toBeLessThan(piAt)
    expect(piAt).toBeLessThan(transitionAt)
  })

  it('adds promoCode to the PaymentIntent metadata only when a promo applied', async () => {
    promoState.row = { discount_value: 10, max_uses: null, current_uses: 0, is_active: true }
    const withPromo = holdNowBody({ displayedAmountMinor: nearAmount(10) }, { promoCode: 'welcome10' })
    expect((await call(withPromo)).status).toBe(200)
    expect(fake.callsTo('paymentIntents.create')[0].params.metadata).toMatchObject({ promoCode: 'WELCOME10' })
  })

  it('sends no personal data in the PaymentIntent params, metadata or key', async () => {
    await call(holdNowBody())
    const c = fake.callsTo('paymentIntents.create')[0]
    expect(c.idempotencyKey ?? '').not.toMatch(/Anna|Novak|owner|example|\+420/)
    for (const p of ['Anna', 'Novak', OWNER, PHONE]) expect(JSON.stringify(c.params)).not.toContain(p)
  })

  it('a hold_now consent is still required', async () => {
    const { status, body: out } = await call(holdNowBody({ consent: false }))
    expect(status).toBe(422)
    expect(out.code).toBe('CONSENT_REQUIRED')
    expectNoWrites()
  })

  it('the 422 MODE_UNSUPPORTED answer no longer exists', async () => {
    const { body: out } = await call(holdNowBody())
    expect(out.code).not.toBe('MODE_UNSUPPORTED')
  })
})

describe('POST /api/card-checkout/intent: hold_now never double-holds (T-88-36)', () => {
  it('an existing hold PaymentIntent in requires_capture -> alreadyConfirmed, no new create, no cancel, no new consent', async () => {
    await call(holdNowBody())
    const piId = fake.state.paymentIntents.keys().next().value as string
    const pi = fake.state.paymentIntents.get(piId)!
    pi.status = 'requires_capture'
    pi.amount_capturable = pi.amount

    const { status, body: out } = await call(holdNowBody())
    expect(status).toBe(200)
    expect(out).toEqual({ alreadyConfirmed: true, bookingReference: bookings()[0].booking_reference })
    expect(fake.executed('paymentIntents.create')).toBe(1)
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
    expect(consents()).toHaveLength(1)
  })

  it('an unconfirmed earlier PaymentIntent is cancelled with the pi_void key, then a new one is created', async () => {
    await call(holdNowBody())
    const firstId = fake.state.paymentIntents.keys().next().value as string
    const { status, body: out } = await call(holdNowBody())
    expect(status).toBe(200)
    expect(out.clientSecret).toBeTruthy()

    const cancel = fake.callsTo('paymentIntents.cancel')
    expect(cancel).toHaveLength(1)
    expect(cancel[0].idempotencyKey).toBe(`pi_void:${firstId}`)
    expect(fake.state.paymentIntents.get(firstId)!.status).toBe('canceled')
    expect(fake.executed('paymentIntents.create')).toBe(2)

    const ids = [...fake.state.paymentIntents.keys()]
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0].hold_payment_intent_id).toBe(ids[1])
    expect(consents()).toHaveLength(2)
    expect(consents()[0].id).not.toBe(consents()[1].id)
    expect(consents()[1].payment_intent_id).toBe(ids[1])
    // The second create used the second consent's key, never the first one's.
    expect(fake.callsTo('paymentIntents.create')[1].idempotencyKey).toBe(
      `pi_now:${bookings()[0].id}:${consents()[1].id}`,
    )
  })

  it('a failed cancel of the predecessor does not stop the new hold', async () => {
    await call(holdNowBody())
    fake.failNextWith('paymentIntents.cancel', 'connection')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { status } = await call(holdNowBody())
    spy.mockRestore()
    expect(status).toBe(200)
    expect(fake.executed('paymentIntents.create')).toBe(2)
  })

  it('a stale hold id that Stripe does not know is ignored and a new PaymentIntent is created', async () => {
    await call(holdNowBody())
    const firstId = fake.state.paymentIntents.keys().next().value as string
    fake.state.paymentIntents.delete(firstId)
    const { status } = await call(holdNowBody())
    expect(status).toBe(200)
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
    expect(fake.state.paymentIntents.size).toBe(1)
  })

  it('a PaymentIntent connection failure -> 500 INTERNAL and the booking never reaches a hold id', async () => {
    fake.failNextWith('paymentIntents.create', 'connection')
    const { status, body: out } = await call(holdNowBody())
    expect(status).toBe(500)
    expect(out.code).toBe('INTERNAL')
    expect(out).not.toHaveProperty('clientSecret')
    expect(bookings()[0]).toMatchObject({ payment_state: 'none', hold_payment_intent_id: null })

    const retry = await call(holdNowBody())
    expect(retry.status).toBe(200)
    expect(bookings()[0].payment_state).toBe('checkout_pending')
  })

  it('a booking already confirmed for that attempt -> 200 alreadyConfirmed and no Stripe call', async () => {
    const confirmed = createFakePaymentsDb({
      nowMs: NOW,
      bookings: [{ attempt_id: ATTEMPT, leg: 'outbound', status: 'confirmed', booking_reference: 'PRG-20270101-ABCDEF' }],
    })
    confirmed.state.pricing_globals[0] = db.state.pricing_globals[0]
    db = confirmed
    dbHolder.client = loggingClient(db.client)
    const { status, body: out } = await call(holdNowBody())
    expect(status).toBe(200)
    expect(out).toEqual({ alreadyConfirmed: true, bookingReference: 'PRG-20270101-ABCDEF' })
    expect(fake.calls).toHaveLength(0)
  })
})

describe('POST /api/card-checkout/intent: consent', () => {
  it.each([
    ['false', { consent: false }],
    ['missing', { consent: undefined }],
    ["the string 'true'", { consent: 'true' }],
    ['the number 1', { consent: 1 }],
    ['an object', { consent: { accepted: true } }],
    ['null', { consent: null }],
  ])('consent %s -> 422 CONSENT_REQUIRED with no booking, consent row or Stripe call', async (_label, over) => {
    const { status, body: out } = await call(body(over))
    expect(status).toBe(422)
    expect(out.code).toBe('CONSENT_REQUIRED')
    expectNoWrites()
  })

  it('a client-supplied consent text is ignored: the stored text is the server rendering', async () => {
    await call({ ...body(), consentText: 'I agree to anything', text: 'forged' })
    expect(consents()[0].text_rendered).not.toContain('forged')
    expect(consents()[0].text_rendered).not.toContain('I agree to anything')
  })
})

describe('POST /api/card-checkout/intent: eligibility (D-09a)', () => {
  it('flag switched off between init and intent -> 422 NOT_ELIGIBLE, no write', async () => {
    seedSettings({ card_flow_mode: 'off' })
    const { status, body: out } = await call(body())
    expect(status).toBe(422)
    expect(out.code).toBe('NOT_ELIGIBLE')
    expectNoWrites()
  })

  it('email removed from the allowlist -> 422 NOT_ELIGIBLE, no write', async () => {
    seedSettings({ card_flow_canary_emails: ['someone-else@example.com'] })
    expect((await call(body())).body.code).toBe('NOT_ELIGIBLE')
    expectNoWrites()
  })

  it('an empty email -> 422 NOT_ELIGIBLE', async () => {
    const payload = body()
    delete (payload.bookingData as Record<string, string | undefined>).email
    const { status, body: out } = await call(payload)
    expect(status).toBe(422)
    expect(out.code).toBe('NOT_ELIGIBLE')
    expectNoWrites()
  })

  it.each(['round_trip', 'daily'])('%s is never eligible', async (tripType) => {
    const { body: out } = await call(body({}, { tripType, returnDate: '2027-01-18', returnTime: '10:00' }))
    expect(out.code).toBe('NOT_ELIGIBLE')
    expectNoWrites()
  })
})

describe('POST /api/card-checkout/intent: price and mode cross-checks', () => {
  it('displayedAmountMinor differs from the server amount -> 409 PRICE_CHANGED with the server amount, no write', async () => {
    const { status, body: out } = await call(body({ displayedAmountMinor: serverAmount() + 100 }))
    expect(status).toBe(409)
    expect(out).toMatchObject({ code: 'PRICE_CHANGED', amountMinor: serverAmount() })
    expectNoWrites()
  })

  it('88-REVIEW B-WR-05: a hold date other than the server one -> 409 HOLD_DATE_CHANGED with the new date, no write', async () => {
    const { status, body: out } = await call(body({ displayedHoldDateIso: '2027-01-14' }))
    expect(status).toBe(409)
    expect(out).toMatchObject({ code: 'HOLD_DATE_CHANGED', mode: 'setup', holdDateIso: '2027-01-13' })
    expectNoWrites()
  })

  it('88-REVIEW B-WR-05: a setup checkout that names no hold date is refused the same way', async () => {
    const payload = body()
    delete (payload as Record<string, unknown>).displayedHoldDateIso
    const { status, body: out } = await call(payload)
    expect(status).toBe(409)
    expect(out).toMatchObject({ code: 'HOLD_DATE_CHANGED', holdDateIso: '2027-01-13' })
    expectNoWrites()
  })

  it('a client that sends no amount at all is a malformed request, not a free booking', async () => {
    const payload = body()
    delete (payload as Record<string, unknown>).displayedAmountMinor
    expect((await call(payload)).status).toBe(400)
    expectNoWrites()
  })

  it("client 'setup' while the server decides hold_now -> 409 MODE_CHANGED with hold_now and null hold fields", async () => {
    // now + 50 h: the 72 h hold instant has already passed.
    const near = { pickupDate: '2027-01-12', pickupTime: '12:00' }
    const { status, body: out } = await call(body({ displayedAmountMinor: serverAmount('2027-01-12', '12:00') }, near))
    expect(status).toBe(409)
    expect(out).toMatchObject({ code: 'MODE_CHANGED', mode: 'hold_now', holdAtIso: null, holdDateIso: null })
    expectNoWrites()
  })

  it("client 'hold_now' while the server decides setup -> 409 MODE_CHANGED with the setup hold date", async () => {
    const { status, body: out } = await call(body({ mode: 'hold_now' }))
    expect(status).toBe(409)
    expect(out).toMatchObject({
      code: 'MODE_CHANGED',
      mode: 'setup',
      holdAtIso: '2027-01-13T09:00:00.000Z',
      holdDateIso: '2027-01-13',
    })
    expectNoWrites()
  })

  it('the price is recomputed from the server price table, whatever bookingData claims', async () => {
    const { body: out } = await call(body({}, { amountEur: '1', combinedTotal: '1', amountMinor: '1' }))
    expect(out.amountMinor).toBe(serverAmount())
    expect(bookings()[0].payment_amount_minor).toBe(serverAmount())
  })
})

describe('POST /api/card-checkout/intent: validation and shape', () => {
  it('a phone without a country code -> 422 INVALID_PHONE', async () => {
    const { status, body: out } = await call(body({}, { phone: '0725986855' }))
    expect(status).toBe(422)
    expect(out.code).toBe('INVALID_PHONE')
    expectNoWrites()
  })

  it('pickup 11 h out -> 422 LEAD_TIME', async () => {
    // now = 10:00 Prague on 2027-01-10; 21:00 the same day is 11 h away.
    const { status, body: out } = await call(body({}, { pickupDate: '2027-01-10', pickupTime: '21:00' }))
    expect(status).toBe(422)
    expect(out.code).toBe('LEAD_TIME')
    expectNoWrites()
  })

  it('pickup 13 h out passes the lead rule (it then fails the price cross-check, not the lead)', async () => {
    const { body: out } = await call(body({}, { pickupDate: '2027-01-10', pickupTime: '23:00' }))
    expect(out.code).not.toBe('LEAD_TIME')
  })

  it('malformed JSON -> 400 INVALID_REQUEST', async () => {
    const res = await POST(req(null, {}, '{not json'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
    expectNoWrites()
  })

  it.each([
    ['an unsupported currency', { currency: 'usd' }],
    ['an unknown mode', { mode: 'now' }],
    ['a non-integer amount', { displayedAmountMinor: 12.5 }],
    ['a zero amount', { displayedAmountMinor: 0 }],
  ])('%s -> 400 INVALID_REQUEST', async (_label, over) => {
    const { status, body: out } = await call(body(over))
    expect(status).toBe(400)
    expect(out.code).toBe('INVALID_REQUEST')
    expectNoWrites()
  })

  it('a missing attemptId -> 400 INVALID_REQUEST (one booking per attempt needs the key)', async () => {
    const payload = body()
    delete (payload.bookingData as Record<string, string | undefined>).attemptId
    expect((await call(payload)).status).toBe(400)
    expectNoWrites()
  })

  it('rate limited -> 429 and nothing is read or written', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, limit: 10 })
    const { status, body: out } = await call(body())
    expect(status).toBe(429)
    expect(out.code).toBe('RATE_LIMITED')
    expect(rateLimitMock).toHaveBeenCalledWith('/api/card-checkout/intent', '203.0.113.7')
    expectNoWrites()
  })

  it('a missing user agent stores an empty string', async () => {
    await call(body())
    expect(consents()[0].user_agent).toBe('')
  })
})

describe('POST /api/card-checkout/intent: retries and replay safety', () => {
  it('a second POST for the same attemptId updates the same booking, reuses the Customer and makes a new consent and SetupIntent', async () => {
    const first = await call(body({ displayedAmountMinor: serverAmount() + 1 }))
    expect(first.status).toBe(409) // PRICE_CHANGED: nothing written yet
    expect(bookings()).toHaveLength(0)

    const a = await call(body())
    const b = await call(body())
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(b.body.bookingReference).toBe(a.body.bookingReference)

    expect(fake.executed('customers.create')).toBe(1)
    expect(fake.callsTo('customers.update')).toHaveLength(0) // details unchanged
    expect(fake.executed('setupIntents.create')).toBe(2)
    expect(consents()).toHaveLength(2)
    expect(consents()[0].id).not.toBe(consents()[1].id)

    const siIds = [...fake.state.setupIntents.keys()]
    expect(bookings()[0].setup_intent_id).toBe(siIds[1])
    expect(bookings()[0].payment_state).toBe('checkout_pending')
    expect(db.state.booking_payment_events.filter((e) => e.kind === 'setup_started')).toHaveLength(2)
  })

  it('updates the Customer only when email, name or phone changed', async () => {
    seedSettings({ card_flow_canary_emails: [OWNER, 'other@example.com'] })
    await call(body())
    await call(body({}, { email: 'other@example.com' }))
    expect(fake.executed('customers.create')).toBe(1)
    const updates = fake.callsTo('customers.update')
    expect(updates).toHaveLength(1)
    expect(updates[0].params).toEqual({ email: 'other@example.com' })
    expect(updates[0].idempotencyKey).toBeUndefined()
  })

  it('88-REVIEW B-WR-03: a cancelled booking for that attemptId -> 409 ATTEMPT_CLOSED, never "already confirmed"', async () => {
    const cancelled = createFakePaymentsDb({
      nowMs: NOW,
      bookings: [{ attempt_id: ATTEMPT, leg: 'outbound', status: 'cancelled', booking_reference: 'PRG-20270101-CANCEL' }],
    })
    cancelled.state.pricing_globals[0] = db.state.pricing_globals[0]
    db = cancelled
    dbHolder.client = loggingClient(db.client)
    const { status, body: out } = await call(body())
    expect(status).toBe(409)
    expect(out).toMatchObject({ code: 'ATTEMPT_CLOSED' })
    expect(out).not.toHaveProperty('bookingReference')
    expect(fake.calls).toHaveLength(0)
    expect(bookings()[0].status).toBe('cancelled')
  })

  it('88-REVIEW B-WR-02: an unpaid pay-now row of that attemptId is never overwritten by the card flow -> 409 ATTEMPT_CLOSED', async () => {
    const payNow = createFakePaymentsDb({
      nowMs: NOW,
      bookings: [
        { attempt_id: ATTEMPT, leg: 'outbound', status: 'unpaid', payment_mode: 'pay_now', payment_intent_id: 'pi_paynow', booking_reference: 'PRG-PAYNOW' },
      ],
    })
    payNow.state.pricing_globals[0] = db.state.pricing_globals[0]
    db = payNow
    dbHolder.client = loggingClient(db.client)
    const { status, body: out } = await call(body())
    expect(status).toBe(409)
    expect(out).toMatchObject({ code: 'ATTEMPT_CLOSED' })
    expect(bookings()[0]).toMatchObject({ payment_mode: 'pay_now', payment_intent_id: 'pi_paynow', payment_state: 'none' })
    expect(fake.calls).toHaveLength(0)
  })

  it('88-REVIEW B-WR-02: a pay-now capture never overwrites the card_hold row of the same attempt', async () => {
    const card = createFakePaymentsDb({
      nowMs: NOW,
      bookings: [
        { attempt_id: ATTEMPT, leg: 'outbound', status: 'unpaid', payment_mode: 'card_hold', payment_state: 'checkout_pending', setup_intent_id: 'seti_1', booking_reference: 'PRG-CARD' },
      ],
    })
    db = card
    dbHolder.client = loggingClient(db.client)
    const row = buildBookingRow({ bookingReference: 'PRG-PAYNOW2', tripType: 'transfer', passengers: '1', luggage: '0' }, 'pi_new', 'unpaid')
    await expect(captureUnpaidBooking(row, ATTEMPT, 'outbound', 'pay_now')).rejects.toBeInstanceOf(AttemptFlowConflictError)
    expect(bookings()[0]).toMatchObject({ payment_mode: 'card_hold', booking_reference: 'PRG-CARD', payment_intent_id: null })
  })

  it('a booking already confirmed for that attemptId -> 200 alreadyConfirmed and no Stripe call', async () => {
    const confirmed = createFakePaymentsDb({
      nowMs: NOW,
      bookings: [{ attempt_id: ATTEMPT, leg: 'outbound', status: 'confirmed', booking_reference: 'PRG-20270101-ABCDEF' }],
    })
    confirmed.state.pricing_globals[0] = db.state.pricing_globals[0]
    db = confirmed
    dbHolder.client = loggingClient(db.client)
    const { status, body: out } = await call(body())
    expect(status).toBe(200)
    expect(out).toEqual({ alreadyConfirmed: true, bookingReference: 'PRG-20270101-ABCDEF' })
    expect(fake.calls).toHaveLength(0)
    expect(consents()).toHaveLength(0)
    expect(bookings()[0].status).toBe('confirmed')
  })

  it('a SetupIntent connection failure -> 500 INTERNAL; the booking stays captured and never reaches checkout_pending', async () => {
    fake.failNextWith('setupIntents.create', 'connection')
    const { status, body: out } = await call(body())
    expect(status).toBe(500)
    expect(out.code).toBe('INTERNAL')
    expect(out).not.toHaveProperty('clientSecret')
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0]).toMatchObject({ status: 'unpaid', payment_state: 'none', setup_intent_id: null })
    expect(db.state.booking_payment_events).toHaveLength(0)
    expect(fake.state.setupIntents.size).toBe(0)

    // The client retries: the Customer create replays by its key (one Customer), the checkout proceeds.
    const retry = await call(body())
    expect(retry.status).toBe(200)
    expect(bookings()).toHaveLength(1)
    expect(bookings()[0].payment_state).toBe('checkout_pending')
    expect(fake.state.customers.size).toBe(1)
    expect(fake.callsTo('customers.create')[1].replayed).toBe(true)
  })

  it('the 500 body and the log carry no personal data', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.failNextWith('setupIntents.create', 'connection')
    const { body: out } = await call(body())
    const logged = JSON.stringify(spy.mock.calls)
    spy.mockRestore()
    for (const p of ['Anna', 'Novak', OWNER, PHONE]) {
      expect(JSON.stringify(out)).not.toContain(p)
      expect(logged).not.toContain(p)
    }
  })
})

describe('ensureStripeCustomer', () => {
  const booking = {
    id: 'b0000000-0000-4000-8000-000000000001',
    client_first_name: 'Anna',
    client_last_name: 'Novak',
    client_email: 'a@example.com',
    client_phone: PHONE,
  }

  beforeEach(() => {
    fake = createFakeStripe()
    stripeHolder.stripe = fake.stripe
  })

  it('creates a Customer with the booking id as its only metadata and the deterministic key', async () => {
    const id = await ensureStripeCustomer(booking)
    const c = fake.callsTo('customers.create')[0]
    expect(c.params).toEqual({ email: 'a@example.com', name: 'Anna Novak', phone: PHONE, metadata: { prestigoBookingId: booking.id } })
    expect(c.idempotencyKey).toBe(`cus:${booking.id}`)
    expect(fake.state.customers.has(id)).toBe(true)
  })

  it('retrying the create after a lost response replays the same Customer', async () => {
    const a = await ensureStripeCustomer(booking)
    const b = await ensureStripeCustomer(booking)
    expect(b).toBe(a)
    expect(fake.state.customers.size).toBe(1)
  })

  it('reuses an existing id and sends no update when nothing changed', async () => {
    const id = await ensureStripeCustomer(booking)
    expect(await ensureStripeCustomer({ ...booking, stripe_customer_id: id })).toBe(id)
    expect(fake.callsTo('customers.update')).toHaveLength(0)
    expect(fake.executed('customers.create')).toBe(1)
  })

  it('updates only the changed fields', async () => {
    const id = await ensureStripeCustomer(booking)
    await ensureStripeCustomer({ ...booking, stripe_customer_id: id, client_phone: '+420111222333', client_last_name: 'Svoboda' })
    const u = fake.callsTo('customers.update')
    expect(u).toHaveLength(1)
    expect(u[0].params).toEqual({ name: 'Anna Svoboda', phone: '+420111222333' })
  })

  it('recovers when the same key was used with other details (client changed the email before the id was saved)', async () => {
    await ensureStripeCustomer(booking)
    const id2 = await ensureStripeCustomer({ ...booking, client_email: 'changed@example.com' })
    expect(fake.state.customers.size).toBe(2)
    expect(fake.state.customers.get(id2)?.email).toBe('changed@example.com')
    const keys = fake.callsTo('customers.create').map((c) => c.idempotencyKey)
    expect(keys[0]).toBe(`cus:${booking.id}`)
    expect(keys[2]).toMatch(new RegExp(`^cus:${booking.id}:r[0-9a-f]{8}$`))
  })

  it('does not swallow other Stripe errors', async () => {
    fake.failNextWith('customers.create', 'connection')
    await expect(ensureStripeCustomer(booking)).rejects.toMatchObject({ type: 'StripeConnectionError' })
  })
})

describe('lib/payments/stripe conventions', () => {
  it('idempotency keys have the documented shapes and carry ids only', () => {
    const id = 'b0000000-0000-4000-8000-000000000001'
    expect(stripeKeys.customer(id)).toBe(`cus:${id}`)
    expect(stripeKeys.setup(id, 'c1')).toBe(`si:${id}:c1`)
    expect(stripeKeys.holdNow(id, 'c1')).toBe(`pi_now:${id}:c1`)
    expect(stripeKeys.voidHoldNow('pi_1')).toBe('pi_void:pi_1')
    expect(stripeKeys.hold(id, 2)).toBe(`hold:${id}:2`)
    expect(stripeKeys.release(id, 2)).toBe(`rel:${id}:2`)
    expect(stripeKeys.capture(id, 2)).toBe(`cap:${id}:2`)
    expect(stripeKeys.charge(id, 2)).toBe(`chg:${id}:2`)
    expect(stripeKeys.difference(id, 2)).toBe(`diff:${id}:2`)
    expect(stripeKeys.refund(id, 'full')).toBe(`refund:${id}:full`)
    expect(stripeKeys.link(id, 3)).toBe(`link:${id}:3`)
    expect(stripeKeys.link(id, 'r1')).toBe(`link:${id}:r1`)
  })

  it('cardMetadata is kind, booking id, attempt and reference, plus a promo code only when non-empty', () => {
    const input = { bookingId: 'b1', attempt: 2, bookingReference: 'PRG-1' }
    expect(cardMetadata('card_hold', input)).toEqual({
      kind: 'card_hold',
      cofBookingId: 'b1',
      attempt: '2',
      bookingReference: 'PRG-1',
    })
    expect(cardMetadata('card_hold', { ...input, promoCode: '' })).not.toHaveProperty('promoCode')
    expect(cardMetadata('card_hold', { ...input, promoCode: 'WELCOME10' })).toHaveProperty('promoCode', 'WELCOME10')
    // The legacy webhook routes on this key; a card object must never carry it.
    expect(cardMetadata('card_setup', input)).not.toHaveProperty('bookingId')
  })

  it('classifies Stripe errors', () => {
    const err = (type: string, extra: Record<string, unknown> = {}) => Object.assign(new Error('x'), { type, ...extra })
    expect(classifyStripeError(err('StripeCardError', { code: 'card_declined' }))).toBe('card_declined')
    expect(classifyStripeError(err('StripeCardError', { code: 'authentication_required' }))).toBe('auth_required')
    expect(classifyStripeError(err('StripeConnectionError'))).toBe('transient')
    expect(classifyStripeError(err('StripeAPIError'))).toBe('transient')
    expect(classifyStripeError(err('StripeAPIError', { statusCode: 503 }))).toBe('transient')
    expect(classifyStripeError(err('StripeAPIError', { statusCode: 400 }))).toBe('invalid')
    expect(classifyStripeError(err('StripeInvalidRequestError'))).toBe('invalid')
    // 88-REVIEW A-WR-03: a key reused with other parameters is its own class (look up, void, next attempt).
    expect(classifyStripeError(err('StripeIdempotencyError'))).toBe('idempotency')
    // 88-REVIEW A-WR-01: the same key still in flight elsewhere (409) is busy, never a definitive failure.
    expect(classifyStripeError(err('StripeIdempotencyError', { statusCode: 409 }))).toBe('transient')
    expect(classifyStripeError(err('StripeInvalidRequestError', { statusCode: 409, code: 'idempotency_key_in_use' }))).toBe('transient')
    expect(classifyStripeError(err('StripeInvalidRequestError', { code: 'lock_timeout' }))).toBe('transient')
    expect(classifyStripeError(err('StripeRateLimitError', { statusCode: 429 }))).toBe('transient')
    // 88-REVIEW A-WR-02: our own key refused is configuration, never a client decline.
    expect(classifyStripeError(err('StripeAuthenticationError', { statusCode: 401 }))).toBe('config')
    expect(classifyStripeError(err('StripePermissionError', { statusCode: 403 }))).toBe('config')
    expect(classifyStripeError(err('StripeInvalidRequestError', { code: 'api_key_expired' }))).toBe('config')
    expect(classifyStripeError(err('SomethingElse', { statusCode: 401 }))).toBe('config')
    expect(classifyStripeError(new Error('plain'))).toBe('invalid')
    expect(classifyStripeError(null)).toBe('invalid')
  })

  it('stripeErrorCode is the decline code, else the code, else unknown, clamped to 60', () => {
    expect(stripeErrorCode({ decline_code: 'insufficient_funds', code: 'card_declined' })).toBe('insufficient_funds')
    expect(stripeErrorCode({ code: 'card_declined' })).toBe('card_declined')
    expect(stripeErrorCode(new Error('boom'))).toBe('unknown')
    expect(stripeErrorCode({ code: 'x'.repeat(100) })).toHaveLength(60)
  })
})

describe('fake Stripe self-checks (the double every later plan trusts)', () => {
  it('replays the same key and params, rejects different params, never stores a connection failure', async () => {
    const f = createFakeStripe()
    const a = await f.stripe.customers.create({ metadata: { k: '1' } }, { idempotencyKey: 'k1' })
    const b = await f.stripe.customers.create({ metadata: { k: '1' } }, { idempotencyKey: 'k1' })
    expect(b.id).toBe(a.id)
    await expect(f.stripe.customers.create({ metadata: { k: '2' } }, { idempotencyKey: 'k1' })).rejects.toMatchObject({
      type: 'StripeIdempotencyError',
    })
    f.failNextWith('customers.create', 'connection')
    await expect(f.stripe.customers.create({}, { idempotencyKey: 'k2' })).rejects.toMatchObject({ type: 'StripeConnectionError' })
    expect(f.state.idempotency.has('k2')).toBe(false)
    const c = await f.stripe.customers.create({}, { idempotencyKey: 'k2' })
    expect(c.id).not.toBe(a.id)
  })

  it('manual-capture holds: pm_ok authorises, one capture only, amount_to_capture bounded, expiry cancels', async () => {
    const f = createFakeStripe()
    const pi = await f.stripe.paymentIntents.create(
      { amount: 10_000, currency: 'eur', capture_method: 'manual', confirm: true, off_session: true, payment_method: 'pm_ok', customer: 'cus_x', metadata: { kind: 'card_hold', cofBookingId: 'b1' } },
      { idempotencyKey: 'hold:b1:1' },
    )
    expect(pi).toMatchObject({ status: 'requires_capture', amount_capturable: 10_000 })
    await expect(f.stripe.paymentIntents.capture(pi.id, { amount_to_capture: 10_001 })).rejects.toMatchObject({ type: 'StripeInvalidRequestError' })
    const done = await f.stripe.paymentIntents.capture(pi.id, { amount_to_capture: 9_000 })
    expect(done).toMatchObject({ status: 'succeeded', amount_received: 9_000 })
    await expect(f.stripe.paymentIntents.capture(pi.id, {})).rejects.toMatchObject({ code: 'payment_intent_unexpected_state' })

    const held = await f.stripe.paymentIntents.create({ amount: 500, currency: 'eur', capture_method: 'manual', confirm: true, payment_method: 'pm_ok', metadata: { cofBookingId: 'b2' } })
    f.expireHold(held.id, 'expired')
    expect((await f.stripe.paymentIntents.retrieve(held.id)).status).toBe('canceled')
    const found = await f.stripe.paymentIntents.search({ query: "metadata['cofBookingId']:'b1'" })
    expect(found.data.map((p: { id: string }) => p.id)).toEqual([pi.id])
  })

  it('scripted off-session outcomes: insufficient funds and authentication required', async () => {
    const f = createFakeStripe()
    const create = (pm: string) =>
      f.stripe.paymentIntents.create({ amount: 100, currency: 'eur', confirm: true, off_session: true, payment_method: pm })
    const declined = await create('pm_decline_insufficient').catch((e) => e)
    expect(classifyStripeError(declined)).toBe('card_declined')
    expect(stripeErrorCode(declined)).toBe('insufficient_funds')
    const auth = await create('pm_auth_required').catch((e) => e)
    expect(classifyStripeError(auth)).toBe('auth_required')
    expect(auth.payment_intent.status).toBe('requires_action')
    expect((await create('pm_ok')).status).toBe('succeeded')
  })
})
