// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { FakeStripeError, createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { FIRST_PICKUP_MS, seedPaidQuote, type PaidQuoteFixture } from './helpers/quote-cancel-fixture'
import ruMessages from '@/messages/ru.json'
import enMessages from '@/messages/en.json'

/**
 * Phase 92 plan 92-22 (QUOTE-03, QUOTE-04; D-03, D-06, D-11, D-12, D-13): cancelling a paid quote and refunding money on
 * it. The real quote cancel runs on top of the real cancel engine (cancelBooking) over the stateful fakes: the payments
 * database, the Stripe double and a Resend double. Tracer: a paid two-trip saved-card quote cancelled inside the free
 * window releases both trips, refunds the whole deposit once under the fixed key, records cancelled and deposit_refunded
 * and sends ONE Russian cancellation email.
 */

const { world, mockResendSend, mockPaymentAlert, mockTripEmail, mockPaymentEmail } = vi.hoisted(() => ({
  world: {
    db: null as unknown as FakePaymentsDb,
    stripe: null as unknown,
  },
  mockResendSend: vi.fn(),
  mockPaymentAlert: vi.fn(),
  mockTripEmail: vi.fn(),
  mockPaymentEmail: vi.fn(),
}))

process.env.RESEND_API_KEY = 're_test'

/** advance_booking_status (migration 084) is not part of the payments fake: a compare-and-set on bookings.status. */
async function advanceRpc(args: Record<string, unknown>) {
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
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: mockPaymentAlert }))
vi.mock('@/lib/payments/emails/send', () => ({ sendPaymentEmail: mockPaymentEmail, bookingEmailDataFromRow: (r: unknown) => r }))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: vi.fn() }))
vi.mock('@/lib/booking-status-service', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/booking-status-service')>()),
  scheduleCancelRouteEmail: mockTripEmail,
}))

import { cancelQuote, previewQuoteCancel, readQuoteCancelPreview, refundQuotePayment } from '@/lib/quotes/cancel'
import { cancelBooking } from '@/lib/payments/cancel'
import { stripeKeys } from '@/lib/payments/stripe'
import { formatMinor } from '@/lib/payments/money'

const HOUR = 3_600_000
const ADMIN = { id: 'admin-1' }
/** Far outside the 48 free hours of the fixture. */
const FREE_NOW = FIRST_PICKUP_MS - 10 * 24 * HOUR
/** Inside the 48 free hours: the cancel is late. */
const LATE_NOW = FIRST_PICKUP_MS - 24 * HOUR

let db: FakePaymentsDb
let fake: FakeStripe

const quoteRow = (id: string) => db.state.quotes.find((q) => q.id === id)!
const events = (id: string, kind?: string) => db.state.quote_events.filter((e) => e.quote_id === id && (kind ? e.kind === kind : true))
const tripStatuses = (f: PaidQuoteFixture) => f.bookingIds.map((id) => db.state.bookings.find((b) => b.id === id)!.status)
const mailsTo = (to: string) => mockResendSend.mock.calls.map((c) => c[0] as { to: string[]; subject: string; html: string }).filter((m) => m.to.includes(to))
/** A catalog sentence as the shell renders it: the reference sits in its own left-to-right span. */
const inHtml = (sentence: string, reference: string) => sentence.replace('{reference}', `<bdi dir="ltr">${reference}</bdi>`)
const refundCalls = () => fake.callsTo('refunds.create')

