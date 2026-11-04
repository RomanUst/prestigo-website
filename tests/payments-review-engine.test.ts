// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, FakeStripeError, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 88 code review, money-engine warnings (88-REVIEW A-WR-01, A-WR-02, A-WR-03, A-WR-06, A-WR-07, A-WR-09, A-IN-08):
 *   - a 409 (same key still in flight) is busy, never a definitive failure; the lease covers the worst Stripe chain;
 *   - a refused Stripe key never burns an attempt or emails the client, the operator is alerted once;
 *   - a hold key reused with other parameters voids the earlier authorization and moves to the next attempt;
 *   - a placing_hold row whose worker died is settled / released once its lease lapsed;
 *   - a recorded captured key on a row that did not move is never reported as a success;
 *   - an authorization that lapsed at capture time falls back to the saved card.
 */

const { world, mockSendEmail, mockFailure, mockDeactivateLink, mockAlert } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
  },
  mockSendEmail: vi.fn(),
  mockFailure: vi.fn(),
  mockDeactivateLink: vi.fn(),
  mockAlert: vi.fn(),
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
vi.mock('@/lib/payments/recovery', () => ({ handlePaymentFailure: mockFailure, refreshRecoveryLink: vi.fn() }))
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: mockAlert }))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: mockDeactivateLink }))

import { placeHold, releaseHold } from '@/lib/payments/hold'
import { settleBooking } from '@/lib/payments/settle'
import { allowedPaymentActions } from '@/lib/payments/actions'
import { reevaluateAfterEdit } from '@/lib/payments/edit-hook'
import { runPaymentTick } from '@/lib/payments/tick'
import { LEASE_SECONDS } from '@/lib/payments/config'
import { STRIPE_CALLS_PER_LEASE, STRIPE_MAX_NETWORK_RETRIES, STRIPE_TIMEOUT_MS } from '@/lib/payments/stripe'

const ID = '77777777-7777-4777-8777-777777777777'
const HOUR = 3_600_000
const ACTOR = { type: 'system', id: 'payment_tick' } as const

let db: FakePaymentsDb
let fake: FakeStripe

function upcoming(over: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    id: ID,
    status: 'confirmed',
    booking_source: 'web',
    payment_mode: 'card_hold',
    payment_state: 'placing_hold',
    payment_lease_until: new Date(now + 300_000).toISOString(),
    booking_reference: 'PRG-20261201-REV01',
    client_email: 'anna@example.com',
    locale: 'en',
    pickup_date: '2026-12-01',
    pickup_time: '14:00',
    pickup_utc: new Date(now + 60 * HOUR).toISOString(),
    hold_at: new Date(now - 60_000).toISOString(),
    payment_currency: 'eur',
    payment_amount_minor: 12000,
    amount_eur: 120,
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_ok',
    hold_attempts: 0,
    charge_attempts: 0,
    ...over,
  }
}

function completed(over: Record<string, unknown> = {}) {
  return upcoming({
    status: 'completed',
    completed_at: new Date(Date.now() - HOUR).toISOString(),
    pickup_utc: new Date(Date.now() - 5 * HOUR).toISOString(),
    payment_state: 'authorized',
    payment_lease_until: null,
    ...over,
  })
}

function seed(b: Record<string, unknown>) {
  db = createFakePaymentsDb({ bookings: [b] })
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const fresh = () => ({ ...row() }) as Record<string, unknown>
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))

async function authorizedHold(attempt = 0, amount = 12000): Promise<string> {
  const pi = (await fake.stripe.paymentIntents.create({
    amount,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_ok',
    capture_method: 'manual',
    off_session: true,
    confirm: true,
    metadata: { kind: 'card_hold', cofBookingId: ID, attempt: String(attempt), bookingReference: 'PRG-20261201-REV01' },
  })) as { id: string }
  return pi.id
}

