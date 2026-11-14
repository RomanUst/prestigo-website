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