async function seed(over: Parameters<typeof seedPaidQuote>[2] = {}, nowMs = FREE_NOW): Promise<PaidQuoteFixture> {
  vi.setSystemTime(nowMs)
  return seedPaidQuote(db, fake, over)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  process.env.MANAGER_EMAIL = 'owner@example.com'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  db = createFakePaymentsDb({ nowMs: FREE_NOW })
  fake = createFakeStripe()
  world.db = db
  world.stripe = fake.stripe
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tracer: a paid quote cancelled inside the free window', () => {
  it('releases both trips, refunds the whole deposit once, records the events and sends one Russian email', async () => {
    const f = await seed({ locale: 'ru', depositRefunded: 0 })
    fake.calls.length = 0

    const result = await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })

    expect(result).toEqual({ ok: true, outcome: 'free', refundedMinor: 5000, refundFailed: false })
    // Both trips are cancelled by the engine, with no fee case and no per-trip client email.
    expect(tripStatuses(f)).toEqual(['cancelled', 'cancelled'])
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(mockTripEmail).not.toHaveBeenCalled()

    // One refund of the whole deposit under the fixed key.
    expect(refundCalls()).toHaveLength(1)
    expect(refundCalls()[0].params).toMatchObject({ payment_intent: f.depositIntent, amount: 5000 })
    expect(refundCalls()[0].idempotencyKey).toBe(`refund:quote:${f.quoteId}:deposit:5000`)
    expect(refundCalls()[0].idempotencyKey).toBe(stripeKeys.quoteRefund(f.quoteId, 'deposit:5000'))

    expect(quoteRow(f.quoteId)).toMatchObject({
      cancel_initiator: 'admin_client',
      cancel_outcome: 'free',
      deposit_refunded_minor: 5000,
      remainder_refunded_minor: 0,
    })
    expect(typeof quoteRow(f.quoteId).cancelled_at).toBe('string')
    // The status stays paid; the derived status says cancelled.
    expect(quoteRow(f.quoteId).status).toBe('paid')

    const kinds = events(f.quoteId).map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['admin_action', 'cancelled', 'deposit_refunded']))
    // The audit row is written before the money moves.
    expect(kinds.indexOf('admin_action')).toBeLessThan(kinds.indexOf('deposit_refunded'))
    expect(events(f.quoteId, 'deposit_refunded')[0]).toMatchObject({ amount_minor: 5000, currency: 'eur' })

    // ONE client email, in the quote language, with the refund sentence.
    const mails = mailsTo(f.email)
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toBe(ruMessages.QuoteEmails.cancelled.subject.replace('{reference}', f.reference))
    expect(mails[0].html).toContain('lang="ru"')
    expect(mails[0].html).toContain('Мы возвращаем')
    expect(mails[0].html).toContain(inHtml(ruMessages.QuoteEmails.cancelled.introClient, f.reference))
    expect(mails[0].html).toContain(formatMinor(5000, 'eur'))
    expect(mails[0].html).not.toContain('остаётся у нас')
    // No other mail goes to the client and none to the operator on this path.
    expect(mockResendSend).toHaveBeenCalledTimes(1)
  })

  it('admin_prestigo after the free deadline is free too and uses the Prestigo sentence', async () => {
    const f = await seed({ locale: 'ru' }, LATE_NOW)

    const result = await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_prestigo', refundMinor: 0, actor: ADMIN })

    // refundMinor is ignored when free: the whole deposit goes back.
    expect(result).toEqual({ ok: true, outcome: 'free', refundedMinor: 5000, refundFailed: false })
    expect(quoteRow(f.quoteId)).toMatchObject({ cancel_initiator: 'admin_prestigo', cancel_outcome: 'free', deposit_refunded_minor: 5000 })
    const [mail] = mailsTo(f.email)
    expect(mail.html).toContain(inHtml(ruMessages.QuoteEmails.cancelled.introPrestigo, f.reference))
    expect(mail.html).not.toContain(inHtml(ruMessages.QuoteEmails.cancelled.introClient, f.reference))
  })

  it('previewQuoteCancel is pure and agrees: free before the deadline, the whole deposit proposed', async () => {
    const f = await seed()
    const preview = await readQuoteCancelPreview(f.quoteId, 'admin_client', FREE_NOW)
    expect(preview).toEqual({
      ok: true,
      preview: {
        outcome: 'free',
        freeUntilMs: FIRST_PICKUP_MS - 48 * HOUR,
        depositMinor: 5000,
        refundedMinor: 0,
        keptMinor: 0,
        proposedRefundMinor: 5000,
        remainderRefundMinor: 0,
      },
    })
    // The deadline itself is still free (up to and including).
    const q = quoteRow(f.quoteId) as never
    const version = db.state.quote_versions.find((v) => v.id === f.versionId) as never
    const lines = db.state.quote_version_lines.filter((l) => l.version_id === f.versionId) as never
    expect(previewQuoteCancel(q, version, lines, FIRST_PICKUP_MS - 48 * HOUR, 'admin_client').outcome).toBe('free')
    expect(previewQuoteCancel(q, version, lines, FIRST_PICKUP_MS - 48 * HOUR + 1, 'admin_client').outcome).toBe('late')
  })
})

