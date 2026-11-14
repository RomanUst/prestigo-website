// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

/**
 * Phase 92 plan 92-08 (QUOTE-01, QUOTE-06; D-04, D-09): the operator's data path for a quote. The routes and the store
 * run for real against the in-memory database; Google Routes and the tariffs are mocked, the admin session is a switch.
 */

const { world, computeRouteDistanceMock, tariffs } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    auth: 'admin' as 'admin' | '401' | '403',
    failNextStopInsert: false,
  },
  computeRouteDistanceMock: vi.fn(),
  tariffs: { fail: false, waitingRate: { business: 12 } as Record<string, number> },
}))

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'

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
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: computeRouteDistanceMock }))
vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: async () => {
    if (tariffs.fail) throw new Error('tariffs down')
    return {
      ratePerKm: { business: 2, first_class: 3, business_van: 2.5 },
      hourlyRate: { business: 50, first_class: 70, business_van: 60 },
      dailyRate: { business: 200, first_class: 280, business_van: 240 },
      minFare: { business: 10, first_class: 10, business_van: 10 },
      waitingRate: tariffs.waitingRate,
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
    }
  },
}))

import { GET as LIST, POST as CREATE } from '@/app/api/admin/quotes/route'
import { GET as DETAIL, PATCH } from '@/app/api/admin/quotes/[id]/route'
import type { QuoteDetail } from '@/lib/quotes/store'

let db: FakePaymentsDb

