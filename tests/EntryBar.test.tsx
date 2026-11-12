import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import userEvent from '@testing-library/user-event'
import { useBookingStore } from '@/lib/booking-store'
import { PRG_CONFIG } from '@/types/booking'
import EntryBar from '@/components/booking/EntryBar'

// 75-14: EntryBar renders TripTypeTabs, which now imports useRouter from
// @/i18n/routing instead of next/navigation. @/i18n/routing's createNavigation()
// call needs next/navigation's real redirect/permanentRedirect exports at
// module-load time, so a full mock replacement of next/navigation (dropping
// those exports) breaks it — mock only the i18n router import instead,
// matching the pattern in tests/BookingWizard.test.tsx / tests/TripTypeTabs.test.tsx.
vi.mock('@/i18n/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/routing')>()
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
  }
})

// Prevent next/image from throwing in jsdom
vi.mock('next/image', () => ({
  default: ({ src, alt, fill: _fill, ...rest }: { src: string; alt: string; fill?: boolean; [key: string]: unknown }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />,
}))

function setupCleanState() {
  // Prevent BookingWizard deeplink reset
  sessionStorage.setItem('booking_deeplink', '1')
  useBookingStore.setState({
    tripType: 'transfer',
    origin: null,
    destination: null,
    pickupDate: null,
    pickupTime: null,
    landingDate: null,
    landingTime: null,
    pickupOffsetMin: 30,
    returnDate: null,
    returnTime: null,
    currentStep: 1,
    completedSteps: new Set([]),
    vehicleClass: null,
    passengerDetails: null,
    hours: 2,
    passengers: 1,
    luggage: 0,
    stops: [],
  })
}

describe('EntryBar', () => {
  beforeEach(() => {
    setupCleanState()
    // Stub window.gtag so analytics are observable
    vi.stubGlobal('gtag', vi.fn())
  })

  describe('BOOK-01: Field labels render', () => {
    it('renders PICKUP LOCATION field label', () => {
      render(<EntryBar />)
      expect(screen.getByText(/pickup location/i)).toBeInTheDocument()
    })

    it('renders DESTINATION field label', () => {
      render(<EntryBar />)
      expect(screen.getByText(/destination/i)).toBeInTheDocument()
    })

    it('renders DATE field label', () => {
      render(<EntryBar />)
      expect(screen.getByText(/date/i)).toBeInTheDocument()
    })

    it('renders TIME field label', () => {
      render(<EntryBar />)
      expect(screen.getByText(/time/i)).toBeInTheDocument()
    })
  })

  describe('D-04: CTA button', () => {
    it('renders CTA with text "View vehicles"', () => {
      render(<EntryBar />)
      expect(screen.getByText('View vehicles')).toBeInTheDocument()
    })
  })

  describe('BOOK-02 / D-08: AM/PM slot -> 24h store write', () => {
    it('selecting "2:15 PM" time slot writes "14:15" to the store', async () => {
      const user = userEvent.setup()
      render(<EntryBar />)

      // Find the time selector (combobox or listbox labelled by TIME)
      // The component must expose "2:15 PM" as a selectable option
      const timeControl = screen.getByRole('combobox', { name: /time/i })
      await user.selectOptions(timeControl, '14:15')

      const stored = useBookingStore.getState().pickupTime
      expect(stored).toBe('14:15')
    })
  })

  describe('BOOK-03: Conditional flight number field', () => {
    it('shows FLIGHT NUMBER field when origin is airport (placeId match)', () => {
      useBookingStore.setState({
        origin: {
          address: PRG_CONFIG.address,
          placeId: PRG_CONFIG.placeId,
          lat: PRG_CONFIG.lat,
          lng: PRG_CONFIG.lng,
        },
      })
      render(<EntryBar />)
      expect(screen.getByLabelText(/flight number/i)).toBeInTheDocument()
    })

    it('hides FLIGHT NUMBER field when origin is a non-airport place', () => {
      useBookingStore.setState({
        origin: {
          address: 'Wenceslas Square, Prague',
          placeId: 'ChIJXXXXXXXXXXXXXXXXXXXX',
          lat: 50.0802,
          lng: 14.4280,
        },
      })
      render(<EntryBar />)
      expect(screen.queryByLabelText(/flight number/i)).not.toBeInTheDocument()
    })
  })

  describe('TRACK-01: Analytics events', () => {
    it('fires form_start with form_id="booking_wizard" once on mount', () => {
      render(<EntryBar />)
      const gtagFn = window.gtag as ReturnType<typeof vi.fn>
      const formStartCalls = gtagFn.mock.calls.filter(
        (call: unknown[]) => call[0] === 'event' && call[1] === 'form_start'
      )
      expect(formStartCalls).toHaveLength(1)
      expect(formStartCalls[0][2]).toMatchObject({ form_id: 'booking_wizard' })
    })

    it('pushes checkout_progress event when a valid entry bar is submitted', async () => {
      const user = userEvent.setup()
      // Seed valid state so the form can be submitted
      useBookingStore.setState({
        origin: {
          address: 'Wenceslas Square, Prague',
          placeId: 'ChIJXXXXXXXXXXXXXXXXXXXX',
          lat: 50.0802,
          lng: 14.4280,
        },
        destination: {
          address: 'Prague Main Station',
          placeId: 'ChIJYYYYYYYYYYYYYYYYYYYY',
          lat: 50.0831,
          lng: 14.4357,
        },
        pickupDate: '2027-01-15',
        pickupTime: '10:00',
      })
      render(<EntryBar />)
      const cta = screen.getByText('View vehicles')
      await user.click(cta)

      const gtagFn = window.gtag as ReturnType<typeof vi.fn>
      const progressCalls = gtagFn.mock.calls.filter(
        (call: unknown[]) => call[0] === 'event' && call[1] === 'checkout_progress'
      )
      expect(progressCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('submitting a valid entry bar advances currentStep via nextStep()', async () => {
      const user = userEvent.setup()
      useBookingStore.setState({
        origin: {
          address: 'Wenceslas Square, Prague',
          placeId: 'ChIJXXXXXXXXXXXXXXXXXXXX',
          lat: 50.0802,
          lng: 14.4280,
        },
        destination: {
          address: 'Prague Main Station',
          placeId: 'ChIJYYYYYYYYYYYYYYYYYYYY',
          lat: 50.0831,
          lng: 14.4357,
        },
        pickupDate: '2027-01-15',
        pickupTime: '10:00',
        currentStep: 1,
        completedSteps: new Set([]),
      })
      render(<EntryBar />)
      const cta = screen.getByText('View vehicles')
      await user.click(cta)
      expect(useBookingStore.getState().currentStep).toBe(2)
    })
  })

  describe('Round-trip toggle wires tripType (regression: return leg was never priced)', () => {
    it('checking "Add return journey" flips tripType to round_trip', async () => {
      const user = userEvent.setup()
      render(<EntryBar />)
      expect(useBookingStore.getState().tripType).toBe('transfer')
      await user.click(screen.getByRole('checkbox', { name: /add return journey/i }))
      expect(useBookingStore.getState().tripType).toBe('round_trip')
    })

    it('unchecking reverts to transfer and clears return date/time', async () => {
      const user = userEvent.setup()
      useBookingStore.setState({ returnDate: '2027-01-16', returnTime: '18:00' })
      render(<EntryBar />)
      const checkbox = screen.getByRole('checkbox', { name: /add return journey/i })
      await user.click(checkbox) // on
      expect(useBookingStore.getState().tripType).toBe('round_trip')
      await user.click(checkbox) // off
      const s = useBookingStore.getState()
      expect(s.tripType).toBe('transfer')
      expect(s.returnDate).toBeNull()
      expect(s.returnTime).toBeNull()
    })

    it('round trip without return date/time is blocked from advancing', async () => {
      const user = userEvent.setup()
      useBookingStore.setState({
        origin: { address: 'Wenceslas Square, Prague', placeId: 'ChIJa', lat: 50.0802, lng: 14.4280 },
        destination: { address: 'Prague Main Station', placeId: 'ChIJb', lat: 50.0831, lng: 14.4357 },
        pickupDate: '2027-01-15',
        pickupTime: '10:00',
        currentStep: 1,
        completedSteps: new Set([]),
      })
      render(<EntryBar />)
      await user.click(screen.getByRole('checkbox', { name: /add return journey/i }))
      await user.click(screen.getByText('View vehicles'))
      // Missing return date/time → validation blocks nextStep
      expect(useBookingStore.getState().currentStep).toBe(1)
      expect(screen.getByText(/return time is required for a round trip/i)).toBeInTheDocument()
    })

    it('round trip with a valid return leg advances to step 2 and stays round_trip', async () => {
      const user = userEvent.setup()
      useBookingStore.setState({
        origin: { address: 'Wenceslas Square, Prague', placeId: 'ChIJa', lat: 50.0802, lng: 14.4280 },
        destination: { address: 'Prague Main Station', placeId: 'ChIJb', lat: 50.0831, lng: 14.4357 },
        pickupDate: '2027-01-15',
        pickupTime: '10:00',
        returnDate: '2027-01-16',
        returnTime: '18:00',
        currentStep: 1,
        completedSteps: new Set([]),
      })
      render(<EntryBar />)
      await user.click(screen.getByRole('checkbox', { name: /add return journey/i }))
      await user.click(screen.getByText('View vehicles'))
      const s = useBookingStore.getState()
      expect(s.currentStep).toBe(2)
      expect(s.tripType).toBe('round_trip')
    })
  })
})

describe('EntryBar airport mode: landing date / time (STOP-05, D-07)', () => {
  const airport = { address: PRG_CONFIG.address, placeId: PRG_CONFIG.placeId, lat: PRG_CONFIG.lat, lng: PRG_CONFIG.lng }
  const city = { address: 'Wenceslas Square, Prague', placeId: 'ChIJa', lat: 50.0802, lng: 14.428 }

  beforeEach(() => {
    setupCleanState()
    vi.stubGlobal('gtag', vi.fn())
  })

  it('an airport origin shows the Landing date / Landing time labels and the offset select', () => {
    useBookingStore.setState({ origin: airport })
    render(<EntryBar />)
    expect(screen.getByLabelText('Landing date')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Landing time' })).toBeInTheDocument()
    expect(screen.getByLabelText('Pickup after landing')).toBeInTheDocument()
  })

  it('a city origin keeps the pickup labels and has no offset select', () => {
    useBookingStore.setState({ origin: city })
    render(<EntryBar />)
    expect(screen.queryByLabelText('Landing date')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Pickup after landing')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /^time$/i })).toBeInTheDocument()
  })

  it('an airport as the DESTINATION does not switch to landing mode', () => {
    useBookingStore.setState({ origin: city, destination: airport })
    render(<EntryBar />)
    expect(screen.queryByLabelText('Landing date')).not.toBeInTheDocument()
  })

  it('hourly with an airport origin does not offer a landing (the server refuses it)', () => {
    useBookingStore.setState({ origin: airport, tripType: 'hourly' })
    render(<EntryBar />)
    expect(screen.queryByLabelText('Landing date')).not.toBeInTheDocument()
  })

  it('landing 14:00 + default 30 sets the pickup 14:30 in the store', async () => {
    const user = userEvent.setup()
    useBookingStore.setState({ origin: airport })
    render(<EntryBar />)
    fireEvent.change(screen.getByLabelText('Landing date'), { target: { value: '2027-06-10' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Landing time' }), '14:00')
    const s = useBookingStore.getState()
    expect(s.landingDate).toBe('2027-06-10')
    expect(s.landingTime).toBe('14:00')
    expect(s.pickupDate).toBe('2027-06-10')
    expect(s.pickupTime).toBe('14:30')
    expect(screen.getByText('Your driver meets you at 14:30')).toBeInTheDocument()
  })

  it('the required-field validation runs on the landing fields', async () => {
    const user = userEvent.setup()
    useBookingStore.setState({
      origin: airport,
      destination: city,
      // a stale pickup alone must not satisfy an airport booking
      pickupDate: '2027-06-10',
      pickupTime: '14:30',
    })
    render(<EntryBar />)
    await user.click(screen.getByText('View vehicles'))
    expect(useBookingStore.getState().currentStep).toBe(1)
  })

  it('a complete landing advances to step 2', async () => {
    const user = userEvent.setup()
    useBookingStore.setState({ origin: airport, destination: city })
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    render(<EntryBar />)
    await user.click(screen.getByText('View vehicles'))
    expect(useBookingStore.getState().currentStep).toBe(2)
  })

  it('a landing slot whose pickup falls inside the 12 hour lead window is disabled', () => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    // Prague wall date is close enough to the local one for a slot at "now + 1 hour" to be inside the window in any zone
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    useBookingStore.setState({ origin: airport, landingDate: today })
    render(<EntryBar />)
    const select = screen.getByRole('combobox', { name: 'Landing time' }) as HTMLSelectElement
    const slot = Array.from(select.options).find((o) => o.value === '00:00')
    expect(slot).toBeDefined()
    // 00:00 + 30 today is in the past or inside the window by definition
    expect(slot!.disabled).toBe(true)
  })
})

// UAT gap (Phase 91): the public wizard renders EntryBar at step 1, so the stops UI has to live here (STOP-01).
describe('EntryBar intermediate stops (STOP-01)', () => {
  const city = { address: 'Wenceslas Square, Prague', placeId: 'ChIJa', lat: 50.0802, lng: 14.428 }
  const far = { address: 'Karlovy Vary', placeId: 'ChIJb', lat: 50.2319, lng: 12.872 }
  const stopPlace = { address: 'Plzen', placeId: 'ChIJc', lat: 49.7384, lng: 13.3736 }

  beforeEach(() => {
    setupCleanState()
    vi.stubGlobal('gtag', vi.fn())
  })

  it('a transfer offers Add stop and adds a stop row to the store', async () => {
    const user = userEvent.setup()
    render(<EntryBar />)
    await user.click(screen.getByRole('button', { name: /add stop/i }))
    expect(useBookingStore.getState().stops).toHaveLength(1)
  })

  it('the sixth stop is not offered', () => {
    useBookingStore.setState({
      stops: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, place: stopPlace, waitMinutes: 0 })),
    })
    render(<EntryBar />)
    expect(screen.queryByRole('button', { name: /add stop/i })).not.toBeInTheDocument()
  })

  it('hourly and round trip have no stops UI (the server refuses stops there)', () => {
    useBookingStore.setState({ tripType: 'hourly' })
    const { unmount } = render(<EntryBar />)
    expect(screen.queryByRole('button', { name: /add stop/i })).not.toBeInTheDocument()
    unmount()
    useBookingStore.setState({ tripType: 'round_trip' })
    render(<EntryBar />)
    expect(screen.queryByRole('button', { name: /add stop/i })).not.toBeInTheDocument()
  })

  it('a stop without an address blocks the step with a message', async () => {
    const user = userEvent.setup()
    useBookingStore.setState({
      origin: city,
      destination: far,
      pickupDate: '2027-06-10',
      pickupTime: '14:00',
      stops: [{ id: 's1', place: null, waitMinutes: 0 }],
    })
    render(<EntryBar />)
    await user.click(screen.getByText('View vehicles'))
    expect(useBookingStore.getState().currentStep).toBe(1)
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
  })

  it('a complete stop lets the step advance and stays in the store', async () => {
    const user = userEvent.setup()
    useBookingStore.setState({
      origin: city,
      destination: far,
      pickupDate: '2027-06-10',
      pickupTime: '14:00',
      stops: [{ id: 's1', place: stopPlace, waitMinutes: 15 }],
    })
    render(<EntryBar />)
    await user.click(screen.getByText('View vehicles'))
    const s = useBookingStore.getState()
    expect(s.currentStep).toBe(2)
    expect(s.stops).toHaveLength(1)
  })
})
