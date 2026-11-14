// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 88 plan 88-11 (HOLD-02, D-08, D-09a): the payment tick places the full-amount off-session hold for
 * every card_hold booking in card_saved whose hold_at has passed, exactly once, caught up after missed runs,
 * never for partner bookings. Two triggers (Vercel cron GET, QStash POST) drive the same idempotent endpoint.
 */

const CRON_SECRET = 'test-cron-secret'
process.env.CRON_SECRET = CRON_SECRET

const { world, mockSendEmail, mockSetupSucceeded, mockHoldNowAuthorized, mockVerify, mockFailure, mockResendSend, mockApplyQuoteDeposit } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
    tables: [] as string[],
  },
  mockSendEmail: vi.fn(),
  mockSetupSucceeded: vi.fn(),
  mockHoldNowAuthorized: vi.fn(),
  mockVerify: vi.fn(),
  mockFailure: vi.fn(),
  mockResendSend: vi.fn(),
  mockApplyQuoteDeposit: vi.fn(),
}))

process.env.RESEND_API_KEY = 're_test'

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      world.tables.push(table)
      return world.db!.client.from(table)
    },
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))

vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))

vi.mock('@/lib/payments/emails/send', () => ({
  sendPaymentEmail: mockSendEmail,
  bookingEmailDataFromRow: (row: unknown) => row,
}))

// Step Q (92-31) calls the one conversion function of the quote webhook; its own behaviour is tests/quote-convert.test.ts.
vi.mock('@/lib/quotes/convert', () => ({ applyQuoteDepositPaid: mockApplyQuoteDeposit }))

vi.mock('@/lib/stripe-webhook/card-confirm', () => ({
  applySetupSucceeded: mockSetupSucceeded,
  applyHoldNowAuthorized: mockHoldNowAuthorized,
}))

// The link / email / alert of a declined hold or charge are covered by tests/payments-failure.test.ts.
vi.mock('@/lib/payments/recovery', () => ({ handlePaymentFailure: mockFailure }))
// The operator alerts of step D run for real (ledger claim included); only Resend is a double.
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))

vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@upstash/qstash', () => ({
  Receiver: vi.fn().mockImplementation(function () {
    return { verify: mockVerify }
  }),
}))

import { GET, POST, maxDuration } from '@/app/api/cron/payment-tick/route'
import { runFeeCharge, type FeeCaseRow } from '@/lib/payments/fee'
import { runPaymentTick, TICK_STEPS } from '@/lib/payments/tick'
import { retryAt } from '@/lib/payments/timing'

const BOOKING_ID = '22222222-2222-4222-8222-222222222222'
const HOUR = 3_600_000
const CAPTURE_BEFORE_S = Math.floor(Date.now() / 1000) + 7 * 24 * 3600

let db: FakePaymentsDb
let fake: FakeStripe

/** The fake Stripe never expands latest_charge; this wrapper does what expand: ['latest_charge'] does. */
function withExpandedCharge(f: FakeStripe) {
  const expand = (pi: Record<string, unknown>) =>
    typeof pi.latest_charge === 'string'
      ? { ...pi, latest_charge: { id: pi.latest_charge, payment_method_details: { card: { capture_before: CAPTURE_BEFORE_S } } } }
      : pi
  const base = f.stripe.paymentIntents
  return {
    ...f.stripe,
    paymentIntents: {
      ...base,
      create: async (p: Record<string, unknown>, o?: { idempotencyKey?: string }) => expand((await base.create(p, o)) as Record<string, unknown>),
      retrieve: async (id: string, p?: Record<string, unknown>, o?: { idempotencyKey?: string }) =>
        expand((await base.retrieve(id, p, o)) as Record<string, unknown>),
    },
  }
}

function dueBooking(over: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    id: BOOKING_ID,
    status: 'confirmed',
    booking_source: 'web',
    payment_mode: 'card_hold',
    payment_state: 'card_saved',
    booking_reference: 'PRG-20261201-ABC123',
    client_email: 'anna@example.com',
    locale: 'ru',
    pickup_date: '2026-12-01',
    pickup_time: '14:00',
    pickup_utc: new Date(now + 71 * HOUR).toISOString(),
    hold_at: new Date(now - 60_000).toISOString(),
    payment_currency: 'eur',
    payment_amount_minor: 12000,
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_ok',
    ...over,
  }
}

function seed(rows: Array<Record<string, unknown>>) {
  db = createFakePaymentsDb({ bookings: rows })
  world.db = db
}

const row = (id = BOOKING_ID) => db.state.bookings.find((b) => b.id === id)!
const ledger = (kind?: string, id = BOOKING_ID) =>
  db.state.booking_payment_events.filter((e) => e.booking_id === id && (kind ? e.kind === kind : true))

function cronRequest(auth?: string) {
  return new Request('https://example.test/api/cron/payment-tick', {
    headers: auth === undefined ? {} : { authorization: auth },
  })
}
const okRequest = () => cronRequest(`Bearer ${CRON_SECRET}`)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
  world.tables = []
  fake = createFakeStripe()
  world.stripe = withExpandedCharge(fake)
  mockSendEmail.mockResolvedValue('sent')
  mockFailure.mockResolvedValue(undefined)
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  process.env.MANAGER_EMAIL = 'owner@example.com'
  seed([dueBooking()])
})

describe('payment-tick route auth (T-88-31)', () => {
  it('GET without Authorization, with a wrong secret, or with CRON_SECRET unset -> 401 and no claim', async () => {
    const rpc = vi.spyOn(db.client, 'rpc')
    expect((await GET(cronRequest())).status).toBe(401)
    expect((await GET(cronRequest('Bearer wrong-secret!'))).status).toBe(401)
    expect((await GET(cronRequest(`Bearer ${CRON_SECRET}x`))).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await GET(cronRequest('Bearer undefined'))).status).toBe(401)
    expect((await GET(cronRequest('Bearer '))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row().payment_state).toBe('card_saved')
  })

  it('declares maxDuration 300', () => {
    expect(maxDuration).toBe(300)
  })

  it('the route source uses a timing-safe comparison', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../app/api/cron/payment-tick/route.ts'), 'utf8')
    expect(src).toContain('timingSafeEqual')
  })
})

describe('tracer: GET -> step A -> claim -> placeHold -> authorized + hold_placed email (HOLD-02)', () => {
  it('places the full-amount off-session manual-capture hold once and emails the client', async () => {
    const res = await GET(okRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, placed: 1, failed: 0, errors: [] })

    const creates = fake.callsTo('paymentIntents.create')
    expect(creates).toHaveLength(1)
    expect(creates[0].params).toMatchObject({
      amount: 12000,
      currency: 'eur',
      customer: 'cus_1',
      payment_method: 'pm_ok',
      capture_method: 'manual',
      off_session: true,
      confirm: true,
      payment_method_types: ['card'],
      metadata: { kind: 'card_hold', cofBookingId: BOOKING_ID, attempt: '0', bookingReference: 'PRG-20261201-ABC123' },
    })
    expect(creates[0].idempotencyKey).toBe(`hold:${BOOKING_ID}:0`)

    const b = row()
    expect(b.payment_state).toBe('authorized')
    expect(typeof b.hold_payment_intent_id).toBe('string')
    expect(b.hold_amount_minor).toBe(12000)
    expect(b.capture_before).toBe(new Date(CAPTURE_BEFORE_S * 1000).toISOString())
    expect(b.hold_placed_at).toBeTruthy()
    expect(b.payment_lease_until).toBeNull()
    // The hold is not a collected payment.
    expect(b.payment_intent_id).toBeNull()

    expect(ledger('hold_started')).toHaveLength(1)
    expect(ledger('hold_authorized')).toHaveLength(1)

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'hold_placed',
        variant: 'scheduled',
        eventKey: `email:hold_placed_scheduled:${BOOKING_ID}:0`,
      }),
    )
  })

  it('a booking overdue by three days (missed runs) is placed exactly like a just-due one', async () => {
    seed([dueBooking({ hold_at: new Date(Date.now() - 3 * 24 * HOUR).toISOString() })])
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ placed: 1 })
    expect(row().payment_state).toBe('authorized')
  })

  it('a booking with hold_at in the future is not claimed and not held (MUST NOT hold earlier)', async () => {
    seed([dueBooking({ hold_at: new Date(Date.now() + 2 * HOUR).toISOString() })])
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ ok: true, placed: 0, failed: 0, reconciled: 0, errors: [] })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row().payment_state).toBe('card_saved')
  })

  it('holds the booking\'s CURRENT agreed amount (an admin edit is authoritative)', async () => {
    seed([dueBooking({ payment_amount_minor: 15500 })])
    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.create')[0].params.amount).toBe(15500)
    expect(row().hold_amount_minor).toBe(15500)
  })

  it('two overlapping ticks over the same due booking create exactly one PaymentIntent', async () => {
    const [a, b] = await Promise.all([runPaymentTick(), runPaymentTick()])
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
    expect(a.placed + b.placed).toBe(1)
    expect(row().payment_state).toBe('authorized')
  })

  it('with nothing due answers { ok:true, placed:0, captured:0, failed:0, reconciled:0, errors:[] }', async () => {
    seed([])
    const res = await GET(okRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, placed: 0, captured: 0, failed: 0, reconciled: 0, retried: 0, alerts: 0, notices_redriven: 0, fee_reminders: 0, fees_finished: 0, fee_cases_repaired: 0, cash_charges_restored: 0, errors: [] })
  })

  it('a booking whose pickup instant cannot be computed is never held', async () => {
    seed([dueBooking({ pickup_utc: null, pickup_date: '', pickup_time: '' })])
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ placed: 0, failed: 0 })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('only card_hold bookings are claimed (partner and pay_now never are)', async () => {
    seed([
      dueBooking({ id: '33333333-3333-4333-8333-333333333331', payment_mode: 'partner' }),
      dueBooking({ id: '33333333-3333-4333-8333-333333333332', payment_mode: 'pay_now' }),
    ])
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ placed: 0 })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('never reads the card-flow settings (D-09a): zero pricing_globals reads', async () => {
    await GET(okRequest())
    expect(world.tables).not.toContain('pricing_globals')
  })

  it('the tick and hold sources never name the canary settings (D-09a)', () => {
    for (const rel of ['lib/payments/tick.ts', 'lib/payments/hold.ts']) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8')
      expect(src, rel).not.toMatch(/card_flow_mode|card_flow_canary_emails|payment_hold_lead_hours|getPaymentSettings/)
    }
  })
})

