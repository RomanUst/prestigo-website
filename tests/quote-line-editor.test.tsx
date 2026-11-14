import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QuoteLineEditor } from '@/components/admin/quotes/QuoteLineEditor'
import {
  emptyLine,
  lineToPayload,
  lineToPriceRequest,
  type QuoteLineDraft,
} from '@/components/admin/quotes/quoteDraft'
import { formatMinor } from '@/lib/payments/money'
import { MAX_STOPS } from '@/lib/stops'

// AddressInput loads Google Places. Replace it with a button that picks a fixed place per field, plus a line that shows
// the chosen address, so the editor can be driven without the Maps script.
const PLACES: Record<string, { address: string; placeId: string; lat: number; lng: number }> = {
  'Pickup address': { address: 'Prague Airport', placeId: 'p1', lat: 50.1, lng: 14.26 },
  'Destination address': { address: 'Vienna Hotel', placeId: 'p2', lat: 48.2, lng: 16.37 },
}
vi.mock('@/components/booking/AddressInput', () => ({
  default: ({
    label,
    value,
    onSelect,
    onClear,
  }: {
    label: string
    value: { address: string } | null
    onSelect: (p: { address: string; placeId: string; lat: number; lng: number }) => void
    onClear: () => void
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onSelect(PLACES[label] ?? { address: `Stop place for ${label}`, placeId: 'ps', lat: 49.5, lng: 15.5 })
        }
      >
        {`pick ${label}`}
      </button>
      <button type="button" onClick={onClear}>{`clear ${label}`}</button>
      {value ? <span>{`${label} = ${value.address}`}</span> : null}
    </div>
  ),
}))

interface HarnessProps {
  initial?: QuoteLineDraft
  currency?: 'eur' | 'czk'
  readOnly?: boolean
  index?: number
  total?: number
  spy?: (line: QuoteLineDraft) => void
  onRemove?: () => void
  onMove?: (direction: -1 | 1) => void
}

function Harness({ initial, currency = 'eur', readOnly = false, index = 0, total = 1, spy, onRemove, onMove }: HarnessProps) {
  const [line, setLine] = useState<QuoteLineDraft>(initial ?? emptyLine())
  return (
    <QuoteLineEditor
      line={line}
      index={index}
      total={total}
      currency={currency}
      readOnly={readOnly}
      onChange={(next) => {
        spy?.(next)
        setLine(next)
      }}
      onRemove={onRemove ?? (() => {})}
      onMove={onMove ?? (() => {})}
    />
  )
}

function fillBasics() {
  fireEvent.change(screen.getByLabelText('Pickup date'), { target: { value: '2027-03-10' } })
  fireEvent.change(screen.getByLabelText('Pickup time'), { target: { value: '09:30' } })
  fireEvent.click(screen.getByText('pick Pickup address'))
  fireEvent.click(screen.getByText('pick Destination address'))
}

function amountInput(): HTMLInputElement {
  return screen.getByLabelText(/^Amount/) as HTMLInputElement
}

