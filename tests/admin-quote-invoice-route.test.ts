// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

/**
 * Phase 92 plan 92-24 (QUOTE-04; D-16, D-17, D-22): "mark invoice paid" and "send remainder request". The routes, the
 * invoice module, the link minting and the email run for real against the in-memory payments database; Resend is a
 * double and the admin session is a switch. No Stripe is involved anywhere: marking an invoice paid moves no money.
 */

const { world, mockResendSend } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    auth: 'admin' as 'admin' | '401' | '403',
  },
  mockResendSend: vi.fn(),
}))

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'
process.env.RESEND_API_KEY = 're_test'

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    if (world.auth === '401') return { user: null, error: '401' as const }
    if (world.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: ADMIN_ID }, error: null }
  }),
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db!.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))

import { POST as INVOICE_PAID } from '@/app/api/admin/quotes/[id]/invoice-paid/route'

type Row = Record<string, unknown>

let db: FakePaymentsDb

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function req(url: string, body?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const markPaid = (id: string, body?: unknown) => INVOICE_PAID(req(`http://localhost/api/admin/quotes/${id}/invoice-paid`, body), params(id))

interface SeedOptions {
  method?: 'saved_card' | 'payment_link' | 'cash' | 'invoice'
  status?: string
  cancelled?: boolean
  locale?: string
  suffix?: string
}

interface Seeded {
  quoteId: string
  versionId: string
  lineIds: string[]
  bookingIds: string[]
}

/**
 * A paid quote with a frozen two-trip version plus a third trip that was cancelled. Remainders: 12000, 0 and 5000; the
 * bookings are in plain quote mode (invoice and payment-link methods), the cancelled one carries the 5000.
 */
async function seed(opts: SeedOptions = {}): Promise<Seeded> {
  const c = db.client
  const suffix = opts.suffix ?? 'AAAAAA'
  const quote = await c
    .from('quotes')
    .insert({
      reference: `Q-20261114-${suffix}`,
      client_first_name: 'Eva',
      client_last_name: 'Novakova',
      client_email: `eva-${suffix}@example.com`,
      lead_channel: 'whatsapp',
    })
    .select('*')
    .single()
  const quoteId = (quote.data as { id: string }).id
  const version = await c
    .from('quote_versions')
    .insert({ quote_id: quoteId, version_no: 1, locale: opts.locale ?? 'en', currency: 'eur' })
    .select('*')
    .single()
  const versionId = (version.data as { id: string }).id

  const specs = [
    { share: 8000, remainder: 12000, time: '08:30' },
    { share: 10000, remainder: 0, time: '09:30' },
    { share: 3000, remainder: 5000, time: '10:30' },
  ]
  const lineIds: string[] = []
  let total = 0
  let deposit = 0
  for (const [i, spec] of specs.entries()) {
    const amount = spec.share + spec.remainder
    total += amount
    deposit += spec.share
    const line = await c
      .from('quote_version_lines')
      .insert({
        version_id: versionId,
        position: i + 1,
        trip_type: 'transfer',
        pickup_date: '2026-12-20',
        pickup_time: spec.time,
        origin_address: 'Letiste Vaclava Havla, Praha',
        destination_address: 'Karlovo namesti 1, Praha',
        vehicle_class: 'business',
        passengers: 2,
        luggage: 1,
        amount_minor: amount,
        deposit_share_minor: spec.share,
        remainder_minor: spec.remainder,
        amount_eur: amount / 100,
        amount_czk: Math.round((amount / 100) * 25),
      })
      .select('*')
      .single()
    lineIds.push((line.data as { id: string }).id)
  }
  const frozen = await c
    .from('quote_versions')
    .update({
      frozen_at: '2026-11-13T09:00:00.000Z',
      total_minor: total,
      deposit_kind: 'fixed',
      deposit_value: deposit,
      deposit_minor: deposit,
      remainder_method: opts.method ?? 'invoice',
      cancel_free_hours: 48,
      cancel_fee_percent: 100,
      cancel_policy: { freeHours: 48, feePercent: 100 },
      cancel_policy_version: 'quote-policy-v1',
      terms_version: 'quote-2026-11-1',
    })
    .eq('id', versionId)
  expect(frozen.error).toBeNull()

  const upd = await c
    .from('quotes')
    .update({
      status: opts.status ?? 'paid',
      current_version_id: versionId,
      accepted_version_id: versionId,
      deposit_payment_intent_id: 'pi_dep_1',
      accepted_at: '2026-11-13T10:00:00.000Z',
      paid_at: '2026-11-13T10:05:00.000Z',
      ...(opts.cancelled ? { cancelled_at: '2026-11-14T08:00:00.000Z', cancel_initiator: 'admin_client', cancel_outcome: 'free' } : {}),
    })
    .eq('id', quoteId)
  expect(upd.error).toBeNull()

  const bookingIds: string[] = []
  for (const [i, lineId] of lineIds.entries()) {
    const booking = await c
      .from('bookings')
      .insert({
        booking_reference: `PRG-${suffix}-${i + 1}`,
        client_email: `eva-${suffix}@example.com`,
        payment_mode: 'quote',
        status: i === 2 ? 'cancelled' : 'confirmed',
        quote_id: quoteId,
        quote_line_id: lineId,
      })
      .select('*')
      .single()
    expect(booking.error).toBeNull()
    bookingIds.push((booking.data as { id: string }).id)
  }
  return { quoteId, versionId, lineIds, bookingIds }
}

const quoteRow = (id: string): Row => db.state.quotes.find((q) => q.id === id)!
const bookingRow = (id: string): Row => db.state.bookings.find((b) => b.id === id)!
const events = (id: string, kind?: string): Row[] =>
  db.state.quote_events.filter((e) => e.quote_id === id && (kind === undefined || e.kind === kind))
const eventKinds = (id: string) => events(id).map((e) => e.kind)
const stringified = (value: unknown) => JSON.stringify(value)

beforeEach(() => {
  vi.clearAllMocks()
  world.auth = 'admin'
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  db = createFakePaymentsDb()
  world.db = { client: { from: (t) => db.client.from(t), rpc: (n, a) => db.client.rpc(n, a) } }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tracer: mark an invoice paid (D-17)', () => {
  it('a paid invoice quote: 200 changed true, the quote and its live quote-mode bookings carry the number and the paid time', async () => {
    const s = await seed()
    const res = await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ changed: true })

    const quote = quoteRow(s.quoteId)
    expect(quote.invoice_number).toBe('2026-0042')
    expect(typeof quote.invoice_paid_at).toBe('string')
    expect(Number.isFinite(Date.parse(quote.invoice_paid_at as string))).toBe(true)

    for (const id of s.bookingIds.slice(0, 2)) {
      const booking = bookingRow(id)
      expect(booking.invoice_number).toBe('2026-0042')
      expect(booking.paid_at).toBe(quote.invoice_paid_at)
    }
    // The cancelled trip is left alone.
    expect(bookingRow(s.bookingIds[2]).paid_at ?? null).toBeNull()
    expect(bookingRow(s.bookingIds[2]).invoice_number ?? null).toBeNull()
  })

  it('records admin_action first and then invoice_paid, both with the admin as actor and the amount settled', async () => {
    const s = await seed()
    await markPaid(s.quoteId, { invoice_number: '2026-0042' })

    const kinds = eventKinds(s.quoteId)
    expect(kinds).toEqual(expect.arrayContaining(['admin_action', 'invoice_paid']))
    expect(kinds.indexOf('admin_action')).toBeLessThan(kinds.indexOf('invoice_paid'))
    for (const e of [...events(s.quoteId, 'admin_action'), ...events(s.quoteId, 'invoice_paid')]) {
      expect(e.actor_type).toBe('admin')
      expect(e.actor_id).toBe(ADMIN_ID)
    }
    const paid = events(s.quoteId, 'invoice_paid')[0]
    expect(paid.amount_minor).toBe(12000)
    expect(paid.currency).toBe('eur')
  })

  it('moves no money: no Stripe call, no email, and no payment_state is touched on the bookings', async () => {
    const s = await seed()
    await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    expect(mockResendSend).not.toHaveBeenCalled()
    for (const id of s.bookingIds) expect(bookingRow(id).payment_state).toBe('none')
    expect(bookingRow(s.bookingIds[0]).payment_mode).toBe('quote')
  })

  it('the same number again: 200 changed false and nothing changes (exactly once)', async () => {
    const s = await seed()
    await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    const paidAt = quoteRow(s.quoteId).invoice_paid_at
    const eventCount = events(s.quoteId).length

    const again = await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ changed: false })
    expect(quoteRow(s.quoteId).invoice_paid_at).toBe(paidAt)
    expect(events(s.quoteId)).toHaveLength(eventCount)
    expect(events(s.quoteId, 'invoice_paid')).toHaveLength(1)
  })

  it('a replay finishes the bookings when an earlier call stopped after the quote update', async () => {
    const s = await seed()
    await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    // Simulate the crash window: the quote is marked, one booking was not reached.
    const first = bookingRow(s.bookingIds[0])
    first.paid_at = null
    first.invoice_number = null

    const again = await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ changed: true })
    expect(first.invoice_number).toBe('2026-0042')
    expect(first.paid_at).toBe(quoteRow(s.quoteId).invoice_paid_at)
  })

  it('a different number after paid: 422 number_conflict and the first number stays', async () => {
    const s = await seed()
    await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    const res = await markPaid(s.quoteId, { invoice_number: '2026-0099' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'action_not_allowed', reason: 'number_conflict' })
    expect(quoteRow(s.quoteId).invoice_number).toBe('2026-0042')
    expect(bookingRow(s.bookingIds[0]).invoice_number).toBe('2026-0042')
  })

  it('two simultaneous calls with different numbers: exactly one wins, the other is number_conflict', async () => {
    const s = await seed()
    const [a, b] = await Promise.all([
      markPaid(s.quoteId, { invoice_number: 'A-1' }),
      markPaid(s.quoteId, { invoice_number: 'B-2' }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 422])
    const winner = quoteRow(s.quoteId).invoice_number
    expect(['A-1', 'B-2']).toContain(winner)
    expect(bookingRow(s.bookingIds[0]).invoice_number).toBe(winner)
    expect(events(s.quoteId, 'invoice_paid')).toHaveLength(1)
  })

  it('a saved-card quote: 422 not_invoice and nothing is written', async () => {
    const s = await seed({ method: 'saved_card' })
    const res = await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'action_not_allowed', reason: 'not_invoice' })
    expect(quoteRow(s.quoteId).invoice_paid_at ?? null).toBeNull()
    expect(events(s.quoteId)).toHaveLength(0)
  })

  it.each(['payment_link', 'cash'] as const)('a %s quote: 422 not_invoice', async (method) => {
    const s = await seed({ method })
    const res = await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ reason: 'not_invoice' })
  })

  it('an invoice quote that is not paid yet: 422 not_paid', async () => {
    const s = await seed({ status: 'accepted' })
    const res = await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'action_not_allowed', reason: 'not_paid' })
    expect(quoteRow(s.quoteId).invoice_number ?? null).toBeNull()
    expect(events(s.quoteId)).toHaveLength(0)
  })

  it('a cancelled invoice quote: 422 not_paid and nothing changes', async () => {
    const s = await seed({ cancelled: true })
    const res = await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ reason: 'not_paid' })
    expect(quoteRow(s.quoteId).invoice_paid_at ?? null).toBeNull()
    expect(bookingRow(s.bookingIds[0]).paid_at ?? null).toBeNull()
  })

  it('an unknown quote: 404', async () => {
    const res = await markPaid('11111111-1111-4111-8111-111111111111', { invoice_number: '2026-0042' })
    expect(res.status).toBe(404)
  })
})

