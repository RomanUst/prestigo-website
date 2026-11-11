import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, act, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { formatPragueTime, formatPragueUnlock, DRIVER_STATUS_LABEL } from '@/lib/driver-trip-format'
import { googleMapsDirectionsUrl, wazeNavigationUrl } from '@/lib/driver-nav-url'

const { refreshMock, openHelpPageMock, routeMapProbe } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  openHelpPageMock: vi.fn(),
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

const routerPushMock = vi.fn()
const routerReplaceMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: routerPushMock, replace: routerReplaceMock }),
}))

// 87-UAT gap 3: the hard navigation to the help page is observed, not performed.
vi.mock('@/lib/driver-help-contract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/driver-help-contract')>()
  return { ...actual, openDriverHelpPage: openHelpPageMock }
})

import TripCompleted from '@/app/(internal)/driver/trip/[token]/TripCompleted'
import InvalidTripLinkView from '@/app/(internal)/driver/trip/[token]/InvalidTripLinkView'
import { BUSINESS_TEL_URL, BUSINESS_PHONE_DISPLAY } from '@/lib/contact-channels'
import TripScreen, { type TripScreenProps } from '@/app/(internal)/driver/trip/[token]/TripScreen'
import SlideToAdvance from '@/app/(internal)/driver/trip/[token]/SlideToAdvance'

const TOKEN = 'a0000004-0000-4000-8000-000000000004'