describe('refusals change nothing', () => {
  it('an unknown quote is not_found', async () => {
    await seed()
    expect(await cancelQuote({ quoteId: '00000000-0000-4000-8000-000000000999', initiator: 'admin_client', refundMinor: null, actor: ADMIN })).toEqual({
      ok: false,
      code: 'not_found',
    })
  })

  it('a quote that was never paid is not_paid and its trips are untouched', async () => {
    const f = await seed({ quote: { paid_at: null, status: 'accepted' } })
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })).toEqual({ ok: false, code: 'not_paid' })
    expect(tripStatuses(f)).toEqual(['confirmed', 'confirmed'])
    expect(refundCalls()).toHaveLength(0)
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('cancelling twice answers already_cancelled and refunds nothing more', async () => {
    const f = await seed()
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })).toMatchObject({ ok: true })
    fake.calls.length = 0
    mockResendSend.mockClear()
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })).toEqual({
      ok: false,
      code: 'already_cancelled',
    })
    expect(refundCalls()).toHaveLength(0)
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it.each(['en_route', 'on_location', 'on_board', 'completed', 'no_show'])('a trip that is %s makes the whole cancel 422 trips_started', async (status) => {
    const f = await seed({ tripStatuses: ['confirmed', status] })
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })).toEqual({
      ok: false,
      code: 'trips_started',
    })
    // Nothing changed: the first trip is not cancelled, the quote is not cancelled, no money moved.
    expect(db.state.bookings.find((b) => b.id === f.bookingIds[0])!.status).toBe('confirmed')
    expect(quoteRow(f.quoteId).cancelled_at ?? null).toBeNull()
    expect(refundCalls()).toHaveLength(0)
    expect(mockResendSend).not.toHaveBeenCalled()
    expect(events(f.quoteId)).toHaveLength(0)
  })
})

/** An English catalog sentence as the shell renders it, for one amount. */
const en = (sentence: string, amountMinor: number) => sentence.replace('{amount}', `<bdi dir="ltr">${formatMinor(amountMinor, 'eur')}</bdi>`)
const EN = enMessages.QuoteEmails