describe('TICK_STEPS', () => {
  it('registers A (place holds), B (auto retry), C (settle completed trips), D (alerts), E (reconcile), Q (quote deposits), F (notices) then R (fee cases)', () => {
    expect(TICK_STEPS.map((s) => s.code)).toEqual(['A', 'B', 'C', 'D', 'E', 'Q', 'F', 'R'])
  })
})

describe('vercel.json', () => {
  it('adds the daily payment-tick cron and keeps the existing four unchanged', () => {
    const v = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>
    }
    expect(v.crons).toHaveLength(5)
    expect(v.crons).toContainEqual({ path: '/api/cron/payment-tick', schedule: '0 3 * * *' })
    expect(v.crons).toContainEqual({ path: '/api/cron/flight-refresh', schedule: '0 5 * * *' })
    expect(v.crons).toContainEqual({ path: '/api/cron/reminder-24h', schedule: '0 6 * * *' })
    expect(v.crons).toContainEqual({ path: '/api/cron/indexnow', schedule: '0 7 * * *' })
    expect(v.crons).toContainEqual({ path: '/api/cron/outbox-sweep', schedule: '0 4 * * *' })
  })
})

// ── Task 2 ───────────────────────────────────────────────────────────────────

describe('POST (QStash trigger, D-08)', () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://example.test/api/cron/payment-tick', {
      method: 'POST',
      body,
      headers: { 'content-length': String(Buffer.byteLength(body)), ...headers },
    })

  it('a valid QStash signature over the raw body runs the tick -> 200', async () => {
    mockVerify.mockResolvedValue(true)
    const res = await POST(post('{"run":"tick"}', { 'Upstash-Signature': 'sig' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, placed: 1, errors: [] })
    expect(mockVerify).toHaveBeenCalledWith({ signature: 'sig', body: '{"run":"tick"}' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })

  it('an invalid signature -> 401 and no work', async () => {
    mockVerify.mockResolvedValue(false)
    const res = await POST(post('{}', { 'Upstash-Signature': 'bad' }))
    expect(res.status).toBe(401)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row().payment_state).toBe('card_saved')
  })

  it('a missing signature -> 401 (verification throwing counts as invalid)', async () => {
    mockVerify.mockRejectedValue(new Error('no signature'))
    const res = await POST(post('{}'))
    expect(res.status).toBe(401)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('a body over 1 KB -> 413 before verification', async () => {
    const res = await POST(post('x'.repeat(2048), { 'Upstash-Signature': 'sig' }))
    expect(res.status).toBe(413)
    expect(mockVerify).not.toHaveBeenCalled()
  })
})

describe('step isolation and reconcile (step E)', () => {
  const MIN = 60_000

  function stale(id: string, ageMs: number, over: Record<string, unknown> = {}) {
    return {
      id,
      status: 'unpaid',
      booking_source: 'web',
      payment_mode: 'card_hold',
      payment_state: 'checkout_pending',
      created_at: new Date(Date.now() - ageMs).toISOString(),
      pickup_utc: new Date(Date.now() + 100 * HOUR).toISOString(),
      ...over,
    }
  }

  function putSetupIntent(id: string, status: string, bookingId: string) {
    fake.state.setupIntents.set(id, {
      id,
      object: 'setup_intent',
      status,
      customer: 'cus_1',
      payment_method: 'pm_1',
      metadata: { kind: 'card_setup', cofBookingId: bookingId },
    })
  }

  beforeEach(() => {
    mockSetupSucceeded.mockImplementation(async (si: { metadata: Record<string, string> }) => {
      const r = row(si.metadata.cofBookingId)
      r.payment_state = 'card_saved'
      r.status = 'confirmed'
    })
    mockHoldNowAuthorized.mockImplementation(async (pi: { metadata: Record<string, string>; id: string }) => {
      const r = row(pi.metadata.cofBookingId)
      r.payment_state = 'authorized'
      r.hold_payment_intent_id = pi.id
    })
  })

  const A = '44444444-4444-4444-8444-444444444441'
  const B = '44444444-4444-4444-8444-444444444442'
  const C = '44444444-4444-4444-8444-444444444443'

  it('confirms a 20-minute-old checkout whose SetupIntent succeeded (same code as the webhook, actor tick_reconcile)', async () => {
    seed([stale(A, 20 * MIN, { setup_intent_id: 'seti_a' })])
    putSetupIntent('seti_a', 'succeeded', A)
    const out = await runPaymentTick()
    expect(out).toMatchObject({ ok: true, reconciled: 1, errors: [] })
    expect(mockSetupSucceeded).toHaveBeenCalledTimes(1)
    expect(mockSetupSucceeded.mock.calls[0][0]).toMatchObject({ id: 'seti_a', status: 'succeeded' })
    expect(mockSetupSucceeded.mock.calls[0][1]).toEqual({ type: 'system', id: 'tick_reconcile' })
    expect(row(A).payment_state).toBe('card_saved')
    expect(row(A).status).toBe('confirmed')
  })

  it('leaves a 3-day-old and a 5-minute-old checkout alone', async () => {
    seed([
      stale(A, 3 * 24 * HOUR, { setup_intent_id: 'seti_a' }),
      stale(B, 5 * MIN, { setup_intent_id: 'seti_b' }),
    ])
    putSetupIntent('seti_a', 'succeeded', A)
    putSetupIntent('seti_b', 'succeeded', B)
    const out = await runPaymentTick()
    expect(out.reconciled).toBe(0)
    expect(mockSetupSucceeded).not.toHaveBeenCalled()
    expect(row(A).payment_state).toBe('checkout_pending')
    expect(row(B).payment_state).toBe('checkout_pending')
  })

  it('does not confirm a SetupIntent that has not succeeded', async () => {
    seed([stale(A, 20 * MIN, { setup_intent_id: 'seti_a' })])
    putSetupIntent('seti_a', 'requires_payment_method', A)
    const out = await runPaymentTick()
    expect(out.reconciled).toBe(0)
    expect(mockSetupSucceeded).not.toHaveBeenCalled()
  })

  it('confirms a hold-now PaymentIntent that reached requires_capture (applyHoldNowAuthorized)', async () => {
    seed([stale(C, 30 * MIN, { hold_payment_intent_id: 'pi_now_1', setup_intent_id: null })])
    fake.state.paymentIntents.set('pi_now_1', {
      id: 'pi_now_1',
      object: 'payment_intent',
      status: 'requires_capture',
      amount: 9000,
      amount_capturable: 9000,
      currency: 'eur',
      metadata: { kind: 'card_hold_now', cofBookingId: C },
    })
    const out = await runPaymentTick()
    expect(out).toMatchObject({ reconciled: 1, errors: [] })
    expect(mockHoldNowAuthorized).toHaveBeenCalledTimes(1)
    expect(mockHoldNowAuthorized.mock.calls[0][1]).toEqual({ type: 'system', id: 'tick_reconcile' })
    expect(row(C).payment_state).toBe('authorized')
  })

  it('step A throwing adds "A" to errors, step E still runs, and the answer is still 200', async () => {
    seed([stale(A, 20 * MIN, { setup_intent_id: 'seti_a' })])
    putSetupIntent('seti_a', 'succeeded', A)
    const rpc = db.client.rpc.bind(db.client)
    vi.spyOn(db.client, 'rpc').mockImplementation(async (name: string, args?: Record<string, unknown>) =>
      name === 'claim_due_payment_work' ? { data: null, error: { message: 'boom' } } : rpc(name, args),
    )
    const res = await GET(okRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, errors: ['A'], reconciled: 1 })
  })

  it('step E throwing adds "E" and keeps the counts of step A', async () => {
    mockSetupSucceeded.mockRejectedValue(new Error('x'))
    seed([dueBooking(), stale(A, 20 * MIN, { setup_intent_id: 'seti_a' })])
    putSetupIntent('seti_a', 'succeeded', A)
    const res = await GET(okRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, placed: 1, errors: ['E'] })
  })
})