function seed(bookings: Array<Record<string, unknown>> = []) {
  db = createFakePaymentsDb({ bookings })
  // The same database, except that one insert into the stops table can be made to fail (rollback test).
  world.db = {
    client: {
      rpc: (name, args) => db.client.rpc(name, args),
      from: (table) => {
        const query = db.client.from(table) as unknown as Record<string, unknown>
        if (table !== 'quote_version_line_stops') return query
        return new Proxy(query, {
          get(target, prop) {
            if (prop === 'insert' && world.failNextStopInsert) {
              world.failNextStopInsert = false
              return () => Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom with ivan@example.com' } })
            }
            const value = target[prop as string]
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
      },
    },
  }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function req(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const create = (body: unknown) => CREATE(req('POST', 'http://localhost/api/admin/quotes', body))
const patch = (id: string, body: unknown) => PATCH(req('PATCH', `http://localhost/api/admin/quotes/${id}`, body), params(id))
const detail = (id: string) => DETAIL(req('GET', `http://localhost/api/admin/quotes/${id}`), params(id))
const list = (query = '') => LIST(req('GET', `http://localhost/api/admin/quotes${query}`))

const CLIENT = { first_name: 'Ivan', last_name: 'Petrov', email: 'ivan@example.com', phone: '+420123456789' }
const PRAGUE = { address: 'Wenceslas Square, Prague', lat: 50.0813, lng: 14.4284 }
const VIENNA = { address: 'Stephansplatz, Vienna', lat: 48.2085, lng: 16.3721 }
const BRNO = { address: 'Brno', lat: 49.1951, lng: 16.6068 }

function lineBody(over: Record<string, unknown> = {}) {
  return {
    trip_type: 'transfer',
    pickup_date: '2027-05-10',
    pickup_time: '12:00',
    origin: PRAGUE,
    destination: VIENNA,
    stops: [{ ...BRNO, wait_minutes: 45 }],
    vehicle_class: 'business',
    passengers: 2,
    luggage: 1,
    amount_minor: 30000,
    ...over,
  }
}

async function createQuote(over: Record<string, unknown> = {}): Promise<string> {
  const res = await create({ client: CLIENT, lead_channel: 'whatsapp', currency: 'eur', ...over })
  expect(res.status).toBe(201)
  return ((await res.json()) as { id: string }).id
}

const quoteRow = (id: string) => db.state.quotes.find((q) => q.id === id)!
const versionsOf = (id: string) => db.state.quote_versions.filter((v) => v.quote_id === id)
const linesOf = (versionId: unknown) => db.state.quote_version_lines.filter((l) => l.version_id === versionId)
const stopsOf = (lineId: unknown) => db.state.quote_version_line_stops.filter((s) => s.line_id === lineId)

beforeEach(() => {
  vi.clearAllMocks()
  world.auth = 'admin'
  world.failNextStopInsert = false
  tariffs.fail = false
  tariffs.waitingRate = { business: 12 }
  computeRouteDistanceMock.mockResolvedValue({ ok: true, distanceKm: 130, durationMin: 90 })
  seed()
})

describe('tracer: create a draft, save one line, read it back with the server distance and suggestion', () => {
  it('POST creates a draft quote with a Q- reference, an unfrozen version 1, locale en and a created event', async () => {
    const res = await create({ client: CLIENT, lead_channel: 'whatsapp', currency: 'eur' })
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: string }

    const quote = quoteRow(id)
    expect(quote.reference).toMatch(/^Q-\d{8}-[A-Z0-9]{6}$/)
    expect(quote.status).toBe('draft')
    expect(quote.client_email).toBe('ivan@example.com')
    expect(quote.lead_channel).toBe('whatsapp')
    expect(quote.created_by).toBe(ADMIN_ID)

    const versions = versionsOf(id)
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ version_no: 1, frozen_at: null, locale: 'en', currency: 'eur', total_minor: 0 })
    expect(quote.current_version_id).toBe(versions[0].id)

    expect(db.state.quote_events.filter((e) => e.quote_id === id).map((e) => e.kind)).toEqual(['created'])
  })

  it('D-09: the quote language is the one of the client latest booking for that email, else en', async () => {
    seed([
      { client_email: 'Ivan@Example.com', locale: 'fr', created_at: '2026-01-01T10:00:00Z' },
      { client_email: 'ivan@example.com', locale: 'ru', created_at: '2026-06-01T10:00:00Z' },
      { client_email: 'other@example.com', locale: 'es', created_at: '2026-09-01T10:00:00Z' },
    ])
    const id = await createQuote()
    expect(versionsOf(id)[0].locale).toBe('ru')

    const other = await createQuote({ client: { ...CLIENT, email: 'nobody@example.com' } })
    expect(versionsOf(other)[0].locale).toBe('en')
  })

  it('D-09: a stored booking language the site does not have falls back to en', async () => {
    seed([{ client_email: 'ivan@example.com', locale: 'de', created_at: '2026-06-01T10:00:00Z' }])
    const id = await createQuote()
    expect(versionsOf(id)[0].locale).toBe('en')
  })

  it('D-04: PATCH stores the server distance, the live-tariff suggestion and the operator amount; the stop keeps its blocks and fee snapshot', async () => {
    const id = await createQuote()
    const res = await patch(id, { lines: [lineBody({ amount_minor: 30000 })] })
    expect(res.status).toBe(200)

    // The distance came from computeRouteDistance through the stop, in order.
    expect(computeRouteDistanceMock).toHaveBeenCalledTimes(1)
    expect(computeRouteDistanceMock).toHaveBeenCalledWith({
      origin: { lat: PRAGUE.lat, lng: PRAGUE.lng },
      destination: { lat: VIENNA.lat, lng: VIENNA.lng },
      intermediates: [{ lat: BRNO.lat, lng: BRNO.lng }],
    })

    const version = versionsOf(id)[0]
    const lines = linesOf(version.id)
    expect(lines).toHaveLength(1)
    // 130 km x 2 EUR + 2 paid waiting blocks x 12 EUR = 284 EUR suggested; the operator typed 300 EUR.
    expect(lines[0]).toMatchObject({
      position: 1,
      distance_km: 130,
      suggested_amount_minor: 28400,
      amount_minor: 30000,
      price_overridden: true,
      amount_eur: 300,
      amount_czk: 7500,
      deposit_share_minor: null,
      remainder_minor: null,
    })
    expect(stopsOf(lines[0].id)).toHaveLength(1)
    expect(stopsOf(lines[0].id)[0]).toMatchObject({
      position: 1,
      wait_minutes: 45,
      free_minutes: 15,
      blocks: 2,
      fee_per_block_eur: 12,
      fee_eur: 24,
    })
    expect(versionsOf(id)[0].total_minor).toBe(30000)
  })

  it('an operator amount equal to the suggestion is not an override', async () => {
    const id = await createQuote()
    expect((await patch(id, { lines: [lineBody({ amount_minor: 28400 })] })).status).toBe(200)
    expect(linesOf(versionsOf(id)[0].id)[0]).toMatchObject({ suggested_amount_minor: 28400, price_overridden: false })
  })

  it('a body that carries distance_km (or a suggestion) is refused by the strict schema', async () => {
    const id = await createQuote()
    expect((await patch(id, { lines: [{ ...lineBody(), distance_km: 1 }] })).status).toBe(400)
    expect((await patch(id, { lines: [{ ...lineBody(), suggested_amount_minor: 1 }] })).status).toBe(400)
    expect(linesOf(versionsOf(id)[0].id)).toHaveLength(0)
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
  })

  it('GET returns the detail with the line, its stop, the server distance, the suggestion and the operator amount', async () => {
    const id = await createQuote()
    await patch(id, { lines: [lineBody({ amount_minor: 30000 })] })

    const res = await detail(id)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as QuoteDetail
    expect(body.quote.id).toBe(id)
    expect(body.quote.reference).toMatch(/^Q-/)
    expect(body.version).toMatchObject({ version_no: 1, frozen_at: null, total_minor: 30000 })
    expect(body.lines).toHaveLength(1)
    expect(body.lines[0]).toMatchObject({ distance_km: 130, suggested_amount_minor: 28400, amount_minor: 30000, price_overridden: true })
    expect(body.lines[0].stops).toHaveLength(1)
    expect(body.lines[0].stops[0]).toMatchObject({ position: 1, wait_minutes: 45, blocks: 2 })
    expect(body.effective_status).toBe('draft')
    expect(body.versions).toHaveLength(1)
    expect(body.events.map((e) => e.kind)).toContain('created')
    expect(body.bookings).toEqual([])
    expect(body.links_count).toBe(0)
  })

  it('GET of an unknown quote is 404', async () => {
    expect((await detail('11111111-1111-4111-8111-111111111111')).status).toBe(404)
  })
})

// == Task 2: validation, frozen versions, 503 on a route failure, the list ==========================================

describe('guards run in order: body cap, admin session, id, JSON, strict schema', () => {
  it('401 and 403 come before the body is read, on every handler', async () => {
    const id = await createQuote()
    for (const auth of ['401', '403'] as const) {
      world.auth = auth
      const want = auth === '401' ? 401 : 403
      // A body that is not even JSON: if the route read it first the answer would be 400.
      expect((await create('not json')).status).toBe(want)
      expect((await patch(id, 'not json')).status).toBe(want)
      expect((await detail(id)).status).toBe(want)
      expect((await list()).status).toBe(want)
    }
  })

  it('a body over the cap is 413 (create and patch)', async () => {
    const id = await createQuote()
    const padded = { client: { ...CLIENT, last_name: 'x'.repeat(21_000) }, lead_channel: 'email', currency: 'eur' }
    expect((await create(padded)).status).toBe(413)
    expect((await patch(id, { lines: [lineBody({ special_requests: 'x'.repeat(21_000) })] })).status).toBe(413)
  })

  it('an id that is not a uuid is 400 (patch and get)', async () => {
    expect((await patch('not-a-uuid', { lines: [] })).status).toBe(400)
    expect((await detail('not-a-uuid')).status).toBe(400)
  })

  it('malformed JSON is 400, an unknown key is 400 (create and patch)', async () => {
    const id = await createQuote()
    expect((await create('{"client":')).status).toBe(400)
    expect((await patch(id, '{"lines":')).status).toBe(400)
    expect((await patch(id, { surprise: 1 })).status).toBe(400)
    expect((await create({ client: CLIENT, lead_channel: 'email', currency: 'eur', locale: 'ru' })).status).toBe(400)
    expect((await create({ client: { ...CLIENT, email: 'a@b.com\r\nBcc: x@y.com' }, lead_channel: 'email', currency: 'eur' })).status).toBe(400)
    expect((await create({ client: { ...CLIENT, first_name: 'Iv\nan' }, lead_channel: 'email', currency: 'eur' })).status).toBe(400)
    expect((await create({ client: CLIENT, lead_channel: 'carrier-pigeon', currency: 'eur' })).status).toBe(400)
    expect((await create({ client: CLIENT, lead_channel: 'email', currency: 'usd' })).status).toBe(400)
  })

  it('21 lines, 6 stops, a 20-minute wait and a landing with only a date are 400', async () => {
    const id = await createQuote()
    expect((await patch(id, { lines: Array.from({ length: 21 }, () => lineBody()) })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ stops: Array.from({ length: 6 }, () => ({ ...BRNO, wait_minutes: 0 })) })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ stops: [{ ...BRNO, wait_minutes: 20 }] })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ stops: [{ ...BRNO, wait_minutes: 135 }] })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ landing: { date: '2027-05-10' } })] })).status).toBe(400)
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
  })

  it('the fields of a line must fit its trip type: no destination, hours on a transfer, stops on an hourly trip are 400', async () => {
    const id = await createQuote()
    expect((await patch(id, { lines: [lineBody({ destination: null })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ hours: 3 })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ trip_type: 'hourly', destination: null, hours: null, stops: [] })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ trip_type: 'hourly', destination: null, hours: 3 })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ trip_type: 'daily', destination: null, stops: [], return_date: '2027-05-10' })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ pickup_date: '2027-02-31' })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ amount_minor: 0 })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ amount_minor: 10.5 })] })).status).toBe(400)
    expect((await patch(id, { lines: [lineBody({ origin: { ...PRAGUE, address: 'A\nB' } })] })).status).toBe(400)
  })

  it('a landing must give the pickup: landing + offset in Prague time', async () => {
    const id = await createQuote()
    const landing = { date: '2027-05-10', time: '11:30', offset_min: 30 }
    expect((await patch(id, { lines: [lineBody({ landing, stops: [] })] })).status).toBe(200) // 11:30 + 30 = 12:00
    expect((await patch(id, { lines: [lineBody({ landing: { ...landing, offset_min: 45 }, stops: [] })] })).status).toBe(400)
    const line = linesOf(versionsOf(id)[0].id)[0]
    expect(line).toMatchObject({ landing_date: '2027-05-10', landing_time: '11:30', pickup_offset_min: 30 })
  })

  it('an unknown quote is 404', async () => {
    expect((await patch('11111111-1111-4111-8111-111111111111', { lines: [lineBody()] })).status).toBe(404)
  })
})

