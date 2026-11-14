// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 89 plan 89-19 (tracer; HOLD-06, CANC-01, CANC-02, CASH-01..04, criterion 5): the three money lifecycles of the
 * cancellation policy, end to end, through the REAL route handlers and engine modules, over the in-memory payments
 * database and the fake Stripe. Same world as tests/payments-lifecycle.test.ts (Phase 88): the only doubles are the
 * outside world (Stripe, the database, Resend, QStash, GA4, the operator mail, the admin session, the outbox) and a
 * virtual clock. No engine function is replaced.
 *
 *   LC1  late self-cancel from the manage link keeps the hold, the operator charges part of it, the rest is released,
 *        the booking can not be charged again
 *   LC2  driver no-show request (too early, then after the wait), operator confirm, hold lapsed, charge declined,
 *        recovery link paid, case closed
 *   LC3  cash booking: no hold in any tick, completion collects nothing, the driver confirms, the operator reverses,
 *        a second confirmation; and a card charge during the trip that is declined, then the driver is paid in cash
 *   LC4  every entry point refuses a partner booking before any Stripe or token work (criterion 5)
 */

process.env.CRON_SECRET = 'policy-cron-secret'
process.env.RESEND_API_KEY = 're_test'
process.env.MANAGER_EMAIL = 'ops@example.com'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

const { world, stripeStub, afterQueue, rateLimitMock, pricingConfigMock, resendSend, managerAlert, ga4, qstash, deactivate, noShowAlert, outbox } =
  vi.hoisted(() => ({
    world: {
      client: null as unknown,
      stripe: null as unknown,
      processed: new Set<string>(),
      /** booking_status_log rows (read by the no-show module). */
      statusLog: [] as Array<Record<string, unknown>>,
      /** driver_assignments: trip_token -> { id, driver_id, status, booking_id }. */
      assignments: [] as Array<Record<string, unknown>>,
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
    noShowAlert: vi.fn(),
    outbox: { enqueue: vi.fn() },
  }))

const { routeDistanceMock } = vi.hoisted(() => ({ routeDistanceMock: vi.fn() }))
// Phase 91 (STOP-02): the checkout prices on the server's Google Routes distance. These fixtures used to send
// distanceKm; the mock returns the same distance so the assertions stay unchanged.
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: routeDistanceMock }))

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
  sendNoShowRequestAlert: noShowAlert,
}))
vi.mock('@/lib/email-log', () => ({ logEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/outbox', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/outbox')>()),
  enqueueOutboxEvent: outbox.enqueue,
  dispatchAfterResponse: vi.fn(),
}))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: qstash }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: ga4 }))

import { POST as initPOST } from '@/app/api/card-checkout/init/route'
import { POST as intentPOST } from '@/app/api/card-checkout/intent/route'
import { POST as webhookPOST } from '@/app/api/webhooks/stripe/route'
import { GET as tickGET } from '@/app/api/cron/payment-tick/route'
import { PATCH as adminPATCH } from '@/app/api/admin/bookings/route'
import { POST as manageCancelPOST } from '@/app/api/manage/cancel/route'
import { POST as feePOST } from '@/app/api/admin/bookings/[id]/fee/route'
import { POST as noShowPOST } from '@/app/api/admin/bookings/[id]/no-show/route'
import { POST as driverPOST } from '@/app/api/driver/trip/[token]/progress/route'
import { cancelBooking } from '@/lib/payments/cancel'
import { runFeeCharge, runCashCardCharge, waiveFee, chargeFromCollected } from '@/lib/payments/fee'
import { settleCash, reopenCash } from '@/lib/payments/cash'
import { driverConfirmCash, loadDriverTripForStep } from '@/lib/driver-trip-step'
import { ensureManageToken, resolveManageToken, newManageToken } from '@/lib/manage-link'
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

// Virtual timeline. Pickup 2027-01-16 10:00 Prague (09:00Z); hold lead 72 h -> hold_at 2027-01-13 09:00Z.
// The booking is made under the stored default terms: free until one hour before the pickup (08:00Z).
const NOW0 = Date.parse('2027-01-10T09:00:00Z')
const PICKUP_UTC = '2027-01-16T09:00:00.000Z'
const PICKUP_MS = Date.parse(PICKUP_UTC)
const HOLD_AT_MS = Date.parse('2027-01-13T09:00:00.000Z')
const MINUTE = 60_000
const HOUR = 3_600_000

const OWNER = 'owner@example.com'
const MANAGER = 'ops@example.com'
const ATTEMPT = '11111111-1111-4111-8111-111111111111'
const DRIVER_ID = 'a0000002-0000-4000-8000-000000000002'
const TRIP_TOKEN = 'a0000004-0000-4000-8000-000000000004'

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

/** set_no_show_request (migration 084): request only while on_location and no request is open; clear is idempotent. */
function setNoShowRequestRpc(args: Row) {
  const b = db.state.bookings.find((r) => r.id === args.p_booking_id)
  if (!b) return { data: { applied: false, no_show_requested_at: null, status: null }, error: null }
  if (args.p_action === 'clear') {
    const had = Boolean(b.no_show_requested_at)
    b.no_show_requested_at = null
    return { data: { applied: had, no_show_requested_at: null, status: b.status }, error: null }
  }
  if (b.status !== 'on_location' || b.no_show_requested_at) {
    return { data: { applied: false, no_show_requested_at: b.no_show_requested_at ?? null, status: b.status }, error: null }
  }
  b.no_show_requested_at = new Date().toISOString()
  world.statusLog.push({
    booking_id: b.id,
    event: 'no_show_requested',
    created_at: b.no_show_requested_at,
    actor_type: args.p_actor_type,
    actor_id: args.p_actor_id,
  })
  return { data: { applied: true, no_show_requested_at: b.no_show_requested_at, status: b.status }, error: null }
}

