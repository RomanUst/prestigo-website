// Phase 91 plan 03 (D-04, D-05): the waiting rate per extra 15 minutes, one input per vehicle class.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import PricingForm from '@/components/admin/PricingForm'

type Row = {
  vehicle_class: string
  rate_per_km: number
  hourly_rate: number
  daily_rate: number
  min_fare: number
  waiting_rate_per_15min?: number | null
}

const baseRows: Row[] = [
  { vehicle_class: 'business', rate_per_km: 3, hourly_rate: 60, daily_rate: 350, min_fare: 0 },
  { vehicle_class: 'first_class', rate_per_km: 4.5, hourly_rate: 90, daily_rate: 500, min_fare: 0 },
  { vehicle_class: 'business_van', rate_per_km: 3.8, hourly_rate: 75, daily_rate: 420, min_fare: 0 },
]

const globals = {
  airport_fee: 10,
  night_coefficient: 1.2,
  holiday_coefficient: 1.5,
  extra_child_seat: 20,
  extra_luggage: 25,
  return_discount_percent: 10,
  hourly_min_hours: 2,
  hourly_max_hours: 8,
}

function renderForm(waiting: Array<number | null | undefined>) {
  const config = baseRows.map((row, i) => ({ ...row, waiting_rate_per_15min: waiting[i] }))
  return render(<PricingForm initialData={{ config, globals, holidayDates: [] }} />)
}

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const waitingInputs = () => screen.getAllByLabelText('Waiting per extra 15 min (EUR)') as HTMLInputElement[]
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save pricing' }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PricingForm waiting rate (D-04, D-05)', () => {
  it('renders one labelled input per class with the help text and no placeholder amount', () => {
    stubFetch()
    renderForm([null, null, null])
    const inputs = waitingInputs()
    expect(inputs).toHaveLength(3)
    for (const input of inputs) {
      expect(input.type).toBe('number')
      expect(input.value).toBe('')
      expect(input.getAttribute('placeholder')).toBeNull()
    }
    expect(screen.getAllByText('Leave empty to not offer paid waiting for this class')).toHaveLength(3)
  })

  it('shows a saved Business rate and leaves the other two empty', () => {
    stubFetch()
    renderForm([12.5, null, null])
    expect(waitingInputs().map((i) => i.value)).toEqual(['12.5', '', ''])
  })

  it('treats a row that arrives without the key as empty', () => {
    stubFetch()
    renderForm([undefined, undefined, undefined])
    expect(waitingInputs().map((i) => i.value)).toEqual(['', '', ''])
  })

  it('saves Business 15 and the others empty: every PUT row carries the key', async () => {
    const fetchMock = stubFetch()
    renderForm([null, null, null])
    fireEvent.change(waitingInputs()[0], { target: { value: '15' } })
    save()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/pricing')
    expect((init as RequestInit).method).toBe('PUT')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.config).toHaveLength(3)
    for (const row of body.config) expect(row).toHaveProperty('waiting_rate_per_15min')
    expect(body.config.map((r: Row) => r.waiting_rate_per_15min)).toEqual([15, null, null])
  })

  it('clearing a saved rate sends null for that class', async () => {
    const fetchMock = stubFetch()
    renderForm([12.5, 20, null])
    fireEvent.change(waitingInputs()[0], { target: { value: '' } })
    save()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.config.map((r: Row) => r.waiting_rate_per_15min)).toEqual([null, 20, null])
  })

  it('untouched rows keep their saved rate in the PUT body', async () => {
    const fetchMock = stubFetch()
    renderForm([12.5, null, 8])
    save()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.config.map((r: Row) => r.waiting_rate_per_15min)).toEqual([12.5, null, 8])
  })

  it.each(['0', '-1'])('typing %s shows a validation message and sends no PUT', async (value) => {
    const fetchMock = stubFetch()
    renderForm([null, null, null])
    fireEvent.change(waitingInputs()[1], { target: { value } })
    save()

    await waitFor(() =>
      expect(screen.getByText('Enter an amount above 0, or leave empty to not offer waiting')).toBeDefined(),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('puts no currency amount in the component source', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(__dirname, '../components/admin/PricingForm.tsx'), 'utf8')
    expect(src).not.toMatch(/€\s?\d/)
  })
})
