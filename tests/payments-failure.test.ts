// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 88 plan 88-14 (HOLD-05, PAYF-03, MAIL-01, D-13, D-14, D-15): a declined hold / charge / difference reaches the
 * client as a recovery Payment Link in their language and the operator as a Resend email, exactly once per attempt.
 * The real renderer and the real sender run; only Resend, Supabase and Stripe are doubles.
 */

const { world, mockResendSend, mockDeactivateLink } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
  },
  mockResendSend: vi.fn(),
  mockDeactivateLink: vi.fn(),
}))

process.env.RESEND_API_KEY = 're_test'

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
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))
vi.mock('@/lib/stripe-payment-links', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/stripe-payment-links')>()),
  deactivateBookingPaymentLink: mockDeactivateLink,
}))

// The checkout reconcile of step E is not under test here.
vi.mock('@/lib/stripe-webhook/card-confirm', () => ({
  applySetupSucceeded: vi.fn(),
  applyHoldNowAuthorized: vi.fn(),
}))

import { placeHold } from '@/lib/payments/hold'
import { settleBooking } from '@/lib/payments/settle'
import { runPaymentTick } from '@/lib/payments/tick'
import { handlePaymentFailure, refreshRecoveryLink } from '@/lib/payments/recovery'
import { sendPaymentOperatorAlert, OPERATOR_ALERT_KINDS } from '@/lib/payments/alerts'
import { createRecoveryPaymentLink } from '@/lib/stripe-payment-links'

const ID = '66666666-6666-4666-8666-666666666666'
const REF = 'PRG-20261201-FAIL01'
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
    booking_reference: REF,
    client_email: 'anna@example.com',
    client_first_name: 'Anna',
    client_last_name: 'Novak',
    locale: 'ru',
    pickup_date: '2026-12-01',
    pickup_time: '14:00',
    origin_address: 'Prague Airport',
    destination_address: 'Vienna',
    vehicle_class: 'business',
    passengers: 2,
    pickup_utc: new Date(now + 72 * HOUR).toISOString(),
    hold_at: new Date(now - 60_000).toISOString(),
    payment_currency: 'eur',
    payment_amount_minor: 12000,
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_decline_insufficient',
    payment_link_id: 'plink_paynow',
    payment_link_url: 'https://buy.stripe.test/paynow',
    ...over,
  }
}

function seed(over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({ bookings: [booking(over)] })
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const fresh = () => ({ ...row() }) as Record<string, unknown>
const ledger = (kind?: string) =>
  db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))

