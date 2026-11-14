// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 89 plan 89-08 (HOLD-06, CANC-01, D-03 to D-07, D-09, D-20, D-24): the one cancellation orchestrator.
 *
 * Tracer: an admin client-cancel of a late card booking end to end through the real route and cancelBooking, on the
 * stateful fakes: status cancelled, hold untouched, fee case pending. Then the whole money matrix for both outcomes,
 * the client-only rules, the failure paths (a failed money step keeps the cancel) and the races.
 */

const { world, mockEmail, mockAlert, mockDeactivateLink, mockGetAdminUser, mockPaymentEmail } = vi.hoisted(() => ({
  world: {
    db: null as unknown as FakePaymentsDb,
    stripe: null as unknown,
    advanceCalls: [] as Array<Record<string, unknown>>,
    beforeAdvance: null as null | (() => void),
    advanceError: false,
  },
  mockEmail: vi.fn(),
  mockAlert: vi.fn(),
  mockDeactivateLink: vi.fn(),
  mockGetAdminUser: vi.fn(),
  mockPaymentEmail: vi.fn(),
}))

/** advance_booking_status (migration 084) is not part of the payments fake: a compare-and-set on bookings.status. */
async function advanceRpc(args: Record<string, unknown>) {
  world.advanceCalls.push(args)
  world.beforeAdvance?.()
  if (world.advanceError) return { data: null, error: { message: 'down' } }
  const b = world.db.state.bookings.find((x) => x.id === args.p_booking_id)
  if (!b) return { data: { applied: false, current_status: null }, error: null }
  if (b.status !== args.p_from) return { data: { applied: false, current_status: b.status }, error: null }
  b.status = args.p_to
  return { data: { applied: true, booking: { ...b } }, error: null }
}

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) =>
      name === 'advance_booking_status' ? advanceRpc(args ?? {}) : world.db.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: mockAlert }))
vi.mock('@/lib/payments/emails/send', () => ({ sendPaymentEmail: mockPaymentEmail, bookingEmailDataFromRow: (r: unknown) => r }))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: mockDeactivateLink }))
// The notices after a cancel are plan 89-27: here only the call on the free paths is pinned.
vi.mock('@/lib/booking-status-service', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/booking-status-service')>()),
  scheduleCancelRouteEmail: mockEmail,
}))

import { POST } from '@/app/api/admin/bookings/cancel/route'
import { cancelBooking, type CancelBookingInput, type CancelResult } from '@/lib/payments/cancel'
import { loadFeeCase } from '@/lib/payments/fee'
import { czkToEur } from '@/lib/currency'
import { handleHoldCanceled } from '@/lib/stripe-webhook/hold-events'

const ID = '88888888-8888-4888-8888-888888888888'
const HOUR = 3_600_000
const MIN = 60_000
const PICKUP = Date.parse('2026-12-10T12:00:00Z')
/** Legacy terms (no stored policy): free until one hour before the pickup. */
const FREE_NOW = PICKUP - 48 * HOUR
const LATE_NOW = PICKUP - 30 * MIN
const ADMIN = { type: 'admin', id: 'admin-1' } as const
const CLIENT = { type: 'system', id: 'client_token' } as const

let db: FakePaymentsDb
let fake: FakeStripe

function seed(over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({
    nowMs: LATE_NOW,
    bookings: [
      {
        id: ID,
        status: 'confirmed',
        booking_source: 'web',
        payment_mode: 'card_hold',
        payment_state: 'card_saved',
        booking_reference: 'PRG-20261210-CANC01',
        client_email: 'anna@example.com',
        locale: 'en',
        trip_type: 'transfer',
        distance_km: 50,
        pickup_date: '2026-12-10',
        pickup_time: '13:00',
        pickup_utc: new Date(PICKUP).toISOString(),
        payment_currency: 'eur',
        payment_amount_minor: 10000,
        stripe_customer_id: 'cus_1',
        stripe_payment_method_id: 'pm_ok',
        ...over,
      },
    ],
  })
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))
const cases = () => db.state.booking_fee_cases.filter((c) => c.booking_id === ID)

/** A held authorization at (fake) Stripe: requires_capture. */
async function holdPi(amount = 10000): Promise<string> {
  const pi = (await fake.stripe.paymentIntents.create({
    amount,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_ok',
    capture_method: 'manual',
    off_session: true,
    confirm: true,
    metadata: { kind: 'card_hold', cofBookingId: ID, attempt: '0', bookingReference: 'PRG-20261210-CANC01' },
  })) as { id: string }
  return pi.id
}

/** A paid PaymentIntent (succeeded): a pay-now charge, or a captured card payment. */
async function paidPi(amount = 10000): Promise<string> {
  const pi = (await fake.stripe.paymentIntents.create({
    amount,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_ok',
    off_session: true,
    confirm: true,
    metadata: { cofBookingId: ID },
  })) as { id: string }
  expect(fake.state.paymentIntents.get(pi.id)!.status).toBe('succeeded')
  fake.calls.length = 0
  return pi.id
}

