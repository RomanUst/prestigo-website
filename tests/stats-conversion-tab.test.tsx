import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'

import { ConversionTab } from '@/components/admin/stats/ConversionTab'
import {
  DIRECT_SOURCES,
  DIRECT_SOURCE_LABELS,
  FUNNEL_SOURCES,
  FUNNEL_SOURCE_LABELS,
  formatEur,
} from '@/lib/admin-stats'

const PERIOD = { from: '2026-01-01', to: '2026-03-31' }

type FunnelRow = { source: string; inquiries: number; converted: number; window_open: number; revenue_eur: number }
type DirectRow = { source: string; bookings: number; revenue_eur: number }

function funnelRows(over: Record<string, Partial<FunnelRow>> = {}): FunnelRow[] {
  return FUNNEL_SOURCES.map((source) => ({
    source,
    inquiries: 0,
    converted: 0,
    window_open: 0,
    revenue_eur: 0,
    ...over[source],
  }))
}

function directRows(over: Record<string, Partial<DirectRow>> = {}): DirectRow[] {
  return DIRECT_SOURCES.map((source) => ({ source, bookings: 0, revenue_eur: 0, ...over[source] }))
}

function conversion(over: Record<string, unknown> = {}) {
  return {
    from: PERIOD.from,
    to: PERIOD.to,
    funnel: funnelRows({
      chat_web: { inquiries: 3, converted: 1, revenue_eur: 120 },
      form_contact: { inquiries: 0, converted: 0 },
    }),
    funnel_total: { inquiries: 3, converted: 1, window_open: 0, converting_bookings: 1, revenue_eur: 120 },
    direct: directRows({ manual_whatsapp: { bookings: 4, revenue_eur: 800 }, online: { bookings: 2, revenue_eur: 300 } }),
    direct_total: { bookings: 6, revenue_eur: 1100 },
    trips_in_period: 7,
    attributed_bookings: 1,
    attributed_total: { bookings: 1, revenue_eur: 120 },
    period_total: { bookings: 7, revenue_eur: 1220 },
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
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function rowOf(label: string): HTMLElement {
  const cell = screen.getAllByText(label)[0]
  return cell.closest('tr') as HTMLElement
}

function rowCells(label: string): string[] {
  return within(rowOf(label))
    .getAllByRole('cell')
    .map((c) => norm(c.textContent))
}

describe('ConversionTab funnel table', () => {
  it('fetches only the conversion endpoint for the period', async () => {
    fetchMock.mockResolvedValue(ok(conversion()))
    render(<ConversionTab period={PERIOD} />)
    await screen.findByText(FUNNEL_SOURCE_LABELS.chat_web)
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/admin/stats/conversion?from=2026-01-01&to=2026-03-31',
    ])
  })

  it('renders the funnel headers and a count next to every percentage', async () => {
    fetchMock.mockResolvedValue(ok(conversion()))
    render(<ConversionTab period={PERIOD} />)
    await screen.findByText(FUNNEL_SOURCE_LABELS.chat_web)

    const funnelTable = rowOf(FUNNEL_SOURCE_LABELS.chat_web).closest('table') as HTMLElement
    const headers = within(funnelTable)
      .getAllByRole('columnheader')
      .map((h) => norm(h.textContent))
    expect(headers).toEqual(['Source', 'Inquiries', 'Converted', 'Conversion', 'Revenue (EUR)'])

    expect(rowCells(FUNNEL_SOURCE_LABELS.chat_web)).toEqual([
      'Chat · Web widget',
      '3',
      '1',
      '33.3% (1 of 3)',
      norm(formatEur(120)),
    ])
  })

  it('prints n/a for a source with no inquiries', async () => {
    fetchMock.mockResolvedValue(ok(conversion()))
    render(<ConversionTab period={PERIOD} />)
    await screen.findByText(FUNNEL_SOURCE_LABELS.chat_web)
    const cells = rowCells(FUNNEL_SOURCE_LABELS.form_contact)
    expect(cells[3]).toBe('n/a')
  })

  it('always shows the eight D-05 rows in order and hides Chat · Other when it has no inquiries', async () => {
    fetchMock.mockResolvedValue(ok(conversion()))
    render(<ConversionTab period={PERIOD} />)
    await screen.findByText(FUNNEL_SOURCE_LABELS.chat_web)

    const expected = FUNNEL_SOURCES.filter((s) => s !== 'chat_other').map((s) => FUNNEL_SOURCE_LABELS[s])
    const funnelTable = rowOf(FUNNEL_SOURCE_LABELS.chat_web).closest('table') as HTMLElement
    const labels = within(funnelTable)
      .getAllByRole('row')
      .slice(1)
      .map((r) => norm(r.querySelector('td')?.textContent))
    expect(labels.slice(0, expected.length)).toEqual(expected)
    expect(screen.queryByText('Chat · Other')).toBeNull()
  })

  it('shows the Chat · Other row when it has inquiries', async () => {
    fetchMock.mockResolvedValue(
      ok(conversion({ funnel: funnelRows({ chat_other: { inquiries: 2, converted: 1, revenue_eur: 50 } }) })),
    )
    render(<ConversionTab period={PERIOD} />)
    expect(await screen.findByText('Chat · Other')).toBeTruthy()
    expect(rowCells('Chat · Other')[3]).toBe('50.0% (1 of 2)')
  })

  it('total row uses funnel_total, not the sum of the row revenues', async () => {
    fetchMock.mockResolvedValue(
      ok(
        conversion({
          funnel: funnelRows({
            chat_web: { inquiries: 2, converted: 1, revenue_eur: 120 },
            form_contact: { inquiries: 2, converted: 1, revenue_eur: 120 },
          }),
          funnel_total: { inquiries: 4, converted: 2, window_open: 0, converting_bookings: 1, revenue_eur: 120 },
        }),
      ),
    )
    render(<ConversionTab period={PERIOD} />)
    await screen.findByText(FUNNEL_SOURCE_LABELS.chat_web)

    const funnelTable = rowOf(FUNNEL_SOURCE_LABELS.chat_web).closest('table') as HTMLElement
    const totals = within(funnelTable).getAllByText('Total')[0].closest('tr') as HTMLElement
    const cells = within(totals)
      .getAllByRole('cell')
      .map((c) => norm(c.textContent))
    expect(cells[4]).toBe(norm(formatEur(120)))
    expect(cells[4]).not.toBe(norm(formatEur(240)))
    expect(cells[1]).toBe('4')
    expect(cells[2]).toBe('2')
    expect(cells[3]).toBe('50.0% (2 of 4)')
  })

  it('notes open-window inquiries when window_open > 0 and omits the note otherwise', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(conversion({ funnel_total: { inquiries: 3, converted: 1, window_open: 4, converting_bookings: 1, revenue_eur: 120 } })),
    )
    const { unmount } = render(<ConversionTab period={PERIOD} />)
    expect(await screen.findByText(/4 inquiries are still inside their 90-day window/)).toBeTruthy()
    unmount()

    fetchMock.mockResolvedValueOnce(ok(conversion()))
    render(<ConversionTab period={PERIOD} />)
    await screen.findByText(FUNNEL_SOURCE_LABELS.chat_web)
    expect(screen.queryByText(/still inside their 90-day window/)).toBeNull()
  })

  it('states what counts as a booking and as a conversion', async () => {
    fetchMock.mockResolvedValue(ok(conversion()))
    render(<ConversionTab period={PERIOD} />)
    await screen.findByText(FUNNEL_SOURCE_LABELS.chat_web)
    const text = norm(document.body.textContent)
    expect(text).toContain('confirmed, assigned, en route, on location, completed')
    expect(text).toContain('quotes and cancelled bookings are excluded')
    expect(text).toContain('within 90 days')
    expect(text).toContain('marked converted')
  })
})

