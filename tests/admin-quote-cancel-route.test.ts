// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { FIRST_PICKUP_MS, seedPaidQuote, type PaidQuoteFixture } from './helpers/quote-cancel-fixture'

/**
 * Phase 92 plan 92-22 (QUOTE-03, QUOTE-04; D-11, D-12): the admin routes of a quote cancel and a quote refund. The routes,
 * the cancel service and the cancel engine run for real on the in-memory database; Stripe, Resend and the admin session
 * are doubles.
 */

const { world, mockResendSend } = vi.hoisted(() => ({
  world: {
    db: null as unknown as FakePaymentsDb,
    stripe: null as unknown,
    auth: 'admin' as 'admin' | '401' | '403',
  },
  mockResendSend: vi.fn(),
}))

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'
process.env.RESEND_API_KEY = 're_test'

async function advanceRpc(args: Record<string, unknown>) {
  const b = world.db.state.bookings.find((x) => x.id === args.p_booking_id)
  if (!b) return { data: { applied: false, current_status: null }, error: null }
  if (b.status !== args.p_from) return { data: { applied: false, current_status: b.status }, error: null }
  b.status = args.p_to
  return { data: { applied: true, booking: { ...b } }, error: null }
}

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    if (world.auth === '401') return { user: null, error: '401' as const }
    if (world.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: ADMIN_ID }, error: null }
  }),
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) =>
      name === 'advance_booking_status' ? advanceRpc(args ?? {}) : world.db.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: vi.fn() }))
vi.mock('@/lib/payments/emails/send', () => ({ sendPaymentEmail: vi.fn(), bookingEmailDataFromRow: (r: unknown) => r }))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: vi.fn() }))
vi.mock('@/lib/booking-status-service', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/booking-status-service')>()),
  scheduleCancelRouteEmail: vi.fn(),
}))

import { GET as CANCEL_GET, POST as CANCEL } from '@/app/api/admin/quotes/[id]/cancel/route'
import { POST as REFUND } from '@/app/api/admin/quotes/[id]/refund/route'
import { FakeStripeError } from './helpers/fake-stripe'

const HOUR = 3_600_000
const FREE_NOW = FIRST_PICKUP_MS - 10 * 24 * HOUR

