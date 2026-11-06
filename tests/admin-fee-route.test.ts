// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 89 plan 89-12 (CASH-03, CASH-04, HOLD-06; D-05, D-10, D-13, D-14, D-21, D-22): POST /api/admin/bookings/[id]/fee,
 * the only place an operator amount enters. The route, the fee module, the cash module and the settle engine run for real
 * against the in-memory payments database and the fake Stripe.
 */

const { world, mockSendEmail, mockFailure, mockDeactivateLink, mockAlert } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
    auth: 'admin' as 'admin' | '401' | '403',
  },
  mockSendEmail: vi.fn(),
  mockFailure: vi.fn(),
  mockDeactivateLink: vi.fn(),
  mockAlert: vi.fn(),
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
vi.mock('@/lib/payments/recovery', () => ({ handlePaymentFailure: mockFailure }))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: mockDeactivateLink }))
vi.mock('@/lib/payments/alerts', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/alerts')>()),
  sendPaymentOperatorAlert: mockAlert,
}))

import { POST } from '@/app/api/admin/bookings/[id]/fee/route'
import { POST as PAYMENT_POST } from '@/app/api/admin/bookings/[id]/payment/route'
import { loadFeeCase, openFeeCase, type FeeCaseRow } from '@/lib/payments/fee'

const ID = '77777777-7777-4777-8777-777777777777'
const HOUR = 3_600_000
const ADMIN = { type: 'admin', id: 'admin-1' } as const

let db: FakePaymentsDb
let fake: FakeStripe

function seed(over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({
    bookings: [
      {
        id: ID,
        status: 'cancelled',
        booking_source: 'web',
        payment_mode: 'card_hold',
        payment_state: 'authorized',
        booking_reference: 'PRG-20261101-FEER01',
        client_email: 'anna@example.com',
        locale: 'en',
        pickup_date: '2026-11-01',
        pickup_time: '14:00',
        pickup_utc: new Date(Date.now() + 2 * HOUR).toISOString(),
        payment_currency: 'eur',
        payment_amount_minor: 10000,
        stripe_customer_id: 'cus_1',
        stripe_payment_method_id: 'pm_ok',
        charge_attempts: 0,
        ...over,
      },
    ],
  })
  world.db = db
}

/** A booking whose full-amount hold sits at Stripe in requires_capture. */
async function seedWithHold(over: Record<string, unknown> = {}, holdAmount = 10000) {
  const hold = (await fake.stripe.paymentIntents.create({
    amount: holdAmount,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_ok',
    capture_method: 'manual',
    off_session: true,
    confirm: true,
    metadata: { kind: 'card_hold', cofBookingId: ID, attempt: '0', bookingReference: 'PRG-20261101-FEER01' },
  })) as { id: string }
  seed({ hold_payment_intent_id: hold.id, hold_amount_minor: holdAmount, payment_state: 'authorized', ...over })
  return hold.id
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))

