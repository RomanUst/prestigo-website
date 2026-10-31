import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
      {children}
    </a>
  ),
}))

// recharts does not render in jsdom
vi.mock('@/components/admin/StatsChart', () => ({
  RevenueBarChart: () => <div data-testid="revenue-chart" />,
  GroupedBarChart: ({ title }: { title: string }) => <div data-testid="grouped-chart">{title}</div>,
}))

import StatsPage from '@/app/(internal)/admin/(dashboard)/stats/page'
import { defaultPeriod, formatEur, formatPct, resolvePreset } from '@/lib/admin-stats'

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const ID3 = '33333333-3333-4333-8333-333333333333'
const ID4 = '44444444-4444-4444-8444-444444444444'

const OVERVIEW = {
  counts: { today: 2, thisWeek: 5, thisMonth: 11 },
  revenue: { currentMonth: 123456, previousMonth: 100000 },
  byVehicleClass: [],
  byTripType: [],
  monthlyRevenue: [],
}

type Acc = {
  user_id: string
  company_name: string | null
  full_name: string | null
  email: string | null
  bookings: number
  revenue_eur: number
  avg_eur: number
  last_trip: string
  without_amount: number
}

function acc(over: Partial<Acc> & { user_id: string }): Acc {
  return {
    company_name: null,
    full_name: null,
    email: null,
    bookings: 1,
    revenue_eur: 100,
    avg_eur: 100,
    last_trip: '2026-03-01',
    without_amount: 0,
    ...over,
  }
}

function b2b(over: Record<string, unknown> = {}) {
  return {
    from: '2026-01-01',
    to: '2026-03-31',
    accounts_total: 4,
    b2b_bookings: 5,
    b2b_revenue_eur: 12500,
    all_bookings: 20,
    all_revenue_eur: 50000,
    accounts: [
      acc({ user_id: ID1, company_name: 'Acme s.r.o.', bookings: 3, revenue_eur: 9000, avg_eur: 3000 }),
      acc({ user_id: ID2, company_name: null, full_name: 'Jana Nováková', email: 'jana@example.com', bookings: 2, revenue_eur: 3500, avg_eur: 1750 }),
    ],
    ...over,
  }
}

// Testing Library collapses whitespace (incl. the cs-CZ no-break space) in node text.
const norm = (s: string) => s.replace(/\s+/g, ' ')

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function fail(status = 500): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

function setUrl(search: string) {
  window.history.replaceState(null, '', `/admin/stats${search}`)
}

function urls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]))
}

const CONVERSION = {
  from: '2026-01-01',
  to: '2026-03-31',
  funnel: [
    { source: 'chat_web', inquiries: 3, converted: 1, window_open: 0, revenue_eur: 120 },
  ],
  funnel_total: { inquiries: 3, converted: 1, window_open: 0, converting_bookings: 1, revenue_eur: 120 },
  direct: [{ source: 'online', bookings: 2, revenue_eur: 300 }],
  direct_total: { bookings: 2, revenue_eur: 300 },
  trips_in_period: 3,
  attributed_bookings: 1,
}

function routeFetch(b2bBody: unknown | (() => Response | Promise<Response>) = b2b()) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/admin/stats') return ok(OVERVIEW)
    if (url.startsWith('/api/admin/stats/conversion?')) return ok(CONVERSION)
    if (url.startsWith('/api/admin/stats/b2b?')) {
      return typeof b2bBody === 'function' ? (b2bBody as () => Response | Promise<Response>)() : ok(b2bBody)
    }
    return fail(404)
  })
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  setUrl('')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StatsPage shell + Overview', () => {
  it('opens on Overview, fetches only /api/admin/stats and writes the default period to the URL', async () => {
    routeFetch()
    render(<StatsPage />)

    expect(await screen.findByText('THIS WEEK')).toBeTruthy()
    expect(screen.getByText('TODAY')).toBeTruthy()
    expect(screen.getByText('THIS MONTH')).toBeTruthy()
    expect(screen.getByText('MONTHLY REVENUE')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Stats' })).toBeTruthy()

    expect(urls()).toEqual(['/api/admin/stats'])

    const def = defaultPeriod(new Date())
    await waitFor(() => {
      expect(window.location.search).toBe(`?tab=overview&from=${def.from}&to=${def.to}`)
    })
  })

  it('shows tabs Overview, Conversion and B2B in order with Overview selected, and no period selector on Overview', async () => {
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('MONTHLY REVENUE')

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Conversion', 'B2B'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Last 30 days' })).toBeNull()
  })

  it('shows the error text when the overview request fails', async () => {
    fetchMock.mockImplementation(async () => fail(500))
    render(<StatsPage />)
    expect(await screen.findByText('Could not load data. Refresh to retry.')).toBeTruthy()
  })

  it('falls back to Overview for an unknown tab', async () => {
    setUrl('?tab=unknown&from=2026-01-01&to=2026-03-31')
    routeFetch()
    render(<StatsPage />)
    expect(await screen.findByText('MONTHLY REVENUE')).toBeTruthy()
    expect(urls()).toEqual(['/api/admin/stats'])
  })
})

