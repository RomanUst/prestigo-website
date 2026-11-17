// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 92 plan 92-28 (QUOTE-01..QUOTE-07): one quote from the builder to a refunded cancel, through the REAL route
 * handlers of every earlier plan. An operator creates a two-trip quote, asks the server for a price suggestion, saves the
 * lines (line 1 at the suggestion with one stop, line 2 overridden), sets a 30% deposit on a saved card and sends it: the
 * version is frozen, one link is minted and the email carries the PDF. The client opens the link (viewed), accepts and
 * pays the deposit; the deposit event goes through the real Stripe webhook route (classifyPaymentEvent and its route) and
 * the quote_convert_to_bookings conversion makes one card_hold booking per line. A replay changes nothing. Past the hold
 * time of the first trip the payment claim returns that trip. A second quote is sent and revised: its first link is dead.
 * Finally the operator cancels the paid quote inside the free window: both trips are cancelled without fee cases, the
 * deposit is refunded once and the client gets one cancellation email.
 *
 * Only the outside world is faked: the in-memory payments database (with quote_convert_to_bookings and
 * claim_due_payment_work), the fake Stripe, Resend, Google Routes, the tariffs, the PDF engine, the admin session, the
 * rate limiter and the webhook signature check.
 */

const { world, stripeStub, mockResendSend, computeRouteDistanceMock, renderQuotePdfMock, mockPaymentEmail, mockPaymentAlert, mockTripEmail, legacy } =
  vi.hoisted(() => ({
    world: {
      db: null as unknown as { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> }; state: Record<string, Array<Record<string, unknown>>> & { nowMs: number } },
      stripe: null as unknown,
      processed: new Set<string>(),
      rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
      afterTasks: [] as Array<Promise<unknown>>,
    },
    stripeStub: { constructEvent: vi.fn() },
    mockResendSend: vi.fn(),
    computeRouteDistanceMock: vi.fn(),
    renderQuotePdfMock: vi.fn(),
    mockPaymentEmail: vi.fn(),
    mockPaymentAlert: vi.fn(),
    mockTripEmail: vi.fn(),
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

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'
process.env.RESEND_API_KEY = 're_test'

/** advance_booking_status (migration 084) is not part of the payments fake: a compare-and-set on bookings.status. */
async function advanceRpc(args: Record<string, unknown>) {
  const b = world.db.state.bookings.find((x) => x.id === args.p_booking_id)
  if (!b) return { data: { applied: false, current_status: null }, error: null }
  if (b.status !== args.p_from) return { data: { applied: false, current_status: b.status }, error: null }
  b.status = args.p_to
  return { data: { applied: true, booking: { ...b } }, error: null }
}

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => {
      world.afterTasks.push(Promise.resolve().then(fn))
    },
  }
})

