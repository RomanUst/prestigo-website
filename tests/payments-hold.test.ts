// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 88 plan 88-11 (HOLD-02, D-02, D-04, PAYF-03): placeHold failure handling and attempt-numbered idempotency
 * (Pitfall 2), the partner guard, the admin claim and the release primitives.
 */

const { world, mockSendEmail, mockDeactivateLink } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
  },
  mockSendEmail: vi.fn(),
  mockDeactivateLink: vi.fn(),
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
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: mockDeactivateLink }))

import { cancelHoldIntent, claimForHold, holdFailurePatch, placeHold, releaseHold } from '@/lib/payments/hold'
import { claimDueHolds } from '@/lib/payments/state'
import { retryAt } from '@/lib/payments/timing'
import { LEASE_SECONDS } from '@/lib/payments/config'

const ID = '55555555-5555-4555-8555-555555555555'
const HOUR = 3_600_000
const ACTOR = { type: 'system', id: 'payment_tick' } as const

let db: FakePaymentsDb
let fake: FakeStripe

function booking(over: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    id: ID,
    status: 'confirmed',
    booking_source: 'web',
    payment_mode: 'card_hold',
    payment_state: 'placing_hold',
    payment_lease_until: new Date(now + 300_000).toISOString(),
    booking_reference: 'PRG-20261201-HOLD01',
    client_email: 'anna@example.com',
    locale: 'en',
    pickup_date: '2026-12-01',
    pickup_time: '14:00',
    pickup_utc: new Date(now + 60 * HOUR).toISOString(),
    hold_at: new Date(now - 60_000).toISOString(),
    payment_currency: 'eur',
    payment_amount_minor: 12000,
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_ok',
    ...over,
  }
}

function seed(over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({ bookings: [booking(over)] })
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))
const fresh = () => ({ ...row() }) as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  fake = createFakeStripe()
  world.stripe = fake.stripe
  mockSendEmail.mockResolvedValue('sent')
  mockDeactivateLink.mockResolvedValue(undefined)
  seed()
})

describe('placeHold: success', () => {
  it('without a latest_charge object the capture_before is looked up with an expanded retrieve', async () => {
    const res = await placeHold(fresh(), ACTOR)
    expect(res).toEqual({ outcome: 'authorized' })
    expect(row().payment_state).toBe('authorized')
    // The fake returns a charge id string, so capture_before stays unknown but the hold is still recorded.
    expect(row().hold_amount_minor).toBe(12000)
    expect(fake.callsTo('paymentIntents.retrieve').length).toBeGreaterThanOrEqual(1)
  })
})