describe('step Q: reconcile a quote deposit whose webhook never arrived (D-18, T-92-59)', () => {
  const MIN = 60_000
  const Q1 = '55555555-5555-4555-8555-555555555551'
  const Q2 = '55555555-5555-4555-8555-555555555552'
  const Q3 = '55555555-5555-4555-8555-555555555553'

  function quote(id: string, ageMs: number, over: Record<string, unknown> = {}) {
    return {
      id,
      reference: `Q-20261114-${id.slice(-6)}`,
      status: 'accepted',
      current_version_id: '66666666-6666-4666-8666-666666666661',
      deposit_payment_intent_id: `pi_${id.slice(-3)}`,
      accepted_at: new Date(Date.now() - ageMs).toISOString(),
      paid_at: null,
      cancelled_at: null,
      voided_at: null,
      anonymised_at: null,
      ...over,
    }
  }

  function putIntent(quoteRow: Record<string, unknown>, status: string) {
    const id = quoteRow.deposit_payment_intent_id as string
    fake.state.paymentIntents.set(id, {
      id,
      object: 'payment_intent',
      status,
      amount: 5000,
      currency: 'eur',
      metadata: { kind: 'card_quote_deposit', quoteId: quoteRow.id as string, versionId: quoteRow.current_version_id as string },
    })
  }

  function seedQuotes(rows: Array<Record<string, unknown>>) {
    db = createFakePaymentsDb({ bookings: [] })
    db.state.quotes.push(...rows)
    world.db = db
  }

  beforeEach(() => {
    mockApplyQuoteDeposit.mockResolvedValue({ outcome: 'converted', bookingIds: ['b1'] })
  })

  it('tracer: an accepted quote whose deposit succeeded 15 minutes ago is converted with the system actor and counted in reconciled', async () => {
    const q = quote(Q1, 15 * MIN)
    seedQuotes([q])
    putIntent(q, 'succeeded')
    const out = await runPaymentTick()
    expect(out).toMatchObject({ ok: true, reconciled: 1, errors: [] })
    expect(mockApplyQuoteDeposit).toHaveBeenCalledTimes(1)
    expect(mockApplyQuoteDeposit.mock.calls[0][0]).toMatchObject({ id: q.deposit_payment_intent_id, status: 'succeeded' })
    expect(mockApplyQuoteDeposit.mock.calls[0][1]).toEqual({ type: 'system', id: 'tick_reconcile' })
  })

  it('a replayed or ignored answer is not counted as reconciled and is not an error', async () => {
    const q = quote(Q1, 15 * MIN)
    seedQuotes([q])
    putIntent(q, 'succeeded')
    mockApplyQuoteDeposit.mockResolvedValue({ outcome: 'replayed', bookingIds: ['b1'] })
    expect(await runPaymentTick()).toMatchObject({ reconciled: 0, errors: [] })
  })

  it('leaves alone: an intent still requires_payment_method / processing / canceled, a quote younger than 10 minutes, one older than 48 hours', async () => {
    const open = quote(Q1, 20 * MIN)
    const processing = quote(Q2, 20 * MIN)
    const canceled = quote(Q3, 20 * MIN)
    const young = quote('55555555-5555-4555-8555-555555555554', 5 * MIN)
    const old = quote('55555555-5555-4555-8555-555555555555', 49 * HOUR)
    seedQuotes([open, processing, canceled, young, old])
    putIntent(open, 'requires_payment_method')
    putIntent(processing, 'processing')
    putIntent(canceled, 'canceled')
    putIntent(young, 'succeeded')
    putIntent(old, 'succeeded')

    const out = await runPaymentTick()
    expect(out).toMatchObject({ reconciled: 0, errors: [] })
    expect(mockApplyQuoteDeposit).not.toHaveBeenCalled()
    // The young and the old quote are not even read from Stripe; the open intents are read and left untouched (never cancelled here).
    const retrieved = fake.callsTo('paymentIntents.retrieve').map((c) => c.targetId)
    expect(retrieved).not.toContain(young.deposit_payment_intent_id)
    expect(retrieved).not.toContain(old.deposit_payment_intent_id)
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
  })

  it('never selects a paid quote, a cancelled quote, a voided quote, an erased person or a quote without a deposit intent', async () => {
    const paid = quote(Q1, 20 * MIN, { paid_at: new Date().toISOString() })
    const cancelled = quote(Q2, 20 * MIN, { cancelled_at: new Date().toISOString() })
    const voided = quote(Q3, 20 * MIN, { status: 'voided', voided_at: new Date().toISOString() })
    const erased = quote('55555555-5555-4555-8555-555555555556', 20 * MIN, { anonymised_at: new Date().toISOString() })
    const none = quote('55555555-5555-4555-8555-555555555557', 20 * MIN, { deposit_payment_intent_id: null })
    seedQuotes([paid, cancelled, voided, erased, none])
    for (const q of [paid, cancelled, voided, erased]) putIntent(q, 'succeeded')

    const out = await runPaymentTick()
    expect(out).toMatchObject({ reconciled: 0, errors: [] })
    expect(fake.callsTo('paymentIntents.retrieve')).toHaveLength(0)
    expect(mockApplyQuoteDeposit).not.toHaveBeenCalled()
  })

  it('takes at most 20 quotes per run, oldest first', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      quote(`55555555-5555-4555-8555-5555555560${String(i).padStart(2, '0')}`, (20 + i) * MIN),
    )
    seedQuotes(rows)
    for (const q of rows) putIntent(q, 'succeeded')
    const out = await runPaymentTick()
    expect(out.reconciled).toBe(20)
    expect(mockApplyQuoteDeposit).toHaveBeenCalledTimes(20)
    // Oldest first: the 20 oldest are the last 20 rows.
    const handled = mockApplyQuoteDeposit.mock.calls.map((c) => (c[0] as { id: string }).id)
    expect(handled).toContain(rows[24].deposit_payment_intent_id)
    expect(handled).not.toContain(rows[0].deposit_payment_intent_id)
  })

  it('a conversion that throws adds "Q" to errors; the other quotes and the other steps still run', async () => {
    const bad = quote(Q1, 30 * MIN)
    const good = quote(Q2, 20 * MIN)
    seed([dueBooking()])
    db.state.quotes.push(bad, good)
    putIntent(bad, 'succeeded')
    putIntent(good, 'succeeded')
    mockApplyQuoteDeposit.mockImplementation(async (pi: { id: string }) => {
      if (pi.id === bad.deposit_payment_intent_id) throw new Error('quote conversion failed')
      return { outcome: 'converted', bookingIds: ['b1'] }
    })
    const res = await GET(okRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, placed: 1, reconciled: 1, errors: ['Q'] })
    expect(mockApplyQuoteDeposit).toHaveBeenCalledTimes(2)
  })

  it('a Stripe read error on one quote adds "Q" and does not stop the next quote', async () => {
    const a = quote(Q1, 30 * MIN)
    const b = quote(Q2, 20 * MIN)
    seedQuotes([a, b])
    putIntent(b, 'succeeded') // a's intent is missing at Stripe: retrieve throws
    const out = await runPaymentTick()
    expect(out).toMatchObject({ reconciled: 1, errors: ['Q'] })
  })

  it('a database error on the selection adds "Q" and the answer is still 200', async () => {
    seedQuotes([quote(Q1, 20 * MIN)])
    const from = db.client.from.bind(db.client)
    vi.spyOn(db.client, 'from').mockImplementation(((table: string) => {
      if (table === 'quotes') throw new Error('boom')
      return from(table)
    }) as never)
    const res = await GET(okRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, errors: ['Q'] })
  })
})

