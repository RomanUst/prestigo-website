import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, act, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { formatPragueTime, formatPragueUnlock, DRIVER_STATUS_LABEL } from '@/lib/driver-trip-format'

const { refreshMock, routeMapProbe } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  routeMapProbe: {
    props: null as null | {
      height?: number | string
      onRouteInfo?: (km: number, min: number) => void
      onRouteError?: () => void
    },
  },
}))

// RouteMap loads Google Maps; the screen tests only need its props contract.
vi.mock('@/components/booking/RouteMap', () => ({
  default: (props: NonNullable<typeof routeMapProbe.props>) => {
    routeMapProbe.props = props
    return <div data-testid="route-map" role="img" aria-label="Route map" />
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}))

import TripCompleted from '@/app/(internal)/driver/trip/[token]/TripCompleted'
import InvalidTripLinkView from '@/app/(internal)/driver/trip/[token]/InvalidTripLinkView'
import { BUSINESS_TEL_URL, BUSINESS_PHONE_DISPLAY } from '@/lib/contact-channels'
import TripScreen, { type TripScreenProps } from '@/app/(internal)/driver/trip/[token]/TripScreen'
import SlideToAdvance from '@/app/(internal)/driver/trip/[token]/SlideToAdvance'

const TOKEN = 'a0000004-0000-4000-8000-000000000004'

function makeProps(overrides: Partial<TripScreenProps['view']> = {}): TripScreenProps {
  return {
    token: TOKEN,
    view: { status: 'assigned', nextStep: 'en_route', lockReason: null, unlocksAt: null, ...overrides },
    trip: {
      bookingReference: 'PRG-100',
      pickupDate: '2026-11-04',
      pickupTime: '10:00',
      originAddress: 'Prague Airport',
      destinationAddress: 'Wenceslas Square',
      origin: { lat: 50.1, lng: 14.26 },
      destination: { lat: 50.08, lng: 14.42 },
      passengerName: 'Alice Smith',
      passengerPhone: '+420123456789',
      vehicleLabel: 'Business Class',
      vehicleInfo: 'Black Mercedes E-Class',
      flight: null,
      clientNotes: null,
      distanceKm: 12.4,
    },
    initialNote: null,
  }
}

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response)
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  routeMapProbe.props = null
  refreshMock.mockClear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function knob() {
  return screen.getByRole('button', { name: /Next step|Too early|Waiting/i })
}

describe('lib/driver-trip-format', () => {
  it('formatPragueTime returns the Prague wall clock across the DST change of 2026-10-25', () => {
    expect(formatPragueTime('2026-10-24T05:15:00Z')).toBe('07:15') // CEST, UTC+2
    expect(formatPragueTime('2026-10-26T05:15:00Z')).toBe('06:15') // CET, UTC+1
    expect(formatPragueTime('2026-10-25T00:30:00Z')).toBe('02:30') // CEST, before the change
    expect(formatPragueTime('2026-10-25T01:30:00Z')).toBe('02:30') // CET, after the change
  })

  it('formatPragueUnlock says "Unlocks at" on the same Prague day', () => {
    const now = Date.parse('2026-11-04T04:00:00Z')
    expect(formatPragueUnlock('2026-11-04T05:15:00Z', now)).toBe('Unlocks at 06:15')
  })

  it('formatPragueUnlock names the day when the unlock is on another Prague day', () => {
    const now = Date.parse('2026-11-03T20:00:00Z')
    expect(formatPragueUnlock('2026-11-04T05:15:00Z', now)).toBe('Unlocks on Wed 4 Nov at 06:15')
  })

  it('uses the Prague day, not the UTC day (23:30Z is already tomorrow in Prague)', () => {
    const now = Date.parse('2026-11-03T22:30:00Z') // 23:30 Prague, 3 Nov
    expect(formatPragueUnlock('2026-11-03T23:30:00Z', now)).toBe('Unlocks on Wed 4 Nov at 00:30')
  })

  it('has the status labels of the UI-SPEC', () => {
    expect(DRIVER_STATUS_LABEL).toMatchObject({
      assigned: 'Assigned',
      en_route: 'En route',
      on_location: 'On site',
      on_board: 'On board',
      confirmed: 'Confirmed',
      pending: 'Pending',
      unpaid: 'Unpaid',
    })
  })
})