async function openCase(over: Partial<Parameters<typeof openFeeCase>[0]> = {}): Promise<FeeCaseRow> {
  const { caseRow } = await openFeeCase({
    booking: row(),
    kind: 'late_cancel',
    baseMinor: 10000,
    currency: 'eur',
    proposedMinor: 10000,
    freeUntilIso: new Date(Date.now() - HOUR).toISOString(),
    evidence: { cancelledMinBeforePickup: 120 },
    actor: ADMIN,
    ...over,
  })
  return caseRow
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}
function post(body: unknown, id = ID, headers: Record<string, string> = {}) {
  return POST(
    new Request(`http://localhost/api/admin/bookings/${id}/fee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params(id),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  world.auth = 'admin'
  fake = createFakeStripe()
  world.stripe = fake.stripe
  mockSendEmail.mockResolvedValue('sent')
  mockFailure.mockResolvedValue(undefined)
  mockDeactivateLink.mockResolvedValue(undefined)
  mockAlert.mockResolvedValue('sent')
})

describe('tracer: POST charge on a pending case through the strict route and runFeeCharge to a captured booking', () => {
  it('charges the chosen amount from the hold, closes the case and answers ok', async () => {
    const holdId = await seedWithHold()
    const c = await openCase()

    const res = await post({ action: 'charge', amount_minor: 4000, reason: 'client called late' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'ok' })

    const captures = fake.callsTo('paymentIntents.capture')
    expect(captures).toHaveLength(1)
    expect(captures[0].targetId).toBe(holdId)
    expect(captures[0].params).toEqual({ amount_to_capture: 4000 })
    expect(captures[0].idempotencyKey).toBe(`feecap:${c.id}:0`)

    expect(row()).toMatchObject({ payment_state: 'captured', captured_amount_minor: 4000 })
    expect(await loadFeeCase(ID)).toMatchObject({ status: 'charged', decided_minor: 4000, decided_by: ADMIN_ID, reason: 'client called late' })
    // T-89-42: the operator's click is on record with a short code, the free text is not in the ledger.
    expect(ledger('admin_action').some((e) => e.error_code === 'fee_charge' && e.actor_id === ADMIN_ID)).toBe(true)
    expect(JSON.stringify(db.state.booking_payment_events)).not.toContain('client called late')
  })
})

describe('guards', () => {
  it('401 and 403 before any work', async () => {
    await seedWithHold()
    await openCase()
    world.auth = '401'
    expect((await post({ action: 'charge', amount_minor: 1000 })).status).toBe(401)
    world.auth = '403'
    expect((await post({ action: 'charge', amount_minor: 1000 })).status).toBe(403)
    expect(fake.calls.filter((c) => c.method !== 'paymentIntents.create')).toHaveLength(0)
    expect(ledger('admin_action')).toHaveLength(0)
  })

  it('a malformed id is 400, invalid JSON is 400, an oversized body is refused', async () => {
    await seedWithHold()
    expect((await post({ action: 'charge', amount_minor: 1000 }, 'not-a-uuid')).status).toBe(400)
    expect((await post('{nope')).status).toBe(400)
    const big = await post({ action: 'charge', amount_minor: 1000, contact_note: 'x'.repeat(20_000) })
    expect([400, 413]).toContain(big.status)
  })

  it('an unknown booking is 404', async () => {
    seed()
    expect((await post({ action: 'charge', amount_minor: 1000 }, '11111111-1111-4111-8111-111111111111')).status).toBe(404)
  })
})

describe('the strict schema is the whole body (T-89-40)', () => {
  it.each([
    ['an extra field', { action: 'charge', amount_minor: 1000, extra: 1 }],
    ['a currency field', { action: 'charge', amount_minor: 1000, currency: 'czk' }],
    ['a zero amount', { action: 'charge', amount_minor: 0 }],
    ['a negative amount', { action: 'charge', amount_minor: -5 }],
    ['a fractional amount', { action: 'charge', amount_minor: 10.5 }],
    ['an amount as a string', { action: 'charge', amount_minor: '1000' }],
    ['a missing amount', { action: 'charge' }],
    ['an unknown action', { action: 'refund_everything' }],
    ['an over-long reason', { action: 'charge', amount_minor: 1000, reason: 'x'.repeat(501) }],
    ['an over-long contact note', { action: 'charge', amount_minor: 1000, contact_note: 'x'.repeat(1001) }],
    ['an amount on waive', { action: 'waive', reason: 'ok', amount_minor: 1000 }],
    ['a waive without a reason', { action: 'waive' }],
    ['a blank waive reason', { action: 'waive', reason: '   ' }],
    ['an amount on charge_saved_card', { action: 'charge_saved_card', note: 'ok', amount_minor: 1 }],
    ['a field on mark_cash_settled', { action: 'mark_cash_settled', note: 'x' }],
    ['a reopen without a note', { action: 'reopen_cash' }],
  ])('%s is a 400 and nothing is charged', async (_name, body) => {
    await seedWithHold()
    await openCase()
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(ledger('admin_action')).toHaveLength(0)
  })

  it('the payment route still answers 400 for an amount field', async () => {
    await seedWithHold({ status: 'completed', completed_at: new Date().toISOString() })
    const res = await PAYMENT_POST(
      new Request(`http://localhost/api/admin/bookings/${ID}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'capture', amount_minor: 100 }),
      }),
      params(ID),
    )
    expect(res.status).toBe(400)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })
})

