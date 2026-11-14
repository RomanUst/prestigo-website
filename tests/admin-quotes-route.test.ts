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
  world.db = db
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
