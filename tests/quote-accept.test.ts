// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, FakeStripeError, type FakeStripe } from './helpers/fake-stripe'
import { seedPublicQuote, type PublicQuoteFixture } from './helpers/quote-public-fixture'
import { locales } from '@/i18n/locales'
import { formatLocaleDateTime } from '@/lib/locale-date'
import { formatMinor } from '@/lib/payments/money'
import { consentSha256 } from '@/lib/payments/consent'
import { stripeKeys } from '@/lib/payments/stripe'

/**
 * Phase 92 plan 92-16 Tasks 1 and 2 (QUOTE-03, QUOTE-05; D-05, D-07, D-08, D-18, D-21, D-22; T-92-49..53).
 *
 * Tracer: acceptQuote on a sent quote logs one acceptance (the server-rendered consent text and its SHA-256, IP, user
 * agent, version) BEFORE any Stripe call, sets the quote to accepted, and creates the one deposit PaymentIntent that also
 * saves the card (kind card_quote_deposit, never on a booking). Runs lib/quotes/accept.ts and consent.ts for real against
 * the in-memory payments database and the in-memory Stripe.
 */

const { world, settingsMock } = vi.hoisted(() => ({
  world: { client: null as unknown, stripe: null as unknown },
  settingsMock: vi.fn(),
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

import { acceptQuote } from '@/lib/quotes/accept'
import { renderQuoteTerms } from '@/lib/quotes/consent'
import { resolveQuoteToken } from '@/lib/quotes/resolve'
import { QUOTE_CONSENT_VERSION } from '@/lib/payments/consent-text'

// Prague wall clock 2027-06-10 10:30 is 08:30 UTC (CEST). Now is a month before.
const NOW = Date.parse('2027-05-10T10:00:00Z')
const IP = '203.0.113.9'
const UA = 'Mozilla/5.0 (test)'

let db: FakePaymentsDb
let fake: FakeStripe
/** The number of acceptance rows at the moment of each Stripe call, in order (the log must exist before the first). */
let acceptancesAtStripeCall: Array<{ method: string; rows: number }>

/** The fake Stripe, wrapped so every call also records how many acceptance rows existed at that moment. */
function recordingStripe(inner: FakeStripe['stripe']): unknown {
  const wrapGroup = (group: string, obj: Record<string, unknown>) =>
    new Proxy(obj, {
      get(target, prop) {
        const value = target[prop as string]
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          acceptancesAtStripeCall.push({ method: `${group}.${String(prop)}`, rows: db.state.quote_acceptances.length })
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      },
    })
  return {
    customers: wrapGroup('customers', inner.customers as unknown as Record<string, unknown>),
    paymentIntents: wrapGroup('paymentIntents', inner.paymentIntents as unknown as Record<string, unknown>),
  }
}

async function seed(over: Parameters<typeof seedPublicQuote>[1] = {}): Promise<PublicQuoteFixture> {
  return seedPublicQuote(db, over)
}

function accept(fx: PublicQuoteFixture, over: Partial<Parameters<typeof acceptQuote>[0]> = {}) {
  return acceptQuote({
    token: fx.token,
    displayedVersionNo: 1,
    displayedDepositMinor: 9000,
    ip: IP,
    userAgent: UA,
    nowMs: NOW,
    ...over,
  })
}

beforeEach(() => {
  db = createFakePaymentsDb()
  fake = createFakeStripe({ nowSec: () => Math.floor(NOW / 1000) })
  acceptancesAtStripeCall = []
  world.client = db.client
  world.stripe = recordingStripe(fake.stripe)
  settingsMock.mockReset()
  settingsMock.mockResolvedValue({ mode: 'on', leadHours: 72, canaryEmails: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const acceptances = () => db.state.quote_acceptances
const quoteRow = () => db.state.quotes[0]
const eventKinds = () => db.state.quote_events.map((e) => e.kind)

describe('acceptQuote (tracer)', () => {
  it('logs the acceptance, accepts the quote and creates one deposit PaymentIntent that saves the card', async () => {
    const fx = await seed()
    const res = await accept(fx)

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.amountMinor).toBe(9000)
    expect(res.currency).toBe('eur')
    expect(res.clientSecret).toMatch(/^pi_\d+_secret_fake$/)

    // One acceptance row with everything D-08 asks for.
    expect(acceptances()).toHaveLength(1)
    const a = acceptances()[0]
    expect(a.quote_id).toBe(fx.quoteId)
    expect(a.version_id).toBe(fx.versionId)
    expect(a.link_id).toBe(fx.linkId)
    expect(a.ip).toBe(IP)
    expect(a.user_agent).toBe(UA)
    expect(a.locale).toBe('en')
    expect(a.terms_version).toBe(QUOTE_CONSENT_VERSION)
    expect(a.terms_version).toBe('quote-2026-11-1')
    expect(a.terms_sha256).toBe(consentSha256(a.terms_rendered as string))
    expect(a.deposit_minor).toBe(9000)
    expect(a.currency).toBe('eur')
    expect(a.hold_lead_hours).toBe(72)
    expect(typeof a.accepted_at).toBe('string')

    // The quote moved to accepted on the version that was shown.
    expect(quoteRow().status).toBe('accepted')
    expect(quoteRow().accepted_version_id).toBe(fx.versionId)
    expect(quoteRow().accepted_at).not.toBeNull()

    // Stripe: one customer keyed cus:quote:<id> with the quote id only, one PaymentIntent for the deposit.
    const cust = fake.callsTo('customers.create')
    expect(cust).toHaveLength(1)
    expect(cust[0].idempotencyKey).toBe(stripeKeys.quoteCustomer(fx.quoteId))
    expect(cust[0].idempotencyKey).toBe(`cus:quote:${fx.quoteId}`)
    expect((cust[0].params as { metadata: Record<string, string> }).metadata).toEqual({ quoteId: fx.quoteId })

    const pis = fake.callsTo('paymentIntents.create')
    expect(pis).toHaveLength(1)
    const p = pis[0].params as Record<string, unknown>
    expect(p.amount).toBe(9000)
    expect(p.currency).toBe('eur')
    expect(p.payment_method_types).toEqual(['card'])
    expect(p.setup_future_usage).toBe('off_session')
    expect('capture_method' in p).toBe(false)
    expect('confirm' in p).toBe(false)
    expect(p.customer).toBe(quoteRow().stripe_customer_id)
    expect(p.metadata).toEqual({
      kind: 'card_quote_deposit',
      quoteId: fx.quoteId,
      versionId: fx.versionId,
      quoteReference: 'Q-20261114-ABC123',
      acceptanceId: a.id,
    })
    expect(pis[0].idempotencyKey).toBe(`qdep:${fx.versionId}:${a.id}`)

    // The intent is stored on the acceptance and on the quote, and on no booking.
    const piId = [...fake.state.paymentIntents.keys()][0]
    expect(a.payment_intent_id).toBe(piId)
    expect(quoteRow().deposit_payment_intent_id).toBe(piId)
    expect(db.state.bookings.some((b) => b.payment_intent_id === piId || b.hold_payment_intent_id === piId)).toBe(false)

    // One deposit_started event keyed by the intent.
    expect(eventKinds().filter((k) => k === 'deposit_started')).toHaveLength(1)
    const started = db.state.quote_events.find((e) => e.kind === 'deposit_started')!
    expect(started.stripe_object_id).toBe(piId)
    expect(started.amount_minor).toBe(9000)
  })

  it('writes the acceptance BEFORE the first Stripe call (T-92-51)', async () => {
    const fx = await seed()
    await accept(fx)
    expect(acceptancesAtStripeCall.length).toBeGreaterThan(0)
    for (const call of acceptancesAtStripeCall) expect(call.rows, call.method).toBe(1)
  })

  it('keeps the acceptance row when Stripe fails and answers stripe_error, without leaking Stripe text', async () => {
    const fx = await seed()
    fake.failNextWithError(
      'paymentIntents.create',
      new FakeStripeError('StripeInvalidRequestError', 'secret stripe detail sk_live_leak', { code: 'parameter_invalid', statusCode: 400 }),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const res = await accept(fx)
    expect(res).toEqual({ ok: false, code: 'stripe_error' })
    expect(acceptances()).toHaveLength(1)
    expect(acceptances()[0].payment_intent_id).toBeNull()
    expect(quoteRow().deposit_payment_intent_id).toBeNull()
    const logged = JSON.stringify([...spy.mock.calls, ...warn.mock.calls])
    expect(logged).not.toContain('sk_live_leak')
    expect(logged).not.toContain(fx.token)
  })

  it('clamps the IP to 64 characters and the user agent to 300', async () => {
    const fx = await seed()
    await accept(fx, { ip: 'f'.repeat(120), userAgent: 'u'.repeat(900) })
    expect((acceptances()[0].ip as string).length).toBe(64)
    expect((acceptances()[0].user_agent as string).length).toBe(300)
  })

  it('answers a malformed or unknown token with invalid_link and writes nothing', async () => {
    await seed()
    expect(await acceptQuote({ token: 'nope', displayedVersionNo: 1, displayedDepositMinor: 9000, ip: IP, userAgent: UA, nowMs: NOW })).toEqual({
      ok: false,
      code: 'invalid_link',
    })
    expect(
      await acceptQuote({ token: 'B'.repeat(43), displayedVersionNo: 1, displayedDepositMinor: 9000, ip: IP, userAgent: UA, nowMs: NOW }),
    ).toEqual({ ok: false, code: 'invalid_link' })
    expect(acceptances()).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
  })

  it('accepts a viewed quote the same way', async () => {
    const fx = await seed({ status: 'viewed' })
    const res = await accept(fx)
    expect(res.ok).toBe(true)
    expect(quoteRow().status).toBe('accepted')
  })
})

describe('renderQuoteTerms (D-08, D-21, D-22)', () => {
  const messagesOf = (locale: string) =>
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'messages', `${locale}.json`), 'utf8')).Quote as {
      consent: Record<string, string>
      remainder: Record<string, string>
      terms: Record<string, string>
    }
  const iso = (v: string | number) => `⁦${v}⁩`
  const fill = (tpl: string, vars: Record<string, string | number>) =>
    tpl.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k]))

  it('renders the Arabic saved_card consent with reference, version and deposit, plus the Arabic terms, with a stable hash', async () => {
    const fx = await seed({ locale: 'ar', remainderMethod: 'saved_card', cancelFreeHours: 336 })
    const resolved = (await resolveQuoteToken(fx.token, NOW))!
    const ar = messagesOf('ar')
    const freeUntilMs = Date.parse('2027-06-10T08:30:00Z') - 336 * 3_600_000

    const a = await renderQuoteTerms({ resolved, nowMs: NOW })
    const b = await renderQuoteTerms({ resolved, nowMs: NOW })

    expect(a.version).toBe('quote-2026-11-1')
    expect(a.text).toContain(
      fill(ar.consent.saved_card, { reference: iso('Q-20261114-ABC123'), version: iso(1), deposit: iso(formatMinor(9000, 'eur')) }),
    )
    expect(a.text).toContain(fill(ar.terms.free, { freeUntil: iso(formatLocaleDateTime(freeUntilMs, 'ar')) }))
    expect(a.text).toContain(ar.terms.lateAll)
    expect(a.text).toContain(ar.terms.cap)
    expect(a.sha256).toBe(consentSha256(a.text))
    expect(b).toEqual(a)
  })

  it('renders the late percent and the no-free wording when the free window has passed', async () => {
    const fx = await seed({ cancelFreeHours: 48, cancelFeePercent: 40 })
    const resolved = (await resolveQuoteToken(fx.token, NOW))!
    const en = messagesOf('en')
    // One hour before the pickup the free window (48 h) is over.
    const late = await renderQuoteTerms({ resolved, nowMs: Date.parse('2027-06-10T07:30:00Z') })
    expect(late.text).toContain(en.terms.noFree)
    expect(late.text).toContain(fill(en.terms.latePercent, { percent: 40 }))
    expect(late.text).not.toContain('Free cancellation until')
  })

  it('renders each remainder method with its own consent sentence and remainder line', async () => {
    for (const method of ['saved_card', 'payment_link', 'cash', 'invoice'] as const) {
      db = createFakePaymentsDb()
      world.client = db.client
      const fx = await seed({ remainderMethod: method })
      const resolved = (await resolveQuoteToken(fx.token, NOW))!
      const en = messagesOf('en')
      const r = await renderQuoteTerms({ resolved, nowMs: NOW })
      expect(r.text, method).toContain(
        fill(en.consent[method], { reference: iso('Q-20261114-ABC123'), version: iso(1), deposit: iso(formatMinor(9000, 'eur')) }),
      )
      expect(r.text, method).toContain(en.remainder[method])
    }
  })

  it('renders in every site locale without a leftover placeholder and within the 4000 character column', async () => {
    for (const locale of locales) {
      db = createFakePaymentsDb()
      world.client = db.client
      const fx = await seed({ locale })
      const resolved = (await resolveQuoteToken(fx.token, NOW))!
      const r = await renderQuoteTerms({ resolved, nowMs: NOW })
      expect(r.text, locale).not.toMatch(/[{}]/)
      expect(r.text.length, locale).toBeGreaterThan(50)
      expect(r.text.length, locale).toBeLessThanOrEqual(4000)
      expect(r.sha256, locale).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})

const livePis = () => [...fake.state.paymentIntents.values()].filter((p) => p.status !== 'canceled')

describe('acceptQuote: one live deposit intent per quote (Pitfall 8, T-92-50)', () => {
  it('Pitfall 8: a second accept while the intent is live returns the same secret, logs a second row, creates no intent', async () => {
    const fx = await seed()
    const first = await accept(fx)
    const second = await accept(fx)
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(second.clientSecret).toBe(first.clientSecret)
    expect(fake.executed('paymentIntents.create')).toBe(1)
    expect(acceptances()).toHaveLength(2)
    const piId = [...fake.state.paymentIntents.keys()][0]
    expect(acceptances().map((a) => a.payment_intent_id)).toEqual([piId, piId])
    expect(quoteRow().deposit_payment_intent_id).toBe(piId)
    expect(eventKinds().filter((k) => k === 'deposit_started')).toHaveLength(1)
    expect(livePis()).toHaveLength(1)
  })

  it('answers already_paying while the stored intent is processing or succeeded', async () => {
    for (const status of ['processing', 'succeeded', 'requires_capture']) {
      db = createFakePaymentsDb()
      world.client = db.client
      fake = createFakeStripe()
      world.stripe = recordingStripe(fake.stripe)
      const fx = await seed()
      expect((await accept(fx)).ok).toBe(true)
      fake.setPaymentIntentStatus([...fake.state.paymentIntents.keys()][0], status)
      const before = fake.executed('paymentIntents.create')
      expect(await accept(fx), status).toEqual({ ok: false, code: 'already_paying' })
      expect(fake.executed('paymentIntents.create'), status).toBe(before)
    }
  })

  it('answers already_paid for a paid quote, writes no row and calls no Stripe', async () => {
    const fx = await seed({ status: 'paid' })
    expect(await accept(fx)).toEqual({ ok: false, code: 'already_paid' })
    expect(acceptances()).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
  })

  it('replaces a canceled intent with a new one tied to the new acceptance', async () => {
    const fx = await seed()
    expect((await accept(fx)).ok).toBe(true)
    const oldId = [...fake.state.paymentIntents.keys()][0]
    await fake.stripe.paymentIntents.cancel(oldId)

    const res = await accept(fx)
    expect(res.ok).toBe(true)
    expect(fake.executed('paymentIntents.create')).toBe(2)
    const second = acceptances()[1]
    const newId = second.payment_intent_id as string
    expect(newId).not.toBe(oldId)
    expect(quoteRow().deposit_payment_intent_id).toBe(newId)
    const meta = fake.state.paymentIntents.get(newId)!.metadata as Record<string, string>
    expect(meta.acceptanceId).toBe(second.id)
    expect(fake.callsTo('paymentIntents.create')[1].idempotencyKey).toBe(`qdep:${fx.versionId}:${second.id}`)
    expect(livePis()).toHaveLength(1)
  })

  it('replaces an intent that no longer exists at Stripe', async () => {
    const fx = await seed()
    expect((await accept(fx)).ok).toBe(true)
    const oldId = [...fake.state.paymentIntents.keys()][0]
    fake.state.paymentIntents.delete(oldId)

    expect((await accept(fx)).ok).toBe(true)
    expect(quoteRow().deposit_payment_intent_id).not.toBe(oldId)
  })

  it('cancels a live intent that does not match this deposit and creates a fresh one, never handing the old secret out', async () => {
    const fx = await seed()
    expect((await accept(fx)).ok).toBe(true)
    const oldId = [...fake.state.paymentIntents.keys()][0]
    fake.state.paymentIntents.get(oldId)!.amount = 5000 // a stale intent from a changed quote

    const res = await accept(fx)
    expect(res.ok).toBe(true)
    expect(fake.state.paymentIntents.get(oldId)!.status).toBe('canceled')
    expect(fake.callsTo('paymentIntents.cancel')[0].idempotencyKey).toBe(stripeKeys.quoteDepositVoid(oldId))
    expect(livePis()).toHaveLength(1)
    expect(livePis()[0].amount).toBe(9000)
  })

  it('answers busy and creates nothing when a stale intent cannot be canceled', async () => {
    const fx = await seed()
    expect((await accept(fx)).ok).toBe(true)
    const oldId = [...fake.state.paymentIntents.keys()][0]
    fake.state.paymentIntents.get(oldId)!.amount = 5000
    fake.failNextWith('paymentIntents.cancel', 'connection')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(await accept(fx)).toEqual({ ok: false, code: 'busy' })
    expect(fake.executed('paymentIntents.create')).toBe(1)
  })

  it('Pitfall 8: two concurrent accepts leave one live intent; the loser cancels its own with the void key and answers busy', async () => {
    const fx = await seed()
    const [a, b] = await Promise.all([accept(fx), accept(fx)])
    const results = [a, b]
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'busy' }])

    expect(fake.executed('paymentIntents.create')).toBe(2)
    expect(livePis()).toHaveLength(1)
    const winner = livePis()[0]
    expect(quoteRow().deposit_payment_intent_id).toBe(winner.id)

    const loser = [...fake.state.paymentIntents.values()].find((p) => p.status === 'canceled')!
    const cancel = fake.callsTo('paymentIntents.cancel')
    expect(cancel).toHaveLength(1)
    expect(cancel[0].targetId).toBe(loser.id)
    expect(cancel[0].idempotencyKey).toBe(stripeKeys.quoteDepositVoid(loser.id))
    // Only the winner is linked to an acceptance and has a deposit_started event.
    expect(acceptances().filter((x) => x.payment_intent_id === winner.id)).toHaveLength(1)
    expect(acceptances().some((x) => x.payment_intent_id === loser.id)).toBe(false)
    expect(eventKinds().filter((k) => k === 'deposit_started')).toHaveLength(1)
    // The quote moved to accepted once.
    expect(eventKinds().filter((k) => k === 'accepted')).toHaveLength(1)
  })
})

describe('acceptQuote: what can not be accepted (D-05, D-02, QUOTE-06, T-92-49, T-92-53)', () => {
  const noTrace = (fx: PublicQuoteFixture) => {
    expect(acceptances()).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
    expect(quoteRow().status).not.toBe('accepted')
    expect(fx.quoteId).toBe(quoteRow().id)
  }

  it('D-05: a first pickup in the past is invalid_link, no row and no Stripe call', async () => {
    const fx = await seed()
    // 2027-06-10 10:30 Prague is 08:30 UTC: one minute after it.
    const res = await accept(fx, { nowMs: Date.parse('2027-06-10T08:31:00Z') })
    expect(res).toEqual({ ok: false, code: 'invalid_link' })
    noTrace(fx)
  })

  it('D-05: the pickup instant itself is already too late', async () => {
    const fx = await seed()
    expect(await accept(fx, { nowMs: Date.parse('2027-06-10T08:30:00Z') })).toEqual({ ok: false, code: 'invalid_link' })
    noTrace(fx)
  })

  it('D-02: an expired quote is invalid_link', async () => {
    const fx = await seed({ expiresAt: '2027-05-01T00:00:00.000Z' })
    expect(await accept(fx)).toEqual({ ok: false, code: 'invalid_link' })
    noTrace(fx)
  })

  it('a voided, draft, superseded, revoked or cancelled quote is the same invalid_link', async () => {
    const cases: Array<Parameters<typeof seedPublicQuote>[1]> = [
      { status: 'voided' },
      { status: 'draft' },
      { supersede: true },
      { revokeLink: true },
      { cancelledAt: '2027-05-01T00:00:00.000Z' },
    ]
    for (const over of cases) {
      db = createFakePaymentsDb()
      world.client = db.client
      fake = createFakeStripe()
      world.stripe = recordingStripe(fake.stripe)
      const fx = await seed(over)
      expect(await accept(fx), JSON.stringify(over)).toEqual({ ok: false, code: 'invalid_link' })
      noTrace(fx)
    }
  })

  it('T-92-49: a displayed deposit that differs from the version is quote_changed and writes nothing', async () => {
    const fx = await seed()
    expect(await accept(fx, { displayedDepositMinor: 8999 })).toEqual({ ok: false, code: 'quote_changed' })
    noTrace(fx)
    expect(await accept(fx, { displayedDepositMinor: 1 })).toEqual({ ok: false, code: 'quote_changed' })
    noTrace(fx)
  })

  it('a displayed version number that differs from the version is quote_changed and writes nothing', async () => {
    const fx = await seed()
    expect(await accept(fx, { displayedVersionNo: 2 })).toEqual({ ok: false, code: 'quote_changed' })
    noTrace(fx)
  })

  it('the amount sent to Stripe is the stored deposit whatever the client displayed value was (matching only)', async () => {
    const fx = await seed()
    const res = await accept(fx, { displayedDepositMinor: 9000 })
    expect(res.ok && res.amountMinor).toBe(9000)
    expect(fake.callsTo('paymentIntents.create')[0].params.amount).toBe(9000)
  })
})
