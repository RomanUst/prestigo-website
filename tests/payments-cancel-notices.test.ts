// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 89 plan 89-27 (HOLD-06, CANC-01, D-03, D-05, D-20): everyone who must know about a cancel is told, once, in the
 * right language. Real cancelBooking, real scheduleCancelRouteEmail, real payment email renderer and sender; doubles for
 * Resend, Stripe, the status RPC, the email log, the driver lookup and the operator alert sender.
 *
 * Tracer: a late cancel through cancelBooking to the cancelled email, variant late, in the booking locale. Then the free
 * and by_prestigo variants, the driver mail, the operator alerts and the failure rules.
 */

const { world, mockResendSend, mockAlert, emailLog, deferred } = vi.hoisted(() => ({
  world: {
    db: null as unknown as FakePaymentsDb,
    stripe: null as unknown,
    assignments: [] as Array<Record<string, unknown>>,
    assignmentsError: false,
    openFeeCaseFails: false,
  },
  mockResendSend: vi.fn(),
  mockAlert: vi.fn(),
  emailLog: new Set<string>(),
  deferred: [] as Array<() => Promise<void>>,
}))

process.env.RESEND_API_KEY = 're_test'
process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'

async function advanceRpc(args: Record<string, unknown>) {
  const b = world.db.state.bookings.find((x) => x.id === args.p_booking_id)
  if (!b) return { data: { applied: false, current_status: null }, error: null }
  if (b.status !== args.p_from) return { data: { applied: false, current_status: b.status }, error: null }
  b.status = args.p_to
  return { data: { applied: true, booking: { ...b } }, error: null }
}

/** driver_assignments is not part of the payments fake: a minimal select().eq().eq() chain over world.assignments. */
function assignmentsQuery() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        world.assignmentsError ? { data: null, error: { message: 'down' } } : { data: world.assignments, error: null },
      ).then(resolve),
  }
  return chain
}

vi.mock('next/server', async (importActual) => ({
  ...(await importActual<typeof import('next/server')>()),
  after: (fn: () => Promise<void>) => {
    deferred.push(fn)
  },
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => (table === 'driver_assignments' ? assignmentsQuery() : world.db.client.from(table)),
    rpc: (name: string, args?: Record<string, unknown>) =>
      name === 'advance_booking_status' ? advanceRpc(args ?? {}) : world.db.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: mockAlert }))
vi.mock('@/lib/payments/fee', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments/fee')>()
  return {
    ...actual,
    openFeeCase: (...args: Parameters<typeof actual.openFeeCase>) => {
      if (world.openFeeCaseFails) return Promise.reject(new Error('fee case open failed'))
      return actual.openFeeCase(...args)
    },
  }
})
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: vi.fn() }))
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))
// email_log is not modelled by the payments fake: the ten-minute window is a plain set here.
vi.mock('@/lib/email-log', () => ({
  logEmail: async (p: { bookingId: string | null; emailType: string; recipient: string }) => {
    const key = `${p.bookingId}|${p.emailType}|${p.recipient}`
    if (emailLog.has(key)) return false
    emailLog.add(key)
    return true
  },
}))

import { cancelBooking, type CancelBookingInput, type CancelResult } from '@/lib/payments/cancel'
import { scheduleCancelRouteEmail } from '@/lib/booking-status-service'

const ID = '99999999-9999-4999-8999-999999999999'
const HOUR = 3_600_000
const MIN = 60_000
const PICKUP = Date.parse('2026-12-10T12:00:00Z')
const FREE_NOW = PICKUP - 48 * HOUR
const LATE_NOW = PICKUP - 30 * MIN
const ADMIN = { type: 'admin', id: 'admin-1' } as const
const CLIENT = { type: 'system', id: 'client_token' } as const
const CLIENT_EMAIL = 'anna@example.com'
const DRIVER_EMAIL = 'driver@example.com'
const POLICY = {
  version: '2026-11-1',
  kmThreshold: 100,
  freeHoursShort: 12,
  freeHoursLong: 12,
  freeHoursHourly: 12,
  feePercent: 50,
}

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
        booking_reference: 'PRG-20261210-NOTE01',
        client_email: CLIENT_EMAIL,
        client_first_name: 'Anna',
        client_last_name: 'Ivanova',
        client_phone: '+420777111222',
        locale: 'ru',
        trip_type: 'transfer',
        distance_km: 50,
        pickup_date: '2026-12-10',
        pickup_time: '13:00',
        pickup_utc: new Date(PICKUP).toISOString(),
        origin_address: 'Václav Havel Airport Prague',
        destination_address: 'Hotel Alcron',
        payment_currency: 'eur',
        payment_amount_minor: 10000,
        stripe_customer_id: 'cus_1',
        stripe_payment_method_id: 'pm_ok',
        cancel_policy_version: POLICY.version,
        cancel_policy: POLICY,
        ...over,
      },
    ],
  })
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))