describe('D-11: a late cancel keeps the deposit under the stored terms', () => {
  it('D-11 fee 100: the preview proposes nothing back, the cancel with 0 refunds nothing and the email says the deposit is kept', async () => {
    const f = await seed({ feePercent: 100 }, LATE_NOW)
    const pre = await readQuoteCancelPreview(f.quoteId, 'admin_client', LATE_NOW)
    expect(pre).toMatchObject({ ok: true, preview: { outcome: 'late', keptMinor: 5000, proposedRefundMinor: 0, depositMinor: 5000 } })
    fake.calls.length = 0

    const result = await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: 0, actor: ADMIN })

    expect(result).toEqual({ ok: true, outcome: 'late', refundedMinor: 0, refundFailed: false })
    expect(refundCalls()).toHaveLength(0)
    // The trips are released without a fee: a quote trip is free on the trip side, only the deposit is at stake.
    expect(tripStatuses(f)).toEqual(['cancelled', 'cancelled'])
    expect(db.state.booking_fee_cases).toHaveLength(0)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(quoteRow(f.quoteId)).toMatchObject({ cancel_outcome: 'late', cancel_initiator: 'admin_client', deposit_refunded_minor: 0 })
    expect(events(f.quoteId, 'deposit_refunded')).toHaveLength(0)
    const mails = mailsTo(f.email)
    expect(mails).toHaveLength(1)
    expect(mails[0].html).toContain(en(EN.cancelled.kept, 5000))
    expect(mails[0].html).not.toContain('We are refunding')
    expect(mails[0].html).toContain(EN.cancelled.nothingCharged)
  })

  it('D-11 fee 50: the preview proposes half; confirming it refunds half and the email names refund and kept', async () => {
    const f = await seed({ feePercent: 50 }, LATE_NOW)
    expect(await readQuoteCancelPreview(f.quoteId, 'admin_client', LATE_NOW)).toMatchObject({
      preview: { outcome: 'late', keptMinor: 2500, proposedRefundMinor: 2500 },
    })

    const result = await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: 2500, actor: ADMIN })

    expect(result).toEqual({ ok: true, outcome: 'late', refundedMinor: 2500, refundFailed: false })
    expect(refundCalls()).toHaveLength(1)
    expect(refundCalls()[0].params).toMatchObject({ amount: 2500 })
    expect(refundCalls()[0].idempotencyKey).toBe(`refund:quote:${f.quoteId}:deposit:2500`)
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(2500)
    const [mail] = mailsTo(f.email)
    expect(mail.html).toContain(en(EN.cancelled.refund, 2500))
    expect(mail.html).toContain(en(EN.cancelled.kept, 2500))
  })

  it('D-11: the operator may return more than proposed, up to the whole deposit, and then nothing is kept', async () => {
    const f = await seed({ feePercent: 100 }, LATE_NOW)
    const result = await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: 5000, actor: ADMIN })
    expect(result).toMatchObject({ ok: true, outcome: 'late', refundedMinor: 5000 })
    const [mail] = mailsTo(f.email)
    expect(mail.html).toContain(en(EN.cancelled.refund, 5000))
    expect(mail.html).not.toContain('is kept')
  })

  it.each([
    ['above the deposit', 5001],
    ['negative', -1],
    ['fractional', 10.5],
    ['missing', null],
  ])('D-11: a late refund %s is refund_out_of_range and nothing changes', async (_name, refundMinor) => {
    const f = await seed({}, LATE_NOW)
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: refundMinor as number | null, actor: ADMIN })).toEqual({
      ok: false,
      code: 'refund_out_of_range',
    })
    expect(tripStatuses(f)).toEqual(['confirmed', 'confirmed'])
    expect(quoteRow(f.quoteId).cancelled_at ?? null).toBeNull()
    expect(refundCalls()).toHaveLength(0)
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('D-11: what was refunded already counts against the bound (deposit minus refunded)', async () => {
    const f = await seed({ depositRefunded: 2000 }, LATE_NOW)
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: 3001, actor: ADMIN })).toEqual({
      ok: false,
      code: 'refund_out_of_range',
    })
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: 3000, actor: ADMIN })).toMatchObject({ ok: true, refundedMinor: 3000 })
    // Stripe was asked for the part, never for the deposit again; the key tells the two refunds apart.
    expect(refundCalls()[0].params).toMatchObject({ amount: 3000 })
    expect(refundCalls()[0].idempotencyKey).toBe(`refund:quote:${f.quoteId}:deposit:3000:2000`)
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(5000)
  })

  it('D-11: a free cancel after a partial refund returns only what is left', async () => {
    const f = await seed({ depositRefunded: 1000 })
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })).toEqual({
      ok: true,
      outcome: 'free',
      refundedMinor: 4000,
      refundFailed: false,
    })
    expect(refundCalls()[0].params).toMatchObject({ amount: 4000 })
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(5000)
  })

  it('D-11: a remainder paid on the quote page is refunded in full on a free cancel, in addition to the deposit', async () => {
    const f = await seed({ remainderPaid: { intent: 'pi_rem_1', amount: 7000 } })
    const result = await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })
    expect(result).toEqual({ ok: true, outcome: 'free', refundedMinor: 12000, refundFailed: false })
    expect(refundCalls().map((c) => [c.params.payment_intent, c.params.amount, c.idempotencyKey])).toEqual([
      [f.depositIntent, 5000, `refund:quote:${f.quoteId}:deposit:5000`],
      ['pi_rem_1', 7000, `refund:quote:${f.quoteId}:remainder:7000`],
    ])
    expect(quoteRow(f.quoteId)).toMatchObject({ deposit_refunded_minor: 5000, remainder_refunded_minor: 7000 })
    expect(events(f.quoteId, 'remainder_refunded')).toHaveLength(1)
    // One email with the total.
    expect(mailsTo(f.email)).toHaveLength(1)
    expect(mailsTo(f.email)[0].html).toContain(en(EN.cancelled.refund, 12000))
  })

  it('D-11: late with 0 back still refunds the paid remainder in full (only the deposit can be kept)', async () => {
    const f = await seed({ remainderPaid: { intent: 'pi_rem_2', amount: 7000 } }, LATE_NOW)
    const result = await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: 0, actor: ADMIN })
    expect(result).toEqual({ ok: true, outcome: 'late', refundedMinor: 7000, refundFailed: false })
    expect(refundCalls()).toHaveLength(1)
    expect(refundCalls()[0].params).toMatchObject({ payment_intent: 'pi_rem_2', amount: 7000 })
    expect(quoteRow(f.quoteId)).toMatchObject({ deposit_refunded_minor: 0, remainder_refunded_minor: 7000 })
    const [mail] = mailsTo(f.email)
    expect(mail.html).toContain(en(EN.cancelled.refund, 7000))
    expect(mail.html).toContain(en(EN.cancelled.kept, 5000))
  })
})

