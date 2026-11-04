// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 88 plan 88-13 (HOLD-04, D-05, D-06, D-16, D-17, MAIL-01): settleBooking captures the held amount when a
 * trip is completed, charges the saved card off-session when the hold is gone, charges a price difference
 * separately, and never collects twice (CAS claim, attempt-numbered idempotency keys, ledger event keys).
 */

const { world, mockSendEmail, mockFailure } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
  },
  mockSendEmail: vi.fn(),
  mockFailure: vi.fn(),
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
// The link / email / alert of a declined charge are covered by tests/payments-failure.test.ts; here only the call is pinned.
vi.mock('@/lib/payments/recovery', () => ({ handlePaymentFailure: mockFailure }))

import { settleBooking } from '@/lib/payments/settle'

const ID = '66666666-6666-4666-8666-666666666666'
const HOUR = 3_600_000
const ACTOR = { type: 'system', id: 'completion_event' } as const

let db: FakePaymentsDb
let fake: FakeStripe

/** A booking whose trip is completed and whose full-amount hold sits at Stripe in requires_capture. */
async function seedWithHold(over: Record<string, unknown> = {}, holdAmount = 12000) {
  const hold = (await fake.stripe.paymentIntents.create({
    amount: holdAmount,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_ok',
    capture_method: 'manual',
    off_session: true,
    confirm: true,
    metadata: { kind: 'card_hold', cofBookingId: ID, attempt: '0', bookingReference: 'PRG-20261101-SETL01' },
  })) as { id: string }
  seed({
    hold_payment_intent_id: hold.id,
    hold_amount_minor: holdAmount,
    payment_state: 'authorized',
    ...over,
  })
  return hold.id
}

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
        booking_reference: 'PRG-20261101-SETL01',
        client_email: 'anna@example.com',
        locale: 'ru',
        pickup_date: '2026-11-01',
        pickup_time: '14:00',
        pickup_utc: new Date(Date.now() - 5 * HOUR).toISOString(),
        payment_currency: 'eur',
        payment_amount_minor: 12000,
        stripe_customer_id: 'cus_1',
        stripe_payment_method_id: 'pm_ok',
        charge_attempts: 0,
        ...over,
      },
    ],
  })
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))

beforeEach(() => {
  vi.clearAllMocks()
  fake = createFakeStripe()
  world.stripe = fake.stripe
  mockSendEmail.mockResolvedValue('sent')
  mockFailure.mockResolvedValue(undefined)
})

describe('tracer: completed card booking in authorized -> capture the hold -> captured + charged email (HOLD-04, D-06)', () => {
  it('captures the held amount once with key cap:<id>:0 and records captured + payment_intent_id (D-05)', async () => {
    const holdId = await seedWithHold()
    const res = await settleBooking(ID, ACTOR)

    expect(res).toEqual({ outcome: 'captured', capturedMinor: 12000, diffMinor: 0 })
    const captures = fake.callsTo('paymentIntents.capture')
    expect(captures).toHaveLength(1)
    expect(captures[0].targetId).toBe(holdId)
    expect(captures[0].params).toEqual({ amount_to_capture: 12000 })
    expect(captures[0].idempotencyKey).toBe(`cap:${ID}:0`)

    const b = row()
    expect(b.payment_state).toBe('captured')
    expect(b.captured_amount_minor).toBe(12000)
    expect(b.captured_at).toEqual(expect.any(String))
    expect(b.payment_intent_id).toBe(holdId)
    expect(b.payment_lease_until).toBeNull()

    expect(ledger('capture_started')).toHaveLength(1)
    expect(ledger('captured')).toHaveLength(1)
    expect(ledger('captured')[0].event_key).toBe(`captured:${holdId}`)
    expect(ledger('captured')[0].amount_minor).toBe(12000)
    expect(ledger('captured')[0].actor_id).toBe('completion_event')
  })

  it('sends the charged email once in the booking row (key email:charged:<id>)', async () => {
    await seedWithHold()
    await settleBooking(ID, ACTOR)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const arg = mockSendEmail.mock.calls[0][0]
    expect(arg.kind).toBe('charged')
    expect(arg.eventKey).toBe(`email:charged:${ID}`)
    expect(arg.booking.locale).toBe('ru')
    expect(arg.diffMinor).toBeUndefined()
  })

  it('a mail problem never undoes the capture', async () => {
    await seedWithHold()
    mockSendEmail.mockRejectedValue(new Error('resend down'))
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('captured')
    expect(row().payment_state).toBe('captured')
  })

  it('a second settleBooking on the captured booking is a noop with no Stripe call', async () => {
    await seedWithHold()
    await settleBooking(ID, ACTOR)
    const before = fake.calls.length
    const again = await settleBooking(ID, ACTOR)
    expect(again.outcome).toBe('noop')
    expect(fake.calls.length).toBe(before)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })
})