/** A thenable query builder over plain rows: eq filters, order by created_at desc, limit, single. */
function rowsBuilder(source: () => Row[]) {
  const filters: Array<[string, unknown]> = []
  let limit: number | null = null
  const run = () => {
    let rows = source().filter((r) => filters.every(([c, v]) => r[c] === v))
    rows = [...rows].sort((a, c) => Date.parse(String(c.created_at ?? 0)) - Date.parse(String(a.created_at ?? 0)))
    return limit === null ? rows : rows.slice(0, limit)
  }
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return b
    },
    order: () => b,
    limit: (n: number) => {
      limit = n
      return b
    },
    single: async () => {
      const rows = run()
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } }
    },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve),
  }
  return b
}

/** The assignment lookup reads the LIVE booking row, like the real join does on every request. */
function assignmentRows(): Row[] {
  return world.assignments.map((a) => {
    const b = db.state.bookings.find((r) => r.id === a.booking_id)!
    return {
      ...a,
      bookings: b && {
        id: b.id,
        status: b.status,
        driver_id: b.driver_id ?? null,
        booking_source: b.booking_source,
        amount_eur: 120,
        pickup_utc: b.pickup_utc ?? null,
        pickup_date: b.pickup_date,
        pickup_time: b.pickup_time,
        origin_lat: null,
        origin_lng: null,
        origin_address: b.origin_address ?? 'Prague Airport',
        completed_at: b.completed_at ?? null,
        no_show_requested_at: b.no_show_requested_at ?? null,
        payment_mode: b.payment_mode,
        payment_state: b.payment_state,
        recovery_link_id: b.recovery_link_id ?? null,
      },
    }
  })
}

/** Tables and RPCs the payments fake does not model: processed webhook events, promo codes, the status CAS, no-show. */
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
      if (name === 'set_no_show_request') return setNoShowRequestRpc(args)
      if (name === 'claim_promo_code') return { data: null, error: null }
      return target.client.rpc(name, args)
    },
    from: (table: string) => {
      if (table === 'stripe_processed_events') return processedTable
      if (table === 'promo_codes') return promoTable
      if (table === 'booking_status_log') return rowsBuilder(() => world.statusLog)
      if (table === 'driver_assignments') return rowsBuilder(assignmentRows)
      if (table === 'drivers') return rowsBuilder(() => [{ id: DRIVER_ID, name: 'John Driver' }])
      return target.client.from(table)
    },
  }
}

function bindDb(next: FakePaymentsDb) {
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
    originLat: '50.0755',
    originLng: '14.4378',
    destinationLat: '49.1951',
    destinationLng: '16.6068',
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
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (policy-lifecycle)' },
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

async function completeTrip(id: string, from = 'confirmed') {
  const res = await adminPATCH(jsonRequest('http://localhost/api/admin/bookings', { id, status: 'completed', expected_status: from }, 'PATCH'))
  await flushAfter()
  return res
}

/** POST /api/manage/cancel with the secret link token in the body. */
async function manageCancel(token: string, acknowledge: 'free' | 'late') {
  const res = await manageCancelPOST(jsonRequest('http://localhost/api/manage/cancel', { token, acknowledge }))
  await flushAfter()
  return { status: res.status, json: (await res.json()) as Row }
}

/** POST /api/admin/bookings/[id]/fee. */
async function fee(id: string, body: Row) {
  const res = await feePOST(jsonRequest(`http://localhost/api/admin/bookings/${id}/fee`, body), { params: Promise.resolve({ id }) })
  await flushAfter()
  return { status: res.status, json: (await res.json()) as Row }
}

/** POST /api/admin/bookings/[id]/no-show. */
async function adminNoShow(id: string, body: Row) {
  const res = await noShowPOST(jsonRequest(`http://localhost/api/admin/bookings/${id}/no-show`, body), { params: Promise.resolve({ id }) })
  await flushAfter()
  return { status: res.status, json: (await res.json()) as Row }
}

/** POST /api/driver/trip/[token]/progress. */
async function driver(body: Row, token = TRIP_TOKEN) {
  const res = await driverPOST(jsonRequest(`http://localhost/api/driver/trip/${token}/progress`, body), { params: Promise.resolve({ token }) })
  await flushAfter()
  return { status: res.status, json: (await res.json()) as Row }
}

// ── world readers ──────────────────────────────────────────────────────────────────────────────────────────────────

const rowOf = (id: string) => db.state.bookings.find((b) => b.id === id)!
const ledger = (id: string) => db.state.booking_payment_events.filter((e) => e.booking_id === id)
const moneyKinds = (id: string) => ledger(id).map((e) => e.kind as string).filter((k) => k !== 'email_sent' && k !== 'alert_sent')
const emailKeys = (id: string) =>
  ledger(id)
    .filter((e) => e.kind === 'email_sent' && !String(e.event_key).endsWith(':send_failed'))
    .map((e) => e.event_key as string)
const alertKeys = (id: string) => ledger(id).filter((e) => e.kind === 'alert_sent').map((e) => e.event_key as string)
const mailsTo = (addr: string) => resendSend.mock.calls.filter((c) => ((c[0] as { to: string[] }).to ?? []).includes(addr))
const piCreates = () => fake.callsTo('paymentIntents.create')
const captures = () => fake.callsTo('paymentIntents.capture')
const feeCase = (id: string) => db.state.booking_fee_cases.find((c) => c.booking_id === id)

// ── flow steps ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface InitOut {
  eligible: boolean
  mode?: string
  holdDateIso?: string
  cashAvailable?: boolean
  policy: { freeUntilIso: string; freeUntilPassed: boolean }
}

