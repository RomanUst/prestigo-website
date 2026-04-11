import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import StopList from '@/components/booking/StopList'
import type { Stop } from '@/types/booking'

// Mock AddressInput inside StopItem — StopItem is still imported for real
vi.mock('@/components/booking/AddressInput', () => ({
  default: (props: {
    value: unknown
    onSelect: (p: { address: string; placeId: string; lat: number; lng: number }) => void
    onClear: () => void
  }) => (
    <button
      type="button"
      data-testid="ai-select"
      onClick={() =>
        props.onSelect({ address: 'Test Addr', placeId: 'pid', lat: 50, lng: 14 })
      }
    >
      SELECT
    </button>
  ),
}))

function stops(n: number): Stop[] {
  return Array.from({ length: n }, (_, i) => ({ id: `stop-${i}`, place: null }))
}

describe('StopList', () => {
  const onAdd = vi.fn()
  const onRemove = vi.fn()
  const onUpdate = vi.fn()

  beforeEach(() => {
    onAdd.mockReset()
    onRemove.mockReset()
    onUpdate.mockReset()
  })

  it('renders no stop rows when stops is empty but shows the Add Stop button', () => {
    render(<StopList stops={[]} onAdd={onAdd} onRemove={onRemove} onUpdate={onUpdate} />)
    expect(screen.queryAllByLabelText('Remove stop')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /add stop/i })).toBeTruthy()
  })

  it('renders N StopItem rows when stops has N items', () => {
    render(<StopList stops={stops(3)} onAdd={onAdd} onRemove={onRemove} onUpdate={onUpdate} />)
    expect(screen.getAllByLabelText('Remove stop')).toHaveLength(3)
    expect(screen.getByText(/STOP 1/)).toBeTruthy()
    expect(screen.getByText(/STOP 2/)).toBeTruthy()
    expect(screen.getByText(/STOP 3/)).toBeTruthy()
  })

  it('clicking Add Stop calls onAdd once', () => {
    render(<StopList stops={stops(2)} onAdd={onAdd} onRemove={onRemove} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('hides Add Stop button when stops.length === default maxStops (5)', () => {
    render(<StopList stops={stops(5)} onAdd={onAdd} onRemove={onRemove} onUpdate={onUpdate} />)
    expect(screen.queryByRole('button', { name: /add stop/i })).toBeNull()
  })

  it('hides Add Stop button when stops.length >= custom maxStops', () => {
    render(<StopList stops={stops(3)} onAdd={onAdd} onRemove={onRemove} onUpdate={onUpdate} maxStops={3} />)
    expect(screen.queryByRole('button', { name: /add stop/i })).toBeNull()
  })

  it('shows Add Stop button when stops.length < maxStops', () => {
    render(<StopList stops={stops(2)} onAdd={onAdd} onRemove={onRemove} onUpdate={onUpdate} maxStops={5} />)
    expect(screen.getByRole('button', { name: /add stop/i })).toBeTruthy()
  })

  it('forwards onRemove from StopItem to parent with the stop id', () => {
    render(<StopList stops={stops(2)} onAdd={onAdd} onRemove={onRemove} onUpdate={onUpdate} />)
    const removeButtons = screen.getAllByLabelText('Remove stop')
    fireEvent.click(removeButtons[1])
    expect(onRemove).toHaveBeenCalledWith('stop-1')
  })

  it('forwards onUpdate from StopItem to parent with id + place', () => {
    render(<StopList stops={stops(1)} onAdd={onAdd} onRemove={onRemove} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByTestId('ai-select'))
    expect(onUpdate).toHaveBeenCalledWith('stop-0', {
      address: 'Test Addr',
      placeId: 'pid',
      lat: 50,
      lng: 14,
    })
  })

  it('StopList source file has ZERO imports of useBookingStore (STOP-02 reuse guarantee)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/booking/StopList.tsx'),
      'utf8'
    )
    expect(src).not.toMatch(/useBookingStore/)
    expect(src).not.toMatch(/@\/lib\/booking-store/)
  })
})