describe('SlideToAdvance', () => {
  it('ready: shows the label and a role=button knob that activates on Enter and Space', async () => {
    const onActivate = vi.fn()
    const user = userEvent.setup()
    render(<SlideToAdvance label="On my way" state="ready" onActivate={onActivate} />)
    expect(screen.getByText('On my way')).toBeInTheDocument()
    const k = screen.getByRole('button', { name: 'Next step: On my way. Double tap to confirm.' })
    expect(k).not.toHaveAttribute('aria-disabled', 'true')
    k.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onActivate).toHaveBeenCalledTimes(2)
  })

  it('awaiting-confirm shows "Confirm to continue"', () => {
    render(<SlideToAdvance label="On my way" state="awaiting-confirm" onActivate={vi.fn()} />)
    expect(screen.getByText('Confirm to continue')).toBeInTheDocument()
  })

  it('submitting shows "Saving…", aria-busy and ignores Enter and Space', async () => {
    const onActivate = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<SlideToAdvance label="On my way" state="submitting" onActivate={onActivate} />)
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    const k = screen.getByRole('button')
    k.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onActivate).not.toHaveBeenCalled()
  })

  it.each([
    ['locked-early', 'Too early to start', 'Unlocks at 06:15'],
    ['locked-waiting', 'Waiting for the office', 'The office has not released this trip yet.'],
  ] as const)('%s renders both lines, aria-disabled and never activates', async (state, line1, line2) => {
    const onActivate = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <SlideToAdvance label={line1} secondaryLine={line2} state={state} onActivate={onActivate} />,
    )
    expect(screen.getByText(line1)).toBeInTheDocument()
    expect(screen.getByText(line2)).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-lock')).not.toBeNull()
    const k = screen.getByRole('button')
    expect(k).toHaveAttribute('aria-disabled', 'true')
    k.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onActivate).not.toHaveBeenCalled()
  })
})