/** init -> intent: one unpaid booking (card hold or pay cash to the driver), a SetupIntent, nothing charged. */
async function startBooking(payment: 'card' | 'cash') {
  const init = await initPOST(jsonRequest('http://localhost/api/card-checkout/init', { bookingData: bookingData(), currency: 'eur' }))
  const initOut = (await init.json()) as InitOut
  expect(initOut).toMatchObject({ eligible: true, mode: 'setup', amountMinor: serverAmount() })

  const res = await intentPOST(
    jsonRequest('http://localhost/api/card-checkout/intent', {
      bookingData: bookingData(),
      currency: 'eur',
      mode: 'setup',
      payment,
      consent: true,
      displayedAmountMinor: serverAmount(),
      displayedHoldDateIso: initOut.holdDateIso,
      displayedFreeUntilIso: initOut.policy.freeUntilIso,
      displayedFreeUntilPassed: initOut.policy.freeUntilPassed,
    }),
  )
  expect(res.status).toBe(200)
  const out = (await res.json()) as Row
  const booking = db.state.bookings[0]
  // pickup_utc is a GENERATED column of the live table (D-22); the fake does not generate it.
  booking.pickup_utc = PICKUP_UTC
  return { id: booking.id as string, reference: out.bookingReference as string, setupIntentId: booking.setup_intent_id as string, out }
}

async function saveCard(setupIntentId: string) {
  const si = fake.state.setupIntents.get(setupIntentId)!
  Object.assign(si, { status: 'succeeded', payment_method: 'pm_ok' })
  const result = await deliver(fake.buildEvent('setup_intent.succeeded', si))
  expect(result.status).toBe(200)
}

/** A card booking with a card saved and the scheduled hold placed by the tick. */
async function bookAndHold() {
  const t = await startBooking('card')
  setNow(NOW0 + 5 * MINUTE)
  await saveCard(t.setupIntentId)
  setNow(HOLD_AT_MS + MINUTE)
  const tick = await runTick()
  expect(tick.json).toMatchObject({ ok: true, placed: 1, errors: [] })
  const holdId = rowOf(t.id).hold_payment_intent_id as string
  expect(holdId).toMatch(/^pi_/)
  return { ...t, holdId, amount: serverAmount() }
}

/** The assigned driver: the booking row and an accepted assignment behind the secret trip token. */
function assignDriver(bookingId: string) {
  rowOf(bookingId).driver_id = DRIVER_ID
  world.assignments.push({ id: 'assign-1', driver_id: DRIVER_ID, status: 'accepted', trip_token: TRIP_TOKEN, booking_id: bookingId })
}

