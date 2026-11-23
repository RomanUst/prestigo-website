// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 93 plan 93-31 (TRIP-07; D-18, D-19): the operator's list and detail of custom-tour requests. The routes and the
 * store run for real; the Supabase service client is a small in-memory double of the query surface the store uses
 * (eq, neq, order, limit, maybeSingle for the detail, and the list_custom_tour_requests function of migration 094 for
 * the list: its SQL is mirrored by fakeListRpc), the admin session is a switch.
 */

type Row = Record<string, unknown>

const { world } = vi.hoisted(() => ({
  world: {
    auth: 'admin' as 'admin' | '401' | '403',
    inquiries: [] as Array<Record<string, unknown>>,
    quotes: [] as Array<Record<string, unknown>>,
    failTable: null as null | string,
    rpcCalls: [] as Array<Record<string, unknown>>,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    if (world.auth === '401') return { user: null, error: '401' as const }
    if (world.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: '99999999-9999-4999-8999-999999999999' }, error: null }
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => new FakeQuery(table),
    rpc: (fn: string, args: Record<string, unknown>) => fakeListRpc(fn, args),
  }),
}))

// Mirrors list_custom_tour_requests (migration 094): custom_tour inquiries LEFT JOIN the non-voided quote, the derived
// status filter, the keyset (created_at, id) < cursor, newest first, LIMIT clamp 1..101.
function fakeListRpc(fn: string, args: Record<string, unknown>) {
  expect(fn).toBe('list_custom_tour_requests')
  world.rpcCalls.push(args)
  if (world.failTable === 'rpc') return Promise.resolve({ data: null, error: { code: 'XX000' } })
  const status = String(args.p_status)
  const cAt = args.p_cursor_created_at as string | null
  const cId = args.p_cursor_id as string | null
  const limit = Math.min(101, Math.max(1, Number(args.p_limit ?? 51)))
  const rows = world.inquiries
    .filter((i) => i.kind === 'custom_tour')
    .map((i) => ({ i, q: world.quotes.find((q) => q.source_inquiry_id === i.id && q.status !== 'voided') }))
    .filter(({ q }) => status === 'all' || (status === 'quoted' ? Boolean(q) : !q))
    .filter(({ i }) => cAt == null || cId == null || String(i.created_at) < cAt || (String(i.created_at) === cAt && String(i.id) < cId))
    .sort((a, b) => {
      const x = `${String(a.i.created_at)}|${String(a.i.id)}`
      const y = `${String(b.i.created_at)}|${String(b.i.id)}`
      return x < y ? 1 : x > y ? -1 : 0
    })
    .slice(0, limit)
    .map(({ i, q }) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      payload: i.payload,
      created_at: i.created_at,
      quote_id: q ? q.id : null,
      quote_reference: q ? q.reference : null,
      quote_created_at: q ? '2026-11-23T10:00:00.000000+00:00' : null,
    }))
  return Promise.resolve({ data: rows, error: null })
}

class FakeQuery implements PromiseLike<{ data: Row[] | Row | null; error: { code: string } | null }> {
  private filters: Array<(r: Row) => boolean> = []
  private orders: Array<{ col: string; asc: boolean }> = []
  private max: number | null = null
  private one = false
  constructor(private readonly table: string) {}