describe('QuoteLineEditor: a transfer with a stop, a wait and a suggested price (QUOTE-01, D-04)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ suggestedMinor: 32400, distanceKm: 130, waitingUnavailable: false }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('carries origin, destination and one stop with a 30 minute wait through onChange', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
    fireEvent.click(screen.getByText('pick Stop 1 address'))
    fireEvent.change(screen.getByLabelText('Stop 1 wait'), { target: { value: '30' } })

    const last = spy.mock.calls.at(-1)?.[0] as QuoteLineDraft
    expect(last.origin).toMatchObject({ address: 'Prague Airport', lat: 50.1, lng: 14.26 })
    expect(last.destination).toMatchObject({ address: 'Vienna Hotel' })
    expect(last.stops).toHaveLength(1)
    expect(last.stops[0]).toMatchObject({ wait_minutes: 30, address: 'Stop place for Stop 1 address' })
  })

  it('Suggest price posts the line and the currency, fills an empty amount and shows the suggestion and the distance', async () => {
    render(<Harness />)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
    fireEvent.click(screen.getByText('pick Stop 1 address'))
    fireEvent.change(screen.getByLabelText('Stop 1 wait'), { target: { value: '30' } })

    expect(amountInput().value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest price' }))

    await waitFor(() => expect(amountInput().value).toBe('324.00'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }]
    expect(url).toBe('/api/admin/quotes/price')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.currency).toBe('eur')
    expect(body.line.stops).toEqual([
      { address: 'Stop place for Stop 1 address', lat: 49.5, lng: 15.5, wait_minutes: 30 },
    ])
    // The request carries no amount and no distance: the server computes both.
    expect(body.line).not.toHaveProperty('amount_minor')
    expect(body.line).not.toHaveProperty('distance_km')
    expect(body.line).not.toHaveProperty('distanceKm')

    const suggestion = screen.getByTestId('quote-line-suggestion')
    expect(suggestion.textContent).toContain(formatMinor(32400, 'eur'))
    expect(suggestion.textContent).toContain('130 km')
    expect(screen.queryByText('Manual price')).toBeNull()
  })

  it('keeps an amount the operator typed over the suggestion and marks it Manual price', async () => {
    render(<Harness />)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest price' }))
    await waitFor(() => expect(amountInput().value).toBe('324.00'))

    fireEvent.change(amountInput(), { target: { value: '300.00' } })
    expect(amountInput().value).toBe('300.00')
    expect(screen.getByText('Manual price')).toBeTruthy()

    // Typing the suggested amount back removes the mark.
    fireEvent.change(amountInput(), { target: { value: '324.00' } })
    expect(screen.queryByText('Manual price')).toBeNull()
  })

  it('does not overwrite a typed amount when Suggest price is pressed again', async () => {
    render(<Harness />)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest price' }))
    await waitFor(() => expect(amountInput().value).toBe('324.00'))
    fireEvent.change(amountInput(), { target: { value: '300.00' } })

    fireEvent.click(screen.getByRole('button', { name: 'Suggest price' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId('quote-line-suggestion')).toBeTruthy())
    expect(amountInput().value).toBe('300.00')
    expect(screen.getByText('Manual price')).toBeTruthy()
  })

  it('shows a plain message and keeps the amount when the price route is unavailable', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'pricing_unavailable' }) })
    render(<Harness />)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest price' }))
    await screen.findByText(/Could not suggest a price/)
    expect(amountInput().value).toBe('')
  })

  it('does not offer Suggest price until the places and the date and time are set', () => {
    render(<Harness />)
    expect((screen.getByRole('button', { name: 'Suggest price' }) as HTMLButtonElement).disabled).toBe(true)
    fillBasics()
    expect((screen.getByRole('button', { name: 'Suggest price' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('drops a stale suggestion when a price input (a stop) changes', async () => {
    render(<Harness />)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest price' }))
    await waitFor(() => expect(screen.getByTestId('quote-line-suggestion')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
    expect(screen.queryByTestId('quote-line-suggestion')).toBeNull()
    // The amount the operator has is kept.
    expect(amountInput().value).toBe('324.00')
  })

  it('offers waits of 0 to 120 minutes in steps of 15 only, and no sixth stop', () => {
    render(<Harness />)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
    const select = screen.getByLabelText('Stop 1 wait') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => Number(o.value))).toEqual([0, 15, 30, 45, 60, 75, 90, 105, 120])
    // The free 15 minutes are marked in the option text.
    expect(within(select).getByRole('option', { name: /15 min.*free/i })).toBeTruthy()

    for (let i = 1; i < MAX_STOPS; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
    expect(screen.getAllByLabelText(/^Stop \d+ wait$/)).toHaveLength(MAX_STOPS)
    expect((screen.getByRole('button', { name: 'Add stop' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('removes a stop and renumbers the rest', () => {
    render(<Harness />)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
    fireEvent.change(screen.getByLabelText('Stop 2 wait'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove stop 1' }))
    expect(screen.getAllByLabelText(/^Stop \d+ wait$/)).toHaveLength(1)
    expect((screen.getByLabelText('Stop 1 wait') as HTMLSelectElement).value).toBe('60')
  })
})

describe('quoteDraft payload mappers', () => {
  function pricedLine(): QuoteLineDraft {
    return {
      ...emptyLine(),
      pickup_date: '2027-03-10',
      pickup_time: '09:30',
      origin: { address: 'Prague Airport', lat: 50.1, lng: 14.26 },
      destination: { address: 'Vienna Hotel', lat: 48.2, lng: 16.37 },
      stops: [{ key: 's1', address: 'Brno', lat: 49.19, lng: 16.6, wait_minutes: 30 }],
      amountInput: '300.00',
      suggestedMinor: 32400,
      distanceKm: 130,
    }
  }

  it('lineToPayload turns the typed amount into minor units, keeps stop waits and has no distance key', () => {
    const payload = lineToPayload(pricedLine(), 'eur')
    expect(payload.amount_minor).toBe(30000)
    expect(payload.stops).toEqual([{ address: 'Brno', lat: 49.19, lng: 16.6, wait_minutes: 30 }])
    const keys = Object.keys(payload)
    expect(keys).not.toContain('distance_km')
    expect(keys).not.toContain('distanceKm')
    expect(keys).not.toContain('suggestedMinor')
    expect(keys).not.toContain('suggested_amount_minor')
  })

  it('lineToPayload sends 0 for an empty or invalid amount so the server refuses it', () => {
    expect(lineToPayload({ ...pricedLine(), amountInput: '' }, 'eur').amount_minor).toBe(0)
    expect(lineToPayload({ ...pricedLine(), amountInput: '12.345' }, 'eur').amount_minor).toBe(0)
  })

  it('lineToPriceRequest carries no amount', () => {
    expect(lineToPriceRequest(pricedLine())).not.toHaveProperty('amount_minor')
  })
})

describe('QuoteLineEditor: trip types (QUOTE-01)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function chooseTripType(value: string) {
    fireEvent.change(screen.getByLabelText('Trip type'), { target: { value } })
  }

  it('transfer shows destination and stops, no hours and no return date', () => {
    render(<Harness />)
    expect(screen.getByText('pick Destination address')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add stop' })).toBeTruthy()
    expect(screen.queryByLabelText('Hours')).toBeNull()
    expect(screen.queryByLabelText('Return date')).toBeNull()
  })

  it('hourly shows hours 1 to 24 and hides destination and stops, clearing them', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
    chooseTripType('hourly')

    expect(screen.queryByText('pick Destination address')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add stop' })).toBeNull()
    expect(screen.queryByLabelText('Return date')).toBeNull()
    const hours = screen.getByLabelText('Hours') as HTMLSelectElement
    const values = Array.from(hours.options).map((o) => o.value).filter((v) => v !== '')
    expect(values).toEqual(Array.from({ length: 24 }, (_, i) => String(i + 1)))

    fireEvent.change(hours, { target: { value: '4' } })
    const last = spy.mock.calls.at(-1)?.[0] as QuoteLineDraft
    expect(last).toMatchObject({ trip_type: 'hourly', hours: 4, destination: null, stops: [], landing: null })
    expect(lineToPayload(last, 'eur')).toMatchObject({ trip_type: 'hourly', hours: 4, return_date: null })
  })

  it('daily shows the return date and hides hours, destination and stops', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    chooseTripType('daily')
    expect(screen.queryByLabelText('Hours')).toBeNull()
    expect(screen.queryByText('pick Destination address')).toBeNull()
    fireEvent.change(screen.getByLabelText('Return date'), { target: { value: '2027-03-12' } })
    const last = spy.mock.calls.at(-1)?.[0] as QuoteLineDraft
    expect(last).toMatchObject({ trip_type: 'daily', return_date: '2027-03-12', hours: null })
  })

  it('does not offer Suggest price for an hourly trip without hours', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Pickup date'), { target: { value: '2027-03-10' } })
    fireEvent.change(screen.getByLabelText('Pickup time'), { target: { value: '09:30' } })
    fireEvent.click(screen.getByText('pick Pickup address'))
    chooseTripType('hourly')
    expect((screen.getByRole('button', { name: 'Suggest price' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '3' } })
    expect((screen.getByRole('button', { name: 'Suggest price' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('QuoteLineEditor: airport landing, extras and notes (Phase 91 D-07)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Add flight landing shows date, time and an offset of 0, 15, 30, 45, 60 or 90 minutes', () => {
    render(<Harness />)
    expect(screen.queryByLabelText('Landing date')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add flight landing' }))
    expect(screen.getByLabelText('Landing date')).toBeTruthy()
    expect(screen.getByLabelText('Landing time')).toBeTruthy()
    const offset = screen.getByLabelText('Minutes after landing') as HTMLSelectElement
    expect(Array.from(offset.options).map((o) => Number(o.value))).toEqual([0, 15, 30, 45, 60, 90])
  })

  it('derives the pickup from landing plus offset and locks the pickup fields', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add flight landing' }))
    fireEvent.change(screen.getByLabelText('Landing date'), { target: { value: '2027-03-10' } })
    fireEvent.change(screen.getByLabelText('Landing time'), { target: { value: '23:50' } })
    fireEvent.change(screen.getByLabelText('Minutes after landing'), { target: { value: '30' } })

    const last = spy.mock.calls.at(-1)?.[0] as QuoteLineDraft
    expect(last.landing).toEqual({ date: '2027-03-10', time: '23:50', offset_min: 30 })
    // Across midnight: 23:50 + 30 minutes is 00:20 the next day (Prague).
    expect(last.pickup_date).toBe('2027-03-11')
    expect(last.pickup_time).toBe('00:20')
    expect(screen.queryByLabelText('Pickup date')).toBeNull()
    expect(screen.getByTestId('quote-line-derived-pickup').textContent).toContain('2027-03-11')
  })

  it('Remove flight landing clears date, time and offset and unlocks the pickup', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add flight landing' }))
    fireEvent.change(screen.getByLabelText('Landing date'), { target: { value: '2027-03-10' } })
    fireEvent.change(screen.getByLabelText('Landing time'), { target: { value: '14:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove flight landing' }))

    const last = spy.mock.calls.at(-1)?.[0] as QuoteLineDraft
    expect(last.landing).toBeNull()
    expect(lineToPayload(last, 'eur').landing).toBeNull()
    expect(screen.queryByLabelText('Landing date')).toBeNull()
    expect(screen.getByLabelText('Pickup date')).toBeTruthy()
  })

  it('extras, flight number, terminal and notes for the driver reach onChange', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    fireEvent.click(screen.getByLabelText('Child seat'))
    fireEvent.click(screen.getByLabelText('Meet and greet'))
    fireEvent.click(screen.getByLabelText('Extra luggage'))
    fireEvent.change(screen.getByLabelText('Flight number'), { target: { value: 'OK123' } })
    fireEvent.change(screen.getByLabelText('Terminal'), { target: { value: 'T2' } })
    fireEvent.change(screen.getByLabelText('Notes for the driver'), { target: { value: 'Ring on arrival' } })
    const last = spy.mock.calls.at(-1)?.[0] as QuoteLineDraft
    expect(last).toMatchObject({
      extra_child_seat: true,
      extra_meet_greet: true,
      extra_luggage: true,
      flight_number: 'OK123',
      terminal: 'T2',
      special_requests: 'Ring on arrival',
    })
  })
})

describe('QuoteLineEditor: order, remove and read-only', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('up and down call onMove; up is disabled on the first line and down on the last', () => {
    const onMove = vi.fn()
    const { unmount } = render(<Harness index={0} total={3} onMove={onMove} />)
    expect((screen.getByRole('button', { name: 'Move trip up' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Move trip down' }))
    expect(onMove).toHaveBeenCalledWith(1)
    unmount()

    render(<Harness index={2} total={3} onMove={onMove} />)
    expect((screen.getByRole('button', { name: 'Move trip down' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Move trip up' }))
    expect(onMove).toHaveBeenLastCalledWith(-1)
  })

  it('Remove trip calls onRemove', () => {
    const onRemove = vi.fn()
    render(<Harness onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove trip' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('readOnly shows the values as text with no inputs, selects, textareas or buttons', () => {
    const line: QuoteLineDraft = {
      ...emptyLine(),
      pickup_date: '2027-03-10',
      pickup_time: '09:30',
      origin: { address: 'Prague Airport', lat: 50.1, lng: 14.26 },
      destination: { address: 'Vienna Hotel', lat: 48.2, lng: 16.37 },
      stops: [{ key: 's1', address: 'Brno', lat: 49.19, lng: 16.6, wait_minutes: 30 }],
      flight_number: 'OK123',
      special_requests: 'Ring on arrival',
      amountInput: '300.00',
      suggestedMinor: 32400,
    }
    const { container } = render(<Harness initial={line} readOnly index={1} total={3} />)
    expect(container.querySelectorAll('input, select, textarea, button')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Suggest price' })).toBeNull()
    const root = screen.getByTestId('quote-line-editor')
    for (const text of ['Prague Airport', 'Vienna Hotel', 'Brno', '30 min', 'OK123', 'Ring on arrival', '2027-03-10', '09:30']) {
      expect(root.textContent).toContain(text)
    }
    expect(root.textContent).toContain(formatMinor(30000, 'eur'))
    expect(root.textContent).toContain('Manual price')
  })
})
