// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'
import { DEFAULT_POLICY } from '@/lib/cancellation-policy'
import { QUOTE_CONSENT_VERSION } from '@/lib/payments/consent-text'
import { formatMinor } from '@/lib/payments/money'
import { hashQuoteToken } from '@/lib/quotes/token'
import { resolveQuoteToken } from '@/lib/quotes/resolve'

/**
 * Phase 92 plan 92-13 (QUOTE-01, QUOTE-02, QUOTE-06, QUOTE-07): the operator's lifecycle actions on a quote. The
 * routes, the lifecycle service, the email and the link resolver run for real against the in-memory database; Resend,
 * Google Routes, the tariffs and the global cancellation policy are doubles, the admin session is a switch.
 */

const { world, mockResendSend, computeRouteDistanceMock } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    auth: 'admin' as 'admin' | '401' | '403',
    stripe: null as unknown,
  },
  mockResendSend: vi.fn(),
  computeRouteDistanceMock: vi.fn(),
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
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/cancellation-settings', () => ({
  getCancellationPolicy: async () => ({ ...DEFAULT_POLICY }),
}))
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: computeRouteDistanceMock }))
vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: async () => ({
    ratePerKm: { business: 2, first_class: 3, business_van: 2.5 },
    hourlyRate: { business: 50, first_class: 70, business_van: 60 },
    dailyRate: { business: 200, first_class: 280, business_van: 240 },
    minFare: { business: 10, first_class: 10, business_van: 10 },
    waitingRate: { business: 12 },
    globals: {
      airportFee: 5,
      nightCoefficient: 1.2,
      holidayCoefficient: 1.3,
      extraChildSeat: 10,
      extraLuggage: 7,
      holidayDates: [],
      returnDiscountPercent: 10,
      hourlyMinHours: 2,
      hourlyMaxHours: 8,
      notificationFlags: null,
      airportPromoActive: false,
      airportRegularPriceEur: 69,
      airportPromoPriceEur: 59,
    },
  }),
}))

import { POST as CREATE } from '@/app/api/admin/quotes/route'
import { PATCH } from '@/app/api/admin/quotes/[id]/route'
import { POST as SEND } from '@/app/api/admin/quotes/[id]/send/route'
import { POST as LINK } from '@/app/api/admin/quotes/[id]/link/route'
import { POST as REVISE } from '@/app/api/admin/quotes/[id]/revise/route'
import { POST as VOID } from '@/app/api/admin/quotes/[id]/void/route'