function run(initiator: CancelBookingInput['initiator'], nowMs: number, extra: Partial<CancelBookingInput> = {}): Promise<CancelResult> {
  return cancelBooking({
    bookingId: ID,
    initiator,
    actor: initiator === 'client_token' ? CLIENT : ADMIN,
    nowMs,
    ...extra,
  })
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/admin/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fake = createFakeStripe()
  world.stripe = fake.stripe
  world.advanceCalls = []
  world.beforeAdvance = null
  world.advanceError = false
  mockAlert.mockResolvedValue('sent')
  mockDeactivateLink.mockResolvedValue(undefined)
  mockPaymentEmail.mockResolvedValue('sent')
  mockGetAdminUser.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
  seed()
})

// ── Tracer ─────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('tracer: an admin client-cancel of a late card booking, through the route and cancelBooking', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('late + authorized: status cancelled, the hold untouched, a pending case with the stored percent, answer { ok, late }', async () => {
    vi.setSystemTime(LATE_NOW)
    const piId = await holdPi()
    seed({
      payment_state: 'authorized',
      hold_payment_intent_id: piId,
      hold_amount_minor: 10000,
      // Stored terms: 12 h free window, 50% proposal. 30 min before the pickup is late under them as well.
      cancel_policy_version: '2026-11-1',
      cancel_policy: { version: '2026-11-1', kmThreshold: 100, freeHoursShort: 12, freeHoursLong: 12, freeHoursHourly: 12, feePercent: 50 },
    })
    fake.calls.length = 0

    const res = await post({ id: ID, cancelled_by: 'client' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, late: true })

    expect(row().status).toBe('cancelled')
    expect(row().payment_state).toBe('authorized')
    expect(fake.state.paymentIntents.get(piId)!.status).toBe('requires_capture')
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)

    expect(cases()).toHaveLength(1)
    expect(cases()[0]).toMatchObject({ kind: 'late_cancel', status: 'pending', base_minor: 10000, proposed_minor: 5000, currency: 'eur' })
    expect(row().fee_case_status).toBe('pending')
    expect(ledger('hold_released')).toHaveLength(0)
    expect(ledger('admin_action')[0]).toMatchObject({ error_code: 'cancel_client', actor_type: 'admin', actor_id: 'admin-1' })
    expect(world.advanceCalls[0]).toMatchObject({ p_to: 'cancelled', p_source: 'admin_cancel', p_actor_type: 'admin', p_actor_id: 'admin-1' })
    // The client is told it was late and that a person decides; nothing is promised about the money (plan 89-27).
    expect(mockEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID }),
      'confirmed',
      expect.objectContaining({ variant: 'late', moneyOutcome: 'none', feeMinor: 5000 }),
    )
  })

  it('in time + authorized: the PaymentIntent is cancelled at Stripe, released, answer released', async () => {
    vi.setSystemTime(FREE_NOW)
    const piId = await holdPi()
    seed({ payment_state: 'authorized', hold_payment_intent_id: piId, hold_amount_minor: 10000 })
    fake.calls.length = 0

    const res = await post({ id: ID, cancelled_by: 'client' })
    expect(await res.json()).toEqual({ ok: true, released: true })
    expect(fake.state.paymentIntents.get(piId)!.status).toBe('canceled')
    expect(row()).toMatchObject({ status: 'cancelled', payment_state: 'released' })
    expect(cases()).toHaveLength(0)
    expect(mockEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID }),
      'confirmed',
      expect.objectContaining({ variant: 'free', moneyOutcome: 'released' }),
    )
  })

  it('cancelled by Prestigo is free even 30 minutes before the pickup: released, no case', async () => {
    vi.setSystemTime(LATE_NOW)
    const piId = await holdPi()
    seed({ payment_state: 'authorized', hold_payment_intent_id: piId, hold_amount_minor: 10000 })
    const res = await post({ id: ID, cancelled_by: 'prestigo' })
    expect(await res.json()).toEqual({ ok: true, released: true })
    expect(row().payment_state).toBe('released')
    expect(cases()).toHaveLength(0)
    expect(ledger('admin_action')[0]).toMatchObject({ error_code: 'cancel_prestigo' })
  })

  it('a body that does not say who cancelled is refused (no default, D-20): 400, nothing read or written', async () => {
    const res = await post({ id: ID })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid payload' })
    expect(world.advanceCalls).toHaveLength(0)
    expect(row().status).toBe('confirmed')
    const other = await post({ id: ID, cancelled_by: 'driver' })
    expect(other.status).toBe(400)
    expect(world.advanceCalls).toHaveLength(0)
  })
})