beforeEach(() => {
  routeDistanceMock.mockReset()
  routeDistanceMock.mockResolvedValue({ ok: true, distanceKm: 50, durationMin: 40 })
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW0)
  afterQueue.length = 0
  world.processed.clear()
  world.statusLog.length = 0
  world.assignments.length = 0
  fake = createFakeStripe({ nowSec: () => Math.floor(Date.now() / 1000) })
  world.stripe = fake.stripe
  const fresh = createFakePaymentsDb({ nowMs: NOW0 })
  Object.assign(fresh.state.pricing_globals[0], {
    card_flow_mode: 'canary',
    card_flow_canary_emails: [OWNER],
    payment_hold_lead_hours: 72,
  })
  bindDb(fresh)
  pricingConfigMock.mockResolvedValue(PRICING)
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  resendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  managerAlert.mockResolvedValue(undefined)
  noShowAlert.mockResolvedValue(undefined)
  outbox.enqueue.mockResolvedValue(true)
  ga4.mockResolvedValue(true)
  qstash.mockResolvedValue(undefined)
  deactivate.mockImplementation(async (id: string) => {
    await fake.stripe.paymentLinks.update(id, { active: false })
  })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('LC1 tracer: late self-cancel from the manage link -> the hold is kept -> a partial capture -> closed', () => {
  it('keeps the hold, captures only what the operator chose, releases the rest and can not be charged again', async () => {
    const t = await bookAndHold()
    const hold = fake.state.paymentIntents.get(t.holdId)!
    expect(hold).toMatchObject({ status: 'requires_capture', amount: t.amount })
    expect(rowOf(t.id).cancel_policy_version).toEqual(expect.any(String)) // the terms are stored (canary owner)

    // The client's secret link, made from the stored policy.
    const token = await ensureManageToken(t.id)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    // Free until 08:00Z. A client who saw "free" and comes back late cancels nothing and learns the current outcome.
    setNow(PICKUP_MS - 30 * MINUTE)
    const stale = await manageCancel(token!, 'free')
    expect(stale.status).toBe(409)
    expect(stale.json).toMatchObject({ code: 'POLICY_CHANGED', outcome: 'late' })
    expect(rowOf(t.id).status).toBe('confirmed')
    expect(feeCase(t.id)).toBeUndefined()
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)

    // The client confirms the late outcome: cancelled, the hold untouched, a pending case, nothing refunded or released.
    const late = await manageCancel(token!, 'late')
    expect(late.status).toBe(200)
    expect(late.json).toMatchObject({ ok: true, outcome: 'late', money: 'kept' })
    expect(rowOf(t.id)).toMatchObject({ status: 'cancelled', payment_state: 'authorized', hold_payment_intent_id: t.holdId, fee_case_status: 'pending' })
    expect(fake.state.paymentIntents.get(t.holdId)).toMatchObject({ status: 'requires_capture', amount_capturable: t.amount })
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
    expect(captures()).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
    const opened = feeCase(t.id)!
    expect(opened).toMatchObject({ kind: 'late_cancel', status: 'pending', base_minor: t.amount, currency: 'eur' })
    expect(opened.proposed_minor as number).toBeGreaterThan(0)
    expect(opened.proposed_minor as number).toBeLessThanOrEqual(t.amount)
    expect(alertKeys(t.id)).toContain(`alert:fee_decision_needed:${t.id}`)

    // A repeat cancel is a success and changes nothing. The sweep never collects or releases a cancelled booking.
    const again = await manageCancel(token!, 'late')
    expect(again.json).toMatchObject({ ok: true, alreadyCancelled: true })
    setNow(PICKUP_MS + 3 * HOUR)
    expect((await runTick()).json).toMatchObject({ ok: true, captured: 0, errors: [] })
    expect(captures()).toHaveLength(0)
    expect(fake.state.paymentIntents.get(t.holdId)!.status).toBe('requires_capture')

    // The operator charges part of the hold: one capture of that amount, the rest is released by the partial capture.
    const chosen = Math.floor(t.amount / 2)
    expect(chosen).toBeGreaterThan(0)
    const charged = await fee(t.id, { action: 'charge', amount_minor: chosen })
    expect(charged).toEqual({ status: 200, json: { outcome: 'ok' } })
    expect(captures()).toHaveLength(1)
    expect(captures()[0]).toMatchObject({ targetId: t.holdId, params: { amount_to_capture: chosen } })
    expect(fake.state.paymentIntents.get(t.holdId)).toMatchObject({ status: 'succeeded', amount_received: chosen, amount_capturable: 0 })
    expect(rowOf(t.id)).toMatchObject({ status: 'cancelled', payment_state: 'captured', captured_amount_minor: chosen, payment_intent_id: t.holdId })
    expect(feeCase(t.id)).toMatchObject({ status: 'charged', decided_minor: chosen })
    expect(rowOf(t.id).fee_case_status).toBe('charged')
    const feeMails = emailKeys(t.id).filter((k) => k.startsWith('email:fee_charged:'))
    expect(feeMails).toEqual([`email:fee_charged:${opened.id}`])
    expect(mailsTo(OWNER).length).toBeGreaterThanOrEqual(3) // card_saved, hold_placed, fee_charged

    // It can not be charged again, by any route action, a sweep or a settle.
    const piBefore = piCreates().length
    const mailsBefore = mailsTo(OWNER).length
    expect((await fee(t.id, { action: 'charge', amount_minor: chosen })).status).toBe(422)
    expect((await fee(t.id, { action: 'charge', amount_minor: 100 })).status).toBe(422)
    expect((await fee(t.id, { action: 'waive', reason: 'goodwill' })).status).toBe(422)
    expect((await fee(t.id, { action: 'charge_saved_card', note: 'try again' })).status).toBe(422)
    setNow(PICKUP_MS + 5 * HOUR)
    await runTick()
    expect(captures()).toHaveLength(1)
    expect(piCreates()).toHaveLength(piBefore)
    expect(mailsTo(OWNER)).toHaveLength(mailsBefore)
    expect(rowOf(t.id).captured_amount_minor).toBe(chosen)
    expect(emailKeys(t.id).filter((k) => k.startsWith('email:fee_charged:'))).toHaveLength(1)
  })

  it('a self-cancel in time is free: the hold is voided, no case is opened, nothing is charged', async () => {
    const t = await bookAndHold()
    const token = await ensureManageToken(t.id)
    setNow(PICKUP_MS - 3 * HOUR)
    const res = await manageCancel(token!, 'free')
    expect(res.json).toMatchObject({ ok: true, outcome: 'free', money: 'released' })
    expect(rowOf(t.id)).toMatchObject({ status: 'cancelled', payment_state: 'released' })
    expect(fake.state.paymentIntents.get(t.holdId)!.status).toBe('canceled')
    expect(captures()).toHaveLength(0)
    expect(feeCase(t.id)).toBeUndefined()
    // Nothing is left to decide: the fee route has nothing to act on.
    expect((await fee(t.id, { action: 'charge', amount_minor: 1000 })).status).toBe(422)
  })
})