describe('step C: completion sweep (HOLD-04, Phase 87 hand-off: a lost after() never loses a capture)', () => {
  const ids = [1, 2, 3, 4, 5, 6].map((n) => `55555555-5555-4555-8555-55555555555${n}`)

  async function holdFor(bookingId: string, amount = 12000) {
    const pi = (await fake.stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      customer: 'cus_1',
      payment_method: 'pm_ok',
      capture_method: 'manual',
      off_session: true,
      confirm: true,
      metadata: { kind: 'card_hold', cofBookingId: bookingId, attempt: '0' },
    })) as { id: string }
    return pi.id
  }

  async function completed(id: string, over: Record<string, unknown> = {}) {
    return {
      id,
      status: 'completed',
      completed_at: new Date(Date.now() - 2 * HOUR).toISOString(),
      booking_source: 'web',
      payment_mode: 'card_hold',
      payment_state: 'authorized',
      booking_reference: 'PRG-20261101-SWEEP1',
      client_email: 'anna@example.com',
      locale: 'en',
      pickup_date: '2026-11-01',
      pickup_time: '14:00',
      pickup_utc: new Date(Date.now() - 5 * HOUR).toISOString(),
      payment_currency: 'eur',
      payment_amount_minor: 12000,
      stripe_customer_id: 'cus_1',
      stripe_payment_method_id: 'pm_ok',
      hold_payment_intent_id: await holdFor(id),
      hold_amount_minor: 12000,
      ...over,
    }
  }

  const captureCalls = () => fake.callsTo('paymentIntents.capture')

  it('a completed booking whose after() never ran (still authorized) is captured by the next tick, actor tick_sweep', async () => {
    seed([await completed(ids[0])])
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ ok: true, captured: 1, failed: 0, errors: [] })
    expect(row(ids[0]).payment_state).toBe('captured')
    expect(row(ids[0]).captured_amount_minor).toBe(12000)
    expect(captureCalls()).toHaveLength(1)
    expect(ledger('capture_started', ids[0])[0].actor_id).toBe('tick_sweep')
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it.each(['expired', 'card_saved'])('a completed booking in %s is settled with the saved card', async (payment_state) => {
    seed([await completed(ids[0], { payment_state, hold_payment_intent_id: null, hold_amount_minor: null })])
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ captured: 1 })
    expect(row(ids[0]).payment_state).toBe('captured')
    expect(fake.callsTo('paymentIntents.create').filter((c) => c.idempotencyKey === `chg:${ids[0]}:0`)).toHaveLength(1)
  })

  it('a failed completed booking whose post-trip settle already ran is NOT re-charged by step C (the retry belongs to step B)', async () => {
    const b = await completed(ids[0], { payment_state: 'failed', charge_attempts: 1 })
    seed([b])
    db.state.booking_payment_events.push({
      id: 9200,
      booking_id: ids[0],
      event_key: 'capture_started:0:1',
      kind: 'capture_started',
      from_state: 'authorized',
      to_state: 'capturing',
      actor_type: 'system',
      created_at: new Date(Date.parse(String(b.completed_at)) + 1000).toISOString(),
    })
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ captured: 0, failed: 0 })
    expect(row(ids[0]).payment_state).toBe('failed')
    expect(captureCalls()).toHaveLength(0)
  })

  it('88-REVIEW A-WR-08: a failed completed booking that never had a post-trip settle is charged once by step C', async () => {
    const b = await completed(ids[0], { payment_state: 'failed', hold_payment_intent_id: null, hold_amount_minor: null, payment_retry_count: 1 })
    seed([b])
    // A pre-trip settle attempt does not count: only one at or after completed_at does.
    db.state.booking_payment_events.push({
      id: 9201,
      booking_id: ids[0],
      event_key: 'capture_started:0:0',
      kind: 'capture_started',
      from_state: 'failed',
      to_state: 'capturing',
      actor_type: 'system',
      created_at: new Date(Date.parse(String(b.completed_at)) - 60_000).toISOString(),
    })
    const first = await GET(okRequest())
    expect(await first.json()).toMatchObject({ captured: 1 })
    expect(row(ids[0]).payment_state).toBe('captured')
    expect(fake.callsTo('paymentIntents.create').filter((c) => c.idempotencyKey === `chg:${ids[0]}:0`)).toHaveLength(1)
  })

  it('88-REVIEW A-WR-08: a post-trip settle that fails again is not repeated by step C', async () => {
    const b = await completed(ids[0], {
      payment_state: 'failed',
      hold_payment_intent_id: null,
      hold_amount_minor: null,
      payment_retry_count: 1,
      stripe_payment_method_id: 'pm_decline_insufficient',
    })
    seed([b])
    await GET(okRequest())
    expect(row(ids[0]).payment_state).toBe('failed')
    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.create').filter((c) => String(c.idempotencyKey).startsWith(`chg:${ids[0]}:`))).toHaveLength(1)
  })

  it('a booking with status completed but completed_at NULL (historic) is not selected', async () => {
    seed([await completed(ids[0], { completed_at: null })])
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ captured: 0 })
    expect(row(ids[0]).payment_state).toBe('authorized')
    expect(captureCalls()).toHaveLength(0)
  })

  it('a cancelled booking and a not-yet-completed booking are never selected', async () => {
    seed([
      await completed(ids[0], { status: 'cancelled' }),
      await completed(ids[1], { status: 'confirmed', completed_at: null }),
    ])
    await GET(okRequest())
    expect(captureCalls()).toHaveLength(0)
    expect(row(ids[0]).payment_state).toBe('authorized')
    expect(row(ids[1]).payment_state).toBe('authorized')
  })

  it('a pay_now and a partner booking are never selected', async () => {
    seed([
      await completed(ids[0], { payment_mode: 'pay_now', payment_state: 'none' }),
      await completed(ids[1], { booking_source: 'gnet', payment_mode: 'partner', payment_state: 'none' }),
    ])
    await GET(okRequest())
    expect(captureCalls()).toHaveLength(0)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(2) // only the two seed holds
  })

  it('a capturing row whose lease expired is finished; a live lease is left alone', async () => {
    const expired = await completed(ids[0], { payment_state: 'capturing', payment_lease_until: new Date(Date.now() - 60_000).toISOString() })
    const live = await completed(ids[1], { payment_state: 'capturing', payment_lease_until: new Date(Date.now() + 120_000).toISOString() })
    seed([expired, live])
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ captured: 1 })
    expect(row(ids[0]).payment_state).toBe('captured')
    expect(row(ids[1]).payment_state).toBe('capturing')
    expect(captureCalls()).toHaveLength(1)
  })

  it('two overlapping ticks capture a completed booking exactly once', async () => {
    seed([await completed(ids[0])])
    await Promise.all([GET(okRequest()), GET(okRequest())])
    expect(captureCalls()).toHaveLength(1)
    expect(ledger('captured', ids[0])).toHaveLength(1)
    expect(row(ids[0]).captured_amount_minor).toBe(12000)
  })

  it('settles at most HOLD_CLAIM_LIMIT bookings per run (oldest completion first); the rest wait for the next run', async () => {
    const rows = []
    for (let i = 0; i < 22; i += 1) {
      const id = `66666666-6666-4666-8666-6666666666${String(i).padStart(2, '0')}`
      rows.push(await completed(id, { completed_at: new Date(Date.now() - (30 - i) * 60_000).toISOString() }))
    }
    seed(rows)
    const first = await (await GET(okRequest())).json()
    expect(first.captured).toBe(20)
    const second = await (await GET(okRequest())).json()
    expect(second.captured).toBe(2)
  })

  it('counts a declined fallback charge as failed and keeps the other bookings going', async () => {
    seed([
      await completed(ids[0], { payment_state: 'expired', hold_payment_intent_id: null, stripe_payment_method_id: 'pm_decline_insufficient' }),
      await completed(ids[1]),
    ])
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ captured: 1, failed: 1, errors: [] })
    expect(row(ids[0]).payment_state).toBe('failed')
    expect(row(ids[1]).payment_state).toBe('captured')
  })

  it('a settle that throws for one booking adds "C" and the other bookings are still settled', async () => {
    seed([await completed(ids[0]), await completed(ids[1])])
    const rpc = db.client.rpc.bind(db.client)
    let thrown = false
    vi.spyOn(db.client, 'rpc').mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'apply_payment_transition' && !thrown) {
        thrown = true
        return { data: null, error: { message: 'boom' } }
      }
      return rpc(name, args)
    })
    const res = await GET(okRequest())
    expect(await res.json()).toMatchObject({ ok: true, captured: 1, errors: ['C'] })
  })

  it('step C throwing adds "C" and step E still runs', async () => {
    const stepC = TICK_STEPS.find((s) => s.code === 'C')!
    vi.spyOn(stepC, 'run').mockRejectedValue(new Error('x'))
    mockSetupSucceeded.mockResolvedValue(undefined)
    seed([
      {
        id: ids[2],
        status: 'unpaid',
        booking_source: 'web',
        payment_mode: 'card_hold',
        payment_state: 'checkout_pending',
        setup_intent_id: 'seti_c',
        created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        pickup_utc: new Date(Date.now() + 100 * HOUR).toISOString(),
      },
    ])
    fake.state.setupIntents.set('seti_c', {
      id: 'seti_c',
      object: 'setup_intent',
      status: 'succeeded',
      customer: 'cus_1',
      payment_method: 'pm_1',
      metadata: { kind: 'card_setup', cofBookingId: ids[2] },
    })
    try {
      const res = await GET(okRequest())
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, errors: ['C'], reconciled: 1 })
    } finally {
      vi.mocked(stepC.run).mockRestore()
    }
  })

  it('never reads the card-flow settings (D-09a): zero pricing_globals reads', async () => {
    seed([await completed(ids[0])])
    world.tables = []
    await GET(okRequest())
    expect(world.tables).not.toContain('pricing_globals')
  })
})