describe('eligibility guards (D-02): nothing is collected before completion or for partner / pay-now bookings', () => {
  it('a booking that is not completed -> skipped, no Stripe call, state unchanged', async () => {
    await seedWithHold({ status: 'confirmed', completed_at: null })
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('skipped')
    expect(res.code).toBe('not_completed')
    expect(fake.calls.filter((c) => c.method.startsWith('paymentIntents.c')).length).toBe(1) // only the seed create
    expect(row().payment_state).toBe('authorized')
    expect(ledger('capture_started')).toHaveLength(0)
  })

  it('a completed booking with completed_at set but a historic status text still settles (completed_at is the durable fact)', async () => {
    await seedWithHold({ status: 'assigned', completed_at: new Date().toISOString() })
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('captured')
  })

  it('a cancelled booking is never settled even when completed_at is set', async () => {
    await seedWithHold({ status: 'cancelled', completed_at: new Date().toISOString() })
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('skipped')
    expect(row().payment_state).toBe('authorized')
  })

  it('payment_mode pay_now -> skipped', async () => {
    seed({ payment_mode: 'pay_now', payment_state: 'none' })
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'skipped', code: 'not_card_hold' })
    expect(fake.calls).toHaveLength(0)
  })

  it('a gnet (partner) booking -> skipped (PartnerBookingMoneyError caught)', async () => {
    await seedWithHold({ booking_source: 'gnet' })
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'skipped', code: 'partner_booking' })
    expect(row().payment_state).toBe('authorized')
    expect(ledger()).toHaveLength(0)
  })

  it('an unknown booking id -> skipped', async () => {
    seed()
    const res = await settleBooking('00000000-0000-4000-8000-0000000000ff', ACTOR)
    expect(res.outcome).toBe('skipped')
  })

  it('a released booking is a noop (terminal)', async () => {
    seed({ payment_state: 'released' })
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('noop')
    expect(fake.calls).toHaveLength(0)
  })
})

/** Everything Stripe actually collected for the booking, in minor units (the over-collection invariant). */
function collectedTotal(): number {
  return [...fake.state.paymentIntents.values()].reduce((sum, pi) => sum + (pi.amount_received as number), 0)
}
/**
 * Crosses the 300 s capturing lease on the virtual database clock. The real clock moves on by a few ms too, so the
 * re-claim's ledger key (capture_started:<attempt>:<epoch ms>) is a new one, as it is a lease apart in production.
 */
async function expireLease() {
  db.state.nowMs += 400_000
  await new Promise((resolve) => setTimeout(resolve, 5))
}
const creates = () => fake.callsTo('paymentIntents.create')
const lastCreate = () => creates()[creates().length - 1]