describe('LC2 no-show: request, wait, confirm, hold lapsed, charge declined, recovery link paid, case closed', () => {
  it('walks the whole no-show money path and charges the saved card exactly once', async () => {
    const t = await bookAndHold()
    assignDriver(t.id)

    // The driver is at the pickup point 5 minutes after the pickup time. An airport pickup waits 60 minutes.
    setNow(PICKUP_MS + 5 * MINUTE)
    rowOf(t.id).status = 'on_location'
    world.statusLog.push({ booking_id: t.id, event: 'status_change', to_status: 'on_location', created_at: new Date().toISOString() })
    const availableAt = new Date(PICKUP_MS + 65 * MINUTE).toISOString()

    // Too early: refused with the instant it unlocks; nothing is requested, nothing is alerted, no money moves.
    setNow(PICKUP_MS + 30 * MINUTE)
    const early = await driver({ action: 'request_no_show' })
    expect(early.status).toBe(409)
    expect(early.json).toMatchObject({ error: 'too_early', noShowAvailableAt: availableAt })
    expect(rowOf(t.id).no_show_requested_at ?? null).toBeNull()
    // The operator can not confirm a no-show nobody asked for.
    const noRequest = await adminNoShow(t.id, { action: 'confirm' })
    expect(noRequest).toEqual({ status: 422, json: { error: 'no_request' } })
    expect(rowOf(t.id).status).toBe('on_location')

    // After the wait the request is accepted. It changes no status and moves no money.
    setNow(PICKUP_MS + 65 * MINUTE)
    const asked = await driver({ action: 'request_no_show' })
    expect(asked.status).toBe(200)
    expect(asked.json).toMatchObject({ ok: true, status: 'on_location', noShowRequestedAt: expect.any(String) })
    expect(rowOf(t.id).status).toBe('on_location')
    expect(noShowAlert).toHaveBeenCalledTimes(1)
    expect(feeCase(t.id)).toBeUndefined()
    expect(captures()).toHaveLength(0)
    expect(piCreates()).toHaveLength(1) // the hold only

    // The operator confirms: no_show, one pending case for the full fare, the hold untouched (D-13).
    const confirmed = await adminNoShow(t.id, { action: 'confirm', expected_status: 'on_location' })
    expect(confirmed).toEqual({ status: 200, json: { ok: true, status: 'no_show' } })
    expect(rowOf(t.id)).toMatchObject({ status: 'no_show', payment_state: 'authorized', fee_case_status: 'pending' })
    const opened = feeCase(t.id)!
    expect(opened).toMatchObject({ kind: 'no_show', status: 'pending', base_minor: t.amount, proposed_minor: t.amount, currency: 'eur' })
    expect(alertKeys(t.id)).toContain(`alert:fee_no_show_needed:${opened.id}`)
    expect(captures()).toHaveLength(0)
    expect(piCreates()).toHaveLength(1)
    expect(await adminNoShow(t.id, { action: 'confirm' })).toEqual({ status: 422, json: { error: 'not_on_location' } }) // a second confirm changes nothing

    // The authorization lapses at Stripe before the operator decides.
    fake.expireHold(t.holdId, 'expired')
    await deliver(fake.buildEvent('payment_intent.canceled', fake.state.paymentIntents.get(t.holdId)!))
    expect(rowOf(t.id).payment_state).toBe('expired')

    // D-13: a no-show is charged only after the operator tried to reach the client and wrote it down.
    expect(await fee(t.id, { action: 'charge', amount_minor: t.amount })).toEqual({ status: 422, json: { error: 'note_required' } })
    // D-14: the cap is the case base; an amount above it is refused and nothing is locked.
    expect(await fee(t.id, { action: 'charge', amount_minor: t.amount + 1, contact_note: 'Called twice, no answer.' })).toEqual({
      status: 422,
      json: { error: 'amount_above_cap' },
    })
    expect(piCreates()).toHaveLength(1)

    // The saved card declines: nothing collected, the case stays pending and unlocked, one recovery link for the fee.
    rowOf(t.id).stripe_payment_method_id = 'pm_decline_insufficient'
    const declined = await fee(t.id, { action: 'charge', amount_minor: t.amount, contact_note: 'Called twice, no answer.', reason: 'no show' })
    expect(declined).toEqual({ status: 200, json: { outcome: 'declined' } })
    expect(rowOf(t.id)).toMatchObject({ status: 'no_show', payment_state: 'failed', captured_amount_minor: 0, payment_intent_id: null })
    expect(feeCase(t.id)).toMatchObject({ status: 'pending', charge_requested_at: null })
    expect(piCreates()).toHaveLength(2) // the hold and exactly one declined fee charge
    expect(piCreates()[1].params).toMatchObject({ amount: t.amount, off_session: true, confirm: true, metadata: { kind: 'card_fee', cofBookingId: t.id } })
    expect(fake.state.paymentLinks.size).toBe(1)
    const link = [...fake.state.paymentLinks.values()][0]
    expect(link.id).toBe(rowOf(t.id).recovery_link_id)
    expect(link.metadata).toMatchObject({ kind: 'card_recovery', cofBookingId: t.id })
    expect(JSON.stringify(link)).toContain(String(t.amount))
    expect(emailKeys(t.id).filter((k) => k.startsWith('email:fee_charged:'))).toEqual([])
    expect(mailsTo(MANAGER).length).toBeGreaterThanOrEqual(1) // the failure alert reaches the operator

    // The client pays the link: captured, the case closes as charged with the paid amount, fee_charged goes out once.
    const paid = fake.buildEvent('checkout.session.completed', {
      id: 'cs_noshow_1',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: 'pi_noshow_paid',
      amount_total: t.amount,
      currency: 'eur',
      metadata: link.metadata as Row,
    })
    expect((await deliver(paid)).status).toBe(200)
    expect(rowOf(t.id)).toMatchObject({ status: 'no_show', payment_state: 'captured', captured_amount_minor: t.amount, payment_intent_id: 'pi_noshow_paid' })
    expect(feeCase(t.id)).toMatchObject({ status: 'charged', decided_minor: t.amount, decided_by: 'webhook' })
    expect(rowOf(t.id).fee_case_status).toBe('charged')
    expect(emailKeys(t.id).filter((k) => k.startsWith('email:fee_charged:'))).toEqual([`email:fee_charged:${opened.id}`])
    expect(deactivate).toHaveBeenCalledWith(link.id)
    expect(fake.state.paymentLinks.get(link.id as string)!.active).toBe(false)

    // Closed: a replayed event, another charge, a waive and a sweep change nothing.
    const mails = mailsTo(OWNER).length
    expect((await deliver(paid)).json).toMatchObject({ duplicate: true })
    expect((await fee(t.id, { action: 'charge', amount_minor: t.amount, contact_note: 'Called twice, no answer.' })).status).toBe(422)
    expect((await fee(t.id, { action: 'waive', reason: 'goodwill' })).status).toBe(422)
    setNow(PICKUP_MS + 8 * HOUR)
    await runTick()
    expect(piCreates()).toHaveLength(2)
    expect(captures()).toHaveLength(0)
    expect(mailsTo(OWNER)).toHaveLength(mails)
  })

  it('the operator can say "client found" and the driver may ask again; a waive on a pending case moves no money', async () => {
    const t = await bookAndHold()
    assignDriver(t.id)
    setNow(PICKUP_MS + 5 * MINUTE)
    rowOf(t.id).status = 'on_location'
    world.statusLog.push({ booking_id: t.id, event: 'status_change', to_status: 'on_location', created_at: new Date().toISOString() })
    setNow(PICKUP_MS + 70 * MINUTE)
    expect((await driver({ action: 'request_no_show' })).status).toBe(200)
    expect((await adminNoShow(t.id, { action: 'dismiss' })).json).toEqual({ ok: true, noShowRequestedAt: null })
    expect(rowOf(t.id).no_show_requested_at).toBeNull()
    expect(await adminNoShow(t.id, { action: 'confirm' })).toEqual({ status: 422, json: { error: 'no_request' } })
    expect((await driver({ action: 'request_no_show' })).status).toBe(200)
    expect((await adminNoShow(t.id, { action: 'confirm' })).status).toBe(200)

    // Waive: the case closes, the hold is released by the operator's other action only (never by the waive itself).
    const waived = await fee(t.id, { action: 'waive', reason: 'client reached later, driver left' })
    expect(waived.status).toBe(200)
    expect(feeCase(t.id)).toMatchObject({ status: 'waived' })
    expect(captures()).toHaveLength(0)
    expect(piCreates()).toHaveLength(1)
    expect((await fee(t.id, { action: 'charge', amount_minor: 1000, contact_note: 'Called twice, no answer.' })).status).toBe(422)
  })
})

