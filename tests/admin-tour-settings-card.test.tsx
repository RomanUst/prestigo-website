import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Phase 93 (plan 93-09; TRIP-03; D-02, D-12, D-22): the global tour settings card. Optimistic save on blur, the server
// stays authoritative. The settings route belongs to 93-07: here it is a fetch mock.

import TourSettingsCard from '@/components/admin/tours/TourSettingsCard'

const SETTINGS = {
  id: 1,
  extra_hour_e_eur: 45,
  extra_hour_s_eur: 60,
  extra_hour_v_eur: 55,
  free_cancel_hours: 24,
  pickup_radius_km: 15,
  updated_at: '2026-11-10T10:00:00.000Z',
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

let fetchMock: ReturnType<typeof vi.fn>
let patchAnswer: (body: Record<string, unknown>) => Promise<Response>

function patches() {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
}

beforeEach(() => {
  patchAnswer = (body) => json({ settings: { ...SETTINGS, ...body } })
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url !== '/api/admin/tour-settings') return json({}, 404)
    if (init?.method === 'PATCH') return patchAnswer(JSON.parse(String(init.body)))
    return json(SETTINGS)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function field(label: string) {
  return (await screen.findByLabelText(label)) as HTMLInputElement
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

describe('TourSettingsCard', () => {
  it('loads the settings and shows the five fields with the note', async () => {
    render(<TourSettingsCard />)
    expect((await field('Extra hour, Business (E)')).value).toBe('45')
    expect((await field('Extra hour, First Class (S)')).value).toBe('60')
    expect((await field('Extra hour, Business Van (V)')).value).toBe('55')
    expect((await field('Free cancellation, hours before pickup')).value).toBe('24')
    expect((await field('Pickup radius from Old Town Square, km')).value).toBe('15')
    expect(
      screen.getByText('These apply to all tours. Bookings already made keep the terms they were booked with.'),
    ).toBeDefined()
  })

  it('PATCHes only the changed field on blur and shows Saved', async () => {
    render(<TourSettingsCard />)
    type(await field('Free cancellation, hours before pickup'), '30')
    expect(await screen.findByText('Saved')).toBeDefined()
    expect(patches()).toHaveLength(1)
    expect(JSON.parse(String((patches()[0][1] as RequestInit).body))).toEqual({ free_cancel_hours: 30 })
  })

  it('does not send a request when the value did not change', async () => {
    render(<TourSettingsCard />)
    type(await field('Free cancellation, hours before pickup'), '24')
    expect(patches()).toHaveLength(0)
  })

  it('refuses 80 hours without a request', async () => {
    render(<TourSettingsCard />)
    type(await field('Free cancellation, hours before pickup'), '80')
    expect(await screen.findByText('Enter a whole number from 0 to 72.')).toBeDefined()
    expect(patches()).toHaveLength(0)
  })

  it('refuses a radius of 0.5 and an off-step radius without a request', async () => {
    render(<TourSettingsCard />)
    const radius = await field('Pickup radius from Old Town Square, km')
    type(radius, '0.5')
    expect(await screen.findByText('Enter a number from 1 to 50.')).toBeDefined()
    type(radius, '10.3')
    expect(screen.getByText('Enter a number from 1 to 50.')).toBeDefined()
    expect(patches()).toHaveLength(0)
  })

  it('accepts a half-kilometre radius', async () => {
    render(<TourSettingsCard />)
    type(await field('Pickup radius from Old Town Square, km'), '12.5')
    expect(await screen.findByText('Saved')).toBeDefined()
    expect(JSON.parse(String((patches()[0][1] as RequestInit).body))).toEqual({ pickup_radius_km: 12.5 })
  })

  it('refuses an extra-hour price of 0 without a request', async () => {
    render(<TourSettingsCard />)
    type(await field('Extra hour, Business (E)'), '0')
    expect(await screen.findByText('Enter a price greater than 0.')).toBeDefined()
    expect(patches()).toHaveLength(0)
  })

  it('saves an extra-hour price for its own class', async () => {
    render(<TourSettingsCard />)
    type(await field('Extra hour, Business Van (V)'), '70.5')
    expect(await screen.findByText('Saved')).toBeDefined()
    expect(JSON.parse(String((patches()[0][1] as RequestInit).body))).toEqual({ extra_hour_v_eur: 70.5 })
  })

  it('restores the last saved value and shows the error when the save fails', async () => {
    patchAnswer = () => json({ error: 'Request failed' }, 500)
    render(<TourSettingsCard />)
    const hours = await field('Free cancellation, hours before pickup')
    type(hours, '30')
    expect(await screen.findByText('Could not save. Nothing was changed. Try again.')).toBeDefined()
    await waitFor(() => expect(hours.value).toBe('24'))
  })

  it('shows the session message when the save answers 401', async () => {
    patchAnswer = () => json({ error: 'Unauthorized' }, 401)
    render(<TourSettingsCard />)
    type(await field('Free cancellation, hours before pickup'), '30')
    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeDefined()
  })

  it('shows a load error with Retry when the settings cannot be read', async () => {
    let fail = true
    fetchMock.mockImplementation(() => (fail ? json({ error: 'Request failed' }, 500) : json(SETTINGS)))
    render(<TourSettingsCard />)
    expect(await screen.findByText('Could not load tour settings. Try again.')).toBeDefined()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await field('Free cancellation, hours before pickup')).value).toBe('24')
  })
})