describe('ConversionTab direct bookings table', () => {
  it('lists the eight direct sources in order with bookings, revenue and the direct total, without a Conversion column', async () => {
    fetchMock.mockResolvedValue(ok(conversion()))
    render(<ConversionTab period={PERIOD} />)
    expect(await screen.findByText('Direct bookings (no recorded inquiry)')).toBeTruthy()

    const directTable = rowOf(DIRECT_SOURCE_LABELS.manual_whatsapp).closest('table') as HTMLElement
    const headers = within(directTable)
      .getAllByRole('columnheader')
      .map((h) => norm(h.textContent))
    expect(headers).toEqual(['Source', 'Bookings', 'Revenue (EUR)'])
    expect(headers).not.toContain('Conversion')

    const bodyRows = within(directTable).getAllByRole('row').slice(1)
    const labels = bodyRows.slice(0, DIRECT_SOURCES.length).map((r) => norm(r.querySelector('td')?.textContent))
    expect(labels).toEqual(DIRECT_SOURCES.map((s) => DIRECT_SOURCE_LABELS[s]))

    expect(rowCells(DIRECT_SOURCE_LABELS.manual_whatsapp)).toEqual(['Manual · WhatsApp', '4', norm(formatEur(800))])
    const total = bodyRows[bodyRows.length - 1]
    expect(
      within(total)
        .getAllByRole('cell')
        .map((c) => norm(c.textContent)),
    ).toEqual(['Total', '6', norm(formatEur(1100))])
  })
})

describe('ConversionTab states', () => {
  it('shows Loading while the request is pending', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<ConversionTab period={PERIOD} />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows the error text when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    render(<ConversionTab period={PERIOD} />)
    expect(await screen.findByText('Could not load data. Refresh to retry.')).toBeTruthy()
  })

  it('shows the error text when the response does not match the schema', async () => {
    fetchMock.mockResolvedValue(ok({ nope: true }))
    render(<ConversionTab period={PERIOD} />)
    expect(await screen.findByText('Could not load data. Refresh to retry.')).toBeTruthy()
  })
})

describe('ConversionTab period bookings table (WR-01)', () => {
  it('splits all paid bookings of the period into after-inquiry and direct rows that add up to the total', async () => {
    fetchMock.mockResolvedValue(
      ok(
        conversion({
          direct_total: { bookings: 37, revenue_eur: 13407 },
          attributed_total: { bookings: 2, revenue_eur: 1216 },
          period_total: { bookings: 39, revenue_eur: 14623 },
        }),
      ),
    )
    render(<ConversionTab period={PERIOD} />)
    expect(await screen.findByText('All paid bookings created in this period')).toBeTruthy()

    const table = rowOf('After a recorded inquiry').closest('table') as HTMLElement
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) =>
        within(r)
          .getAllByRole('cell')
          .map((c) => norm(c.textContent)),
      )
    expect(rows).toEqual([
      ['After a recorded inquiry', '2', norm(formatEur(1216))],
      ['Direct (no recorded inquiry)', '37', norm(formatEur(13407))],
      ['Total', '39', norm(formatEur(14623))],
    ])
    expect(screen.getByText(/counts only the first booking each\s+inquiry led to/)).toBeTruthy()
  })
})