// ── Busy and races ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('busy and races (D-04, T-89-26)', () => {
  it.each([
    ['capturing', { payment_state: 'capturing' }],
    ['placing_hold with a live lease', { payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() + 5 * MIN).toISOString() }],
  ])('%s: busy, nothing written', async (_name, over) => {
    seed(over)
    expect(await run('admin_client', LATE_NOW)).toEqual({ kind: 'busy' })
    expect(world.advanceCalls).toHaveLength(0)
    expect(row().status).toBe('confirmed')
    expect(cases()).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
  })

  it('placing_hold whose lease lapsed no longer blocks: a free cancel voids the dead attempt and releases', async () => {
    seed({ payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() - HOUR).toISOString(), hold_attempts: 0 })
    const res = await run('admin_prestigo', LATE_NOW)
    expect(res).toMatchObject({ kind: 'ok', money: 'released' })
    expect(row().payment_state).toBe('released')
  })

  it('a lost status race: conflict, no money moved, no case, no ledger row', async () => {
    seed({ payment_state: 'card_saved' })
    world.beforeAdvance = () => {
      row().status = 'completed'
    }
    expect(await run('admin_client', LATE_NOW)).toEqual({ kind: 'conflict', currentStatus: 'completed' })
    expect(row().status).toBe('completed')
    expect(cases()).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
    expect(mockEmail).not.toHaveBeenCalled()
  })

  it('a lost race on a paid booking refunds nothing', async () => {
    seed({ payment_mode: 'pay_now', payment_state: 'none', payment_currency: null, payment_amount_minor: null, amount_eur: 100, payment_intent_id: await paidPi() })
    world.beforeAdvance = () => {
      row().status = 'completed'
    }
    expect(await run('admin_prestigo', FREE_NOW)).toMatchObject({ kind: 'conflict' })
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
  })

  it('an RPC failure on the status write: db_failed and nothing else happens', async () => {
    world.advanceError = true
    expect(await run('admin_client', LATE_NOW)).toEqual({ kind: 'db_failed' })
    expect(cases()).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
  })

  it('unknown booking: not_found', async () => {
    expect(await cancelBooking({ bookingId: '99999999-9999-4999-8999-999999999999', initiator: 'admin_client', actor: ADMIN })).toEqual({ kind: 'not_found' })
  })

  it.each(['completed', 'cancelled', 'no_show'])('an admin can not cancel a %s booking', async (status) => {
    seed({ status })
    expect(await run('admin_client', LATE_NOW)).toEqual({ kind: 'not_cancellable', status })
    expect(world.advanceCalls).toHaveLength(0)
  })
})

// ── The money matrix: every booking type, free and late (89-RESEARCH Pattern 2) ─────────────────────────────────────

interface MatrixRow {
  name: string
  seed: () => Promise<Record<string, unknown>>
  free: { money: 'released' | 'refunded' | 'none'; state: string; refunds?: number; cancels?: number }
  late: { money: 'kept' | 'released' | 'none'; state: string; base?: number }
}

const CARD = { payment_mode: 'card_hold' }
const PAY_NOW = {
  payment_mode: 'pay_now',
  payment_state: 'none',
  payment_currency: null,
  payment_amount_minor: null,
  stripe_payment_method_id: null,
  amount_eur: 100,
}

const MATRIX: MatrixRow[] = [
  {
    name: 'card_hold card_saved',
    seed: async () => ({ ...CARD, payment_state: 'card_saved' }),
    free: { money: 'released', state: 'released', refunds: 0, cancels: 0 },
    late: { money: 'kept', state: 'card_saved', base: 10000 },
  },
  {
    name: 'card_hold expired',
    seed: async () => ({ ...CARD, payment_state: 'expired', hold_payment_intent_id: null }),
    free: { money: 'released', state: 'released', refunds: 0, cancels: 0 },
    late: { money: 'kept', state: 'expired', base: 10000 },
  },
  {
    name: 'card_hold failed',
    seed: async () => ({ ...CARD, payment_state: 'failed' }),
    free: { money: 'released', state: 'released', refunds: 0, cancels: 0 },
    late: { money: 'kept', state: 'failed', base: 10000 },
  },
  {
    name: 'card_hold authorized',
    seed: async () => ({ ...CARD, payment_state: 'authorized', hold_payment_intent_id: await holdPi(), hold_amount_minor: 10000 }),
    free: { money: 'released', state: 'released', refunds: 0, cancels: 1 },
    late: { money: 'kept', state: 'authorized', base: 10000 },
  },
  {
    name: 'card_hold checkout_pending (no card on file)',
    seed: async () => ({ ...CARD, payment_state: 'checkout_pending', status: 'unpaid', stripe_payment_method_id: null }),
    free: { money: 'released', state: 'released', refunds: 0, cancels: 0 },
    late: { money: 'released', state: 'released' },
  },
  {
    name: 'card_hold captured (paid a recovery link before the trip)',
    seed: async () => ({ ...CARD, payment_state: 'captured', payment_intent_id: await paidPi(8000), captured_amount_minor: 8000 }),
    free: { money: 'refunded', state: 'captured', refunds: 1, cancels: 0 },
    late: { money: 'kept', state: 'captured', base: 8000 },
  },
  {
    name: 'card_hold balance_due',
    seed: async () => ({ ...CARD, payment_state: 'balance_due', payment_intent_id: await paidPi(6000), captured_amount_minor: 6000 }),
    free: { money: 'refunded', state: 'balance_due', refunds: 1, cancels: 0 },
    late: { money: 'kept', state: 'balance_due', base: 6000 },
  },
  {
    name: 'cash_guarantee card_saved',
    seed: async () => ({ payment_mode: 'cash_guarantee', payment_state: 'card_saved' }),
    free: { money: 'released', state: 'released', refunds: 0, cancels: 0 },
    late: { money: 'kept', state: 'card_saved', base: 10000 },
  },
  {
    name: 'pay_now paid',
    seed: async () => ({ ...PAY_NOW, payment_intent_id: await paidPi(10000) }),
    free: { money: 'refunded', state: 'none', refunds: 1, cancels: 0 },
    late: { money: 'kept', state: 'none', base: 10000 },
  },
  {
    name: 'pay_now never paid (manual)',
    seed: async () => ({ ...PAY_NOW, payment_intent_id: null }),
    free: { money: 'none', state: 'none', refunds: 0, cancels: 0 },
    late: { money: 'none', state: 'none' },
  },
  {
    name: 'partner (GNet)',
    seed: async () => ({ ...PAY_NOW, booking_source: 'gnet', payment_mode: 'partner', payment_intent_id: null }),
    free: { money: 'none', state: 'none', refunds: 0, cancels: 0 },
    late: { money: 'none', state: 'none' },
  },
]