describe('fallback charge when the hold is gone (HOLD-04, D-05)', () => {
  it('hold expired at Stripe while the state still says authorized -> one off-session charge of the full amount', async () => {
    const holdId = await seedWithHold()
    fake.expireHold(holdId, 'expired')
    const seedCreates = creates().length

    const res = await settleBooking(ID, ACTOR)

    expect(res).toEqual({ outcome: 'captured', capturedMinor: 12000, diffMinor: 0 })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(0)
    expect(creates()).toHaveLength(seedCreates + 1)
    const c = lastCreate()
    expect(c.idempotencyKey).toBe(`chg:${ID}:0`)
    expect(c.params).toMatchObject({
      amount: 12000,
      currency: 'eur',
      customer: 'cus_1',
      payment_method: 'pm_ok',
      off_session: true,
      confirm: true,
      metadata: { kind: 'card_charge', cofBookingId: ID, attempt: '0', bookingReference: 'PRG-20261101-SETL01' },
    })
    expect(Object.keys(c.params.metadata as Record<string, string>)).not.toContain('bookingId')

    const chargedPi = [...fake.state.paymentIntents.values()].find((p) => (p.metadata as Record<string, string>).kind === 'card_charge')!
    expect(row().payment_state).toBe('captured')
    expect(row().payment_intent_id).toBe(chargedPi.id)
    expect(row().payment_intent_id).not.toBe(holdId)
    expect(row().captured_amount_minor).toBe(12000)
    expect(ledger('captured')[0].event_key).toBe(`captured:${chargedPi.id}`)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(collectedTotal()).toBe(12000)
  })

  it.each(['expired', 'card_saved'])('state %s with no hold at all -> the same fallback charge', async (payment_state) => {
    seed({ payment_state })
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('captured')
    expect(creates()).toHaveLength(1)
    expect(creates()[0].idempotencyKey).toBe(`chg:${ID}:0`)
    expect(row().payment_state).toBe('captured')
    expect(collectedTotal()).toBe(12000)
  })

  it('a hold id Stripe no longer knows (resource_missing) falls back to the saved card', async () => {
    seed({ payment_state: 'authorized', hold_payment_intent_id: 'pi_gone', hold_amount_minor: 12000 })
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('captured')
    expect(creates()).toHaveLength(1)
  })

  it('a failed (pre-trip decline) completed booking is charged on the completion event', async () => {
    seed({ payment_state: 'failed', charge_attempts: 0, hold_attempts: 1, last_payment_error: 'insufficient_funds' })
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('captured')
    expect(row().last_payment_error).toBeNull()
  })

  it('uses the persisted charge_attempts in every key', async () => {
    await seedWithHold({ charge_attempts: 2 })
    await settleBooking(ID, ACTOR)
    expect(fake.callsTo('paymentIntents.capture')[0].idempotencyKey).toBe(`cap:${ID}:2`)
  })
})