describe('LC3 cash: no hold anywhere, the driver confirms, the operator reverses and confirms again', () => {
  it('claims nothing in any tick, collects nothing at completion, and keeps the settle/reopen order in the ledger', async () => {
    const t = await startBooking('cash')
    expect(rowOf(t.id)).toMatchObject({ payment_mode: 'cash_guarantee', hold_at: null, hold_payment_intent_id: null })
    setNow(NOW0 + 5 * MINUTE)
    await saveCard(t.setupIntentId)
    expect(rowOf(t.id)).toMatchObject({ status: 'confirmed', payment_mode: 'cash_guarantee', payment_state: 'card_saved' })
    expect(moneyKinds(t.id)).toEqual(['setup_started', 'setup_succeeded']) // no hold_scheduled

    // No tick, before or after the hold lead window, before or after the pickup, ever touches Stripe.
    for (const at of [HOLD_AT_MS + MINUTE, PICKUP_MS - 2 * HOUR, PICKUP_MS + HOUR]) {
      setNow(at)
      expect((await runTick()).json).toMatchObject({ ok: true, placed: 0, captured: 0, errors: [] })
    }
    expect(piCreates()).toHaveLength(0)
    expect(captures()).toHaveLength(0)
    expect(rowOf(t.id).payment_state).toBe('card_saved')

    // Completion collects nothing: the driver is paid in cash.
    assignDriver(t.id)
    setNow(PICKUP_MS + 2 * HOUR)
    expect((await completeTrip(t.id)).status).toBe(200)
    expect(rowOf(t.id)).toMatchObject({ status: 'completed', payment_state: 'card_saved', captured_amount_minor: 0 })
    expect(piCreates()).toHaveLength(0)
    expect(captures()).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)

    // The driver confirms the cash on the trip page: no amount is read, a repeat is a replay.
    const confirmed = await driver({ action: 'confirm_cash' })
    expect(confirmed).toEqual({ status: 200, json: { ok: true, status: 'completed', nextStep: null, cash: 'settled' } })
    expect(rowOf(t.id).payment_state).toBe('cash_settled')
    expect((await driver({ action: 'confirm_cash' })).json).toMatchObject({ ok: true, cash: 'settled', replay: true })

    // The operator reverses it (a note is required), then confirms again by hand. The keys make both distinct events.
    expect((await fee(t.id, { action: 'reopen_cash' })).status).toBe(400) // the note is mandatory
    expect(await fee(t.id, { action: 'reopen_cash', note: 'Driver pressed it by mistake.' })).toEqual({ status: 200, json: { outcome: 'ok' } })
    expect(rowOf(t.id).payment_state).toBe('card_saved')
    expect(db.state.booking_payment_notes).toHaveLength(1)
    expect(db.state.booking_payment_notes[0]).toMatchObject({ booking_id: t.id, kind: 'cash_reopen', note: 'Driver pressed it by mistake.' })
    expect(await fee(t.id, { action: 'mark_cash_settled' })).toEqual({ status: 200, json: { outcome: 'ok' } })
    expect(rowOf(t.id).payment_state).toBe('cash_settled')
    expect((await fee(t.id, { action: 'mark_cash_settled' })).json).toEqual({ outcome: 'ok' }) // a second click is not an error

    const cashKinds = moneyKinds(t.id).filter((k) => k === 'cash_settled' || k === 'cash_reopened')
    expect(cashKinds).toEqual(['cash_settled', 'cash_reopened', 'cash_settled'])
    const keys = ledger(t.id).filter((e) => e.kind === 'cash_settled' || e.kind === 'cash_reopened').map((e) => e.event_key)
    expect(new Set(keys).size).toBe(3)
    // Every operator click is on record before its effect.
    expect(ledger(t.id).filter((e) => e.kind === 'admin_action').map((e) => e.error_code)).toEqual(['cash_reopen', 'cash_mark'])

    // Nothing in all of this reached Stripe or the client.
    expect(piCreates()).toHaveLength(0)
    expect(captures()).toHaveLength(0)
    expect(fake.state.paymentLinks.size).toBe(0)
  })

  it('a card charge during the trip that is declined sends nothing; the driver then confirms cash after completion', async () => {
    const t = await startBooking('cash')
    setNow(NOW0 + 5 * MINUTE)
    await saveCard(t.setupIntentId)
    assignDriver(t.id)
    const clientMailsBefore = mailsTo(OWNER).length

    // On board: the operator tries the saved card, and it declines.
    setNow(PICKUP_MS + 30 * MINUTE)
    rowOf(t.id).status = 'on_board'
    rowOf(t.id).stripe_payment_method_id = 'pm_decline_insufficient'
    const declined = await fee(t.id, { action: 'charge_saved_card', note: 'Driver says the client has no cash.' })
    expect(declined).toEqual({ status: 200, json: { outcome: 'declined' } })
    expect(piCreates()).toHaveLength(1)
    expect(piCreates()[0].params).toMatchObject({ amount: serverAmount(), off_session: true, confirm: true })
    expect(rowOf(t.id)).toMatchObject({ payment_state: 'failed', captured_amount_minor: 0, payment_intent_id: null })
    // During the trip nothing is sent to the passenger and no link exists: the driver is with them.
    expect(mailsTo(OWNER)).toHaveLength(clientMailsBefore)
    expect(fake.state.paymentLinks.size).toBe(0)
    expect(rowOf(t.id).recovery_link_id ?? null).toBeNull()
    // The note is stored with the booking, never in the ledger.
    expect(db.state.booking_payment_notes).toHaveLength(1)
    expect(JSON.stringify(ledger(t.id))).not.toContain('no cash')

    // The trip ends. The booking is failed, and the driver may still be paid in cash.
    setNow(PICKUP_MS + 2 * HOUR)
    expect((await completeTrip(t.id, 'on_board')).status).toBe(200)
    expect(rowOf(t.id).payment_state).toBe('failed')
    expect(piCreates()).toHaveLength(1) // completion collects nothing on a cash booking
    expect(await driver({ action: 'confirm_cash' })).toEqual({ status: 200, json: { ok: true, status: 'completed', nextStep: null, cash: 'settled' } })
    expect(rowOf(t.id)).toMatchObject({ payment_state: 'cash_settled', last_payment_error: null, payment_failed_at: null })
    expect(piCreates()).toHaveLength(1)
    expect(captures()).toHaveLength(0)
  })

  it('a card charge on a cash booking that succeeds captures once and the cash path is closed', async () => {
    const t = await startBooking('cash')
    setNow(NOW0 + 5 * MINUTE)
    await saveCard(t.setupIntentId)
    setNow(PICKUP_MS + 30 * MINUTE)
    rowOf(t.id).status = 'on_board'
    const ok = await fee(t.id, { action: 'charge_saved_card', note: 'Client asked to pay by card after all.' })
    expect(ok).toEqual({ status: 200, json: { outcome: 'ok' } })
    expect(piCreates()).toHaveLength(1)
    expect(rowOf(t.id)).toMatchObject({ payment_state: 'captured', captured_amount_minor: serverAmount() })
    // Paid by card: neither the driver nor the operator can now mark it as cash.
    setNow(PICKUP_MS + 2 * HOUR)
    await completeTrip(t.id, 'on_board')
    assignDriver(t.id)
    expect((await driver({ action: 'confirm_cash' })).status).toBe(422)
    expect((await fee(t.id, { action: 'mark_cash_settled' })).status).toBe(422)
    expect(piCreates()).toHaveLength(1)
  })
})