describe('QUOTE-06: only a draft version is editable', () => {
  it('a frozen current version answers 409 version_frozen and nothing changes', async () => {
    const id = await createQuote()
    await patch(id, { lines: [lineBody()] })
    versionsOf(id)[0].frozen_at = new Date().toISOString()

    const res = await patch(id, { lines: [lineBody({ amount_minor: 99999 })] })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'version_frozen' })
    expect(linesOf(versionsOf(id)[0].id)[0].amount_minor).toBe(30000)
  })

  it('a voided, paid or cancelled quote is 422 action_not_allowed', async () => {
    for (const [patchRow, reason] of [
      [{ status: 'voided' }, 'quote_voided'],
      [{ status: 'paid' }, 'quote_paid'],
      [{ cancelled_at: new Date().toISOString() }, 'quote_cancelled'],
    ] as const) {
      const id = await createQuote()
      Object.assign(quoteRow(id), patchRow)
      const res = await patch(id, { lines: [lineBody()] })
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({ error: 'action_not_allowed', reason })
    }
  })
})

describe('the money rules (D-07) and the expiry (D-02)', () => {
  it('a deposit above the total or a zero deposit is 422 with its reason', async () => {
    const id = await createQuote()
    const bodyWith = (deposit: unknown) => ({ lines: [lineBody({ amount_minor: 30000 })], deposit })

    let res = await patch(id, bodyWith({ kind: 'fixed', value: 30001 }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'deposit_above_total' })

    res = await patch(id, bodyWith({ kind: 'percent', value: 101 }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'deposit_above_total' })

    res = await patch(id, bodyWith({ kind: 'fixed', value: 0 }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'deposit_zero' })

    res = await patch(id, bodyWith({ kind: 'percent', value: 0 }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'deposit_zero' })

    // Nothing was written by the refused saves.
    expect(linesOf(versionsOf(id)[0].id)).toHaveLength(0)
    expect(versionsOf(id)[0].deposit_kind).toBeNull()
  })

  it('an empty line list is 422, a free-cancellation window of 721 hours or a fee of 0 percent is 400, 720 and 100 are fine', async () => {
    const id = await createQuote()
    let res = await patch(id, { lines: [] })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'invalid_lines', reason: 'no_lines' })

    expect((await patch(id, { cancel_free_hours: 721 })).status).toBe(400)
    expect((await patch(id, { cancel_free_hours: -1 })).status).toBe(400)
    expect((await patch(id, { cancel_fee_percent: 0 })).status).toBe(400)
    expect((await patch(id, { cancel_fee_percent: 101 })).status).toBe(400)
    res = await patch(id, { cancel_free_hours: 720, cancel_fee_percent: 100 })
    expect(res.status).toBe(200)
    expect(versionsOf(id)[0]).toMatchObject({ cancel_free_hours: 720, cancel_fee_percent: 100 })
  })

  it('the deposit is spread over the lines with largest-remainder shares', async () => {
    const id = await createQuote()
    const res = await patch(id, {
      deposit: { kind: 'fixed', value: 10000 },
      remainder_method: 'saved_card',
      lines: [
        lineBody({ amount_minor: 10000, stops: [] }),
        lineBody({ amount_minor: 20000, stops: [], pickup_date: '2027-05-11' }),
      ],
    })
    expect(res.status).toBe(200)
    const version = versionsOf(id)[0]
    expect(version).toMatchObject({
      total_minor: 30000,
      deposit_kind: 'fixed',
      deposit_value: 10000,
      deposit_minor: 10000,
      remainder_method: 'saved_card',
    })
    const lines = linesOf(version.id)
    expect(lines.map((l) => l.deposit_share_minor)).toEqual([3333, 6667])
    expect(lines.map((l) => l.remainder_minor)).toEqual([6667, 13333])
  })

  it('changing only the deposit re-spreads the shares of the stored lines without any routing call', async () => {
    const id = await createQuote()
    await patch(id, { lines: [lineBody({ amount_minor: 30000 })], deposit: { kind: 'percent', value: 30 } })
    expect(versionsOf(id)[0].deposit_minor).toBe(9000)
    computeRouteDistanceMock.mockClear()

    expect((await patch(id, { deposit: { kind: 'percent', value: 50 } })).status).toBe(200)
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
    expect(versionsOf(id)[0].deposit_minor).toBe(15000)
    expect(linesOf(versionsOf(id)[0].id)[0]).toMatchObject({ deposit_share_minor: 15000, remainder_minor: 15000 })

    expect((await patch(id, { deposit: null })).status).toBe(200)
    expect(versionsOf(id)[0]).toMatchObject({ deposit_kind: null, deposit_value: null, deposit_minor: null })
    expect(linesOf(versionsOf(id)[0].id)[0]).toMatchObject({ deposit_share_minor: null, remainder_minor: null })
  })

  it('expires_at is the end of that day in Prague time (winter and summer) and a past day is 422', async () => {
    const id = await createQuote()
    expect((await patch(id, { expires_at: '2027-01-15' })).status).toBe(200)
    expect(quoteRow(id).expires_at).toBe('2027-01-15T22:59:59.000Z')
    expect((await patch(id, { expires_at: '2027-07-15' })).status).toBe(200)
    expect(quoteRow(id).expires_at).toBe('2027-07-15T21:59:59.000Z')

    const res = await patch(id, { expires_at: '2020-01-01' })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'expiry_in_past' })
    expect(quoteRow(id).expires_at).toBe('2027-07-15T21:59:59.000Z')

    expect((await patch(id, { expires_at: null })).status).toBe(200)
    expect(quoteRow(id).expires_at).toBeNull()
  })

  it('the header fields (client, channel, language, currency, billing) are saved on the draft', async () => {
    const id = await createQuote()
    const res = await patch(id, {
      client: { first_name: 'Anna', last_name: 'Novak', email: 'anna@example.com', phone: null },
      lead_channel: 'partner',
      locale: 'zh-hant',
      billing: { name: 'ACME s.r.o.', address: 'Prague', company_id: '12345678', vat_id: 'CZ12345678', note: '' },
    })
    expect(res.status).toBe(200)
    expect(quoteRow(id)).toMatchObject({ client_first_name: 'Anna', client_email: 'anna@example.com', client_phone: null, lead_channel: 'partner' })
    expect(versionsOf(id)[0]).toMatchObject({ locale: 'zh-hant', billing_name: 'ACME s.r.o.', billing_vat_id: 'CZ12345678', billing_note: null })
    expect((await patch(id, { locale: 'de' })).status).toBe(400)
  })

  it('changing the currency without sending the lines is refused (the amounts would stay in the old currency)', async () => {
    const id = await createQuote()
    await patch(id, { lines: [lineBody()] })
    const res = await patch(id, { currency: 'czk' })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'invalid_lines', reason: 'currency_needs_lines' })
    expect((await patch(id, { currency: 'czk', lines: [lineBody({ amount_minor: 750000 })] })).status).toBe(200)
    // 284 EUR x 25 = 7100 CZK suggested, converted once.
    expect(linesOf(versionsOf(id)[0].id)[0]).toMatchObject({ suggested_amount_minor: 710000, amount_minor: 750000, amount_czk: 7500 })
  })
})

