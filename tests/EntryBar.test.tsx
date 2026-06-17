import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useBookingStore } from '@/lib/booking-store'
import { PRG_CONFIG } from '@/types/booking'
import EntryBar from '@/components/booking/EntryBar'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

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
    it('renders CTA with text "Посмотреть варианты"', () => {
      render(<EntryBar />)
      expect(screen.getByText('Посмотреть варианты')).toBeInTheDocument()
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
      const cta = screen.getByText('Посмотреть варианты')
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
      const cta = screen.getByText('Посмотреть варианты')
      await user.click(cta)
      expect(useBookingStore.getState().currentStep).toBe(2)
    })
  })
})