interface Sent {
  from: string
  to: string[]
  subject: string
  html?: string
  text?: string
}
const sent = (): Sent[] => mockResendSend.mock.calls.map((c) => c[0] as Sent)
const clientMails = () => sent().filter((m) => m.to[0] === 'anna@example.com')
const operatorMails = () => sent().filter((m) => m.to[0] === 'owner@example.com')

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MANAGER_EMAIL = 'owner@example.com'
  fake = createFakeStripe()
  world.stripe = fake.stripe
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  mockDeactivateLink.mockResolvedValue(undefined)
  seed()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tracer: a declined scheduled hold', () => {
  it('creates one recovery link, emails the client in their language and alerts the operator', async () => {
    const res = await placeHold(fresh(), ACTOR)
    expect(res).toEqual({ outcome: 'failed', code: 'insufficient_funds' })
    expect(row().payment_state).toBe('failed')
    expect(row().hold_attempts).toBe(1)

    // The recovery link: card_recovery metadata on the link and on the PaymentIntent, no legacy booking-id key.
    const creates = fake.callsTo('paymentLinks.create')
    expect(creates).toHaveLength(1)
    const params = creates[0].params as {
      line_items: Array<{ price_data: { currency: string; unit_amount: number }; quantity: number }>
      payment_method_types: string[]
      restrictions: { completed_sessions: { limit: number } }
      metadata: Record<string, string>
      payment_intent_data: { metadata: Record<string, string> }
    }
    expect(params.line_items[0].price_data.currency).toBe('eur')
    expect(params.line_items[0].price_data.unit_amount).toBe(12000)
    expect(params.payment_method_types).toEqual(['card'])
    expect(params.restrictions.completed_sessions.limit).toBe(1)
    const expectedMeta = { kind: 'card_recovery', cofBookingId: ID, attempt: '1', bookingReference: REF }
    expect(params.metadata).toEqual(expectedMeta)
    expect(params.payment_intent_data.metadata).toEqual(expectedMeta)
    expect(params.metadata).not.toHaveProperty('bookingId')
    expect(creates[0].idempotencyKey).toBe(`link:${ID}:1`)

    // Persisted separately from the pay-now link.
    const linkId = [...fake.state.paymentLinks.keys()][0]
    expect(row().recovery_link_id).toBe(linkId)
    expect(row().recovery_link_url).toBe(`https://buy.stripe.test/${linkId}`)
    expect(row().payment_link_id).toBe('plink_paynow')
    expect(row().payment_link_url).toBe('https://buy.stripe.test/paynow')
    expect(ledger('recovery_link_created')).toHaveLength(1)

    // One localized payment_failed email with the link inside the filled button.
    expect(clientMails()).toHaveLength(1)
    const mail = clientMails()[0]
    expect(mail.html).toContain('<html lang="ru"')
    expect(mail.html).toContain(`href="https://buy.stripe.test/${linkId}"`)
    expect(mail.html?.match(/background-color: #BFA06A; color: #0F1D2C/g)).toHaveLength(1)
    expect(mail.html).not.toMatch(/cancel/i)

    // One operator email.
    expect(operatorMails()).toHaveLength(1)
    const alert = operatorMails()[0]
    expect(alert.subject).toBe(`[Payment] Hold failed — ${REF}`)
    expect(alert.text).toContain('One automatic retry runs at ')
    expect(alert.text).toContain(`Booking reference: ${REF}`)
    expect(alert.text).toContain('Reason code: insufficient_funds')
    expect(alert.text).toContain('/admin/bookings')
    expect(alert.html).toBeUndefined()
  })

  it('running the failure handling again for the same attempt sends and creates nothing more', async () => {
    await placeHold(fresh(), ACTOR)
    const mailsBefore = mockResendSend.mock.calls.length
    const ledgerBefore = ledger().length
    const linksBefore = fake.state.paymentLinks.size

    await handlePaymentFailure(fresh(), { phase: 'hold', code: 'insufficient_funds', amountMinor: 12000, attempt: 1 })

    expect(mockResendSend.mock.calls.length).toBe(mailsBefore)
    expect(ledger().length).toBe(ledgerBefore)
    expect(fake.state.paymentLinks.size).toBe(linksBefore)
    expect(fake.executed('paymentLinks.create')).toBe(1)
  })

  it('authentication_required uses the auth_required variant', async () => {
    seed({ stripe_payment_method_id: 'pm_auth_required', locale: 'en' })
    const res = await placeHold(fresh(), ACTOR)
    expect(res.code).toBe('authentication_required')
    expect(clientMails()).toHaveLength(1)
    expect(clientMails()[0].html).toContain('Your bank needs you to confirm this payment.')
    expect(operatorMails()[0].text).toContain('Reason code: authentication_required')
  })

  it('a link that can not be created: no client email, the operator is still alerted, nothing throws', async () => {
    world.stripe = {
      ...(fake.stripe as Record<string, unknown>),
      paymentLinks: { create: vi.fn().mockRejectedValue(new Error('stripe down')), update: vi.fn() },
    }
    const res = await placeHold(fresh(), ACTOR)
    expect(res.outcome).toBe('failed')
    expect(clientMails()).toHaveLength(0)
    expect(operatorMails()).toHaveLength(1)
    expect(operatorMails()[0].text).toContain('client was NOT emailed')
    expect(operatorMails()[0].text).toContain('Send payment link')
    expect(row().recovery_link_id).toBeNull()
  })

  it('MANAGER_EMAIL unset: the alert returns failed, logs the booking id and never throws', async () => {
    delete process.env.MANAGER_EMAIL
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await sendPaymentOperatorAlert('hold_failed', fresh(), { eventKey: `alert:hold_failed:${ID}:1` })
    expect(result).toBe('failed')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('MANAGER_EMAIL'), expect.objectContaining({ bookingId: ID }))
    expect(sent()).toHaveLength(0)

    // Through the whole failure path too: the client still gets the link.
    spy.mockClear()
    await expect(placeHold(fresh(), ACTOR)).resolves.toMatchObject({ outcome: 'failed' })
    expect(clientMails()).toHaveLength(1)
    expect(operatorMails()).toHaveLength(0)
  })

  it('a failed Resend send keeps the claim: the alert is not sent twice and the failure is in the ledger', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockResendSend.mockResolvedValueOnce({ data: null, error: { message: 'rejected' } })
    const first = await sendPaymentOperatorAlert('dispute', fresh(), { eventKey: `alert:dispute:${ID}:dp_1`, code: 'fraudulent' })
    expect(first).toBe('failed')
    expect(ledger('alert_sent').map((e) => e.event_key)).toEqual([`alert:dispute:${ID}:dp_1`, `alert:dispute:${ID}:dp_1:send_failed`])
    const second = await sendPaymentOperatorAlert('dispute', fresh(), { eventKey: `alert:dispute:${ID}:dp_1`, code: 'fraudulent' })
    expect(second).toBe('duplicate')
  })

  it('exposes every operator alert kind of the contract', () => {
    expect([...OPERATOR_ALERT_KINDS]).toEqual([
      'hold_failed',
      'charge_failed',
      'balance_unpaid',
      'hold_expiring',
      'no_valid_hold_24h',
      'refund_failed',
      'dispute',
    ])
  })
})