describe('the cancel as a whole', () => {
  it('a trip that is already cancelled is skipped, the others are cancelled', async () => {
    const f = await seed({ tripStatuses: ['cancelled', 'confirmed'] })
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })).toMatchObject({ ok: true })
    expect(tripStatuses(f)).toEqual(['cancelled', 'cancelled'])
  })

  it('D-12: cancelling ONE trip through the engine does not move the deposit', async () => {
    const f = await seed()
    const res = await cancelBooking({ bookingId: f.bookingIds[0], initiator: 'admin_client', actor: { type: 'admin', id: 'admin-1' } })
    expect(res).toMatchObject({ kind: 'ok', outcome: 'free' })
    expect(refundCalls()).toHaveLength(0)
    expect(quoteRow(f.quoteId)).toMatchObject({ deposit_refunded_minor: 0 })
    expect(quoteRow(f.quoteId).cancelled_at ?? null).toBeNull()
  })

  it('a trip the engine cannot cancel answers busy, leaves the quote and the money alone, and the next click finishes', async () => {
    const f = await seed()
    const second = db.state.bookings.find((b) => b.id === f.bookingIds[1])!
    // A payment worker is capturing this trip: the engine answers busy and writes nothing.
    second.payment_state = 'capturing'
    second.payment_lease_until = new Date(Date.now() + HOUR).toISOString()

    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })).toEqual({ ok: false, code: 'busy' })
    expect(tripStatuses(f)).toEqual(['cancelled', 'confirmed'])
    expect(quoteRow(f.quoteId).cancelled_at ?? null).toBeNull()
    expect(refundCalls()).toHaveLength(0)
    expect(mockResendSend).not.toHaveBeenCalled()

    second.payment_state = 'card_saved'
    second.payment_lease_until = null
    expect(await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })).toMatchObject({ ok: true })
    expect(tripStatuses(f)).toEqual(['cancelled', 'cancelled'])
    expect(refundCalls()).toHaveLength(1)
  })

  it('two clicks at once: one cancel wins, the deposit is refunded once and the client gets one email', async () => {
    const f = await seed()
    const [a, b] = await Promise.all([
      cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN }),
      cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN }),
    ])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    const loser = a.ok ? b : a
    expect(loser).toMatchObject({ ok: false })
    expect(['busy', 'already_cancelled']).toContain((loser as { code: string }).code)
    expect(refundCalls()).toHaveLength(1)
    expect(mailsTo(f.email)).toHaveLength(1)
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(5000)
  })

  it('the client is never charged on a cancel: no PaymentIntent is created and nothing above the deposit is kept', async () => {
    const f = await seed({ feePercent: 100, remainderPaid: { intent: 'pi_rem_3', amount: 7000 } }, LATE_NOW)
    await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: 0, actor: ADMIN })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(db.state.booking_fee_cases).toHaveLength(0)
  })
})