describe.each(MATRIX)('money matrix: $name', (m) => {
  it('free (in time): the outcome of the policy, no human, no fee case', async () => {
    seed(await m.seed())
    const result = await run('admin_client', FREE_NOW)
    expect(result).toMatchObject({ kind: 'ok', outcome: 'free', money: m.free.money })
    expect(row()).toMatchObject({ status: 'cancelled', payment_state: m.free.state })
    expect(cases()).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(m.free.refunds ?? 0)
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(m.free.cancels ?? 0)
    if (m.free.money === 'refunded') {
      expect(fake.callsTo('refunds.create')[0].idempotencyKey).toBe(`refund:${ID}:full`)
    }
  })

  it('late: the status changes at once and the money option stays; never a release, never a refund', async () => {
    seed(await m.seed())
    const result = await run('admin_client', LATE_NOW)
    expect(result).toMatchObject({ kind: 'ok', outcome: 'late', money: m.late.money })
    expect(row()).toMatchObject({ status: 'cancelled', payment_state: m.late.state })
    if (m.late.base !== undefined) {
      expect(cases()).toHaveLength(1)
      expect(cases()[0]).toMatchObject({ kind: 'late_cancel', status: 'pending', base_minor: m.late.base, proposed_minor: m.late.base })
    } else {
      expect(cases()).toHaveLength(0)
    }
    if (m.late.money === 'kept') {
      expect(fake.callsTo('refunds.create')).toHaveLength(0)
      expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
      expect(ledger('hold_released')).toHaveLength(0)
      expect(mockEmail).toHaveBeenCalledTimes(1)
      expect(mockEmail.mock.calls[0][2]).toMatchObject({ variant: 'late', moneyOutcome: 'none' })
    }
  })

  it('cancelled by Prestigo: always the free outcome, whatever the time', async () => {
    seed(await m.seed())
    const result = await run('admin_prestigo', LATE_NOW)
    expect(result).toMatchObject({ kind: 'ok', outcome: 'free', money: m.free.money })
    expect(cases()).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(m.free.refunds ?? 0)
  })
})

describe('late cancel on a hold that sits at Stripe (Pitfall 1)', () => {
  it('the PaymentIntent is still requires_capture and the saved card is still on the booking', async () => {
    const piId = await holdPi()
    seed({ payment_state: 'authorized', hold_payment_intent_id: piId, hold_amount_minor: 10000 })
    await run('admin_client', LATE_NOW)
    expect(fake.state.paymentIntents.get(piId)!.status).toBe('requires_capture')
    expect(row()).toMatchObject({ payment_state: 'authorized', hold_payment_intent_id: piId, stripe_payment_method_id: 'pm_ok' })
  })

  it('a lapsed authorization still ends in expired through the webhook and the case stays pending (chargeable)', async () => {
    const piId = await holdPi()
    seed({ payment_state: 'authorized', hold_payment_intent_id: piId, hold_amount_minor: 10000 })
    await run('admin_client', LATE_NOW)
    const lapsed = fake.expireHold(piId, 'expired')
    await handleHoldCanceled(fake.buildEvent('payment_intent.canceled', lapsed) as never)
    expect(row()).toMatchObject({ status: 'cancelled', payment_state: 'expired', stripe_payment_method_id: 'pm_ok' })
    expect((await loadFeeCase(ID))?.status).toBe('pending')
  })
})

describe('recovery link of a failed hold (D-09)', () => {
  const LINKED = { payment_state: 'failed', recovery_link_id: 'plink_1', recovery_link_url: 'https://buy.stripe.test/plink_1' }

  it('late: the link columns are cleared in one transition keyed by the case, the link deactivated, the state kept', async () => {
    seed(LINKED)
    await run('admin_client', LATE_NOW)
    expect(row()).toMatchObject({ payment_state: 'failed', recovery_link_id: null, recovery_link_url: null })
    expect(mockDeactivateLink).toHaveBeenCalledWith('plink_1')
    const c = cases()[0]
    expect(ledger('fee_opened').map((e) => e.event_key).sort()).toEqual([`fee_link_retired:${c.id}`, `fee_opened:${c.id}`].sort())
  })

  it('late, a card_saved row without a link: no extra transition', async () => {
    seed({ payment_state: 'card_saved' })
    await run('admin_client', LATE_NOW)
    expect(ledger('fee_opened')).toHaveLength(1)
    expect(mockDeactivateLink).not.toHaveBeenCalled()
  })

  it('free: the release drops the link and deactivates it', async () => {
    seed(LINKED)
    await run('admin_client', FREE_NOW)
    expect(row()).toMatchObject({ payment_state: 'released', recovery_link_id: null })
    expect(mockDeactivateLink).toHaveBeenCalledWith('plink_1')
  })
})