describe('recovery link (Pitfall 12, T-88-42, T-88-43)', () => {
  it('createRecoveryPaymentLink builds a czk link in minor units with the card_recovery metadata', async () => {
    const link = await createRecoveryPaymentLink({
      bookingId: ID,
      bookingReference: REF,
      amountMinor: 450000,
      currency: 'czk',
      tag: 'c2',
    })
    expect(link.url).toMatch(/^https:\/\//)
    const call = fake.callsTo('paymentLinks.create')[0]
    expect((call.params.line_items as Array<{ price_data: { currency: string; unit_amount: number } }>)[0].price_data).toMatchObject({
      currency: 'czk',
      unit_amount: 450000,
    })
    expect((call.params.metadata as Record<string, string>).attempt).toBe('c2')
    expect(call.idempotencyKey).toBe(`link:${ID}:c2`)
  })

  it('refuses a non-positive or fractional amount', async () => {
    await expect(
      createRecoveryPaymentLink({ bookingId: ID, bookingReference: REF, amountMinor: 0, currency: 'eur', tag: 1 }),
    ).rejects.toThrow()
    await expect(
      createRecoveryPaymentLink({ bookingId: ID, bookingReference: REF, amountMinor: 10.5, currency: 'eur', tag: 1 }),
    ).rejects.toThrow()
  })

  it('a new link deactivates the stale one it replaces', async () => {
    seed({ payment_state: 'failed', recovery_link_id: 'plink_stale', recovery_link_url: 'https://buy.stripe.test/stale' })
    const link = await refreshRecoveryLink(fresh(), 9000, 2)
    expect(link).not.toBeNull()
    expect(mockDeactivateLink).toHaveBeenCalledWith('plink_stale')
    expect(row().recovery_link_id).toBe(link!.id)
    expect(row().recovery_link_url).toBe(link!.url)
  })

  it('a booking that is not in a payable state gets no link', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seed({ payment_state: 'captured' })
    expect(await refreshRecoveryLink(fresh(), 9000, 1)).toBeNull()
    expect(fake.callsTo('paymentLinks.create')).toHaveLength(0)
  })

  it('a stale link that can not be deactivated does not block the new one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDeactivateLink.mockRejectedValue(new Error('stripe down'))
    seed({ payment_state: 'failed', recovery_link_id: 'plink_stale' })
    const link = await refreshRecoveryLink(fresh(), 9000, 2)
    expect(link).not.toBeNull()
  })
})

