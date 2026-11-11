import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import StopItem from '@/components/booking/StopItem'
import type { Stop, PlaceResult } from '@/types/booking'

// Wait options depend on /api/waiting-config; default = business offered, loaded.
const waitingConfig = vi.hoisted(() => ({
  value: { offeredClasses: ['business'] as string[], loaded: true },
}))
vi.mock('@/components/booking/useWaitingConfig', () => ({
  useWaitingConfig: () => waitingConfig.value,
}))

// Mock AddressInput to avoid loading Google Maps in jsdom
vi.mock('@/components/booking/AddressInput', () => ({
  default: (props: {
    label: string
    placeholder: string
    value: PlaceResult | null
    onSelect: (place: PlaceResult) => void
    onClear: () => void
    ariaLabel: string
  }) => (
    <div data-testid="address-input-mock">
      <span data-testid="ai-label">{props.label}</span>
      <span data-testid="ai-placeholder">{props.placeholder}</span>
      <span data-testid="ai-value">{props.value?.address ?? ''}</span>
      <button
        type="button"
        onClick={() =>
          props.onSelect({ address: 'Prague 1', placeId: 'pid-1', lat: 50.08, lng: 14.42 })
        }
      >
        TEST_SELECT_PLACE
      </button>
      <button type="button" onClick={props.onClear}>
        TEST_CLEAR_PLACE
      </button>
    </div>
  ),
}))

function makeStop(overrides: Partial<Stop> = {}): Stop {
  return { id: 'stop-1', place: null, ...overrides }
}

