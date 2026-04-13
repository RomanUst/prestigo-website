import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DayCard, { createDay, type Day } from '@/components/booking/DayCard'
import type { PlaceResult, Stop } from '@/types/booking'

vi.mock('@/components/booking/AddressInput', () => ({
  __esModule: true,
  default: ({ label, value, onSelect, onClear, ariaLabel }: { label: string; value: PlaceResult | null; onSelect: (p: PlaceResult) => void; onClear: () => void; ariaLabel: string }) => (
    <div>
      <label>
        {label}
        <input
          aria-label={ariaLabel}
          defaultValue={value?.address ?? ''}
          onChange={(e) => {
            if (e.target.value === '') onClear()
            else onSelect({ address: e.target.value, placeId: 'pid', lat: 1, lng: 2 })
          }}
        />
      </label>
    </div>
  ),
}))

vi.mock('@/components/booking/StopList', () => ({
  __esModule: true,
  default: ({ stops, onAdd, onRemove }: { stops: Stop[]; onAdd: () => void; onRemove: (id: string) => void; onUpdate: (id: string, place: PlaceResult | null) => void }) => (
    <div data-testid="stop-list">
      <span data-testid="stop-count">{stops.length}</span>
      <button type="button" onClick={onAdd}>add-stop</button>
      {stops.map((s) => (
        <button key={s.id} type="button" onClick={() => onRemove(s.id)}>remove-{s.id}</button>
      ))}
    </div>
  ),
}))

function renderCard(overrides: Partial<Day> = {}, canRemove = true) {
  const day: Day = { ...createDay(2), ...overrides }
  const onChange = vi.fn()
  const onRemove = vi.fn()
  render(
    <DayCard
      day={day}
      index={0}
      hourlyRange={{ min: 2, max: 8 }}
      canRemove={canRemove}
      onChange={onChange}
      onRemove={onRemove}
    />
  )
  return { day, onChange, onRemove }
}

describe('DayCard (MULTIDAY-03)', () => {
  it('renders TRANSFER and HOURLY tab buttons with TRANSFER active by default', () => {
    renderCard()
    const transferTab = screen.getByRole('tab', { name: 'TRANSFER' })
    const hourlyTab = screen.getByRole('tab', { name: 'HOURLY' })
    expect(transferTab).toHaveAttribute('aria-selected', 'true')
    expect(hourlyTab).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking HOURLY fires onChange with type = "hourly"', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCard()
    await user.click(screen.getByRole('tab', { name: 'HOURLY' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].type).toBe('hourly')
  })

  it('transfer day renders From, To, and StopList', () => {
    renderCard({ type: 'transfer' })
    expect(screen.getByLabelText('Day 1 from address')).toBeInTheDocument()
    expect(screen.getByLabelText('Day 1 to address')).toBeInTheDocument()
    expect(screen.getByTestId('stop-list')).toBeInTheDocument()
  })

  it('hourly day renders base city and hours <select>', () => {
    renderCard({ type: 'hourly' })
    expect(screen.getByLabelText('Day 1 pickup location')).toBeInTheDocument()
    expect(screen.getByLabelText('Day 1 hours')).toBeInTheDocument()
  })

  it('hours <select> has options from min to max inclusive', () => {
    renderCard({ type: 'hourly' })
    const select = screen.getByLabelText('Day 1 hours') as HTMLSelectElement
    // min=2, max=8 → 7 options
    expect(select.querySelectorAll('option')).toHaveLength(7)
    expect(select.querySelectorAll('option')[0].value).toBe('2')
    expect(select.querySelectorAll('option')[6].value).toBe('8')
  })

  it('changing hours select fires onChange with new hours', () => {
    const { onChange } = renderCard({ type: 'hourly' })
    const select = screen.getByLabelText('Day 1 hours')
    fireEvent.change(select, { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].hourly.hours).toBe(5)
  })

  it('typing in From address fires onChange with transfer.from set', () => {
    const { onChange } = renderCard({ type: 'transfer' })
    fireEvent.change(screen.getByLabelText('Day 1 from address'), { target: { value: 'Prague' } })
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls[0][0]
    expect(next.transfer.from?.address).toBe('Prague')
    expect(next.transfer.to).toBe(null)
  })

  it('clicking add-stop adds a new stop to transfer.stops only', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCard({ type: 'transfer' })
    await user.click(screen.getByText('add-stop'))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0]
    expect(next.transfer.stops).toHaveLength(1)
    expect(next.hourly.hours).toBe(2)  // unchanged
  })

  it('remove-day button renders when canRemove=true and fires onRemove(day.id)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onRemove = vi.fn()
    const day = createDay(2)
    render(
      <DayCard day={day} index={2} hourlyRange={{ min: 2, max: 8 }} canRemove={true} onChange={onChange} onRemove={onRemove} />
    )
    await user.click(screen.getByRole('button', { name: 'Remove day 3' }))
    expect(onRemove).toHaveBeenCalledWith(day.id)
  })

  it('remove-day button is hidden when canRemove=false', () => {
    renderCard({}, false)
    expect(screen.queryByRole('button', { name: 'Remove day 1' })).not.toBeInTheDocument()
  })
})
