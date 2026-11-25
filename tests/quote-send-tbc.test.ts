// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe } from './helpers/fake-stripe'
import { seedPublicQuote } from './helpers/quote-public-fixture'

/**
 * Migration 099 (owner request 2026-11-24): a quote sent with TBC fields. The client confirms (or pays) as usual; the
 * payment is recorded but the bookings wait (quotes.bookings_pending) and the client gets a "received, details to follow"
 * email. The operator fills the TBC fields; only empty fields are written; once every trip is complete the bookings are
 * made and the client gets the confirmation with the booking references.
 */

const { world, settingsMock, sendMock } = vi.hoisted(() => ({
  world: { client: null as unknown, stripe: null as unknown },
  settingsMock: vi.fn(),
  sendMock: vi.fn(async () => 'sent' as const),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => world.client }))
vi.mock('@/lib/payments/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payments/config')>()),
  getPaymentSettings: settingsMock,
}))
vi.mock('@/lib/quotes/emails/shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/quotes/emails/shell')>()),
  sendQuoteEmail: sendMock,
}))
vi.mock('@/lib/quotes/alerts', () => ({ sendQuoteOperatorAlert: vi.fn(async () => undefined) }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn(async () => null) }))
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: vi.fn(async () => ({ ok: true, distanceKm: 18 })) }))

import { acceptQuote } from '@/lib/quotes/accept'
import { fillQuoteDetails } from '@/lib/quotes/details'
import { resolveQuoteToken } from '@/lib/quotes/resolve'
import { buildQuoteView } from '@/lib/quotes/view'
import { renderQuoteTerms } from '@/lib/quotes/consent'
import { quoteLinkState } from '@/lib/quotes/status'

const NOW = Date.parse('2027-05-10T10:00:00Z')
let db: FakePaymentsDb

beforeEach(() => {
  db = createFakePaymentsDb()
  world.client = db.client
  world.stripe = createFakeStripe({ nowSec: () => Math.floor(NOW / 1000) }).stripe
  settingsMock.mockReset()
  settingsMock.mockResolvedValue({ mode: 'on', leadHours: 72, canaryEmails: [] })
  sendMock.mockClear()
})

const quoteRow = () => db.state.quotes[0]
const subjects = () => (sendMock.mock.calls as unknown as Array<[{ subject: string }]>).map((c) => c[0].subject)

describe('a quote sent with TBC fields', () => {
  it('the client page shows the TBC fields as "To be confirmed"', async () => {
    const fx = await seedPublicQuote(db, { tbcLine1: true })
    const resolved = await resolveQuoteToken(fx.token, NOW)
    expect(resolved).not.toBeNull()
    const view = buildQuoteView(resolved!, NOW)
    expect(view.lines[0]).toMatchObject({ pickupTime: null, origin: null })
    expect(view.lines[1].pickupTime).toBe('09:00')
  })

  it('with every pickup TBC the link is still an offer until the operator expiry', () => {
    const link = { version_id: 'v', revoked_at: null }
    const quote = { status: 'sent' as const, current_version_id: 'v', expires_at: null, cancelled_at: null }
    expect(quoteLinkState({ link, quote, firstPickupMs: null, nowMs: NOW })).toBe('offer')
    expect(quoteLinkState({ link, quote: { ...quote, expires_at: '2027-05-01T00:00:00Z' }, firstPickupMs: null, nowMs: NOW })).toBeNull()
  })

  it('confirm without deposit while a trip is TBC: paid, bookings wait, the client gets "received"', async () => {
    const fx = await seedPublicQuote(db, { tbcLine1: true, noDeposit: true, remainderMethod: 'invoice' })
    const res = await acceptQuote({ token: fx.token, displayedVersionNo: 1, displayedDepositMinor: 0, ip: '1', userAgent: 'UA', nowMs: NOW })
    expect(res).toMatchObject({ ok: true, confirmed: true })
    expect(quoteRow()).toMatchObject({ status: 'paid', bookings_pending: true })
    expect(db.state.bookings).toHaveLength(0)
    expect(subjects()).toContain('We received your confirmation – Q-20261114-ABC123')
    expect(subjects().some((s) => s.startsWith('Your trips are booked'))).toBe(false)
  })

  it('filling the details writes only empty fields, then makes the bookings and sends the confirmation', async () => {
    const fx = await seedPublicQuote(db, { tbcLine1: true, noDeposit: true, remainderMethod: 'invoice' })
    await acceptQuote({ token: fx.token, displayedVersionNo: 1, displayedDepositMinor: 0, ip: '1', userAgent: 'UA', nowMs: NOW })
    sendMock.mockClear()

    // A field the client was shown (line 2 time) is never changed; line 1 gets its TBC time and address.
    const out = await fillQuoteDetails(
      fx.quoteId,
      {
        lines: [
          { position: 1, pickup_time: '11:15', origin: { address: 'Prague Airport T1', lat: 50.1, lng: 14.26 } },
          { position: 2, pickup_time: '23:59' },
        ],
      },
      { id: '99999999-9999-4999-8999-999999999999' },
    )
    expect(out).toMatchObject({ ok: true, complete: true, bookings: { outcome: 'created' } })
    const lines = db.state.quote_version_lines.filter((l) => l.version_id === fx.versionId).sort((a, b) => Number(a.position) - Number(b.position))
    expect(lines[0]).toMatchObject({ pickup_time: '11:15', origin_address: 'Prague Airport T1' })
    expect(lines[1].pickup_time).toBe('09:00')
    expect(quoteRow().bookings_pending).toBe(false)
    expect(db.state.bookings).toHaveLength(2)
    expect(subjects().some((s) => s.startsWith('Your trips are booked'))).toBe(true)

    // A second save makes nothing twice.
    const again = await fillQuoteDetails(fx.quoteId, { lines: [{ position: 1, pickup_time: '12:00' }] }, { id: '99999999-9999-4999-8999-999999999999' })
    expect(again).toMatchObject({ ok: true, complete: true, bookings: null })
    expect(db.state.bookings).toHaveLength(2)
  })

  it('filling part of the details keeps the bookings waiting', async () => {
    const fx = await seedPublicQuote(db, { tbcLine1: true, noDeposit: true, remainderMethod: 'invoice' })
    await acceptQuote({ token: fx.token, displayedVersionNo: 1, displayedDepositMinor: 0, ip: '1', userAgent: 'UA', nowMs: NOW })
    const out = await fillQuoteDetails(fx.quoteId, { lines: [{ position: 1, pickup_time: '11:15' }] }, { id: '99999999-9999-4999-8999-999999999999' })
    expect(out).toMatchObject({ ok: true, complete: false, bookings: null })
    expect(quoteRow().bookings_pending).toBe(true)
    expect(db.state.bookings).toHaveLength(0)
  })

  it('a position the quote does not have is refused', async () => {
    const fx = await seedPublicQuote(db, { tbcLine1: true })
    expect(await fillQuoteDetails(fx.quoteId, { lines: [{ position: 9, pickup_time: '11:15' }] }, { id: 'x' })).toEqual({ ok: false, code: 'unknown_line' })
  })

  it('the consent names the free window in hours while no pickup is known', async () => {
    const fx = await seedPublicQuote(db, { tbcLine1: true })
    // Both pickups unknown: line 2 gets a TBC date too.
    db.state.quote_version_lines.find((l) => l.position === 2)!.pickup_date = null
    const resolved = await resolveQuoteToken(fx.token, NOW)
    const terms = await renderQuoteTerms({ resolved: resolved!, nowMs: NOW })
    expect(terms.text).toContain('Free cancellation until 48 hours before the first trip')
  })
})
