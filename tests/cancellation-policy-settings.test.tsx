// Phase 89 plan 03 (CANC-01, D-06, WR-06): the cancellation policy card on the Settings page.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import CancellationPolicySettings from '@/components/admin/CancellationPolicySettings'
import NoShowWaitSettings from '@/components/admin/NoShowWaitSettings'
import { CANCELLATION_POLICY_VERSION } from '@/lib/cancellation-policy'

function stubFetch(ok = true, status = ok ? 200 : 500, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const kmInput = () => field('Short-trip limit (km)')
const shortInput = () => field('Free cancellation, short trips (hours before pickup)')
const longInput = () => field('Free cancellation, longer trips (hours)')
const hourlyInput = () => field('Free cancellation, hourly bookings (hours)')
const percentInput = () => field('Fee for late cancellation (percent)')

async function blurWith(input: HTMLInputElement, value: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value } })
    fireEvent.blur(input)
    await vi.advanceTimersByTimeAsync(0)
  })
}

function renderCard() {
  return render(
    <CancellationPolicySettings
      initialKm={100}
      initialShortHours={1}
      initialLongHours={12}
      initialHourlyHours={12}
      initialPercent={100}
    />,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('CancellationPolicySettings', () => {
  it('renders the heading, helper and the five labelled fields from the props', () => {
    stubFetch()
    render(
      <CancellationPolicySettings
        initialKm={80}
        initialShortHours={2}
        initialLongHours={24}
        initialHourlyHours={6}
        initialPercent={50}
      />,
    )
    expect(screen.getByText('Cancellation policy')).toBeDefined()
    expect(
      screen.getByText(/A booking keeps the terms it was made under, so changes apply to new bookings only\./),
    ).toBeDefined()
    expect(kmInput().value).toBe('80')
    expect(shortInput().value).toBe('2')
    expect(longInput().value).toBe('24')
    expect(hourlyInput().value).toBe('6')
    expect(percentInput().value).toBe('50')
    expect(kmInput().type).toBe('number')
  })

  it('falls back to 100, 1, 12, 12, 100 when the props are missing', () => {
    stubFetch()
    render(<CancellationPolicySettings />)
    expect(kmInput().value).toBe('100')
    expect(shortInput().value).toBe('1')
    expect(longInput().value).toBe('12')
    expect(hourlyInput().value).toBe('12')
    expect(percentInput().value).toBe('100')
    expect(screen.getByText(new RegExp(`Policy version: ${CANCELLATION_POLICY_VERSION}\\.`))).toBeDefined()
  })

  it('falls back per field when a prop is out of bounds', () => {
    stubFetch()
    render(<CancellationPolicySettings initialKm={0} initialShortHours={99} initialPercent={101} />)
    expect(kmInput().value).toBe('100')
    expect(shortInput().value).toBe('1')
    expect(percentInput().value).toBe('100')
  })

  it.each([
    ['km', kmInput, '150', 'cancel_free_km_threshold', 150],
    ['short', shortInput, '2', 'cancel_free_hours_short', 2],
    ['long', longInput, '24', 'cancel_free_hours_long', 24],
    ['hourly', hourlyInput, '6', 'cancel_free_hours_hourly', 6],
    ['percent', percentInput, '50', 'cancel_fee_percent', 50],
  ] as const)('blur on %s PATCHes only that key', async (_name, get, value, key, expected) => {
    const fetchMock = stubFetch()
    renderCard()
    await blurWith(get(), value)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/settings')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ [key]: expected })
  })

  it.each([
    ['km', kmInput, ['0', '1001', '12.5', '', '-5', '1e2'], 'Enter a whole number from 1 to 1000.'],
    ['hours', shortInput, ['73', '-1', '1.5', '', '1e1'], 'Enter a whole number from 0 to 72.'],
    ['percent', percentInput, ['0', '101', '33.3', ''], 'Enter a whole number from 1 to 100.'],
  ] as const)('rejects invalid %s text: inline error, text stays, no request', async (_n, get, values, message) => {
    for (const value of values) {
      const fetchMock = stubFetch()
      const { unmount } = renderCard()
      await blurWith(get(), value)
      const err = screen.getByText(message)
      expect(err.getAttribute('role')).toBe('alert')
      expect(err.getAttribute('style') ?? '').toContain('var(--status-danger-fg)')
      expect(get().getAttribute('aria-invalid')).toBe('true')
      expect(get().value).toBe(value)
      expect(fetchMock).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('accepts the bounds', async () => {
    const fetchMock = stubFetch()
    renderCard()
    await blurWith(kmInput(), '1')
    await blurWith(kmInput(), '1000')
    await blurWith(shortInput(), '0')
    await blurWith(hourlyInput(), '72')
    await blurWith(percentInput(), '1')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('an unchanged value sends nothing', async () => {
    const fetchMock = stubFetch()
    renderCard()
    await blurWith(kmInput(), '100')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows 'Saved' for 2 seconds, then clears", async () => {
    stubFetch()
    renderCard()
    await blurWith(percentInput(), '50')
    const saved = screen.getByText('Saved')
    expect(saved.getAttribute('role')).toBe('status')
    expect(saved.getAttribute('style') ?? '').toContain('var(--status-ok-fg)')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999)
    })
    expect(screen.getByText('Saved')).toBeDefined()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it("a failed save shows 'Failed to save — try again' for 4 seconds and reverts the field", async () => {
    stubFetch(false)
    renderCard()
    await blurWith(percentInput(), '50')
    const msg = screen.getByText('Failed to save — try again')
    expect(msg.getAttribute('style') ?? '').toContain('var(--status-danger-fg)')
    expect(percentInput().value).toBe('100')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(screen.queryByText('Failed to save — try again')).toBeNull()
  })

  it('a network error reverts the same way', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderCard()
    await blurWith(kmInput(), '150')
    expect(screen.getByText('Failed to save — try again')).toBeDefined()
    expect(kmInput().value).toBe('100')
  })

  it('a 422 long_below_short shows the cross-check text under the long field and keeps what was typed', async () => {
    stubFetch(false, 422, { error: 'long_below_short' })
    renderCard()
    await blurWith(longInput(), '0')
    const err = screen.getByText('Longer trips must be at least as long as short trips.')
    expect(err.getAttribute('role')).toBe('alert')
    expect(longInput().getAttribute('aria-invalid')).toBe('true')
    expect(longInput().value).toBe('0')
    expect(screen.queryByText('Failed to save — try again')).toBeNull()
    // Editing the field clears the message
    await act(async () => {
      fireEvent.change(longInput(), { target: { value: '5' } })
    })
    expect(screen.queryByText('Longer trips must be at least as long as short trips.')).toBeNull()
  })

  it('the preview and version lines follow the typed values', async () => {
    stubFetch()
    renderCard()
    expect(
      screen.getByText(
        'Free until 1 h before pickup for trips up to 100 km, 12 h for longer trips and 12 h for hourly bookings. After that, 100% of the fare applies.',
      ),
    ).toBeDefined()
    await act(async () => {
      fireEvent.change(kmInput(), { target: { value: '75' } })
      fireEvent.change(shortInput(), { target: { value: '3' } })
      fireEvent.change(longInput(), { target: { value: '30' } })
      fireEvent.change(hourlyInput(), { target: { value: '9' } })
      fireEvent.change(percentInput(), { target: { value: '40' } })
    })
    expect(
      screen.getByText(
        'Free until 3 h before pickup for trips up to 75 km, 30 h for longer trips and 9 h for hourly bookings. After that, 40% of the fare applies.',
      ),
    ).toBeDefined()
    const preview = screen.getByText(/^Free until 3 h/)
    expect(preview.parentElement?.getAttribute('aria-live')).toBe('polite')
    expect(
      screen.getByText(
        `Policy version: ${CANCELLATION_POLICY_VERSION}. The version changes when the wording changes, not when you change a number.`,
      ),
    ).toBeDefined()
  })

  it('uses 44px inputs, tokens only and no colour literal', () => {
    stubFetch()
    renderCard()
    expect(kmInput().style.minHeight).toBe('44px')
    expect(kmInput().getAttribute('style') ?? '').toContain('var(--admin-input-bg)')
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'components/admin/CancellationPolicySettings.tsx'),
      'utf8',
    )
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src).not.toMatch(/\brgba?\(/)
  })
})

describe('NoShowWaitSettings airport below city (WR-06)', () => {
  it('a 422 airport_below_city shows the explanation and keeps the typed text', async () => {
    stubFetch(false, 422, { error: 'airport_below_city' })
    render(<NoShowWaitSettings initialCityMin={30} initialAirportMin={60} />)
    const airport = screen.getByLabelText('Airport pickup (minutes)') as HTMLInputElement
    await blurWith(airport, '10')
    const err = screen.getByText('Airport wait must be at least the city wait.')
    expect(err.getAttribute('role')).toBe('alert')
    expect(airport.getAttribute('aria-invalid')).toBe('true')
    expect(airport.value).toBe('10')
    expect(screen.queryByText('Failed to save — try again')).toBeNull()
    await act(async () => {
      fireEvent.change(airport, { target: { value: '45' } })
    })
    expect(screen.queryByText('Airport wait must be at least the city wait.')).toBeNull()
  })
})

describe('Settings page wiring (plan 89-03)', () => {
  const page = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/(internal)/admin/(dashboard)/settings/page.tsx'),
    'utf8',
  )

  it('mounts the card directly under CardFlowSettings, seeded from the settings payload', () => {
    expect(page).toContain("import CancellationPolicySettings from '@/components/admin/CancellationPolicySettings'")
    expect(page).toContain('initialKm={data.cancel_free_km_threshold}')
    expect(page).toContain('initialShortHours={data.cancel_free_hours_short}')
    expect(page).toContain('initialLongHours={data.cancel_free_hours_long}')
    expect(page).toContain('initialHourlyHours={data.cancel_free_hours_hourly}')
    expect(page).toContain('initialPercent={data.cancel_fee_percent}')
    expect(page.indexOf('<CardFlowSettings')).toBeLessThan(page.indexOf('<CancellationPolicySettings'))
  })
})
