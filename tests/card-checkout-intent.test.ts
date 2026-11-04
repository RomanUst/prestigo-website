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
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { computeCombinedTotalMinor, computeOutboundLegTotal } from '@/lib/server-pricing'
import { computeHoldAt } from '@/lib/payments/timing'
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

function body(over: Record<string, unknown> = {}, data: Record<string, string> = {}) {
  return {
    bookingData: bookingData(data),
    currency: 'eur',
    mode: 'setup',
    consent: true,
    displayedAmountMinor: serverAmount(),
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