describe('a failed refund keeps the cancel', () => {
  it('records refund_failed, alerts the operator once and tells the client no refund yet; the operator retries by hand', async () => {
    const f = await seed()
    fake.failNextWithError('refunds.create', new FakeStripeError('StripeCardError', 'refund refused (secret detail)', { code: 'processing_error', statusCode: 402 }))

    const result = await cancelQuote({ quoteId: f.quoteId, initiator: 'admin_client', refundMinor: null, actor: ADMIN })

    expect(result).toEqual({ ok: true, outcome: 'free', refundedMinor: 0, refundFailed: true })
    expect(tripStatuses(f)).toEqual(['cancelled', 'cancelled'])
    expect(typeof quoteRow(f.quoteId).cancelled_at).toBe('string')
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(0)
    expect(events(f.quoteId, 'refund_failed')).toHaveLength(1)
    expect(events(f.quoteId, 'refund_failed')[0]).toMatchObject({ error_code: 'processing_error', amount_minor: 5000 })
    expect(events(f.quoteId, 'deposit_refunded')).toHaveLength(0)

    // One operator alert (ids, amount and code, no client data) and one client email that promises no money.
    const alerts = mailsTo('owner@example.com')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].subject).toContain('Quote refund failed')
    expect(JSON.stringify(alerts[0])).not.toContain('Novakova')
    expect(JSON.stringify(alerts[0])).not.toContain(f.email)
    const [mail] = mailsTo(f.email)
    expect(mail.html).not.toContain('We are refunding')
    expect(mail.html).not.toContain('is kept')

    // The operator refunds the deposit by hand on the cancelled quote.
    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 5000, actor: ADMIN })).toEqual({ ok: true })
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(5000)
  })
})