beforeEach(() => {
  vi.clearAllMocks()
  fake = createFakeStripe()
  world.stripe = fake.stripe
  mockSendEmail.mockResolvedValue('sent')
  mockFailure.mockResolvedValue(undefined)
  mockDeactivateLink.mockResolvedValue(undefined)
  mockAlert.mockResolvedValue('sent')
})

describe('A-WR-01: lease and busy keys', () => {
  it('the lease covers the longest Stripe chain of one booking at the worst timeout and retries', () => {
    const worstChainMs = STRIPE_CALLS_PER_LEASE * (STRIPE_MAX_NETWORK_RETRIES + 1) * STRIPE_TIMEOUT_MS
    expect(LEASE_SECONDS * 1000).toBeGreaterThan(worstChainMs)
  })

  it('a 409 on the hold create returns the row to card_saved with the same attempt: no failure, no client email', async () => {
    seed(upcoming())
    fake.failNextWithError(
      'paymentIntents.create',
      new FakeStripeError('StripeIdempotencyError', 'in use', { statusCode: 409, code: 'idempotency_key_in_use' }),
    )
    expect(await placeHold(fresh(), ACTOR)).toEqual({ outcome: 'transient', code: 'transient' })
    expect(row()).toMatchObject({ payment_state: 'card_saved', hold_attempts: 0, payment_retry_at: null })
    expect(mockFailure).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('a 409 on the capture keeps the row capturing (transient), never failed', async () => {
    const holdId = await authorizedHold()
    seed(completed({ hold_payment_intent_id: holdId, hold_amount_minor: 12000 }))
    fake.failNextWithError(
      'paymentIntents.capture',
      new FakeStripeError('StripeInvalidRequestError', 'in use', { statusCode: 409, code: 'idempotency_key_in_use' }),
    )
    expect((await settleBooking(ID, ACTOR)).outcome).toBe('transient')
    expect(row().payment_state).toBe('capturing')
    expect(row().charge_attempts).toBe(0)
    expect(mockFailure).not.toHaveBeenCalled()
  })

  it('step A claims one booking at a time and passes a booking that came back transient', async () => {
    const other = '88888888-8888-4888-8888-888888888888'
    db = createFakePaymentsDb({
      bookings: [
        upcoming({ payment_state: 'card_saved', payment_lease_until: null, hold_at: new Date(Date.now() - 2 * HOUR).toISOString() }),
        upcoming({ id: other, payment_state: 'card_saved', payment_lease_until: null, booking_reference: 'PRG-OTHER' }),
      ],
    })
    world.db = db
    // The oldest booking meets a busy key and comes back to card_saved at once: it must not starve the other one.
    fake.failNextWithError('paymentIntents.create', new FakeStripeError('StripeAPIError', 'busy', { statusCode: 409 }))
    const result = await runPaymentTick(new Date())
    expect(result.placed).toBe(1)
    expect(db.state.bookings.find((b) => b.id === other)!.payment_state).toBe('authorized')
    // The busy one is left leased for a later run, never failed.
    expect(row().payment_state).toBe('placing_hold')
    expect(ledger('hold_failed').map((e) => e.error_code)).toEqual(['transient'])
  })
})

describe('A-WR-02: a refused Stripe key is not a client decline', () => {
  it('a 401 on the hold keeps the attempt, sends no client email and alerts the operator once', async () => {
    seed(upcoming())
    fake.failNextWithError('paymentIntents.create', new FakeStripeError('StripeAuthenticationError', 'bad key', { statusCode: 401 }))
    expect(await placeHold(fresh(), ACTOR)).toEqual({ outcome: 'transient', code: 'stripe_config' })
    expect(row()).toMatchObject({ payment_state: 'card_saved', hold_attempts: 0, payment_retry_count: 0 })
    expect(mockFailure).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledWith(
      'stripe_config',
      expect.objectContaining({ id: ID }),
      expect.objectContaining({ eventKey: `alert:stripe_config:${ID}:hold:0` }),
    )
  })

  it('a 403 on the fallback charge leaves the settle transient (no failed state, no recovery email) and alerts', async () => {
    seed(completed({ payment_state: 'card_saved' }))
    fake.failNextWithError('paymentIntents.create', new FakeStripeError('StripePermissionError', 'restricted', { statusCode: 403 }))
    expect(await settleBooking(ID, ACTOR)).toEqual({ outcome: 'transient', code: 'stripe_config' })
    expect(row().payment_state).toBe('capturing')
    expect(row().charge_attempts).toBe(0)
    expect(mockFailure).not.toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledWith('stripe_config', expect.anything(), expect.objectContaining({ eventKey: `alert:stripe_config:${ID}:charge:0` }))
  })

  it('a real decline still takes the failure path', async () => {
    seed(upcoming({ stripe_payment_method_id: 'pm_decline_insufficient' }))
    expect((await placeHold(fresh(), ACTOR)).outcome).toBe('failed')
    expect(mockFailure).toHaveBeenCalledTimes(1)
  })
})

describe('A-WR-03: a price edit after a transient hold attempt', () => {
  it('the replay with a new amount meets the used key: the old authorization is voided and the next attempt is fresh', async () => {
    // Attempt 0 authorized 12000 at Stripe, but its answer was lost (the row went back to card_saved).
    seed(upcoming({ payment_state: 'card_saved', payment_lease_until: null }))
    const first = await fake.stripe.paymentIntents.create(
      {
        amount: 12000,
        currency: 'eur',
        customer: 'cus_1',
        payment_method: 'pm_ok',
        payment_method_types: ['card'],
        capture_method: 'manual',
        off_session: true,
        confirm: true,
        metadata: { kind: 'card_hold', cofBookingId: ID, attempt: '0', bookingReference: 'PRG-20261201-REV01' },
        expand: ['latest_charge'],
      },
      { idempotencyKey: `hold:${ID}:0` },
    )
    // The price rises; the edit hook can not search Stripe right now, so the attempt stays 0.
    row().payment_amount_minor = 15000
    row().payment_state = 'placing_hold'
    row().payment_lease_until = new Date(Date.now() + 60_000).toISOString()

    expect(await placeHold(fresh(), ACTOR)).toEqual({ outcome: 'transient', code: 'key_reused' })
    expect(fake.state.paymentIntents.get((first as { id: string }).id)!.status).toBe('canceled')
    expect(row()).toMatchObject({ payment_state: 'card_saved', hold_attempts: 1 })
    expect(mockFailure).not.toHaveBeenCalled()

    // The next attempt holds the new amount under a fresh key.
    row().payment_state = 'placing_hold'
    expect(await placeHold(fresh(), ACTOR)).toEqual({ outcome: 'authorized' })
    expect(row().hold_amount_minor).toBe(15000)
    const live = [...fake.state.paymentIntents.values()].filter((p) => p.status === 'requires_capture')
    expect(live).toHaveLength(1)
  })

  it('the edit hook voids what the current attempt created and advances the attempt in the same write', async () => {
    seed(upcoming({ payment_state: 'card_saved', payment_lease_until: null, amount_eur: 150 }))
    const orphan = await authorizedHold(0)
    const effect = await reevaluateAfterEdit({
      bookingId: ID,
      before: fresh(),
      priceChanged: true,
      pickupChanged: false,
      actor: { type: 'admin', id: 'op' },
    })
    expect(effect).toBeNull()
    expect(row()).toMatchObject({ payment_amount_minor: 15000, hold_attempts: 1, payment_state: 'card_saved' })
    expect(fake.state.paymentIntents.get(orphan)!.status).toBe('canceled')
  })
})

describe('A-WR-06: a hold placement that died near pickup', () => {
  it('the settle adopts a completed placing_hold row once its lease lapsed and captures the authorization it finds', async () => {
    const holdId = await authorizedHold(0)
    seed(completed({ payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() - 1000).toISOString() }))
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('captured')
    expect(row().payment_intent_id).toBe(holdId)
    expect(fake.callsTo('paymentIntents.create').filter((c) => !c.replayed)).toHaveLength(1) // only the seed
  })

  it('a live lease still blocks the settle (busy)', async () => {
    seed(completed({ payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() + 60_000).toISOString() }))
    expect((await settleBooking(ID, ACTOR)).outcome).toBe('busy')
    expect(row().payment_state).toBe('placing_hold')
  })

  it('without any authorization the settle charges the saved card', async () => {
    seed(completed({ payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() - 1000).toISOString() }))
    expect((await settleBooking(ID, ACTOR)).outcome).toBe('captured')
    expect(fake.callsTo('paymentIntents.create')[0].idempotencyKey).toBe(`chg:${ID}:0`)
  })

  it('releaseHold on a lapsed placing_hold voids the attempt and releases; a live lease is busy', async () => {
    seed(upcoming({ payment_lease_until: new Date(Date.now() + 60_000).toISOString() }))
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('busy')

    seed(upcoming({ payment_lease_until: new Date(Date.now() - 1000).toISOString() }))
    const orphan = await authorizedHold(0)
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('released')
    expect(row().payment_state).toBe('released')
    expect(fake.state.paymentIntents.get(orphan)!.status).toBe('canceled')
  })

  it('the action matrix offers release (and capture after the trip) on a lapsed placement, nothing on a live one', () => {
    const lapsed = new Date(Date.now() - 1000).toISOString()
    const live = new Date(Date.now() + 60_000).toISOString()
    expect(allowedPaymentActions(upcoming({ payment_lease_until: live }))).toEqual([])
    expect(allowedPaymentActions(upcoming({ payment_lease_until: lapsed }))).toEqual(['release'])
    expect(allowedPaymentActions(completed({ payment_state: 'placing_hold', payment_lease_until: lapsed }))).toEqual(['capture', 'release'])
  })

  it('tick step C picks up a completed placing_hold row whose lease lapsed', async () => {
    await authorizedHold(0)
    seed(completed({ payment_state: 'placing_hold', payment_lease_until: new Date(Date.now() - 1000).toISOString() }))
    const result = await runPaymentTick(new Date())
    expect(result.captured).toBe(1)
    expect(row().payment_state).toBe('captured')
  })
})