function makeProps(
  overrides: Partial<TripScreenProps['view']> = {},
  noShow: Partial<TripScreenProps['noShow']> = {},
): TripScreenProps {
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
      driverName: 'John Driver',
      flight: null,
      clientNotes: null,
      distanceKm: 12.4,
      landing: null,
      freeWaitUntil: null,
      stops: [],
    },
    initialNote: null,
    noShow: { availableAt: null, requestedAt: null, ...noShow },
  }
}

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response)
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  routeMapProbe.props = null
  refreshMock.mockClear()
  openHelpPageMock.mockClear()
  routerPushMock.mockClear()
  routerReplaceMock.mockClear()
  window.sessionStorage.clear()
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

  it('renders no price, amount or currency on a non-cash trip (Phase 89: an amount only for cash, see the cash blocks below)', () => {
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
    // non-cash trip: no amount unless cash (the cash trip is covered by the Phase 89 blocks at the end of this file)
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

  it('opens "Need help?" with the chat button, a tel: link and returns focus to Help on Close', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    const help = screen.getByRole('button', { name: /^Help$/ })
    await user.click(help)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Need help?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Chat with the office or call if you cannot find the passenger, the trip details look wrong, or a step was tapped by mistake.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Chat with the office' })).toBeEnabled()
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

  describe('Chat with the office (87-UAT gap 3)', () => {
    const DRIVER_ID = 'a0000002-0000-4000-8000-000000000002'
    const HELP_CONFIG = {
      enabled: true,
      baseUrl: 'https://chat.example.test',
      websiteToken: 'site-token',
      user: {
        identifier: `driver:${DRIVER_ID}`,
        identifierHash: 'a'.repeat(64),
        name: 'Ivan Petrov (driver)',
        email: null,
        phone: null,
      },
      conversation: { chat_role: 'driver', driver_trip_ref: 'PRG-100' },
    }

    async function openHelpDialog() {
      const user = userEvent.setup()
      render(<TripScreen {...makeProps()} />)
      await user.click(screen.getByRole('button', { name: /^Help$/ }))
      return { user, dialog: screen.getByRole('dialog') }
    }

    it('sends exactly one POST to the help route, stores the config and navigates with a full page load', async () => {
      fetchMock.mockImplementation(() => jsonResponse(200, HELP_CONFIG))
      const { user, dialog } = await openHelpDialog()
      expect(fetchMock).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: 'Chat with the office' }))

      await waitFor(() => expect(openHelpPageMock).toHaveBeenCalledTimes(1))
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toBe(`/api/driver/trip/${TOKEN}/help`)
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
      expect(JSON.parse(window.sessionStorage.getItem('prestigo_driver_help') ?? 'null')).toEqual(HELP_CONFIG)
      expect(routerPushMock).not.toHaveBeenCalled()
      expect(routerReplaceMock).not.toHaveBeenCalled()
    })

    it('shows "Opening chat…" disabled and aria-busy while the request is pending', async () => {
      fetchMock.mockImplementation(() => new Promise(() => {}))
      const { user, dialog } = await openHelpDialog()

      await user.click(within(dialog).getByRole('button', { name: 'Chat with the office' }))

      const busy = await within(dialog).findByRole('button', { name: /Opening chat/ })
      expect(busy).toBeDisabled()
      expect(busy).toHaveAttribute('aria-busy', 'true')
      expect(openHelpPageMock).not.toHaveBeenCalled()
    })

    const CHAT_ERROR_LINE = 'Chat is not available right now. Call the office instead.'

    it.each([
      ['200 { enabled: false }', () => jsonResponse(200, { enabled: false })],
      ['429', () => jsonResponse(429, { error: 'rate_limited' })],
      ['a rejected fetch', () => Promise.reject(new Error('network'))],
    ])('%s shows the error line, "Try chat again" and keeps the call link', async (_label, answer) => {
      fetchMock.mockImplementation(answer)
      const { user, dialog } = await openHelpDialog()

      await user.click(within(dialog).getByRole('button', { name: 'Chat with the office' }))

      expect(await within(dialog).findByText(CHAT_ERROR_LINE)).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Try chat again' })).toBeEnabled()
      expect(within(dialog).getByRole('link', { name: /Call the office/ })).toHaveAttribute('href', BUSINESS_TEL_URL)
      expect(openHelpPageMock).not.toHaveBeenCalled()
      expect(window.sessionStorage.getItem('prestigo_driver_help')).toBeNull()
    })

    it('a request that never resolves ends in the error line after 10 s', async () => {
      vi.useFakeTimers()
      fetchMock.mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      )
      render(<TripScreen {...makeProps()} />)
      fireEvent.click(screen.getByRole('button', { name: /^Help$/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Chat with the office' }))
      expect(screen.getByRole('button', { name: /Opening chat/ })).toBeDisabled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_500)
      })

      expect(screen.getByText(CHAT_ERROR_LINE)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Try chat again' })).toBeEnabled()
      expect(openHelpPageMock).not.toHaveBeenCalled()
    })

    it('400 invalid_token closes the dialog and refreshes into the ended view', async () => {
      fetchMock.mockImplementation(() => jsonResponse(400, { error: 'invalid_token' }))
      const { user, dialog } = await openHelpDialog()

      await user.click(within(dialog).getByRole('button', { name: 'Chat with the office' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(refreshMock).toHaveBeenCalledTimes(1)
      expect(openHelpPageMock).not.toHaveBeenCalled()
    })

    it('Escape and a scrim click do not close the dialog while opening', async () => {
      fetchMock.mockImplementation(() => new Promise(() => {}))
      const { user, dialog } = await openHelpDialog()
      await user.click(within(dialog).getByRole('button', { name: 'Chat with the office' }))
      await within(dialog).findByRole('button', { name: /Opening chat/ })

      await user.keyboard('{Escape}')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      const scrim = dialog.parentElement as HTMLElement
      await user.click(scrim)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('after an error Close works and returns focus to Help', async () => {
      fetchMock.mockImplementation(() => jsonResponse(429, {}))
      const { user, dialog } = await openHelpDialog()
      await user.click(within(dialog).getByRole('button', { name: 'Chat with the office' }))
      await within(dialog).findByText(CHAT_ERROR_LINE)

      await user.click(within(dialog).getByRole('button', { name: 'Close' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Help$/ })).toHaveFocus()
    })

    it('reopening the dialog after an error starts from "Chat with the office" again', async () => {
      fetchMock.mockImplementation(() => jsonResponse(429, {}))
      const { user, dialog } = await openHelpDialog()
      await user.click(within(dialog).getByRole('button', { name: 'Chat with the office' }))
      await within(dialog).findByText(CHAT_ERROR_LINE)
      await user.click(within(dialog).getByRole('button', { name: 'Close' }))

      await user.click(screen.getByRole('button', { name: /^Help$/ }))
      const again = screen.getByRole('dialog')
      expect(within(again).getByRole('button', { name: 'Chat with the office' })).toBeEnabled()
      expect(within(again).queryByText(CHAT_ERROR_LINE)).not.toBeInTheDocument()
    })

    it('the chat button and the call link are at least 48px high', async () => {
      const { dialog } = await openHelpDialog()
      const chat = within(dialog).getByRole('button', { name: 'Chat with the office' })
      const call = within(dialog).getByRole('link', { name: /Call the office/ })
      expect(chat.style.minHeight).toBe('48px')
      expect(call.style.minHeight).toBe('48px')
    })

    it('a 200 with an invalid config stores nothing and shows the error line with the call link', async () => {
      fetchMock.mockImplementation(() => jsonResponse(200, { enabled: true, baseUrl: 'http://x', websiteToken: '' }))
      const { user, dialog } = await openHelpDialog()

      await user.click(within(dialog).getByRole('button', { name: 'Chat with the office' }))

      expect(await within(dialog).findByText('Chat is not available right now. Call the office instead.')).toBeInTheDocument()
      expect(window.sessionStorage.getItem('prestigo_driver_help')).toBeNull()
      expect(openHelpPageMock).not.toHaveBeenCalled()
      expect(within(dialog).getByRole('link', { name: /Call the office/ })).toHaveAttribute('href', BUSINESS_TEL_URL)
    })
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

describe('TripScreen: landing, free waiting and stops (Phase 91, STOP-04, STOP-05)', () => {
  function airportProps(): TripScreenProps {
    const props = makeProps()
    props.trip.pickupTime = '14:30'
    props.trip.landing = { date: '2027-06-10', time: '14:00', offsetMin: 30 }
    props.trip.freeWaitUntil = '15:30'
    props.trip.stops = [
      { position: 1, address: 'Karlovy Vary', waitMinutes: 45, lat: 50.23, lng: 12.87 },
      { position: 2, address: 'Plzen', waitMinutes: 0, lat: 49.74, lng: 13.37 },
    ]
    return props
  }

  function openSheet() {
    fireEvent.click(screen.getByRole('button', { name: 'Show trip details' }))
  }

  it('shows landing, pickup, free waiting until and every stop with its wait', () => {
    render(<TripScreen {...airportProps()} />)
    openSheet()
    expect(screen.getByText('Landing 14:00')).toBeInTheDocument()
    expect(screen.getByText('Pickup 14:30')).toBeInTheDocument()
    expect(screen.getByText('Free waiting until 15:30')).toBeInTheDocument()
    expect(screen.getByText('Stop 1')).toBeInTheDocument()
    expect(screen.getByText('Karlovy Vary')).toBeInTheDocument()
    expect(screen.getByText('wait 45 min')).toBeInTheDocument()
    expect(screen.getByText('Stop 2')).toBeInTheDocument()
    expect(screen.getByText('no waiting')).toBeInTheDocument()
  })

  it('lists the stops in position order as given and carries no euro sign or amount', () => {
    const { container } = render(<TripScreen {...airportProps()} />)
    openSheet()
    const text = container.textContent ?? ''
    expect(text.indexOf('Stop 1')).toBeLessThan(text.indexOf('Stop 2'))
    expect(text).not.toMatch(/€|EUR|CZK|\bfee\b|\bprice\b|amount/i)
  })

  it('without landing and stops renders no Arrival or Stop rows (exactly as before), the free waiting row is optional', () => {
    render(<TripScreen {...makeProps()} />)
    openSheet()
    expect(screen.queryByText('Arrival')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Stop \d/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Free waiting until/)).not.toBeInTheDocument()
  })
})

describe('TripScreen: passenger card, map and navigation (D-18)', () => {
  // Passenger contact moved into the expanded sheet (owner 2026-11-03, after the 87 UAT).
  function openSheet() {
    fireEvent.click(screen.getByRole('button', { name: 'Show trip details' }))
  }

  it('collapsed: the card above the map shows only the passenger name, no phone, vehicle or buttons', () => {
    render(<TripScreen {...makeProps()} />)
    expect(screen.getByText('Passenger')).toBeInTheDocument()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.queryByText('+420123456789')).not.toBeInTheDocument()
    expect(screen.queryByText(/Business Class/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Call passenger' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Message passenger' })).not.toBeInTheDocument()
  })

  it('expanded: passenger name and phone, booking, driver, vehicle class and vehicle rows', () => {
    render(<TripScreen {...makeProps()} />)
    openSheet()
    expect(screen.getAllByText('Passenger')).toHaveLength(2)
    expect(screen.getAllByText('Alice Smith')).toHaveLength(2)
    expect(screen.getByText('+420123456789')).toBeInTheDocument()
    expect(screen.getByText('PRG-100')).toBeInTheDocument()
    expect(screen.getByText('Driver')).toBeInTheDocument()
    expect(screen.getByText('John Driver')).toBeInTheDocument()
    expect(screen.getByText('Vehicle class')).toBeInTheDocument()
    expect(screen.getByText('Business Class')).toBeInTheDocument()
    expect(screen.getByText('Vehicle')).toBeInTheDocument()
    expect(screen.getByText('Black Mercedes E-Class')).toBeInTheDocument()
  })

  it('expanded: no Driver or Vehicle row when the driver profile has neither', () => {
    const props = makeProps()
    props.trip.vehicleInfo = null
    props.trip.driverName = null
    render(<TripScreen {...props} />)
    openSheet()
    expect(screen.getByText('Business Class')).toBeInTheDocument()
    expect(screen.queryByText('Driver')).not.toBeInTheDocument()
    expect(screen.queryByText('Vehicle')).not.toBeInTheDocument()
  })

  it('renders Call and Message passenger links with aria-labels and 48px targets', () => {
    render(<TripScreen {...makeProps()} />)
    openSheet()
    const call = screen.getByRole('link', { name: 'Call passenger' })
    expect(call).toHaveAttribute('href', 'tel:+420123456789')
    expect(call).toHaveStyle({ minWidth: '48px', minHeight: '48px' })
    const sms = screen.getByRole('link', { name: 'Message passenger' })
    expect(sms).toHaveAttribute('href', 'sms:+420123456789')
    expect(sms).toHaveStyle({ minWidth: '48px', minHeight: '48px' })
  })

  it.each([null, '', '   '])('renders no Call or Message link when the phone is %j', (phone) => {
    const props = makeProps()
    props.trip.passengerPhone = phone
    render(<TripScreen {...props} />)
    openSheet()
    expect(screen.queryByRole('link', { name: 'Call passenger' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Message passenger' })).not.toBeInTheDocument()
  })

  it('strips spaces and punctuation from the tel: and sms: number', () => {
    const props = makeProps()
    props.trip.passengerPhone = '+420 123-456 789'
    render(<TripScreen {...props} />)
    openSheet()
    expect(screen.getByRole('link', { name: 'Call passenger' })).toHaveAttribute('href', 'tel:+420123456789')
    expect(screen.getByRole('link', { name: 'Message passenger' })).toHaveAttribute('href', 'sms:+420123456789')
  })

  it('a long passenger name is a single ellipsised line in the card above the map', () => {
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

  it('Navigate buttons open a chooser whose Google Maps link goes to the coordinates in a new tab', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    const expected = [
      ['Navigate to pickup', 'https://www.google.com/maps/dir/?api=1&destination=50.1,14.26'],
      ['Navigate to drop-off', 'https://www.google.com/maps/dir/?api=1&destination=50.08,14.42'],
    ]
    for (const [name, href] of expected) {
      await user.click(screen.getByRole('button', { name }))
      const google = within(screen.getByRole('dialog', { name })).getByRole('link', { name: 'Google Maps' })
      expect(google).toHaveAttribute('href', href)
      expect(google).toHaveAttribute('target', '_blank')
      expect(google).toHaveAttribute('rel', 'noopener noreferrer')
      expect(google.getAttribute('href')).not.toContain(TOKEN)
      await user.keyboard('{Escape}')
    }
  })

  it('Navigate falls back to the encoded address when coordinates are missing', async () => {
    const user = userEvent.setup()
    const props = makeProps()
    props.trip = { ...props.trip, origin: null, originAddress: 'Wenceslas Square 1' }
    render(<TripScreen {...props} />)
    await user.click(screen.getByRole('button', { name: 'Navigate to pickup' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=Wenceslas%20Square%201',
    )
    expect(within(dialog).getByRole('link', { name: 'Waze' })).toHaveAttribute(
      'href',
      'https://waze.com/ul?q=Wenceslas%20Square%201&navigate=yes',
    )
  })

  it('renders no Navigate button when there are neither coordinates nor an address', () => {
    const props = makeProps()
    props.trip = { ...props.trip, destination: null, destinationAddress: '' }
    render(<TripScreen {...props} />)
    expect(screen.queryByRole('button', { name: 'Navigate to drop-off' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Navigate to pickup' })).toBeInTheDocument()
  })

  it('keeps the chip across a router.refresh re-render with fresh prop objects', () => {
    const { rerender } = render(<TripScreen {...makeProps()} />)
    act(() => routeMapProbe.props?.onRouteInfo?.(12.4, 18))
    rerender(<TripScreen {...makeProps()} />)
    expect(screen.getByText('12.4 km · 18 min (est.)')).toBeInTheDocument()
  })
})

describe('TripScreen: no-show request (D-15, D-16)', () => {
  const ON_SITE = { status: 'on_location', nextStep: 'on_board' as const }
  // 2026-11-04 13:35Z = 14:35 Prague (CET).
  const AVAILABLE_AT = '2026-11-04T13:35:00Z'

  function noShowButton() {
    return screen.queryByRole('button', { name: 'Request no-show' })
  }

  it('before availableAt: caption with the Prague time, no button, the slide control still says Passenger on board', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T13:00:00Z'))
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT })} />)
    expect(screen.getByText('You can request a no-show after 14:35.')).toBeInTheDocument()
    expect(noShowButton()).not.toBeInTheDocument()
    expect(screen.getByText('Passenger on board')).toBeInTheDocument()
  })

  it('at availableAt a single timer swaps the caption for the neutral button', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-04T13:34:00Z'))
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT })} />)
    expect(noShowButton()).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    const btn = noShowButton()
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveStyle({ minHeight: '48px', width: '100%' })
    expect(screen.queryByText(/You can request a no-show after/)).not.toBeInTheDocument()
    // Neutral outline: not the accent fill and not a danger colour.
    expect(btn!.getAttribute('style')).not.toMatch(/accent|danger/)
  })

  it('shows the button at once when availableAt has already passed or is unknown', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T14:00:00Z'))
    const { unmount } = render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT })} />)
    expect(noShowButton()).toBeInTheDocument()
    unmount()
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: null })} />)
    expect(noShowButton()).toBeInTheDocument()
  })

  it('opens the no-show dialog; "Not yet" sends nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T14:00:00Z'))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT })} />)
    await user.click(noShowButton()!)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Request a no-show')).toBeInTheDocument()
    expect(
      within(dialog).getByText('The office will try to reach the passenger. Nothing is charged and the trip stays open.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Not yet' })).toHaveFocus()
    // The step slide is not in "awaiting confirm": the no-show dialog is separate.
    expect(screen.queryByText('Confirm to continue')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Not yet' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(noShowButton()).toBeInTheDocument()
  })

  it('"Send request" posts { action: request_no_show } once and replaces the button with the requested line', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T14:00:00Z'))
    fetchMock.mockReturnValue(
      jsonResponse(200, {
        ok: true,
        status: 'on_location',
        nextStep: 'on_board',
        noShowRequestedAt: '2026-11-04T13:41:00Z',
      }),
    )
    const user = userEvent.setup()
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT })} />)
    await user.click(noShowButton()!)
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Send request' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/driver/trip/${TOKEN}/progress`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ action: 'request_no_show' })

    expect(
      await screen.findByText('No-show requested at 14:41. The office is trying to reach the passenger.'),
    ).toBeInTheDocument()
    expect(noShowButton()).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refreshMock).toHaveBeenCalled()
    // Status is unchanged and the step control is still available.
    expect(screen.getByText('Passenger on board')).toBeInTheDocument()
  })

  it('the requested line is role=status', () => {
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT, requestedAt: '2026-11-04T13:41:00Z' })} />)
    const line = screen.getByText('No-show requested at 14:41. The office is trying to reach the passenger.')
    expect(line.closest('[role="status"]')).not.toBeNull()
  })

  it('requestedAt set on load: only the requested line renders', () => {
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT, requestedAt: '2026-11-04T13:41:00Z' })} />)
    expect(screen.getByText(/No-show requested at 14:41/)).toBeInTheDocument()
    expect(noShowButton()).not.toBeInTheDocument()
    expect(screen.queryByText(/You can request a no-show after/)).not.toBeInTheDocument()
  })

  it('the office dismissing the request (next refresh, requestedAt null) brings the button back', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T14:00:00Z'))
    const { rerender } = render(
      <TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT, requestedAt: '2026-11-04T13:41:00Z' })} />,
    )
    expect(noShowButton()).not.toBeInTheDocument()
    rerender(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT, requestedAt: null })} />)
    expect(noShowButton()).toBeInTheDocument()
  })

  it('a 409 too_early closes the dialog, shows an amber banner and refreshes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T14:00:00Z'))
    fetchMock.mockReturnValue(
      jsonResponse(409, {
        ok: false,
        error: 'too_early',
        status: 'on_location',
        nextStep: 'on_board',
        noShowAvailableAt: '2026-11-04T14:30:00Z',
      }),
    )
    const user = userEvent.setup()
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT })} />)
    await user.click(noShowButton()!)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() =>
      expect(screen.getByText('Too early to request a no-show. You can request it after 15:30.')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('a 409 step_conflict shows the conflict banner and refreshes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T14:00:00Z'))
    fetchMock.mockReturnValue(
      jsonResponse(409, { ok: false, error: 'step_conflict', status: 'on_board', nextStep: 'completed' }),
    )
    const user = userEvent.setup()
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT })} />)
    await user.click(noShowButton()!)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() =>
      expect(
        screen.getByText('The office has updated this trip (On board). Showing the latest step.'),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('a network failure keeps the dialog open with a retry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T14:00:00Z'))
    fetchMock.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT })} />)
    await user.click(noShowButton()!)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it.each([
    ['assigned', 'en_route'],
    ['en_route', 'on_site'],
    ['on_board', 'completed'],
  ] as const)('status %s: no no-show block at all', (status, nextStep) => {
    render(<TripScreen {...makeProps({ status, nextStep }, { availableAt: AVAILABLE_AT })} />)
    expect(screen.queryByText(/no-show/i)).not.toBeInTheDocument()
    expect(noShowButton()).not.toBeInTheDocument()
  })

  it('never mentions money beyond the locked sentence', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T14:00:00Z'))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps(ON_SITE, { availableAt: AVAILABLE_AT })} />)
    await user.click(noShowButton()!)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/€|EUR|CZK|fee|penalty|refund/i)
    expect(text.match(/charged/gi)).toHaveLength(1)
  })
})

