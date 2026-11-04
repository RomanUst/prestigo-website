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

const { world, mockSendEmail, mockSetupSucceeded, mockHoldNowAuthorized, mockVerify } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
    tables: [] as string[],
  },
  mockSendEmail: vi.fn(),
  mockSetupSucceeded: vi.fn(),
  mockHoldNowAuthorized: vi.fn(),
  mockVerify: vi.fn(),
}))

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

vi.mock('@/lib/stripe-webhook/card-confirm', () => ({
  applySetupSucceeded: mockSetupSucceeded,
  applyHoldNowAuthorized: mockHoldNowAuthorized,
}))

vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@upstash/qstash', () => ({
  Receiver: vi.fn().mockImplementation(function () {
    return { verify: mockVerify }
  }),
}))

import { GET, POST, maxDuration } from '@/app/api/cron/payment-tick/route'
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

  it('with nothing due answers { ok:true, placed:0, failed:0, reconciled:0, errors:[] }', async () => {
    seed([])
    const res = await GET(okRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, placed: 0, failed: 0, reconciled: 0, errors: [] })
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
  it('this plan registers step A then step E', () => {
    expect(TICK_STEPS.map((s) => s.code)).toEqual(['A', 'E'])
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

describe('retry timestamp helper stays aligned with timing.ts', () => {
  it('retryAt is the shared clamp (12 h later, never later than 2 h before pickup)', () => {
    const t = Date.now()
    expect(retryAt(t, t + 100 * HOUR)).toBe(t + 12 * HOUR)
  })
})