let db: FakePaymentsDb
let fake: FakeStripe

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function req(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const cancel = (id: string, body?: unknown) => CANCEL(req('POST', `http://localhost/api/admin/quotes/${id}/cancel`, body), params(id))
const refund = (id: string, body?: unknown) => REFUND(req('POST', `http://localhost/api/admin/quotes/${id}/refund`, body), params(id))
const preview = (id: string, query = '') => CANCEL_GET(req('GET', `http://localhost/api/admin/quotes/${id}/cancel${query}`), params(id))

async function seed(over: Parameters<typeof seedPaidQuote>[2] = {}): Promise<PaidQuoteFixture> {
  return seedPaidQuote(db, fake, over)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FREE_NOW)
  process.env.MANAGER_EMAIL = 'owner@example.com'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  db = createFakePaymentsDb({ nowMs: FREE_NOW })
  fake = createFakeStripe()
  world.db = db
  world.stripe = fake.stripe
  world.auth = 'admin'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/admin/quotes/[id]/cancel', () => {
  it('tracer: a free cancel answers 200 with the refund, cancels the trips and never caches', async () => {
    const f = await seed()
    const res = await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: null })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, outcome: 'free', refundedMinor: 5000, refundFailed: false })
    expect(db.state.bookings.filter((b) => b.quote_id === f.quoteId).map((b) => b.status)).toEqual(['cancelled', 'cancelled'])
    expect(fake.callsTo('refunds.create')).toHaveLength(1)
  })

  it('401 without a session and 403 for a non-admin; nothing is read or changed', async () => {
    const f = await seed()
    world.auth = '401'
    expect((await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: null })).status).toBe(401)
    world.auth = '403'
    expect((await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: null })).status).toBe(403)
    world.auth = '401'
    expect((await preview(f.quoteId)).status).toBe(401)
    world.auth = '403'
    expect((await preview(f.quoteId)).status).toBe(403)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
    expect(db.state.bookings.filter((b) => b.quote_id === f.quoteId).map((b) => b.status)).toEqual(['confirmed', 'confirmed'])
  })

  it('a malformed id is 400', async () => {
    expect((await cancel('not-a-uuid', { initiator: 'admin_client', refund_minor: null })).status).toBe(400)
    expect((await preview('not-a-uuid')).status).toBe(400)
  })

  it.each([
    ['an unknown key', { initiator: 'admin_client', refund_minor: null, extra: 1 }],
    ['a missing initiator', { refund_minor: null }],
    ['an initiator the client could send', { initiator: 'client_token', refund_minor: null }],
    ['a negative refund', { initiator: 'admin_client', refund_minor: -1 }],
    ['a fractional refund', { initiator: 'admin_client', refund_minor: 10.5 }],
    ['a string refund', { initiator: 'admin_client', refund_minor: '100' }],
    ['an array body', []],
  ])('%s is 400 and changes nothing', async (_name, body) => {
    const f = await seed()
    expect((await cancel(f.quoteId, body)).status).toBe(400)
    expect(db.state.bookings.filter((b) => b.quote_id === f.quoteId).map((b) => b.status)).toEqual(['confirmed', 'confirmed'])
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
  })

  it('malformed JSON is 400 and an oversized body is 413', async () => {
    const f = await seed()
    expect((await cancel(f.quoteId, '{not json')).status).toBe(400)
    expect((await cancel(f.quoteId, JSON.stringify({ initiator: 'admin_client', refund_minor: null, pad: 'x'.repeat(2000) }))).status).toBe(413)
  })

  it('an unknown quote is 404', async () => {
    expect((await cancel('00000000-0000-4000-8000-000000000999', { initiator: 'admin_client', refund_minor: null })).status).toBe(404)
  })

  it('an unpaid quote is 422 not_paid', async () => {
    const f = await seed({ quote: { paid_at: null, status: 'accepted' } })
    const res = await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: null })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'not_paid' })
  })

  it('cancelling twice is 422 already_cancelled', async () => {
    const f = await seed()
    expect((await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: null })).status).toBe(200)
    const again = await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: null })
    expect(again.status).toBe(422)
    expect(await again.json()).toEqual({ error: 'already_cancelled' })
    expect(fake.callsTo('refunds.create')).toHaveLength(1)
  })
})

describe('GET /api/admin/quotes/[id]/cancel', () => {
  it('returns the decision for the dialog and is never cached', async () => {
    const f = await seed()
    const res = await preview(f.quoteId)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      outcome: 'free',
      freeUntilMs: FIRST_PICKUP_MS - 48 * HOUR,
      depositMinor: 5000,
      refundedMinor: 0,
      keptMinor: 0,
      proposedRefundMinor: 5000,
      remainderRefundMinor: 0,
    })
    // A preview writes nothing.
    expect(db.state.quote_events).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
  })

  it('takes the initiator from the query and refuses an unknown one', async () => {
    const f = await seed()
    vi.setSystemTime(FIRST_PICKUP_MS - 24 * HOUR)
    expect((await (await preview(f.quoteId, '?initiator=admin_client')).json()).outcome).toBe('late')
    expect((await (await preview(f.quoteId, '?initiator=admin_prestigo')).json()).outcome).toBe('free')
    expect((await preview(f.quoteId, '?initiator=client_token')).status).toBe(400)
  })

  it('an unpaid quote is 422 not_paid and an unknown quote 404', async () => {
    const f = await seed({ quote: { paid_at: null, status: 'accepted' } })
    const res = await preview(f.quoteId)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'not_paid' })
    expect((await preview('00000000-0000-4000-8000-000000000999')).status).toBe(404)
  })
})

