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