let db: FakePaymentsDb
let fake: FakeStripe

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function req(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const send = (id: string, body?: unknown) => SEND(req('POST', `http://localhost/api/admin/quotes/${id}/send`, body), params(id))
const revise = (id: string, body?: unknown) => REVISE(req('POST', `http://localhost/api/admin/quotes/${id}/revise`, body), params(id))
const voidQuote = (id: string, body?: unknown) => VOID(req('POST', `http://localhost/api/admin/quotes/${id}/void`, body), params(id))
const link = (id: string, body?: unknown) => LINK(req('POST', `http://localhost/api/admin/quotes/${id}/link`, body), params(id))

const PRAGUE = { address: 'Wenceslas Square, Prague', lat: 50.0813, lng: 14.4284 }
const VIENNA = { address: 'Stephansplatz, Vienna', lat: 48.2085, lng: 16.3721 }

function lineBody(over: Record<string, unknown> = {}) {
  return {
    trip_type: 'transfer',
    pickup_date: '2090-05-10',
    pickup_time: '12:00',
    origin: PRAGUE,
    destination: VIENNA,
    stops: [],
    vehicle_class: 'business',
    passengers: 2,
    luggage: 1,
    amount_minor: 30000,
    ...over,
  }
}

interface DraftOptions {
  firstName?: string
  lines?: Array<Record<string, unknown>>
  deposit?: { kind: 'percent' | 'fixed'; value: number }
  remainderMethod?: 'saved_card' | 'payment_link' | 'cash' | 'invoice'
  cancelFreeHours?: number | null
  locale?: string
}

/** A complete draft made through the real admin routes: two lines, 30% deposit, saved card, custom 336 free hours. */
async function draftQuote(opts: DraftOptions = {}): Promise<string> {
  const created = await CREATE(
    req('POST', 'http://localhost/api/admin/quotes', {
      client: { first_name: opts.firstName ?? 'Ivan', last_name: 'Petrov', email: 'ivan@example.com', phone: '+420123456789' },
      lead_channel: 'whatsapp',
      currency: 'eur',
    }),
  )
  expect(created.status).toBe(201)
  const { id } = (await created.json()) as { id: string }
  const patched = await PATCH(
    req('PATCH', `http://localhost/api/admin/quotes/${id}`, {
      ...(opts.locale ? { locale: opts.locale } : {}),
      deposit: opts.deposit ?? { kind: 'percent', value: 30 },
      remainder_method: opts.remainderMethod ?? 'saved_card',
      cancel_free_hours: opts.cancelFreeHours === undefined ? 336 : opts.cancelFreeHours,
      lines: opts.lines ?? [lineBody({ amount_minor: 30000 }), lineBody({ pickup_date: '2090-05-12', amount_minor: 18000 })],
    }),
    params(id),
  )
  expect(patched.status).toBe(200)
  return id
}

const quoteRow = (id: string) => db.state.quotes.find((q) => q.id === id)!
const versionsOf = (id: string) => db.state.quote_versions.filter((v) => v.quote_id === id)
const linesOf = (versionId: unknown) => db.state.quote_version_lines.filter((l) => l.version_id === versionId)
const linksOf = (id: string) => db.state.quote_links.filter((l) => l.quote_id === id)
const eventKinds = (id: string) => db.state.quote_events.filter((e) => e.quote_id === id).map((e) => e.kind)

const tokenOf = (url: string): string => url.split('/').pop() as string

beforeEach(() => {
  vi.clearAllMocks()
  world.auth = 'admin'
  computeRouteDistanceMock.mockResolvedValue({ ok: true, distanceKm: 130, durationMin: 90 })
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  fake = createFakeStripe()
  world.stripe = fake.stripe
  db = createFakePaymentsDb()
  world.db ={ client: { from: (t) => db.client.from(t), rpc: (n, a) => db.client.rpc(n, a) } }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tracer: send = freeze + link + email, the URL returned once', () => {
  it('freezes version 1 with money, the quote cancellation snapshot and the terms version (D-03, D-06, D-11, D-13)', async () => {
    const id = await draftQuote({ firstName: '<b>Ivan</b>' })
    const res = await send(id)
    expect(res.status).toBe(200)
    const out = (await res.json()) as { status: string; url: string; emailed: boolean }
    expect(out.status).toBe('sent')
    expect(out.emailed).toBe(true)

    const [version] = versionsOf(id)
    expect(version.frozen_at).toBeTruthy()
    expect(version.total_minor).toBe(48000)
    expect(version.deposit_minor).toBe(14400)
    expect(version.terms_version).toBe(QUOTE_CONSENT_VERSION)
    expect(version.terms_version).toBe('quote-2026-11-1')
    expect(String(version.cancel_policy_version).startsWith('quote-')).toBe(true)
    expect(version.cancel_policy).toMatchObject({ freeHoursShort: 336, freeHoursLong: 336, freeHoursHourly: 336, feePercent: 100 })

    const lines = linesOf(version.id)
    expect(lines.map((l) => l.deposit_share_minor)).toEqual([9000, 5400])
    expect(lines.reduce((sum, l) => sum + (l.deposit_share_minor as number), 0)).toBe(14400)
    expect(lines.map((l) => l.remainder_minor)).toEqual([21000, 12600])
    for (const l of lines) {
      expect(l.amount_eur).toBe((l.amount_minor as number) / 100)
      expect(typeof l.amount_czk).toBe('number')
      expect(l.amount_czk as number).toBeGreaterThan(0)
    }
    expect(quoteRow(id).status).toBe('sent')
  })

  it('stores one link as a 64-hex hash and never the raw token; events sent, link_minted, email_sent', async () => {
    const id = await draftQuote()
    const out = (await (await send(id)).json()) as { url: string }
    const token = tokenOf(out.url)

    const links = linksOf(id)
    expect(links).toHaveLength(1)
    expect(links[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(links[0].token_hash).toBe(hashQuoteToken(token))
    expect(JSON.stringify(db.state)).not.toContain(token)

    expect(eventKinds(id)).toEqual(expect.arrayContaining(['created', 'sent', 'link_minted', 'email_sent']))
    const keys = db.state.quote_events.filter((e) => e.quote_id === id).map((e) => e.event_key)
    expect(keys).toContain(`link:${links[0].id}`)
    expect(keys).toContain(`email:sent:${links[0].id}`)
  })

  it('the URL resolves through resolveQuoteToken to the offer; the email carries it, the total and the deposit, escapes the name', async () => {
    const id = await draftQuote({ firstName: '<b>Ivan</b>' })
    const out = (await (await send(id)).json()) as { url: string }

    const resolved = await resolveQuoteToken(tokenOf(out.url))
    expect(resolved?.state).toBe('offer')
    expect(resolved?.quote.id).toBe(id)

    expect(mockResendSend).toHaveBeenCalledTimes(1)
    const [message, options] = mockResendSend.mock.calls[0]
    expect(message.to).toEqual(['ivan@example.com'])
    expect(message.html).toContain(out.url)
    expect(message.html).toContain(formatMinor(48000, 'eur'))
    expect(message.html).toContain(formatMinor(14400, 'eur'))
    expect(message.html).toContain('&lt;b&gt;Ivan&lt;/b&gt;')
    expect(message.html).not.toContain('<b>Ivan</b>')
    expect(message.subject).not.toMatch(/[\r\n]/)
    expect(message.subject).toContain(quoteRow(id).reference)
    expect(options.idempotencyKey).toBe(`quote-sent:${linksOf(id)[0].id}`)
  })

  it('the email is in the language of the quote (D-09)', async () => {
    const id = await draftQuote({ locale: 'ar' })
    const out = (await (await send(id)).json()) as { url: string }
    expect(mockResendSend.mock.calls[0][0].html).toContain('<html lang="ar" dir="rtl"')
    expect(out.url).toContain('/ar/quote/')
  })

  it('a failing Resend answers 200 with emailed false and an email_failed event; the link still works', async () => {
    mockResendSend.mockRejectedValue(new Error('resend down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = await draftQuote()
    const res = await send(id)
    expect(res.status).toBe(200)
    const out = (await res.json()) as { url: string; emailed: boolean }
    expect(out.emailed).toBe(false)
    expect(eventKinds(id)).toContain('email_failed')
    expect(eventKinds(id)).not.toContain('email_sent')
    expect((await resolveQuoteToken(tokenOf(out.url)))?.state).toBe('offer')
  })

  it('resend true on a sent quote mints a second link, the first keeps working, and sends again', async () => {
    const id = await draftQuote()
    const first = (await (await send(id)).json()) as { url: string }
    const res = await send(id, { resend: true })
    expect(res.status).toBe(200)
    const second = (await res.json()) as { status: string; url: string; emailed: boolean }
    expect(second.status).toBe('sent')
    expect(second.url).not.toBe(first.url)
    expect(linksOf(id)).toHaveLength(2)
    expect(mockResendSend).toHaveBeenCalledTimes(2)
    expect((await resolveQuoteToken(tokenOf(first.url)))?.state).toBe('offer')
    expect((await resolveQuoteToken(tokenOf(second.url)))?.state).toBe('offer')
    expect(eventKinds(id).filter((k) => k === 'sent')).toHaveLength(1)
  })

  it('send without resend on a quote that is already sent is refused and sends nothing', async () => {
    const id = await draftQuote()
    await send(id)
    const res = await send(id)
    expect(res.status).toBe(422)
    expect(((await res.json()) as { code: string }).code).toBe('not_sendable')
    expect(mockResendSend).toHaveBeenCalledTimes(1)
  })
})

describe('refusals before anything is written', () => {
  it('D-05: the first pickup is not in the future -> 422 first_pickup_passed, nothing frozen, no email', async () => {
    const id = await draftQuote()
    for (const l of db.state.quote_version_lines) l.pickup_date = '2020-05-10'
    const res = await send(id)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'action_not_allowed', code: 'first_pickup_passed', reason: 'first_pickup_passed' })
    expect(versionsOf(id)[0].frozen_at).toBeNull()
    expect(quoteRow(id).status).toBe('draft')
    expect(linksOf(id)).toHaveLength(0)
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('D-02: the operator expiry date is past -> 422 expired, nothing frozen, no email', async () => {
    const id = await draftQuote()
    quoteRow(id).expires_at = '2020-01-01T23:59:59.000Z'
    const res = await send(id)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'action_not_allowed', code: 'expired' })
    expect(versionsOf(id)[0].frozen_at).toBeNull()
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('D-07: a 40-cent deposit -> 422 money_invalid deposit_below_minimum', async () => {
    const id = await draftQuote({ deposit: { kind: 'fixed', value: 40 } })
    const res = await send(id)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'action_not_allowed', code: 'money_invalid', reason: 'deposit_below_minimum' })
    expect(versionsOf(id)[0].frozen_at).toBeNull()
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('a draft without a deposit or without a remainder method is money_invalid (D-07: nothing is defaulted)', async () => {
    const id = await draftQuote()
    versionsOf(id)[0].deposit_kind = null
    versionsOf(id)[0].deposit_value = null
    const res = await send(id)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'money_invalid', reason: 'deposit_missing' })

    const id2 = await draftQuote()
    versionsOf(id2)[0].remainder_method = null
    expect(await (await send(id2)).json()).toMatchObject({ code: 'money_invalid', reason: 'remainder_method_missing' })
  })

  it('a transfer line without a server distance -> 422 distance_missing', async () => {
    const id = await draftQuote()
    linesOf(versionsOf(id)[0].id)[1].distance_km = null
    const res = await send(id)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'distance_missing' })
    expect(versionsOf(id)[0].frozen_at).toBeNull()
  })

  it('a voided quote -> 422 not_sendable, also with resend', async () => {
    const id = await draftQuote()
    quoteRow(id).status = 'voided'
    for (const body of [undefined, { resend: true }]) {
      const res = await send(id, body)
      expect(res.status).toBe(422)
      expect(await res.json()).toMatchObject({ code: 'not_sendable' })
    }
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('an unknown quote is 404', async () => {
    expect((await send('11111111-1111-4111-8111-111111111111')).status).toBe(404)
  })

  it('resend of a sent quote whose first pickup has passed is refused too (the link would be dead)', async () => {
    const id = await draftQuote()
    await send(id)
    for (const l of db.state.quote_version_lines) l.pickup_date = '2020-05-10'
    // The frozen version cannot change through the database guard, so the fake is edited directly.
    const res = await send(id, { resend: true })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'first_pickup_passed' })
  })
})

describe('concurrent sends', () => {
  it('two concurrent sends of one draft: one 200, one 409 busy, one email', async () => {
    const id = await draftQuote()
    const [a, b] = await Promise.all([send(id), send(id)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const loser = a.status === 409 ? a : b
    expect(await loser.json()).toEqual({ error: 'busy' })
    expect(mockResendSend).toHaveBeenCalledTimes(1)
    expect(linksOf(id)).toHaveLength(1)
    expect(eventKinds(id).filter((k) => k === 'sent')).toHaveLength(1)
  })
})

describe('QUOTE-02: a fresh link each time', () => {
  it.each(['sent', 'viewed', 'accepted', 'paid'] as const)('POST /link on a %s quote returns a new url whose hash is stored', async (status) => {
    const id = await draftQuote()
    const first = (await (await send(id)).json()) as { url: string }
    quoteRow(id).status = status

    const res = await link(id)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const { url } = (await res.json()) as { url: string }
    expect(url).not.toBe(first.url)
    expect(url).toMatch(/^https?:\/\/.+\/quote\/[A-Za-z0-9_-]{43}$/)

    const stored = linksOf(id).map((l) => l.token_hash)
    expect(stored).toContain(hashQuoteToken(tokenOf(url)))
    expect(JSON.stringify(db.state)).not.toContain(tokenOf(url))
    expect(linksOf(id)).toHaveLength(2)
    // Both links resolve (the first is not revoked); a paid quote shows the paid view.
    expect(await resolveQuoteToken(tokenOf(first.url))).not.toBeNull()
    expect(await resolveQuoteToken(tokenOf(url))).not.toBeNull()
    expect(db.state.quote_events.some((e) => e.kind === 'link_minted' && e.event_key === `link:${linksOf(id)[1].id}`)).toBe(true)
    // Copying a link does not email anybody.
    expect(mockResendSend).toHaveBeenCalledTimes(1)
  })

  it('on a draft or a voided quote it is 422 not_live and mints nothing', async () => {
    const id = await draftQuote()
    let res = await link(id)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'not_live' })

    await send(id)
    quoteRow(id).status = 'voided'
    res = await link(id)
    expect(res.status).toBe(422)
    expect(linksOf(id)).toHaveLength(1)
  })

  it('a cancelled quote has no live link to give', async () => {
    const id = await draftQuote()
    await send(id)
    quoteRow(id).cancelled_at = '2026-11-14T10:00:00.000Z'
    expect((await link(id)).status).toBe(422)
  })

  it('an unknown quote is 404', async () => {
    expect((await link('11111111-1111-4111-8111-111111111111')).status).toBe(404)
  })
})

describe('admin guards (send and link)', () => {
  const ID = '11111111-1111-4111-8111-111111111111'
  const calls = [
    ['send', (body?: unknown, id = ID) => send(id, body)],
    ['link', (body?: unknown, id = ID) => link(id, body)],
  ] as const

  it.each(calls)('%s: 401 without a session, 403 without the admin role, before anything is read', async (_name, call) => {
    world.auth = '401'
    expect((await call()).status).toBe(401)
    world.auth = '403'
    expect((await call()).status).toBe(403)
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it.each(calls)('%s: an invalid uuid is 400', async (_name, call) => {
    expect((await call(undefined, 'not-a-uuid')).status).toBe(400)
  })

  it.each(calls)('%s: an unknown body key is 400', async (_name, call) => {
    expect((await call({ surprise: true })).status).toBe(400)
  })

  it.each(calls)('%s: malformed JSON is 400', async (_name, call) => {
    expect((await call('{not json')).status).toBe(400)
  })

  it('send: a body over the cap is 413; resend must be a boolean (400)', async () => {
    expect((await send(ID, { resend: true, pad: 'x'.repeat(3000) })).status).toBe(413)
    expect((await send(ID, { resend: 'yes' })).status).toBe(400)
  })

  it('link: a body over 1000 bytes is 413', async () => {
    expect((await link(ID, { pad: 'x'.repeat(1500) })).status).toBe(413)
  })
})

describe('T-92-41: no raw token in any log line', () => {
  it('send, resend and link never log the token, its hash or the link', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info')]
    for (const spy of logs) spy.mockImplementation(() => {})
    mockResendSend.mockRejectedValueOnce(new Error('boom'))

    const id = await draftQuote()
    const first = (await (await send(id)).json()) as { url: string }
    const second = (await (await send(id, { resend: true })).json()) as { url: string }
    const third = (await (await link(id)).json()) as { url: string }

    const logged = JSON.stringify(logs.flatMap((spy) => spy.mock.calls))
    for (const url of [first.url, second.url, third.url]) {
      expect(logged).not.toContain(tokenOf(url))
      expect(logged).not.toContain(hashQuoteToken(tokenOf(url)))
    }
    expect(logged).not.toContain('ivan@example.com')
  })
})

// == Task 3: revise and void =========================================================================================

const BRNO = { address: 'Brno', lat: 49.1951, lng: 16.6068 }

/** A sent quote whose first line has one stop. */
async function sentQuote(): Promise<{ id: string; url: string }> {
  const id = await draftQuote({
    lines: [lineBody({ amount_minor: 30000, stops: [{ ...BRNO, wait_minutes: 30 }] }), lineBody({ pickup_date: '2090-05-12', amount_minor: 18000 })],
  })
  const out = (await (await send(id)).json()) as { url: string }
  return { id, url: out.url }
}

/** A deposit PaymentIntent in the fake Stripe, stored on the quote like the accept flow does. */
async function depositIntent(id: string, status: string): Promise<string> {
  const pi = await fake.stripe.paymentIntents.create({ amount: 14400, currency: 'eur' })
  fake.state.paymentIntents.get(pi.id)!.status = status
  quoteRow(id).status = 'accepted'
  quoteRow(id).deposit_payment_intent_id = pi.id
  return pi.id as string
}

describe('QUOTE-06: revise into a new version', () => {
  it('QUOTE-06: version 2 is an unfrozen copy (lines, stops, money), current, the quote is a draft, and the version 1 link resolves to null', async () => {
    const { id, url } = await sentQuote()
    expect((await resolveQuoteToken(tokenOf(url)))?.state).toBe('offer')
    const [v1] = versionsOf(id)

    const res = await revise(id)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const { versionId } = (await res.json()) as { versionId: string }

    const versions = versionsOf(id)
    expect(versions).toHaveLength(2)
    const v2 = versions.find((v) => v.id === versionId)!
    expect(v2.version_no).toBe(2)
    expect(v2.frozen_at).toBeNull()
    expect(v2).toMatchObject({
      total_minor: v1.total_minor,
      deposit_kind: 'percent',
      deposit_value: 30,
      deposit_minor: 14400,
      remainder_method: 'saved_card',
      cancel_free_hours: 336,
      currency: 'eur',
      locale: v1.locale,
    })
    expect(v2.terms_version).toBeNull()
    expect(v2.cancel_policy).toBeNull()

    const oldLines = linesOf(v1.id)
    const newLines = linesOf(versionId)
    expect(newLines).toHaveLength(2)
    expect(newLines.map((l) => l.id)).not.toEqual(oldLines.map((l) => l.id))
    expect(newLines.map((l) => [l.position, l.amount_minor, l.deposit_share_minor, l.remainder_minor, l.pickup_date])).toEqual(
      oldLines.map((l) => [l.position, l.amount_minor, l.deposit_share_minor, l.remainder_minor, l.pickup_date]),
    )
    const stops = db.state.quote_version_line_stops.filter((s) => s.line_id === newLines[0].id)
    expect(stops).toHaveLength(1)
    expect(stops[0]).toMatchObject({ position: 1, address: 'Brno', wait_minutes: 30 })
    expect(db.state.quote_version_line_stops.filter((s) => s.line_id === newLines[1].id)).toHaveLength(0)

    expect(quoteRow(id).current_version_id).toBe(versionId)
    expect(quoteRow(id).status).toBe('draft')
    expect(await resolveQuoteToken(tokenOf(url))).toBeNull()
    expect(db.state.quote_events.some((e) => e.kind === 'revised' && e.event_key === `revised:${versionId}`)).toBe(true)
    // Version 1 is untouched.
    expect(versionsOf(id).find((v) => v.id === v1.id)!.frozen_at).toBeTruthy()
    expect(linesOf(v1.id)).toHaveLength(2)
  })

  it('revising again before sending is 422 not_revisable (the quote is a draft)', async () => {
    const { id } = await sentQuote()
    expect((await revise(id)).status).toBe(200)
    const res = await revise(id)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'not_revisable' })
    expect(versionsOf(id)).toHaveLength(2)
  })

  it('the revised draft can be edited and sent again: the new link works, the old one stays dead', async () => {
    const { id, url } = await sentQuote()
    const { versionId } = (await (await revise(id)).json()) as { versionId: string }
    const patched = await PATCH(req('PATCH', `http://localhost/api/admin/quotes/${id}`, { deposit: { kind: 'percent', value: 40 } }), params(id))
    expect(patched.status).toBe(200)

    const resent = (await (await send(id)).json()) as { status: string; url: string }
    expect(resent.status).toBe('sent')
    expect(versionsOf(id).find((v) => v.id === versionId)!.frozen_at).toBeTruthy()
    expect(versionsOf(id).find((v) => v.id === versionId)!.deposit_minor).toBe(19200)
    const resolved = await resolveQuoteToken(tokenOf(resent.url))
    expect(resolved?.version.id).toBe(versionId)
    expect(await resolveQuoteToken(tokenOf(url))).toBeNull()
  })

  it.each(['draft', 'voided', 'paid'] as const)('a %s quote is not revisable (paid ones are cancelled, not revised)', async (status) => {
    const { id } = await sentQuote()
    quoteRow(id).status = status
    const res = await revise(id)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ reason: 'not_revisable' })
    expect(versionsOf(id)).toHaveLength(1)
  })

  it('an unfrozen version 2 left behind by a crash is reused, not duplicated', async () => {
    const { id } = await sentQuote()
    const [v1] = versionsOf(id)
    const crashed = { ...v1, id: '22222222-2222-4222-8222-222222222222', version_no: 2, frozen_at: null, terms_version: null, cancel_policy: null, cancel_policy_version: null }
    await db.client.from('quote_versions').insert(crashed)

    const res = await revise(id)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { versionId: string }).versionId).toBe(crashed.id)
    expect(versionsOf(id)).toHaveLength(2)
    expect(linesOf(crashed.id)).toHaveLength(2)
    expect(quoteRow(id).current_version_id).toBe(crashed.id)
  })

  it('two concurrent revises: one 200, one 409 busy, exactly one new version', async () => {
    const { id } = await sentQuote()
    const [a, b] = await Promise.all([revise(id), revise(id)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(versionsOf(id)).toHaveLength(2)
    expect(quoteRow(id).current_version_id).toBe(versionsOf(id).find((v) => v.version_no === 2)!.id)
    expect(linesOf(quoteRow(id).current_version_id)).toHaveLength(2)
  })
})

