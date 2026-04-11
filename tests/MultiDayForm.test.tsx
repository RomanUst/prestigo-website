import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MultiDayForm from '@/components/booking/MultiDayForm'
import type { DayCardProps } from '@/components/booking/DayCard'

// Lightweight DayCard stub: exposes day.id and calls onChange when a button is clicked.
vi.mock('@/components/booking/DayCard', async () => {
  const actual = await vi.importActual<typeof import('@/components/booking/DayCard')>(
    '@/components/booking/DayCard'
  )
  return {
    __esModule: true,
    createDay: actual.createDay,
    default: ({ day, index, hourlyRange, canRemove, onChange, onRemove }: DayCardProps) => (
      <div data-testid={`day-${index}`} data-day-id={day.id}>
        <span data-testid={`day-${index}-type`}>{day.type}</span>
        <span data-testid={`day-${index}-hourly-min`}>{hourlyRange.min}</span>
        <span data-testid={`day-${index}-hourly-max`}>{hourlyRange.max}</span>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...day,
              transfer: {
                from: { address: 'Prague', placeId: 'p1', lat: 50, lng: 14 },
                to: { address: 'Vienna', placeId: 'p2', lat: 48, lng: 16 },
                stops: [],
              },
            })
          }
        >
          fill-transfer-{index}
        </button>
        {canRemove && (
          <button type="button" onClick={() => onRemove(day.id)}>
            remove-{index}
          </button>
        )}
      </div>
    ),
  }
})

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/hourly-config') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ min: 2, max: 8 }),
      })
    }
    if (url === '/api/submit-multiday-quote') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ quoteReference: 'MQ-20260411-ABC123' }),
      })
    }
    return Promise.reject(new Error(`Unexpected fetch ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function fillPassenger() {
  fireEvent.change(screen.getByRole('textbox', { name: /First name/i }), { target: { value: 'Ada' } })
  fireEvent.change(screen.getByRole('textbox', { name: /Last name/i }), { target: { value: 'Lovelace' } })
  fireEvent.change(screen.getByRole('textbox', { name: /Email/i }), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByRole('textbox', { name: /Phone/i }), { target: { value: '+420123456789' } })
}

describe('MultiDayForm (MULTIDAY-03, MULTIDAY-04, MULTIDAY-05 client)', () => {
  it('renders exactly one Transfer DayCard by default', async () => {
    render(<MultiDayForm />)
    expect(screen.getByTestId('day-0')).toBeInTheDocument()
    expect(screen.queryByTestId('day-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('day-0-type')).toHaveTextContent('transfer')
  })

  it('fetches /api/hourly-config exactly once on mount', async () => {
    render(<MultiDayForm />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/hourly-config')
    })
    const hourlyCalls = fetchMock.mock.calls.filter((c) => c[0] === '/api/hourly-config')
    expect(hourlyCalls).toHaveLength(1)
  })

  it('clicking "Add day" appends a new day with a unique id', async () => {
    const user = userEvent.setup()
    render(<MultiDayForm />)
    const firstId = screen.getByTestId('day-0').getAttribute('data-day-id')
    await user.click(screen.getByRole('button', { name: /\+ Add day/i }))
    expect(screen.getByTestId('day-1')).toBeInTheDocument()
    const secondId = screen.getByTestId('day-1').getAttribute('data-day-id')
    expect(secondId).toBeTruthy()
    expect(secondId).not.toBe(firstId)
  })

  it('clicking remove on day 2 leaves days 1 and 3 intact', async () => {
    const user = userEvent.setup()
    render(<MultiDayForm />)
    await user.click(screen.getByRole('button', { name: /\+ Add day/i }))
    await user.click(screen.getByRole('button', { name: /\+ Add day/i }))
    const id0 = screen.getByTestId('day-0').getAttribute('data-day-id')
    const id2 = screen.getByTestId('day-2').getAttribute('data-day-id')
    await user.click(screen.getByRole('button', { name: 'remove-1' }))
    // After removal, day-0 stays and day-1 is what was day-2
    expect(screen.getByTestId('day-0').getAttribute('data-day-id')).toBe(id0)
    expect(screen.getByTestId('day-1').getAttribute('data-day-id')).toBe(id2)
    expect(screen.queryByTestId('day-2')).not.toBeInTheDocument()
  })

  it('allows adding 10 days (no hard maximum)', async () => {
    const user = userEvent.setup()
    render(<MultiDayForm />)
    for (let i = 0; i < 9; i++) {
      await user.click(screen.getByRole('button', { name: /\+ Add day/i }))
    }
    expect(screen.getByTestId('day-9')).toBeInTheDocument()
  })

  it('renders passenger fields below the day list', () => {
    render(<MultiDayForm />)
    expect(screen.getByRole('textbox', { name: /First name/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Last name/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Email/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Phone/i })).toBeInTheDocument()
  })

  it('submit with valid payload POSTs to /api/submit-multiday-quote with expected shape', async () => {
    const user = userEvent.setup()
    render(<MultiDayForm />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/hourly-config'))
    await user.click(screen.getByRole('button', { name: /fill-transfer-0/ }))
    fillPassenger()
    await user.click(screen.getByRole('button', { name: /Request quote/i }))
    await waitFor(() => {
      const submitCall = fetchMock.mock.calls.find((c) => c[0] === '/api/submit-multiday-quote')
      expect(submitCall).toBeDefined()
      const body = JSON.parse(submitCall![1].body as string)
      expect(body.days).toHaveLength(1)
      expect(body.days[0]).toMatchObject({ type: 'transfer', from: 'Prague', to: 'Vienna' })
      expect(body.passengerDetails).toMatchObject({ firstName: 'Ada', email: 'ada@example.com' })
    })
  })

  it('shows inline error when Transfer day has no from address', async () => {
    const user = userEvent.setup()
    render(<MultiDayForm />)
    fillPassenger()
    await user.click(screen.getByRole('button', { name: /Request quote/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Day 1.*departure address/i)
    expect(
      fetchMock.mock.calls.some((c) => c[0] === '/api/submit-multiday-quote')
    ).toBe(false)
  })

  it('on 200 response replaces form with confirmation panel showing quoteReference', async () => {
    const user = userEvent.setup()
    render(<MultiDayForm />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/hourly-config'))
    await user.click(screen.getByRole('button', { name: /fill-transfer-0/ }))
    fillPassenger()
    await user.click(screen.getByRole('button', { name: /Request quote/i }))
    await waitFor(() => {
      expect(screen.getByTestId('multiday-confirmation')).toBeInTheDocument()
    })
    expect(screen.getByTestId('multiday-confirmation')).toHaveTextContent('MQ-20260411-ABC123')
    expect(screen.getByTestId('multiday-confirmation')).toHaveTextContent(/within 24 hours/i)
  })

  it('on 429 response shows "Too many requests" and keeps the form visible', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/hourly-config') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ min: 2, max: 8 }) })
      }
      return Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Too many requests' }),
      })
    })
    const user = userEvent.setup()
    render(<MultiDayForm />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/hourly-config'))
    await user.click(screen.getByRole('button', { name: /fill-transfer-0/ }))
    fillPassenger()
    await user.click(screen.getByRole('button', { name: /Request quote/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too many requests/i)
    })
    expect(screen.queryByTestId('multiday-confirmation')).not.toBeInTheDocument()
  })
})