describe('retry timestamp helper stays aligned with timing.ts', () => {
  it('retryAt is the shared clamp (12 h later, never later than 2 h before pickup)', () => {
    const t = Date.now()
    expect(retryAt(t, t + 100 * HOUR)).toBe(t + 12 * HOUR)
  })
})

// ── plan 88-14: step B (the one automatic retry, D-13) and step D (operator alerts, D-15) ──────────────────────────

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const hoursAhead = (h: number) => new Date(Date.now() + h * HOUR).toISOString()
const operatorMails = () =>
  mockResendSend.mock.calls.map((c) => c[0] as { to: string[]; subject: string; text: string }).filter((m) => m.to[0] === 'owner@example.com')

/** A hold that was declined once: failed, one attempt used, the retry instant already passed. */
function failedHold(over: Record<string, unknown> = {}) {
  return dueBooking({
    payment_state: 'failed',
    hold_at: minutesAgo(13 * 60),
    hold_attempts: 1,
    last_payment_error: 'insufficient_funds',
    payment_failed_at: minutesAgo(12 * 60 + 1),
    payment_retry_at: minutesAgo(1),
    payment_retry_count: 0,
    pickup_utc: hoursAhead(40),
    ...over,
  })
}

describe('step B: the one automatic retry (D-13)', () => {
  it('a declined hold whose retry instant has passed is retried once: a fresh key, the retry marked used', async () => {
    seed([failedHold()])
    const res = await (await GET(okRequest())).json()
    expect(res).toMatchObject({ ok: true, retried: 1, placed: 1, errors: [] })

    const b = row()
    expect(b.payment_state).toBe('authorized')
    expect(b.payment_retry_count).toBe(1)
    expect(b.payment_retry_at).toBeNull()
    const creates = fake.callsTo('paymentIntents.create')
    expect(creates).toHaveLength(1)
    expect(creates[0].idempotencyKey).toBe(`hold:${BOOKING_ID}:1`)
  })

  it('the retry declining again -> failed with no retry instant, attempt 2 reported, never retried a third time', async () => {
    seed([failedHold({ stripe_payment_method_id: 'pm_decline_insufficient' })])
    const first = await (await GET(okRequest())).json()
    expect(first).toMatchObject({ retried: 1, failed: 1 })

    const b = row()
    expect(b.payment_state).toBe('failed')
    expect(b.hold_attempts).toBe(2)
    expect(b.payment_retry_count).toBe(1)
    expect(b.payment_retry_at).toBeNull()
    // The recovery step is mocked here, so nothing is recorded as delivered: step F (A-WR-10) re-drives the same notice.
    expect(mockFailure).toHaveBeenCalled()
    for (const call of mockFailure.mock.calls) {
      expect(call[1]).toEqual({ phase: 'hold', code: 'insufficient_funds', amountMinor: 12000, attempt: 2 })
    }

    const second = await (await GET(okRequest())).json()
    expect(second).toMatchObject({ retried: 0 })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })

  it('payment_retry_count 1 is never retried again, even with a passed retry instant', async () => {
    seed([failedHold({ payment_retry_count: 1 })])
    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row().payment_state).toBe('failed')
  })

  it('a booking the client paid through the link (captured) is not retried', async () => {
    seed([failedHold({ payment_state: 'captured', captured_amount_minor: 12000 })])
    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row().payment_state).toBe('captured')
  })

  it('no retry instant (pickup too close) and a retry instant still ahead are not retried', async () => {
    seed([
      failedHold({ id: '33333333-3333-4333-8333-333333333331', payment_retry_at: null }),
      failedHold({ id: '33333333-3333-4333-8333-333333333332', payment_retry_at: hoursAhead(5) }),
    ])
    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('a failed trip that is completed is settled once (charge of the saved card), not held again', async () => {
    seed([
      failedHold({
        status: 'completed',
        completed_at: minutesAgo(30),
        pickup_utc: hoursAhead(-14),
        hold_payment_intent_id: null,
        charge_attempts: 1,
      }),
    ])
    const res = await (await GET(okRequest())).json()
    expect(res).toMatchObject({ retried: 1, captured: 1, errors: [] })

    const b = row()
    expect(b.payment_state).toBe('captured')
    expect(b.payment_retry_count).toBe(1)
    expect(b.captured_amount_minor).toBe(12000)
    const creates = fake.callsTo('paymentIntents.create')
    expect(creates).toHaveLength(1)
    expect(creates[0].idempotencyKey).toBe(`chg:${BOOKING_ID}:1`)
    expect(creates[0].params.capture_method).toBeUndefined()
  })

  it('a cancelled booking is never retried and no step changes bookings.status', async () => {
    seed([
      failedHold({ id: '33333333-3333-4333-8333-333333333331', status: 'cancelled' }),
      failedHold({ id: '33333333-3333-4333-8333-333333333332', stripe_payment_method_id: 'pm_decline_insufficient' }),
    ])
    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
    expect(row('33333333-3333-4333-8333-333333333331').status).toBe('cancelled')
    expect(row('33333333-3333-4333-8333-333333333331').payment_state).toBe('failed')
    expect(row('33333333-3333-4333-8333-333333333332').status).toBe('confirmed')
  })

  it('two overlapping ticks retry a declined hold exactly once', async () => {
    seed([failedHold()])
    await Promise.all([GET(okRequest()), GET(okRequest())])
    expect(fake.callsTo('paymentIntents.create').filter((c) => !c.replayed)).toHaveLength(1)
    expect(row().payment_state).toBe('authorized')
  })
})