describe('Pitfall 7: no edit while a deposit is in flight', () => {
  it('revise on an accepted quote with a requires_payment_method intent cancels it (deposit_canceled event) and proceeds', async () => {
    const { id, url } = await sentQuote()
    const pi = await depositIntent(id, 'requires_payment_method')

    const res = await revise(id)
    expect(res.status).toBe(200)
    expect(fake.state.paymentIntents.get(pi)!.status).toBe('canceled')
    const cancel = fake.callsTo('paymentIntents.cancel')
    expect(cancel).toHaveLength(1)
    expect(cancel[0].idempotencyKey).toBe(`qdep_void:${pi}`)
    expect(db.state.quote_events.some((e) => e.kind === 'deposit_canceled' && e.event_key === `deposit_canceled:${pi}`)).toBe(true)
    expect(quoteRow(id).status).toBe('draft')
    expect(await resolveQuoteToken(tokenOf(url))).toBeNull()
  })

  it.each(['processing', 'succeeded'])('revise with a %s intent -> 409 deposit_in_flight and nothing changes', async (status) => {
    const { id, url } = await sentQuote()
    const pi = await depositIntent(id, status)

    const res = await revise(id)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'deposit_in_flight' })
    expect(versionsOf(id)).toHaveLength(1)
    expect(quoteRow(id).status).toBe('accepted')
    expect(quoteRow(id).current_version_id).toBe(versionsOf(id)[0].id)
    expect(fake.state.paymentIntents.get(pi)!.status).toBe(status)
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
    expect((await resolveQuoteToken(tokenOf(url)))?.state).toBe('offer')
  })

  it('an intent that became processing between the read and the cancel is still deposit_in_flight', async () => {
    const { id } = await sentQuote()
    const pi = await depositIntent(id, 'requires_payment_method')
    const original = fake.stripe.paymentIntents.cancel
    fake.stripe.paymentIntents.cancel = (async () => {
      fake.state.paymentIntents.get(pi)!.status = 'processing'
      throw new Error('You cannot cancel this PaymentIntent because it has a status of processing.')
    }) as typeof original

    const res = await revise(id)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'deposit_in_flight' })
    expect(versionsOf(id)).toHaveLength(1)
  })

  it('an already cancelled intent does not block the revise and is not cancelled again', async () => {
    const { id } = await sentQuote()
    await depositIntent(id, 'canceled')
    expect((await revise(id)).status).toBe(200)
    expect(fake.callsTo('paymentIntents.cancel')).toHaveLength(0)
  })

  it('void cancels a live deposit intent and voids', async () => {
    const { id } = await sentQuote()
    const pi = await depositIntent(id, 'requires_payment_method')
    expect((await voidQuote(id)).status).toBe(200)
    expect(fake.state.paymentIntents.get(pi)!.status).toBe('canceled')
    expect(quoteRow(id).status).toBe('voided')
    expect(eventKinds(id)).toEqual(expect.arrayContaining(['deposit_canceled', 'voided']))
  })

  it.each(['processing', 'succeeded'])('void with a %s intent -> 409 deposit_in_flight and nothing changes', async (status) => {
    const { id } = await sentQuote()
    await depositIntent(id, status)
    const res = await voidQuote(id)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'deposit_in_flight' })
    expect(quoteRow(id).status).toBe('accepted')
    expect(quoteRow(id).voided_at).toBeNull()
  })
})