describe('price changed since the hold (D-16 raised, D-17 lowered)', () => {
  it('raised to 15000 after a 12000 hold -> capture 12000 + a separate difference charge of 3000', async () => {
    await seedWithHold({ payment_amount_minor: 15000 })
    const seedCreates = creates().length
    const res = await settleBooking(ID, ACTOR)

    expect(res).toEqual({ outcome: 'captured', capturedMinor: 15000, diffMinor: 3000 })
    expect(fake.callsTo('paymentIntents.capture')[0].params).toEqual({ amount_to_capture: 12000 })
    expect(creates()).toHaveLength(seedCreates + 1)
    const c = lastCreate()
    expect(c.idempotencyKey).toBe(`diff:${ID}:0`)
    expect(c.params).toMatchObject({ amount: 3000, off_session: true, confirm: true, metadata: { kind: 'card_difference', attempt: '0' } })

    expect(row().payment_state).toBe('captured')
    expect(row().captured_amount_minor).toBe(15000)
    expect(ledger('difference_charged')).toHaveLength(1)
    expect(ledger('difference_charged')[0].amount_minor).toBe(3000)
    expect(ledger('captured')[0].amount_minor).toBe(12000)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0].diffMinor).toBe(3000)
    expect(collectedTotal()).toBe(15000)
  })

  it('lowered to 9000 -> capture with amount_to_capture 9000, no difference charge, Stripe releases the rest', async () => {
    await seedWithHold({ payment_amount_minor: 9000 })
    const seedCreates = creates().length
    const res = await settleBooking(ID, ACTOR)

    expect(res).toEqual({ outcome: 'captured', capturedMinor: 9000, diffMinor: 0 })
    expect(fake.callsTo('paymentIntents.capture')[0].params).toEqual({ amount_to_capture: 9000 })
    expect(creates()).toHaveLength(seedCreates)
    expect(row().captured_amount_minor).toBe(9000)
    expect(collectedTotal()).toBe(9000)
  })

  it('due == held + 1 minor unit -> capture the hold and a difference of exactly 1', async () => {
    await seedWithHold({ payment_amount_minor: 12001 })
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'captured', capturedMinor: 12001, diffMinor: 1 })
    expect(lastCreate().params).toMatchObject({ amount: 1 })
    expect(collectedTotal()).toBe(12001)
  })

  it('due == held -> exactly one full capture and no second charge', async () => {
    await seedWithHold()
    const seedCreates = creates().length
    await settleBooking(ID, ACTOR)
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(creates()).toHaveLength(seedCreates)
  })

  it('works in the booking currency without converting (CZK hold, CZK difference)', async () => {
    const hold = (await fake.stripe.paymentIntents.create({
      amount: 300000,
      currency: 'czk',
      customer: 'cus_1',
      payment_method: 'pm_ok',
      capture_method: 'manual',
      confirm: true,
      metadata: { kind: 'card_hold', cofBookingId: ID, attempt: '0' },
    })) as { id: string }
    seed({
      payment_currency: 'czk',
      payment_amount_minor: 310000,
      hold_payment_intent_id: hold.id,
      hold_amount_minor: 300000,
    })
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'captured', capturedMinor: 310000, diffMinor: 10000 })
    expect(fake.callsTo('paymentIntents.capture')[0].params).toEqual({ amount_to_capture: 300000 })
    expect(lastCreate().params).toMatchObject({ amount: 10000, currency: 'czk' })
    expect(ledger('difference_charged')[0].currency).toBe('czk')
  })
})