describe('Phase 91 rule: the server prices, and a route that fails saves nothing', () => {
  it('a changed transfer whose route cannot be computed is 503 pricing_unavailable and the stored lines are unchanged', async () => {
    const id = await createQuote()
    await patch(id, { lines: [lineBody()] })
    const before = JSON.stringify([linesOf(versionsOf(id)[0].id), stopsOf(linesOf(versionsOf(id)[0].id)[0].id), versionsOf(id)[0]])

    computeRouteDistanceMock.mockResolvedValue({ ok: false, reason: 'timeout' })
    const res = await patch(id, { lines: [lineBody({ pickup_date: '2027-06-01', vehicle_class: 'business_van' })] })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'pricing_unavailable' })
    expect(JSON.stringify([linesOf(versionsOf(id)[0].id), stopsOf(linesOf(versionsOf(id)[0].id)[0].id), versionsOf(id)[0]])).toBe(before)
  })

  it('a tariff that cannot be loaded is 503 as well', async () => {
    const id = await createQuote()
    tariffs.fail = true
    const res = await patch(id, { lines: [lineBody()] })
    expect(res.status).toBe(503)
    expect(linesOf(versionsOf(id)[0].id)).toHaveLength(0)
  })

  it('an unchanged line keeps its stored distance and suggestion: re-saving costs no routing call; a changed one is priced again', async () => {
    const id = await createQuote()
    await patch(id, { lines: [lineBody()] })
    expect(computeRouteDistanceMock).toHaveBeenCalledTimes(1)

    // Only the operator's amount and a free-text field change.
    computeRouteDistanceMock.mockClear()
    computeRouteDistanceMock.mockResolvedValue({ ok: true, distanceKm: 999, durationMin: 1 })
    expect((await patch(id, { lines: [lineBody({ amount_minor: 31000, special_requests: 'baby seat' })] })).status).toBe(200)
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
    let line = linesOf(versionsOf(id)[0].id)[0]
    expect(line).toMatchObject({ distance_km: 130, suggested_amount_minor: 28400, amount_minor: 31000, price_overridden: true })
    expect(stopsOf(line.id)[0]).toMatchObject({ blocks: 2, fee_eur: 24 })

    // A stop that waits longer changes the price inputs.
    expect((await patch(id, { lines: [lineBody({ stops: [{ ...BRNO, wait_minutes: 75 }] })] })).status).toBe(200)
    expect(computeRouteDistanceMock).toHaveBeenCalledTimes(1)
    line = linesOf(versionsOf(id)[0].id)[0]
    // 999 km x 2 + 4 blocks x 12.
    expect(line).toMatchObject({ distance_km: 999, suggested_amount_minor: (999 * 2 + 48) * 100 })
  })

  it('a class without a waiting rate: the suggestion has no paid waiting and the save still works (the operator decides)', async () => {
    tariffs.waitingRate = {}
    const id = await createQuote()
    expect((await patch(id, { lines: [lineBody({ amount_minor: 28000 })] })).status).toBe(200)
    const line = linesOf(versionsOf(id)[0].id)[0]
    expect(line).toMatchObject({ suggested_amount_minor: 26000, price_overridden: true })
    expect(stopsOf(line.id)[0]).toMatchObject({ blocks: 2, fee_eur: 0, fee_per_block_eur: null })
  })

  it('a failed write puts the draft back as it was and logs no personal data', async () => {
    const id = await createQuote()
    await patch(id, { lines: [lineBody()] })
    const snapshot = () => JSON.stringify([linesOf(versionsOf(id)[0].id), stopsOf(linesOf(versionsOf(id)[0].id)[0].id), versionsOf(id)[0], quoteRow(id)])
    const before = snapshot()

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    world.failNextStopInsert = true
    const res = await patch(id, { lines: [lineBody({ amount_minor: 41000, stops: [{ ...BRNO, wait_minutes: 60 }] })] })
    expect(res.status).toBe(500)
    expect(snapshot()).toBe(before)

    const text = JSON.stringify(logged.mock.calls)
    expect(text).toContain(id)
    expect(text).not.toContain('ivan@example.com')
    expect(text).not.toContain('Brno')
    expect(text).not.toContain('boom')
    logged.mockRestore()
  })
})

