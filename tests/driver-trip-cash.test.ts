// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 89 plan 89-14 (CASH-04, D-11, D-12, D-21, D-22): the driver's cash step on the server.
 *
 * Route group: the real progress route, the real driver-trip-step module, the real settleCash and the real payment
 * transition on the payments fake (only Supabase, the rate limit and Stripe are doubles).
 * Page group: what the trip page hands to the screens (a label or nothing), asserted on the returned element tree.
 */

const { world, stubAssignments, mockCheckRateLimit, mockDeactivateLink, getNoShowViewMock, getStartGateMock, mockAlert, mockSendEmail } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
  },
  stubAssignments: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockDeactivateLink: vi.fn(),
  getNoShowViewMock: vi.fn(),
  getStartGateMock: vi.fn(),
  mockAlert: vi.fn(),
  mockSendEmail: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { void fn } }
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => (table === 'driver_assignments' ? stubAssignments(table) : world.db!.client.from(table)),
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/alerts', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/alerts')>()),
  sendPaymentOperatorAlert: mockAlert,
}))
vi.mock('@/lib/payments/emails/send', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/emails/send')>()),
  sendPaymentEmail: mockSendEmail,
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit, getClientIp: () => '127.0.0.1' }))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: mockDeactivateLink }))
vi.mock('@/lib/start-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/start-gate')>()),
  getStartGate: getStartGateMock,
}))
vi.mock('@/lib/no-show', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/no-show')>()),
  getNoShowView: getNoShowViewMock,
}))
// The page returns an element; the screens are markers so the props can be read without rendering.
vi.mock('@/app/(internal)/driver/trip/[token]/TripScreen', () => ({ default: function TripScreen() { return null } }))
vi.mock('@/app/(internal)/driver/trip/[token]/TripCompleted', () => ({ default: function TripCompleted() { return null } }))
vi.mock('@/app/(internal)/driver/trip/[token]/InvalidTripLinkView', () => ({ default: function InvalidTripLinkView() { return null } }))

import { POST } from '@/app/api/driver/trip/[token]/progress/route'
import TripSheetPage from '@/app/(internal)/driver/trip/[token]/page'
import TripScreen from '@/app/(internal)/driver/trip/[token]/TripScreen'
import TripCompleted from '@/app/(internal)/driver/trip/[token]/TripCompleted'
import InvalidTripLinkView from '@/app/(internal)/driver/trip/[token]/InvalidTripLinkView'
import { buildDriverCash, driverTripRequestSchema } from '@/lib/driver-trip-step'
import { reopenCash } from '@/lib/payments/cash'
import { formatMinor } from '@/lib/payments/money'

const TOKEN = 'a0000004-0000-4000-8000-000000000004'
const DRIVER_ID = 'a0000002-0000-4000-8000-000000000002'
const OTHER_DRIVER = 'a0000009-0000-4000-8000-000000000009'
const BOOKING_ID = 'b0000001-0000-4000-8000-000000000001'

let db: FakePaymentsDb
let assignmentOverrides: { driverId?: string; status?: string | null } = {}

function seed(over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({
    bookings: [
      {
        id: BOOKING_ID,
        status: 'completed',
        completed_at: '2026-11-12T13:30:00Z',
        booking_source: 'web',
        driver_id: DRIVER_ID,
        payment_mode: 'cash_guarantee',
        payment_state: 'card_saved',
        payment_currency: 'eur',
        payment_amount_minor: 8000,
        stripe_payment_method_id: 'pm_ok',
        ...over,
      },
    ],
  })
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === BOOKING_ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === BOOKING_ID && (kind ? e.kind === kind : true))

/** The assignment lookup reads the live booking row, like the real join does on every request. */
function assignmentRow() {
  const b = row()
  return {
    id: 'assign-1',
    driver_id: assignmentOverrides.driverId ?? DRIVER_ID,
    status: assignmentOverrides.status === undefined ? 'accepted' : assignmentOverrides.status,
    bookings: {
      id: b.id,
      status: b.status,
      driver_id: b.driver_id,
      booking_source: b.booking_source,
      amount_eur: 120,
      pickup_utc: '2026-11-12T13:30:00Z',
      pickup_date: '2026-11-12',
      pickup_time: '14:30',
      origin_lat: 50.087,
      origin_lng: 14.421,
      origin_address: 'Old Town Square',
      completed_at: b.completed_at ?? null,
      no_show_requested_at: null,
      payment_mode: b.payment_mode,
      payment_state: b.payment_state,
      recovery_link_id: b.recovery_link_id ?? null,
    },
  }
}