vi.mock('@/lib/supabase', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/supabase')>()
  // The webhook's event-id claim table is not modelled by the payments fake.
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
    ...actual,
    ...legacy,
    withRetry: (fn: () => Promise<unknown>) => fn(),
    createSupabaseServiceClient: () => ({
      from: (table: string) => (table === 'stripe_processed_events' ? processedTable : world.db.client.from(table)),
      rpc: async (name: string, args?: Record<string, unknown>) => {
        world.rpcCalls.push({ name, args: args ?? {} })
        if (name === 'advance_booking_status') return advanceRpc(args ?? {})
        return world.db.client.rpc(name, args)
      },
    }),
  }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })),
  getAdminUser: vi.fn(async () => ({ user: { id: ADMIN_ID }, error: null })),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, limit: 10 })),
  getClientIp: () => '203.0.113.9',
}))
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))
vi.mock('stripe', () => ({
  default: function MockStripe() {
    return { webhooks: stripeStub }
  },
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: computeRouteDistanceMock }))
// The PDF engine is a double: the document HTML is built for real, the browser is not launched.
vi.mock('@/lib/quotes/pdf', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/quotes/pdf')>()),
  renderQuotePdf: renderQuotePdfMock,
}))
vi.mock('@/lib/cancellation-settings', async () => {
  const { DEFAULT_POLICY } = await vi.importActual<typeof import('@/lib/cancellation-policy')>('@/lib/cancellation-policy')
  return { getCancellationPolicy: async () => ({ ...DEFAULT_POLICY }) }
})
vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: async () => ({
    ratePerKm: { business: 2, first_class: 3, business_van: 2.5 },
    hourlyRate: { business: 50, first_class: 70, business_van: 60 },
    dailyRate: { business: 200, first_class: 280, business_van: 240 },
    minFare: { business: 10, first_class: 10, business_van: 10 },
    waitingRate: { business: 12 },
    globals: {
      airportFee: 5,
      nightCoefficient: 1.2,
      holidayCoefficient: 1.3,
      extraChildSeat: 10,
      extraLuggage: 7,
      holidayDates: [],
      returnDiscountPercent: 10,
      hourlyMinHours: 2,
      hourlyMaxHours: 8,
      notificationFlags: null,
      airportPromoActive: false,
      airportRegularPriceEur: 69,
      airportPromoPriceEur: 59,
    },
  }),
}))
// Booking-side mail and alerts of the card engine (the quote sends its own cancellation email through Resend).
vi.mock('@/lib/payments/alerts', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/alerts')>()),
  sendPaymentOperatorAlert: mockPaymentAlert,
}))
vi.mock('@/lib/payments/emails/send', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/emails/send')>()),
  sendPaymentEmail: mockPaymentEmail,
}))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: vi.fn() }))
vi.mock('@/lib/booking-status-service', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/booking-status-service')>()),
  scheduleCancelRouteEmail: mockTripEmail,
}))
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
vi.mock('@/lib/ics', () => ({ buildIcs: vi.fn().mockReturnValue('STUB-ICS') }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: vi.fn().mockResolvedValue(true) }))

import { POST as CREATE } from '@/app/api/admin/quotes/route'
import { PATCH } from '@/app/api/admin/quotes/[id]/route'
import { POST as PRICE } from '@/app/api/admin/quotes/price/route'
import { POST as SEND } from '@/app/api/admin/quotes/[id]/send/route'
import { POST as REVISE } from '@/app/api/admin/quotes/[id]/revise/route'
import { POST as CANCEL } from '@/app/api/admin/quotes/[id]/cancel/route'
import { POST as VIEW } from '@/app/api/quote/view/route'
import { POST as ACCEPT } from '@/app/api/quote/accept/route'
import { POST as STATE } from '@/app/api/quote/state/route'
import { POST as WEBHOOK } from '@/app/api/webhooks/stripe/route'
import { classifyPaymentEvent } from '@/lib/stripe-webhook/dispatch'
import { claimDueHolds } from '@/lib/payments/state'
import { computeHoldAt } from '@/lib/payments/timing'
import { pickupInstantMs } from '@/lib/prague-date'
import { stripeKeys } from '@/lib/payments/stripe'
import { formatMinor } from '@/lib/payments/money'
import { hashQuoteToken } from '@/lib/quotes/token'
import enMessages from '@/messages/en.json'
import type Stripe from 'stripe'

type Row = Record<string, unknown>