describe('step D: operator alerts before pickup and before a hold lapses (D-15)', () => {
  it('card_saved with pickup in 20 h -> one "no valid hold" alert; the next tick sends no second one', async () => {
    seed([dueBooking({ hold_at: hoursAhead(1), pickup_utc: hoursAhead(20) })])
    const first = await (await GET(okRequest())).json()
    expect(first).toMatchObject({ alerts: 1, errors: [] })

    expect(operatorMails()).toHaveLength(1)
    expect(operatorMails()[0].subject).toBe('[Payment] No valid hold, pickup within 24 h — PRG-20261201-ABC123')
    expect(operatorMails()[0].text).toContain('Contact the client or place a hold from the booking.')
    expect(ledger('alert_sent').map((e) => e.event_key)).toEqual([`alert:no_valid_hold_24h:${BOOKING_ID}`])

    await GET(okRequest())
    expect(operatorMails()).toHaveLength(1)
    expect(ledger('alert_sent')).toHaveLength(1)
    // D-15: nothing cancels or changes the booking.
    expect(row().status).toBe('confirmed')
    expect(row().payment_state).toBe('card_saved')
  })

  it('failed and expired bookings inside 24 h alert too; an authorized one does not', async () => {
    seed([
      dueBooking({ id: '44444444-4444-4444-8444-444444444441', payment_state: 'failed', hold_at: hoursAhead(1), pickup_utc: hoursAhead(10), payment_retry_at: null }),
      dueBooking({ id: '44444444-4444-4444-8444-444444444442', payment_state: 'expired', hold_at: hoursAhead(1), pickup_utc: hoursAhead(10) }),
      dueBooking({ id: '44444444-4444-4444-8444-444444444443', payment_state: 'authorized', hold_at: hoursAhead(1), pickup_utc: hoursAhead(10) }),
    ])
    await GET(okRequest())
    expect(operatorMails()).toHaveLength(2)
  })

  it('a booking with pickup beyond 24 h and one that already passed are not alerted', async () => {
    seed([
      dueBooking({ id: '44444444-4444-4444-8444-444444444441', hold_at: hoursAhead(1), pickup_utc: hoursAhead(30) }),
      dueBooking({ id: '44444444-4444-4444-8444-444444444442', hold_at: hoursAhead(1), pickup_utc: hoursAhead(-2) }),
    ])
    await GET(okRequest())
    expect(operatorMails()).toHaveLength(0)
  })

  it('checkout_pending older than 30 minutes alerts; a younger one does not', async () => {
    seed([
      dueBooking({ id: '44444444-4444-4444-8444-444444444441', payment_state: 'checkout_pending', hold_at: null, pickup_utc: hoursAhead(10), created_at: minutesAgo(40) }),
      dueBooking({ id: '44444444-4444-4444-8444-444444444442', payment_state: 'checkout_pending', hold_at: null, pickup_utc: hoursAhead(10), created_at: minutesAgo(5) }),
    ])
    await GET(okRequest())
    expect(operatorMails()).toHaveLength(1)
    expect(ledger('alert_sent', '44444444-4444-4444-8444-444444444441')).toHaveLength(1)
    expect(ledger('alert_sent', '44444444-4444-4444-8444-444444444442')).toHaveLength(0)
  })

  it('an authorized hold whose capture_before is 10 h away on an open trip -> one "hold expires soon" alert', async () => {
    seed([
      dueBooking({
        payment_state: 'authorized',
        hold_payment_intent_id: 'pi_hold_1',
        hold_at: minutesAgo(60),
        pickup_utc: hoursAhead(50),
        capture_before: hoursAhead(10),
      }),
    ])
    await GET(okRequest())
    expect(operatorMails()).toHaveLength(1)
    expect(operatorMails()[0].subject).toBe('[Payment] Hold expires soon — PRG-20261201-ABC123')
    expect(ledger('alert_sent').map((e) => e.event_key)).toEqual([`alert:hold_expiring:${BOOKING_ID}:pi_hold_1`])

    await GET(okRequest())
    expect(operatorMails()).toHaveLength(1)
  })

  it('no expiring alert for a far capture_before, a completed trip or a cancelled booking', async () => {
    const authorized = { payment_state: 'authorized', hold_payment_intent_id: 'pi_hold_1', pickup_utc: hoursAhead(50) }
    seed([
      dueBooking({ ...authorized, id: '44444444-4444-4444-8444-444444444441', capture_before: hoursAhead(72) }),
      dueBooking({ ...authorized, id: '44444444-4444-4444-8444-444444444442', capture_before: hoursAhead(10), completed_at: minutesAgo(5), status: 'completed' }),
      dueBooking({ ...authorized, id: '44444444-4444-4444-8444-444444444443', capture_before: hoursAhead(10), status: 'cancelled' }),
    ])
    await GET(okRequest())
    expect(operatorMails().filter((m) => m.subject.includes('Hold expires soon'))).toHaveLength(0)
  })

  it('without MANAGER_EMAIL the tick still finishes and nothing is claimed in the ledger', async () => {
    delete process.env.MANAGER_EMAIL
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seed([dueBooking({ hold_at: hoursAhead(1), pickup_utc: hoursAhead(20) })])
    const res = await GET(okRequest())
    expect(res.status).toBe(200)
    expect(mockResendSend).not.toHaveBeenCalled()
    expect(ledger('alert_sent')).toHaveLength(0)
  })
})

// ── plan 89-13 (CASH-03, HOLD-06, D-15, D-19, D-21): step R, the background half of the operator decision ─────────────

const CASE_ID = '99999999-9999-4999-8999-999999999991'

/** A cancelled card booking with a pending fee case opened `openedHoursAgo` hours ago (the trigger mirror is set too). */
function seedFeeCase(
  openedHoursAgo: number,
  opts: { booking?: Record<string, unknown>; caseRow?: Record<string, unknown> } = {},
) {
  seed([
    dueBooking({
      status: 'cancelled',
      payment_state: 'authorized',
      hold_at: null,
      pickup_utc: hoursAhead(30),
      capture_before: null,
      charge_attempts: 0,
      ...opts.booking,
    }),
  ])
  const caseRow = {
    id: CASE_ID,
    booking_id: BOOKING_ID,
    kind: 'late_cancel',
    status: 'pending',
    currency: 'eur',
    base_minor: 12000,
    proposed_minor: 12000,
    decided_minor: null,
    charge_requested_at: null,
    free_until: hoursAhead(-26),
    evidence: {},
    reason: null,
    contact_note: null,
    opened_at: hoursAhead(-openedHoursAgo),
    opened_by: 'admin-1',
    decided_at: null,
    decided_by: null,
    ...opts.caseRow,
  }
  db.state.booking_fee_cases.push(caseRow as never)
  row().fee_case_status = caseRow.status as string
  return caseRow
}

const feeMails = () => operatorMails().filter((m) => m.subject.startsWith('[Fee]'))

describe('step R tracer (D-15): a case 25 h old reaches one fee_pending_24h reminder', () => {
  it('registers R after F', () => {
    expect(TICK_STEPS.map((s) => s.code)).toEqual(['A', 'B', 'C', 'D', 'E', 'Q', 'F', 'R'])
  })

  it('a pending case opened 25 h ago -> one reminder keyed alert:fee_pending:<caseId>; the next tick sends nothing', async () => {
    seedFeeCase(25)
    const first = await (await GET(okRequest())).json()
    expect(first).toMatchObject({ ok: true, fee_reminders: 1, errors: [] })

    expect(feeMails()).toHaveLength(1)
    expect(feeMails()[0].subject).toBe('[Fee] Still undecided after 24 h — PRG-20261201-ABC123')
    expect(feeMails()[0].text).toContain('Nothing is charged until you decide.')
    expect(ledger('alert_sent').map((e) => e.event_key)).toEqual([`alert:fee_pending:${CASE_ID}`])

    await GET(okRequest())
    expect(feeMails()).toHaveLength(1)
    expect(ledger('alert_sent')).toHaveLength(1)
    // Nothing is charged and nothing changes by itself.
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row().payment_state).toBe('authorized')
    expect(db.state.booking_fee_cases[0].status).toBe('pending')
  })

  it('a case opened 2 h ago with no hold is not reminded yet', async () => {
    seedFeeCase(2)
    await GET(okRequest())
    expect(feeMails()).toHaveLength(0)
  })

  it('a case opened 2 h ago whose hold ends within 12 h is reminded now', async () => {
    seedFeeCase(2, { booking: { capture_before: hoursAhead(10) } })
    await GET(okRequest())
    expect(feeMails()).toHaveLength(1)
    expect(feeMails()[0].text).toContain('Hold ends:')
  })

  it('a case opened 2 h ago whose hold ends in 3 days is not reminded', async () => {
    seedFeeCase(2, { booking: { capture_before: hoursAhead(72) } })
    await GET(okRequest())
    expect(feeMails()).toHaveLength(0)
  })

  it('a charged case and a waived case are never reminded', async () => {
    seedFeeCase(30, { caseRow: { status: 'charged', decided_minor: 12000, decided_at: hoursAhead(-1), decided_by: 'admin-1' } })
    await GET(okRequest())
    expect(feeMails()).toHaveLength(0)
    seedFeeCase(30, { caseRow: { status: 'waived', decided_at: hoursAhead(-1), decided_by: 'admin-1' } })
    await GET(okRequest())
    expect(feeMails()).toHaveLength(0)
  })

  it('D-21: a completed cash booking in card_saved gets no case, no reminder and no change', async () => {
    seed([
      dueBooking({
        payment_mode: 'cash_guarantee',
        payment_state: 'card_saved',
        status: 'completed',
        completed_at: hoursAhead(-30),
        pickup_utc: hoursAhead(-33),
        hold_at: null,
      }),
    ])
    const before = JSON.stringify(row())
    const out = await (await GET(okRequest())).json()
    expect(out).toMatchObject({ ok: true, errors: [] })
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(operatorMails()).toHaveLength(0)
    expect(JSON.stringify(row())).toBe(before)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })

  it('D-19: an unpaid booking past its alert window keeps its status (the 24 h alert is step D only)', async () => {
    seed([
      dueBooking({
        status: 'unpaid',
        payment_state: 'checkout_pending',
        created_at: hoursAhead(-26),
        pickup_utc: hoursAhead(-1),
        hold_at: null,
      }),
    ])
    await GET(okRequest())
    expect(row().status).toBe('unpaid')
    expect(row().payment_state).toBe('checkout_pending')
    expect(db.state.booking_fee_cases).toHaveLength(0)
  })

  it('the tick source reads no card-flow switch', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/payments/tick.ts'), 'utf8')
    expect(src).not.toMatch(/card_flow_mode/)
    expect(src).toContain('fee_pending_24h')
  })
})