describe('TripScreen: one next step', () => {
  it('shows exactly one control labelled with the next step only and no Back control', () => {
    render(<TripScreen {...makeProps()} />)
    expect(screen.getByText('On my way')).toBeInTheDocument()
    for (const other of ['I have arrived', 'Passenger on board', 'Complete trip']) {
      expect(screen.queryByText(other)).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
    expect(screen.getByText('PRESTIGO')).toBeInTheDocument()
  })

  it('shows the current status badge and the pickup address and time', () => {
    render(<TripScreen {...makeProps()} />)
    expect(screen.getByText('Assigned')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('Prague Airport')).toBeInTheDocument()
    expect(screen.getByText('Wenceslas Square')).toBeInTheDocument()
  })

  it('renders no price, amount or currency anywhere', () => {
    const { container } = render(<TripScreen {...makeProps()} />)
    expect(container.textContent ?? '').not.toMatch(/€|EUR|CZK|\bprice\b|amount/i)
  })

  it('shows the next label that the server view dictates after a refresh', () => {
    const { rerender } = render(<TripScreen {...makeProps()} />)
    rerender(<TripScreen {...makeProps({ status: 'en_route', nextStep: 'on_site' })} />)
    expect(screen.getByText('I have arrived')).toBeInTheDocument()
    expect(screen.getByText('En route')).toBeInTheDocument()
    expect(screen.queryByText('On my way')).not.toBeInTheDocument()
  })
})

describe('TripScreen: locked states', () => {
  it('before the unlock instant: "Too early to start" with the unlock time, aria-disabled, no dialog', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T04:00:00Z'))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps({ lockReason: 'too_early', unlocksAt: '2026-11-04T05:15:00Z' })} />)
    expect(screen.getByText('Too early to start')).toBeInTheDocument()
    expect(screen.getByText('Unlocks at 06:15')).toBeInTheDocument()
    const k = knob()
    expect(k).toHaveAttribute('aria-disabled', 'true')
    k.focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('another Prague day: "Unlocks on Wed 4 Nov at 06:15"', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'))
    render(<TripScreen {...makeProps({ lockReason: 'too_early', unlocksAt: '2026-11-04T05:15:00Z' })} />)
    expect(screen.getByText('Unlocks on Wed 4 Nov at 06:15')).toBeInTheDocument()
  })

  it.each(['confirmed', 'pending', 'unpaid'])('%s shows "Waiting for the office"', (status) => {
    render(<TripScreen {...makeProps({ status, nextStep: null, lockReason: 'waiting' })} />)
    expect(screen.getByText('Waiting for the office')).toBeInTheDocument()
    expect(knob()).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('TripScreen: confirm then POST', () => {
  it('Enter opens the dialog and sends nothing until the primary button is pressed', async () => {
    fetchMock.mockReturnValue(jsonResponse(200, { ok: true, status: 'en_route', nextStep: 'on_site' }))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)

    knob().focus()
    await user.keyboard('{Enter}')

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Confirm: On my way')).toBeInTheDocument()
    expect(within(dialog).getByText(/Are you sure you want to move to/)).toBeInTheDocument()
    expect(screen.getByText('Confirm to continue')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: "Yes, I'm on my way" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/driver/trip/${TOKEN}/progress`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ step: 'en_route' })
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Status updated: On my way.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Not yet" closes the dialog with no request and the knob returns to ready', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    knob().focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Not yet' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Not yet' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('On my way')).toBeInTheDocument()
    expect(screen.queryByText('Confirm to continue')).not.toBeInTheDocument()
  })

  it('Escape closes the dialog with no request', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    knob().focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('the final step adds the irreversible-warning paragraph', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps({ status: 'on_board', nextStep: 'completed' })} />)
    knob().focus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('Confirm: Complete trip')).toBeInTheDocument()
    expect(
      screen.getByText('You cannot undo this. If a step is wrong, the office can fix it.'),
    ).toBeInTheDocument()
  })

  it('a 409 step_conflict closes the dialog and shows the conflict banner with the server status', async () => {
    fetchMock.mockReturnValue(
      jsonResponse(409, { ok: false, error: 'step_conflict', status: 'on_location', nextStep: 'on_board' }),
    )
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    knob().focus()
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: "Yes, I'm on my way" }))

    await waitFor(() =>
      expect(
        screen.getByText('The office has updated this trip (On site). Showing the latest step.'),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('a 409 too_early shows the too-early banner with the unlock time', async () => {
    fetchMock.mockReturnValue(
      jsonResponse(409, {
        ok: false,
        error: 'too_early',
        status: 'assigned',
        nextStep: 'en_route',
        unlocksAt: '2026-11-04T05:15:00Z',
      }),
    )
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    knob().focus()
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: "Yes, I'm on my way" }))

    await waitFor(() =>
      expect(screen.getByText('Too early to start. This step unlocks at 06:15.')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not send a second request while the first is in flight', async () => {
    let resolve!: (r: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    knob().focus()
    await user.keyboard('{Enter}')
    const primary = screen.getByRole('button', { name: "Yes, I'm on my way" })
    await user.click(primary)
    await user.keyboard('{Enter}')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, status: 'en_route', nextStep: 'on_site' }) } as Response)
    })
  })
})

async function openStepDialog(user: ReturnType<typeof userEvent.setup>) {
  knob().focus()
  await user.keyboard('{Enter}')
}

describe('TripScreen: completing the trip in session (D-17)', () => {
  const completedResponse = {
    ok: true,
    status: 'completed',
    nextStep: null,
    completedAt: '2026-11-04T09:41:00Z',
  }

  it('swaps to "Trip completed" with Booking, Date and Completed at only', async () => {
    fetchMock.mockReturnValue(jsonResponse(200, completedResponse))
    const user = userEvent.setup()
    const { container } = render(<TripScreen {...makeProps({ status: 'on_board', nextStep: 'completed' })} />)
    await openStepDialog(user)
    await user.click(screen.getByRole('button', { name: 'Yes, complete trip' }))

    await waitFor(() => expect(screen.getByText('Trip completed')).toBeInTheDocument())
    expect(screen.getByText('Thank you. This trip is closed.')).toBeInTheDocument()
    expect(screen.getByText('Booking')).toBeInTheDocument()
    expect(screen.getByText('PRG-100')).toBeInTheDocument()
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Wed 4 Nov 2026')).toBeInTheDocument()
    expect(screen.getByText('Completed at')).toBeInTheDocument()
    expect(screen.getByText('10:41')).toBeInTheDocument() // 09:41Z = 10:41 CET

    const text = container.textContent ?? ''
    for (const secret of ['Alice', 'Smith', '+420123456789', 'Prague Airport', 'Wenceslas Square', 'Mercedes']) {
      expect(text).not.toContain(secret)
    }
    expect(text).not.toMatch(/€|EUR|CZK|\bprice\b|amount/i)
    // The closed link would answer "completed" (details hidden) on a refresh, which drops the summary.
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('TripCompleted and InvalidTripLinkView', () => {
  it('reopened variant has the heading, the body and no summary card', () => {
    const { container } = render(<TripCompleted variant="reopened" />)
    expect(screen.getByText('Trip completed')).toBeInTheDocument()
    expect(screen.getByText('Thank you. This trip is closed.')).toBeInTheDocument()
    expect(screen.queryByText('Booking')).not.toBeInTheDocument()
    expect(screen.queryByText('Completed at')).not.toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/€|EUR|CZK/)
  })

  it('both completed variants link to the office phone', () => {
    const { unmount } = render(<TripCompleted variant="reopened" />)
    expect(screen.getByRole('link', { name: 'Call the office' })).toHaveAttribute('href', BUSINESS_TEL_URL)
    unmount()
    render(
      <TripCompleted
        variant="in-session"
        summary={{ bookingReference: 'PRG-1', pickupDate: '2026-11-04', completedAt: '2026-11-04T09:41:00Z' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Call the office' })).toHaveAttribute('href', BUSINESS_TEL_URL)
  })

  it('ended view has both lines and the office phone link', () => {
    render(<InvalidTripLinkView />)
    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
    expect(screen.getByText(/If you think this is a mistake, call the office\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call the office' })).toHaveAttribute('href', BUSINESS_TEL_URL)
  })
})

describe('TripScreen: Help (D-18)', () => {
  it('has a Help button in the header and no Back control', () => {
    render(<TripScreen {...makeProps()} />)
    expect(screen.getByRole('button', { name: /^Help$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
  })

  it('opens "Need help?" with a tel: link and returns focus to Help on Close', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    const help = screen.getByRole('button', { name: /^Help$/ })
    await user.click(help)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Need help?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Call the office if you cannot find the passenger, the trip details look wrong, or a step was tapped by mistake.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Call the office/ })).toHaveAttribute('href', BUSINESS_TEL_URL)
    expect(within(dialog).getByText(BUSINESS_PHONE_DISPLAY)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(help).toHaveFocus()
  })

  it('Escape closes the help dialog', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(screen.getByRole('button', { name: /^Help$/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ConfirmStepDialog behaviour', () => {
  it('starts on "Not yet" and Tab cycles inside the dialog', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await openStepDialog(user)
    const primary = screen.getByRole('button', { name: "Yes, I'm on my way" })
    const notYet = screen.getByRole('button', { name: 'Not yet' })
    expect(notYet).toHaveFocus()
    await user.tab()
    expect(primary).toHaveFocus()
    await user.tab()
    expect(notYet).toHaveFocus()
    await user.tab({ shift: true })
    expect(primary).toHaveFocus()
  })

  it('while submitting both buttons are disabled and Escape does nothing', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await openStepDialog(user)
    await user.click(screen.getByRole('button', { name: "Yes, I'm on my way" }))

    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(within(dialog).getByText('Saving…')).toBeInTheDocument())
    for (const b of within(dialog).getAllByRole('button')) expect(b).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('a network error keeps the dialog open with an alert and "Try again", which re-sends once', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await openStepDialog(user)
    await user.click(screen.getByRole('button', { name: "Yes, I'm on my way" }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Could not save this step. Your trip was not changed. Check your connection and try again.',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockReturnValueOnce(jsonResponse(200, { ok: true, status: 'en_route', nextStep: 'on_site' }))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('a 500 behaves like a network error', async () => {
    fetchMock.mockReturnValue(jsonResponse(500, { ok: false, error: 'update_failed' }))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await openStepDialog(user)
    await user.click(screen.getByRole('button', { name: "Yes, I'm on my way" }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save this step.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('a 429 closes the dialog and shows the rate-limit banner', async () => {
    fetchMock.mockReturnValue(jsonResponse(429, { error: 'Too many requests' }))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await openStepDialog(user)
    await user.click(screen.getByRole('button', { name: "Yes, I'm on my way" }))
    expect(await screen.findByText('Too many taps. Wait a moment and try again.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a 400 invalid_token refreshes the page (it will render the ended view)', async () => {
    fetchMock.mockReturnValue(jsonResponse(400, { error: 'invalid_token' }))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await openStepDialog(user)
    await user.click(screen.getByRole('button', { name: "Yes, I'm on my way" }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('an info banner clears after 8 seconds', async () => {
    // fake timers + user-event deadlock (RTL's async wrapper awaits a faked setTimeout), so fireEvent here
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fetchMock.mockReturnValue(
      jsonResponse(409, { ok: false, error: 'step_conflict', status: 'on_location', nextStep: 'on_board' }),
    )
    render(<TripScreen {...makeProps()} />)
    fireEvent.keyDown(knob(), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: "Yes, I'm on my way" }))
    const text = 'The office has updated this trip (On site). Showing the latest step.'
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText(text)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(7000)
    })
    expect(screen.getByText(text)).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.queryByText(text)).not.toBeInTheDocument()
  })
})

describe('TripScreen: passenger card, map and navigation (D-18)', () => {
  it('shows the passenger name and the vehicle line with the driver vehicle info', () => {
    render(<TripScreen {...makeProps()} />)
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Business Class · Black Mercedes E-Class')).toBeInTheDocument()
  })

  it('drops the " · " segment when the driver has no vehicle info', () => {
    const props = makeProps()
    props.trip.vehicleInfo = null
    render(<TripScreen {...props} />)
    expect(screen.getByText('Business Class')).toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('renders a Call passenger tel: link with an aria-label and a 48px target', () => {
    render(<TripScreen {...makeProps()} />)
    const call = screen.getByRole('link', { name: 'Call passenger' })
    expect(call).toHaveAttribute('href', 'tel:+420123456789')
    expect(call).toHaveStyle({ minWidth: '48px', minHeight: '48px' })
  })

  it.each([null, '', '   '])('renders no Call link when the phone is %j', (phone) => {
    const props = makeProps()
    props.trip.passengerPhone = phone
    render(<TripScreen {...props} />)
    expect(screen.queryByRole('link', { name: 'Call passenger' })).not.toBeInTheDocument()
  })

  it('strips spaces and punctuation from the tel: number', () => {
    const props = makeProps()
    props.trip.passengerPhone = '+420 123-456 789'
    render(<TripScreen {...props} />)
    expect(screen.getByRole('link', { name: 'Call passenger' })).toHaveAttribute('href', 'tel:+420123456789')
  })

  it('a long passenger name is a single ellipsised line', () => {
    const props = makeProps()
    props.trip.passengerName = 'Maximilian '.repeat(20).trim()
    render(<TripScreen {...props} />)
    const name = screen.getByText(props.trip.passengerName)
    expect(name).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' })
  })

  it('mounts RouteMap with the fluid height and no chip until the route arrives', () => {
    render(<TripScreen {...makeProps()} />)
    expect(screen.getByTestId('route-map')).toBeInTheDocument()
    expect(routeMapProbe.props?.height).toBe('clamp(200px, 32dvh, 320px)')
    expect(screen.queryByText(/\(est\.\)/)).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Trip map' })).toBeInTheDocument()
  })

  it('shows "12.4 km · 18 min (est.)" after onRouteInfo fires', () => {
    render(<TripScreen {...makeProps()} />)
    act(() => routeMapProbe.props?.onRouteInfo?.(12.4, 18))
    expect(screen.getByText('12.4 km · 18 min (est.)')).toBeInTheDocument()
  })

  it('on a Directions failure shows "12.4 km (est.)" from distance_km only', () => {
    render(<TripScreen {...makeProps()} />)
    expect(screen.queryByText('12.4 km (est.)')).not.toBeInTheDocument()
    act(() => routeMapProbe.props?.onRouteError?.())
    expect(screen.getByText('12.4 km (est.)')).toBeInTheDocument()
  })

  it('on a Directions failure without distance_km there is no chip', () => {
    const props = makeProps()
    props.trip.distanceKm = null
    render(<TripScreen {...props} />)
    act(() => routeMapProbe.props?.onRouteError?.())
    expect(screen.queryByText(/\(est\.\)/)).not.toBeInTheDocument()
  })

  it('places the chip top-left and nothing over the bottom of the map (attribution stays visible)', () => {
    render(<TripScreen {...makeProps()} />)
    act(() => routeMapProbe.props?.onRouteInfo?.(12.4, 18))
    const chip = screen.getByText('12.4 km · 18 min (est.)')
    expect(chip).toHaveStyle({ position: 'absolute', top: '8px', left: '8px' })
    const region = screen.getByRole('region', { name: 'Trip map' })
    for (const el of Array.from(region.querySelectorAll<HTMLElement>('*'))) {
      expect(el.style.bottom).toBe('')
    }
  })

  it.each([
    ['origin', { origin: null }],
    ['destination', { destination: null }],
  ])('a missing %s coordinate shows the placeholder and does not mount RouteMap', (_n, patch) => {
    const props = makeProps()
    props.trip = { ...props.trip, ...patch }
    render(<TripScreen {...props} />)
    expect(screen.getByText('Map unavailable')).toBeInTheDocument()
    expect(screen.getByText('Use the pickup and drop-off addresses below, or tap Navigate.')).toBeInTheDocument()
    expect(screen.queryByTestId('route-map')).not.toBeInTheDocument()
    expect(routeMapProbe.props).toBeNull()
  })

  it('Navigate buttons open Google Maps directions to the coordinates in a new tab', () => {
    render(<TripScreen {...makeProps()} />)
    const pickup = screen.getByRole('link', { name: 'Navigate to pickup' })
    const drop = screen.getByRole('link', { name: 'Navigate to drop-off' })
    expect(pickup).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=50.1,14.26')
    expect(drop).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=50.08,14.42')
    for (const a of [pickup, drop]) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
      expect(a.getAttribute('href')).not.toContain(TOKEN)
    }
  })

  it('Navigate falls back to the encoded address when coordinates are missing', () => {
    const props = makeProps()
    props.trip = { ...props.trip, origin: null, originAddress: 'Wenceslas Square 1' }
    render(<TripScreen {...props} />)
    expect(screen.getByRole('link', { name: 'Navigate to pickup' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=Wenceslas%20Square%201',
    )
  })

  it('renders no Navigate button when there are neither coordinates nor an address', () => {
    const props = makeProps()
    props.trip = { ...props.trip, destination: null, destinationAddress: '' }
    render(<TripScreen {...props} />)
    expect(screen.queryByRole('link', { name: 'Navigate to drop-off' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Navigate to pickup' })).toBeInTheDocument()
  })

  it('keeps the chip across a router.refresh re-render with fresh prop objects', () => {
    const { rerender } = render(<TripScreen {...makeProps()} />)
    act(() => routeMapProbe.props?.onRouteInfo?.(12.4, 18))
    rerender(<TripScreen {...makeProps()} />)
    expect(screen.getByText('12.4 km · 18 min (est.)')).toBeInTheDocument()
  })
})