describe('cap and notes are enforced by the server (D-13, D-14)', () => {
  it('an amount above the base is 422 amount_above_cap, no Stripe call, no ledger row', async () => {
    await seedWithHold()
    await openCase()
    const res = await post({ action: 'charge', amount_minor: 10001 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'amount_above_cap' })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(ledger('admin_action')).toHaveLength(0)
    expect((await loadFeeCase(ID))?.charge_requested_at).toBeNull()
  })

  it('the cap is the case base, not the request: a case of 6000 refuses 6001', async () => {
    await seedWithHold()
    await openCase({ baseMinor: 6000, proposedMinor: 6000 })
    expect((await post({ action: 'charge', amount_minor: 6001 })).status).toBe(422)
    expect((await post({ action: 'charge', amount_minor: 6000 })).status).toBe(200)
  })

  it('a no-show case without a note of 10 characters is 422 note_required', async () => {
    await seedWithHold({ status: 'no_show' })
    await openCase({ kind: 'no_show' })
    for (const body of [
      { action: 'charge', amount_minor: 5000 },
      { action: 'charge', amount_minor: 5000, contact_note: 'too short' },
      { action: 'charge', amount_minor: 5000, contact_note: '   called   ' },
    ]) {
      const res = await post(body)
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({ error: 'note_required' })
    }
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(ledger('admin_action')).toHaveLength(0)
  })

  it('a no-show case with a 10 character note is charged and the note is stored on the case only', async () => {
    await seedWithHold({ status: 'no_show' })
    await openCase({ kind: 'no_show' })
    const res = await post({ action: 'charge', amount_minor: 10000, contact_note: 'called twice, no answer' })
    expect(res.status).toBe(200)
    expect(await loadFeeCase(ID)).toMatchObject({ status: 'charged', contact_note: 'called twice, no answer' })
    expect(JSON.stringify(db.state.booking_payment_events)).not.toContain('called twice')
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ kind: 'fee_charged', variant: 'no_show' })
  })

  it('a late cancel needs no note', async () => {
    await seedWithHold()
    await openCase()
    expect((await post({ action: 'charge', amount_minor: 2500 })).status).toBe(200)
  })
})

describe('what can no longer be charged (criterion 5, T-89-44)', () => {
  it('no case: 422 action_not_allowed', async () => {
    await seedWithHold()
    const res = await post({ action: 'charge', amount_minor: 1000 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })

  it('a decided case: a second charge is 422 and nothing more is taken', async () => {
    await seedWithHold()
    await openCase()
    expect((await post({ action: 'charge', amount_minor: 4000 })).status).toBe(200)
    const again = await post({ action: 'charge', amount_minor: 4000 })
    expect(again.status).toBe(422)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
  })

  it('a waived case cannot be charged', async () => {
    await seedWithHold()
    const c = await openCase()
    const { markFeeWaived } = await import('@/lib/payments/fee')
    await markFeeWaived(c.id, { decidedBy: 'admin-1', reason: 'flight cancelled' })
    expect((await post({ action: 'charge', amount_minor: 1000 })).status).toBe(422)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })

  it('a released booking cannot be charged', async () => {
    await seedWithHold({ payment_state: 'released' })
    await openCase()
    expect((await post({ action: 'charge', amount_minor: 1000 })).status).toBe(422)
    expect(ledger('admin_action')).toHaveLength(0)
  })

  it('a partner booking answers action_not_allowed', async () => {
    await seedWithHold({ booking_source: 'gnet', payment_mode: 'partner' })
    const res = await post({ action: 'charge', amount_minor: 1000 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed' })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(ledger('admin_action')).toHaveLength(0)
  })

  it('a booking that is not closed cannot be charged a fee', async () => {
    await seedWithHold({ status: 'confirmed' })
    await openCase()
    expect((await post({ action: 'charge', amount_minor: 1000 })).status).toBe(422)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })
})

describe('declines and locks', () => {
  it('a decline is 200 outcome declined, the case stays pending and unlocked', async () => {
    seed({ payment_state: 'card_saved', stripe_payment_method_id: 'pm_decline_insufficient', hold_payment_intent_id: null })
    const c = await openCase()
    const res = await post({ action: 'charge', amount_minor: 4000 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'declined' })
    const after = await loadFeeCase(ID)
    expect(after).toMatchObject({ status: 'pending', charge_requested_at: null })
    expect(after?.id).toBe(c.id)
    expect(mockFailure).toHaveBeenCalledTimes(1)
  })

  it('a lock on another amount is 409 amount_locked', async () => {
    await seedWithHold()
    const c = await openCase()
    const { lockFeeAmount } = await import('@/lib/payments/fee')
    expect(await lockFeeAmount(c.id, 4000)).toBe('locked')
    const res = await post({ action: 'charge', amount_minor: 5000 })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'amount_locked' })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
  })
})