describe('POST /api/admin/quotes/[id]/cancel: late cancels and refusals (D-11)', () => {
  it('D-11: a late cancel with the refund the operator confirmed keeps the rest', async () => {
    const f = await seed({ feePercent: 50 })
    vi.setSystemTime(FIRST_PICKUP_MS - 24 * HOUR)
    const res = await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: 2500 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, outcome: 'late', refundedMinor: 2500, refundFailed: false })
  })

  it('D-11: a late cancel without a refund amount, or above the deposit, is 422 refund_out_of_range', async () => {
    const f = await seed()
    vi.setSystemTime(FIRST_PICKUP_MS - 24 * HOUR)
    const missing = await cancel(f.quoteId, { initiator: 'admin_client' })
    expect(missing.status).toBe(422)
    expect(await missing.json()).toEqual({ error: 'refund_out_of_range' })
    const above = await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: 5001 })
    expect(above.status).toBe(422)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
    expect(db.state.bookings.filter((b) => b.quote_id === f.quoteId).map((b) => b.status)).toEqual(['confirmed', 'confirmed'])
  })

  it('a trip that has started is 422 trips_started and nothing changes', async () => {
    const f = await seed({ tripStatuses: ['confirmed', 'on_board'] })
    const res = await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: null })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'trips_started' })
    expect(db.state.bookings.filter((b) => b.quote_id === f.quoteId).map((b) => b.status)).toEqual(['confirmed', 'on_board'])
    expect((await preview(f.quoteId)).status).toBe(422)
  })

  it('a refund that fails still answers 200 with refundFailed true (the cancel stands)', async () => {
    const f = await seed()
    fake.failNextWithError('refunds.create', new FakeStripeError('StripeAPIError', 'down', { code: 'api_error', statusCode: 500 }))
    const res = await cancel(f.quoteId, { initiator: 'admin_client', refund_minor: null })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, outcome: 'free', refundedMinor: 0, refundFailed: true })
  })
})

describe('POST /api/admin/quotes/[id]/refund (D-12)', () => {
  it('refunds part of the deposit: 200, never cached, out_of_range above what is left', async () => {
    const f = await seed()
    const res = await refund(f.quoteId, { source: 'deposit', amount_minor: 1000 })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true })
    expect(fake.callsTo('refunds.create')).toHaveLength(1)

    const over = await refund(f.quoteId, { source: 'deposit', amount_minor: 4001 })
    expect(over.status).toBe(422)
    expect(await over.json()).toEqual({ error: 'out_of_range' })
    expect(fake.callsTo('refunds.create')).toHaveLength(1)
  })

  it('401 / 403 / bad id / bad body / unknown quote / unpaid payment', async () => {
    const f = await seed()
    world.auth = '401'
    expect((await refund(f.quoteId, { source: 'deposit', amount_minor: 100 })).status).toBe(401)
    world.auth = '403'
    expect((await refund(f.quoteId, { source: 'deposit', amount_minor: 100 })).status).toBe(403)
    world.auth = 'admin'
    expect((await refund('nope', { source: 'deposit', amount_minor: 100 })).status).toBe(400)
    for (const body of [
      { source: 'deposit' },
      { source: 'cash', amount_minor: 100 },
      { source: 'deposit', amount_minor: 0 },
      { source: 'deposit', amount_minor: -5 },
      { source: 'deposit', amount_minor: 1.5 },
      { source: 'deposit', amount_minor: 100, extra: true },
    ]) {
      expect((await refund(f.quoteId, body)).status).toBe(400)
    }
    expect((await refund(f.quoteId, '{bad')).status).toBe(400)
    expect((await refund('00000000-0000-4000-8000-000000000999', { source: 'deposit', amount_minor: 100 })).status).toBe(404)
    const notPaid = await refund(f.quoteId, { source: 'remainder', amount_minor: 100 })
    expect(notPaid.status).toBe(422)
    expect(await notPaid.json()).toEqual({ error: 'not_paid' })
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
  })

  it('a Stripe refusal is 502 refund_failed', async () => {
    const f = await seed()
    fake.failNextWithError('refunds.create', new FakeStripeError('StripeAPIError', 'down', { code: 'api_error', statusCode: 500 }))
    const res = await refund(f.quoteId, { source: 'deposit', amount_minor: 1000 })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'refund_failed' })
  })
})