function call(body: unknown, token = TOKEN) {
  return POST(
    new Request(`http://localhost/api/driver/trip/${token}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  assignmentOverrides = {}
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, limit: 20 })
  mockDeactivateLink.mockResolvedValue(undefined)
  mockAlert.mockResolvedValue('sent')
  mockSendEmail.mockResolvedValue('sent')
  getStartGateMock.mockResolvedValue({ unlocksAtMs: 0, open: true })
  getNoShowViewMock.mockResolvedValue({ noShowAvailableAt: null, noShowRequestedAt: null })
  stubAssignments.mockImplementation(() => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: assignmentRow(), error: null }) }) }),
  }))
  seed()
})

describe('confirm_cash through the progress route (tracer: route -> settleCash -> cash_settled)', () => {
  it('settles a completed cash booking in card_saved with the driver_trip system actor', async () => {
    const res = await call({ action: 'confirm_cash' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, status: 'completed', nextStep: null, cash: 'settled' })
    expect(row().payment_state).toBe('cash_settled')
    expect(ledger('cash_settled')).toEqual([
      expect.objectContaining({ event_key: `cash_settled:${BOOKING_ID}:0`, actor_type: 'system', actor_id: 'driver_trip' }),
    ])
  })

  it('settles a booking whose card failed during the trip (the client paid the driver)', async () => {
    seed({ payment_state: 'failed', last_payment_error: 'card_declined', payment_failed_at: '2026-11-12T13:00:00Z' })
    const res = await call({ action: 'confirm_cash' })
    expect(res.status).toBe(200)
    expect(row()).toMatchObject({ payment_state: 'cash_settled', last_payment_error: null, payment_failed_at: null })
  })

  it('a replay answers 200 with replay and writes nothing more', async () => {
    expect((await call({ action: 'confirm_cash' })).status).toBe(200)
    const again = await call({ action: 'confirm_cash' })
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ ok: true, status: 'completed', nextStep: null, cash: 'settled', replay: true })
    expect(ledger('cash_settled')).toHaveLength(1)
  })

  it.each(['assigned', 'en_route', 'on_location', 'on_board', 'cancelled'])('a %s booking answers 422 and writes nothing (completed only)', async (status) => {
    seed({ status })
    const res = await call({ action: 'confirm_cash' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ ok: false, error: 'cash_not_allowed' })
    expect(row().payment_state).toBe('card_saved')
    expect(ledger()).toHaveLength(0)
  })

  it.each([
    ['pay_now', 'captured'],
    ['card_hold', 'authorized'],
  ])('a %s booking in %s answers 422 and writes nothing', async (mode, state) => {
    seed({ payment_mode: mode, payment_state: state })
    const res = await call({ action: 'confirm_cash' })
    expect(res.status).toBe(422)
    expect(row().payment_state).toBe(state)
    expect(ledger()).toHaveLength(0)
  })

  it('a cash booking in a state that is not payable by cash (charged) answers 422', async () => {
    seed({ payment_state: 'captured' })
    expect((await call({ action: 'confirm_cash' })).status).toBe(422)
    expect(ledger()).toHaveLength(0)
  })

  describe('money CR-05: while a card charge is on the row', () => {
    const useStripe = (): FakeStripe => {
      const fake = createFakeStripe()
      world.stripe = fake.stripe
      return fake
    }

    it('a live charge answers a clear wait and writes nothing', async () => {
      useStripe()
      seed({ payment_state: 'capturing', payment_lease_until: new Date(Date.now() + 300_000).toISOString() })
      const res = await call({ action: 'confirm_cash' })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ ok: false, error: 'cash_wait' })
      expect(db.state.bookings[0].payment_state).toBe('capturing')
    })

    it('a dead charge with no payment at Stripe does not stop the driver: the cash is settled', async () => {
      const fake = useStripe()
      seed({ payment_state: 'capturing', payment_lease_until: new Date(Date.now() - 1000).toISOString(), stripe_customer_id: 'cus_1' })
      const res = await call({ action: 'confirm_cash' })
      expect(res.status).toBe(200)
      expect(db.state.bookings[0].payment_state).toBe('cash_settled')
      expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    })

    it('the card did go through: the cash is not recorded on top of it', async () => {
      const fake = useStripe()
      seed({ payment_state: 'capturing', payment_lease_until: new Date(Date.now() - 1000).toISOString(), stripe_customer_id: 'cus_1', charge_attempts: 0 })
      await fake.stripe.paymentIntents.create({
        amount: 12000,
        currency: 'eur',
        customer: 'cus_1',
        payment_method: 'pm_ok',
        off_session: true,
        confirm: true,
        metadata: { kind: 'card_charge', cofBookingId: BOOKING_ID, attempt: '0' },
      })
      const res = await call({ action: 'confirm_cash' })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: 'cash_conflict' })
      expect(db.state.bookings[0].payment_state).toBe('captured')
    })

    it('money review 2, CR-01: the card that went through is announced like the webhook does: operator alert and client receipt', async () => {
      const fake = useStripe()
      seed({ payment_state: 'capturing', payment_lease_until: new Date(Date.now() - 1000).toISOString(), stripe_customer_id: 'cus_1', charge_attempts: 0 })
      const pi = (await fake.stripe.paymentIntents.create({
        amount: 8000,
        currency: 'eur',
        customer: 'cus_1',
        payment_method: 'pm_ok',
        off_session: true,
        confirm: true,
        metadata: { kind: 'card_charge', cofBookingId: BOOKING_ID, attempt: '0' },
      })) as { id: string }
      expect((await call({ action: 'confirm_cash' })).status).toBe(409)
      expect(mockAlert).toHaveBeenCalledTimes(1)
      expect(mockAlert.mock.calls[0][0]).toBe('duplicate_payment')
      expect(mockAlert.mock.calls[0][2]).toMatchObject({
        eventKey: `alert:cash_card_late:${BOOKING_ID}:${pi.id}`,
        code: 'cash_card',
        note: 'adopted',
        amountMinor: 8000,
      })
      expect(mockSendEmail.mock.calls.map((c) => c[0].kind)).toEqual(['fee_charged'])
    })

    it('the amount stays on the screen while the row is capturing', () => {
      expect(buildDriverCash({ payment_mode: 'cash_guarantee', payment_state: 'capturing', payment_amount_minor: 12000, payment_currency: 'eur' })).toMatchObject({ state: 'due' })
    })
  })

  it('a partner booking is refused (Pitfall 15)', async () => {
    seed({ booking_source: 'gnet' })
    expect((await call({ action: 'confirm_cash' })).status).toBe(422)
    expect(row().payment_state).toBe('card_saved')
    expect(ledger()).toHaveLength(0)
  })

  it('a reassigned or declined link is the uniform invalid_token and writes nothing', async () => {
    assignmentOverrides = { driverId: OTHER_DRIVER }
    expect((await call({ action: 'confirm_cash' })).status).toBe(400)
    assignmentOverrides = { status: 'declined' }
    expect((await call({ action: 'confirm_cash' })).status).toBe(400)
    expect(ledger()).toHaveLength(0)
  })

  it('the operator reversal (D-22) lets the driver confirm again: three ledger rows, three keys', async () => {
    expect((await call({ action: 'confirm_cash' })).status).toBe(200)
    expect(await reopenCash({ ...row() }, { type: 'admin', id: 'admin-1' }, 'Driver tapped by mistake')).toBe('reopened')
    expect(row().payment_state).toBe('card_saved')
    expect(buildDriverCash({ ...row() })).toMatchObject({ state: 'due' })
    expect((await call({ action: 'confirm_cash' })).status).toBe(200)
    expect(ledger().map((e) => e.event_key)).toEqual([
      `cash_settled:${BOOKING_ID}:0`,
      `cash_reopened:${BOOKING_ID}:1`,
      `cash_settled:${BOOKING_ID}:1`,
    ])
  })

  it('request_no_show still reaches the no-show module (conflict outside on_location)', async () => {
    seed({ status: 'on_board', payment_state: 'card_saved' })
    const res = await call({ action: 'request_no_show' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ ok: false, error: 'step_conflict' })
  })
})

describe('the driver can never send an amount (T-89-48)', () => {
  it('confirm_cash with an amount is a 400 and nothing is written', async () => {
    const res = await call({ action: 'confirm_cash', amount: 10 })
    expect(res.status).toBe(400)
    expect(row().payment_state).toBe('card_saved')
    expect(ledger()).toHaveLength(0)
  })

  it('a step with an amount is a 400', async () => {
    expect((await call({ step: 'en_route', amount: 10 })).status).toBe(400)
  })

  it('there is no "did not pay" action (D-21)', () => {
    for (const action of ['cash_not_received', 'passenger_did_not_pay', 'report_unpaid']) {
      expect(driverTripRequestSchema.safeParse({ action }).success).toBe(false)
    }
    expect(driverTripRequestSchema.safeParse({ action: 'confirm_cash' }).success).toBe(true)
  })

  it('settleCash is called without an amount: the request carries none and the ledger holds none', async () => {
    await call({ action: 'confirm_cash' })
    expect(ledger('cash_settled')[0]).toMatchObject({ amount_minor: null, currency: null })
  })
})

describe('buildDriverCash (the scoped amount, D-11 / D-12)', () => {
  const base = { payment_mode: 'cash_guarantee', payment_amount_minor: 8000, payment_currency: 'eur', booking_source: 'web' }

  it('card_saved and failed are due, cash_settled is settled; the label is the booking money in its own currency', () => {
    expect(buildDriverCash({ ...base, payment_state: 'card_saved' })).toEqual({ amountLabel: formatMinor(8000, 'eur'), state: 'due' })
    expect(buildDriverCash({ ...base, payment_state: 'failed' })).toMatchObject({ state: 'due' })
    expect(buildDriverCash({ ...base, payment_state: 'cash_settled' })).toMatchObject({ state: 'settled' })
    expect(buildDriverCash({ ...base, payment_state: 'card_saved', payment_amount_minor: 250000, payment_currency: 'czk' })).toEqual({
      amountLabel: formatMinor(250000, 'czk'),
      state: 'due',
    })
  })

  it('returns only strings: the browser never gets a number', () => {
    const cash = buildDriverCash({ ...base, payment_state: 'card_saved' })!
    expect(Object.values(cash).every((v) => typeof v === 'string')).toBe(true)
  })

  it.each(['none', 'authorized', 'captured', 'released', 'refunded'])('is null for a cash booking in %s', (state) => {
    expect(buildDriverCash({ ...base, payment_state: state })).toBeNull()
  })

  it('is null for every other mode, partner bookings and unusable money', () => {
    expect(buildDriverCash({ ...base, payment_mode: 'pay_now', payment_state: 'captured' })).toBeNull()
    expect(buildDriverCash({ ...base, payment_mode: 'card_hold', payment_state: 'card_saved' })).toBeNull()
    expect(buildDriverCash({ ...base, payment_state: 'card_saved', booking_source: 'gnet' })).toBeNull()
    expect(buildDriverCash({ ...base, payment_state: 'card_saved', payment_amount_minor: null })).toBeNull()
    expect(buildDriverCash({ ...base, payment_state: 'card_saved', payment_amount_minor: 0 })).toBeNull()
    expect(buildDriverCash({ ...base, payment_state: 'card_saved', payment_currency: 'usd' })).toBeNull()
    expect(buildDriverCash({})).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The trip page
// ---------------------------------------------------------------------------------------------------------------------

function pageRow(over: Record<string, unknown> = {}, assignment: Record<string, unknown> = {}) {
  return {
    id: 'assign-1',
    driver_id: DRIVER_ID,
    status: 'accepted',
    trip_note: null,
    bookings: {
      id: BOOKING_ID,
      booking_reference: 'PRG-100',
      booking_source: null,
      pickup_utc: null,
      pickup_date: '2026-09-01',
      pickup_time: '10:00',
      origin_address: 'Prague Airport',
      destination_address: 'Wenceslas Square',
      origin_lat: 50.1,
      origin_lng: 14.26,
      destination_lat: 50.08,
      destination_lng: 14.42,
      client_first_name: 'Alice',
      client_last_name: 'Smith',
      client_phone: '+420123456789',
      flight_number: null,
      flight_iata: null,
      special_requests: null,
      vehicle_class: 'business',
      distance_km: 12.4,
      completed_at: null,
      no_show_requested_at: null,
      status: 'on_board',
      driver_id: DRIVER_ID,
      ...over,
    },
    drivers: { name: 'John Driver', vehicle_info: 'Black Mercedes E-Class' },
    ...assignment,
  }
}

async function renderPage(data: unknown) {
  const select = vi.fn()
  stubAssignments.mockImplementation(() => ({
    select: (cols: string) => {
      select(cols)
      return { eq: () => ({ single: async () => ({ data, error: null }) }) }
    },
  }))
  const element = (await TripSheetPage({ params: Promise.resolve({ token: TOKEN }) })) as {
    type: unknown
    props: Record<string, unknown>
  }
  return { element, select }
}

const CASH_ROW = { payment_mode: 'cash_guarantee', payment_state: 'card_saved', payment_amount_minor: 8000, payment_currency: 'eur' }

describe('trip page: what the screens receive', () => {
  it('a non-cash trip gets exactly the Phase 87 props (no cash key, no amount)', async () => {
    const { element, select } = await renderPage(pageRow({ payment_mode: 'pay_now', payment_state: 'captured', payment_amount_minor: 9900, payment_currency: 'eur' }))
    expect(element.type).toBe(TripScreen)
    expect(Object.keys(element.props).sort()).toEqual(['initialNote', 'noShow', 'token', 'trip', 'view'])
    expect(JSON.stringify(element.props)).not.toMatch(/9900|payment_|amount/)
    expect(String(select.mock.calls[0][0])).not.toMatch(/amount_eur|price/i)
  })

  it('a booking row without any payment column (older fixtures) is a non-cash trip', async () => {
    const { element } = await renderPage(pageRow())
    expect(Object.keys(element.props)).not.toContain('cash')
  })

  it('a cash trip in card_saved gets { amountLabel, state: due } and nothing numeric', async () => {
    const { element } = await renderPage(pageRow(CASH_ROW))
    expect(element.type).toBe(TripScreen)
    expect(element.props.cash).toEqual({ amountLabel: formatMinor(8000, 'eur'), state: 'due' })
    expect(JSON.stringify(element.props)).not.toMatch(/payment_|[:,[]8000[,}\]]/)
    expect(Object.keys(element.props.cash as object).sort()).toEqual(['amountLabel', 'state'])
  })

  it('a cash trip whose card failed counts as unsettled', async () => {
    const { element } = await renderPage(pageRow({ ...CASH_ROW, payment_state: 'failed', payment_amount_minor: 250000, payment_currency: 'czk' }))
    expect(element.props.cash).toEqual({ amountLabel: formatMinor(250000, 'czk'), state: 'due' })
  })

  it('the select asks for the four payment columns and still not for amount_eur', async () => {
    const { select } = await renderPage(pageRow(CASH_ROW))
    const cols = String(select.mock.calls[0][0])
    for (const c of ['payment_mode', 'payment_state', 'payment_amount_minor', 'payment_currency']) expect(cols).toContain(c)
    expect(cols).not.toContain('amount_eur')
  })

  it('the re-opened completed screen gets the token and the due cash', async () => {
    const { element } = await renderPage(pageRow({ ...CASH_ROW, status: 'completed' }))
    expect(element.type).toBe(TripCompleted)
    expect(element.props).toMatchObject({ variant: 'reopened', token: TOKEN, cash: { amountLabel: formatMinor(8000, 'eur'), state: 'due' } })
  })

  it('after the operator reversal (D-22) the reloaded screen is due again, after a confirmation it is settled', async () => {
    const settled = await renderPage(pageRow({ ...CASH_ROW, status: 'completed', payment_state: 'cash_settled' }))
    expect(settled.element.props.cash).toMatchObject({ state: 'settled' })
    const reopened = await renderPage(pageRow({ ...CASH_ROW, status: 'completed', payment_state: 'card_saved' }))
    expect(reopened.element.props.cash).toMatchObject({ state: 'due' })
  })

  it('a completed non-cash trip keeps the Phase 87 re-opened props', async () => {
    const { element } = await renderPage(pageRow({ status: 'completed', payment_mode: 'pay_now', payment_state: 'captured', payment_amount_minor: 9900, payment_currency: 'eur' }))
    expect(element.type).toBe(TripCompleted)
    expect(element.props).toEqual({ variant: 'reopened' })
  })

  it('a cash booking in a state without payable cash shows nothing', async () => {
    const { element } = await renderPage(pageRow({ ...CASH_ROW, payment_state: 'captured' }))
    expect(Object.keys(element.props)).not.toContain('cash')
  })
})

describe('trip page: the cancelled line (UI-SPEC 6.3)', () => {
  it('a cancelled trip on the current driver link carries the reference only', async () => {
    const { element } = await renderPage(pageRow({ status: 'cancelled' }))
    expect(element.type).toBe(InvalidTripLinkView)
    expect(element.props).toEqual({ cancelledReference: 'PRG-100' })
  })

  it('a cancelled trip on a reassigned link keeps the uniform view', async () => {
    const { element } = await renderPage(pageRow({ status: 'cancelled', driver_id: OTHER_DRIVER }))
    expect(element.type).toBe(InvalidTripLinkView)
    expect(element.props).toEqual({})
  })

  it('a declined assignment, a no_show booking and an unknown token keep the uniform view', async () => {
    expect((await renderPage(pageRow({ status: 'cancelled' }, { status: 'declined' }))).element.props).toEqual({})
    expect((await renderPage(pageRow({ status: 'no_show' }))).element.props).toEqual({})
    expect((await renderPage(null)).element.props).toEqual({})
  })
})
