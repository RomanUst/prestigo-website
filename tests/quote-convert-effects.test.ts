// @vitest-environment node
/**
 * Phase 92 plan 92-21 (QUOTE-04, QUOTE-05; D-17, T-92-67, T-92-68): what happens after the deposit is paid.
 *
 * The real convert module runs on the stateful fakes (payments database, Stripe); Resend and QStash are doubles.
 * Tracer: the first conversion sends one client confirmation in Russian that lists both booking references, and a webhook
 * replay sends nothing more. Then the accounting copy, the invoice record, the operator alert and the trip reminders.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

const { world, mockResendSend, mockSchedule } = vi.hoisted(() => ({
  world: { db: null as unknown as FakePaymentsDb, stripe: null as unknown },
  mockResendSend: vi.fn(),
  mockSchedule: vi.fn(),
}))

process.env.RESEND_API_KEY = 're_test'

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db.client.from(table),
    rpc: async (name: string, args?: Record<string, unknown>) => world.db.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => (world.stripe as FakeStripe).stripe,
}))
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: mockSchedule }))

import { applyQuoteDepositPaid } from '@/lib/quotes/convert'
import { quoteMetadata } from '@/lib/payments/stripe'
import { formatMinor } from '@/lib/payments/money'
import { pickupInstantMs } from '@/lib/prague-date'
import en from '@/messages/en.json'
import ru from '@/messages/ru.json'
import type Stripe from 'stripe'

type Row = Record<string, unknown>

const NOW = Date.parse('2026-11-14T10:00:00.000Z')
const HASH = 'c'.repeat(64)
const WEBHOOK = { type: 'webhook', id: 'evt_1' } as const
const CLIENT_EMAIL = 'eva@example.com'
const CLIENT_PHONE = '+420 777 123 456'

let db: FakePaymentsDb
let fake: FakeStripe

interface SeedOptions {
  method?: 'saved_card' | 'payment_link' | 'cash' | 'invoice'
  locale?: string
  /** deposit share + remainder per line; default 3000+7000 and 2000+0 */
  specs?: Array<{ share: number; remainder: number; time: string }>
  billing?: Partial<Row>
}

interface Seeded {
  quoteId: string
  versionId: string
  intent: string
  reference: string
  deposit: number
  total: number
}