describe('never twice (T-88-38)', () => {
  it('two parallel settles on the same booking -> exactly one capture and one captured row', async () => {
    await seedWithHold()
    const [a, b] = await Promise.all([settleBooking(ID, ACTOR), settleBooking(ID, ACTOR)])
    const outcomes = [a.outcome, b.outcome].sort()
    expect(outcomes[0]).toMatch(/busy|noop/)
    expect(outcomes[1]).toBe('captured')
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(ledger('captured')).toHaveLength(1)
    expect(ledger('capture_started')).toHaveLength(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(collectedTotal()).toBe(12000)
  })

  it('a live capturing lease blocks a second claim (busy) and makes no Stripe call', async () => {
    await seedWithHold({ payment_state: 'capturing', payment_lease_until: new Date(Date.now() + 120_000).toISOString() })
    const before = fake.calls.length
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('busy')
    expect(fake.calls.length).toBe(before)
  })

  it('a connection error on the capture leaves capturing with its lease and the same attempt; the later replay finishes it', async () => {
    await seedWithHold()
    fake.failNextWith('paymentIntents.capture', 'connection')

    const first = await settleBooking(ID, ACTOR)
    expect(first).toEqual({ outcome: 'transient', code: 'transient' })
    expect(row().payment_state).toBe('capturing')
    expect(row().payment_lease_until).toEqual(expect.any(String))
    expect(row().charge_attempts).toBe(0)
    expect(ledger('charge_failed')).toHaveLength(0)

    // Still inside the lease: nobody else may start.
    expect((await settleBooking(ID, ACTOR)).outcome).toBe('busy')

    await expireLease()
    const second = await settleBooking(ID, ACTOR)
    expect(second.outcome).toBe('captured')
    const keys = fake.callsTo('paymentIntents.capture').map((c) => c.idempotencyKey)
    expect(keys).toEqual([`cap:${ID}:0`, `cap:${ID}:0`])
    expect(ledger('captured')).toHaveLength(1)
    expect(ledger('capture_started')).toHaveLength(2)
    expect(collectedTotal()).toBe(12000)
  })

  it('a capture that reached Stripe but whose answer was lost is reconciled, never captured twice', async () => {
    const holdId = await seedWithHold({ payment_state: 'capturing', payment_lease_until: new Date(Date.now() - 1000).toISOString() })
    await fake.stripe.paymentIntents.capture(holdId, { amount_to_capture: 12000 }, { idempotencyKey: `cap:${ID}:0` })
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'captured', capturedMinor: 12000, diffMinor: 0 })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(row().payment_intent_id).toBe(holdId)
    expect(collectedTotal()).toBe(12000)
  })

  it('a connection error on the fallback charge replays the same key and creates one PaymentIntent in total', async () => {
    seed({ payment_state: 'expired' })
    fake.failNextWith('paymentIntents.create', 'connection')
    expect((await settleBooking(ID, ACTOR)).outcome).toBe('transient')
    await expireLease()
    expect((await settleBooking(ID, ACTOR)).outcome).toBe('captured')
    expect(creates().map((c) => c.idempotencyKey)).toEqual([`chg:${ID}:0`, `chg:${ID}:0`])
    expect(fake.state.paymentIntents.size).toBe(1)
    expect(collectedTotal()).toBe(12000)
  })

  it('a difference charge lost mid-flight replays diff:<id>:<attempt> after the lease and the total stays the agreed amount', async () => {
    await seedWithHold({ payment_amount_minor: 15000 })
    fake.failNextWith('paymentIntents.create', 'connection')
    expect((await settleBooking(ID, ACTOR)).outcome).toBe('transient')
    expect(fake.state.paymentIntents.size).toBe(1)
    await expireLease()
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'captured', capturedMinor: 15000, diffMinor: 3000 })
    expect(fake.callsTo('paymentIntents.capture')).toHaveLength(1)
    expect(creates().filter((c) => c.idempotencyKey === `diff:${ID}:0`)).toHaveLength(2)
    expect(collectedTotal()).toBe(15000)
  })

  it('an attempt older than LEASE_SEARCH_AFTER_MS searches by booking id and attempt before any create and reuses a succeeded PaymentIntent', async () => {
    seed({ payment_state: 'capturing', payment_lease_until: new Date(Date.now() - 1000).toISOString() })
    const old = (await fake.stripe.paymentIntents.create({
      amount: 12000,
      currency: 'eur',
      customer: 'cus_1',
      payment_method: 'pm_ok',
      off_session: true,
      confirm: true,
      metadata: { kind: 'card_charge', cofBookingId: ID, attempt: '0', bookingReference: 'PRG-20261101-SETL01' },
    })) as { id: string }
    db.state.booking_payment_events.push({
      id: 9001,
      booking_id: ID,
      event_key: 'capture_started:0:1',
      kind: 'capture_started',
      from_state: 'expired',
      to_state: 'capturing',
      actor_type: 'system',
      created_at: new Date(Date.now() - 21 * HOUR).toISOString(),
    })
    const callsBefore = fake.calls.length

    const res = await settleBooking(ID, ACTOR)

    expect(res.outcome).toBe('captured')
    const after = fake.calls.slice(callsBefore).map((c) => c.method)
    expect(after).toContain('paymentIntents.search')
    expect(after).not.toContain('paymentIntents.create')
    expect(fake.callsTo('paymentIntents.search')[0].params.query).toBe(
      `metadata['cofBookingId']:'${ID}' AND metadata['attempt']:'0' AND metadata['kind']:'card_charge'`,
    )
    expect(row().payment_intent_id).toBe(old.id)
    expect(collectedTotal()).toBe(12000)
  })

  it('a stale attempt whose search finds nothing creates the PaymentIntent after the search', async () => {
    seed({ payment_state: 'capturing', payment_lease_until: new Date(Date.now() - 1000).toISOString() })
    db.state.booking_payment_events.push({
      id: 9002,
      booking_id: ID,
      event_key: 'capture_started:0:1',
      kind: 'capture_started',
      from_state: 'expired',
      to_state: 'capturing',
      actor_type: 'system',
      created_at: new Date(Date.now() - 21 * HOUR).toISOString(),
    })
    await settleBooking(ID, ACTOR)
    const methods = fake.calls.map((c) => c.method)
    expect(methods.indexOf('paymentIntents.search')).toBeGreaterThanOrEqual(0)
    expect(methods.indexOf('paymentIntents.search')).toBeLessThan(methods.indexOf('paymentIntents.create'))
    expect(collectedTotal()).toBe(12000)
  })

  it('a fresh attempt (under 20 h) never searches', async () => {
    seed({ payment_state: 'expired' })
    await settleBooking(ID, ACTOR)
    expect(fake.callsTo('paymentIntents.search')).toHaveLength(0)
  })
})