function run(initiator: CancelBookingInput['initiator'], nowMs: number, extra: Partial<CancelBookingInput> = {}): Promise<CancelResult> {
  return cancelBooking({
    bookingId: ID,
    initiator,
    actor: initiator === 'client_token' ? CLIENT : ADMIN,
    nowMs,
    ...extra,
  })
}

/** Runs every deferred after() callback registered so far, the way the platform does after the response. */
async function drain() {
  while (deferred.length > 0) await deferred.shift()!()
}

type Sent = { to: string[]; subject: string; html: string; replyTo?: string }
const sentTo = (email: string): Sent[] =>
  mockResendSend.mock.calls.map((c) => c[0] as Sent).filter((m) => m.to.includes(email))

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
  fake.calls.length = 0
  return pi.id
}

const ACCEPTED_DRIVER = [
  {
    status: 'accepted',
    trip_token: 'tok-1234',
    drivers: { name: 'Petr Novak', email: DRIVER_EMAIL, vehicle_info: 'Mercedes V-Class' },
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(LATE_NOW)
  fake = createFakeStripe()
  world.stripe = fake.stripe
  world.assignments = []
  world.assignmentsError = false
  world.openFeeCaseFails = false
  emailLog.clear()
  deferred.length = 0
  mockResendSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
  mockAlert.mockResolvedValue('sent')
  seed()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Tracer ─────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('tracer: a late cancel through cancelBooking to the cancelled email in the booking language', () => {
  it('late, locale ru: one email to the client, Russian subject and body, late wording, nothing charged', async () => {
    const result = await run('admin_client', LATE_NOW)
    expect(result).toMatchObject({ kind: 'ok', outcome: 'late', money: 'kept' })
    await drain()

    const mails = sentTo(CLIENT_EMAIL)
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toBe('Ваше бронирование PRESTIGO отменено — PRG-20261210-NOTE01')
    expect(mails[0].html).toContain('Вы отменили бронирование после')
    expect(mails[0].html).toContain('Решение принимает сотрудник Prestigo')
    expect(mails[0].html).not.toContain('Nothing has been charged')
    expect(mails[0].html).toContain('lang="ru"')
    // The ledger row of the delivered mail carries the exactly-once key.
    expect(ledger('email_sent').map((e) => e.event_key)).toContain(`email:cancelled:${ID}`)
  })

  it('the same key twice delivers one message', async () => {
    const booking = { ...row() }
    const notice = { variant: 'free' as const, moneyOutcome: 'none' as const }
    scheduleCancelRouteEmail(booking, 'confirmed', notice)
    scheduleCancelRouteEmail(booking, 'confirmed', notice)
    await drain()
    expect(sentTo(CLIENT_EMAIL)).toHaveLength(1)
  })
})

// ── Variants ───────────────────────────────────────────────────────────────────────────────────────────────────────

describe('which variant the client gets (D-05, D-20)', () => {
  it('free, by the client in time: the free wording in English with the hold released', async () => {
    seed({ locale: 'en' })
    vi.setSystemTime(FREE_NOW)
    const result = await run('client_token', FREE_NOW, { acknowledge: 'free' })
    expect(result).toMatchObject({ kind: 'ok', outcome: 'free', money: 'released' })
    await drain()
    const [mail] = sentTo(CLIENT_EMAIL)
    expect(sentTo(CLIENT_EMAIL)).toHaveLength(1)
    expect(mail.subject).toBe('Your PRESTIGO booking is cancelled — PRG-20261210-NOTE01')
    expect(mail.html).toContain('Nothing was charged. The hold on your card is released.')
  })

  it('by_prestigo: the apology wording, even 30 minutes before the pickup, no fee wording', async () => {
    seed({ locale: 'en' })
    const result = await run('admin_prestigo', LATE_NOW)
    expect(result).toMatchObject({ kind: 'ok', outcome: 'free', money: 'released' })
    await drain()
    const [mail] = sentTo(CLIENT_EMAIL)
    expect(mail.html).toContain('We had to cancel your booking.')
    expect(mail.html).not.toContain('cancellation fee')
  })

  it('a refunded payment says what is refunded', async () => {
    seed({
      locale: 'en',
      payment_mode: 'pay_now',
      payment_state: 'none',
      payment_currency: null,
      payment_amount_minor: null,
      amount_eur: 100,
      payment_intent_id: await paidPi(10000),
    })
    vi.setSystemTime(FREE_NOW)
    const result = await run('admin_prestigo', FREE_NOW)
    expect(result).toMatchObject({ kind: 'ok', money: 'refunded' })
    await drain()
    const [mail] = sentTo(CLIENT_EMAIL)
    expect(mail.html).toMatch(/refund/i)
    expect(mail.html).toContain('We refunded <bdi dir="ltr">€100</bdi> to your card.')
  })

  it('late by Prestigo cannot happen: the stored percent never reaches a by_prestigo mail', async () => {
    await run('admin_prestigo', LATE_NOW)
    await drain()
    expect(mockAlert).not.toHaveBeenCalledWith('fee_decision_needed', expect.anything(), expect.anything())
  })
})

// ── Who is not told ────────────────────────────────────────────────────────────────────────────────────────────────

describe('who gets no client mail', () => {
  it('a partner booking', async () => {
    seed({ booking_source: 'gnet' })
    await run('admin_client', LATE_NOW)
    await drain()
    expect(sentTo(CLIENT_EMAIL)).toHaveLength(0)
  })

  it('a booking that was unpaid', async () => {
    seed({ status: 'unpaid' })
    // unpaid has no cancel transition for the orchestrator; the sender guard is what is pinned here.
    scheduleCancelRouteEmail({ ...row() }, 'unpaid', { variant: 'free', moneyOutcome: 'none' })
    await drain()
    expect(sentTo(CLIENT_EMAIL)).toHaveLength(0)
  })

  it('the cancelled notification flag silences the client mail but not the driver mail', async () => {
    db.state.pricing_globals[0].notification_flags = { cancelled: false }
    world.assignments = ACCEPTED_DRIVER
    await run('admin_client', LATE_NOW)
    await drain()
    expect(sentTo(CLIENT_EMAIL)).toHaveLength(0)
    expect(sentTo(DRIVER_EMAIL)).toHaveLength(1)
  })
})

// ── The driver ─────────────────────────────────────────────────────────────────────────────────────────────────────

describe('the assigned driver (D-03, T-89-29)', () => {
  it('gets one plain email at once: reference, pickup time and the trip link; no amount, no client contact data', async () => {
    world.assignments = ACCEPTED_DRIVER
    await run('admin_client', LATE_NOW)
    await drain()

    const mails = sentTo(DRIVER_EMAIL)
    expect(mails).toHaveLength(1)
    const mail = mails[0]
    expect(mail.subject).toBe('Trip cancelled — PRG-20261210-NOTE01')
    expect(mail.html).toContain('The client cancelled this trip. You do not need to go.')
    expect(mail.html).toContain('PRG-20261210-NOTE01')
    expect(mail.html).toContain('13:00')
    expect(mail.html).toContain('https://rideprestigo.com/driver/trip/tok-1234')
    // T-89-29: nothing about the money and nothing that identifies or reaches the client.
    expect(mail.html).not.toContain(CLIENT_EMAIL)
    expect(mail.html).not.toContain('+420777111222')
    expect(mail.html).not.toContain('Anna')
    expect(mail.html).not.toContain('Ivanova')
    expect(mail.html).not.toMatch(/€|EUR|CZK|Kč|\bfee\b|amount/i)
    expect(mail.replyTo).toBeUndefined()
  })

  it('cancelled by Prestigo: the first sentence says so', async () => {
    world.assignments = ACCEPTED_DRIVER
    await run('admin_prestigo', LATE_NOW)
    await drain()
    expect(sentTo(DRIVER_EMAIL)[0].html).toContain('Prestigo cancelled this trip. You do not need to go.')
  })

  it('no assigned driver: no driver mail', async () => {
    world.assignments = []
    await run('admin_client', LATE_NOW)
    await drain()
    const others = mockResendSend.mock.calls.map((c) => (c[0] as Sent).to[0]).filter((to) => to !== CLIENT_EMAIL)
    expect(others).toEqual([])
  })

  it('a driver who only has a pending offer gets none', async () => {
    world.assignments = [{ status: 'pending', trip_token: 'tok-x', drivers: { name: 'P', email: DRIVER_EMAIL, vehicle_info: '' } }]
    await run('admin_client', LATE_NOW)
    await drain()
    expect(sentTo(DRIVER_EMAIL)).toHaveLength(0)
  })

  it('is told even when the money step failed: the trip is cancelled all the same', async () => {
    seed({ payment_mode: 'pay_now', payment_state: 'none', payment_currency: null, payment_amount_minor: null, amount_eur: 100, payment_intent_id: 'pi_missing' })
    world.assignments = ACCEPTED_DRIVER
    vi.setSystemTime(FREE_NOW)
    const result = await run('admin_prestigo', FREE_NOW)
    expect(result.kind).toBe('money_failed')
    await drain()
    expect(sentTo(DRIVER_EMAIL)).toHaveLength(1)
    expect(sentTo(CLIENT_EMAIL)).toHaveLength(0)
  })

  it('a lookup that fails or a send that fails never changes the cancel result', async () => {
    world.assignmentsError = true
    const result = await run('admin_client', LATE_NOW)
    expect(result).toMatchObject({ kind: 'ok', money: 'kept' })
    await drain()
    expect(row().status).toBe('cancelled')

    seed()
    world.assignmentsError = false
    world.assignments = ACCEPTED_DRIVER
    mockResendSend.mockRejectedValue(new Error('resend down'))
    const again = await run('admin_client', LATE_NOW)
    expect(again).toMatchObject({ kind: 'ok', money: 'kept' })
    await expect(drain()).resolves.toBeUndefined()
    expect(row().status).toBe('cancelled')
  })
})

// ── The operator ───────────────────────────────────────────────────────────────────────────────────────────────────

describe('the operator (UI-SPEC 8.3)', () => {
  it('a late cancel: one fee_decision_needed alert with the facts of the case', async () => {
    await run('admin_client', LATE_NOW)
    await drain()
    const calls = mockAlert.mock.calls.filter((c) => c[0] === 'fee_decision_needed')
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({ id: ID, booking_reference: 'PRG-20261210-NOTE01' })
    expect(calls[0][2]).toMatchObject({
      eventKey: `alert:fee_decision_needed:${ID}`,
      proposedMinor: 5000,
      cancelledAt: new Date(LATE_NOW).toISOString(),
    })
    expect(calls[0][2].freeUntil).toEqual(expect.any(String))
    expect(calls[0][2].note).toBeUndefined()
    expect(mockAlert.mock.calls.filter((c) => c[0] === 'client_cancelled')).toHaveLength(0)
  })

  it('a client in-time self-cancel: one client_cancelled alert, no fee alert', async () => {
    vi.setSystemTime(FREE_NOW)
    const result = await run('client_token', FREE_NOW, { acknowledge: 'free' })
    expect(result).toMatchObject({ kind: 'ok', outcome: 'free' })
    await drain()
    const calls = mockAlert.mock.calls.filter((c) => c[0] === 'client_cancelled')
    expect(calls).toHaveLength(1)
    expect(calls[0][2]).toMatchObject({ eventKey: `alert:client_cancelled:${ID}`, moneyOutcome: 'released' })
    expect(mockAlert.mock.calls.filter((c) => c[0] === 'fee_decision_needed')).toHaveLength(0)
  })

  it('an operator cancelling in time alerts nobody (they just did it)', async () => {
    vi.setSystemTime(FREE_NOW)
    await run('admin_client', FREE_NOW)
    await drain()
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('a refused cancel (too late for a client) sends nothing at all', async () => {
    world.assignments = ACCEPTED_DRIVER
    const result = await run('client_token', PICKUP + HOUR, { acknowledge: 'free' })
    expect(result.kind).toBe('too_late')
    await drain()
    expect(mockResendSend).not.toHaveBeenCalled()
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('the orphan: a late cancel whose fee case could not be opened still reaches the operator', async () => {
    world.openFeeCaseFails = true
    world.assignments = ACCEPTED_DRIVER
    const result = await run('admin_client', LATE_NOW)
    expect(result).toEqual({ kind: 'db_failed', cancelled: true })
    expect(row().status).toBe('cancelled')
    await drain()
    const calls = mockAlert.mock.calls.filter((c) => c[0] === 'fee_decision_needed')
    expect(calls).toHaveLength(1)
    expect(calls[0][2]).toMatchObject({ eventKey: `alert:fee_decision_needed:${ID}:case_missing`, note: 'case_missing' })
    // The client and the driver are told as for any other late cancel.
    expect(sentTo(CLIENT_EMAIL)).toHaveLength(1)
    expect(sentTo(DRIVER_EMAIL)).toHaveLength(1)
  })

  it('an alert sender that throws never changes the result', async () => {
    mockAlert.mockRejectedValue(new Error('boom'))
    const result = await run('admin_client', LATE_NOW)
    expect(result).toMatchObject({ kind: 'ok', money: 'kept' })
    await expect(drain()).resolves.toBeUndefined()
    expect(row().status).toBe('cancelled')
  })
})
