// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 89 plan 89-09 (CASH-02, CASH-03, D-13, WR-04, Pitfall 15), the tracer: the operator confirms a real driver
 * request through the route, assertNoShowConfirmable and openFeeCase to a pending case with its evidence. The money
 * side is only observed: the hold stays authorized, settleBooking is never called, nothing reaches Stripe.
 */

const { world, mockGetAdminUser, mockAlert, mockSettle } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> }; state: { bookings: Array<Record<string, unknown>>; booking_fee_cases: Array<Record<string, unknown>> } },
    log: [] as Array<Record<string, unknown>>,
    stripe: null as unknown,
  },
  mockGetAdminUser: vi.fn(),
  mockAlert: vi.fn(),
  mockSettle: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { void Promise.resolve().then(fn) } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/request-guards', () => ({ enforceMaxBody: () => null }))
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: mockAlert }))
vi.mock('@/lib/payments/settle', () => ({ settleBooking: mockSettle }))
vi.mock('@/lib/payments/stripe', async importActual => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/emails/send', () => ({ sendPaymentEmail: vi.fn(), bookingEmailDataFromRow: (r: unknown) => r }))

/** booking_status_log is not modelled by the payments fake: a tiny filter-order-limit stub over world.log. */
function logQuery() {
  const filters: Array<[string, unknown]> = []
  let desc = false
  let max = Infinity
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = (col: string, val: unknown) => { filters.push([col, val]); return q }
  q.order = (_col: string, opts?: { ascending?: boolean }) => { desc = opts?.ascending === false; return q }
  q.limit = (n: number) => { max = n; return q }
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    let rows = world.log.filter(r => filters.every(([c, v]) => r[c] === v))
    rows = [...rows].sort((a, b) => (desc ? -1 : 1) * String(a.created_at).localeCompare(String(b.created_at)))
    return Promise.resolve({ data: rows.slice(0, max), error: null }).then(res, rej)
  }
  return q
}

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => (table === 'booking_status_log' ? logQuery() : world.db!.client.from(table)),
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))

// The status service is its own contract (tests/booking-status-service*.test.ts): here it only flips the stored status.
vi.mock('@/lib/booking-status-service', async importActual => ({
  ...(await importActual<typeof import('@/lib/booking-status-service')>()),
  advanceBookingStatus: vi.fn(async (input: { bookingId: string; to: string; expectedFrom?: string }) => {
    const row = world.db!.state.bookings.find(b => b.id === input.bookingId)
    if (!row) return { ok: false, code: 'not_found', message: 'Booking not found' }
    if (input.expectedFrom !== undefined && input.expectedFrom !== row.status) {
      return { ok: false, code: 'conflict', message: 'status_conflict', currentStatus: row.status }
    }
    const previous = row.status
    row.status = input.to
    return { ok: true, applied: true, previous, current: input.to, booking: { ...row } }
  }),
}))

import { POST } from '@/app/api/admin/bookings/[id]/no-show/route'
import { advanceBookingStatus } from '@/lib/booking-status-service'

const ID = '88888888-8888-4888-8888-888888888888'
const DRIVER = 'a0000002-0000-4000-8000-000000000002'
const NOW = Date.parse('2026-11-12T15:00:00.000Z')
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString()

let db: FakePaymentsDb
let fake: FakeStripe

function seed(over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({
    nowMs: NOW,
    bookings: [
      {
        id: ID,
        status: 'on_location',
        booking_source: 'web',
        payment_mode: 'card_hold',
        payment_state: 'authorized',
        booking_reference: 'PRG-20261112-NS0001',
        client_email: 'anna@example.com',
        locale: 'en',
        pickup_date: '2026-11-12',
        pickup_time: '15:00',
        pickup_utc: iso(-120),
        origin_lat: null,
        origin_lng: null,
        origin_address: 'Wenceslas Square 1, Prague',
        payment_currency: 'eur',
        payment_amount_minor: 12000,
        stripe_customer_id: 'cus_1',
        stripe_payment_method_id: 'pm_ok',
        hold_payment_intent_id: 'pi_hold',
        driver_id: DRIVER,
        no_show_requested_at: iso(-30),
        ...over,
      },
    ],
  })
  world.db = db as unknown as typeof world.db
  world.log = [
    { booking_id: ID, event: 'status_change', from_status: 'en_route', to_status: 'on_location', actor_type: 'driver', actor_id: DRIVER, created_at: iso(-115) },
    { booking_id: ID, event: 'no_show_requested', from_status: 'on_location', to_status: 'on_location', actor_type: 'driver', actor_id: DRIVER, created_at: iso(-30) },
  ]
}