// Fixed "now": 2027-03-01 09:00Z (10:00 Prague, CET). Trip 1 is on 2027-03-20, trip 2 on 2027-03-22, both 10:00 Prague.
const NOW = Date.parse('2027-03-01T09:00:00Z')
const HOUR = 3_600_000
const CLIENT_EMAIL = 'ivan@example.com'
const MANAGER = 'owner@example.com'
const PRAGUE = { address: 'Wenceslas Square, Prague', lat: 50.0813, lng: 14.4284 }
const VIENNA = { address: 'Stephansplatz, Vienna', lat: 48.2085, lng: 16.3721 }
const BRNO = { address: 'Brno', lat: 49.1951, lng: 16.6068 }
const DATE_1 = '2027-03-20'
const DATE_2 = '2027-03-22'
const PICKUP_1 = pickupInstantMs({ pickup_utc: null, pickup_date: DATE_1, pickup_time: '10:00' }) as number
const PICKUP_2 = pickupInstantMs({ pickup_utc: null, pickup_date: DATE_2, pickup_time: '10:00' }) as number
const LEAD_HOURS = 72
const FREE_HOURS = 48

let db: FakePaymentsDb
let fake: FakeStripe

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function req(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'user-agent': 'Mozilla/5.0 (e2e phone)' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** Moves the test clock and the database clock together. */
function setNow(ms: number) {
  vi.setSystemTime(ms)
  db.state.nowMs = ms
}

const tokenOf = (url: string): string => url.split('/').pop() as string
const quoteRow = (id: string) => db.state.quotes.find((q) => q.id === id)!
const versionsOf = (id: string) => db.state.quote_versions.filter((v) => v.quote_id === id)
const linesOf = (versionId: unknown) =>
  db.state.quote_version_lines.filter((l) => l.version_id === versionId).sort((a, b) => Number(a.position) - Number(b.position))
const linksOf = (id: string) => db.state.quote_links.filter((l) => l.quote_id === id)
const eventKinds = (id: string) => db.state.quote_events.filter((e) => e.quote_id === id).map((e) => e.kind as string)
const bookingsOf = (id: string) => db.state.bookings.filter((b) => b.quote_id === id)
const mailsTo = (to: string) =>
  mockResendSend.mock.calls
    .map((c) => c[0] as { to: string[]; subject: string; html: string; attachments?: Array<{ filename: string; content: unknown }> })
    .filter((m) => m.to.includes(to))

function lineBody(over: Record<string, unknown> = {}) {
  return {
    trip_type: 'transfer',
    pickup_date: DATE_1,
    pickup_time: '10:00',
    origin: PRAGUE,
    destination: VIENNA,
    stops: [],
    vehicle_class: 'business',
    passengers: 2,
    luggage: 1,
    ...over,
  }
}

async function createDraft(): Promise<string> {
  const created = await CREATE(
    req('POST', 'http://localhost/api/admin/quotes', {
      client: { first_name: 'Ivan', last_name: 'Petrov', email: CLIENT_EMAIL, phone: '+420123456789' },
      lead_channel: 'whatsapp',
      currency: 'eur',
    }),
  )
  expect(created.status).toBe(201)
  return ((await created.json()) as { id: string }).id
}

async function patchLines(id: string, line1Minor: number, line2Minor: number) {
  return PATCH(
    req('PATCH', `http://localhost/api/admin/quotes/${id}`, {
      deposit: { kind: 'percent', value: 30 },
      remainder_method: 'saved_card',
      cancel_free_hours: FREE_HOURS,
      lines: [
        lineBody({ stops: [{ ...BRNO, wait_minutes: 45 }], amount_minor: line1Minor }),
        lineBody({ pickup_date: DATE_2, amount_minor: line2Minor }),
      ],
    }),
    params(id),
  )
}

async function sendQuote(id: string): Promise<{ status: string; url: string; emailed: boolean }> {
  const res = await SEND(req('POST', `http://localhost/api/admin/quotes/${id}/send`), params(id))
  expect(res.status).toBe(200)
  return (await res.json()) as { status: string; url: string; emailed: boolean }
}

const view = (token: string) => VIEW(req('POST', 'http://localhost/api/quote/view', { token }))

async function deliver(event: unknown) {
  stripeStub.constructEvent.mockReturnValue(event)
  const res = await WEBHOOK(
    new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'valid-sig' }, body: 'raw-body' }),
  )
  await Promise.all(world.afterTasks.splice(0))
  return { status: res.status, json: (await res.json()) as Row }
}