describe('the policy a booking was made under (D-18) and the case proposal (D-05)', () => {
  const STORED_12H = {
    cancel_policy_version: '2026-11-1',
    cancel_policy: { version: '2026-11-1', kmThreshold: 100, freeHoursShort: 12, freeHoursLong: 24, freeHoursHourly: 12, feePercent: 30 },
  }

  it('stored 12 h terms: 6 h before is late (legacy would call it free) and the proposal is the stored percent', async () => {
    seed(STORED_12H)
    const result = await run('admin_client', PICKUP - 6 * HOUR)
    expect(result).toMatchObject({ kind: 'ok', outcome: 'late', money: 'kept' })
    expect(cases()[0]).toMatchObject({ proposed_minor: 3000, base_minor: 10000 })
    expect(cases()[0].free_until).toBe(new Date(PICKUP - 12 * HOUR).toISOString())
    expect(cases()[0].evidence).toMatchObject({ initiator: 'admin_client', policyVersion: '2026-11-1', cancelledMinBeforePickup: 360 })
  })

  it('long distance uses the long window', async () => {
    seed({ ...STORED_12H, distance_km: 250 })
    expect(await run('admin_client', PICKUP - 18 * HOUR)).toMatchObject({ outcome: 'late' })
  })

  it('the free deadline itself is free (inclusive)', async () => {
    seed(STORED_12H)
    expect(await run('admin_client', PICKUP - 12 * HOUR)).toMatchObject({ outcome: 'free' })
  })

  it('an admin cancel for the client at or after the pickup counts as late (too_late is late for an operator)', async () => {
    seed({ payment_state: 'card_saved' })
    expect(await run('admin_client', PICKUP + HOUR)).toMatchObject({ kind: 'ok', outcome: 'late', money: 'kept' })
  })

  it('a booking with a stored version that is malformed gets the legacy rule', async () => {
    seed({ cancel_policy_version: '2026-11-1', cancel_policy: { version: 'x', kmThreshold: -5 } })
    expect(await run('admin_client', PICKUP - 6 * HOUR)).toMatchObject({ outcome: 'free' })
  })

  it('an unreadable pickup time: an operator cancel is free (nothing is charged on a guess)', async () => {
    seed({ pickup_utc: null, pickup_date: 'soon', pickup_time: '??' })
    expect(await run('admin_client', LATE_NOW)).toMatchObject({ kind: 'ok', outcome: 'free', money: 'released' })
    expect(cases()).toHaveLength(0)
  })
})

describe('pay-now round trips apply the policy per leg row (D-24)', () => {
  const LEG = { ...PAY_NOW, trip_type: 'round_trip', return_amount_czk: 2500, outbound_amount_czk: 3000 }

  it('free, the return row: a partial refund of that leg only, with the leg key and metadata', async () => {
    seed({ ...LEG, leg: 'return', payment_intent_id: await paidPi(10000) })
    const result = await run('admin_client', FREE_NOW)
    const cents = 10000 - Math.round((10000 * 3000) / 5500) // the leg's share of what was paid
    expect(result).toMatchObject({ kind: 'ok', outcome: 'free', money: 'refunded', refundedMinor: cents, currency: 'eur' })
    const refunds = fake.callsTo('refunds.create')
    expect(refunds).toHaveLength(1)
    expect(refunds[0].params).toMatchObject({ amount: cents, metadata: { leg: 'return' } })
    expect(refunds[0].idempotencyKey).toBe(`refund:${ID}:return`)
  })

  it('late, the outbound row: no refund, the case is that leg (base = its share)', async () => {
    seed({ ...LEG, leg: 'outbound', payment_intent_id: await paidPi(10000) })
    const result = await run('admin_client', LATE_NOW)
    const cents = Math.round((10000 * 3000) / 5500) // the leg's share of what was paid
    expect(result).toMatchObject({ kind: 'ok', outcome: 'late', money: 'kept' })
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
    expect(cases()[0]).toMatchObject({ base_minor: cents, proposed_minor: cents, currency: 'eur' })
  })

  it('a missing leg amount: leg_amount_missing before any write', async () => {
    const paymentIntentId = await paidPi(10000)
    seed({ ...PAY_NOW, trip_type: 'round_trip', leg: 'return', outbound_amount_czk: 3000, return_amount_czk: null, payment_intent_id: paymentIntentId })
    db.state.bookings.push({ ...row(), id: 'sibling-outbound', leg: 'outbound' })
    expect(await run('admin_client', FREE_NOW)).toEqual({ kind: 'leg_amount_missing' })
    expect(world.advanceCalls).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
  })
})

describe('money WR-10: cancelling a booking already marked as paid in cash', () => {
  const settled = { payment_mode: 'cash_guarantee', payment_state: 'cash_settled', payment_amount_minor: 9000 }

  it('the operator must hand the cash back: on record, alerted, and no mail saying nothing was taken', async () => {
    seed(settled)
    const result = await run('admin_prestigo', FREE_NOW)
    expect(result).toEqual({ kind: 'money_failed', amount_minor: 9000, currency: 'eur' })
    expect(row().status).toBe('cancelled')
    expect(ledger('refund_failed')[0]).toMatchObject({ error_code: 'cash_settled', amount_minor: 9000 })
    expect(mockAlert.mock.calls.map((c) => c[0])).toContain('refund_failed')
    expect(mockAlert.mock.calls.find((c) => c[0] === 'refund_failed')![2]).toMatchObject({ note: 'cash_settled', amountMinor: 9000 })
    expect(mockEmail).not.toHaveBeenCalled()
    expect(fake.calls).toHaveLength(0)
  })

  it('a client cancelling late gets the same: the fee has no card to come from, a person sorts the cash out', async () => {
    seed(settled)
    expect(await run('admin_client', LATE_NOW)).toMatchObject({ kind: 'money_failed', amount_minor: 9000 })
    expect(cases()).toHaveLength(0)
  })
})

