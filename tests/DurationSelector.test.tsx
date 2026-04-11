import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DurationSelector from '@/components/booking/DurationSelector'

// Mock the Zustand store. Preserve getState() so the component can read fresh state.
const setHoursMock = vi.fn()
let storeState = { hours: 2, setHours: setHoursMock }

vi.mock('@/lib/booking-store', () => ({
  useBookingStore: Object.assign(
    (selector: (s: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  setHoursMock.mockReset()
  storeState = { hours: 2, setHours: setHoursMock }
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ min: 2, max: 8 }),
    } as Response)
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DurationSelector', () => {
  it('renders a <select> element on mount', () => {
    render(<DurationSelector />)
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('renders fallback options [2..8] before fetch resolves', () => {
    render(<DurationSelector />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.options.length).toBe(7) // 2,3,4,5,6,7,8
    expect(select.options[0].value).toBe('2')
    expect(select.options[6].value).toBe('8')
  })

  it('replaces options with fetched range {min:3, max:6}', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ min: 3, max: 6 }),
      } as Response)
    )
    render(<DurationSelector />)
    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.options.length).toBe(4)
      expect(select.options[0].value).toBe('3')
      expect(select.options[3].value).toBe('6')
    })
  })

  it('replaces options with fetched range {min:1, max:12}', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ min: 1, max: 12 }),
      } as Response)
    )
    render(<DurationSelector />)
    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.options.length).toBe(12)
    })
  })

  it('calls setHours when user selects a different option', () => {
    render(<DurationSelector />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '5' } })
    expect(setHoursMock).toHaveBeenCalledWith(5)
  })

  it('clamps store.hours to min after fetch when current value is out of range', async () => {
    storeState = { hours: 10, setHours: setHoursMock }
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ min: 2, max: 8 }),
      } as Response)
    )
    render(<DurationSelector />)
    await waitFor(() => {
      expect(setHoursMock).toHaveBeenCalledWith(2)
      expect(setHoursMock).toHaveBeenCalledTimes(1)
    })
  })

  it('does NOT call setHours after fetch when current value is in range', async () => {
    storeState = { hours: 4, setHours: setHoursMock }
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ min: 2, max: 8 }),
      } as Response)
    )
    render(<DurationSelector />)
    // Give effect a microtask tick
    await new Promise((r) => setTimeout(r, 0))
    expect(setHoursMock).not.toHaveBeenCalled()
  })

  it('keeps fallback [2..8] and does not clamp when fetch errors', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')))
    storeState = { hours: 6, setHours: setHoursMock }
    render(<DurationSelector />)
    await new Promise((r) => setTimeout(r, 0))
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.options.length).toBe(7) // 2..8 fallback
    expect(setHoursMock).not.toHaveBeenCalled() // 6 is within [2..8] fallback range
  })
})