describe('QUOTE-06: void', () => {
  it.each(['sent', 'viewed', 'accepted', 'draft'] as const)('a %s quote is voided with voided_at, voided_by and a voided event; its link dies at once', async (status) => {
    const { id, url } = await sentQuote()
    quoteRow(id).status = status
    expect((await resolveQuoteToken(tokenOf(url)))?.state).toBe(status === 'draft' ? undefined : 'offer')

    const res = await voidQuote(id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(quoteRow(id).status).toBe('voided')
    expect(quoteRow(id).voided_by).toBe(ADMIN_ID)
    expect(typeof quoteRow(id).voided_at).toBe('string')
    expect(db.state.quote_events.some((e) => e.kind === 'voided' && e.event_key === `voided:${id}`)).toBe(true)
    expect(await resolveQuoteToken(tokenOf(url))).toBeNull()
  })

  it('a paid quote is 422 already_paid and stays paid', async () => {
    const { id } = await sentQuote()
    quoteRow(id).status = 'paid'
    const res = await voidQuote(id)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'already_paid' })
    expect(quoteRow(id).status).toBe('paid')
    expect(quoteRow(id).voided_at).toBeNull()
  })

  it('voiding twice is idempotent: 200 and one voided event', async () => {
    const { id } = await sentQuote()
    expect((await voidQuote(id)).status).toBe(200)
    expect((await voidQuote(id)).status).toBe(200)
    expect(eventKinds(id).filter((k) => k === 'voided')).toHaveLength(1)
  })

  it('a voided quote cannot be revised, sent or given a link', async () => {
    const { id } = await sentQuote()
    await voidQuote(id)
    expect((await revise(id)).status).toBe(422)
    expect((await send(id, { resend: true })).status).toBe(422)
    expect((await link(id)).status).toBe(422)
  })

  it('an unknown quote is 404 for revise and void', async () => {
    const unknown = '11111111-1111-4111-8111-111111111111'
    expect((await revise(unknown)).status).toBe(404)
    expect((await voidQuote(unknown)).status).toBe(404)
  })
})

