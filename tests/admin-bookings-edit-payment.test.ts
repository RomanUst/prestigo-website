import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 88 plan 16 (D-16, D-17, D-18, D-22): the admin trip-edit PATCH keeps a card booking's amount, planned
// hold date and hold PaymentIntent consistent with the saved row, rejects edits while money is in flight, and
// never fails because of Stripe. Drives the real route and the real lib/payments/edit-hook.ts; the single
// payment writer (state.ts), the hold primitives and the recovery link are mocked at their module edge.

const {
  authGetUser,
  supabaseFrom,
  mockApplyTransition,
  mockAppendEvent,
  mockCancelHoldIntent,
  mockRefreshRecoveryLink,
} = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  supabaseFrom: vi.fn(),
  mockApplyTransition: vi.fn(),
  mockAppendEvent: vi.fn(),
  mockCancelHoldIntent: vi.fn(),
  mockRefreshRecoveryLink: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } } }
})

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    const { data: { user }, error } = await authGetUser()
    if (error || !user) return { user: null, error: '401' as const }
    return { user, error: null }
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: supabaseFrom, rpc: vi.fn() })),
}))

// Phase 91 plan 12: a price edit first reads the booking's stops (Pitfall 10). These bookings have none; the stops
// guard itself is tested in tests/admin-bookings.test.ts.
vi.mock('@/lib/booking-stops', () => ({
  loadStopsByBookingIds: vi.fn(async () => new Map()),
  attachStops: vi.fn(async (rows: unknown[]) => rows),
}))

vi.mock('@/lib/currency', () => ({
  czkToEur: vi.fn((czk: number) => Math.round(czk * 0.04)),
  eurToCzk: vi.fn(() => 1500),
}))
vi.mock('@/lib/server-pricing', () => ({ computeOutboundLegTotal: vi.fn(() => 60) }))
vi.mock('@/lib/extras', () => ({ computeExtrasTotal: vi.fn(() => 0) }))
vi.mock('@/lib/email-log', () => ({ logEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/email', () => ({
  sendStatusConfirmedEmail: vi.fn(),
  sendBookingChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentRequestEmail: vi.fn(),
}))
vi.mock('@/lib/stripe-payment-links', () => ({
  createBookingPaymentLink: vi.fn(),
  deactivateBookingPaymentLink: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/payments/state', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments/state')>()
  return { ...actual, applyTransition: mockApplyTransition, appendPaymentEvent: mockAppendEvent }
})
vi.mock('@/lib/payments/hold', () => ({ cancelHoldIntent: mockCancelHoldIntent, voidHoldAttempt: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/payments/recovery', () => ({ refreshRecoveryLink: mockRefreshRecoveryLink }))
vi.mock('@/lib/payments/config', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments/config')>()
  return {
    ...actual,
    getPaymentSettings: vi.fn().mockResolvedValue({ mode: 'canary', leadHours: 72, canaryEmails: [] }),
  }
})

import { PATCH } from '@/app/api/admin/bookings/route'

const ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const NOW = new Date('2026-11-04T10:00:00Z')
const DAY = 24 * 3600 * 1000

function patchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** A confirmed online transfer booked on the card-on-file flow. */
const cardBooking = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID,
  status: 'confirmed',
  booking_source: 'online',
  linked_booking_id: null,
  leg: null,
  payment_intent_id: null,
  trip_type: 'transfer',
  pickup_date: '2026-11-20',
  pickup_time: '12:00',
  return_date: null,
  origin_address: 'Prague Airport Terminal 1',
  destination_address: 'Hotel Four Seasons Prague',
  distance_km: 20,
  vehicle_class: 'business',
  hours: 2,
  is_airport: true,
  amount_czk: 3000,
  amount_eur: 120,
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'jan@example.com',
  client_phone: '+420600123456',
  flight_number: null,
  special_requests: null,
  payment_mode: 'card_hold',
  payment_state: 'authorized',
  payment_currency: 'eur',
  payment_amount_minor: 12000,
  hold_amount_minor: 12000,
  hold_payment_intent_id: 'pi_hold',
  hold_attempts: 0,
  capture_before: new Date(NOW.getTime() + 6 * DAY).toISOString(),
  recovery_link_id: null,
  ...over,
})