describe('a failed money step keeps the cancel (88 D-20)', () => {
  it('release fails at Stripe: money_failed with the hold amount, refund_failed row, one alert, still cancelled and still authorized', async () => {
    const piId = await holdPi()
    seed({ payment_state: 'authorized', hold_payment_intent_id: piId, hold_amount_minor: 10000 })
    fake.failNextWith('paymentIntents.cancel', 'connection')
    const result = await run('admin_prestigo', FREE_NOW)
    expect(result).toEqual({ kind: 'money_failed', amount_minor: 10000, currency: 'eur' })
    expect(row()).toMatchObject({ status: 'cancelled', payment_state: 'authorized' })
    expect(ledger('refund_failed')).toHaveLength(1)
    expect(mockAlert).toHaveBeenCalledWith('refund_failed', expect.anything(), expect.objectContaining({ note: 'release' }))
    expect(mockEmail).not.toHaveBeenCalled()
  })

  it('pay-now refund fails: money_failed with the EUR amount, the cancel stands', async () => {
    seed({ ...PAY_NOW, payment_intent_id: await paidPi(10000) })
    fake.failNextWith('refunds.create', 'connection')
    expect(await run('admin_client', FREE_NOW)).toEqual({ kind: 'money_failed', amount_minor: 10000, currency: 'eur' })
    expect(row().status).toBe('cancelled')
    expect(ledger('refund_failed')[0]).toMatchObject({ event_key: `refund_failed:${ID}:full` })
    expect(mockAlert).toHaveBeenCalledTimes(1)
  })

  it('a ledger or alert problem does not change the answer', async () => {
    seed({ ...PAY_NOW, payment_intent_id: await paidPi(10000) })
    fake.failNextWith('refunds.create', 'connection')
    mockAlert.mockRejectedValue(new Error('mail down'))
    expect(await run('admin_client', FREE_NOW)).toMatchObject({ kind: 'money_failed' })
  })

  it('a late cancel whose case can not be opened: db_failed with cancelled true, nothing released', async () => {
    seed({ payment_state: 'card_saved', payment_amount_minor: 10000 })
    const realFrom = db.client.from.bind(db.client)
    world.db = {
      ...db,
      state: db.state,
      client: {
        from: (t: string) => (t === 'booking_fee_cases' ? { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'down', code: '08006' } }) }) }) } : realFrom(t)),
        rpc: (n: string, a?: Record<string, unknown>) => db.client.rpc(n, a),
      },
    } as unknown as FakePaymentsDb
    expect(await run('admin_client', LATE_NOW)).toEqual({ kind: 'db_failed', cancelled: true })
    expect(row()).toMatchObject({ status: 'cancelled', payment_state: 'card_saved' })
    expect(ledger('hold_released')).toHaveLength(0)
  })
})

