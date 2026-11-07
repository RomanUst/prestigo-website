// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 88 plan 88-15 (HOLD-07, PAYF-01): the admin payment API behind the PaymentPanel.
 * GET returns the payment facts, the server-side action matrix, the refund_failed flag and the ledger;
 * POST { action } runs capture / retry / release / waive / send_link through the engine with the admin actor.
 * The engine (settle, hold, state) runs for real against the in-memory payments database and the fake Stripe.
 */

const { world, mockSendEmail, mockRefreshLink, mockFailure, mockDeactivateLink } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
    auth: 'admin' as 'admin' | '401' | '403',
  },
  mockSendEmail: vi.fn(),
  mockRefreshLink: vi.fn(),
  mockFailure: vi.fn(),
  mockDeactivateLink: vi.fn(),
}))

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    if (world.auth === '401') return { user: null, error: '401' as const }
    if (world.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: ADMIN_ID }, error: null }
  }),
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db!.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/emails/send', () => ({ sendPaymentEmail: mockSendEmail, bookingEmailDataFromRow: (r: unknown) => r }))
vi.mock('@/lib/payments/recovery', () => ({ handlePaymentFailure: mockFailure, refreshRecoveryLink: mockRefreshLink }))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: mockDeactivateLink }))

import { GET, POST } from '@/app/api/admin/bookings/[id]/payment/route'
import { allowedPaymentActions, runPaymentAction, type PaymentAction } from '@/lib/payments/actions'
import { settleBooking } from '@/lib/payments/settle'
import { PAYMENT_STATES } from '@/lib/payments/state'

const ID = '77777777-7777-4777-8777-777777777777'
const HOUR = 3_600_000

let db: FakePaymentsDb
let fake: FakeStripe

function seed(over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({
    bookings: [
      {
        id: ID,
        status: 'completed',
        completed_at: new Date(Date.now() - HOUR).toISOString(),
        booking_source: 'web',
        payment_mode: 'card_hold',
        payment_state: 'authorized',
        booking_reference: 'PRG-20261101-ADMN01',
        client_email: 'anna@example.com',
        client_first_name: 'Anna',
        locale: 'en',
        pickup_date: '2026-11-01',
        pickup_time: '14:00',
        pickup_utc: new Date(Date.now() - 5 * HOUR).toISOString(),
        payment_currency: 'eur',
        payment_amount_minor: 12000,
        hold_amount_minor: 12000,
        stripe_customer_id: 'cus_1',
        stripe_payment_method_id: 'pm_ok',
        charge_attempts: 0,
        ...over,
      },
    ],
  })
  world.db = db
}