const legacyCalls = () => Object.values(legacy).reduce((n, spy) => n + spy.mock.calls.length, 0)
const convertCalls = () => world.rpcCalls.filter((c) => c.name === 'quote_convert_to_bookings')

const PDF_BYTES = Buffer.alloc(2048, 3)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  process.env.MANAGER_EMAIL = MANAGER
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  delete process.env.ACCOUNTING_EMAIL
  db = createFakePaymentsDb({ nowMs: NOW })
  fake = createFakeStripe({ nowSec: () => Math.floor(Date.now() / 1000) })
  world.db = db as unknown as typeof world.db
  world.stripe = fake.stripe
  world.processed.clear()
  world.rpcCalls = []
  world.afterTasks = []
  Object.assign(db.state.pricing_globals[0], { card_flow_mode: 'on', card_flow_canary_emails: [], payment_hold_lead_hours: LEAD_HOURS })
  computeRouteDistanceMock.mockResolvedValue({ ok: true, distanceKm: 130, durationMin: 90 })
  renderQuotePdfMock.mockResolvedValue(PDF_BYTES)
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  mockPaymentEmail.mockResolvedValue('sent')
  mockPaymentAlert.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('phase 92 end to end: builder -> send -> view -> accept -> deposit -> bookings -> claim -> revise -> cancel', () => {
  it('a two-trip saved-card quote becomes two card_hold bookings and a free cancel refunds the deposit once', async () => {
    // ── 1. Builder: a draft, the server's price suggestion for line 1, the lines saved (line 2 overridden) ──────────
    const id = await createDraft()
    expect(quoteRow(id).status).toBe('draft')

    const priced = await PRICE(
      req('POST', 'http://localhost/api/admin/quotes/price', {
        line: lineBody({ stops: [{ ...BRNO, wait_minutes: 45 }] }),
        currency: 'eur',
      }),
    )
    expect(priced.status).toBe(200)
    const suggestion = (await priced.json()) as { distanceKm: number; suggestedMinor: number }
    // 130 km x 2 EUR + 2 paid waiting blocks x 12 EUR = 284 EUR, from the mocked Google Routes distance.
    expect(suggestion).toMatchObject({ distanceKm: 130, suggestedMinor: 28400 })

    const LINE_1 = suggestion.suggestedMinor
    const LINE_2 = 18000
    const patched = await patchLines(id, LINE_1, LINE_2)
    expect(patched.status).toBe(200)
    const draftLines = linesOf(versionsOf(id)[0].id)
    expect(draftLines).toHaveLength(2)
    expect(draftLines[0]).toMatchObject({ distance_km: 130, suggested_amount_minor: 28400, amount_minor: LINE_1, price_overridden: false })
    expect(draftLines[1]).toMatchObject({ distance_km: 130, amount_minor: LINE_2, price_overridden: true })
    expect(db.state.quote_version_line_stops.filter((s) => s.line_id === draftLines[0].id)).toHaveLength(1)

    // ── 2. Send: version frozen, one link, one email with the PDF attached ─────────────────────────────────────────
    const sent = await sendQuote(id)
    expect(sent).toMatchObject({ status: 'sent', emailed: true })
    const [version] = versionsOf(id)
    const TOTAL = LINE_1 + LINE_2
    const DEPOSIT = Math.round(TOTAL * 0.3)
    expect(version.frozen_at).toBeTruthy()
    expect(version).toMatchObject({ total_minor: TOTAL, deposit_minor: DEPOSIT, remainder_method: 'saved_card' })
    const lines = linesOf(version.id)
    expect(lines.map((l) => l.deposit_share_minor)).toEqual([8520, 5400])
    expect(lines.map((l) => l.remainder_minor)).toEqual([LINE_1 - 8520, LINE_2 - 5400])
    expect(linksOf(id)).toHaveLength(1)
    const token = tokenOf(sent.url)
    expect(linksOf(id)[0].token_hash).toBe(hashQuoteToken(token))
    expect(JSON.stringify(db.state)).not.toContain(token)

    expect(renderQuotePdfMock).toHaveBeenCalledTimes(1)
    const sentMails = mailsTo(CLIENT_EMAIL)
    expect(sentMails).toHaveLength(1)
    expect(sentMails[0].html).toContain(sent.url)
    expect(sentMails[0].attachments).toHaveLength(1)
    expect(sentMails[0].attachments![0].filename).toBe(`Prestigo-quote-${quoteRow(id).reference}-v1.pdf`)
    expect(Buffer.compare(Buffer.from(sentMails[0].attachments![0].content as Buffer), PDF_BYTES)).toBe(0)

    // ── 3. The client opens the link: viewed once ──────────────────────────────────────────────────────────────────
    const viewed = await view(token)
    expect(viewed.status).toBe(200)
    expect(quoteRow(id).status).toBe('viewed')
    expect(eventKinds(id).filter((k) => k === 'viewed')).toHaveLength(1)

    // ── 4. Accept with the values the page showed: one acceptance, one deposit PaymentIntent, its client secret ───
    const accepted = await ACCEPT(
      req('POST', 'http://localhost/api/quote/accept', { token, displayedVersionNo: 1, displayedDepositMinor: DEPOSIT, consent: true }),
    )
    expect(accepted.status).toBe(200)
    const acceptBody = (await accepted.json()) as { clientSecret: string; amountMinor: number; currency: string }
    expect(acceptBody).toMatchObject({ amountMinor: DEPOSIT, currency: 'eur' })
    expect(acceptBody.clientSecret).toMatch(/_secret_/)
    expect(quoteRow(id).status).toBe('accepted')
    expect(db.state.quote_acceptances).toHaveLength(1)
    const intentId = quoteRow(id).deposit_payment_intent_id as string
    expect(intentId).toMatch(/^pi_/)
    const depositCreates = fake.callsTo('paymentIntents.create')
    expect(depositCreates).toHaveLength(1)
    expect(depositCreates[0].params).toMatchObject({ amount: DEPOSIT, currency: 'eur', setup_future_usage: 'off_session' })
    expect((depositCreates[0].params as { metadata: Row }).metadata).toMatchObject({ kind: 'card_quote_deposit', quoteId: id, versionId: version.id })

    // The page polls: still accepted, no references yet.
    const pending = await STATE(req('POST', 'http://localhost/api/quote/state', { token }))
    expect(await pending.json()).toEqual({ state: 'accepted', bookingReferences: [] })

    // ── 5. Stripe confirms the card on the phone: the intent succeeds and the event reaches the webhook ────────────
    const stored = fake.state.paymentIntents.get(intentId)!
    Object.assign(stored, { status: 'succeeded', amount_received: DEPOSIT, payment_method: 'pm_ok' })
    const succeeded = { ...stored } as unknown as Stripe.PaymentIntent
    const event = { id: 'evt_deposit_1', type: 'payment_intent.succeeded', data: { object: succeeded } }
    expect(classifyPaymentEvent(event as unknown as Stripe.Event)).toMatchObject({ route: 'quote_deposit_paid', kind: 'card_quote_deposit' })

    const delivered = await deliver(event)
    expect(delivered.status).toBe(200)
    expect(delivered.json).toEqual({ received: true })
    expect(legacyCalls()).toBe(0)
    expect(convertCalls()).toHaveLength(1)
    expect(convertCalls()[0].args).toMatchObject({ p_quote_id: id, p_version_id: version.id, p_actor_type: 'webhook', p_actor_id: 'evt_deposit_1' })

    // Two bookings, one per line, both card_hold on the saved card (each line still has a remainder).
    expect(quoteRow(id).status).toBe('paid')
    expect(quoteRow(id).paid_at).toBeTruthy()
    const rows = bookingsOf(id)
    expect(rows).toHaveLength(2)
    const first = rows.find((b) => b.quote_line_id === lines[0].id)!
    const second = rows.find((b) => b.quote_line_id === lines[1].id)!
    expect(first).toMatchObject({
      quote_id: id,
      payment_mode: 'card_hold',
      payment_state: 'card_saved',
      payment_amount_minor: LINE_1 - 8520,
      hold_at: new Date(computeHoldAt(PICKUP_1, LEAD_HOURS).holdAtMs).toISOString(),
      status: 'confirmed',
    })
    expect(second).toMatchObject({
      quote_id: id,
      payment_mode: 'card_hold',
      payment_state: 'card_saved',
      payment_amount_minor: LINE_2 - 5400,
      hold_at: new Date(computeHoldAt(PICKUP_2, LEAD_HOURS).holdAtMs).toISOString(),
    })
    for (const b of rows) {
      expect(b.payment_intent_id).toBeNull()
      expect(b.stripe_payment_method_id).toBe('pm_ok')
    }
    // The stop of line 1 travelled to its booking; line 2 has none.
    const stopsOf = (bookingId: unknown) => db.state.booking_stops.filter((s) => s.booking_id === bookingId)
    expect(stopsOf(first.id)).toHaveLength(1)
    expect(stopsOf(first.id)[0]).toMatchObject({ position: 1, address: 'Brno', wait_minutes: 45 })
    expect(stopsOf(second.id)).toHaveLength(0)
    expect(eventKinds(id)).toEqual(expect.arrayContaining(['sent', 'viewed', 'accepted', 'deposit_started', 'deposit_paid', 'converted']))

    // One confirmation email to the client.
    const confirmedSubject = enMessages.QuoteEmails.confirmed.subject.replace('{reference}', String(quoteRow(id).reference))
    const confirmations = () => mailsTo(CLIENT_EMAIL).filter((m) => m.subject === confirmedSubject)
    expect(confirmations()).toHaveLength(1)

    // The page now shows the booked trips.
    const paidState = (await (await STATE(req('POST', 'http://localhost/api/quote/state', { token }))).json()) as {
      state: string
      bookingReferences: string[]
    }
    expect(paidState.state).toBe('paid')
    expect(paidState.bookingReferences.sort()).toEqual(rows.map((b) => b.booking_reference as string).sort())

    // ── 6. Replays change nothing: the same event (duplicate) and a new event id for the same intent (replayed) ───
    const snapshot = JSON.stringify([db.state.bookings, db.state.booking_stops, db.state.quotes])
    const mailCount = mockResendSend.mock.calls.length
    const dup = await deliver(event)
    expect(dup.status).toBe(200)
    expect(dup.json).toMatchObject({ duplicate: true })
    const replay = await deliver({ ...event, id: 'evt_deposit_2' })
    expect(replay.status).toBe(200)
    expect(JSON.stringify([db.state.bookings, db.state.booking_stops, db.state.quotes])).toBe(snapshot)
    expect(convertCalls()).toHaveLength(1)
    expect(confirmations()).toHaveLength(1)
    expect(mockResendSend.mock.calls.length).toBe(mailCount)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
    expect(legacyCalls()).toBe(0)

    // ── 7. Past the hold time of trip 1 (and before trip 2's) the payment claim returns trip 1 only ────────────────
    const hold1 = Date.parse(first.hold_at as string)
    const hold2 = Date.parse(second.hold_at as string)
    expect(hold1).toBeLessThan(hold2)
    setNow(hold1 - 60_000)
    expect(await claimDueHolds(10, 60)).toEqual([])
    setNow(hold1 + 60_000)
    expect(hold1 + 60_000).toBeLessThan(hold2)
    const claimed = await claimDueHolds(10, 60)
    expect(claimed.map((b) => b.id)).toEqual([first.id])
    expect(bookingsOf(id).find((b) => b.id === first.id)!.payment_state).toBe('placing_hold')
    expect(bookingsOf(id).find((b) => b.id === second.id)!.payment_state).toBe('card_saved')

    // ── 8. A second quote, sent and then revised: its first link is dead at once ───────────────────────────────────
    setNow(NOW + HOUR)
    const other = await createDraft()
    expect((await patchLines(other, 30000, 20000)).status).toBe(200)
    const otherSent = await sendQuote(other)
    const otherToken = tokenOf(otherSent.url)
    expect((await view(otherToken)).status).toBe(200)
    const revised = await REVISE(req('POST', `http://localhost/api/admin/quotes/${other}/revise`), params(other))
    expect(revised.status).toBe(200)
    expect(quoteRow(other).status).toBe('draft')
    const dead = await view(otherToken)
    expect(dead.status).toBe(404)
    expect(await dead.json()).toEqual({ error: 'invalid_link' })

    // ── 9. Cancel the paid quote inside the free window (the claim's lease has lapsed, its worker is gone) ─────────
    const cancelAt = hold1 + 10 * 60_000
    expect(cancelAt).toBeLessThan(PICKUP_1 - FREE_HOURS * HOUR)
    setNow(cancelAt)
    fake.calls.length = 0
    const clientMailsBefore = mailsTo(CLIENT_EMAIL).length

    const cancelled = await CANCEL(
      req('POST', `http://localhost/api/admin/quotes/${id}/cancel`, { initiator: 'admin_client', refund_minor: null }),
      params(id),
    )
    expect(cancelled.status).toBe(200)
    expect(await cancelled.json()).toEqual({ ok: true, outcome: 'free', refundedMinor: DEPOSIT, refundFailed: false })

    // Both trips cancelled, no fee case, no per-trip client email.
    expect(bookingsOf(id).map((b) => b.status)).toEqual(['cancelled', 'cancelled'])
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(mockTripEmail).not.toHaveBeenCalled()
    // One refund of the whole deposit, under the fixed key; nothing is charged.
    const refunds = fake.callsTo('refunds.create')
    expect(refunds).toHaveLength(1)
    expect(refunds[0].params).toMatchObject({ payment_intent: intentId, amount: DEPOSIT })
    expect(refunds[0].idempotencyKey).toBe(stripeKeys.quoteRefund(id, `deposit:${DEPOSIT}`))
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(fake.state.paymentIntents.get(intentId)!.amount_refunded).toBe(DEPOSIT)
    expect(quoteRow(id)).toMatchObject({ cancel_initiator: 'admin_client', cancel_outcome: 'free', deposit_refunded_minor: DEPOSIT })
    expect(eventKinds(id)).toEqual(expect.arrayContaining(['cancelled', 'deposit_refunded']))
    expect(db.state.quote_events.filter((e) => e.quote_id === id && e.kind === 'deposit_refunded')).toHaveLength(1)

    // One cancellation email to the client, with the refunded amount.
    const cancelMails = mailsTo(CLIENT_EMAIL).slice(clientMailsBefore)
    expect(cancelMails).toHaveLength(1)
    expect(cancelMails[0].subject).toBe(enMessages.QuoteEmails.cancelled.subject.replace('{reference}', String(quoteRow(id).reference)))
    expect(cancelMails[0].html).toContain(formatMinor(DEPOSIT, 'eur'))

    // A second click moves no more money.
    const again = await CANCEL(
      req('POST', `http://localhost/api/admin/quotes/${id}/cancel`, { initiator: 'admin_client', refund_minor: null }),
      params(id),
    )
    expect(again.status).toBe(422)
    expect(await again.json()).toEqual({ error: 'already_cancelled' })
    expect(fake.callsTo('refunds.create')).toHaveLength(1)
    expect(legacyCalls()).toBe(0)
  })
})
