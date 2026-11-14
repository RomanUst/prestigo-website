// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { FIRST_PICKUP_MS, seedPaidQuote, type PaidQuoteFixture } from './helpers/quote-cancel-fixture'
import ruMessages from '@/messages/ru.json'

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

import { cancelQuote, previewQuoteCancel, readQuoteCancelPreview } from '@/lib/quotes/cancel'
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