describe('TripScreen: sheet handle, details and driver note (D-21)', () => {
  function handle() {
    return screen.getByRole('button', { name: /(Show|Hide) trip details/ })
  }

  function swipe(el: Element, fromY: number, toY: number, dx = 0) {
    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: fromY }] })
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 100 + dx, clientY: toY }] })
  }

  it('a short swipe up on the handle opens the details, a swipe down closes them', () => {
    render(<TripScreen {...makeProps()} />)
    swipe(handle(), 400, 360)
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText('Passenger')).toHaveLength(2)
    swipe(handle(), 360, 400)
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByText('Passenger')).toHaveLength(1)
  })

  it('a swipe up on the pickup time row opens the details too', () => {
    render(<TripScreen {...makeProps()} />)
    const timeRow = screen.getByText(/Tue|Mon|Wed|Thu|Fri|Sat|Sun/).closest('div')!.parentElement!
    swipe(timeRow, 500, 450)
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('a mostly horizontal drag does nothing', () => {
    render(<TripScreen {...makeProps()} />)
    swipe(handle(), 400, 360, 80)
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('a downward drag while the page is scrolled scrolls, it does not close the details', () => {
    render(<TripScreen {...makeProps()} />)
    swipe(handle(), 400, 340)
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
    const prev = window.scrollY
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true })
    try {
      swipe(handle(), 340, 400)
      expect(handle()).toHaveAttribute('aria-expanded', 'true')
    } finally {
      Object.defineProperty(window, 'scrollY', { value: prev, configurable: true })
    }
  })

  it('a movement under the threshold does nothing, and the click after a swipe does not undo it', () => {
    render(<TripScreen {...makeProps()} />)
    swipe(handle(), 400, 390)
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
    swipe(handle(), 400, 340)
    fireEvent.click(handle())
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('the handle is collapsed by default with a 48px hit area and toggles aria-expanded and the label', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
    expect(handle()).toHaveAccessibleName('Show trip details')
    expect(handle()).toHaveStyle({ minHeight: '48px' })
    expect(screen.queryByText('Booking')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Note for the office')).not.toBeInTheDocument()

    await user.click(handle())
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
    expect(handle()).toHaveAccessibleName('Hide trip details')
    expect(screen.getByText('Booking')).toBeInTheDocument()

    await user.click(handle())
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Booking')).not.toBeInTheDocument()
  })

  it('expanded: shows the booking reference with tabular numerals', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(handle())
    const ref = screen.getByText('PRG-100')
    expect(ref).toHaveStyle({ fontVariantNumeric: 'tabular-nums' })
  })

  it('Flight and Notes from the client rows render only when present', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TripScreen {...makeProps()} />)
    await user.click(handle())
    expect(screen.queryByText('Flight')).not.toBeInTheDocument()
    expect(screen.queryByText('Notes from the client')).not.toBeInTheDocument()
    unmount()

    const props = makeProps()
    props.trip = { ...props.trip, flight: 'OK 123', clientNotes: 'Two large suitcases' }
    render(<TripScreen {...props} />)
    await user.click(handle())
    expect(screen.getByText('Flight')).toBeInTheDocument()
    expect(screen.getByText('OK 123')).toBeInTheDocument()
    expect(screen.getByText('Notes from the client')).toBeInTheDocument()
    expect(screen.getByText('Two large suitcases')).toBeInTheDocument()
  })

  it('addresses clamp to 2 lines only while the sheet is collapsed', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    expect(screen.getByText('Prague Airport')).toHaveClass('driver-address-clamp')
    expect(screen.getByText('Wenceslas Square')).toHaveClass('driver-address-clamp')
    await user.click(handle())
    expect(screen.getByText('Prague Airport')).not.toHaveClass('driver-address-clamp')
    expect(screen.getByText('Wenceslas Square')).not.toHaveClass('driver-address-clamp')
  })

  it('the note textarea is prefilled, 16px text, maxLength 2000 and Send note is disabled while empty', async () => {
    const user = userEvent.setup()
    const props = makeProps()
    props.initialNote = 'Running 5 min late'
    const { unmount } = render(<TripScreen {...props} />)
    await user.click(handle())
    const area = screen.getByLabelText('Note for the office')
    expect(area).toHaveValue('Running 5 min late')
    expect(area).toHaveAttribute('maxlength', '2000')
    expect(area).toHaveAttribute('placeholder', 'Optional, for example: passenger running late')
    expect(area).toHaveStyle({ fontSize: 'var(--driver-fs-body)' })
    expect(screen.getByRole('button', { name: 'Send note' })).toBeEnabled()
    unmount()

    render(<TripScreen {...makeProps()} />)
    await user.click(handle())
    expect(screen.getByLabelText('Note for the office')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Send note' })).toBeDisabled()
  })

  it('posts { note } only; Sending… disables the textarea; then "Note sent", cleared by the next edit', async () => {
    let resolve!: (r: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(handle())
    const area = screen.getByLabelText('Note for the office')
    fireEvent.change(area, { target: { value: 'Passenger running late' } })
    await user.click(screen.getByRole('button', { name: 'Send note' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/driver/trip/${TOKEN}/progress`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ note: 'Passenger running late' })
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(screen.getByLabelText('Note for the office')).toBeDisabled()
    expect(screen.getByLabelText('Note for the office')).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response)
    })
    expect(screen.getByText('Note sent')).toBeInTheDocument()
    expect(screen.getByLabelText('Note for the office')).toBeEnabled()
    // A note is independent of steps: no status change, no refresh was requested for it.
    expect(refreshMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Note for the office'), { target: { value: 'Passenger running late!' } })
    expect(screen.queryByText('Note sent')).not.toBeInTheDocument()
  })

  it.each([
    ['a 500 answer', () => jsonResponse(500, { error: 'update_failed' })],
    ['a network error', () => Promise.reject(new Error('offline'))],
  ])('%s shows the role=alert error and keeps the text', async (_n, answer) => {
    fetchMock.mockImplementation(answer)
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(handle())
    fireEvent.change(screen.getByLabelText('Note for the office'), { target: { value: 'hello' } })
    await user.click(screen.getByRole('button', { name: 'Send note' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not send the note. Try again.')
    expect(screen.getByLabelText('Note for the office')).toHaveValue('hello')
    expect(screen.getByRole('button', { name: 'Send note' })).toBeEnabled()
  })

  it('a 2000-character note and a long client note wrap (overflow-wrap) instead of scrolling sideways', async () => {
    const user = userEvent.setup()
    const props = makeProps()
    props.trip = { ...props.trip, clientNotes: 'W'.repeat(400) }
    render(<TripScreen {...props} />)
    await user.click(handle())
    expect(screen.getByText('W'.repeat(400))).toHaveStyle({ overflowWrap: 'anywhere' })
    const area = screen.getByLabelText('Note for the office')
    expect(area).toHaveStyle({ width: '100%', boxSizing: 'border-box' })
    fireEvent.change(area, { target: { value: 'n'.repeat(2000) } })
    expect((area as HTMLTextAreaElement).value).toHaveLength(2000)
  })

  it('the expanded sheet and the note draft survive a re-render with new props (router.refresh)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TripScreen {...makeProps()} />)
    await user.click(handle())
    fireEvent.change(screen.getByLabelText('Note for the office'), { target: { value: 'draft in progress' } })
    rerender(<TripScreen {...makeProps({ status: 'en_route', nextStep: 'on_site' })} />)
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Note for the office')).toHaveValue('draft in progress')
    expect(screen.getByText('I have arrived')).toBeInTheDocument()
  })

  it('the draft survives collapsing and expanding the sheet', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(handle())
    fireEvent.change(screen.getByLabelText('Note for the office'), { target: { value: 'keep me' } })
    await user.click(handle())
    await user.click(handle())
    expect(screen.getByLabelText('Note for the office')).toHaveValue('keep me')
  })
})

describe('TripScreen: freshness (UI-SPEC "Freshness")', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  }

  afterEach(() => {
    setVisibility('visible')
  })

  it('refreshes every 30 s while the page is visible', () => {
    vi.useFakeTimers()
    setVisibility('visible')
    render(<TripScreen {...makeProps()} />)
    act(() => {
      vi.advanceTimersByTime(29_000)
    })
    expect(refreshMock).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(refreshMock).toHaveBeenCalledTimes(2)
  })

  it('does not refresh on the timer while the page is hidden', () => {
    vi.useFakeTimers()
    setVisibility('hidden')
    render(<TripScreen {...makeProps()} />)
    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('refreshes once when the page becomes visible and once on the online event', () => {
    vi.useFakeTimers()
    setVisibility('hidden')
    render(<TripScreen {...makeProps()} />)
    setVisibility('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(refreshMock).toHaveBeenCalledTimes(2)
  })

  it('a visibilitychange to hidden does not refresh', () => {
    vi.useFakeTimers()
    render(<TripScreen {...makeProps()} />)
    setVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it.each(['completed', 'cancelled', 'no_show'])('does not poll for the terminal status %s', (status) => {
    vi.useFakeTimers()
    render(<TripScreen {...makeProps({ status, nextStep: null })} />)
    act(() => {
      vi.advanceTimersByTime(120_000)
      window.dispatchEvent(new Event('online'))
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('stops all timers and listeners on unmount', () => {
    vi.useFakeTimers()
    const { unmount } = render(<TripScreen {...makeProps()} />)
    unmount()
    act(() => {
      vi.advanceTimersByTime(120_000)
      window.dispatchEvent(new Event('online'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('the completed in-session screen never triggers a refresh', async () => {
    fetchMock.mockReturnValue(
      jsonResponse(200, { ok: true, status: 'completed', nextStep: null, completedAt: '2026-11-04T10:05:00Z' }),
    )
    const user = userEvent.setup()
    render(<TripScreen {...makeProps({ status: 'on_board', nextStep: 'completed' })} />)
    knob().focus()
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Yes, complete trip' }))
    await screen.findByText('Trip completed')
    vi.useFakeTimers()
    act(() => {
      vi.advanceTimersByTime(120_000)
      window.dispatchEvent(new Event('online'))
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('at unlocksAt the locked control becomes ready without a reload and announces "Start step unlocked."', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-04T05:14:00Z'))
    render(<TripScreen {...makeProps({ lockReason: 'too_early', unlocksAt: '2026-11-04T05:15:00Z' })} />)
    expect(knob()).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Too early to start')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    expect(screen.queryByText('Too early to start')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next step: On my way. Double tap to confirm.' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByText('Start step unlocked.')).toBeInTheDocument()
  })
})

describe('TripScreen: navigation chooser (87-UAT gap 2)', () => {
  it('the pickup Navigate control is a button that opens a Google Maps / Waze chooser', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    const opener = screen.getByRole('button', { name: 'Navigate to pickup' })
    expect(opener).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Navigate to pickup' })
    expect(within(dialog).getByText('Prague Airport')).toBeInTheDocument()
    const google = within(dialog).getByRole('link', { name: 'Google Maps' })
    const waze = within(dialog).getByRole('link', { name: 'Waze' })
    expect(google).toHaveAttribute('href', googleMapsDirectionsUrl({ lat: 50.1, lng: 14.26 }))
    expect(waze).toHaveAttribute('href', wazeNavigationUrl({ lat: 50.1, lng: 14.26 }))
    expect(waze).toHaveAttribute('href', 'https://waze.com/ul?ll=50.1,14.26&navigate=yes')
    for (const a of [google, waze]) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
      expect(a.getAttribute('href')).not.toContain(TOKEN)
      expect(a.getAttribute('href')).not.toContain('PRG-100')
    }
  })

  it('opening the chooser sends no request', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(screen.getByRole('button', { name: 'Navigate to pickup' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('NavigateChooser behaviour (87-UAT gap 2)', () => {
  it('the drop-off button opens the drop-off address with both links for its coordinates', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(screen.getByRole('button', { name: 'Navigate to drop-off' }))
    const dialog = screen.getByRole('dialog', { name: 'Navigate to drop-off' })
    expect(within(dialog).getByText('Wenceslas Square')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      googleMapsDirectionsUrl({ lat: 50.08, lng: 14.42 }),
    )
    expect(within(dialog).getByRole('link', { name: 'Waze' })).toHaveAttribute(
      'href',
      'https://waze.com/ul?ll=50.08,14.42&navigate=yes',
    )
  })

  it('is a modal dialog with initial focus on Google Maps; Tab and Shift+Tab cycle inside', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(screen.getByRole('button', { name: 'Navigate to pickup' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    const google = screen.getByRole('link', { name: 'Google Maps' })
    const waze = screen.getByRole('link', { name: 'Waze' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(google).toHaveFocus()
    await user.tab()
    expect(waze).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab()
    expect(google).toHaveFocus()
    await user.tab({ shift: true })
    expect(cancel).toHaveFocus()
  })

  it('Escape closes it and focus returns to the Navigate button that opened it', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    const opener = screen.getByRole('button', { name: 'Navigate to drop-off' })
    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('Cancel closes it; a click on the scrim closes it; a click inside the sheet does not', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(screen.getByRole('button', { name: 'Navigate to pickup' }))
    await user.click(screen.getByText('Prague Airport', { selector: 'p' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Navigate to pickup' }))
    const scrim = screen.getByRole('dialog').parentElement as HTMLElement
    expect(scrim).toHaveClass('driver-dialog-scrim')
    await user.click(scrim)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('choosing an app closes the chooser without cancelling the link default action', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(screen.getByRole('button', { name: 'Navigate to pickup' }))
    const waze = screen.getByRole('link', { name: 'Waze' })
    // fireEvent.click returns false when a handler called preventDefault (that would block the link).
    const notPrevented = fireEvent.click(waze)
    expect(notPrevented).toBe(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('every chooser control is at least 48px high and the sheet uses the shared dialog classes', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(screen.getByRole('button', { name: 'Navigate to pickup' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('driver-dialog-sheet')
    for (const el of [
      ...within(dialog).getAllByRole('link'),
      ...within(dialog).getAllByRole('button'),
    ]) {
      expect(el).toHaveStyle({ minHeight: '48px' })
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Phase 89 plan 89-14 (CASH-04, D-11, D-21, D-22): the driver's cash step, UI-SPEC Surface 6
// ---------------------------------------------------------------------------------------------------------------------

const CASH_DUE = { amountLabel: 'EUR 80 (label)', state: 'due' as const }
const CASH_SETTLED = { amountLabel: 'EUR 80 (label)', state: 'settled' as const }

describe('TripScreen: cash chip and completion warning (UI-SPEC 6.1)', () => {
  it('a cash trip shows the neutral "Cash payment" chip in the details and never the amount before completion', async () => {
    const user = userEvent.setup()
    const { container } = render(<TripScreen {...makeProps()} cash={CASH_DUE} />)
    expect(screen.queryByText('Cash payment')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show trip details' }))
    expect(screen.getByText('Cash payment')).toBeInTheDocument()
    expect(container.textContent ?? '').not.toContain(CASH_DUE.amountLabel)
  })

  it('a non-cash trip shows no chip', async () => {
    const user = userEvent.setup()
    render(<TripScreen {...makeProps()} />)
    await user.click(screen.getByRole('button', { name: 'Show trip details' }))
    expect(screen.queryByText('Cash payment')).not.toBeInTheDocument()
  })

  it('the final step dialog shows the warning block with the amount and both sentences; completion is not blocked', async () => {
    fetchMock.mockReturnValue(jsonResponse(200, { ok: true, status: 'completed', nextStep: null, completedAt: '2026-11-04T09:41:00Z' }))
    const user = userEvent.setup()
    render(<TripScreen {...makeProps({ status: 'on_board', nextStep: 'completed' })} cash={CASH_DUE} />)
    await openStepDialog(user)

    const dialog = screen.getByRole('dialog')
    const warning = within(dialog).getByRole('status')
    expect(within(warning).getByText('CASH TO COLLECT')).toBeInTheDocument()
    expect(within(warning).getByText(CASH_DUE.amountLabel)).toBeInTheDocument()
    expect(within(warning).getByText('Collect this amount in cash from the passenger before you finish.')).toBeInTheDocument()
    expect(
      within(warning).getByText('If the passenger wants to pay by card instead, call the office before you complete the trip.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('You cannot undo this. If a step is wrong, the office can fix it.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not yet' })).toHaveFocus()

    // completion works unchanged and sends only the step
    await user.click(within(dialog).getByRole('button', { name: 'Yes, complete trip' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ step: 'completed' })
    await waitFor(() => expect(screen.getByText('Trip completed')).toBeInTheDocument())
    // the cash card follows the completion
    expect(screen.getByRole('button', { name: `I received ${CASH_DUE.amountLabel}` })).toBeInTheDocument()
  })

  it('the warning is only on the final step and only while the cash is due', async () => {
    const user = userEvent.setup()
    const first = render(<TripScreen {...makeProps()} cash={CASH_DUE} />)
    await openStepDialog(user)
    expect(within(screen.getByRole('dialog')).queryByText('CASH TO COLLECT')).not.toBeInTheDocument()
    first.unmount()

    const settled = render(<TripScreen {...makeProps({ status: 'on_board', nextStep: 'completed' })} cash={CASH_SETTLED} />)
    await openStepDialog(user)
    expect(within(screen.getByRole('dialog')).queryByText('CASH TO COLLECT')).not.toBeInTheDocument()
    settled.unmount()

    render(<TripScreen {...makeProps({ status: 'on_board', nextStep: 'completed' })} />)
    await openStepDialog(user)
    expect(within(screen.getByRole('dialog')).queryByText('CASH TO COLLECT')).not.toBeInTheDocument()
  })
})

describe('TripCompleted: the cash card (UI-SPEC 6.2, D-11, D-21)', () => {
  const SUMMARY = { bookingReference: 'PRG-1', pickupDate: '2026-11-04', completedAt: '2026-11-04T09:41:00Z' }

  it.each([
    ['in-session', { variant: 'in-session' as const, summary: SUMMARY }],
    ['reopened', { variant: 'reopened' as const }],
  ])('%s variant shows the amount, the question, the button and the call-the-office line', (_name, base) => {
    render(<TripCompleted {...base} token={TOKEN} cash={CASH_DUE} />)
    expect(screen.getByText('CASH TO COLLECT')).toBeInTheDocument()
    expect(screen.getByText(CASH_DUE.amountLabel)).toBeInTheDocument()
    expect(screen.getByText('Did the passenger pay you this amount in cash?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `I received ${CASH_DUE.amountLabel}` })).toBeInTheDocument()
    expect(screen.getByText('If the passenger did not pay, call the office.')).toBeInTheDocument()
    // the existing help, and no second answer (D-21)
    expect(screen.getByRole('link', { name: 'Call the office' })).toHaveAttribute('href', BUSINESS_TEL_URL)
    expect(screen.queryByRole('button', { name: /did not pay/i })).not.toBeInTheDocument()
    expect(screen.queryByText('The passenger did not pay')).not.toBeInTheDocument()
  })

  it('opens the confirm dialog with initial focus on "Not yet" and sends nothing until the primary button', async () => {
    const user = userEvent.setup()
    render(<TripCompleted variant="reopened" token={TOKEN} cash={CASH_DUE} />)
    await user.click(screen.getByRole('button', { name: `I received ${CASH_DUE.amountLabel}` }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Confirm cash received')).toBeInTheDocument()
    expect(within(dialog).getByText(`You received ${CASH_DUE.amountLabel} in cash from the passenger?`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not yet' })).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Not yet' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Escape cancels the dialog with no request', async () => {
    const user = userEvent.setup()
    render(<TripCompleted variant="reopened" token={TOKEN} cash={CASH_DUE} />)
    await user.click(screen.getByRole('button', { name: `I received ${CASH_DUE.amountLabel}` }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirming posts exactly { action: confirm_cash } (no amount) and turns the card into the ok line', async () => {
    fetchMock.mockReturnValue(jsonResponse(200, { ok: true, status: 'completed', nextStep: null, cash: 'settled' }))
    const user = userEvent.setup()
    render(<TripCompleted variant="reopened" token={TOKEN} cash={CASH_DUE} />)
    await user.click(screen.getByRole('button', { name: `I received ${CASH_DUE.amountLabel}` }))
    await user.click(screen.getByRole('button', { name: `Yes, I received ${CASH_DUE.amountLabel}` }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/driver/trip/${TOKEN}/progress`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ action: 'confirm_cash' })

    const line = await screen.findByText(`Cash received: ${CASH_DUE.amountLabel}. Thank you.`)
    expect(line).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /I received/ })).not.toBeInTheDocument()
    expect(screen.queryByText('If the passenger did not pay, call the office.')).not.toBeInTheDocument()
  })

  it('a replay (200 with replay) shows the same line', async () => {
    fetchMock.mockReturnValue(jsonResponse(200, { ok: true, status: 'completed', nextStep: null, cash: 'settled', replay: true }))
    const user = userEvent.setup()
    render(<TripCompleted variant="reopened" token={TOKEN} cash={CASH_DUE} />)
    await user.click(screen.getByRole('button', { name: `I received ${CASH_DUE.amountLabel}` }))
    await user.click(screen.getByRole('button', { name: `Yes, I received ${CASH_DUE.amountLabel}` }))
    expect(await screen.findByText(`Cash received: ${CASH_DUE.amountLabel}. Thank you.`)).toBeInTheDocument()
  })

  it('an already settled booking opens on the ok line with no buttons', () => {
    render(<TripCompleted variant="reopened" token={TOKEN} cash={CASH_SETTLED} />)
    expect(screen.getByText(`Cash received: ${CASH_SETTLED.amountLabel}. Thank you.`)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([
    [409, 'This booking changed. Reload the page.'],
    [422, 'This booking changed. Reload the page.'],
    [429, 'Too many taps. Wait a moment.'],
    [500, 'Could not send your answer. Try again.'],
  ])('a %s answer shows its copy with role alert and keeps the card', async (status, copy) => {
    fetchMock.mockReturnValue(jsonResponse(status, {}))
    const user = userEvent.setup()
    render(<TripCompleted variant="reopened" token={TOKEN} cash={CASH_DUE} />)
    await user.click(screen.getByRole('button', { name: `I received ${CASH_DUE.amountLabel}` }))
    await user.click(screen.getByRole('button', { name: `Yes, I received ${CASH_DUE.amountLabel}` }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(copy)
    expect(screen.queryByText(/Cash received:/)).not.toBeInTheDocument()
  })

  it('a network failure shows the generic copy and the driver can try again', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('network')))
    fetchMock.mockImplementationOnce(() => jsonResponse(200, { ok: true, status: 'completed', nextStep: null, cash: 'settled' }))
    const user = userEvent.setup()
    render(<TripCompleted variant="reopened" token={TOKEN} cash={CASH_DUE} />)
    await user.click(screen.getByRole('button', { name: `I received ${CASH_DUE.amountLabel}` }))
    await user.click(screen.getByRole('button', { name: `Yes, I received ${CASH_DUE.amountLabel}` }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send your answer. Try again.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(`Cash received: ${CASH_DUE.amountLabel}. Thank you.`)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a non-cash trip is unchanged: no card, no amount, no extra line', () => {
    const { container } = render(<TripCompleted variant="reopened" />)
    expect(screen.queryByText('CASH TO COLLECT')).not.toBeInTheDocument()
    expect(screen.queryByText('If the passenger did not pay, call the office.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/€|EUR|CZK|amount|cash/i)
  })
})

describe('InvalidTripLinkView: the cancelled line (UI-SPEC 6.3)', () => {
  it('says the trip was cancelled and shows the reference only', () => {
    const { container } = render(<InvalidTripLinkView cancelledReference="PRG-100" />)
    expect(screen.getByText('This trip was cancelled. You do not need to go.')).toBeInTheDocument()
    expect(screen.getByText('Booking PRG-100')).toBeInTheDocument()
    expect(screen.queryByText('This trip link is no longer active.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call the office' })).toHaveAttribute('href', BUSINESS_TEL_URL)
    expect(container.textContent ?? '').not.toMatch(/Alice|Smith|Prague Airport|€|EUR|CZK/)
  })

  it('without a reference it stays the uniform view', () => {
    const { container } = render(<InvalidTripLinkView />)
    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/cancelled|Booking/)
  })
})