describe('the client rules (D-03, T-89-27)', () => {
  it('free: acknowledge free cancels and records the system actor and the client_cancel source', async () => {
    seed({ payment_state: 'card_saved' })
    const result = await run('client_token', FREE_NOW, { acknowledge: 'free' })
    expect(result).toMatchObject({ kind: 'ok', outcome: 'free', money: 'released' })
    expect(world.advanceCalls[0]).toMatchObject({ p_source: 'client_cancel', p_actor_type: 'system', p_actor_id: 'client_token', p_to: 'cancelled' })
    expect(ledger('admin_action')).toHaveLength(0)
  })

  it('late: acknowledge late cancels at once, the card stays, a case opens in the same request', async () => {
    seed({ payment_state: 'card_saved' })
    const result = await run('client_token', LATE_NOW, { acknowledge: 'late' })
    expect(result).toMatchObject({ kind: 'ok', outcome: 'late', money: 'kept' })
    expect(row()).toMatchObject({ status: 'cancelled', payment_state: 'card_saved' })
    expect(cases()).toHaveLength(1)
    expect(cases()[0].evidence).toMatchObject({ initiator: 'client_token' })
  })

  it.each([
    ['free shown, now late', FREE_NOW, 'late' as const, LATE_NOW, 'late'],
    ['late shown, now free', LATE_NOW, 'free' as const, FREE_NOW, 'free'],
  ])('a stale acknowledgement (%s) cancels nothing and answers with the new outcome', async (_n, _a, ack, nowMs, current) => {
    seed({ payment_state: 'card_saved' })
    const staleAck = ack === 'late' ? 'free' : 'late'
    expect(await run('client_token', nowMs, { acknowledge: staleAck })).toEqual({ kind: 'policy_changed', outcome: current })
    expect(world.advanceCalls).toHaveLength(0)
    expect(row().status).toBe('confirmed')
    expect(cases()).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
  })

  it('no acknowledgement at all is a stale one', async () => {
    seed({})
    expect(await run('client_token', LATE_NOW)).toEqual({ kind: 'policy_changed', outcome: 'late' })
    expect(row().status).toBe('confirmed')
  })

  it('at or after the pickup: too_late, nothing written', async () => {
    seed({})
    expect(await run('client_token', PICKUP, { acknowledge: 'late' })).toEqual({ kind: 'too_late' })
    expect(await run('client_token', PICKUP + HOUR, { acknowledge: 'late' })).toEqual({ kind: 'too_late' })
    expect(world.advanceCalls).toHaveLength(0)
  })

  it('on_board: refused', async () => {
    seed({ status: 'on_board' })
    expect(await run('client_token', LATE_NOW, { acknowledge: 'late' })).toEqual({ kind: 'not_cancellable', status: 'on_board' })
    expect(world.advanceCalls).toHaveLength(0)
  })

  it.each(['completed', 'no_show'])('%s: refused', async (status) => {
    seed({ status })
    expect(await run('client_token', FREE_NOW, { acknowledge: 'free' })).toEqual({ kind: 'not_cancellable', status })
  })

  it.each(['unpaid', 'pending', 'confirmed', 'assigned', 'en_route', 'on_location'])('a %s booking can be cancelled', async (status) => {
    seed({ status, payment_mode: 'pay_now', payment_state: 'none', payment_currency: null, payment_amount_minor: null })
    expect(await run('client_token', FREE_NOW, { acknowledge: 'free' })).toMatchObject({ kind: 'ok', outcome: 'free' })
    expect(row().status).toBe('cancelled')
  })

  it('a repeat on a cancelled booking answers already_cancelled and moves no money', async () => {
    seed({ payment_state: 'card_saved' })
    await run('client_token', FREE_NOW, { acknowledge: 'free' })
    const advances = world.advanceCalls.length
    expect(await run('client_token', FREE_NOW, { acknowledge: 'free' })).toEqual({ kind: 'already_cancelled' })
    expect(world.advanceCalls).toHaveLength(advances)
  })

  it('a double click that loses the status race to the same cancel answers already_cancelled', async () => {
    seed({ payment_state: 'card_saved' })
    world.beforeAdvance = () => {
      row().status = 'cancelled'
    }
    expect(await run('client_token', FREE_NOW, { acknowledge: 'free' })).toEqual({ kind: 'already_cancelled' })
    expect(ledger()).toHaveLength(0)
  })

  it('a partner booking is not cancellable through the client path', async () => {
    seed({ booking_source: 'gnet', payment_mode: 'partner', payment_state: 'none' })
    expect(await run('client_token', FREE_NOW, { acknowledge: 'free' })).toMatchObject({ kind: 'not_cancellable' })
  })

  it('busy while a worker holds the row, even for the client page', async () => {
    seed({ payment_state: 'capturing' })
    expect(await run('client_token', FREE_NOW, { acknowledge: 'free' })).toEqual({ kind: 'busy' })
    expect(row().status).toBe('confirmed')
  })

  it('a failed money step still keeps the client cancel', async () => {
    seed({ ...PAY_NOW, payment_intent_id: await paidPi(10000) })
    fake.failNextWith('refunds.create', 'connection')
    expect(await run('client_token', FREE_NOW, { acknowledge: 'free' })).toMatchObject({ kind: 'money_failed', amount_minor: 10000 })
    expect(row().status).toBe('cancelled')
  })
})

describe('partner and manual bookings (Pitfall 15)', () => {
  it('a partner booking with a stray payment intent id still gets a status change only', async () => {
    seed({ ...PAY_NOW, booking_source: 'gnet', payment_mode: 'partner', payment_intent_id: await paidPi(10000) })
    expect(await run('admin_client', LATE_NOW)).toEqual({ kind: 'ok', outcome: 'late', money: 'none' })
    expect(row().status).toBe('cancelled')
    expect(fake.calls).toHaveLength(0)
    expect(cases()).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
  })
})

describe('no refund on any late path (T-89-26 / D-07)', () => {
  it.each(MATRIX.filter((m) => m.late.money === 'kept'))('$name', async (m) => {
    seed(await m.seed())
    fake.calls.length = 0
    await run('admin_client', LATE_NOW)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
  })
})

// ── Phase 92 plan 92-11: the quote rule (D-11, D-12) and the quiet mode of a quote-level cancel ──────────────────────

const QUOTE_TRIP = { quote_id: '99999999-9999-4999-8999-999999999991', quote_line_id: '99999999-9999-4999-8999-999999999992' }