describe('StatsPage Conversion tab', () => {
  it('?tab=conversion fetches only the conversion endpoint for the URL period and renders the funnel', async () => {
    setUrl('?tab=conversion&from=2026-01-01&to=2026-03-31')
    routeFetch()
    render(<StatsPage />)

    expect(await screen.findByText('Chat · Web widget')).toBeTruthy()
    expect(screen.getAllByText('33.3% (1 of 3)').length).toBeGreaterThanOrEqual(1)
    expect(urls()).toEqual(['/api/admin/stats/conversion?from=2026-01-01&to=2026-03-31'])
    expect(screen.getByRole('button', { name: 'Last 30 days' })).toBeTruthy()
  })
})

describe('StatsPage B2B tab', () => {
  it('reads tab and period from the URL, fetches only the B2B endpoint and lists accounts in RPC order', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    routeFetch()
    render(<StatsPage />)

    expect(await screen.findByText('Acme s.r.o.')).toBeTruthy()
    expect(urls()).toEqual(['/api/admin/stats/b2b?from=2026-01-01&to=2026-03-31'])
    expect(urls()).not.toContain('/api/admin/stats')

    const rows = screen.getAllByRole('row')
    // rows[0] is the header row
    expect(within(rows[1]).getByText('Acme s.r.o.')).toBeTruthy()
    expect(within(rows[2]).getByText('Jana Nováková')).toBeTruthy()

    const link = screen.getByRole('link', { name: 'Acme s.r.o.' })
    expect(link.getAttribute('href')).toBe(`/admin/accounts/${ID1}`)

    for (const h of ['Account', 'Bookings', 'Revenue (EUR)', 'Avg booking (EUR)', 'Last trip']) {
      expect(screen.getByText(h)).toBeTruthy()
    }
  })

  it('shows B2B revenue with the share of all revenue, bookings and account count', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')

    expect(screen.getByText(norm(formatEur(12500)))).toBeTruthy()
    expect(
      screen.getByText(norm(`${formatPct(12500, 50000)} of all revenue (${formatEur(50000)})`)),
    ).toBeTruthy()
    expect(screen.getByText('of 20 paid trips')).toBeTruthy()
    expect(screen.getByText(/with trips in period/)).toBeTruthy()
  })

  it('prints n/a for the share when all revenue is 0', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    routeFetch(b2b({ b2b_revenue_eur: 0, all_revenue_eur: 0 }))
    render(<StatsPage />)
    expect(await screen.findByText(norm(`n/a of all revenue (${formatEur(0)})`))).toBeTruthy()
  })

  it('falls back the account label company_name -> full_name -> email -> Corporate account', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    routeFetch(
      b2b({
        accounts: [
          acc({ user_id: ID1, company_name: 'Acme s.r.o.', full_name: 'X' }),
          acc({ user_id: ID2, full_name: 'Jana Nováková', email: 'jana@example.com' }),
          acc({ user_id: ID3, email: 'only@example.com' }),
          acc({ user_id: ID4 }),
        ],
      }),
    )
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')
    expect(screen.getByText('Jana Nováková')).toBeTruthy()
    expect(screen.getByText('only@example.com')).toBeTruthy()
    expect(screen.getByText('Corporate account')).toBeTruthy()
  })

  it('shows the empty text when there are no B2B trips', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    routeFetch(b2b({ accounts: [], b2b_bookings: 0, b2b_revenue_eur: 0 }))
    render(<StatsPage />)
    expect(await screen.findByText('No B2B trips in this period.')).toBeTruthy()
  })

  it('notes bookings without an amount (group payment)', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    routeFetch(
      b2b({ accounts: [acc({ user_id: ID1, company_name: 'Acme s.r.o.', without_amount: 2 })] }),
    )
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')
    const note = screen.getByText(/2 bookings/)
    expect(note.textContent).toMatch(/group payment/)
  })

  it('uses the default 90-day period for an impossible date in the URL', async () => {
    setUrl('?tab=b2b&from=2026-02-30&to=2026-03-31')
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')
    const def = defaultPeriod(new Date())
    expect(urls()).toEqual([`/api/admin/stats/b2b?from=${def.from}&to=${def.to}`])
  })

  it('shows the error text when the B2B request rejects', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    fetchMock.mockImplementation(async () => {
      throw new Error('network')
    })
    render(<StatsPage />)
    expect(await screen.findByText('Could not load data. Refresh to retry.')).toBeTruthy()
  })

  it('shows the error text when the B2B request answers 500', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    routeFetch(() => fail(500))
    render(<StatsPage />)
    expect(await screen.findByText('Could not load data. Refresh to retry.')).toBeTruthy()
  })

  it('shows the error text when the B2B response does not match the schema', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    routeFetch({ nonsense: true })
    render(<StatsPage />)
    expect(await screen.findByText('Could not load data. Refresh to retry.')).toBeTruthy()
  })

  it('switching from Overview to B2B fetches the B2B endpoint and rewrites the URL tab keeping the period', async () => {
    setUrl('?tab=overview&from=2026-01-01&to=2026-03-31')
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('MONTHLY REVENUE')

    fireEvent.click(screen.getByRole('tab', { name: 'B2B' }))

    expect(await screen.findByText('Acme s.r.o.')).toBeTruthy()
    expect(urls()).toContain('/api/admin/stats/b2b?from=2026-01-01&to=2026-03-31')
    await waitFor(() => {
      expect(window.location.search).toBe('?tab=b2b&from=2026-01-01&to=2026-03-31')
    })
  })
})