/** Seeds a completed booking whose full-amount hold sits at Stripe in requires_capture. */
async function seedWithHold(over: Record<string, unknown> = {}, holdAmount = 12000) {
  const hold = (await fake.stripe.paymentIntents.create({
    amount: holdAmount,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_ok',
    capture_method: 'manual',
    off_session: true,
    confirm: true,
    metadata: { kind: 'card_hold', cofBookingId: ID, attempt: '0', bookingReference: 'PRG-20261101-ADMN01' },
  })) as { id: string }
  seed({ hold_payment_intent_id: hold.id, hold_amount_minor: holdAmount, payment_state: 'authorized', ...over })
  return hold.id
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}
function getReq(id = ID) {
  return GET(new Request(`http://localhost/api/admin/bookings/${id}/payment`), params(id))
}
function postReq(body: unknown, id = ID, headers: Record<string, string> = {}) {
  return POST(
    new Request(`http://localhost/api/admin/bookings/${id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params(id),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fake = createFakeStripe()
  world.stripe = fake.stripe
  world.auth = 'admin'
  mockSendEmail.mockResolvedValue('sent')
  mockFailure.mockResolvedValue(undefined)
  mockDeactivateLink.mockResolvedValue(undefined)
  mockRefreshLink.mockResolvedValue({ url: 'https://pay.example/recovery', id: 'plink_1' })
})

describe('GET /api/admin/bookings/[id]/payment: guards (T-88-46)', () => {
  it('no session -> 401', async () => {
    seed()
    world.auth = '401'
    expect((await getReq()).status).toBe(401)
  })

  it('a non-admin session -> 403', async () => {
    seed()
    world.auth = '403'
    expect((await getReq()).status).toBe(403)
  })

  it('an id that is not a uuid -> 400', async () => {
    seed()
    expect((await getReq('abc')).status).toBe(400)
  })

  it('an unknown booking -> 404', async () => {
    seed()
    expect((await getReq('00000000-0000-4000-8000-0000000000ff')).status).toBe(404)
  })
})

describe('GET: payment facts, allowed actions and ledger (HOLD-07, PAYF-01)', () => {
  it('a completed authorized card booking -> facts per the plan 88-07 contract, capture allowed, release not', async () => {
    await seedWithHold({
      capture_before: '2026-11-12T13:05:00.000Z',
      hold_at: '2026-11-09T10:00:00.000Z',
      recovery_link_url: 'https://pay.example/r',
      last_payment_error: null,
    })
    const res = await getReq()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.payment).toMatchObject({
      mode: 'card_hold',
      state: 'authorized',
      currency: 'eur',
      amount_minor: 12000,
      hold_amount_minor: 12000,
      captured_amount_minor: 0,
      hold_at: '2026-11-09T10:00:00.000Z',
      capture_before: '2026-11-12T13:05:00.000Z',
      card_saved: true,
      last_payment_error: null,
      payment_retry_at: null,
      payment_retry_count: 0,
      recovery_link_url: 'https://pay.example/r',
      status: 'completed',
      completed: true,
      booking_reference: 'PRG-20261101-ADMN01',
      client_email: 'anna@example.com',
    })
    expect(body.payment.pickup_at).toBe(new Date(row().pickup_utc as string).toISOString())
    expect(body.allowed_actions).toContain('capture')
    expect(body.allowed_actions).not.toContain('release')
    expect(body.refund_failed).toBe(false)
    expect(body.events_total).toBe(body.events.length)
  })

  it('never returns the raw row (no stripe ids, no client name) and no event keys', async () => {
    await seedWithHold()
    db.state.booking_payment_events.push({
      id: 1,
      booking_id: ID,
      event_key: 'captured:pi_secret',
      kind: 'captured',
      stripe_object_id: 'pi_secret',
      amount_minor: 100,
      currency: 'eur',
      from_state: 'a',
      to_state: 'b',
      actor_type: 'system',
      actor_id: null,
      error_code: null,
      created_at: new Date().toISOString(),
    })
    const text = JSON.stringify(await (await getReq()).json())
    expect(text).not.toContain('pi_secret')
    expect(text).not.toContain('cus_1')
    expect(text).not.toContain('pm_ok')
    expect(text).not.toContain('Anna')
    expect(text).not.toContain('event_key')
  })

  it('events are newest first by (created_at DESC, id DESC): equal timestamps order by id', async () => {
    seed()
    const same = '2026-11-02T10:00:00.000Z'
    const ev = (id: number, created_at: string, kind = 'email_sent') => ({
      id,
      booking_id: ID,
      event_key: `k${id}`,
      kind,
      stripe_object_id: null,
      amount_minor: null,
      currency: null,
      from_state: null,
      to_state: null,
      actor_type: 'system',
      actor_id: null,
      error_code: null,
      created_at,
    })
    db.state.booking_payment_events.push(ev(1, '2026-11-01T10:00:00.000Z'), ev(2, same), ev(3, same), ev(4, '2026-11-03T10:00:00.000Z'))
    const body = await (await getReq()).json()
    expect(body.events.map((e: { id: number }) => e.id)).toEqual([4, 3, 2, 1])
    expect(Object.keys(body.events[0]).sort()).toEqual(
      ['actor_id', 'actor_type', 'amount_minor', 'created_at', 'currency', 'error_code', 'id', 'kind'].sort(),
    )
  })

  it('150 ledger rows -> 100 returned, events_total 150', async () => {
    seed()
    for (let i = 1; i <= 150; i++) {
      db.state.booking_payment_events.push({
        id: i,
        booking_id: ID,
        event_key: `k${i}`,
        kind: 'email_sent',
        stripe_object_id: null,
        amount_minor: null,
        currency: null,
        from_state: null,
        to_state: null,
        actor_type: 'system',
        actor_id: null,
        error_code: null,
        created_at: new Date(Date.UTC(2026, 10, 2, 10, 0, i)).toISOString(),
      })
    }
    const body = await (await getReq()).json()
    expect(body.events).toHaveLength(100)
    expect(body.events_total).toBe(150)
    expect(body.events[0].id).toBe(150)
    expect(body.events[99].id).toBe(51)
  })

  it('a pay_now booking with a refund_failed ledger row -> mode pay_now, no actions, refund_failed true', async () => {
    seed({ payment_mode: 'pay_now', payment_state: 'none' })
    db.state.booking_payment_events.push({
      id: 1,
      booking_id: ID,
      event_key: 'refund_failed:re_1',
      kind: 'refund_failed',
      stripe_object_id: null,
      amount_minor: 5000,
      currency: 'eur',
      from_state: 'none',
      to_state: 'none',
      actor_type: 'webhook',
      actor_id: null,
      error_code: 'charge_already_refunded',
      created_at: new Date().toISOString(),
    })
    const body = await (await getReq()).json()
    expect(body.payment.mode).toBe('pay_now')
    expect(body.allowed_actions).toEqual([])
    expect(body.refund_failed).toBe(true)
    expect(body.events).toHaveLength(1)
  })

  it('88-REVIEW C-WR-05: resolve_refund closes an open refund failure; a later failure opens it again', async () => {
    seed({ payment_mode: 'pay_now', payment_state: 'none' })
    const failure = (id: number, created_at: string) => ({
      id,
      booking_id: ID,
      event_key: `refund_failed:re_${id}`,
      kind: 'refund_failed',
      stripe_object_id: null,
      amount_minor: 5000,
      currency: 'eur',
      from_state: 'none',
      to_state: 'none',
      actor_type: 'webhook',
      actor_id: null,
      error_code: 'charge_already_refunded',
      created_at,
    })
    db.state.booking_payment_events.push(failure(501, new Date(db.state.nowMs - 60_000).toISOString()))
    expect((await (await getReq()).json()).refund_failed).toBe(true)

    const res = await postReq({ action: 'resolve_refund' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'ok' })
    const audit = db.state.booking_payment_events.find((e) => e.kind === 'admin_action' && e.error_code === 'refund_resolved')
    expect(audit).toMatchObject({ actor_type: 'admin' })
    expect((await (await getReq()).json()).refund_failed).toBe(false)
    // Nothing open any more: a second resolve is not allowed.
    expect((await postReq({ action: 'resolve_refund' })).status).toBe(422)

    db.state.booking_payment_events.push(failure(502, new Date(db.state.nowMs + 60_000).toISOString()))
    expect((await (await getReq()).json()).refund_failed).toBe(true)
  })

  it('88-REVIEW C-WR-05: resolve_refund without any refund failure -> 422', async () => {
    seed()
    expect((await postReq({ action: 'resolve_refund' })).status).toBe(422)
  })

  it('a pay_now booking without ledger rows -> empty events and refund_failed false', async () => {
    seed({ payment_mode: 'pay_now', payment_state: 'none' })
    const body = await (await getReq()).json()
    expect(body.allowed_actions).toEqual([])
    expect(body.refund_failed).toBe(false)
    expect(body.events).toEqual([])
    expect(body.events_total).toBe(0)
  })

  it('refund_failed is found even when the row is older than the 100 newest', async () => {
    seed()
    db.state.booking_payment_events.push({
      id: 1,
      booking_id: ID,
      event_key: 'refund_failed:old',
      kind: 'refund_failed',
      stripe_object_id: null,
      amount_minor: null,
      currency: null,
      from_state: null,
      to_state: null,
      actor_type: 'webhook',
      actor_id: null,
      error_code: null,
      created_at: '2026-01-01T00:00:00.000Z',
    })
    for (let i = 2; i <= 120; i++) {
      db.state.booking_payment_events.push({
        id: i,
        booking_id: ID,
        event_key: `k${i}`,
        kind: 'email_sent',
        stripe_object_id: null,
        amount_minor: null,
        currency: null,
        from_state: null,
        to_state: null,
        actor_type: 'system',
        actor_id: null,
        error_code: null,
        created_at: new Date(Date.UTC(2026, 10, 2, 10, 0, i)).toISOString(),
      })
    }
    const body = await (await getReq()).json()
    expect(body.events.some((e: { kind: string }) => e.kind === 'refund_failed')).toBe(false)
    expect(body.refund_failed).toBe(true)
  })
})

describe('POST: guard order and body validation (T-88-46, T-88-47)', () => {
  it('no session -> 401 before anything else is read', async () => {
    await seedWithHold()
    world.auth = '401'
    expect((await postReq({ action: 'capture' })).status).toBe(401)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })

  it('a non-admin session -> 403', async () => {
    await seedWithHold()
    world.auth = '403'
    expect((await postReq({ action: 'capture' })).status).toBe(403)
  })

  it('a body over 2 KB -> 413 (content-length)', async () => {
    await seedWithHold()
    const res = await postReq({ action: 'capture' }, ID, { 'content-length': '3000' })
    expect(res.status).toBe(413)
  })

  it('a body over 2 KB without a content-length header -> 413', async () => {
    await seedWithHold()
    const res = await postReq({ action: 'capture', pad: 'x'.repeat(3000) })
    expect(res.status).toBe(413)
  })

  it('an id that is not a uuid -> 400', async () => {
    seed()
    expect((await postReq({ action: 'capture' }, 'abc')).status).toBe(400)
  })

  it('invalid JSON -> 400', async () => {
    await seedWithHold()
    expect((await postReq('{not json')).status).toBe(400)
  })

  it('an unknown action -> 400', async () => {
    await seedWithHold()
    expect((await postReq({ action: 'refund' })).status).toBe(400)
  })

  it('a body carrying an amount is rejected (strict schema, no amount field accepted) -> 400', async () => {
    await seedWithHold()
    const res = await postReq({ action: 'capture', amount: 1 })
    expect(res.status).toBe(400)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(row().payment_state).toBe('authorized')
  })

  it('an unknown booking -> 404', async () => {
    seed()
    expect((await postReq({ action: 'capture' }, '00000000-0000-4000-8000-0000000000ff')).status).toBe(404)
  })
})

describe('tracer: POST capture runs settleBooking with the admin actor (HOLD-07, T-88-48)', () => {
  it('capture on a completed authorized booking -> 200 ok, one Stripe capture, admin_action + captured history', async () => {
    const holdId = await seedWithHold()
    const res = await postReq({ action: 'capture' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'ok' })
    expect(row().payment_state).toBe('captured')
    expect(row().captured_amount_minor).toBe(12000)

    const captures = fake.callsTo('paymentIntents.capture')
    expect(captures).toHaveLength(1)
    expect(captures[0].targetId).toBe(holdId)
    expect(captures[0].params).toEqual({ amount_to_capture: 12000 })

    const admin = ledger('admin_action')
    expect(admin).toHaveLength(1)
    expect(admin[0].actor_type).toBe('admin')
    expect(admin[0].actor_id).toBe(ADMIN_ID)
    expect(String(admin[0].event_key)).toMatch(new RegExp(`^admin:capture:${ID}:\\d+$`))

    // The engine rows carry the admin actor (settleBooking(id, { type: 'admin', id })).
    expect(ledger('capture_started')[0].actor_type).toBe('admin')
    expect(ledger('capture_started')[0].actor_id).toBe(ADMIN_ID)
    expect(ledger('captured')[0].actor_id).toBe(ADMIN_ID)
    // The admin_action row is written before the engine call.
    expect(Number(admin[0].id)).toBeLessThan(Number(ledger('capture_started')[0].id))
  })

  it('capture whose charge is declined -> 200 declined', async () => {
    seed({ payment_state: 'card_saved', stripe_payment_method_id: 'pm_decline_insufficient', hold_payment_intent_id: null })
    const res = await postReq({ action: 'capture' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'declined' })
    expect(row().payment_state).toBe('failed')
  })

  it('capture that ends in balance_due (difference declined) -> 200 declined', async () => {
    await seedWithHold({ payment_amount_minor: 15000, stripe_payment_method_id: 'pm_decline_insufficient' }, 12000)
    const res = await postReq({ action: 'capture' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'declined' })
    expect(row().payment_state).toBe('balance_due')
  })

  it('capture on a captured booking -> 422 action_not_allowed and no Stripe call', async () => {
    await seedWithHold({ payment_state: 'captured', captured_amount_minor: 12000 })
    const before = fake.calls.length
    const res = await postReq({ action: 'capture' })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed' })
    expect(fake.calls.length).toBe(before)
    expect(ledger('admin_action')).toHaveLength(0)
  })

  it('capture while the row is in capturing -> 422 (nothing is offered while a worker holds the lease)', async () => {
    await seedWithHold({ payment_state: 'capturing' })
    const res = await postReq({ action: 'capture' })
    expect(res.status).toBe(422)
  })

  it('capture before the trip is completed -> 422', async () => {
    await seedWithHold({ status: 'confirmed', completed_at: null })
    const res = await postReq({ action: 'capture' })
    expect(res.status).toBe(422)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })

  it('capture on a pay_now booking -> 422', async () => {
    seed({ payment_mode: 'pay_now', payment_state: 'none' })
    expect((await postReq({ action: 'capture' })).status).toBe(422)
  })

  it('a transient Stripe problem during capture -> 409 payment_busy, the row stays in capturing for the sweep', async () => {
    await seedWithHold()
    fake.failNextWith('paymentIntents.capture', 'connection')
    const res = await postReq({ action: 'capture' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'payment_busy' })
    expect(row().payment_state).toBe('capturing')
  })

  it('the response never carries an amount from the request: only the recorded amount is captured', async () => {
    await seedWithHold({ payment_amount_minor: 9000 }, 12000)
    const res = await postReq({ action: 'capture' })
    expect(res.status).toBe(200)
    expect(fake.callsTo('paymentIntents.capture')[0].params).toEqual({ amount_to_capture: 9000 })
  })
})

// ── Task 2: the full action matrix, retry / release / waive / send_link, concurrency and replay ──────────────

/** Not-yet-completed card booking with a saved card and a pickup three days ahead. */
function seedUpcoming(over: Record<string, unknown> = {}) {
  seed({
    status: 'confirmed',
    completed_at: null,
    pickup_utc: new Date(Date.now() + 72 * HOUR).toISOString(),
    payment_state: 'card_saved',
    hold_payment_intent_id: null,
    hold_amount_minor: null,
    hold_at: new Date(Date.now() - 60_000).toISOString(),
    ...over,
  })
}

const adminRows = () => ledger('admin_action')

describe('allowedPaymentActions: the single action matrix (HOLD-07, UI-SPEC Actions)', () => {
  // state: [actions while the trip is not completed, actions once it is completed]
  const EXPECTED: Record<string, { open: PaymentAction[]; done: PaymentAction[] }> = {
    none: { open: [], done: [] },
    checkout_pending: { open: ['release'], done: [] },
    // 88-REVIEW T2: no payment link where the engine still collects by itself (card_saved / authorized / expired).
    card_saved: { open: ['retry', 'release'], done: ['capture', 'retry'] },
    placing_hold: { open: [], done: [] },
    authorized: { open: ['release'], done: ['capture'] },
    capturing: { open: [], done: [] },
    captured: { open: [], done: [] },
    balance_due: { open: ['waive', 'send_link'], done: ['waive', 'send_link'] },
    failed: { open: ['retry', 'release', 'send_link'], done: ['capture', 'retry', 'send_link'] },
    expired: { open: ['retry', 'release'], done: ['capture', 'retry'] },
    released: { open: [], done: [] },
    // Phase 89 (087): a card_hold booking is never cash settled; the matrix offers nothing until plan 89-17 owns the cash actions.
    cash_settled: { open: [], done: [] },
  }

  it('covers every payment state', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PAYMENT_STATES].sort())
  })

  for (const state of PAYMENT_STATES) {
    it(`card_hold + ${state}: not completed -> [${EXPECTED[state].open}], completed -> [${EXPECTED[state].done}]`, () => {
      expect(allowedPaymentActions({ payment_mode: 'card_hold', payment_state: state, status: 'confirmed' })).toEqual(EXPECTED[state].open)
      expect(allowedPaymentActions({ payment_mode: 'card_hold', payment_state: state, status: 'completed' })).toEqual(EXPECTED[state].done)
    })

    it(`pay_now + ${state}: nothing, completed or not`, () => {
      expect(allowedPaymentActions({ payment_mode: 'pay_now', payment_state: state, status: 'confirmed' })).toEqual([])
      expect(allowedPaymentActions({ payment_mode: 'pay_now', payment_state: state, status: 'completed' })).toEqual([])
    })
  }

  // 88-REVIEW T2 (C-WR-03): a cancelled or no-show booking never gets a new hold, a capture or a link; only a hold or
  // card that is still there can be released. Collected money with no case can get its fee case opened (money WR-02).
  const CLOSED: Record<string, PaymentAction[]> = {
    none: [],
    checkout_pending: ['release'],
    card_saved: ['release'],
    placing_hold: [],
    authorized: ['release'],
    capturing: [],
    captured: ['open_fee_case'],
    balance_due: ['open_fee_case'],
    failed: ['release'],
    expired: ['release'],
    released: [],
    cash_settled: [],
  }
  for (const status of ['cancelled', 'no_show']) {
    it(`${status}: release only, never retry / capture / send_link / waive`, () => {
      for (const state of PAYMENT_STATES) {
        expect(allowedPaymentActions({ payment_mode: 'card_hold', payment_state: state, status }), `${status} ${state}`).toEqual(CLOSED[state])
      }
    })
  }

  it('a partner (gnet) booking has no actions', () => {
    expect(
      allowedPaymentActions({ payment_mode: 'card_hold', payment_state: 'authorized', status: 'completed', booking_source: 'gnet' }),
    ).toEqual([])
  })

  it('HOLD-07 adjacency: capture is offered for authorized but not for capturing or captured; release is gone once completed', () => {
    const done = (payment_state: string) => allowedPaymentActions({ payment_mode: 'card_hold', payment_state, status: 'completed' })
    expect(done('authorized')).toContain('capture')
    expect(done('capturing')).not.toContain('capture')
    expect(done('captured')).not.toContain('capture')
    expect(done('authorized')).not.toContain('release')
  })
})

describe('POST retry (HOLD-07, D-02, D-13)', () => {
  it('before completion in card_saved -> claim + placeHold -> authorized -> ok, hold placed once with the admin actor', async () => {
    seedUpcoming()
    const res = await postReq({ action: 'retry' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'ok' })
    expect(row().payment_state).toBe('authorized')
    expect(row().hold_amount_minor).toBe(12000)
    const creates = fake.callsTo('paymentIntents.create')
    expect(creates).toHaveLength(1)
    expect(creates[0].params).toMatchObject({ amount: 12000, capture_method: 'manual', off_session: true, confirm: true })
    expect(creates[0].idempotencyKey).toBe(`hold:${ID}:0`)

    expect(adminRows()).toHaveLength(1)
    expect(adminRows()[0].actor_id).toBe(ADMIN_ID)
    expect(ledger('hold_started')[0].actor_type).toBe('admin')
    expect(ledger('hold_authorized')[0].actor_id).toBe(ADMIN_ID)
  })

  it('works from expired and failed too', async () => {
    seedUpcoming({ payment_state: 'expired' })
    expect((await postReq({ action: 'retry' })).status).toBe(200)
    expect(row().payment_state).toBe('authorized')

    seedUpcoming({ payment_state: 'failed', last_payment_error: 'card_declined' })
    expect((await postReq({ action: 'retry' })).status).toBe(200)
    expect(row().payment_state).toBe('authorized')
  })

  it('placeHold declined -> 200 declined and the row is failed', async () => {
    seedUpcoming({ stripe_payment_method_id: 'pm_decline_insufficient' })
    const res = await postReq({ action: 'retry' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'declined' })
    expect(row().payment_state).toBe('failed')
    expect(mockFailure).toHaveBeenCalledTimes(1)
  })

  it('placeHold transient -> 409 payment_busy and the row is back in card_saved with the same attempt', async () => {
    seedUpcoming()
    fake.failNextWith('paymentIntents.create', 'connection')
    const res = await postReq({ action: 'retry' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'payment_busy' })
    expect(row().payment_state).toBe('card_saved')
    expect(row().hold_attempts).toBe(0)
  })

  it('claimForHold not applied (a worker holds the row) -> 409 and no Stripe call', async () => {
    // The route's copy of the row says card_saved; the database row is already being placed by the tick.
    seedUpcoming({ payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() + 300_000).toISOString() })
    const stale = { ...row(), payment_state: 'card_saved' }
    const res = await runPaymentAction(stale, 'retry', { id: ADMIN_ID })
    expect(res).toEqual({ status: 409, error: 'payment_busy' })
    expect(fake.calls).toHaveLength(0)
  })

  it('the pickup has passed -> nothing is placed: 422 and the row is back in card_saved', async () => {
    seedUpcoming({ pickup_utc: new Date(Date.now() - HOUR).toISOString() })
    const res = await postReq({ action: 'retry' })
    expect(res.status).toBe(422)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(row().payment_state).toBe('card_saved')
  })

  it('after completion in failed -> settleBooking: collected -> ok', async () => {
    seed({ payment_state: 'failed', hold_payment_intent_id: null, last_payment_error: 'card_declined' })
    const res = await postReq({ action: 'retry' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'ok' })
    expect(row().payment_state).toBe('captured')
    const charges = fake.callsTo('paymentIntents.create')
    expect(charges).toHaveLength(1)
    expect(charges[0].params).toMatchObject({ amount: 12000, off_session: true, confirm: true })
    expect(ledger('capture_started')[0].actor_id).toBe(ADMIN_ID)
    expect(adminRows()).toHaveLength(1)
  })

  it('after completion in failed -> settleBooking: declined again -> 200 declined', async () => {
    seed({ payment_state: 'failed', hold_payment_intent_id: null, stripe_payment_method_id: 'pm_decline_insufficient' })
    const res = await postReq({ action: 'retry' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'declined' })
    expect(row().payment_state).toBe('failed')
    expect(row().charge_attempts).toBe(1)
  })
})

describe('POST release and waive (HOLD-07, D-04)', () => {
  it('release an authorized hold before completion -> hold cancelled at Stripe, released, ok', async () => {
    const holdId = await seedWithHold({ status: 'confirmed', completed_at: null, pickup_utc: new Date(Date.now() + 72 * HOUR).toISOString() })
    const res = await postReq({ action: 'release' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'ok' })
    expect(row().payment_state).toBe('released')
    const cancels = fake.callsTo('paymentIntents.cancel')
    expect(cancels).toHaveLength(1)
    expect(cancels[0].targetId).toBe(holdId)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)

    expect(ledger('hold_released')).toHaveLength(1)
    expect(ledger('hold_released')[0].actor_id).toBe(ADMIN_ID)
    expect(adminRows()).toHaveLength(1)
    expect(adminRows()[0].actor_id).toBe(ADMIN_ID)
  })

  it('release a card_saved booking -> released without a Stripe call', async () => {
    seedUpcoming()
    const res = await postReq({ action: 'release' })
    expect(res.status).toBe(200)
    expect(row().payment_state).toBe('released')
    expect(fake.calls).toHaveLength(0)
  })

  it('release on a completed booking -> 422 and the hold is untouched', async () => {
    await seedWithHold()
    const res = await postReq({ action: 'release' })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed' })
    expect(row().payment_state).toBe('authorized')
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
    expect(adminRows()).toHaveLength(0)
  })

  it('release while a worker holds the row -> 409 payment_busy', async () => {
    seedUpcoming({ payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() + 300_000).toISOString() })
    const res = await runPaymentAction(row(), 'release', { id: ADMIN_ID })
    expect(res).toEqual({ status: 409, error: 'payment_busy' })
  })

  it('release of an already-settled row -> 422 (noop)', async () => {
    seedUpcoming({ payment_state: 'captured', captured_amount_minor: 12000 })
    const res = await runPaymentAction(row(), 'release', { id: ADMIN_ID })
    expect(res).toEqual({ status: 422, error: 'action_not_allowed' })
  })

  it('waive a balance_due -> released with a waived ledger row, ok', async () => {
    seed({ payment_state: 'balance_due', payment_amount_minor: 15000, captured_amount_minor: 12000 })
    const res = await postReq({ action: 'waive' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'ok' })
    expect(row().payment_state).toBe('released')
    expect(ledger('waived')).toHaveLength(1)
    expect(ledger('waived')[0].actor_id).toBe(ADMIN_ID)
    expect(fake.calls).toHaveLength(0)
    expect(adminRows()).toHaveLength(1)
  })

  it('waive on a booking that is not in balance_due -> 422', async () => {
    await seedWithHold()
    expect((await postReq({ action: 'waive' })).status).toBe(422)
  })
})

describe('POST send_link (HOLD-07, D-14, Pitfall 12)', () => {
  it('failed, due 12000, captured 0 -> link for 12000 with an admin- tag, then the payment_failed email', async () => {
    seed({ payment_state: 'failed', hold_payment_intent_id: null, last_payment_error: 'card_declined' })
    const res = await postReq({ action: 'send_link' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'ok' })
    expect(mockRefreshLink).toHaveBeenCalledTimes(1)
    const [linkBooking, amount, tag] = mockRefreshLink.mock.calls[0]
    expect(linkBooking.id).toBe(ID)
    expect(amount).toBe(12000)
    expect(String(tag)).toMatch(/^admin-\d+$/)

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const mail = mockSendEmail.mock.calls[0][0]
    expect(mail.kind).toBe('payment_failed')
    expect(mail.variant).toBe('declined')
    expect(mail.eventKey).toBe(`email:payment_failed:${ID}:admin:${tag}`)
    expect(mail.payUrl).toBe('https://pay.example/recovery')
    expect(mail.booking.payment_amount_minor).toBe(12000)
    expect(adminRows()).toHaveLength(1)
    expect(adminRows()[0].actor_id).toBe(ADMIN_ID)
  })

  it('balance_due, due 15000, captured 12000 -> link for the 3000 still owed', async () => {
    seed({ payment_state: 'balance_due', payment_amount_minor: 15000, captured_amount_minor: 12000 })
    const res = await postReq({ action: 'send_link' })
    expect(res.status).toBe(200)
    expect(mockRefreshLink.mock.calls[0][1]).toBe(3000)
    expect(mockSendEmail.mock.calls[0][0].booking.payment_amount_minor).toBe(3000)
  })

  it('a booking in authorized (completed or not) is never sent a link: the engine captures it (88-REVIEW T2)', async () => {
    await seedWithHold()
    expect((await postReq({ action: 'send_link' })).status).toBe(422)

    await seedWithHold({ status: 'confirmed', completed_at: null })
    expect((await postReq({ action: 'send_link' })).status).toBe(422)
    expect(mockRefreshLink).not.toHaveBeenCalled()
  })

  it('the server refuses send_link and retry on a cancelled or no-show booking even when the state would allow it (T2)', async () => {
    for (const status of ['cancelled', 'no_show']) {
      seed({ status, payment_state: 'failed', hold_payment_intent_id: null })
      expect((await postReq({ action: 'send_link' })).status).toBe(422)
      expect((await postReq({ action: 'retry' })).status).toBe(422)
    }
    expect(mockRefreshLink).not.toHaveBeenCalled()
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('no link could be created -> 502 link_failed and no email', async () => {
    seed({ payment_state: 'failed', hold_payment_intent_id: null })
    mockRefreshLink.mockResolvedValue(null)
    const res = await postReq({ action: 'send_link' })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'link_failed' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('the email could not be sent -> 502 email_failed', async () => {
    seed({ payment_state: 'failed', hold_payment_intent_id: null })
    mockSendEmail.mockResolvedValue('failed')
    const res = await postReq({ action: 'send_link' })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'email_failed' })
  })

  it('nothing is owed -> 422 and no link', async () => {
    seed({ payment_state: 'failed', hold_payment_intent_id: null, captured_amount_minor: 12000 })
    const res = await postReq({ action: 'send_link' })
    expect(res.status).toBe(422)
    expect(mockRefreshLink).not.toHaveBeenCalled()
  })
})

describe('concurrency and replay (T-88-49)', () => {
  it('two concurrent capture calls on one booking -> exactly one Stripe capture, one 200 and one 409', async () => {
    await seedWithHold()
    const [a, b] = await Promise.all([postReq({ action: 'capture' }), postReq({ action: 'capture' })])

    expect([a.status, b.status].sort()).toEqual([200, 409])
    const loser = a.status === 409 ? a : b
    expect(await loser.json()).toEqual({ error: 'payment_busy' })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(row().payment_state).toBe('captured')
    expect(row().captured_amount_minor).toBe(12000)
    expect(ledger('captured')).toHaveLength(1)
    expect(adminRows().length).toBeGreaterThanOrEqual(1)
  })

  it('an admin capture racing the completion consumer produces one Stripe capture', async () => {
    await seedWithHold()
    const [res, other] = await Promise.all([
      postReq({ action: 'capture' }),
      settleBooking(ID, { type: 'system', id: 'completion_event' }),
    ])
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(row().payment_state).toBe('captured')
    // Exactly one of the two collected; the other lost the CAS claim.
    expect([res.status === 200, other.outcome === 'captured'].filter(Boolean)).toHaveLength(1)
    // The loser answers 409 while the winner is mid-flight, or 422 when the winner had already finished.
    expect([200, 409, 422]).toContain(res.status)
  })

  it('a capture whose settle is transient answers 409 and the sweep finishes it with the same idempotency key', async () => {
    await seedWithHold()
    fake.failNextWith('paymentIntents.capture', 'connection')
    expect((await postReq({ action: 'capture' })).status).toBe(409)
    expect(row().payment_state).toBe('capturing')

    // The lease runs out; the sweep (a system settle) re-claims with the same attempt number.
    db.state.nowMs += 700_000
    await new Promise((resolve) => setTimeout(resolve, 5))
    const swept = await settleBooking(ID, { type: 'system', id: 'payment_tick' })
    expect(swept.outcome).toBe('captured')
    const captures = fake.callsTo('paymentIntents.capture')
    expect(new Set(captures.map((c) => c.idempotencyKey))).toEqual(new Set([`cap:${ID}:0`]))
    const received = [...fake.state.paymentIntents.values()].reduce((sum, pi) => sum + (pi.amount_received as number), 0)
    expect(received).toBe(12000)
  })

  it('a repeated capture after success is a 422 with no Stripe call', async () => {
    await seedWithHold()
    expect((await postReq({ action: 'capture' })).status).toBe(200)
    const before = fake.calls.length
    const again = await postReq({ action: 'capture' })
    expect(again.status).toBe(422)
    expect(fake.calls.length).toBe(before)
  })
})

describe('every action records exactly one admin_action row with the admin id (T-88-48)', () => {
  const cases: Array<[PaymentAction, () => Promise<void> | void]> = [
    ['capture', async () => { await seedWithHold() }],
    ['retry', () => seedUpcoming()],
    ['release', () => seedUpcoming()],
    ['waive', () => seed({ payment_state: 'balance_due', payment_amount_minor: 15000, captured_amount_minor: 12000 })],
    ['send_link', () => seed({ payment_state: 'failed', hold_payment_intent_id: null })],
  ]
  for (const [action, setup] of cases) {
    it(action, async () => {
      await setup()
      const res = await postReq({ action })
      expect(res.status).toBe(200)
      expect(adminRows()).toHaveLength(1)
      expect(adminRows()[0].actor_type).toBe('admin')
      expect(adminRows()[0].actor_id).toBe(ADMIN_ID)
      expect(String(adminRows()[0].event_key)).toMatch(new RegExp(`^admin:${action}:${ID}:\\d+$`))
    })
  }
})

// ── Phase 89 plan 89-12: fee case and cash facts, and the matrix for the operator decisions ────────────────────────────

describe('Phase 89 matrix: pending fee case, cash bookings (D-05, D-21, D-22)', () => {
  const PENDING = { fee_case_status: 'pending' }
  const pending = (over: Record<string, unknown>) => allowedPaymentActions({ ...PENDING, ...over })

  describe('a pending case on a closed booking: charge_fee and waive_fee, never release (release would destroy the fee)', () => {
    const FEE: PaymentAction[] = ['charge_fee', 'waive_fee']
    for (const status of ['cancelled', 'no_show']) {
      it(`${status} card_hold: authorized, card_saved, failed, expired, captured, balance_due`, () => {
        for (const payment_state of ['authorized', 'card_saved', 'failed', 'expired', 'captured', 'balance_due']) {
          expect(
            pending({ payment_mode: 'card_hold', payment_state, status, hold_payment_intent_id: 'pi_1', stripe_payment_method_id: 'pm_1' }),
            `${status} ${payment_state}`,
          ).toEqual(FEE)
        }
      })

      it(`${status} cash_guarantee with a saved card`, () => {
        expect(pending({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', status, stripe_payment_method_id: 'pm_1' })).toEqual(FEE)
      })

      it(`${status} pay_now with a payment intent`, () => {
        expect(pending({ payment_mode: 'pay_now', payment_state: 'none', status, payment_intent_id: 'pi_paid' })).toEqual(FEE)
      })
    }

    it('nothing while a worker holds the row (capturing, a fresh placing_hold)', () => {
      expect(pending({ payment_mode: 'card_hold', payment_state: 'capturing', status: 'cancelled', hold_payment_intent_id: 'pi_1' })).toEqual([])
      expect(
        pending({
          payment_mode: 'card_hold',
          payment_state: 'placing_hold',
          status: 'cancelled',
          hold_payment_intent_id: 'pi_1',
          payment_lease_until: new Date(Date.now() + 60_000).toISOString(),
        }),
      ).toEqual([])
    })

    it('nothing where there is nothing to take: released, cash_settled, pay_now without a payment, partner', () => {
      expect(pending({ payment_mode: 'card_hold', payment_state: 'released', status: 'cancelled', stripe_payment_method_id: 'pm_1' })).toEqual([])
      expect(pending({ payment_mode: 'cash_guarantee', payment_state: 'cash_settled', status: 'cancelled' })).toEqual(['reopen_cash'])
      expect(pending({ payment_mode: 'pay_now', payment_state: 'none', status: 'cancelled' })).toEqual([])
      expect(pending({ payment_mode: 'partner', payment_state: 'none', status: 'cancelled', booking_source: 'gnet' })).toEqual([])
      expect(pending({ payment_mode: 'card_hold', payment_state: 'authorized', status: 'cancelled', booking_source: 'gnet' })).toEqual([])
    })

    it('a case that is not pending (or a booking that is not closed) offers no fee action', () => {
      expect(
        allowedPaymentActions({ fee_case_status: 'charged', payment_mode: 'card_hold', payment_state: 'authorized', status: 'cancelled', hold_payment_intent_id: 'pi_1' }),
      ).toEqual(['release'])
      expect(
        allowedPaymentActions({ fee_case_status: 'waived', payment_mode: 'card_hold', payment_state: 'captured', status: 'no_show' }),
      ).toEqual([])
      expect(pending({ payment_mode: 'card_hold', payment_state: 'authorized', status: 'confirmed', hold_payment_intent_id: 'pi_1' })).not.toContain('charge_fee')
    })
  })

  describe('a closed booking with no case keeps release only', () => {
    it('card_hold authorized, cash card_saved', () => {
      expect(allowedPaymentActions({ payment_mode: 'card_hold', payment_state: 'authorized', status: 'cancelled' })).toEqual(['release'])
      expect(allowedPaymentActions({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', status: 'no_show' })).toEqual(['release'])
      expect(allowedPaymentActions({ payment_mode: 'pay_now', payment_state: 'none', status: 'cancelled', payment_intent_id: 'pi_paid' })).toEqual([])
    })
  })

  describe('cash_guarantee', () => {
    const cash = (payment_state: string, status: string) => allowedPaymentActions({ payment_mode: 'cash_guarantee', payment_state, status })
    // [state, status]: expected actions
    const TABLE: Array<[string, string, PaymentAction[]]> = [
      ['card_saved', 'confirmed', ['charge_saved_card', 'mark_cash_settled', 'release']],
      ['card_saved', 'assigned', ['charge_saved_card', 'mark_cash_settled', 'release']],
      ['card_saved', 'en_route', ['charge_saved_card', 'mark_cash_settled', 'release']],
      ['card_saved', 'on_location', ['charge_saved_card', 'mark_cash_settled', 'release']],
      ['card_saved', 'on_board', ['charge_saved_card', 'mark_cash_settled', 'release']],
      ['card_saved', 'completed', ['charge_saved_card', 'mark_cash_settled']],
      ['card_saved', 'pending', ['release']],
      ['card_saved', 'cancelled', ['release']],
      ['card_saved', 'no_show', ['release']],
      // The card failed during the trip: the client pays the driver (D-21). A link goes out only after the trip.
      ['failed', 'on_board', ['charge_saved_card', 'mark_cash_settled', 'release']],
      ['failed', 'completed', ['charge_saved_card', 'mark_cash_settled', 'send_link']],
      ['failed', 'cancelled', ['release']],
      ['cash_settled', 'completed', ['reopen_cash']],
      ['cash_settled', 'on_board', ['reopen_cash']],
      ['checkout_pending', 'confirmed', ['release']],
      ['checkout_pending', 'completed', []],
      ['captured', 'completed', []],
      ['released', 'cancelled', []],
      ['none', 'confirmed', []],
      ['authorized', 'confirmed', ['release']],
    ]
    for (const [state, status, expected] of TABLE) {
      it(`${state} + ${status} -> [${expected}]`, () => {
        expect(cash(state, status)).toEqual(expected)
      })
    }

    it('never offers capture, retry, waive or the fee actions (no case)', () => {
      for (const state of PAYMENT_STATES) {
        for (const status of ['confirmed', 'completed', 'cancelled', 'no_show']) {
          const actions = cash(state, status)
          for (const forbidden of ['capture', 'retry', 'waive', 'charge_fee', 'waive_fee'] as PaymentAction[]) {
            expect(actions, `${state} ${status}`).not.toContain(forbidden)
          }
        }
      }
    })

    it('a partner booking has no actions, whatever its mode says', () => {
      expect(allowedPaymentActions({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', status: 'completed', booking_source: 'gnet' })).toEqual([])
    })
  })

  it('card_hold actions are otherwise unchanged by a booking that has no case', () => {
    expect(allowedPaymentActions({ payment_mode: 'card_hold', payment_state: 'authorized', status: 'completed' })).toEqual(['capture'])
    expect(allowedPaymentActions({ payment_mode: 'card_hold', payment_state: 'card_saved', status: 'confirmed' })).toEqual(['retry', 'release'])
    expect(allowedPaymentActions({ payment_mode: 'card_hold', payment_state: 'cash_settled', status: 'completed' })).toEqual([])
  })

  it('the payment route still refuses the five new action names and every amount (strict schema)', async () => {
    seed({ status: 'cancelled', fee_case_status: 'pending', payment_state: 'authorized' })
    for (const action of ['charge_fee', 'waive_fee', 'charge_saved_card', 'mark_cash_settled', 'reopen_cash']) {
      expect((await postReq({ action })).status, action).toBe(400)
    }
    expect((await postReq({ action: 'release', amount_minor: 1 })).status).toBe(400)
  })

  it('release is not runnable through the payment route when a case is pending (it would destroy the fee)', async () => {
    await seedWithHold({ status: 'cancelled', fee_case_status: 'pending' })
    const res = await postReq({ action: 'release' })
    expect(res.status).toBe(422)
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
    expect(row().payment_state).toBe('authorized')
  })
})

describe('GET: fee_case and cash facts (admin only)', () => {
  it('a booking with no case and a card hold -> fee_case null, cash null', async () => {
    await seedWithHold()
    const body = await (await getReq()).json()
    expect(body.fee_case).toBeNull()
    expect(body.cash).toBeNull()
  })

  it('a pending late-cancel case -> facts with kind, status, proposed, base, charged null, reason and note empty; charge_fee and waive_fee offered', async () => {
    await seedWithHold({ status: 'cancelled', fee_case_status: 'pending' })
    db.state.booking_fee_cases.push({
      id: 'c0000000-0000-4000-8000-000000000001',
      booking_id: ID,
      kind: 'late_cancel',
      status: 'pending',
      currency: 'eur',
      base_minor: 12000,
      proposed_minor: 12000,
      decided_minor: null,
      charge_requested_at: null,
      free_until: '2026-11-01T10:00:00.000Z',
      evidence: { cancelledMinBeforePickup: 120 },
      reason: null,
      contact_note: null,
      opened_at: '2026-11-01T11:00:00.000Z',
      opened_by: 'system',
      decided_at: null,
      decided_by: null,
    })
    const body = await (await getReq()).json()
    expect(body.allowed_actions).toEqual(['charge_fee', 'waive_fee'])
    expect(body.fee_case).toEqual({
      kind: 'late_cancel',
      status: 'pending',
      currency: 'eur',
      proposed_minor: 12000,
      base_minor: 12000,
      charged_minor: null,
      charge_in_flight: false,
      free_until: '2026-11-01T10:00:00.000Z',
      opened_at: '2026-11-01T11:00:00.000Z',
      decided_by: null,
      decided_at: null,
      reason: null,
      contact_note: null,
      evidence: { cancelledMinBeforePickup: 120 },
    })
  })

  it('a charged no-show case carries the charged amount, the decider, the reason and the contact note (admin only)', async () => {
    await seedWithHold({ status: 'no_show', fee_case_status: 'charged', payment_state: 'captured', captured_amount_minor: 5000 })
    db.state.booking_fee_cases.push({
      id: 'c0000000-0000-4000-8000-000000000002',
      booking_id: ID,
      kind: 'no_show',
      status: 'charged',
      currency: 'eur',
      base_minor: 12000,
      proposed_minor: 12000,
      decided_minor: 5000,
      charge_requested_at: '2026-11-01T12:00:00.000Z',
      free_until: null,
      evidence: { threshold_min: 20 },
      reason: 'client unreachable',
      contact_note: 'called twice, no answer',
      opened_at: '2026-11-01T11:00:00.000Z',
      opened_by: 'admin-1',
      decided_at: '2026-11-01T12:00:00.000Z',
      decided_by: ADMIN_ID,
    })
    const body = await (await getReq()).json()
    expect(body.fee_case).toMatchObject({
      kind: 'no_show',
      status: 'charged',
      charged_minor: 5000,
      charge_in_flight: false,
      decided_by: ADMIN_ID,
      decided_at: '2026-11-01T12:00:00.000Z',
      reason: 'client unreachable',
      contact_note: 'called twice, no answer',
    })
    expect(body.allowed_actions).toEqual([])
    // A decided case is never an amount owed: the captured row is below the booking amount and nothing more is due.
    expect(body.payment.captured_amount_minor).toBe(5000)
    expect(body.payment.amount_minor).toBe(12000)
    // The operator's text is on the case; the ledger rows of the same response carry none of it.
    expect(JSON.stringify(body.events)).not.toContain('client unreachable')
    expect(JSON.stringify(body.events)).not.toContain('called twice')
  })

  it('a charge in flight on a pending case is reported', async () => {
    await seedWithHold({ status: 'cancelled', fee_case_status: 'pending' })
    db.state.booking_fee_cases.push({
      id: 'c0000000-0000-4000-8000-000000000003',
      booking_id: ID,
      kind: 'late_cancel',
      status: 'pending',
      currency: 'eur',
      base_minor: 12000,
      proposed_minor: 12000,
      decided_minor: 4000,
      charge_requested_at: new Date().toISOString(),
      free_until: null,
      evidence: {},
      reason: null,
      contact_note: null,
      opened_at: '2026-11-01T11:00:00.000Z',
      opened_by: 'system',
      decided_at: null,
      decided_by: null,
    })
    const body = await (await getReq()).json()
    expect(body.fee_case).toMatchObject({ status: 'pending', charge_in_flight: true, charged_minor: null })
  })

  describe('cash', () => {
    const cashSeed = (over: Record<string, unknown> = {}) =>
      seed({ payment_mode: 'cash_guarantee', payment_state: 'card_saved', status: 'completed', payment_amount_minor: 8000, hold_amount_minor: null, ...over })

    it('unconfirmed is true only for a completed cash booking in card_saved, and nothing else follows from it', async () => {
      const unconfirmed = async (over: Record<string, unknown>) => {
        cashSeed(over)
        return (await (await getReq()).json()) as { cash: { unconfirmed: boolean } | null; allowed_actions: string[] }
      }

      const done = await unconfirmed({})
      expect(done.cash?.unconfirmed).toBe(true)
      // D-21: it is information. The only actions are the operator's choices; nothing is scheduled or sent.
      expect(done.allowed_actions).toEqual(['charge_saved_card', 'mark_cash_settled'])
      expect(fake.calls).toHaveLength(0)
      expect(mockSendEmail).not.toHaveBeenCalled()
      expect(db.state.booking_fee_cases).toHaveLength(0)

      expect((await unconfirmed({ status: 'en_route' })).cash?.unconfirmed).toBe(false)
      expect((await unconfirmed({ payment_state: 'failed' })).cash?.unconfirmed).toBe(false)
      expect((await unconfirmed({ payment_state: 'cash_settled' })).cash?.unconfirmed).toBe(false)
      expect((await unconfirmed({ payment_state: 'captured' })).cash?.unconfirmed).toBe(false)
    })

    it('cash_settled by the driver: confirmed_by driver, the time of the newest cash_settled row, reopen offered', async () => {
      cashSeed({ payment_state: 'cash_settled' })
      db.state.booking_payment_events.push(
        {
          id: 1, booking_id: ID, event_key: `cash_settled:${ID}:0`, kind: 'cash_settled', stripe_object_id: null, amount_minor: null, currency: null,
          from_state: 'card_saved', to_state: 'cash_settled', actor_type: 'system', actor_id: 'driver_trip', error_code: null, created_at: '2026-11-02T10:00:00.000Z',
        },
        {
          id: 2, booking_id: ID, event_key: `cash_reopened:${ID}:1`, kind: 'cash_reopened', stripe_object_id: null, amount_minor: null, currency: null,
          from_state: 'cash_settled', to_state: 'card_saved', actor_type: 'admin', actor_id: ADMIN_ID, error_code: null, created_at: '2026-11-02T11:00:00.000Z',
        },
        {
          id: 3, booking_id: ID, event_key: `cash_settled:${ID}:1`, kind: 'cash_settled', stripe_object_id: null, amount_minor: null, currency: null,
          from_state: 'card_saved', to_state: 'cash_settled', actor_type: 'admin', actor_id: ADMIN_ID, error_code: null, created_at: '2026-11-02T12:00:00.000Z',
        },
      )
      const body = await (await getReq()).json()
      expect(body.allowed_actions).toEqual(['reopen_cash'])
      expect(body.cash).toMatchObject({ unconfirmed: false, confirmed_by: 'admin', confirmed_at: '2026-11-02T12:00:00.000Z', notes: [] })
    })

    it('a driver confirmation is reported as driver', async () => {
      cashSeed({ payment_state: 'cash_settled' })
      db.state.booking_payment_events.push({
        id: 1, booking_id: ID, event_key: `cash_settled:${ID}:0`, kind: 'cash_settled', stripe_object_id: null, amount_minor: null, currency: null,
        from_state: 'card_saved', to_state: 'cash_settled', actor_type: 'system', actor_id: 'driver_trip', error_code: null, created_at: '2026-11-02T10:00:00.000Z',
      })
      const body = await (await getReq()).json()
      expect(body.cash).toMatchObject({ confirmed_by: 'driver', confirmed_at: '2026-11-02T10:00:00.000Z' })
    })

    it('not settled: no confirmation facts; notes are listed oldest first with their kind and author', async () => {
      cashSeed()
      db.state.booking_payment_notes.push(
        { id: 'n2', booking_id: ID, kind: 'cash_reopen', note: 'second', created_by: ADMIN_ID, created_at: '2026-11-02T12:00:00.000Z' },
        { id: 'n1', booking_id: ID, kind: 'cash_card_charge', note: 'first', created_by: ADMIN_ID, created_at: '2026-11-02T10:00:00.000Z' },
      )
      const body = await (await getReq()).json()
      expect(body.cash.confirmed_by).toBeNull()
      expect(body.cash.confirmed_at).toBeNull()
      expect(body.cash.notes).toEqual([
        { kind: 'cash_card_charge', note: 'first', created_by: ADMIN_ID, created_at: '2026-11-02T10:00:00.000Z' },
        { kind: 'cash_reopen', note: 'second', created_by: ADMIN_ID, created_at: '2026-11-02T12:00:00.000Z' },
      ])
    })

    it('the cash view never carries stripe ids', async () => {
      cashSeed({ stripe_payment_method_id: 'pm_secret', stripe_customer_id: 'cus_secret' })
      const text = JSON.stringify(await (await getReq()).json())
      expect(text).not.toContain('pm_secret')
      expect(text).not.toContain('cus_secret')
    })
  })
})