describe('placeHold: failures and attempts (Pitfall 2)', () => {
  it('a connection failure returns the row to card_saved with the SAME attempt; the next tick replays the same key', async () => {
    fake.failNextWith('paymentIntents.create', 'connection')
    const first = await placeHold(fresh(), ACTOR)
    expect(first).toEqual({ outcome: 'transient', code: 'transient' })
    expect(row().payment_state).toBe('card_saved')
    expect(row().hold_attempts).toBe(0)
    expect(row().payment_lease_until).toBeNull()
    expect(ledger('hold_failed')).toHaveLength(1)
    expect(ledger('hold_failed')[0].error_code).toBe('transient')

    const [claimed] = await claimDueHolds(20, 300)
    expect(claimed.id).toBe(ID)
    const second = await placeHold(claimed, ACTOR)
    expect(second.outcome).toBe('authorized')

    const keys = fake.callsTo('paymentIntents.create').map((c) => c.idempotencyKey)
    expect(keys).toEqual([`hold:${ID}:0`, `hold:${ID}:0`])
    expect(fake.state.paymentIntents.size).toBe(1)
  })

  it('an insufficient-funds decline -> failed, attempt + 1, code only, retry instant from retryAt', async () => {
    seed({ stripe_payment_method_id: 'pm_decline_insufficient' })
    const before = Date.now()
    const res = await placeHold(fresh(), ACTOR)
    expect(res).toEqual({ outcome: 'failed', code: 'insufficient_funds' })
    const b = row()
    expect(b.payment_state).toBe('failed')
    expect(b.hold_attempts).toBe(1)
    expect(b.last_payment_error).toBe('insufficient_funds')
    expect(b.payment_lease_until).toBeNull()
    const failedAt = Date.parse(b.payment_failed_at as string)
    expect(failedAt).toBeGreaterThanOrEqual(before - 1000)
    expect(b.payment_retry_at).toBe(new Date(retryAt(failedAt, Date.parse(b.pickup_utc as string))!).toISOString())
    expect(ledger('hold_failed')).toHaveLength(1)
    expect(ledger('hold_failed')[0].error_code).toBe('insufficient_funds')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('authentication_required -> failed with last_payment_error authentication_required', async () => {
    seed({ stripe_payment_method_id: 'pm_auth_required' })
    const res = await placeHold(fresh(), ACTOR)
    expect(res).toEqual({ outcome: 'failed', code: 'authentication_required' })
    expect(row().payment_state).toBe('failed')
    expect(row().last_payment_error).toBe('authentication_required')
    expect(row().hold_attempts).toBe(1)
  })

  it('after a definitive failure the next attempt uses a fresh key (hold:<id>:1)', async () => {
    seed({ stripe_payment_method_id: 'pm_decline_insufficient' })
    await placeHold(fresh(), ACTOR)
    // The client fixes the card; the operator re-claims the failed booking.
    row().stripe_payment_method_id = 'pm_ok'
    const claim = await claimForHold(ID, { type: 'admin', id: 'ops' })
    expect(claim.applied).toBe(true)
    const res = await placeHold(claim.booking!, { type: 'admin', id: 'ops' })
    expect(res.outcome).toBe('authorized')
    expect(fake.callsTo('paymentIntents.create').map((c) => c.idempotencyKey)).toEqual([`hold:${ID}:0`, `hold:${ID}:1`])
  })

  it('a pickup that already passed is never held: back to card_saved, hold_failed pickup_passed, no Stripe call', async () => {
    seed({ pickup_utc: new Date(Date.now() - HOUR).toISOString() })
    const res = await placeHold(fresh(), ACTOR)
    expect(res).toEqual({ outcome: 'skipped', code: 'pickup_passed' })
    expect(row().payment_state).toBe('card_saved')
    expect(ledger('hold_failed')[0].error_code).toBe('pickup_passed')
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('an undatable pickup is never held', async () => {
    seed({ pickup_utc: null, pickup_date: '', pickup_time: '' })
    const res = await placeHold(fresh(), ACTOR)
    expect(res).toEqual({ outcome: 'skipped', code: 'pickup_unknown' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('missing card details are a definitive failure without a Stripe call', async () => {
    seed({ stripe_payment_method_id: null })
    const res = await placeHold(fresh(), ACTOR)
    expect(res).toEqual({ outcome: 'failed', code: 'missing_payment_details' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('a row that is not in placing_hold is left alone', async () => {
    seed({ payment_state: 'card_saved', payment_lease_until: null })
    const res = await placeHold(fresh(), ACTOR)
    expect(res.outcome).toBe('skipped')
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('an authorization that finds the booking released meanwhile is voided (no orphan hold)', async () => {
    const base = fake.stripe.paymentIntents
    world.stripe = {
      ...fake.stripe,
      paymentIntents: {
        ...base,
        create: async (p: Record<string, unknown>, o?: { idempotencyKey?: string }) => {
          const pi = await base.create(p, o)
          row().payment_state = 'released'
          return pi
        },
      },
    }
    const res = await placeHold(fresh(), ACTOR)
    expect(res).toEqual({ outcome: 'skipped', code: 'state_moved' })
    const cancels = fake.callsTo('paymentIntents.cancel')
    expect(cancels).toHaveLength(1)
    expect(cancels[0].idempotencyKey).toMatch(/^pi_void:/)
    expect(row().payment_state).toBe('released')
  })
})

describe('placeHold: partner guard (D-02, T-88-33)', () => {
  it('a gnet booking that somehow reaches placeHold -> no Stripe call, skipped', async () => {
    seed({ booking_source: 'gnet' })
    const res = await placeHold(fresh(), ACTOR)
    expect(res).toEqual({ outcome: 'skipped', code: 'partner_booking' })
    expect(fake.calls).toHaveLength(0)
    expect(row().payment_state).toBe('placing_hold')
  })

  it('releaseHold on a gnet booking is a no-op without a Stripe call', async () => {
    seed({ booking_source: 'gnet', payment_state: 'authorized' })
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'operator' })).toBe('noop')
    expect(fake.calls).toHaveLength(0)
  })
})

describe('holdFailurePatch', () => {
  it('advances the attempt, keeps the code, and has no retry when pickup is too close', () => {
    const now = Date.now()
    const near = holdFailurePatch(booking({ hold_attempts: 2, pickup_utc: new Date(now + 2.5 * HOUR).toISOString() }), 'card_declined', now)
    expect(near.hold_attempts).toBe(3)
    expect(near.last_payment_error).toBe('card_declined')
    expect(near.payment_retry_at).toBeNull()
    expect(near.payment_lease_until).toBeNull()
  })
})

describe('claimForHold (admin "Place hold now")', () => {
  it.each(['card_saved', 'expired', 'failed'])('%s -> placing_hold with a lease', async (state) => {
    seed({ payment_state: state, payment_lease_until: null })
    const res = await claimForHold(ID, { type: 'admin', id: 'ops' })
    expect(res.applied).toBe(true)
    expect(row().payment_state).toBe('placing_hold')
    expect(Date.parse(row().payment_lease_until as string)).toBeGreaterThan(Date.now() + (LEASE_SECONDS - 5) * 1000)
    expect(ledger('hold_started')).toHaveLength(1)
    expect(ledger('hold_started')[0].actor_type).toBe('admin')
  })

  it('a placing_hold row with a live lease -> applied false', async () => {
    const res = await claimForHold(ID, { type: 'admin', id: 'ops' })
    expect(res).toEqual({ applied: false })
  })

  it('authorized and captured rows are not claimable', async () => {
    seed({ payment_state: 'authorized', payment_lease_until: null })
    expect((await claimForHold(ID, ACTOR)).applied).toBe(false)
    seed({ payment_state: 'captured', payment_lease_until: null })
    expect((await claimForHold(ID, ACTOR)).applied).toBe(false)
  })
})

describe('releaseHold and cancelHoldIntent', () => {
  async function authorizedHold(over: Record<string, unknown> = {}) {
    const pi = (await fake.stripe.paymentIntents.create({
      amount: 12000,
      currency: 'eur',
      capture_method: 'manual',
      confirm: true,
      payment_method: 'pm_ok',
      metadata: { kind: 'card_hold', cofBookingId: ID },
    })) as { id: string }
    seed({ payment_state: 'authorized', payment_lease_until: null, hold_payment_intent_id: pi.id, hold_attempts: 2, ...over })
    fake.calls.length = 0
    return pi.id
  }

  it('authorized -> cancels the PaymentIntent (requested by us, key rel:<id>:<n>) and moves to released', async () => {
    const piId = await authorizedHold()
    const res = await releaseHold(fresh(), { actor: { type: 'admin', id: 'ops' }, reason: 'operator' })
    expect(res).toBe('released')
    const cancels = fake.callsTo('paymentIntents.cancel')
    expect(cancels).toHaveLength(1)
    expect(cancels[0].targetId).toBe(piId)
    expect(cancels[0].params).toEqual({ cancellation_reason: 'requested_by_customer' })
    expect(cancels[0].idempotencyKey).toBe(`rel:${ID}:2`)
    expect(row().payment_state).toBe('released')
    expect(ledger('hold_released')).toHaveLength(1)
    expect(fake.state.paymentIntents.get(piId)!.status).toBe('canceled')
  })

  it('an already-canceled PaymentIntent counts as success', async () => {
    const piId = await authorizedHold()
    fake.expireHold(piId, 'expired')
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('released')
    expect(row().payment_state).toBe('released')
  })

  it('cancelHoldIntent without a hold id does nothing', async () => {
    seed({ payment_state: 'card_saved', payment_lease_until: null })
    await cancelHoldIntent(fresh())
    expect(fake.calls).toHaveLength(0)
  })

  it.each(['card_saved', 'failed', 'expired', 'checkout_pending'])('%s -> released without a Stripe call', async (state) => {
    seed({ payment_state: state, payment_lease_until: null })
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('released')
    expect(row().payment_state).toBe('released')
    expect(fake.calls).toHaveLength(0)
    expect(ledger('hold_released')).toHaveLength(1)
  })

  it('checkout_pending with a hold-now PaymentIntent voids it (key pi_void:<pi>) before releasing (88-REVIEW T6)', async () => {
    const pi = (await fake.stripe.paymentIntents.create({
      amount: 12000,
      currency: 'eur',
      capture_method: 'manual',
      metadata: { kind: 'card_hold_now', cofBookingId: ID },
    })) as { id: string }
    seed({ payment_state: 'checkout_pending', status: 'unpaid', payment_lease_until: null, hold_payment_intent_id: pi.id })
    fake.calls.length = 0
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('released')
    const cancels = fake.callsTo('paymentIntents.cancel')
    expect(cancels).toHaveLength(1)
    expect(cancels[0].targetId).toBe(pi.id)
    expect(cancels[0].idempotencyKey).toBe(`pi_void:${pi.id}`)
    expect(fake.state.paymentIntents.get(pi.id)!.status).toBe('canceled')
    // A 3DS completed afterwards can not authorize: the PaymentIntent is canceled at Stripe.
    expect(row().payment_state).toBe('released')
  })

  it('checkout_pending whose PaymentIntent can not be voided throws and stays checkout_pending', async () => {
    seed({ payment_state: 'checkout_pending', status: 'unpaid', payment_lease_until: null, hold_payment_intent_id: 'pi_missing' })
    await expect(releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).rejects.toThrow()
    expect(row().payment_state).toBe('checkout_pending')
  })

  it('balance_due with reason waive -> released with a waived ledger row', async () => {
    seed({ payment_state: 'balance_due', payment_lease_until: null })
    expect(await releaseHold(fresh(), { actor: { type: 'admin', id: 'ops' }, reason: 'waive' })).toBe('released')
    expect(row().payment_state).toBe('released')
    expect(ledger('waived')).toHaveLength(1)
  })

  it('balance_due without a waiver is left as it is', async () => {
    seed({ payment_state: 'balance_due', payment_lease_until: null })
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('noop')
    expect(row().payment_state).toBe('balance_due')
  })

  it('capturing and placing_hold answer busy; captured and released answer noop', async () => {
    seed({ payment_state: 'capturing' })
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('busy')
    seed({ payment_state: 'placing_hold' })
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('busy')
    seed({ payment_state: 'captured', payment_lease_until: null })
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('noop')
    seed({ payment_state: 'released', payment_lease_until: null })
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('noop')
    expect(fake.calls).toHaveLength(0)
  })

  it('a booking that moved to capturing between read and write answers busy (the cancel never half-applies)', async () => {
    await authorizedHold()
    const stale = fresh()
    row().payment_state = 'capturing'
    row().payment_lease_until = new Date(Date.now() + 300_000).toISOString()
    const res = await releaseHold(stale, { actor: ACTOR, reason: 'cancel' })
    expect(res).toBe('busy')
    expect(row().payment_state).toBe('capturing')
  })

  it('a recovery link on the booking is deactivated after the release', async () => {
    seed({ payment_state: 'failed', payment_lease_until: null, recovery_link_id: 'plink_123' })
    expect(await releaseHold(fresh(), { actor: ACTOR, reason: 'cancel' })).toBe('released')
    expect(mockDeactivateLink).toHaveBeenCalledWith('plink_123')
  })

  it('a release replay changes nothing (ledger key)', async () => {
    await authorizedHold()
    const snapshot = fresh()
    expect(await releaseHold(snapshot, { actor: ACTOR, reason: 'cancel' })).toBe('released')
    // The same stale row again: the booking is released now, the ledger key already exists.
    expect(['released', 'noop']).toContain(await releaseHold(snapshot, { actor: ACTOR, reason: 'cancel' }))
    expect(ledger('hold_released')).toHaveLength(1)
  })
})