async function seed(opts: SeedOptions = {}): Promise<Seeded> {
  const c = db.client
  const intent = 'pi_1'
  const reference = 'Q-20261114-AAAAAA'
  const quote = await c
    .from('quotes')
    .insert({
      reference,
      client_first_name: 'Eva',
      client_last_name: 'Novakova',
      client_email: CLIENT_EMAIL,
      client_phone: CLIENT_PHONE,
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

  const specs = opts.specs ?? [
    { share: 3000, remainder: 7000, time: '08:30' },
    { share: 2000, remainder: 0, time: '09:30' },
  ]
  let total = 0
  let deposit = 0
  for (const [i, spec] of specs.entries()) {
    const amount = spec.share + spec.remainder
    total += amount
    deposit += spec.share
    const line = await c.from('quote_version_lines').insert({
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
    expect(line.error).toBeNull()
  }
  const frozen = await c
    .from('quote_versions')
    .update({
      frozen_at: '2026-11-13T09:00:00.000Z',
      total_minor: total,
      deposit_kind: 'fixed',
      deposit_value: deposit,
      deposit_minor: deposit,
      remainder_method: opts.method ?? 'payment_link',
      cancel_free_hours: 48,
      cancel_fee_percent: 100,
      cancel_policy: { freeHours: 48, feePercent: 100 },
      cancel_policy_version: 'quote-policy-v1',
      terms_version: 'quote-2026-11-1',
      ...(opts.billing ?? {}),
    })
    .eq('id', versionId)
  expect(frozen.error).toBeNull()

  const acceptance = await c.from('quote_acceptances').insert({
    quote_id: quoteId,
    version_id: versionId,
    locale: opts.locale ?? 'en',
    terms_version: 'quote-2026-11-1',
    terms_sha256: HASH,
    terms_rendered: 'Terms of this quote.',
    deposit_minor: deposit,
    currency: 'eur',
    ip: '203.0.113.7',
    user_agent: 'test-agent',
    hold_lead_hours: 72,
    payment_intent_id: intent,
  })
  expect(acceptance.error).toBeNull()
  const upd = await c
    .from('quotes')
    .update({ status: 'accepted', current_version_id: versionId, accepted_version_id: versionId, deposit_payment_intent_id: intent })
    .eq('id', quoteId)
  expect(upd.error).toBeNull()
  return { quoteId, versionId, intent, reference, deposit, total }
}

function depositIntent(s: Seeded): Stripe.PaymentIntent {
  const pi = {
    id: s.intent,
    object: 'payment_intent',
    status: 'succeeded',
    amount: s.deposit,
    amount_received: s.deposit,
    currency: 'eur',
    customer: 'cus_1',
    payment_method: 'pm_1',
    metadata: quoteMetadata('card_quote_deposit', { quoteId: s.quoteId, versionId: s.versionId, quoteReference: s.reference }),
  } as unknown as Stripe.PaymentIntent
  fake.state.paymentIntents.set(pi.id, { ...pi, amount_refunded: 0 } as never)
  return pi
}

interface Sent {
  to: string
  subject: string
  html?: string
  text?: string
  key: string
}
/** Every message Resend was asked to send, successful or not (the double decides). */
const sent = (): Sent[] =>
  mockResendSend.mock.calls.map(([msg, opts]) => ({
    to: (msg as { to: string[] }).to[0],
    subject: (msg as { subject: string }).subject,
    html: (msg as { html?: string }).html,
    text: (msg as { text?: string }).text,
    key: (opts as { idempotencyKey: string }).idempotencyKey,
  }))
const toClient = () => sent().filter((m) => m.to === CLIENT_EMAIL)
const toAccounting = () => sent().filter((m) => m.to === 'accounting@example.com' || m.key.startsWith('quote-accounting:'))
const alerts = () => sent().filter((m) => m.key.startsWith('alert:quote_paid'))
const events = (quoteId: string) => db.state.quote_events.filter((e) => e.quote_id === quoteId)
const eventKeys = (quoteId: string) => events(quoteId).map((e) => e.event_key as string)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MANAGER_EMAIL = 'owner@example.com'
  process.env.ACCOUNTING_EMAIL = 'accounting@example.com'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  mockSchedule.mockResolvedValue(undefined)
  db = createFakePaymentsDb({ nowMs: NOW })
  fake = createFakeStripe()
  world.db = db
  world.stripe = fake
})

describe('tracer: one client confirmation per paid quote, exactly once', () => {
  it('a first conversion of a ru payment_link quote sends one Russian email with both references, the deposit and the remainder due', async () => {
    const s = await seed({ locale: 'ru', method: 'payment_link' })
    const result = await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    expect(result.outcome).toBe('converted')

    const mails = toClient()
    expect(mails).toHaveLength(1)
    const mail = mails[0]
    expect(mail.subject).toBe(ru.QuoteEmails.confirmed.subject.replace('{reference}', s.reference))
    expect(mail.key).toBe(`quote-confirmed:${s.quoteId}`)
    for (const bookingId of result.bookingIds ?? []) {
      const booking = db.state.bookings.find((b) => b.id === bookingId) as Row
      expect(mail.html).toContain(String(booking.booking_reference))
    }
    expect(mail.html).toContain('lang="ru"')
    expect(mail.html).toContain(formatMinor(s.deposit, 'eur'))
    // payment_link: the remainder due (the 7000 of line one) is named once.
    expect(mail.html).toContain(formatMinor(7000, 'eur'))
    expect(mail.html).toContain('Karlovo namesti 1, Praha')
    expect(mail.html).toContain('08:30')

    const claimed = events(s.quoteId).filter((e) => e.event_key === 'email:confirmed')
    expect(claimed).toHaveLength(1)
    expect(claimed[0].kind).toBe('email_sent')
  })

  it('a webhook replay sends nothing more', async () => {
    const s = await seed({ locale: 'ru' })
    const pi = depositIntent(s)
    await applyQuoteDepositPaid(pi, WEBHOOK)
    const callsBefore = mockResendSend.mock.calls.length
    const scheduledBefore = mockSchedule.mock.calls.length

    const again = await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(again.outcome).toBe('replayed')
    expect(mockResendSend.mock.calls.length).toBe(callsBefore)
    expect(mockSchedule.mock.calls.length).toBe(scheduledBefore)
  })

  it('a send that failed once is sent by the next delivery, once; a failed email never turns the conversion into an error', async () => {
    const s = await seed()
    const pi = depositIntent(s)
    let clientCalls = 0
    mockResendSend.mockImplementation(async (msg: { to: string[] }) => {
      if (msg.to[0] === CLIENT_EMAIL) {
        clientCalls += 1
        if (clientCalls === 1) throw new Error('resend is down (secret detail)')
      }
      return { data: { id: 'em' }, error: null }
    })

    const first = await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(first.outcome).toBe('converted')
    expect(eventKeys(s.quoteId)).not.toContain('email:confirmed')
    expect(events(s.quoteId).some((e) => e.kind === 'email_failed')).toBe(true)

    const second = await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(second.outcome).toBe('replayed')
    expect(clientCalls).toBe(2)
    expect(eventKeys(s.quoteId)).toContain('email:confirmed')

    await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(clientCalls).toBe(2)
  })

  it('an effects failure (the ledger unreadable) never makes the conversion an error', async () => {
    const s = await seed()
    const pi = depositIntent(s)
    const realFrom = db.client.from.bind(db.client)
    const spy = vi.spyOn(db.client, 'from').mockImplementation(((table: string) => {
      if (table === 'quote_events') throw new Error('ledger down')
      return realFrom(table)
    }) as never)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const result = await applyQuoteDepositPaid(pi, WEBHOOK)
      expect(result.outcome).toBe('converted')
      expect(db.state.bookings.filter((b) => b.quote_id === s.quoteId)).toHaveLength(2)
      expect(JSON.stringify(errors.mock.calls)).not.toContain(CLIENT_EMAIL)
    } finally {
      spy.mockRestore()
      errors.mockRestore()
    }
  })

  it.each([
    ['saved_card', 'saved_card', true],
    ['payment_link', 'payment_link', false],
    ['cash', 'cash', false],
    ['invoice', 'invoice', false],
  ] as const)('%s: the confirmation carries the sentence of its own method', async (method, key, mentionsCard) => {
    const s = await seed({ method })
    await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    // The amounts sit in direction-isolating <bdi> tags; the sentences are compared without them.
    const flat = (toClient()[0].html ?? '').replace(/<\/?bdi[^>]*>/g, '')
    const sentence = en.QuoteEmails.confirmed.remainder[key]
    const expected = sentence.replace('{amount}', formatMinor(7000, 'eur'))
    expect(flat).toContain(expected)
    // Only the saved-card sentence mentions the card (D-21 / D-22); no sentence of another method appears.
    expect(/\bcard\b/i.test(flat)).toBe(mentionsCard)
    for (const other of Object.keys(en.QuoteEmails.confirmed.remainder).filter((k) => k !== key)) {
      const text = (en.QuoteEmails.confirmed.remainder as Record<string, string>)[other].replace('{amount}', formatMinor(7000, 'eur'))
      expect(flat).not.toContain(text)
    }
  })

  it('a 100% deposit says the trips are fully paid and shows no amount due', async () => {
    const s = await seed({ method: 'payment_link', specs: [{ share: 5000, remainder: 0, time: '08:30' }] })
    await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    const flat = (toClient()[0].html ?? '').replace(/<\/?bdi[^>]*>/g, '')
    expect(flat).toContain(en.QuoteEmails.confirmed.remainder.none)
    expect(flat).not.toContain('Please pay the remainder')
  })

  it('W2: a deposit replayed after the quote was cancelled sends no confirmation and schedules no reminder', async () => {
    const s = await seed()
    const pi = depositIntent(s)
    await applyQuoteDepositPaid(pi, WEBHOOK)
    // A crash cut the client steps short: their claims are not in the ledger; the accounting copy and the alert are.
    db.state.quote_events = db.state.quote_events.filter((e) => e.event_key !== 'email:confirmed' && e.event_key !== 'reminders')
    mockResendSend.mockClear()
    mockSchedule.mockClear()
    await db.client.from('quotes').update({ cancelled_at: '2026-11-14T10:05:00.000Z' }).eq('id', s.quoteId)

    const again = await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(again.outcome).toBe('replayed')
    expect(toClient()).toHaveLength(0)
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  it('W2: the accounting copy and the operator alert missing after a cancel are still completed', async () => {
    const s = await seed()
    const pi = depositIntent(s)
    await applyQuoteDepositPaid(pi, WEBHOOK)
    db.state.quote_events = db.state.quote_events.filter((e) => e.event_key !== 'email:accounting' && e.event_key !== 'alert:quote_paid')
    mockResendSend.mockClear()
    await db.client.from('quotes').update({ cancelled_at: '2026-11-14T10:05:00.000Z' }).eq('id', s.quoteId)

    await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(toAccounting()).toHaveLength(1)
    expect(alerts()).toHaveLength(1)
    expect(toClient()).toHaveLength(0)
  })
})

describe('accounting copy, invoice record, operator alert and reminders', () => {
  it('every first conversion sends one English accounting email with the figures of the deposit', async () => {
    const s = await seed({
      method: 'payment_link',
      billing: { billing_name: 'Acme s.r.o.', billing_address: 'Main 1, Praha', billing_company_id: '12345678', billing_vat_id: 'CZ12345678', billing_note: 'PO <42>' },
    })
    await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)

    const mails = toAccounting()
    expect(mails).toHaveLength(1)
    const mail = mails[0]
    expect(mail.to).toBe('accounting@example.com')
    expect(mail.key).toBe(`quote-accounting:${s.quoteId}`)
    expect(mail.subject).toContain(s.reference)
    const body = mail.html ?? ''
    expect(body).toContain(s.reference)
    expect(body).toContain('Acme s.r.o.')
    expect(body).toContain('Main 1, Praha')
    expect(body).toContain('CZ12345678')
    expect(body).toContain('PO &lt;42&gt;')
    expect(body).not.toContain('PO <42>')
    expect(body).toContain(formatMinor(s.deposit, 'eur'))
    expect(body).toContain(formatMinor(s.total, 'eur'))
    expect(body).toContain(formatMinor(3000, 'eur'))
    expect(body).toContain(formatMinor(10000, 'eur'))
    expect(body).toContain('payment_link')
    expect(body).toContain('pi_1')
    // No more client data than the booking alert: no email address, no phone number.
    expect(body).not.toContain(CLIENT_EMAIL)
    expect(body).not.toContain(CLIENT_PHONE)
    expect(eventKeys(s.quoteId)).toContain('email:accounting')

    await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    expect(toAccounting()).toHaveLength(1)
  })

  it('an invoice quote says "Invoice requested", sets invoice_requested_at once and records an event', async () => {
    const s = await seed({ method: 'invoice' })
    const pi = depositIntent(s)
    await applyQuoteDepositPaid(pi, WEBHOOK)

    const mail = toAccounting()[0]
    expect(mail.subject.startsWith('Invoice requested')).toBe(true)
    expect(mail.html).toContain('Invoice requested')
    const quote = db.state.quotes.find((q) => q.id === s.quoteId) as Row
    const stamp = quote.invoice_requested_at
    expect(typeof stamp).toBe('string')
    expect(events(s.quoteId).filter((e) => e.kind === 'invoice_requested')).toHaveLength(1)

    await applyQuoteDepositPaid(pi, WEBHOOK)
    expect((db.state.quotes.find((q) => q.id === s.quoteId) as Row).invoice_requested_at).toBe(stamp)
    expect(events(s.quoteId).filter((e) => e.kind === 'invoice_requested')).toHaveLength(1)
  })

  it('a quote of another method does not request an invoice', async () => {
    const s = await seed({ method: 'cash' })
    await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    expect((db.state.quotes.find((q) => q.id === s.quoteId) as Row).invoice_requested_at ?? null).toBeNull()
    expect(toAccounting()[0].subject.startsWith('Invoice requested')).toBe(false)
  })

  it('without ACCOUNTING_EMAIL the copy goes to MANAGER_EMAIL', async () => {
    delete process.env.ACCOUNTING_EMAIL
    const s = await seed()
    await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
    const copies = sent().filter((m) => m.key.startsWith('quote-accounting:'))
    expect(copies).toHaveLength(1)
    expect(copies[0].to).toBe('owner@example.com')
  })

  it('with neither address set the step records email_failed with a code and the other steps still run', async () => {
    delete process.env.ACCOUNTING_EMAIL
    delete process.env.MANAGER_EMAIL
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const s = await seed()
      const result = await applyQuoteDepositPaid(depositIntent(s), WEBHOOK)
      expect(result.outcome).toBe('converted')
      const failed = events(s.quoteId).filter((e) => e.kind === 'email_failed')
      expect(failed.length).toBeGreaterThan(0)
      expect(failed.some((e) => e.error_code === 'no_accounting_address')).toBe(true)
      expect(eventKeys(s.quoteId)).not.toContain('email:accounting')
      expect(toClient()).toHaveLength(1)
      expect(mockSchedule).toHaveBeenCalledTimes(2)
    } finally {
      errors.mockRestore()
    }
  })

  it('one quote_paid operator alert, however often the deposit is delivered', async () => {
    const s = await seed()
    const pi = depositIntent(s)
    await applyQuoteDepositPaid(pi, WEBHOOK)
    await applyQuoteDepositPaid(pi, WEBHOOK)
    const mails = alerts()
    expect(mails).toHaveLength(1)
    expect(mails[0].to).toBe('owner@example.com')
    expect(mails[0].subject).toContain(s.reference)
    expect(eventKeys(s.quoteId).filter((k) => k === 'alert:quote_paid')).toHaveLength(1)
  })

  it('one reminder per booking with the booking pickup instant; a replay adds none', async () => {
    const s = await seed()
    const pi = depositIntent(s)
    const result = await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(mockSchedule).toHaveBeenCalledTimes(2)
    const pickups = new Map(
      (result.bookingIds ?? []).map((id) => {
        const b = db.state.bookings.find((row) => row.id === id) as Row
        return [id, pickupInstantMs({ pickup_utc: (b.pickup_utc as string | null) ?? null, pickup_date: String(b.pickup_date), pickup_time: String(b.pickup_time) })]
      }),
    )
    for (const [id, ms] of pickups) expect(mockSchedule).toHaveBeenCalledWith(id, ms)
    expect(eventKeys(s.quoteId)).toContain('reminders')

    await applyQuoteDepositPaid(pi, WEBHOOK)
    expect(mockSchedule).toHaveBeenCalledTimes(2)
  })

  it('a crash after the accounting copy was sent but before it was recorded repeats it under the same Resend key', async () => {
    const s = await seed()
    const pi = depositIntent(s)
    await applyQuoteDepositPaid(pi, WEBHOOK)
    db.state.quote_events = db.state.quote_events.filter((e) => e.event_key !== 'email:accounting')
    await applyQuoteDepositPaid(pi, WEBHOOK)
    const copies = toAccounting()
    expect(copies).toHaveLength(2)
    expect(new Set(copies.map((m) => m.key)).size).toBe(1)
  })
})