describe('StopItem', () => {
  const onRemove = vi.fn()
  const onUpdate = vi.fn()
  const onWaitChange = vi.fn()

  beforeEach(() => {
    onRemove.mockReset()
    onUpdate.mockReset()
    onWaitChange.mockReset()
    waitingConfig.value = { offeredClasses: ['business'], loaded: true }
  })

  it('renders label "STOP 1" when index=0', () => {
    render(<StopItem stop={makeStop()} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    expect(screen.getByText(/STOP 1/)).toBeTruthy()
  })

  it('renders label "STOP 3" when index=2', () => {
    render(<StopItem stop={makeStop()} index={2} total={3} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    expect(screen.getByText(/STOP 3/)).toBeTruthy()
  })

  it('renders the AddressInput mock with the expected placeholder', () => {
    render(<StopItem stop={makeStop()} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    expect(screen.getByTestId('ai-placeholder').textContent).toBe('Enter stop address')
  })

  it('renders a wait time <select> with options 0..120 step 15', () => {
    render(<StopItem stop={makeStop()} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    const select = screen.getByLabelText('Wait time') as HTMLSelectElement
    expect(select.options.length).toBe(9)
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(['0', '15', '30', '45', '60', '75', '90', '105', '120'])
  })

  it('default wait time is 0 with label "No wait"', () => {
    render(<StopItem stop={makeStop()} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    const select = screen.getByLabelText('Wait time') as HTMLSelectElement
    expect(select.value).toBe('0')
    expect(select.options[0].textContent).toMatch(/No wait/i)
    expect(select.options[1].textContent).toMatch(/^15 min/)
    expect(select.options[8].textContent).toMatch(/^120 min/)
  })

  it('remove button has aria-label "Remove stop" and calls onRemove(id)', () => {
    render(<StopItem stop={makeStop({ id: 'stop-xyz' })} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    const btn = screen.getByLabelText('Remove stop')
    fireEvent.click(btn)
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith('stop-xyz')
  })

  it('passes stop.place through to AddressInput value prop', () => {
    const place: PlaceResult = { address: 'Charles Bridge', placeId: 'pid', lat: 50.086, lng: 14.411 }
    render(<StopItem stop={makeStop({ place })} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    expect(screen.getByTestId('ai-value').textContent).toBe('Charles Bridge')
  })

  it('calls onUpdate(id, place) when AddressInput selects a place', () => {
    render(<StopItem stop={makeStop({ id: 's1' })} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    fireEvent.click(screen.getByText('TEST_SELECT_PLACE'))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('s1', {
      address: 'Prague 1',
      placeId: 'pid-1',
      lat: 50.08,
      lng: 14.42,
    })
  })

  it('calls onUpdate(id, null) when AddressInput clears', () => {
    render(<StopItem stop={makeStop({ id: 's1' })} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    fireEvent.click(screen.getByText('TEST_CLEAR_PLACE'))
    expect(onUpdate).toHaveBeenCalledWith('s1', null)
  })

  it('select value is stop.waitMinutes (0 when absent)', () => {
    const { rerender } = render(
      <StopItem stop={makeStop()} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />,
    )
    expect((screen.getByLabelText('Wait time') as HTMLSelectElement).value).toBe('0')
    rerender(
      <StopItem stop={makeStop({ waitMinutes: 45 })} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />,
    )
    expect((screen.getByLabelText('Wait time') as HTMLSelectElement).value).toBe('45')
  })

  it('changing wait time calls onWaitChange(id, minutes) and never onUpdate (D-06: stored, not local)', () => {
    render(<StopItem stop={makeStop({ id: 's1' })} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
    const select = screen.getByLabelText('Wait time') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '45' } })
    expect(onWaitChange).toHaveBeenCalledWith('s1', 45)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  describe('D-05: options follow what admin offers', () => {
    function values() {
      const select = screen.getByLabelText('Wait time') as HTMLSelectElement
      return Array.from(select.options).map((o) => o.value)
    }

    it('with a class offered shows 0..120 and the free-time hint', () => {
      render(<StopItem stop={makeStop()} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
      expect(values()).toEqual(['0', '15', '30', '45', '60', '75', '90', '105', '120'])
      expect(screen.getByText('First 15 min free, then charged per started 15 min')).toBeTruthy()
      expect(screen.queryByText('Paid waiting is not available right now')).toBeNull()
    })

    it('with no class offered shows only 0 and 15 and the unavailable hint', () => {
      waitingConfig.value = { offeredClasses: [], loaded: true }
      render(<StopItem stop={makeStop()} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
      expect(values()).toEqual(['0', '15'])
      expect(screen.getByText('Paid waiting is not available right now')).toBeTruthy()
      expect(screen.queryByText('First 15 min free, then charged per started 15 min')).toBeNull()
    })

    it('while loading shows all options', () => {
      waitingConfig.value = { offeredClasses: [], loaded: false }
      render(<StopItem stop={makeStop()} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
      expect(values()).toHaveLength(9)
      expect(onWaitChange).not.toHaveBeenCalled()
    })

    it('resets a stored wait above 15 to 15 when paid waiting is not offered', () => {
      waitingConfig.value = { offeredClasses: [], loaded: true }
      render(<StopItem stop={makeStop({ id: 's9', waitMinutes: 60 })} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
      expect(onWaitChange).toHaveBeenCalledWith('s9', 15)
    })

    it('keeps a stored wait above 15 when a class is offered', () => {
      render(<StopItem stop={makeStop({ waitMinutes: 60 })} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} onWaitChange={onWaitChange} />)
      expect(onWaitChange).not.toHaveBeenCalled()
    })

    it('shows no wait selector when onWaitChange is not passed (multi-day planner)', () => {
      render(<StopItem stop={makeStop()} index={0} total={1} onRemove={onRemove} onUpdate={onUpdate} />)
      expect(screen.queryByLabelText('Wait time')).toBeNull()
    })
  })
})

describe('StopItem reorder buttons (STOP-01)', () => {
  const onMove = vi.fn()
  const base = { onRemove: vi.fn(), onUpdate: vi.fn(), onWaitChange: vi.fn(), onMove }

  beforeEach(() => {
    onMove.mockReset()
  })

  it('renders "Move stop up" and "Move stop down" and calls onMove(id, -1 / 1)', () => {
    render(<StopItem stop={makeStop({ id: 'mid' })} index={1} total={3} {...base} />)
    fireEvent.click(screen.getByLabelText('Move stop up'))
    fireEvent.click(screen.getByLabelText('Move stop down'))
    expect(onMove).toHaveBeenNthCalledWith(1, 'mid', -1)
    expect(onMove).toHaveBeenNthCalledWith(2, 'mid', 1)
  })

  it('up is disabled on the first stop, down on the last', () => {
    const { unmount } = render(<StopItem stop={makeStop()} index={0} total={3} {...base} />)
    expect((screen.getByLabelText('Move stop up') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Move stop down') as HTMLButtonElement).disabled).toBe(false)
    unmount()
    render(<StopItem stop={makeStop()} index={2} total={3} {...base} />)
    expect((screen.getByLabelText('Move stop up') as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByLabelText('Move stop down') as HTMLButtonElement).disabled).toBe(true)
  })

  it('move buttons have 44px touch targets', () => {
    render(<StopItem stop={makeStop()} index={1} total={3} {...base} />)
    const btn = screen.getByLabelText('Move stop up') as HTMLButtonElement
    expect(btn.style.width).toBe('44px')
    expect(btn.style.height).toBe('44px')
  })

  it('shows no move buttons when onMove is not passed', () => {
    render(<StopItem stop={makeStop()} index={1} total={3} onRemove={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.queryByLabelText('Move stop up')).toBeNull()
    expect(screen.queryByLabelText('Move stop down')).toBeNull()
  })
})