describe('failure states record the decline for recovery (T-88-41)', () => {
  it('fallback declined -> failed, charge_attempts 1, last_payment_error, payment_failed_at, charge_failed row, no email', async () => {
    seed({ payment_state: 'expired', stripe_payment_method_id: 'pm_decline_insufficient' })
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'failed', code: 'insufficient_funds' })
    const b = row()
    expect(b.payment_state).toBe('failed')
    expect(b.charge_attempts).toBe(1)
    expect(b.last_payment_error).toBe('insufficient_funds')
    expect(b.payment_failed_at).toEqual(expect.any(String))
    expect(b.payment_lease_until).toBeNull()
    expect(b.payment_intent_id).toBeNull()
    expect(ledger('charge_failed')).toHaveLength(1)
    expect(ledger('charge_failed')[0].error_code).toBe('insufficient_funds')
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(collectedTotal()).toBe(0)

    // D-13: one automatic retry 12 h after the failure; the recovery step gets the amount still owed and the new attempt.
    expect(Date.parse(b.payment_retry_at as string) - Date.parse(b.payment_failed_at as string)).toBe(12 * HOUR)
    expect(mockFailure).toHaveBeenCalledTimes(1)
    expect(mockFailure.mock.calls[0][0]).toMatchObject({ id: ID, payment_state: 'failed' })
    expect(mockFailure.mock.calls[0][1]).toEqual({ phase: 'charge', code: 'insufficient_funds', amountMinor: 12000, attempt: 1 })
  })

  it('a failed retry (payment_retry_count 1) schedules no further retry and reports attempt 2', async () => {
    seed({ payment_state: 'failed', charge_attempts: 1, payment_retry_count: 1, stripe_payment_method_id: 'pm_decline_insufficient' })
    const res = await settleBooking(ID, ACTOR, { claimPatch: { payment_retry_count: 1, payment_retry_at: null } })
    expect(res).toEqual({ outcome: 'failed', code: 'insufficient_funds' })
    expect(row().payment_retry_at).toBeNull()
    expect(row().payment_retry_count).toBe(1)
    expect(mockFailure.mock.calls[0][1]).toEqual({ phase: 'charge', code: 'insufficient_funds', amountMinor: 12000, attempt: 2 })
  })

  it('a recovery step that throws never changes the settle outcome', async () => {
    mockFailure.mockRejectedValue(new Error('recovery down'))
    seed({ payment_state: 'expired', stripe_payment_method_id: 'pm_decline_insufficient' })
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'failed', code: 'insufficient_funds' })
    expect(row().payment_state).toBe('failed')
  })

  it('authentication_required on the fallback -> failed with that code', async () => {
    seed({ payment_state: 'expired', stripe_payment_method_id: 'pm_auth_required' })
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'failed', code: 'authentication_required' })
    expect(row().last_payment_error).toBe('authentication_required')
  })

  it('the next attempt after a decline gets a fresh key (chg:<id>:1) and can succeed', async () => {
    seed({ payment_state: 'expired', stripe_payment_method_id: 'pm_decline_insufficient' })
    await settleBooking(ID, ACTOR)
    expect(row().payment_state).toBe('failed')
    row().stripe_payment_method_id = 'pm_ok'
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('captured')
    expect(creates().map((c) => c.idempotencyKey)).toEqual([`chg:${ID}:0`, `chg:${ID}:1`])
    expect(row().last_payment_error).toBeNull()
    expect(collectedTotal()).toBe(12000)
  })

  it('missing customer / payment method -> failed missing_payment_details without a Stripe call', async () => {
    seed({ payment_state: 'expired', stripe_customer_id: null })
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'failed', code: 'missing_payment_details' })
    expect(fake.calls).toHaveLength(0)
    expect(mockFailure).toHaveBeenCalledTimes(1)
  })

  it('difference declined after the main capture -> balance_due with the main PI, the held amount, charge_attempts 1 and no charged email', async () => {
    const holdId = await seedWithHold({ payment_amount_minor: 15000, stripe_payment_method_id: 'pm_decline_insufficient' })
    const res = await settleBooking(ID, ACTOR)

    expect(res).toEqual({ outcome: 'balance_due', code: 'insufficient_funds', capturedMinor: 12000, diffMinor: 0 })
    const b = row()
    expect(b.payment_state).toBe('balance_due')
    expect(b.payment_intent_id).toBe(holdId)
    expect(b.captured_amount_minor).toBe(12000)
    expect(b.charge_attempts).toBe(1)
    expect(b.last_payment_error).toBe('insufficient_funds')
    expect(ledger('difference_failed')).toHaveLength(1)
    expect(ledger('difference_failed')[0].error_code).toBe('insufficient_funds')
    expect(ledger('captured')).toHaveLength(1)
    expect(ledger('difference_charged')).toHaveLength(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(collectedTotal()).toBe(12000)

    // The link, email and alert are for the 3000 difference only; no automatic retry for a difference.
    expect(b.payment_retry_at).toBeNull()
    expect(mockFailure).toHaveBeenCalledTimes(1)
    expect(mockFailure.mock.calls[0][0]).toMatchObject({ id: ID, payment_state: 'balance_due', payment_intent_id: holdId })
    expect(mockFailure.mock.calls[0][1]).toEqual({ phase: 'difference', code: 'insufficient_funds', amountMinor: 3000, attempt: 1 })
  })

  it('a balance_due booking is left alone by a later settle (recovery owns it)', async () => {
    await seedWithHold({ payment_amount_minor: 15000, stripe_payment_method_id: 'pm_decline_insufficient' })
    await settleBooking(ID, ACTOR)
    const before = fake.calls.length
    const again = await settleBooking(ID, ACTOR)
    expect(again.outcome).toBe('noop')
    expect(fake.calls.length).toBe(before)
  })

  it('never collects more than the agreed amount in total, even when settle runs twice', async () => {
    await seedWithHold({ payment_amount_minor: 15000 })
    await settleBooking(ID, ACTOR)
    await settleBooking(ID, ACTOR)
    expect(collectedTotal()).toBeLessThanOrEqual(15000)
  })
})

describe('source guards (T-88-39)', () => {
  it('settle.ts never converts currencies and names each idempotency key builder once', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/payments/settle.ts'), 'utf8')
    expect(src.match(/eurToCzk|czkToEur/g)).toBeNull()
    expect(src.match(/stripeKeys\.difference\(/g)).toHaveLength(1)
    expect(src.match(/stripeKeys\.charge\(/g)).toHaveLength(1)
    expect(src.match(/stripeKeys\.capture\(/g)).toHaveLength(1)
  })
})