describe('D-11: a trip of a quote is always free on the trip side', () => {
  it('D-11 tracer: a late admin_client cancel of an authorized quote booking releases the hold, opens no case, mails the free variant', async () => {
    const piId = await holdPi()
    seed({ ...QUOTE_TRIP, payment_state: 'authorized', hold_payment_intent_id: piId, hold_amount_minor: 10000 })
    fake.calls.length = 0

    const res = await run('admin_client', LATE_NOW)

    expect(res).toEqual({ kind: 'ok', outcome: 'free', money: 'released' })
    expect(row()).toMatchObject({ status: 'cancelled', payment_state: 'released' })
    expect(fake.state.paymentIntents.get(piId)!.status).toBe('canceled')
    expect(cases()).toHaveLength(0)
    expect(row().fee_case_status ?? null).toBeNull()
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
    expect(mockEmail).toHaveBeenCalledTimes(1)
    expect(mockEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID }),
      'confirmed',
      expect.objectContaining({ variant: 'free', moneyOutcome: 'released' }),
    )
  })

  it('D-11: the same late cancel of a booking WITHOUT quote_id still keeps the hold and opens a case', async () => {
    const piId = await holdPi()
    seed({ payment_state: 'authorized', hold_payment_intent_id: piId, hold_amount_minor: 10000 })
    expect(await run('admin_client', LATE_NOW)).toMatchObject({ kind: 'ok', outcome: 'late', money: 'kept' })
    expect(cases()).toHaveLength(1)
    expect(fake.state.paymentIntents.get(piId)!.status).toBe('requires_capture')
  })

  it('D-11: card_hold + card_saved, late: nothing is charged, no case', async () => {
    seed({ ...QUOTE_TRIP, payment_mode: 'card_hold', payment_state: 'card_saved' })
    fake.calls.length = 0
    const res = await run('admin_client', LATE_NOW)
    expect(res).toMatchObject({ kind: 'ok', outcome: 'free' })
    expect(['released', 'none']).toContain((res as { money: string }).money)
    expect(row().status).toBe('cancelled')
    expect(cases()).toHaveLength(0)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
  })

  it('D-11: cash_guarantee, late: no case, no charge', async () => {
    seed({ ...QUOTE_TRIP, payment_mode: 'cash_guarantee', payment_state: 'card_saved' })
    fake.calls.length = 0
    const res = await run('admin_client', LATE_NOW)
    expect(res).toMatchObject({ kind: 'ok', outcome: 'free' })
    expect(cases()).toHaveLength(0)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(fake.callsTo('refunds.create')).toHaveLength(0)
  })

  it('D-11: payment_mode quote, late: the status changes and Stripe is not touched', async () => {
    seed({ ...QUOTE_TRIP, payment_mode: 'quote', payment_state: 'none', payment_amount_minor: null, payment_currency: null })
    fake.calls.length = 0
    expect(await run('admin_client', LATE_NOW)).toEqual({ kind: 'ok', outcome: 'free', money: 'none' })
    expect(row().status).toBe('cancelled')
    expect(fake.calls).toHaveLength(0)
    expect(cases()).toHaveLength(0)
  })

  it('D-11: even a cancel after the pickup time opens no case on a quote trip', async () => {
    seed({ ...QUOTE_TRIP, payment_state: 'card_saved' })
    expect(await run('admin_client', PICKUP + HOUR)).toMatchObject({ kind: 'ok', outcome: 'free' })
    expect(cases()).toHaveLength(0)
  })

  it('D-11: the client path keeps its own limits on a quote trip (too late after the pickup)', async () => {
    seed({ ...QUOTE_TRIP, payment_state: 'card_saved' })
    expect(await run('client_token', PICKUP + HOUR, { acknowledge: 'free' })).toEqual({ kind: 'too_late' })
    expect(row().status).toBe('confirmed')
  })
})

describe('suppressClientEmail (a quote-level cancel speaks once)', () => {
  it('without the flag a single quote trip cancel emails the client with the free outcome', async () => {
    seed({ ...QUOTE_TRIP, payment_state: 'card_saved' })
    await run('admin_client', LATE_NOW)
    expect(mockEmail).toHaveBeenCalledTimes(1)
    expect(mockEmail.mock.calls[0][2]).toMatchObject({ variant: 'free' })
  })

  it.each([
    ['authorized hold', async () => ({ payment_state: 'authorized', hold_payment_intent_id: await holdPi(), hold_amount_minor: 10000 })],
    ['saved card', async () => ({ payment_state: 'card_saved' })],
    ['quote mode', async () => ({ payment_mode: 'quote', payment_state: 'none', payment_amount_minor: null, payment_currency: null })],
    ['partner booking', async () => ({ booking_source: 'gnet', payment_mode: 'partner', payment_state: 'none' })],
  ])('%s: no client email, the cancel and its money step are unchanged', async (_name, over) => {
    seed({ ...QUOTE_TRIP, ...(await over()) })
    const res = await run('admin_client', LATE_NOW, { suppressClientEmail: true })
    expect(res.kind).toBe('ok')
    expect(row().status).toBe('cancelled')
    expect(mockEmail).not.toHaveBeenCalled()
  })

  it('a paid card booking on a quote trip is refunded without a client email', async () => {
    seed({ ...QUOTE_TRIP, payment_state: 'captured', payment_intent_id: await paidPi(10000), captured_amount_minor: 10000 })
    const res = await run('admin_client', LATE_NOW, { suppressClientEmail: true })
    expect(res).toMatchObject({ kind: 'ok', money: 'refunded' })
    expect(mockEmail).not.toHaveBeenCalled()
  })

  it('on a booking without quote_id the flag silences the mail but a late cancel still opens its case', async () => {
    seed({ payment_state: 'card_saved' })
    expect(await run('admin_client', LATE_NOW, { suppressClientEmail: true })).toMatchObject({ kind: 'ok', outcome: 'late', money: 'kept' })
    expect(cases()).toHaveLength(1)
    expect(mockEmail).not.toHaveBeenCalled()
  })
})