let selects: Array<Record<string, unknown> | null>
let updates: Array<Record<string, unknown>>

/** from('bookings'): select -> the next queued row, update -> recorded. Any other table: harmless. */
function wire(current: Record<string, unknown>, fresh?: Record<string, unknown>) {
  selects = [current, ...(fresh ? [fresh] : [])]
  updates = []
  supabaseFrom.mockImplementation((table: string) => {
    if (table === 'bookings') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: selects.shift() ?? null, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload)
          return { eq: async () => ({ error: null }) }
        },
      }
    }
    return {
      insert: async () => ({ error: null }),
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }
  })
}

const transitionArgs = () => mockApplyTransition.mock.calls.map((c) => c[0] as Record<string, any>) // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', app_metadata: { is_admin: true } } }, error: null })
  mockApplyTransition.mockImplementation(async (args: { to: string }) => ({
    applied: true,
    booking: { payment_state: args.to },
  }))
  mockAppendEvent.mockResolvedValue({ inserted: true })
  mockCancelHoldIntent.mockResolvedValue(undefined)
  mockRefreshRecoveryLink.mockResolvedValue({ url: 'https://buy.stripe.com/new', id: 'plink_new' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PATCH trip-edit — card booking payment hook', () => {
  it.each(['checkout_pending', 'placing_hold', 'capturing'])(
    '%s: 409 payment_in_progress and no bookings update',
    async (state) => {
      wire(cardBooking({ payment_state: state }))
      const res = await PATCH(patchRequest({ id: ID, client_first_name: 'Petr' }))
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'payment_in_progress' })
      expect(updates).toHaveLength(0)
      expect(mockApplyTransition).not.toHaveBeenCalled()
    },
  )

  it('88-REVIEW A-WR-11: a route / vehicle edit without an explicit amount keeps the agreed card price (no auto difference)', async () => {
    // The recompute (1500 CZK, no promo) differs from the agreed 3000 CZK, and the submitted amount is the agreed one.
    wire(cardBooking())
    const res = await PATCH(patchRequest({ id: ID, origin_address: 'Prague Airport Terminal 2', amount_czk: 3000 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.payment_effect).toEqual({ kind: 'amount_kept', currency: 'eur', amount_minor: 12000, standard_czk: 1500 })
    expect(updates[0]).toMatchObject({ origin_address: 'Prague Airport Terminal 2' })
    expect(updates[0]).not.toHaveProperty('amount_czk')
    expect(updates[0]).not.toHaveProperty('amount_eur')
    expect(mockApplyTransition).not.toHaveBeenCalled()
  })

  describe('money WR-09: a cash booking keeps the amount the client agreed to (D-12)', () => {
    const cash = () => cardBooking({ payment_mode: 'cash_guarantee', payment_state: 'card_saved' })

    it('an address fix leaves the promo price alone, whatever the recompute says', async () => {
      wire(cash())
      const res = await PATCH(patchRequest({ id: ID, origin_address: 'Prague Airport Terminal 2', amount_czk: 3000 }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.payment_effect).toEqual({ kind: 'amount_kept', currency: 'eur', amount_minor: 12000, standard_czk: 1500 })
      expect(updates[0]).not.toHaveProperty('amount_czk')
      expect(updates[0]).not.toHaveProperty('amount_eur')
    })

    it('even a submitted list price does not re-price it', async () => {
      wire(cash())
      const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 1500 }))
      expect(res.status).toBe(200)
      expect(updates[0]).not.toHaveProperty('amount_czk')
    })

    it('an explicit amount from the operator is taken as entered', async () => {
      wire(cash())
      const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 1510, override_price: true }))
      expect(res.status).toBe(200)
      expect(updates[0]).toMatchObject({ amount_czk: 1510 })
    })
  })

  it('88-REVIEW A-WR-11: even a submitted list-price amount does not re-price a card booking without override_price', async () => {
    wire(cardBooking())
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 1500 }))
    expect(res.status).toBe(200)
    expect(updates[0]).not.toHaveProperty('amount_czk')
    expect(mockApplyTransition).not.toHaveBeenCalled()
  })

  it('88-REVIEW A-WR-11: an explicit amount (override_price) inside the tolerance is taken exactly as entered', async () => {
    wire(cardBooking(), cardBooking({ amount_czk: 1510, amount_eur: 60 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 1510, override_price: true }))
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ amount_czk: 1510 })
  })

  it('authorized hold 12000 eur, price edit to 150 eur: payment_amount_minor 15000, hold untouched, amount_raised', async () => {
    wire(cardBooking(), cardBooking({ amount_czk: 3750, amount_eur: 150 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 3750, override_price: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      payment_effect: { kind: 'amount_raised', currency: 'eur', held_minor: 12000, diff_minor: 3000 },
    })
    expect(updates[0]).toMatchObject({ amount_czk: 3750, amount_eur: 150 })
    expect(mockCancelHoldIntent).not.toHaveBeenCalled()
    expect(transitionArgs()).toHaveLength(1)
    expect(transitionArgs()[0]).toMatchObject({
      bookingId: ID,
      from: ['authorized'],
      to: 'authorized',
      patch: { payment_amount_minor: 15000 },
      event: { kind: 'edit_reevaluated', actor: { type: 'admin', id: 'admin-1' } },
    })
    // the hold itself is never touched
    expect(transitionArgs()[0].patch).not.toHaveProperty('hold_payment_intent_id')
    expect(transitionArgs()[0].patch).not.toHaveProperty('hold_amount_minor')
  })

  it('price edit to 90 eur: payment_amount_minor 9000, amount_lowered', async () => {
    wire(cardBooking(), cardBooking({ amount_czk: 2250, amount_eur: 90 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 2250, override_price: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      payment_effect: { kind: 'amount_lowered', currency: 'eur', amount_minor: 9000 },
    })
    expect(transitionArgs()[0]).toMatchObject({ patch: { payment_amount_minor: 9000 } })
  })

  it('czk booking: payment_amount_minor = amount_czk x 100', async () => {
    wire(
      cardBooking({ payment_currency: 'czk', payment_amount_minor: 300000, hold_amount_minor: 300000 }),
      cardBooking({ payment_currency: 'czk', payment_amount_minor: 300000, hold_amount_minor: 300000, amount_czk: 3750, amount_eur: 150 }),
    )
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 3750, override_price: true }))
    expect(res.status).toBe(200)
    expect(transitionArgs()[0]).toMatchObject({ patch: { payment_amount_minor: 375000 } })
    expect((await res.json()).payment_effect).toMatchObject({ kind: 'amount_raised', currency: 'czk', diff_minor: 75000 })
  })

  it('authorized hold, pickup moved 2 d -> 5 d out: hold cancelled, back to card_saved with the new hold_at and attempts + 1', async () => {
    wire(
      cardBooking({ pickup_date: '2026-11-06' }),
      cardBooking({ pickup_date: '2026-11-09', pickup_utc: '2026-11-09T11:00:00+00:00' }),
    )
    const res = await PATCH(patchRequest({ id: ID, pickup_date: '2026-11-09' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      // 88-REVIEW C-WR-06: the instant (pickup 2026-11-09 12:00 Prague minus 72 h) next to the date.
      payment_effect: { kind: 'hold_released', currency: 'eur', hold_date_iso: '2026-11-06', hold_at_iso: '2026-11-06T11:00:00.000Z' },
    })
    expect(mockCancelHoldIntent).toHaveBeenCalledTimes(1)
    expect(mockCancelHoldIntent).toHaveBeenCalledWith(expect.objectContaining({ id: ID, hold_payment_intent_id: 'pi_hold' }))
    expect(mockCancelHoldIntent.mock.invocationCallOrder[0]).toBeLessThan(mockApplyTransition.mock.invocationCallOrder[0])
    expect(transitionArgs()).toHaveLength(1)
    expect(transitionArgs()[0]).toMatchObject({
      from: ['authorized'],
      to: 'card_saved',
      patch: {
        hold_at: '2026-11-06T11:00:00.000Z',
        hold_attempts: 1,
        hold_payment_intent_id: null,
        hold_amount_minor: null,
        capture_before: null,
      },
      event: { kind: 'hold_released' },
    })
    // the edit_reevaluated row
    expect(mockAppendEvent).toHaveBeenCalledWith(ID, expect.objectContaining({ kind: 'edit_reevaluated' }))
  })

  it('authorized hold whose capture_before is less than 6 h after the new pickup is replaced (margin rule)', async () => {
    // the new raw hold instant (2026-11-03) is already past, so only the 6 h margin can force the replace:
    // pickup 2026-11-06 12:00 Prague = 11:00Z, hold expires 15:00Z (< 17:00Z)
    const expiring = { capture_before: '2026-11-06T15:00:00.000Z' }
    wire(cardBooking(expiring), cardBooking({ ...expiring, pickup_date: '2026-11-06' }))
    const res = await PATCH(patchRequest({ id: ID, pickup_date: '2026-11-06' }))
    expect(res.status).toBe(200)
    expect((await res.json()).payment_effect).toMatchObject({ kind: 'hold_released', hold_date_iso: '2026-11-03' })
    expect(mockCancelHoldIntent).toHaveBeenCalledTimes(1)
    expect(transitionArgs()[0]).toMatchObject({ to: 'card_saved' })
  })

  it('authorized hold, pickup moved but the hold still fits: only hold_at follows, no Stripe call, no payment_effect', async () => {
    wire(cardBooking(), cardBooking({ pickup_date: '2026-11-06' }))
    const res = await PATCH(patchRequest({ id: ID, pickup_date: '2026-11-06' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockCancelHoldIntent).not.toHaveBeenCalled()
    expect(transitionArgs()[0]).toMatchObject({
      from: ['authorized'],
      to: 'authorized',
      patch: { hold_at: '2026-11-03T11:00:00.000Z' },
    })
  })

  it('card_saved, pickup moved earlier into the window: hold_at becomes a past instant, no Stripe call, no payment_effect', async () => {
    wire(
      cardBooking({ payment_state: 'card_saved', hold_payment_intent_id: null, hold_amount_minor: null, capture_before: null }),
      cardBooking({
        payment_state: 'card_saved',
        pickup_date: '2026-11-06',
        hold_payment_intent_id: null,
        hold_amount_minor: null,
        capture_before: null,
      }),
    )
    const res = await PATCH(patchRequest({ id: ID, pickup_date: '2026-11-06' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockCancelHoldIntent).not.toHaveBeenCalled()
    expect(transitionArgs()[0]).toMatchObject({
      from: ['card_saved'],
      to: 'card_saved',
      patch: { hold_at: '2026-11-03T11:00:00.000Z' },
    })
    expect(Date.parse(transitionArgs()[0].patch.hold_at)).toBeLessThan(NOW.getTime())
  })

  it('DST: pickup edited to 2027-10-31 12:00 gives hold_at 2027-10-28 11:00Z', async () => {
    const saved = { payment_state: 'card_saved', hold_payment_intent_id: null, hold_amount_minor: null, capture_before: null }
    wire(cardBooking(saved), cardBooking({ ...saved, pickup_date: '2027-10-31', pickup_time: '12:00' }))
    const res = await PATCH(patchRequest({ id: ID, pickup_date: '2027-10-31', pickup_time: '12:00' }))
    expect(res.status).toBe(200)
    expect(transitionArgs()[0].patch.hold_at).toBe('2027-10-28T11:00:00.000Z')
  })

  it('cancelHoldIntent throwing: the PATCH is still 200 with no payment_effect, an edit_reevaluated row carries the error code, the state is unchanged', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCancelHoldIntent.mockRejectedValue(Object.assign(new Error('stripe down'), { code: 'api_connection_error' }))
    wire(cardBooking({ pickup_date: '2026-11-06' }), cardBooking({ pickup_date: '2026-11-09' }))
    const res = await PATCH(patchRequest({ id: ID, pickup_date: '2026-11-09' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockApplyTransition).not.toHaveBeenCalled()
    expect(mockAppendEvent).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ kind: 'edit_reevaluated', errorCode: 'api_connection_error' }),
    )
    errorSpy.mockRestore()
  })

  it('a ledger or transition failure never fails the edit', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApplyTransition.mockRejectedValue(new Error('payment transition failed'))
    wire(cardBooking(), cardBooking({ amount_czk: 3750, amount_eur: 150 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 3750, override_price: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    errorSpy.mockRestore()
  })

  it('failed booking with a recovery link, price raised: the link is re-created for the new outstanding amount', async () => {
    const failed = { payment_state: 'failed', hold_payment_intent_id: null, hold_amount_minor: null, capture_before: null, recovery_link_id: 'plink_old' }
    wire(cardBooking(failed), cardBooking({ ...failed, amount_czk: 3750, amount_eur: 150 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 3750, override_price: true }))
    expect(res.status).toBe(200)
    expect(transitionArgs()[0]).toMatchObject({ from: ['failed'], to: 'failed', patch: { payment_amount_minor: 15000 } })
    expect(mockRefreshRecoveryLink).toHaveBeenCalledTimes(1)
    expect(mockRefreshRecoveryLink).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID, recovery_link_id: 'plink_old' }),
      15000,
      expect.any(String),
    )
  })

  it('balance_due booking: price change is ledger-only (already_collected), no transition', async () => {
    const due = { payment_state: 'balance_due' }
    wire(cardBooking(due), cardBooking({ ...due, amount_czk: 3750, amount_eur: 150 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 3750, override_price: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockApplyTransition).not.toHaveBeenCalled()
    expect(mockAppendEvent).toHaveBeenCalledWith(ID, expect.objectContaining({ kind: 'edit_reevaluated', errorCode: 'already_collected' }))
  })

  it('a contact-only edit of a card booking does no payment work', async () => {
    wire(cardBooking())
    const res = await PATCH(patchRequest({ id: ID, client_first_name: 'Petr' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockApplyTransition).not.toHaveBeenCalled()
    expect(mockAppendEvent).not.toHaveBeenCalled()
    expect(selects).toHaveLength(0)
  })

  it('pay_now booking edits: no payment work and no payment_effect key', async () => {
    const payNow = cardBooking({ payment_mode: 'pay_now', payment_state: 'none', payment_intent_id: 'pi_paid' })
    wire(payNow, payNow)
    const res = await PATCH(patchRequest({ id: ID, pickup_date: '2026-11-25' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true })
    expect(json).not.toHaveProperty('payment_effect')
    expect(mockApplyTransition).not.toHaveBeenCalled()
    expect(mockAppendEvent).not.toHaveBeenCalled()
    expect(mockCancelHoldIntent).not.toHaveBeenCalled()
  })
})

describe('PATCH trip-edit — D-20: a quote booking never charges the deposit share again', () => {
  const QUOTE_ID = '5b0c8e1a-3d4f-4a6b-9c7d-1e2f3a4b5c6d'
  const quoteBooking = (over: Record<string, unknown> = {}) =>
    cardBooking({
      quote_id: QUOTE_ID,
      quote_deposit_minor: 9000,
      amount_czk: 7500,
      amount_eur: 300,
      payment_amount_minor: 21000,
      hold_amount_minor: 21000,
      ...over,
    })

  it('card_hold quote booking, price 300 -> 320 eur with a 90 eur deposit share: amount to charge 23000, ledger row carries 23000', async () => {
    wire(quoteBooking(), quoteBooking({ amount_czk: 8000, amount_eur: 320 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 8000, override_price: true }))
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ amount_czk: 8000, amount_eur: 320 })
    expect(transitionArgs()).toHaveLength(1)
    expect(transitionArgs()[0]).toMatchObject({
      patch: { payment_amount_minor: 23000 },
      event: { kind: 'edit_reevaluated', amountMinor: 23000 },
    })
    expect((await res.json()).payment_effect).toEqual({ kind: 'amount_raised', currency: 'eur', held_minor: 21000, diff_minor: 2000 })
  })

  it('card_saved quote booking: the next hold is planned for the new amount minus the deposit share', async () => {
    const saved = { payment_state: 'card_saved', hold_amount_minor: null, hold_payment_intent_id: null }
    wire(quoteBooking(saved), quoteBooking({ ...saved, amount_czk: 8000, amount_eur: 320 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 8000, override_price: true }))
    expect(res.status).toBe(200)
    expect(transitionArgs()[0]).toMatchObject({ patch: { payment_amount_minor: 23000 } })
  })

  it('czk quote booking: the deposit share (czk minor) is subtracted from amount_czk x 100', async () => {
    const czk = { payment_currency: 'czk', quote_deposit_minor: 225000, payment_amount_minor: 525000, hold_amount_minor: 525000 }
    wire(quoteBooking(czk), quoteBooking({ ...czk, amount_czk: 8000, amount_eur: 320 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 8000, override_price: true }))
    expect(res.status).toBe(200)
    expect(transitionArgs()[0]).toMatchObject({ patch: { payment_amount_minor: 575000 } })
  })

  it('cash_guarantee quote booking follows the same rule', async () => {
    const cash = { payment_mode: 'cash_guarantee', payment_state: 'card_saved', hold_amount_minor: null, hold_payment_intent_id: null }
    wire(quoteBooking(cash), quoteBooking({ ...cash, amount_czk: 8000, amount_eur: 320 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 8000, override_price: true }))
    expect(res.status).toBe(200)
    expect(transitionArgs()[0]).toMatchObject({ to: 'card_saved', patch: { payment_amount_minor: 23000 } })
  })

  it.each([
    ['card_hold', {}],
    ['cash_guarantee', { payment_mode: 'cash_guarantee', payment_state: 'card_saved' }],
  ])('%s: an edit to 80 eur with a 9000 share answers 422 quote_amount_below_deposit and nothing changes', async (_mode, over) => {
    wire(quoteBooking(over))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 2000, override_price: true }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'quote_amount_below_deposit' })
    expect(updates).toHaveLength(0)
    expect(mockApplyTransition).not.toHaveBeenCalled()
    expect(mockAppendEvent).not.toHaveBeenCalled()
  })

  it('an edit to exactly the deposit share (nothing left to charge) is refused as well', async () => {
    wire(quoteBooking())
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 2250, override_price: true }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'quote_amount_below_deposit' })
    expect(updates).toHaveLength(0)
  })

  it('a contact-only edit of a quote booking is not touched by the rule', async () => {
    wire(quoteBooking())
    const res = await PATCH(patchRequest({ id: ID, client_first_name: 'Petr' }))
    expect(res.status).toBe(200)
    expect(mockApplyTransition).not.toHaveBeenCalled()
  })

  it('an ordinary booking (no quote_id) is repriced to the full amount, as before', async () => {
    wire(cardBooking({ quote_deposit_minor: 9000 }), cardBooking({ amount_czk: 8000, amount_eur: 320 }))
    const res = await PATCH(patchRequest({ id: ID, vehicle_class: 'first_class', amount_czk: 8000, override_price: true }))
    expect(res.status).toBe(200)
    expect(transitionArgs()[0]).toMatchObject({ patch: { payment_amount_minor: 32000 } })
  })
})