describe('StatsPage period selector', () => {
  const b2bCalls = () => urls().filter((u) => u.startsWith('/api/admin/stats/b2b?'))

  it('shows five presets on the B2B tab with Last 90 days pressed by default', async () => {
    setUrl('?tab=b2b')
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')

    for (const label of ['Last 30 days', 'Last 90 days', 'This month', 'This year', 'All time']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Last 90 days' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking Last 30 days fetches that period and rewrites the URL', async () => {
    setUrl('?tab=b2b')
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')

    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))

    const p = resolvePreset('last_30', new Date())
    await waitFor(() => {
      expect(b2bCalls()).toContain(`/api/admin/stats/b2b?from=${p.from}&to=${p.to}`)
    })
    await waitFor(() => {
      expect(window.location.search).toBe(`?tab=b2b&from=${p.from}&to=${p.to}`)
    })
    expect(screen.getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('applies a valid custom range', async () => {
    setUrl('?tab=b2b')
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(b2bCalls()).toContain('/api/admin/stats/b2b?from=2026-01-01&to=2026-03-31')
    })
    await waitFor(() => {
      expect(window.location.search).toBe('?tab=b2b&from=2026-01-01&to=2026-03-31')
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejects From after To without fetching', async () => {
    setUrl('?tab=b2b')
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')
    const before = b2bCalls().length
    const search = window.location.search

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid date range')
    expect(b2bCalls().length).toBe(before)
    expect(window.location.search).toBe(search)
  })

  it('rejects an impossible date without fetching', async () => {
    setUrl('?tab=b2b')
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')
    const before = b2bCalls().length

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-02-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid date range')
    expect(b2bCalls().length).toBe(before)
  })

  it('rejects a range outside 2000-01-01..2099-12-31', async () => {
    setUrl('?tab=b2b')
    routeFetch()
    render(<StatsPage />)
    await screen.findByText('Acme s.r.o.')
    const before = b2bCalls().length

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '1999-12-31' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid date range')
    expect(b2bCalls().length).toBe(before)
  })

  it('a late response for an old period never replaces newer data', async () => {
    setUrl('?tab=b2b&from=2026-01-01&to=2026-03-31')
    let resolveFirst: (r: Response) => void = () => {}
    const first = new Promise<Response>((res) => {
      resolveFirst = res
    })
    const second = b2b({
      accounts: [acc({ user_id: ID3, company_name: 'Second Period Ltd' })],
    })
    let n = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.startsWith('/api/admin/stats/b2b?')) return fail(404)
      n += 1
      return n === 1 ? first : ok(second)
    })
    render(<StatsPage />)
    await waitFor(() => expect(n).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))
    expect(await screen.findByText('Second Period Ltd')).toBeTruthy()

    resolveFirst(ok(b2b()))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByText('Second Period Ltd')).toBeTruthy()
    expect(screen.queryByText('Acme s.r.o.')).toBeNull()
  })
})