describe('admin guards (revise and void)', () => {
  const ID = '11111111-1111-4111-8111-111111111111'
  const calls = [
    ['revise', (body?: unknown, id = ID) => revise(id, body)],
    ['void', (body?: unknown, id = ID) => voidQuote(id, body)],
  ] as const

  it.each(calls)('%s: 401 / 403 before anything is read', async (_name, call) => {
    world.auth = '401'
    expect((await call()).status).toBe(401)
    world.auth = '403'
    expect((await call()).status).toBe(403)
  })

  it.each(calls)('%s: invalid uuid 400, unknown body key 400, malformed JSON 400, body over 1000 bytes 413', async (_name, call) => {
    expect((await call(undefined, 'nope')).status).toBe(400)
    expect((await call({ surprise: 1 })).status).toBe(400)
    expect((await call('{oops')).status).toBe(400)
    expect((await call({ pad: 'x'.repeat(1500) })).status).toBe(413)
  })

  it.each(calls)('%s: an empty body is accepted as no input', async (_name, call) => {
    expect((await call()).status).toBe(404)
  })

  it('a Stripe failure is a 500 that logs ids only, and the quote is unchanged', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { id } = await sentQuote()
    await depositIntent(id, 'requires_payment_method')
    fake.failNextWithError('paymentIntents.retrieve', new Error('stripe down') as never)
    const res = await voidQuote(id)
    expect(res.status).toBe(500)
    expect(quoteRow(id).status).toBe('accepted')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('ivan@example.com')
  })
})