function confirm(body: Record<string, unknown> = { action: 'confirm', expected_status: 'on_location' }) {
  return POST(
    new Request(`http://localhost/api/admin/bookings/${ID}/no-show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) },
  )
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const booking = () => db.state.bookings.find(b => b.id === ID)!

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockGetAdminUser.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
  mockAlert.mockResolvedValue('sent')
  fake = createFakeStripe()
  world.stripe = fake.stripe
  seed()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('tracer: operator confirm of a real driver request', () => {
  it('opens a pending no_show case with the evidence snapshot and charges nothing', async () => {
    const res = await confirm()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, status: 'no_show' })
    await flush()

    expect(booking().status).toBe('no_show')
    expect(db.state.booking_fee_cases).toHaveLength(1)
    const c = db.state.booking_fee_cases[0]
    expect(c).toMatchObject({
      booking_id: ID,
      kind: 'no_show',
      status: 'pending',
      currency: 'eur',
      base_minor: 12000,
      proposed_minor: 12000,
      decided_minor: null,
      charge_requested_at: null,
      opened_by: 'admin-1',
    })
    expect(c.evidence).toEqual({
      pickup_utc: iso(-120),
      on_location_at: iso(-115),
      requested_at: iso(-30),
      threshold_min: 30,
      airport: false,
      confirmed_at: iso(0),
      driver_id: DRIVER,
    })

    // The hold stays what it was and nothing was collected.
    expect(booking().payment_state).toBe('authorized')
    expect(booking().hold_payment_intent_id).toBe('pi_hold')
    expect(mockSettle).not.toHaveBeenCalled()

    // The case is on the ledger once; the operator alert goes out once, keyed by the case.
    const opened = db.state.booking_payment_events.filter(e => e.kind === 'fee_opened')
    expect(opened).toHaveLength(1)
    expect(mockAlert).toHaveBeenCalledTimes(1)
    expect(mockAlert).toHaveBeenCalledWith(
      'fee_no_show_needed',
      expect.objectContaining({ id: ID }),
      expect.objectContaining({
        eventKey: `alert:fee_no_show_needed:${c.id}`,
        proposedMinor: 12000,
        arrivedAt: iso(-115),
        requestedAt: iso(-30),
        thresholdMin: 30,
      }),
    )
  })

  it('stores the airport wait and flag when the pickup is at the airport', async () => {
    seed({ origin_address: 'Václav Havel Airport Prague, Terminal 2', pickup_utc: iso(-180), no_show_requested_at: iso(-30) })
    const res = await confirm()
    expect(res.status).toBe(200)
    expect(db.state.booking_fee_cases[0].evidence).toMatchObject({ airport: true, threshold_min: 60 })
  })

  it('a replay of the confirm changes nothing: no second case, no second alert', async () => {
    expect((await confirm()).status).toBe(200)
    await flush()
    const second = await confirm()
    expect(second.status).toBe(409)
    await flush()
    expect(db.state.booking_fee_cases).toHaveLength(1)
    expect(mockAlert).toHaveBeenCalledTimes(1)
  })
})

describe('refusals write nothing', () => {
  it('422 no_request: the driver never asked', async () => {
    seed({ no_show_requested_at: null })
    const res = await confirm()
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'no_request' })
    expect(booking().status).toBe('on_location')
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(advanceBookingStatus).not.toHaveBeenCalled()
  })

  it('422 not_on_location: a booking that already boarded and was completed', async () => {
    seed({ status: 'completed' })
    const res = await confirm({ action: 'confirm' })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'not_on_location' })
    expect(db.state.booking_fee_cases).toHaveLength(0)
  })

  it('409 wait_not_elapsed: the live threshold was raised after the request', async () => {
    // Pickup 2 h ago, arrival 115 min ago; a wait of 240 minutes would end 2 h from the pickup. Raise the city wait.
    Object.assign(db.state.pricing_globals[0], { noshow_wait_city_min: 180, noshow_wait_airport_min: 240 })
    const res = await confirm()
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('wait_not_elapsed')
    expect(booking().status).toBe('on_location')
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(mockAlert).not.toHaveBeenCalled()
  })
})

describe('bookings that get a status and no case', () => {
  it('a partner booking becomes no_show with no case and no alert (Pitfall 15)', async () => {
    seed({ booking_source: 'gnet', payment_mode: 'partner', payment_state: 'none' })
    const res = await confirm()
    expect(res.status).toBe(200)
    await flush()
    expect(booking().status).toBe('no_show')
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('a booking with no card and no money becomes no_show with no case', async () => {
    seed({ payment_mode: 'cash', payment_state: 'none', hold_payment_intent_id: null, stripe_payment_method_id: null, payment_amount_minor: null })
    const res = await confirm()
    expect(res.status).toBe(200)
    await flush()
    expect(booking().status).toBe('no_show')
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('money IN-04: a card charge is running on the row: the no-show waits, as a cancel does', async () => {
    seed({ payment_mode: 'cash_guarantee', payment_state: 'capturing' })
    const res = await confirm()
    expect(res.status).toBe(409)
    expect(booking().status).toBe('on_location')
    expect(db.state.booking_fee_cases).toHaveLength(0)
  })

  it('a case that can not be opened never reverts the status (logged, 200)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    seed({ payment_amount_minor: null })
    const res = await confirm()
    expect(res.status).toBe(200)
    expect(booking().status).toBe('no_show')
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(spy).toHaveBeenCalledWith('[no-show] no fee base, case not opened', { bookingId: ID })
    await flush()
    // Money CR-03: nobody may be left unaware that the decision has no case behind it.
    expect(mockAlert).toHaveBeenCalledWith(
      'fee_no_show_needed',
      expect.objectContaining({ id: ID }),
      expect.objectContaining({ eventKey: `alert:fee_no_show_needed:${ID}:case_missing`, note: 'case_missing' }),
    )
    spy.mockRestore()
  })
})

describe('money CR-03: a no-show on a pay-now round trip is capped by the leg, in the payment currency', () => {
  async function seedPayNowLeg(leg: 'outbound' | 'return', amount: number, currency: 'eur' | 'czk') {
    const pi = (await fake.stripe.paymentIntents.create({
      amount,
      currency,
      payment_method: 'pm_ok',
      off_session: true,
      confirm: true,
      metadata: {},
    })) as { id: string }
    seed({
      payment_mode: 'pay_now',
      payment_state: 'none',
      payment_currency: null,
      payment_amount_minor: null,
      stripe_payment_method_id: null,
      hold_payment_intent_id: null,
      payment_intent_id: pi.id,
      trip_type: 'round_trip',
      leg,
      // The outbound row's amount_eur is the combined total, the return row has none (buildRoundTripBookings).
      amount_eur: leg === 'outbound' ? 300 : null,
      outbound_amount_czk: 4250,
      return_amount_czk: 3250,
    })
    db.state.bookings.push({
      ...booking(),
      id: '99999999-9999-4999-8999-999999999990',
      leg: leg === 'outbound' ? 'return' : 'outbound',
      status: 'confirmed',
    })
    return pi.id
  }

  it('the outbound leg: the 100% cap is its share, not the combined fare', async () => {
    await seedPayNowLeg('outbound', 30000, 'eur')
    expect((await confirm()).status).toBe(200)
    expect(db.state.booking_fee_cases[0]).toMatchObject({ kind: 'no_show', currency: 'eur', base_minor: 17000, proposed_minor: 17000 })
  })

  it('the return leg, whose amount_eur is NULL, gets its case', async () => {
    await seedPayNowLeg('return', 30000, 'eur')
    expect((await confirm()).status).toBe(200)
    expect(db.state.booking_fee_cases[0]).toMatchObject({ base_minor: 13000, proposed_minor: 13000 })
  })

  it('a CZK payment opens the case in CZK and the operator reads CZK', async () => {
    await seedPayNowLeg('outbound', 750000, 'czk')
    expect((await confirm()).status).toBe(200)
    await flush()
    expect(db.state.booking_fee_cases[0]).toMatchObject({ currency: 'czk', base_minor: 425000 })
    expect(mockAlert.mock.calls[0][1]).toMatchObject({ payment_currency: 'czk' })
  })

  it('money WR-02: Stripe can not be read while the case opens: the status stands and the operator is told', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await seedPayNowLeg('outbound', 30000, 'eur')
    fake.failNextWith('paymentIntents.retrieve', 'connection')
    expect((await confirm()).status).toBe(200)
    await flush()
    expect(booking().status).toBe('no_show')
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(mockAlert.mock.calls[0][2]).toMatchObject({ note: 'case_missing' })
    spy.mockRestore()
  })

  it('a leg whose money already went back has nothing to keep: no case, and the operator is told', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pi = await seedPayNowLeg('outbound', 30000, 'eur')
    fake.manualRefund(pi, 30000)
    expect((await confirm()).status).toBe(200)
    await flush()
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(mockAlert.mock.calls[0][0]).toBe('fee_no_show_needed')
    expect(mockAlert.mock.calls[0][2]).toMatchObject({ note: 'case_missing' })
    spy.mockRestore()
  })
})