describe('LC4 criterion 5: every entry point refuses a partner booking before any Stripe or token work', () => {
  const PARTNER_ID = '33333333-3333-4333-8333-333333333333'
  const ADMIN = { type: 'admin', id: 'admin-1' } as const
  const PARTNER_TOKEN = newManageToken()

  const partnerRow = (over: Row = {}): Row => ({
    id: PARTNER_ID,
    status: 'confirmed',
    booking_source: 'gnet',
    payment_mode: 'card_hold',
    payment_state: 'authorized',
    booking_reference: 'PRG-20270116-GNET01',
    client_email: 'passenger@gnet.local',
    locale: 'en',
    trip_type: 'transfer',
    distance_km: 50,
    pickup_date: '2027-01-16',
    pickup_time: '10:00',
    pickup_utc: PICKUP_UTC,
    payment_currency: 'eur',
    payment_amount_minor: 12000,
    hold_amount_minor: 12000,
    hold_payment_intent_id: 'pi_foreign',
    payment_intent_id: 'pi_paid_foreign',
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_ok',
    // A stored policy and a pending case: a partner row that looks as eligible as a client row can look.
    cancel_policy_version: '2026-11-1',
    fee_case_status: 'pending',
    ...over,
  })

  function seedPartner(over: Row = {}) {
    bindDb(createFakePaymentsDb({ nowMs: PICKUP_MS - 30 * MINUTE, bookings: [partnerRow(over)] }))
    setNow(PICKUP_MS - 30 * MINUTE)
    db.state.booking_manage_tokens.push({ booking_id: PARTNER_ID, token: PARTNER_TOKEN, revoked_at: null })
    db.state.booking_fee_cases.push({
      id: '99999999-9999-4999-8999-999999999999',
      booking_id: PARTNER_ID,
      kind: 'late_cancel',
      status: 'pending',
      base_minor: 12000,
      proposed_minor: 6000,
      currency: 'eur',
      charge_requested_at: null,
    })
  }

  /** Nothing reached Stripe, no recovery link exists, no client mail went out and no payment state changed. */
  function expectUntouched() {
    expect(fake.calls).toHaveLength(0)
    expect(fake.state.paymentLinks.size).toBe(0)
    expect(resendSend).not.toHaveBeenCalled()
    expect(rowOf(PARTNER_ID)).toMatchObject({ payment_state: 'authorized', payment_mode: 'card_hold' })
    expect(rowOf(PARTNER_ID).captured_amount_minor ?? 0).toBe(0)
    // Not even an operator click is recorded: the refusal comes before the first write.
    expect(ledger(PARTNER_ID)).toEqual([])
  }

  it('the manage token of a partner booking is never created and never resolves; the route answers the invalid-link 404', async () => {
    seedPartner()
    db.state.booking_manage_tokens.length = 0
    expect(await ensureManageToken(PARTNER_ID)).toBeNull()
    expect(db.state.booking_manage_tokens).toHaveLength(0) // no token row was written

    db.state.booking_manage_tokens.push({ booking_id: PARTNER_ID, token: PARTNER_TOKEN, revoked_at: null })
    expect(await resolveManageToken(PARTNER_TOKEN)).toBeNull()
    const res = await manageCancel(PARTNER_TOKEN, 'late')
    expect(res).toEqual({ status: 404, json: { error: 'invalid_link' } })
    expect(rowOf(PARTNER_ID).status).toBe('confirmed')
    expectUntouched()
  })

  it('cancelBooking by the client link is refused; an admin cancel changes the status and nothing else', async () => {
    seedPartner()
    expect(
      await cancelBooking({ bookingId: PARTNER_ID, initiator: 'client_token', actor: { type: 'system', id: 'client_token' }, acknowledge: 'late' }),
    ).toEqual({ kind: 'not_cancellable', status: 'confirmed' })
    expect(rowOf(PARTNER_ID).status).toBe('confirmed')
    expectUntouched()

    const admin = await cancelBooking({ bookingId: PARTNER_ID, initiator: 'admin_client', actor: ADMIN })
    expect(admin).toMatchObject({ kind: 'ok', money: 'none' })
    await flushAfter()
    expect(rowOf(PARTNER_ID).status).toBe('cancelled')
    // The planted case stays exactly as it was: a partner cancel opens nothing and decides nothing.
    expect(db.state.booking_fee_cases).toHaveLength(1)
    expect(db.state.booking_fee_cases[0].status).toBe('pending')
    expect(fake.calls).toHaveLength(0)
    expect(fake.state.paymentLinks.size).toBe(0)
    expect(mailsTo('passenger@gnet.local')).toHaveLength(0)
  })

  it('every fee route action answers 422 action_not_allowed and touches nothing', async () => {
    for (const mode of ['card_hold', 'cash_guarantee'] as const) {
      seedPartner({ status: 'cancelled', payment_mode: mode, payment_state: mode === 'cash_guarantee' ? 'card_saved' : 'authorized' })
      const bodies: Row[] = [
        { action: 'charge', amount_minor: 6000 },
        { action: 'charge', amount_minor: 6000, contact_note: 'Called twice, no answer.' },
        { action: 'waive', reason: 'goodwill' },
        { action: 'charge_saved_card', note: 'driver unpaid' },
        { action: 'mark_cash_settled' },
        { action: 'reopen_cash', note: 'mistake' },
      ]
      for (const body of bodies) {
        const res = await fee(PARTNER_ID, body)
        expect(res, `${mode} ${String(body.action)}`).toEqual({ status: 422, json: { error: 'action_not_allowed' } })
      }
      expect(fake.calls, mode).toHaveLength(0)
      expect(db.state.booking_payment_notes, mode).toHaveLength(0)
      expect(db.state.booking_fee_cases[0].status, mode).toBe('pending')
      expect(db.state.booking_fee_cases[0].charge_requested_at ?? null, mode).toBeNull()
      expect(resendSend, mode).not.toHaveBeenCalled()
    }
  })

  it('the engine functions behind the routes refuse by themselves (runFeeCharge, runCashCardCharge, waiveFee, chargeFromCollected, settleCash, reopenCash)', async () => {
    seedPartner({ status: 'cancelled' })
    const caseRow = db.state.booking_fee_cases[0] as never
    const booking = rowOf(PARTNER_ID)
    expect(await runFeeCharge({ booking, caseRow, amountMinor: 6000, actor: ADMIN })).toEqual({ error: 'action_not_allowed' })
    expect(await chargeFromCollected({ booking, caseRow, amountMinor: 6000, actor: ADMIN })).toEqual({ error: 'action_not_allowed' })
    expect(await waiveFee({ booking, caseRow, reason: 'goodwill', actor: ADMIN })).toEqual({ error: 'action_not_allowed' })
    expect(db.state.booking_fee_cases[0].charge_requested_at ?? null).toBeNull() // the amount was never locked
    // A cash row on a live trip: only the partner check stands between it and the transition / the note.
    Object.assign(rowOf(PARTNER_ID), { status: 'on_board', payment_mode: 'cash_guarantee', payment_state: 'card_saved' })
    const cash = rowOf(PARTNER_ID)
    expect(await runCashCardCharge({ booking: cash, actor: ADMIN })).toEqual({ error: 'action_not_allowed' })
    expect(await settleCash(cash, ADMIN)).toBe('not_allowed')
    expect(await reopenCash({ ...cash, payment_state: 'cash_settled' }, ADMIN, 'mistake')).toBe('not_allowed')
    expect(rowOf(PARTNER_ID).payment_state).toBe('card_saved')
    Object.assign(rowOf(PARTNER_ID), { payment_mode: 'card_hold', payment_state: 'authorized' })
    expectUntouched()
    expect(db.state.booking_payment_notes).toHaveLength(0)
  })

  it('the driver can not confirm cash on a partner booking, and the trip lookup is the only thing read', async () => {
    seedPartner({ status: 'completed', payment_mode: 'cash_guarantee', payment_state: 'card_saved', driver_id: DRIVER_ID, completed_at: PICKUP_UTC })
    world.assignments.push({ id: 'assign-1', driver_id: DRIVER_ID, status: 'accepted', trip_token: TRIP_TOKEN, booking_id: PARTNER_ID })
    const trip = await loadDriverTripForStep(world.client as never, TRIP_TOKEN)
    expect(trip).not.toBeNull()
    expect(await driverConfirmCash({ trip: trip! })).toMatchObject({ httpStatus: 422, body: { error: 'cash_not_allowed' } })
    expect((await driver({ action: 'confirm_cash' })).status).toBe(422)
    expect(rowOf(PARTNER_ID).payment_state).toBe('card_saved')
    expect(ledger(PARTNER_ID)).toEqual([])
  })
})
