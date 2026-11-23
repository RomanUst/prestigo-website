// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles are intentionally loose */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { makeWorld, type World } from './helpers/chat-world'

/**
 * Phase 93 plan 93-35 (TRIP-06, TRIP-07; D-17, D-18, D-19): the custom-tour request proven end to end.
 *
 * POST /api/custom-tour -> stored custom_tour inquiry -> outbox keys (CRM lead + Chatwoot alert) -> the CRM Lead draft
 * (source 'Custom tour') -> the Chatwoot private note with the admin link -> POST /api/admin/quotes with
 * source_inquiry_id -> the operator's list shows the request as quoted.
 *
 * The routes, stores, lead mapping and alert handler run for real. Doubles: the inquiry store (one row array), the outbox
 * enqueue/dispatch recorders, the in-memory Chatwoot (helpers/chat-world), the payments/quotes database, the admin session.
 */

const { world, spies, computeRouteDistanceMock } = vi.hoisted(() => ({
  world: {
    inquiries: [] as Array<Record<string, any>>,
    getQuotes: (() => []) as () => Array<Record<string, any>>,
    quotesDb: null as null | { client: { from: (t: string) => any } },
  },
  spies: {
    enqueue: vi.fn(),
    dispatchAfter: vi.fn(),
  },
  computeRouteDistanceMock: vi.fn(),
}))

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'
const INQUIRY_ID = '3b0f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, limit: 5 }),
  getClientIp: () => '127.0.0.1',
}))

vi.mock('@/lib/email', () => ({
  sendCustomTourOperatorAlert: vi.fn().mockResolvedValue(undefined),
  sendCustomTourClientAck: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/inquiries', () => ({
  storeInquiry: vi.fn(async (kind: string, input: Record<string, any>) => {
    world.inquiries.push({
      id: INQUIRY_ID,
      kind,
      email: input.email,
      name: input.name ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      payload: input.payload,
      created_at: '2026-11-23T10:00:00.000000+00:00',
    })
    return INQUIRY_ID
  }),
}))

vi.mock('@/lib/outbox', async () => {
  const actual = await vi.importActual<typeof import('@/lib/outbox')>('@/lib/outbox')
  return { ...actual, enqueueOutboxEvent: spies.enqueue, dispatchAfterResponse: spies.dispatchAfter }
})

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => ({ user: { id: ADMIN_ID }, error: null })),
}))
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: computeRouteDistanceMock }))

// One Supabase double for both stores: inquiries from the single row array; quotes writes go to the payments database, quotes
// reads (the list's link lookup) are served from that database's quotes state.
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      if (table === 'inquiries') return new FakeQuery(() => world.inquiries)
      if (table === 'quotes') {
        const real = world.quotesDb!.client.from('quotes')
        return {
          insert: (p: unknown) => real.insert(p),
          update: (p: unknown) => real.update(p),
          delete: () => real.delete(),
          select: (cols?: string) => new FakeQuery(() => world.getQuotes()).select(cols),
        }
      }
      return world.quotesDb!.client.from(table)
    },
    rpc: (name: string, args?: Record<string, unknown>) => (world.quotesDb!.client as any).rpc(name, args),
  }),
}))

type Row = Record<string, any>

class FakeQuery implements PromiseLike<{ data: Row[] | Row | null; error: null }> {
  private filters: Array<(r: Row) => boolean> = []
  private orders: Array<{ col: string; asc: boolean }> = []
  private max: number | null = null
  private one = false
  constructor(private readonly source: () => Row[]) {}
  select(_cols?: string) {
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val)
    return this
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]))
    return this
  }
  not(col: string, op: string, val: unknown) {
    if (op === 'is') this.filters.push((r) => (val === null ? r[col] != null : r[col] !== val))
    else if (op === 'in') {
      const list = String(val).replace(/^\(|\)$/g, '').split(',')
      this.filters.push((r) => !list.includes(String(r[col])))
    } else throw new Error(`fake: not(${op})`)
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false })
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  maybeSingle() {
    this.one = true
    return this
  }
  then<T1, T2>(
    onfulfilled?: ((v: { data: Row[] | Row | null; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
  private run() {
    let rows = this.source().filter((r) => this.filters.every((f) => f(r)))
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = String(a[o.col])
        const y = String(b[o.col])
        return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1)
      })
    }
    if (this.max !== null) rows = rows.slice(0, this.max)
    return this.one ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
  }
}

import { POST as REQUEST } from '@/app/api/custom-tour/route'
import { POST as CREATE_QUOTE } from '@/app/api/admin/quotes/route'
import { getPragueTodayISO, shiftIsoDate } from '@/lib/prague-date'
import { customTourAlertKey } from '@/lib/outbox'
import { buildLeadFromInquiry, type InquiryRow } from '@/lib/lead-mapping'
import { buildCustomTourNote } from '@/lib/custom-tour-alert'
import { listCustomTourRequests } from '@/lib/custom-tours/admin-store'
import { sendCustomTourOperatorAlert, sendCustomTourClientAck } from '@/lib/email'
import { storeInquiry } from '@/lib/inquiries'

let db: FakePaymentsDb