describe('A-WR-07: a recorded captured key is a success only when the row is captured', () => {
  it('the declined-difference capture row uses its own key, so a later settle can capture the row', async () => {
    const holdId = await authorizedHold(0)
    seed(completed({ payment_state: 'capturing', payment_lease_until: new Date(Date.now() - 1000).toISOString(), hold_payment_intent_id: holdId }))
    // The final transition key is already recorded (a stale row), but the row is still capturing.
    db.state.booking_payment_events.push({
      id: 9100,
      booking_id: ID,
      event_key: `captured:${holdId}`,
      kind: 'captured',
      from_state: 'capturing',
      to_state: 'capturing',
      actor_type: 'system',
      created_at: new Date().toISOString(),
    })
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('busy')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe('A-WR-09: an authorization that lapsed at capture time', () => {
  it('charge_expired_for_capture falls back to the saved card (no decline email)', async () => {
    const holdId = await authorizedHold(0)
    seed(completed({ hold_payment_intent_id: holdId, hold_amount_minor: 12000 }))
    fake.failNextWithError(
      'paymentIntents.capture',
      new FakeStripeError('StripeInvalidRequestError', 'expired', { statusCode: 400, code: 'charge_expired_for_capture' }),
    )
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('captured')
    expect(mockFailure).not.toHaveBeenCalled()
    expect(fake.callsTo('paymentIntents.create').map((c) => c.idempotencyKey)).toContain(`chg:${ID}:0`)
    expect(fake.state.paymentIntents.get(holdId)!.status).toBe('canceled')
  })
})

describe('A-IN-08: a completed trip still in checkout_pending', () => {
  it('is skipped as not confirmed instead of answering busy', async () => {
    seed(completed({ payment_state: 'checkout_pending' }))
    expect(await settleBooking(ID, ACTOR)).toEqual({ outcome: 'skipped', code: 'not_confirmed' })
  })
})