describe('GET /api/admin/quotes: the list with the effective status (D-02)', () => {
  async function seedList() {
    const a = await createQuote({ client: { ...CLIENT, email: 'ivan@example.com' } })
    const b = await createQuote({ client: { ...CLIENT, first_name: 'Anna', email: 'anna@example.com' } })
    const c = await createQuote({ client: { ...CLIENT, first_name: 'Olga', email: 'olga@example.com' } })
    const d = await createQuote({ client: { ...CLIENT, first_name: 'Petr', email: 'petr@example.com' } })
    await patch(a, { lines: [lineBody({ amount_minor: 30000, pickup_date: '2027-05-12' }), lineBody({ amount_minor: 10000, stops: [], pickup_date: '2027-05-10' })] })
    // a: sent with an expiry in the past -> expired; b: sent, no expiry -> sent; c: cancelled; d: stays draft.
    Object.assign(quoteRow(a), { status: 'sent', expires_at: '2020-01-01T00:00:00Z' })
    Object.assign(quoteRow(b), { status: 'sent' })
    Object.assign(quoteRow(c), { status: 'accepted', cancelled_at: '2026-11-01T00:00:00Z' })
    return { a, b, c, d }
  }

  const rows = async (query: string) => ((await (await list(query)).json()) as { quotes: Array<{ id: string; effective_status: string }> }).quotes

  it('shows expired (derived) and cancelled next to the stored statuses, and filters on them', async () => {
    const { a, b, c, d } = await seedList()
    const all = await rows('')
    const byId = Object.fromEntries(all.map((q) => [q.id, q.effective_status]))
    expect(byId).toEqual({ [a]: 'expired', [b]: 'sent', [c]: 'cancelled', [d]: 'draft' })

    expect((await rows('?status=sent')).map((q) => q.id)).toEqual([b])
    expect((await rows('?status=expired')).map((q) => q.id)).toEqual([a])
    expect((await rows('?status=cancelled')).map((q) => q.id)).toEqual([c])
    expect((await rows('?status=draft')).map((q) => q.id)).toEqual([d])
    // An unknown status is "no filter", never forwarded.
    expect(await rows('?status=nonsense')).toHaveLength(4)
  })

  it('a row carries the client, the current version total, currency, version number and the earliest pickup date', async () => {
    const { a } = await seedList()
    const res = await list('?search=ivan@')
    const body = (await res.json()) as { quotes: Array<Record<string, unknown>>; total: number; page: number; limit: number }
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toMatchObject({ total: 1, page: 1, limit: 25 })
    expect(body.quotes[0]).toMatchObject({
      id: a,
      client_name: 'Ivan Petrov',
      client_email: 'ivan@example.com',
      effective_status: 'expired',
      first_pickup_date: '2027-05-10',
      total_minor: 40000,
      currency: 'eur',
      version_no: 1,
    })
    expect(body.quotes[0].reference).toMatch(/^Q-/)
  })

  it('page and limit are clamped to 1..100 and the list pages', async () => {
    await seedList()
    const big = (await (await list('?limit=1000')).json()) as { limit: number }
    expect(big.limit).toBe(100)
    const zero = (await (await list('?limit=0&page=0')).json()) as { limit: number; page: number }
    expect(zero).toMatchObject({ limit: 1, page: 1 })

    const second = (await (await list('?limit=3&page=2')).json()) as { quotes: unknown[]; total: number }
    expect(second.total).toBe(4)
    expect(second.quotes).toHaveLength(1)
  })

  it('searches the email (contains) or the reference (prefix), case-insensitively', async () => {
    const { b } = await seedList()
    expect((await rows('?search=ANNA@')).map((q) => q.id)).toEqual([b])
    expect(await rows('?search=example.com')).toHaveLength(4)
    const reference = quoteRow(b).reference as string
    expect((await rows(`?search=${encodeURIComponent(reference.toLowerCase())}`)).map((q) => q.id)).toEqual([b])
    expect(await rows('?search=Q-0000')).toHaveLength(0)
  })

  it('T-92-27: % and _ in a search are literal characters and never widen the match', async () => {
    await seedList()
    expect(await rows('?search=%25')).toHaveLength(0)
    expect(await rows('?search=%25%25%25')).toHaveLength(0)
    expect(await rows('?search=i_an')).toHaveLength(0) // would match "ivan" if _ were a wildcard
    expect(await rows('?search=ivan%25')).toHaveLength(0)
    expect(await rows('?search=Q-%25')).toHaveLength(0)
    expect(await rows('?search=a%5C')).toHaveLength(0)
    // a search longer than 100 characters is cut, not an error
    expect((await list(`?search=${'a'.repeat(300)}`)).status).toBe(200)
  })
})