describe('step R: finish interrupted charges, repair closed money, reconcile cash checkouts (T-89-45, T-89-46)', () => {
  const ADMIN = { type: 'admin', id: 'admin-1' } as const
  const CASH_ID = '99999999-9999-4999-8999-999999999992'
  const lapsed = () => hoursAhead(-1)

  /** A full-amount hold at the fake Stripe for the seeded booking. */
  async function feeHold(): Promise<string> {
    const pi = (await fake.stripe.paymentIntents.create({
      amount: 12000,
      currency: 'eur',
      customer: 'cus_1',
      payment_method: 'pm_ok',
      capture_method: 'manual',
      off_session: true,
      confirm: true,
      metadata: { kind: 'card_hold', cofBookingId: BOOKING_ID, attempt: '0' },
    })) as { id: string }
    return pi.id
  }

  const theCase = () => db.state.booking_fee_cases[0] as unknown as FeeCaseRow
  const receipts = () => mockSendEmail.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((a) => a.kind === 'fee_charged')

  /** The operator clicked "charge 40": the amount is locked, the capture died on a connection error, the lease lapsed. */
  async function interruptedFee(): Promise<string> {
    const hold = await feeHold()
    seedFeeCase(26, { booking: { hold_payment_intent_id: hold, hold_amount_minor: 12000 } })
    fake.failNextWith('paymentIntents.capture', 'connection')
    const click = await runFeeCharge({ booking: row(), caseRow: theCase(), amountMinor: 4000, actor: ADMIN })
    expect(click).toEqual({ error: 'payment_busy' })
    expect(row().payment_state).toBe('capturing')
    row().payment_lease_until = lapsed()
    // The claim ledger key carries the millisecond (capture_started:<attempt>:<ms>); a real tick never runs in the click's ms.
    await new Promise((resolve) => setTimeout(resolve, 5))
    return hold
  }

  it('a fee capture that died mid-flight finishes on the next tick with the SAME Stripe key; the case closes and fee_charged goes out once', async () => {
    await interruptedFee()
    expect(theCase().charge_requested_at).not.toBeNull()
    expect(theCase().decided_minor).toBe(4000)

    const out = await (await GET(okRequest())).json()
    expect(out).toMatchObject({ ok: true, fees_finished: 1, errors: [] })

    const captures = fake.callsTo('paymentIntents.capture')
    expect(captures).toHaveLength(2)
    expect(captures[1].idempotencyKey).toBe(`feecap:${CASE_ID}:0`)
    expect(captures[1].idempotencyKey).toBe(captures[0].idempotencyKey)
    expect(captures[1].params).toMatchObject({ amount_to_capture: 4000 })
    expect(row().payment_state).toBe('captured')
    expect(row().captured_amount_minor).toBe(4000)
    expect(theCase()).toMatchObject({ status: 'charged', decided_minor: 4000, decided_by: 'tick_sweep' })
    expect(row().fee_case_status).toBe('charged')
    expect(receipts()).toHaveLength(1)
    expect(receipts()[0]).toMatchObject({ variant: 'late_cancel', eventKey: `email:fee_charged:${CASE_ID}`, feeMinor: 4000 })
    // The case closed in this very run, so no "still undecided" reminder follows it.
    expect(feeMails()).toHaveLength(0)

    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(2)
    expect(receipts()).toHaveLength(1)
  })

  it('T-89-45: a capturing row whose case has no charge_requested_at is not charged by the sweep', async () => {
    const hold = await feeHold()
    seedFeeCase(2, { booking: { hold_payment_intent_id: hold, hold_amount_minor: 12000, payment_state: 'capturing', payment_lease_until: lapsed() } })
    const out = await (await GET(okRequest())).json()
    expect(out).toMatchObject({ ok: true, fees_finished: 0, errors: [] })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1) // only the hold seeded by the test
    expect(row().payment_state).toBe('capturing')
    expect(theCase().status).toBe('pending')
  })

  it('a live lease is left alone', async () => {
    await interruptedFee()
    row().payment_lease_until = hoursAhead(1)
    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(row().payment_state).toBe('capturing')
    expect(theCase().status).toBe('pending')
  })

  it('T-89-46: two overlapping ticks finish the fee once', async () => {
    await interruptedFee()
    await Promise.all([GET(okRequest()), GET(okRequest())])
    expect(theCase().status).toBe('charged')
    expect(row().captured_amount_minor).toBe(4000)
    expect(receipts()).toHaveLength(1)
    // The interrupted click plus exactly one finish: the second tick lost the claim and never reached Stripe.
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(2)
  })

  it('a re-driven fee that the card declines unlocks the case and charges nothing again on later ticks', async () => {
    seedFeeCase(26, {
      booking: {
        payment_state: 'capturing',
        payment_lease_until: lapsed(),
        stripe_payment_method_id: 'pm_decline_insufficient',
        hold_payment_intent_id: null,
      },
      caseRow: { decided_minor: 4000, charge_requested_at: hoursAhead(-1) },
    })
    const out = await (await GET(okRequest())).json()
    expect(out).toMatchObject({ ok: true, fees_finished: 0, errors: [] })
    expect(fake.callsTo('paymentIntents.create').map((c) => c.idempotencyKey)).toEqual([`fee:${CASE_ID}:0`])
    expect(row().payment_state).toBe('failed')
    expect(mockFailure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phase: 'fee' }))
    expect(theCase()).toMatchObject({ status: 'pending', charge_requested_at: null })
    expect(receipts()).toHaveLength(0)

    await GET(okRequest())
    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
  })

  it('a captured row whose pending case holds exactly the captured fee closes the case with no Stripe call', async () => {
    seedFeeCase(26, {
      booking: { payment_state: 'captured', captured_amount_minor: 4000, payment_intent_id: 'pi_done' },
      caseRow: { decided_minor: 4000, charge_requested_at: hoursAhead(-1) },
    })
    const out = await (await GET(okRequest())).json()
    expect(out).toMatchObject({ ok: true, fee_cases_repaired: 1, errors: [] })
    expect(fake.calls).toHaveLength(0)
    expect(theCase()).toMatchObject({ status: 'charged', decided_minor: 4000, decided_by: 'tick_sweep' })
    expect(row().fee_case_status).toBe('charged')
    expect(receipts()).toHaveLength(1)
    expect(feeMails()).toHaveLength(0)

    await GET(okRequest())
    expect(receipts()).toHaveLength(1)
  })

  it('money WR-01: the sweep closing a no-show case passes the wait from the evidence to the receipt', async () => {
    seedFeeCase(2, {
      booking: { payment_state: 'captured', captured_amount_minor: 4000, payment_intent_id: 'pi_ns' },
      caseRow: { kind: 'no_show', decided_minor: 4000, charge_requested_at: hoursAhead(-1), evidence: { threshold_min: 60 } },
    })
    await GET(okRequest())
    expect(receipts()[0]).toMatchObject({ variant: 'no_show', waitMin: 60 })
  })

  it('a captured row whose captured amount is not the decided fee, or whose case was never locked, is left alone', async () => {
    seedFeeCase(2, {
      booking: { payment_state: 'captured', captured_amount_minor: 12000, payment_intent_id: 'pi_trip' },
      caseRow: { decided_minor: 4000, charge_requested_at: hoursAhead(-1) },
    })
    await GET(okRequest())
    expect(theCase().status).toBe('pending')
    seedFeeCase(2, { booking: { payment_state: 'captured', captured_amount_minor: 4000, payment_intent_id: 'pi_x' } })
    await GET(okRequest())
    expect(theCase().status).toBe('pending')
    expect(receipts()).toHaveLength(0)
  })

  function cashRow(over: Record<string, unknown> = {}) {
    return dueBooking({
      id: CASH_ID,
      payment_mode: 'cash_guarantee',
      payment_state: 'capturing',
      payment_lease_until: lapsed(),
      status: 'on_board',
      hold_at: null,
      hold_payment_intent_id: null,
      charge_attempts: 0,
      ...over,
    })
  }

  it('money WR-08: an anonymised booking is left alone: no retry, no settle, no notice to an erased address', async () => {
    const erased = hoursAhead(-1)
    const A = '99999999-9999-4999-8999-999999999995'
    const B = '99999999-9999-4999-8999-999999999996'
    const C = '99999999-9999-4999-8999-999999999997'
    seed([
      // Step B: the one automatic retry is due.
      dueBooking({ id: A, status: 'completed', completed_at: hoursAhead(-30), payment_state: 'failed', payment_retry_count: 0, payment_retry_at: hoursAhead(-1), anonymised_at: erased }),
      // Step C: a completed trip waiting to be settled.
      dueBooking({ id: B, status: 'completed', completed_at: hoursAhead(-2), payment_state: 'card_saved', hold_at: null, anonymised_at: erased }),
      // Step F: a recent failure whose notices were never delivered.
      dueBooking({ id: C, status: 'completed', completed_at: hoursAhead(-2), payment_state: 'failed', payment_retry_count: 1, payment_failed_at: hoursAhead(-1), anonymised_at: erased }),
    ])
    db.state.booking_payment_events.push({ booking_id: C, event_key: 'charge_failed:none:0', kind: 'charge_failed', to_state: 'failed', created_at: hoursAhead(-1) })

    await GET(okRequest())

    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row(A).payment_state).toBe('failed')
    expect(row(B).payment_state).toBe('card_saved')
    expect(mockFailure).not.toHaveBeenCalled()
  })

  it('money review 2, WR-08 (owner: erasure writes the debt off): no tick step works an anonymised row, alerts and checkouts included', async () => {
    const erased = hoursAhead(-1)
    const D = '99999999-9999-4999-8999-999999999981'
    const E = '99999999-9999-4999-8999-999999999982'
    seed([
      // Step R: an interrupted cash card charge.
      cashRow({ stripe_customer_id: 'cus_cash', anonymised_at: erased }),
      // Step D: a card booking with no valid hold, pickup within 24 h.
      dueBooking({ id: D, payment_state: 'failed', pickup_utc: hoursAhead(5), hold_at: null, anonymised_at: erased }),
      // Step E: a checkout whose SetupIntent succeeded.
      { id: E, status: 'unpaid', booking_source: 'web', payment_mode: 'card_hold', payment_state: 'checkout_pending', setup_intent_id: 'seti_erased', created_at: minutesAgo(20), pickup_utc: hoursAhead(-2), anonymised_at: erased },
    ])
    fake.state.setupIntents.set('seti_erased', { id: 'seti_erased', object: 'setup_intent', status: 'succeeded', customer: 'cus_1', payment_method: 'pm_1', metadata: { kind: 'card_setup', cofBookingId: E } })

    const out = await (await GET(okRequest())).json()

    expect(out).toMatchObject({ ok: true, reconciled: 0, alerts: 0, cash_charges_restored: 0, fees_finished: 0, errors: [] })
    expect(fake.calls).toHaveLength(0)
    expect(row(CASH_ID).payment_state).toBe('capturing')
    expect(mockSetupSucceeded).not.toHaveBeenCalled()
    expect(operatorMails()).toHaveLength(0)
  })

  it('CR-05: an interrupted cash card charge with no payment at Stripe is never charged: the row is free again and the operator told', async () => {
    seed([cashRow()])
    const out = await (await GET(okRequest())).json()
    expect(out).toMatchObject({ ok: true, fees_finished: 0, cash_charges_restored: 1, errors: [] })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row(CASH_ID)).toMatchObject({ payment_state: 'card_saved', payment_lease_until: null, charge_attempts: 0 })
    expect(receipts()).toHaveLength(0)
    expect(ledger('alert_sent', CASH_ID).map((e) => e.event_key)).toEqual([`alert:cash_charge_interrupted:${CASH_ID}:0`])

    await GET(okRequest())
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('CR-05: a card that had failed before goes back to failed, so the driver can still confirm cash', async () => {
    seed([cashRow({ payment_failed_at: hoursAhead(-1), last_payment_error: 'card_declined', charge_attempts: 1 })])
    await GET(okRequest())
    expect(row(CASH_ID)).toMatchObject({ payment_state: 'failed', charge_attempts: 1 })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('CR-05: a charge that succeeded before the crash is recorded by reading Stripe, with one receipt and no new charge', async () => {
    seed([cashRow({ stripe_customer_id: 'cus_cash' })])
    const pi = (await fake.stripe.paymentIntents.create({
      amount: 12000,
      currency: 'eur',
      customer: 'cus_cash',
      payment_method: 'pm_ok',
      off_session: true,
      confirm: true,
      metadata: { kind: 'card_charge', cofBookingId: CASH_ID, attempt: '0', bookingReference: 'PRG' },
    })) as { id: string }
    fake.calls.length = 0

    const out = await (await GET(okRequest())).json()
    expect(out).toMatchObject({ ok: true, fees_finished: 1, errors: [] })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row(CASH_ID)).toMatchObject({ payment_state: 'captured', captured_amount_minor: 12000, payment_intent_id: pi.id })
    expect(receipts()).toHaveLength(1)
    expect(receipts()[0]).toMatchObject({ variant: 'cash_card', eventKey: `email:fee_charged:${CASH_ID}` })
    // Money review 2, CR-01: the operator's click gave up on this charge, so they are told it went through after all.
    expect(ledger('alert_sent', CASH_ID).map((e) => e.event_key)).toEqual([`alert:cash_card_late:${CASH_ID}:${pi.id}`])
  })

  it('CR-05: Stripe can not be read: the row waits for the next run, nothing is charged and nothing is guessed', async () => {
    seed([cashRow({ stripe_customer_id: 'cus_cash' })])
    fake.failNextWith('paymentIntents.list', 'connection')
    await GET(okRequest())
    expect(row(CASH_ID).payment_state).toBe('capturing')
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('D-21: cash rows that nobody started charging stay untouched (card_saved, completed or not; live lease)', async () => {
    const A = '99999999-9999-4999-8999-999999999993'
    const B = '99999999-9999-4999-8999-999999999994'
    seed([
      cashRow({ id: CASH_ID, payment_state: 'card_saved', payment_lease_until: null, status: 'completed', completed_at: hoursAhead(-30) }),
      cashRow({ id: A, payment_state: 'card_saved', payment_lease_until: null, status: 'on_board' }),
      cashRow({ id: B, payment_lease_until: hoursAhead(1) }),
    ])
    const out = await (await GET(okRequest())).json()
    expect(out).toMatchObject({ ok: true, fees_finished: 0, errors: [] })
    expect(fake.calls).toHaveLength(0)
    expect(row(CASH_ID).payment_state).toBe('card_saved')
    expect(row(A).payment_state).toBe('card_saved')
    expect(row(B).payment_state).toBe('capturing')
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(operatorMails()).toHaveLength(0)
  })

  it('step E reconciles a cash checkout like a card checkout (actor tick_reconcile)', async () => {
    seed([
      {
        id: CASH_ID,
        status: 'unpaid',
        booking_source: 'web',
        payment_mode: 'cash_guarantee',
        payment_state: 'checkout_pending',
        setup_intent_id: 'seti_cash',
        created_at: minutesAgo(20),
        pickup_utc: hoursAhead(100),
      },
    ])
    fake.state.setupIntents.set('seti_cash', {
      id: 'seti_cash',
      object: 'setup_intent',
      status: 'succeeded',
      customer: 'cus_1',
      payment_method: 'pm_1',
      metadata: { kind: 'card_setup', cofBookingId: CASH_ID },
    })
    const out = await (await GET(okRequest())).json()
    expect(out).toMatchObject({ reconciled: 1, errors: [] })
    expect(mockSetupSucceeded).toHaveBeenCalledTimes(1)
    expect(mockSetupSucceeded.mock.calls[0][1]).toEqual({ type: 'system', id: 'tick_reconcile' })
  })

  it('a problem reading the fee cases adds "R" and the other steps still run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seedFeeCase(2)
    const from = db.client.from.bind(db.client)
    vi.spyOn(db.client, 'from').mockImplementation(((table: string) => {
      if (table === 'booking_fee_cases') throw new Error('boom')
      return from(table)
    }) as never)
    const res = await GET(okRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, errors: ['R'] })
  })
})