describe('input and guards (400 vs 422)', () => {
  it('trims the number before storing it', async () => {
    const s = await seed()
    const res = await markPaid(s.quoteId, { invoice_number: '  2026-0042  ' })
    expect(res.status).toBe(200)
    expect(quoteRow(s.quoteId).invoice_number).toBe('2026-0042')
  })

  it.each([
    ['a line break', { invoice_number: '2026-\n0042' }],
    ['a carriage return', { invoice_number: '2026-\r0042' }],
    ['a tab', { invoice_number: '2026-\t0042' }],
    ['over 60 characters', { invoice_number: 'X'.repeat(61) }],
    ['empty', { invoice_number: '' }],
    ['only spaces', { invoice_number: '   ' }],
    ['a number instead of text', { invoice_number: 42 }],
    ['missing', {}],
    ['an unknown key', { invoice_number: '2026-0042', paid_at: '2020-01-01' }],
  ])('%s: 400 and nothing is written', async (_name, body) => {
    const s = await seed()
    const res = await markPaid(s.quoteId, body)
    expect(res.status).toBe(400)
    expect(quoteRow(s.quoteId).invoice_paid_at ?? null).toBeNull()
    expect(events(s.quoteId)).toHaveLength(0)
  })

  it('exactly 60 characters is accepted', async () => {
    const s = await seed()
    const res = await markPaid(s.quoteId, { invoice_number: 'X'.repeat(60) })
    expect(res.status).toBe(200)
  })

  it('a malformed body is 400, an oversized body is 413, an empty body is 400', async () => {
    const s = await seed()
    expect((await markPaid(s.quoteId, '{not json')).status).toBe(400)
    expect((await markPaid(s.quoteId, { invoice_number: 'X'.repeat(5000) })).status).toBe(413)
    expect((await markPaid(s.quoteId)).status).toBe(400)
  })

  it('a quote id that is not a uuid is 400', async () => {
    expect((await markPaid('not-a-uuid', { invoice_number: '2026-0042' })).status).toBe(400)
  })

  it('no session: 401; no admin role: 403; nothing is written either way (T-92-76)', async () => {
    const s = await seed()
    world.auth = '401'
    expect((await markPaid(s.quoteId, { invoice_number: '2026-0042' })).status).toBe(401)
    world.auth = '403'
    expect((await markPaid(s.quoteId, { invoice_number: '2026-0042' })).status).toBe(403)
    expect(quoteRow(s.quoteId).invoice_paid_at ?? null).toBeNull()
    expect(events(s.quoteId)).toHaveLength(0)
  })

  it('the guards run before the body is read: a bad body without a session is 401, not 400', async () => {
    const s = await seed()
    world.auth = '401'
    expect((await markPaid(s.quoteId, '{not json')).status).toBe(401)
  })

  it('answers with no-store and logs no invoice number, email or name on a failure', async () => {
    const s = await seed()
    const res = await markPaid(s.quoteId, { invoice_number: '2026-0042' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const s3 = await seed({ suffix: 'CCCCCC' })
    world.db = {
      client: {
        from: (t: string) => {
          if (t === 'bookings') throw new Error('database down for eva-CCCCCC@example.com 2026-0077')
          return db.client.from(t)
        },
        rpc: (n, a) => db.client.rpc(n, a),
      },
    }
    const failed = await markPaid(s3.quoteId, { invoice_number: '2026-0077' })
    expect(failed.status).toBe(500)
    const logged = stringified(spy.mock.calls)
    expect(logged).not.toContain('2026-0077')
    expect(logged).not.toContain('eva-CCCCCC')
    expect(logged).not.toContain('Eva')
  })
})
