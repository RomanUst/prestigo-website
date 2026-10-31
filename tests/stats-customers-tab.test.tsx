import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'

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
import { CustomersTab } from '@/components/admin/stats/CustomersTab'
import { formatEur } from '@/lib/admin-stats'

const PERIOD = { from: '2026-01-01', to: '2026-03-31' }

type Top = {
  name: string | null
  email: string | null
  trips: number
  revenue_eur: number
  first_trip: string
  last_trip: string
}

function top(over: Partial<Top> = {}): Top {
  return {
    name: 'Jane Vip',
    email: 'jane+vip@example.com',
    trips: 4,
    revenue_eur: 900,
    first_trip: '2025-02-01',
    last_trip: '2026-03-02',
    ...over,
  }
}

function customers(over: Record<string, unknown> = {}) {
  return {
    from: PERIOD.from,
    to: PERIOD.to,
    customers: 12,
    repeat_customers: 3,
    revenue_eur: 1600,
    repeat_revenue_eur: 400,
    repeat_customers_all_time: 9,
    top: [top()],
    ...over,
  }
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  window.history.replaceState(null, '', '/admin/stats')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CustomersTab KPIs', () => {
  it('fetches only the customers endpoint for the period', async () => {
    fetchMock.mockResolvedValue(ok(customers()))
    render(<CustomersTab period={PERIOD} />)
    await screen.findByText('REPEAT RATE')
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/admin/stats/customers?from=2026-01-01&to=2026-03-31',
    ])
  })

  it('shows the repeat rate with its counts', async () => {
    fetchMock.mockResolvedValue(ok(customers()))
    render(<CustomersTab period={PERIOD} />)
    await screen.findByText('REPEAT RATE')
    expect(screen.getAllByText('25.0%').length).toBe(2)
    expect(screen.getByText(/3 of 12 customers/)).toBeTruthy()
  })

  it('shows the repeat revenue share with both amounts', async () => {
    fetchMock.mockResolvedValue(ok(customers()))
    render(<CustomersTab period={PERIOD} />)
    await screen.findByText('REPEAT REVENUE SHARE')
    expect(norm(document.body.textContent)).toContain(`${norm(formatEur(400))} of ${norm(formatEur(1600))}`)
  })

  it('shows repeat customers all time', async () => {
    fetchMock.mockResolvedValue(ok(customers()))
    render(<CustomersTab period={PERIOD} />)
    await screen.findByText('REPEAT CUSTOMERS')
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText(/all time, 2\+ paid trips/)).toBeTruthy()
  })

  it('prints n/a and 0 of 0 customers when there are no customers', async () => {
    fetchMock.mockResolvedValue(
      ok(customers({ customers: 0, repeat_customers: 0, revenue_eur: 0, repeat_revenue_eur: 0, top: [] })),
    )
    render(<CustomersTab period={PERIOD} />)
    await screen.findByText('REPEAT RATE')
    expect(screen.getAllByText('n/a').length).toBe(2)
    expect(screen.getByText(/0 of 0 customers/)).toBeTruthy()
  })
})

describe('CustomersTab top repeat customers', () => {
  it('renders headers and rows in response order', async () => {
    fetchMock.mockResolvedValue(
      ok(
        customers({
          top: [
            top({ name: 'Zed', email: 'zed@example.com', trips: 5, revenue_eur: 2000 }),
            top({ name: 'Anna', email: 'anna@example.com', trips: 3, revenue_eur: 700 }),
          ],
        }),
      ),
    )
    render(<CustomersTab period={PERIOD} />)
    expect(await screen.findByText('Top repeat customers (all-time revenue)')).toBeTruthy()

    const table = screen.getByText('Zed').closest('table') as HTMLElement
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => norm(h.textContent)),
    ).toEqual(['Name', 'Email', 'Trips', 'Revenue (EUR)', 'First trip', 'Last trip'])

    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => norm(r.querySelector('td')?.textContent))).toEqual(['Zed', 'Anna'])
    const cells = within(rows[0])
      .getAllByRole('cell')
      .map((c) => norm(c.textContent))
    expect(cells).toEqual(['Zed', 'zed@example.com', '5', norm(formatEur(2000)), '2025-02-01', '2026-03-02'])
  })

  it('links the name to the bookings search with the email URL-encoded', async () => {
    fetchMock.mockResolvedValue(ok(customers()))
    render(<CustomersTab period={PERIOD} />)
    const link = await screen.findByRole('link', { name: 'Jane Vip' })
    expect(link.getAttribute('href')).toBe('/admin/bookings?search=jane%2Bvip%40example.com')
  })

  it('renders a row without email as plain text', async () => {
    fetchMock.mockResolvedValue(ok(customers({ top: [top({ name: 'No Mail', email: null })] })))
    render(<CustomersTab period={PERIOD} />)
    expect(await screen.findByText('No Mail')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'No Mail' })).toBeNull()
  })

  it('shows the empty text when there are no repeat customers', async () => {
    fetchMock.mockResolvedValue(ok(customers({ top: [] })))
    render(<CustomersTab period={PERIOD} />)
    expect(await screen.findByText('No repeat customers yet.')).toBeTruthy()
  })

  it('does not inject markup from customer-entered names', async () => {
    fetchMock.mockResolvedValue(ok(customers({ top: [top({ name: '<img src=x onerror=alert(1)>' })] })))
    render(<CustomersTab period={PERIOD} />)
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('states what is not counted', async () => {
    fetchMock.mockResolvedValue(ok(customers()))
    render(<CustomersTab period={PERIOD} />)
    await screen.findByText('REPEAT RATE')
    const text = norm(document.body.textContent)
    expect(text).toContain('GNet partner bookings and erased customers are not counted')
    expect(text).toContain('A round trip counts as one trip')
  })
})

describe('CustomersTab states', () => {
  it('shows Loading while pending', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<CustomersTab period={PERIOD} />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows the error text when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    render(<CustomersTab period={PERIOD} />)
    expect(await screen.findByText('Could not load data. Refresh to retry.')).toBeTruthy()
  })

  it('shows the error text when the response does not match the schema', async () => {
    fetchMock.mockResolvedValue(ok({ nope: true }))
    render(<CustomersTab period={PERIOD} />)
    expect(await screen.findByText('Could not load data. Refresh to retry.')).toBeTruthy()
  })
})

describe('StatsPage Customers tab', () => {
  it('lists tabs Overview, Conversion, Customers, B2B and ?tab=customers fetches only the customers endpoint', async () => {
    window.history.replaceState(null, '', '/admin/stats?tab=customers&from=2026-01-01&to=2026-03-31')
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/api/admin/stats/customers?') ? ok(customers()) : ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response),
    )
    render(<StatsPage />)

    expect(await screen.findByText('REPEAT RATE')).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview', 'Conversion', 'Customers', 'B2B'])
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/admin/stats/customers?from=2026-01-01&to=2026-03-31',
    ])
  })
})