  select(_cols?: string) {
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val)
    return this
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val)
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
    onfulfilled?: ((v: { data: Row[] | Row | null; error: { code: string } | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
  private run() {
    if (world.failTable === this.table) return { data: null, error: { code: 'XX000' } }
    let rows = [...(this.table === 'inquiries' ? world.inquiries : world.quotes)].filter((r) => this.filters.every((f) => f(r)))
    for (const o of [...this.orders].reverse()) {
      rows.sort((a, b) => {
        const x = String(a[o.col])
        const y = String(b[o.col])
        return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1)
      })
    }
    if (this.max !== null) rows = rows.slice(0, this.max)
    return this.one ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
  }
}

import { GET as LIST } from '@/app/api/admin/custom-tours/route'
import { GET as DETAIL } from '@/app/api/admin/custom-tours/[id]/route'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const list = (query = '') => LIST(new Request(`http://localhost/api/admin/custom-tours${query}`))
const detail = (id: string) => DETAIL(new Request(`http://localhost/api/admin/custom-tours/${id}`), params(id))

function tourRow(n: number, over: Row = {}, payload: Row = {}): Row {
  return {
    id: uuid(n),
    kind: 'custom_tour',
    name: `Client ${n}`,
    email: `client${n}@example.com`,
    phone: '+420123456789',
    created_at: `2026-11-${String(10 + (n % 10)).padStart(2, '0')}T10:00:00.${String(n).padStart(6, '0')}+00:00`,
    payload: { where: `Place ${n}`, date: '2027-05-10', people: 3, wishes: 'Castles', tourSlug: 'cesky-krumlov', locale: 'ru', ...payload },
    ...over,
  }
}

beforeEach(() => {
  world.auth = 'admin'
  world.failTable = null
  world.inquiries = []
  world.quotes = []
  world.rpcCalls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('guards', () => {
  it('401 / 403 come first on list and detail, with no data', async () => {
    world.inquiries = [tourRow(1)]
    world.auth = '401'
    expect((await list()).status).toBe(401)
    expect((await detail(uuid(1))).status).toBe(401)
    world.auth = '403'
    const res = await list()
    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain('client1@example.com')
    expect((await detail(uuid(1))).status).toBe(403)
  })

  it('a bad status, a bad cursor and a non-uuid id are 400', async () => {
    expect((await list('?status=weird')).status).toBe(400)
    expect((await list('?cursor=!!!')).status).toBe(400)
    expect((await list('?cursor=')).status).toBe(400)
    expect((await detail('not-a-uuid')).status).toBe(400)
  })
})

describe('GET /api/admin/custom-tours', () => {
  it('lists custom_tour requests only: a contact inquiry never appears', async () => {
    world.inquiries = [tourRow(1), tourRow(2, { kind: 'contact' }), tourRow(3, { kind: 'corporate' })]
    const body = (await (await list()).json()) as { items: Array<{ id: string }>; nextCursor: string | null }
    expect(body.items.map((i) => i.id)).toEqual([uuid(1)])
    expect(body.nextCursor).toBeNull()
  })

  it('shows quoted with the quote id and reference when a quote has source_inquiry_id, else open', async () => {
    world.inquiries = [tourRow(1), tourRow(2)]
    world.quotes = [{ id: 'q-1', reference: 'Q-20261123-ABC123', source_inquiry_id: uuid(2) }]
    const res = await list()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const { items } = (await res.json()) as { items: Array<Record<string, unknown>> }
    const byId = Object.fromEntries(items.map((i) => [i.id as string, i]))
    expect(byId[uuid(1)]).toMatchObject({ status: 'open', quote: null })
    expect(byId[uuid(2)]).toMatchObject({ status: 'quoted', quote: { id: 'q-1', reference: 'Q-20261123-ABC123' } })
  })

  it('status=open and status=quoted filter on the derived status', async () => {
    world.inquiries = [tourRow(1), tourRow(2), tourRow(3)]
    world.quotes = [{ id: 'q-1', reference: 'Q-1', source_inquiry_id: uuid(2) }]
    const ids = async (q: string) => ((await (await list(q)).json()) as { items: Array<{ id: string }> }).items.map((i) => i.id).sort()
    expect(await ids('?status=open')).toEqual([uuid(1), uuid(3)])
    expect(await ids('?status=quoted')).toEqual([uuid(2)])
    expect(await ids('?status=all')).toEqual([uuid(1), uuid(2), uuid(3)])
    world.quotes = []
    expect(await ids('?status=quoted')).toEqual([])
    expect(await ids('?status=open')).toEqual([uuid(1), uuid(2), uuid(3)])
  })

  it('asks the database for the filter: status, page size + 1 and the decoded keyset go to the function, no id list', async () => {
    world.inquiries = Array.from({ length: 3 }, (_, i) => tourRow(i + 1))
    await list('?status=quoted')
    expect(world.rpcCalls[0]).toEqual({ p_status: 'quoted', p_cursor_created_at: null, p_cursor_id: null, p_limit: 51 })
    const first = (await (await list('?status=open')).json()) as { nextCursor: string | null }
    expect(first.nextCursor).toBeNull()
    world.inquiries = Array.from({ length: 51 }, (_, i) =>
      tourRow(i + 1, { created_at: `2026-11-01T10:00:${String(i).padStart(2, '0')}.000000+00:00` }),
    )
    const page = (await (await list()).json()) as { nextCursor: string }
    await list(`?cursor=${encodeURIComponent(page.nextCursor)}`)
    const sent = world.rpcCalls[world.rpcCalls.length - 1]
    expect(sent.p_cursor_created_at).toBe('2026-11-01T10:00:01.000000+00:00')
    expect(sent.p_cursor_id).toBe(uuid(2))
  })

  it('stays correct with thousands of quoted requests: the quoted ids are never read or sent', async () => {
    world.inquiries = [tourRow(1), tourRow(2)]
    world.quotes = Array.from({ length: 3000 }, (_, i) => ({
      id: `q-${i}`,
      reference: `Q-${i}`,
      source_inquiry_id: i === 0 ? uuid(2) : uuid(10_000 + i),
    }))
    const ids = async (q: string) => ((await (await list(q)).json()) as { items: Array<{ id: string }> }).items.map((i) => i.id)
    expect(await ids('?status=quoted')).toEqual([uuid(2)])
    expect(await ids('?status=open')).toEqual([uuid(1)])
  })

  it('WR-01: a voided quote does not make the request quoted, a live one next to it does', async () => {
    world.inquiries = [tourRow(1), tourRow(2)]
    world.quotes = [
      { id: 'q-void', reference: 'Q-VOID', source_inquiry_id: uuid(1), status: 'voided' },
      { id: 'q-void2', reference: 'Q-VOID2', source_inquiry_id: uuid(2), status: 'voided' },
      { id: 'q-live', reference: 'Q-LIVE', source_inquiry_id: uuid(2), status: 'sent' },
    ]
    const { items } = (await (await list()).json()) as { items: Array<Record<string, unknown>> }
    const byId = Object.fromEntries(items.map((i) => [i.id as string, i]))
    expect(byId[uuid(1)]).toMatchObject({ status: 'open', quote: null })
    expect(byId[uuid(2)]).toMatchObject({ status: 'quoted', quote: { id: 'q-live', reference: 'Q-LIVE' } })
    const ids = async (q: string) => ((await (await list(q)).json()) as { items: Array<{ id: string }> }).items.map((i) => i.id)
    expect(await ids('?status=open')).toEqual([uuid(1)])
    expect(await ids('?status=quoted')).toEqual([uuid(2)])
  })

  it('orders newest first, 51 rows give 50 items and a cursor, and the next page continues without a repeat', async () => {
    world.inquiries = Array.from({ length: 51 }, (_, i) =>
      tourRow(i + 1, { created_at: `2026-11-01T10:00:${String(i).padStart(2, '0')}.000000+00:00` }),
    )
    const first = (await (await list()).json()) as { items: Array<{ id: string; receivedAt: string }>; nextCursor: string | null }
    expect(first.items).toHaveLength(50)
    expect(first.nextCursor).toBeTruthy()
    expect(first.items[0].id).toBe(uuid(51))
    const times = first.items.map((i) => i.receivedAt)
    expect([...times].sort().reverse()).toEqual(times)

    const second = (await (await list(`?cursor=${encodeURIComponent(first.nextCursor as string)}`)).json()) as {
      items: Array<{ id: string }>
      nextCursor: string | null
    }
    expect(second.items.map((i) => i.id)).toEqual([uuid(1)])
    expect(second.nextCursor).toBeNull()
  })

  it('requests with the same timestamp are not skipped across a page boundary', async () => {
    const same = '2026-11-01T10:00:00.000000+00:00'
    world.inquiries = Array.from({ length: 52 }, (_, i) => tourRow(i + 1, { created_at: same }))
    const first = (await (await list()).json()) as { items: Array<{ id: string }>; nextCursor: string }
    const second = (await (await list(`?cursor=${encodeURIComponent(first.nextCursor)}`)).json()) as { items: Array<{ id: string }> }
    const all = [...first.items, ...second.items].map((i) => i.id)
    expect(new Set(all).size).toBe(52)
  })

  it('whereFirstLine is the first line cut to 120 characters; date and people come from the payload or are null', async () => {
    world.inquiries = [
      tourRow(1, {}, { where: `${'x'.repeat(200)}\nsecond line`, date: '2027-06-01', people: 4 }),
      tourRow(2, { created_at: '2026-10-01T10:00:00.000000+00:00' }, { where: '\n  Karlovy Vary  \nmore', date: undefined, people: 'many' }),
    ]
    const { items } = (await (await list()).json()) as { items: Array<Record<string, unknown>> }
    expect(items[0].whereFirstLine).toBe('x'.repeat(120))
    expect(items[0]).toMatchObject({ date: '2027-06-01', people: 4, locale: 'ru', name: 'Client 1', email: 'client1@example.com' })
    expect(items[1]).toMatchObject({ whereFirstLine: 'Karlovy Vary', date: null, people: null })
  })

  it('a database failure is 500 with no data in the body', async () => {
    world.inquiries = [tourRow(1)]
    world.failTable = 'rpc'
    const res = await list()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('example.com')
  })
})

describe('GET /api/admin/custom-tours/[id]', () => {
  it('returns the full request and the linked quote', async () => {
    world.inquiries = [tourRow(1, {}, { where: 'Bohemian Switzerland\nand Saxon Switzerland', wishes: 'Photo stops' })]
    world.quotes = [{ id: 'q-1', reference: 'Q-20261123-ABC123', source_inquiry_id: uuid(1) }]
    const res = await detail(uuid(1))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: uuid(1),
      name: 'Client 1',
      email: 'client1@example.com',
      phone: '+420123456789',
      where: 'Bohemian Switzerland\nand Saxon Switzerland',
      date: '2027-05-10',
      people: 3,
      wishes: 'Photo stops',
      tourSlug: 'cesky-krumlov',
      locale: 'ru',
      status: 'quoted',
      quote: { id: 'q-1', reference: 'Q-20261123-ABC123' },
    })
  })

  it('WR-01: the detail ignores a voided quote and shows the live one', async () => {
    world.inquiries = [tourRow(1), tourRow(2)]
    world.quotes = [
      { id: 'q-void', reference: 'Q-VOID', source_inquiry_id: uuid(1), status: 'voided' },
      { id: 'q-void2', reference: 'Q-VOID2', source_inquiry_id: uuid(2), status: 'voided' },
      { id: 'q-live', reference: 'Q-LIVE', source_inquiry_id: uuid(2), status: 'draft' },
    ]
    expect(await (await detail(uuid(1))).json()).toMatchObject({ status: 'open', quote: null })
    expect(await (await detail(uuid(2))).json()).toMatchObject({ status: 'quoted', quote: { id: 'q-live', reference: 'Q-LIVE' } })
  })

  it('an open request has no quote', async () => {
    world.inquiries = [tourRow(1)]
    expect(await (await detail(uuid(1))).json()).toMatchObject({ status: 'open', quote: null })
  })

  it('an unknown id and a contact inquiry are 404', async () => {
    world.inquiries = [tourRow(2, { kind: 'contact' })]
    expect((await detail(uuid(1))).status).toBe(404)
    expect((await detail(uuid(2))).status).toBe(404)
  })
})
