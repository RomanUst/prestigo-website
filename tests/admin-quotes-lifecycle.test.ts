// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
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

let db: FakePaymentsDb

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function req(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const send = (id: string, body?: unknown) => SEND(req('POST', `http://localhost/api/admin/quotes/${id}/send`, body), params(id))
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
  db = createFakePaymentsDb()
  world.db = { client: { from: (t) => db.client.from(t), rpc: (n, a) => db.client.rpc(n, a) } }
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