describe('D-12: the operator refunds part of a payment by hand', () => {
  it('D-12 refunds part of the deposit, bounded, with the amount in the key, and emails the client', async () => {
    const f = await seed({ locale: 'ru' })

    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 1000, actor: ADMIN })).toEqual({ ok: true })

    expect(refundCalls()).toHaveLength(1)
    expect(refundCalls()[0].params).toMatchObject({ payment_intent: f.depositIntent, amount: 1000 })
    expect(refundCalls()[0].idempotencyKey).toBe(`refund:quote:${f.quoteId}:deposit:1000`)
    expect(quoteRow(f.quoteId)).toMatchObject({ deposit_refunded_minor: 1000 })
    expect(quoteRow(f.quoteId).cancelled_at ?? null).toBeNull()
    // The trips are untouched.
    expect(tripStatuses(f)).toEqual(['confirmed', 'confirmed'])
    const kinds = events(f.quoteId).map((e) => e.kind)
    expect(kinds.indexOf('admin_action')).toBeLessThan(kinds.indexOf('deposit_refunded'))
    const mails = mailsTo(f.email)
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toBe(ruMessages.QuoteEmails.refunded.subject.replace('{reference}', f.reference))
    expect(mails[0].html).toContain(ruMessages.QuoteEmails.refunded.intro.replace('{amount}', `<bdi dir="ltr">${formatMinor(1000, 'eur')}</bdi>`))
  })

  it('D-12: a second refund of the SAME amount is a real second refund, not a replay of the first', async () => {
    const f = await seed()
    await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 1000, actor: ADMIN })
    await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 1000, actor: ADMIN })
    expect(refundCalls()).toHaveLength(2)
    expect(refundCalls()[0].idempotencyKey).not.toBe(refundCalls()[1].idempotencyKey)
    expect(fake.state.paymentIntents.get(f.depositIntent)!.amount_refunded).toBe(2000)
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(2000)
  })

  it('D-12: a repeat of one click (nothing stored in between) replays the same Stripe key and moves no money twice', async () => {
    const f = await seed()
    await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 1000, actor: ADMIN })
    // The stored total is rolled back, as if the first answer was lost before it was stored.
    quoteRow(f.quoteId).deposit_refunded_minor = 0
    await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 1000, actor: ADMIN })
    expect(refundCalls()[1].replayed).toBe(true)
    expect(fake.state.paymentIntents.get(f.depositIntent)!.amount_refunded).toBe(1000)
  })

  it('D-12: more than paid minus refunded is out_of_range and Stripe is not called', async () => {
    const f = await seed({ depositRefunded: 2000 })
    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 3001, actor: ADMIN })).toEqual({ ok: false, code: 'out_of_range' })
    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 0, actor: ADMIN })).toEqual({ ok: false, code: 'out_of_range' })
    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 10.5, actor: ADMIN })).toEqual({ ok: false, code: 'out_of_range' })
    expect(refundCalls()).toHaveLength(0)
    expect(events(f.quoteId)).toHaveLength(0)
    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 3000, actor: ADMIN })).toEqual({ ok: true })
  })

  it('D-12: a paid remainder is refunded the same way, bounded by what it paid', async () => {
    const f = await seed({ remainderPaid: { intent: 'pi_rem_4', amount: 7000 } })
    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'remainder', amountMinor: 7001, actor: ADMIN })).toEqual({ ok: false, code: 'out_of_range' })
    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'remainder', amountMinor: 2500, actor: ADMIN })).toEqual({ ok: true })
    expect(refundCalls()[0].params).toMatchObject({ payment_intent: 'pi_rem_4', amount: 2500 })
    expect(quoteRow(f.quoteId)).toMatchObject({ remainder_refunded_minor: 2500, deposit_refunded_minor: 0 })
    expect(events(f.quoteId, 'remainder_refunded')).toHaveLength(1)
  })

  it('D-12: a payment that was never made is not_paid, an unknown quote not_found', async () => {
    const f = await seed()
    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'remainder', amountMinor: 100, actor: ADMIN })).toEqual({ ok: false, code: 'not_paid' })
    const unpaid = await seed({ suffix: 'BBBBBB', quote: { paid_at: null, status: 'accepted' } })
    expect(await refundQuotePayment({ quoteId: unpaid.quoteId, source: 'deposit', amountMinor: 100, actor: ADMIN })).toEqual({ ok: false, code: 'not_paid' })
    expect(await refundQuotePayment({ quoteId: '00000000-0000-4000-8000-000000000999', source: 'deposit', amountMinor: 100, actor: ADMIN })).toEqual({ ok: false, code: 'not_found' })
    expect(refundCalls()).toHaveLength(0)
  })

  it('D-12: a Stripe refusal is refund_failed, recorded and alerted once, and the stored total does not move', async () => {
    const f = await seed()
    fake.failNextWithError('refunds.create', new FakeStripeError('StripeInvalidRequestError', 'nope', { code: 'charge_already_refunded', statusCode: 400 }))
    expect(await refundQuotePayment({ quoteId: f.quoteId, source: 'deposit', amountMinor: 1000, actor: ADMIN })).toEqual({ ok: false, code: 'refund_failed' })
    expect(quoteRow(f.quoteId).deposit_refunded_minor).toBe(0)
    expect(events(f.quoteId, 'refund_failed')).toHaveLength(1)
    expect(mailsTo('owner@example.com')).toHaveLength(1)
    // No refund email for money that did not move.
    expect(mailsTo(f.email)).toHaveLength(0)
  })
})