function worldWithMessageRoute(): World {
  let nextId = 900
  return makeWorld({
    cw: {
      conversations: [{ id: 42, inbox_id: 1, contact_id: null }],
      intercept: (req, state) => {
        const m = /^\/conversations\/(\d+)\/messages$/.exec(req.path)
        if (req.method !== 'POST' || !m) return undefined
        const conv = state.conversations.find((c) => c.id === Number(m[1]))
        if (!conv) return new Response('{}', { status: 404 })
        const id = nextId++
        conv.messages.push({
          id,
          content: req.body.content,
          message_type: req.body.message_type === 'outgoing' ? 1 : 0,
          private: req.body.private === true,
          content_attributes: {},
          sender: null,
          created_at: 1,
        })
        return new Response(JSON.stringify({ id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    },
  })
}

function requestBody(over: Record<string, unknown> = {}) {
  return {
    where: 'Karlstejn castle and a wine cellar',
    date: shiftIsoDate(getPragueTodayISO(), 10),
    people: 4,
    wishes: 'Child seat please',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+420 123 456 789',
    locale: 'ru',
    tourSlug: 'karlstejn-day-trip',
    website: '',
    ...over,
  }
}

const postRequest = (body: unknown) =>
  REQUEST(
    new Request('http://localhost/api/custom-tour', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const createQuote = (body: unknown) =>
  CREATE_QUOTE(
    new Request('http://localhost/api/admin/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  spies.enqueue.mockReset()
  spies.enqueue.mockResolvedValue(true)
  spies.dispatchAfter.mockReset()
  world.inquiries = []
  db = createFakePaymentsDb({ bookings: [] })
  world.quotesDb = { client: db.client as any } as never
  world.getQuotes = () => db.state.quotes as Array<Record<string, any>>
  computeRouteDistanceMock.mockResolvedValue({ ok: true, distanceKm: 100, durationMin: 80 })
  delete process.env.NEXT_PUBLIC_SITE_URL
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('custom tour, end to end', () => {
  it('request -> stored inquiry -> lead + alert keys -> Chatwoot note -> linked quote -> listed as quoted', async () => {
    // 1. The visitor's request is accepted.
    const res = await postRequest(requestBody())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    // 2. A custom_tour inquiry holds the request.
    expect(world.inquiries).toHaveLength(1)
    const stored = world.inquiries[0]
    expect(stored.kind).toBe('custom_tour')
    expect(stored.payload).toMatchObject({ where: 'Karlstejn castle and a wine cellar', people: 4, tourSlug: 'karlstejn-day-trip', locale: 'ru' })

    // 3. The CRM lead and the Chatwoot alert are both queued for this inquiry.
    const alertKey = customTourAlertKey(INQUIRY_ID)
    expect(alertKey).toBe(`alert.custom_tour:${INQUIRY_ID}`)
    expect(spies.enqueue).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: alertKey, aggregateId: INQUIRY_ID }))
    const dispatched = spies.dispatchAfter.mock.calls.map((c) => c[0])
    expect(dispatched).toContain(`lead.inquiry:${INQUIRY_ID}`)
    expect(dispatched).toContain(`alert.custom_tour:${INQUIRY_ID}`)
    expect(sendCustomTourOperatorAlert).toHaveBeenCalledTimes(1)
    expect(sendCustomTourClientAck).toHaveBeenCalledTimes(1)

    // 4. The CRM lead is a 'Custom tour' lead.
    const lead = buildLeadFromInquiry(stored as InquiryRow)
    expect(lead.create.source).toBe('Custom tour')
    expect(lead.ref).toBe(`inquiry:${INQUIRY_ID}`)

    // 5. The alert handler posts one private note with the admin link and no personal data.
    const w = worldWithMessageRoute()
    const delivered = await w.dispatch(alertKey, {
      customTourAlert: { store: { exists: async (id: string) => world.inquiries.some((r) => r.id === id) }, opsConversationId: 42 },
    })
    expect(delivered).toEqual({ outcome: 'sent' })
    const posts = w.cw.requests.filter((r) => r.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0].body.private).toBe(true)
    expect(posts[0].body.content).toBe(buildCustomTourNote(INQUIRY_ID))
    expect(posts[0].body.content).toContain(`/admin/custom-tours/${INQUIRY_ID}`)
    expect(posts[0].body.content).not.toContain('@')

    // 6. Until answered, the request is open.
    const before = await listCustomTourRequests({})
    expect(before.items).toHaveLength(1)
    expect(before.items[0]).toMatchObject({ id: INQUIRY_ID, status: 'open', quote: null })

    // 7. The operator answers with a linked quote.
    const quoteRes = await createQuote({
      client: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', phone: '+420123456789' },
      lead_channel: 'other',
      currency: 'eur',
      source_inquiry_id: INQUIRY_ID,
      locale: 'ru',
    })
    expect(quoteRes.status).toBe(201)
    const { id: quoteId } = (await quoteRes.json()) as { id: string }
    const quote = db.state.quotes.find((q) => q.id === quoteId)!
    expect(quote.source_inquiry_id).toBe(INQUIRY_ID)

    // 8. The list now shows the request as quoted, with the quote reference.
    const after = await listCustomTourRequests({})
    expect(after.items[0]).toMatchObject({ id: INQUIRY_ID, status: 'quoted', quote: { id: quoteId, reference: quote.reference } })
    expect((await listCustomTourRequests({ status: 'quoted' })).items).toHaveLength(1)
    expect((await listCustomTourRequests({ status: 'open' })).items).toHaveLength(0)
  })

  it('honeypot filled: answered 200 { ok: true }, nothing stored, nothing queued, nothing sent', async () => {
    const res = await postRequest(requestBody({ website: 'http://spam.example' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(storeInquiry).not.toHaveBeenCalled()
    expect(world.inquiries).toHaveLength(0)
    expect(spies.enqueue).not.toHaveBeenCalled()
    expect(spies.dispatchAfter).not.toHaveBeenCalled()
    expect(sendCustomTourOperatorAlert).not.toHaveBeenCalled()
    expect(sendCustomTourClientAck).not.toHaveBeenCalled()
    expect((await listCustomTourRequests({})).items).toHaveLength(0)
  })
})
