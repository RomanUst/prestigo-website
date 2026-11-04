// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 88 plan 88-13 (HOLD-04, D-05, D-06, D-16, D-17, MAIL-01): settleBooking captures the held amount when a
 * trip is completed, charges the saved card off-session when the hold is gone, charges a price difference
 * separately, and never collects twice (CAS claim, attempt-numbered idempotency keys, ledger event keys).
 */

const { world, mockSendEmail } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
  },
  mockSendEmail: vi.fn(),
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
