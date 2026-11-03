// Phase 87 plan 12 (D-15): the no-show waiting time card on the Settings page.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import NoShowWaitSettings from '@/components/admin/NoShowWaitSettings'

function stubFetch(ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: () => Promise.resolve({}) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const cityInput = () => screen.getByLabelText('City pickup (minutes)') as HTMLInputElement
const airportInput = () => screen.getByLabelText('Airport pickup (minutes)') as HTMLInputElement

async function blurWith(input: HTMLInputElement, value: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value } })
    fireEvent.blur(input)
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('NoShowWaitSettings', () => {
  it('renders the heading, the helper line and the two inputs from the props', () => {
    stubFetch()
    render(<NoShowWaitSettings initialCityMin={25} initialAirportMin={75} />)
    expect(screen.getByText('No-show waiting time')).toBeDefined()
    expect(
      screen.getByText(
        "Free waiting time before a driver can request a no-show. Counted from the later of the pickup time and the driver's arrival.",
      ),
    ).toBeDefined()
    expect(cityInput().value).toBe('25')
    expect(airportInput().value).toBe('75')
    expect(cityInput().type).toBe('number')
  })

  it('falls back to 30 and 60 when the props are missing', () => {
    stubFetch()
    // The settings API may not return the keys yet (migration pending on an old deploy)
    render(<NoShowWaitSettings {...({} as { initialCityMin: number; initialAirportMin: number })} />)
    expect(cityInput().value).toBe('30')
    expect(airportInput().value).toBe('60')
  })

  it('blur on the city input with 45 PATCHes only noshow_wait_city_min', async () => {
    const fetchMock = stubFetch()
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(cityInput(), '45')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/settings')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ noshow_wait_city_min: 45 })
  })

  it('blur on the airport input PATCHes only noshow_wait_airport_min', async () => {
    const fetchMock = stubFetch()
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(airportInput(), '90')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ noshow_wait_airport_min: 90 })
  })

  it('accepts the bounds 1 and 240', async () => {
    const fetchMock = stubFetch()
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(cityInput(), '1')
    await blurWith(airportInput(), '240')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Enter a whole number from 1 to 240.')).toBeNull()
  })

  it.each(['0', '241', '12.5', '', '-5', '1e2'])('rejects %j: inline error and no request', async (value) => {
    const fetchMock = stubFetch()
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(cityInput(), value)

    const msg = screen.getByText('Enter a whole number from 1 to 240.')
    expect(msg.getAttribute('style') ?? '').toContain('var(--status-danger-fg)')
    expect(cityInput().getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('the inline error clears as soon as the operator edits the field again', async () => {
    stubFetch()
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(cityInput(), '999')
    expect(screen.getByText('Enter a whole number from 1 to 240.')).toBeDefined()
    await act(async () => {
      fireEvent.change(cityInput(), { target: { value: '99' } })
    })
    expect(screen.queryByText('Enter a whole number from 1 to 240.')).toBeNull()
  })

  it('an unchanged value sends nothing', async () => {
    const fetchMock = stubFetch()
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(cityInput(), '30')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows 'Saved' for 2 seconds after a successful save", async () => {
    stubFetch()
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(cityInput(), '45')
    expect(screen.getByText('Saved')).toBeDefined()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999)
    })
    expect(screen.getByText('Saved')).toBeDefined()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it("a failed save shows 'Failed to save — try again' for 4 seconds and reverts the input", async () => {
    stubFetch(false)
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(cityInput(), '45')

    const msg = screen.getByText('Failed to save — try again')
    expect(msg.getAttribute('style') ?? '').toContain('var(--status-danger-fg)')
    expect(cityInput().value).toBe('30')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3999)
    })
    expect(screen.getByText('Failed to save — try again')).toBeDefined()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.queryByText('Failed to save — try again')).toBeNull()
  })

  it('a network error reverts the same way', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(airportInput(), '90')
    expect(screen.getByText('Failed to save — try again')).toBeDefined()
    expect(airportInput().value).toBe('60')
  })

  it('after a save, the saved value is the baseline for the next blur', async () => {
    const fetchMock = stubFetch()
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    await blurWith(cityInput(), '45')
    await blurWith(cityInput(), '45')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses 44px inputs, tokens only and no uppercase typography', () => {
    stubFetch()
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    expect(cityInput().style.minHeight).toBe('44px')
    expect(cityInput().getAttribute('style') ?? '').toContain('var(--admin-input-bg)')
    const label = screen.getByText('City pickup (minutes)')
    expect(label.style.textTransform).toBe('')
  })
})

describe('Settings page wiring', () => {
  const page = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/(internal)/admin/(dashboard)/settings/page.tsx'),
    'utf8',
  )

  it('renders NoShowWaitSettings after DispatchDefault with both thresholds from the settings payload', () => {
    expect(page).toContain("import NoShowWaitSettings from '@/components/admin/NoShowWaitSettings'")
    expect(page).toContain('initialCityMin={data.noshow_wait_city_min}')
    expect(page).toContain('initialAirportMin={data.noshow_wait_airport_min}')
    expect(page.indexOf('<DispatchDefault')).toBeLessThan(page.indexOf('<NoShowWaitSettings'))
  })
})
