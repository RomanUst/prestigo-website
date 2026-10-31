import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getAdminUserMock, rpcMock } = vi.hoisted(() => ({
  getAdminUserMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getAdminUser: getAdminUserMock,
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ rpc: rpcMock })),
}))

import { GET as getB2b } from '@/app/api/admin/stats/b2b/route'
import { GET as getConversion } from '@/app/api/admin/stats/conversion/route'
import { GET as getCustomers } from '@/app/api/admin/stats/customers/route'
import { FUNNEL_SOURCES, DIRECT_SOURCES } from '@/lib/admin-stats'

const FROM = '2026-01-01'
const TO = '2026-03-31'

const B2B_OK = {
  from: FROM,
  to: TO,
  accounts_total: 1,
  b2b_bookings: 2,
  b2b_revenue_eur: 300,
  all_bookings: 10,
  all_revenue_eur: 2000,
  accounts: [
    {
      user_id: '11111111-1111-4111-8111-111111111111',
      company_name: 'ACME',
      full_name: null,
      email: 'a@example.com',
      bookings: 2,
      revenue_eur: 300,
      avg_eur: 150,
      last_trip: '2026-03-01',
      without_amount: 0,
    },
  ],
}

const CONVERSION_OK = {
  from: FROM,
  to: TO,
  funnel: FUNNEL_SOURCES.map(source => ({ source, inquiries: 2, converted: 1, window_open: 0, revenue_eur: 100 })),
  funnel_total: { inquiries: 18, converted: 9, window_open: 0, converting_bookings: 8, revenue_eur: 900 },
  direct: DIRECT_SOURCES.map(source => ({ source, bookings: 3, revenue_eur: 300 })),
  direct_total: { bookings: 24, revenue_eur: 2400 },
  trips_in_period: 40,
  attributed_bookings: 30,
}

const CUSTOMERS_OK = {
  from: FROM,
  to: TO,
  customers: 20,
  repeat_customers: 5,
  revenue_eur: 4000,
  repeat_revenue_eur: 1500,
  repeat_customers_all_time: 9,
  top: [
    { name: 'Jane', email: 'j@example.com', trips: 3, revenue_eur: 450, first_trip: '2026-01-02', last_trip: '2026-03-01' },
  ],
}

type Case = {
  tab: string
  rpc: string
  handler: (req: Request) => Promise<Response>
  ok: unknown
  broken: unknown
}

const CASES: Case[] = [
  {
    tab: 'b2b',
    rpc: 'stats_b2b',
    handler: getB2b as (req: Request) => Promise<Response>,
    ok: B2B_OK,
    broken: { ...B2B_OK, accounts: undefined },
  },
  {
    tab: 'conversion',
    rpc: 'stats_conversion',
    handler: getConversion as (req: Request) => Promise<Response>,
    ok: CONVERSION_OK,
    broken: { ...CONVERSION_OK, funnel: undefined },
  },
  {
    tab: 'customers',
    rpc: 'stats_customers',
    handler: getCustomers as (req: Request) => Promise<Response>,
    ok: CUSTOMERS_OK,
    broken: { ...CUSTOMERS_OK, top: undefined },
  },
]

function req(tab: string, qs: string) {
  return new Request(`http://localhost/api/admin/stats/${tab}${qs ? `?${qs}` : ''}`)
}

describe.each(CASES)('GET /api/admin/stats/$tab', ({ tab, rpc, handler, ok, broken }) => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
    rpcMock.mockResolvedValue({ data: ok, error: null })
  })

  it('401 without a session and no rpc', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    const res = await handler(req(tab, `from=${FROM}&to=${TO}`))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('403 for a non-admin and no rpc', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'u' }, error: '403' })
    const res = await handler(req(tab, `from=${FROM}&to=${TO}`))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('auth runs before period validation (bad period + no session -> 401)', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    const res = await handler(req(tab, 'from=nope'))
    expect(res.status).toBe(401)
  })

  it.each([
    ['missing both', ''],
    ['missing to', `from=${FROM}`],
    ['malformed', 'from=2026-1-01&to=2026-03-31'],
    ['impossible date', 'from=2026-02-30&to=2026-03-31'],
    ['from after to', 'from=2026-04-01&to=2026-03-31'],
    ['before 2000', 'from=1999-12-31&to=2026-03-31'],
    ['after 2099', 'from=2026-01-01&to=2100-01-01'],
  ])('400 for bad period (%s) and no rpc', async (_label, qs) => {
    const res = await handler(req(tab, qs))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid period' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('200 and passes the period to the rpc exactly once', async () => {
    const res = await handler(req(tab, `from=${FROM}&to=${TO}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(ok)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith(rpc, { p_from: FROM, p_to: TO })
  })

  it('500 on rpc error without leaking the message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'relation secret_table does not exist' } })
    const res = await handler(req(tab, `from=${FROM}&to=${TO}`))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('secret_table')
    expect(JSON.parse(text)).toEqual({ error: 'DB read failed' })
    expect(console.error).toHaveBeenCalled()
  })

  it('500 when the rpc result does not match the schema', async () => {
    rpcMock.mockResolvedValue({ data: broken, error: null })
    const res = await handler(req(tab, `from=${FROM}&to=${TO}`))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'DB read failed' })
  })
})