describe('declined charge and difference (settle failure branches)', () => {
  function completedBooking(over: Record<string, unknown> = {}) {
    return {
      status: 'completed',
      completed_at: new Date(Date.now() - HOUR).toISOString(),
      pickup_utc: new Date(Date.now() - 5 * HOUR).toISOString(),
      payment_state: 'expired',
      payment_lease_until: null,
      charge_attempts: 0,
      locale: 'en',
      ...over,
    }
  }

  it('a declined fallback charge: link for the amount owed, email, "Charge failed" alert with the retry time', async () => {
    seed(completedBooking())
    const res = await settleBooking(ID, ACTOR)
    expect(res).toEqual({ outcome: 'failed', code: 'insufficient_funds' })

    const create = fake.callsTo('paymentLinks.create')
    expect(create).toHaveLength(1)
    expect(create[0].idempotencyKey).toBe(`link:${ID}:c1`)
    expect((create[0].params.line_items as Array<{ price_data: { unit_amount: number } }>)[0].price_data.unit_amount).toBe(12000)
    expect((create[0].params.metadata as Record<string, string>).attempt).toBe('c1')
    expect(row().recovery_link_id).toBe([...fake.state.paymentLinks.keys()][0])

    expect(clientMails()).toHaveLength(1)
    expect(operatorMails()).toHaveLength(1)
    expect(operatorMails()[0].subject).toBe(`[Payment] Charge failed — ${REF}`)
    expect(operatorMails()[0].text).toContain('Retry or send the link again from the booking.')
    expect(operatorMails()[0].text).toContain('One automatic retry runs at ')
    expect(ledger('email_sent').map((e) => e.event_key)).toContain(`email:payment_failed:${ID}:charge:1`)
    expect(ledger('alert_sent').map((e) => e.event_key)).toContain(`alert:charge_failed:${ID}:1`)
  })

  it('a declined price difference: link, email and alert are for the difference only', async () => {
    const hold = (await fake.stripe.paymentIntents.create({
      amount: 12000,
      currency: 'eur',
      customer: 'cus_1',
      payment_method: 'pm_ok',
      capture_method: 'manual',
      off_session: true,
      confirm: true,
      metadata: { kind: 'card_hold', cofBookingId: ID, attempt: '0', bookingReference: REF },
    })) as { id: string }
    seed(
      completedBooking({
        payment_state: 'authorized',
        hold_payment_intent_id: hold.id,
        hold_amount_minor: 12000,
        payment_amount_minor: 15000,
      }),
    )
    const res = await settleBooking(ID, ACTOR)
    expect(res.outcome).toBe('balance_due')
    expect(row().payment_state).toBe('balance_due')
    expect(row().captured_amount_minor).toBe(12000)

    const create = fake.callsTo('paymentLinks.create')
    expect(create).toHaveLength(1)
    expect(create[0].idempotencyKey).toBe(`link:${ID}:d1`)
    expect((create[0].params.line_items as Array<{ price_data: { unit_amount: number } }>)[0].price_data.unit_amount).toBe(3000)
    expect(row().recovery_link_url).toBe(`https://buy.stripe.test/${[...fake.state.paymentLinks.keys()][0]}`)

    expect(clientMails()).toHaveLength(1)
    expect(operatorMails()[0].subject).toBe(`[Payment] Balance unpaid — ${REF}`)
    expect(operatorMails()[0].text).toContain('The trip amount was captured. The extra')
    expect(operatorMails()[0].text).toContain('€30')
    expect(operatorMails()[0].text).not.toContain('automatic retry')
    // The recovery payment will need its own ledger key: the captured:<mainPi> row is already taken.
    expect(ledger('captured').map((e) => e.event_key)).toEqual([`captured:${hold.id}`])
  })
})

describe('the automatic retry end to end (D-13, D-15)', () => {
  it('a retry that declines again emails and alerts once more and says no retry is left; nothing is cancelled', async () => {
    seed({
      payment_state: 'failed',
      locale: 'en',
      hold_attempts: 1,
      last_payment_error: 'insufficient_funds',
      payment_failed_at: new Date(Date.now() - 12 * HOUR - 60_000).toISOString(),
      payment_retry_at: new Date(Date.now() - 60_000).toISOString(),
      payment_retry_count: 0,
      payment_lease_until: null,
      hold_at: new Date(Date.now() - 13 * HOUR).toISOString(),
      pickup_utc: new Date(Date.now() + 40 * HOUR).toISOString(),
    })
    const res = await runPaymentTick()
    expect(res).toMatchObject({ retried: 1, failed: 1, errors: [] })

    expect(row().payment_state).toBe('failed')
    expect(row().hold_attempts).toBe(2)
    expect(row().payment_retry_at).toBeNull()
    expect(row().status).toBe('confirmed')

    // Attempt 2: its own link (key link:<id>:2), its own email and alert keys.
    expect(fake.callsTo('paymentLinks.create').map((c) => c.idempotencyKey)).toEqual([`link:${ID}:2`])
    expect(clientMails()).toHaveLength(1)
    expect(operatorMails()).toHaveLength(1)
    expect(operatorMails()[0].text).toContain('No automatic retries are left. Use Retry or Send payment link.')
    expect(operatorMails()[0].text).not.toContain('One automatic retry runs')
    expect(ledger('alert_sent').map((e) => e.event_key)).toContain(`alert:hold_failed:${ID}:2`)

    // A further tick does nothing more.
    await runPaymentTick()
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)
    expect(clientMails()).toHaveLength(1)
  })

  it('the source never cancels a booking from the retry, alert or recovery code (D-15)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    for (const file of ['lib/payments/tick.ts', 'lib/payments/recovery.ts', 'lib/payments/alerts.ts']) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
      expect(src.match(/\.update\(\{[^}]*status:/g)).toBeNull()
    }
  })
})
