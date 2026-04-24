import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RoutesTable from '@/components/admin/RoutesTable'
import type { RoutePrice } from '@/lib/route-prices'

const originalFetch = global.fetch

const fixtures: RoutePrice[] = [
  { slug: 'prague-brno', fromLabel: 'Prague', toLabel: 'Brno', distanceKm: 210, eClassEur: 450, sClassEur: 600, vClassEur: 550, displayOrder: 1, placeIds: [] },
  { slug: 'prague-vienna', fromLabel: 'Prague', toLabel: 'Vienna', distanceKm: 330, eClassEur: 455, sClassEur: 620, vClassEur: 560, displayOrder: 2, placeIds: [] },
]

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

afterEach(() => { global.fetch = originalFetch })

describe('RoutesTable', () => {
  it('renders collapsed by default (no rows visible)', () => {
    render(<RoutesTable initialRoutes={fixtures} />)
    expect(screen.getByText(/intercity routes/i)).toBeTruthy()
    expect(screen.queryByText('prague-brno')).toBeNull()
  })

  it('expands when header is clicked', () => {
    render(<RoutesTable initialRoutes={fixtures} />)
    fireEvent.click(screen.getByText(/intercity routes/i))
    expect(screen.getByText('prague-brno')).toBeTruthy()
    expect(screen.getByText('prague-vienna')).toBeTruthy()
  })

  it('does not show Save button on clean rows', () => {
    render(<RoutesTable initialRoutes={fixtures} />)
    fireEvent.click(screen.getByText(/intercity routes/i))
    // No Save button present when no row is dirty
    expect(screen.queryAllByRole('button', { name: /save/i })).toHaveLength(0)
  })

  it('shows Save button when a price input is modified (dirty row)', () => {
    render(<RoutesTable initialRoutes={fixtures} />)
    fireEvent.click(screen.getByText(/intercity routes/i))
    const eInputs = screen.getAllByLabelText(/e-class price/i)
    fireEvent.change(eInputs[0], { target: { value: '460' } })
    expect(screen.getAllByRole('button', { name: /save/i })).toHaveLength(1)
  })

  it('PUTs to /api/admin/route-prices/[slug] on Save', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true, slug: 'prague-brno' })
    })
    render(<RoutesTable initialRoutes={fixtures} />)
    fireEvent.click(screen.getByText(/intercity routes/i))
    const eInputs = screen.getAllByLabelText(/e-class price/i)
    fireEvent.change(eInputs[0], { target: { value: '460' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/route-prices/prague-brno',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"e_class_eur":460'),
        })
      )
    })
  })
})
