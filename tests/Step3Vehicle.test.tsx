import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VehicleCard from '@/components/booking/VehicleCard'
import { VEHICLE_CONFIG } from '@/types/booking'

// ---------------------------------------------------------------------------
// Mocks for Step3Vehicle integration tests
// ---------------------------------------------------------------------------
vi.mock('@/components/booking/StickyBookingPanel', () => ({
  default: () => <div data-testid="sticky-booking-panel-stub" />,
}))

vi.mock('@/components/booking/VehicleSlideshow', () => ({
  default: () => <div data-testid="vehicle-slideshow-stub" />,
}))

vi.mock('@/components/booking/RouteMap', () => ({
  default: () => <div data-testid="route-map-stub" />,
}))

vi.mock('@/components/MetaPixel', () => ({
  trackMetaEvent: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const config = VEHICLE_CONFIG[0] // business class

const basePrice = { base: 100, total: 100, night: 0, holiday: 0, extras: 0, currency: 'EUR' }
const returnPrice = { base: 85, total: 85, night: 0, holiday: 0, extras: 0, currency: 'EUR' }

function renderCard(overrides: Partial<Parameters<typeof VehicleCard>[0]> = {}) {
  const defaultProps = {
    config,
    price: basePrice,
    roundTripPrice: returnPrice,
    returnDiscountPercent: 15,
    showRoundTripOption: true,
    isSelectedOneWay: false,
    isSelectedRoundTrip: false,
    isLoading: false,
    quoteMode: false,
    onSelectOneWay: () => {},
    onSelectRoundTrip: () => {},
  }
  return render(<VehicleCard {...defaultProps} {...overrides} />)
}

describe('VehicleCard', () => {
  describe('Two-button layout', () => {
    it('shows One Way and Round Trip buttons when showRoundTripOption=true', () => {
      renderCard()
      expect(screen.getByText(/one way/i)).toBeInTheDocument()
      expect(screen.getByText(/round trip/i)).toBeInTheDocument()
    })

    it('does NOT show Round Trip button when showRoundTripOption=false', () => {
      renderCard({ showRoundTripOption: false })
      expect(screen.getByText(/one way/i)).toBeInTheDocument()
      expect(screen.queryByText(/round trip/i)).not.toBeInTheDocument()
    })

    it('One Way button shows one-way price', () => {
      renderCard({ price: basePrice })
      expect(screen.getByText('€100')).toBeInTheDocument()
    })

    it('Round Trip button shows combined total when roundTripPrice is available', () => {
      renderCard({ price: basePrice, roundTripPrice: returnPrice })
      // combined = 100 + 85 = 185
      expect(screen.getByText('€185')).toBeInTheDocument()
    })

    it('Round Trip button shows estimated combined price when roundTripPrice is null', () => {
      renderCard({ roundTripPrice: null, price: basePrice, returnDiscountPercent: 15 })
      // estimated return = round(100 * 0.85) = 85, combined = 100 + 85 = 185
      expect(screen.getByText('€185')).toBeInTheDocument()
    })

    it('clicking One Way calls onSelectOneWay', async () => {
      const user = userEvent.setup()
      const onSelectOneWay = vi.fn()
      renderCard({ onSelectOneWay })
      const buttons = screen.getAllByRole('button')
      await user.click(buttons[0]) // first button = One Way
      expect(onSelectOneWay).toHaveBeenCalledTimes(1)
    })

    it('clicking Round Trip calls onSelectRoundTrip', async () => {
      const user = userEvent.setup()
      const onSelectRoundTrip = vi.fn()
      renderCard({ onSelectRoundTrip })
      const buttons = screen.getAllByRole('button')
      await user.click(buttons[1]) // second button = Round Trip
      expect(onSelectRoundTrip).toHaveBeenCalledTimes(1)
    })

    it('One Way button has aria-pressed="true" when isSelectedOneWay', () => {
      renderCard({ isSelectedOneWay: true })
      const buttons = screen.getAllByRole('button')
      expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    })

    it('Round Trip button has aria-pressed="true" when isSelectedRoundTrip', () => {
      renderCard({ isSelectedRoundTrip: true })
      const buttons = screen.getAllByRole('button')
      expect(buttons[1]).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('quoteMode', () => {
    it('shows Request a quote instead of price buttons', () => {
      renderCard({ quoteMode: true })
      expect(screen.getByText(/request a quote/i)).toBeInTheDocument()
      expect(screen.queryByText(/one way/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/round trip/i)).not.toBeInTheDocument()
    })
  })

  describe('discount badge', () => {
    it('shows discount percent badge on Round Trip button', () => {
      renderCard({ returnDiscountPercent: 15 })
      expect(screen.getByText(/-15%/)).toBeInTheDocument()
    })
  })

  describe('BOOK-05: What\'s included list (D-16)', () => {
    it('renders all 6 What\'s included items', () => {
      renderCard()
      expect(screen.getByText('Фиксированная цена')).toBeInTheDocument()
      expect(screen.getByText('Зарядка для телефонов')).toBeInTheDocument()
      expect(screen.getByText('60 минут бесплатного ожидания')).toBeInTheDocument()
      expect(screen.getByText('Wi-Fi')).toBeInTheDocument()
      expect(screen.getByText('Вода на борту')).toBeInTheDocument()
      expect(screen.getByText('Meet & greet')).toBeInTheDocument()
    })
  })

  describe('BOOK-05: Vehicle photo (D-14)', () => {
    it('renders exterior photo with class label in alt text', () => {
      renderCard()
      // config = VEHICLE_CONFIG[0] = { label: 'Business', ... }
      const img = screen.getByRole('img', { name: /business.*exterior/i })
      expect(img).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Step3Vehicle integration tests — layout, slideshow, StickyBookingPanel
// ---------------------------------------------------------------------------
import Step3Vehicle from '@/components/booking/steps/Step3Vehicle'
import { useBookingStore } from '@/lib/booking-store'
import type { PriceBreakdown, VehicleClass } from '@/types/booking'

vi.mock('react-day-picker', () => ({
  DayPicker: () => <div data-testid="day-picker-stub" />,
}))

const mockPrices: Record<VehicleClass, PriceBreakdown> = {
  business: { base: 84, extras: 0, total: 84, currency: 'EUR' },
  first_class: { base: 140, extras: 0, total: 140, currency: 'EUR' },
  business_van: { base: 120, extras: 0, total: 120, currency: 'EUR' },
}

function setupStore() {
  sessionStorage.setItem('booking_deeplink', '1')
  useBookingStore.setState({
    tripType: 'transfer',
    vehicleClass: 'business',
    priceBreakdown: mockPrices,
    roundTripPriceBreakdown: null,
    returnDiscountPercent: 15,
    quoteMode: false,
    origin: { address: 'Prague', placeId: 'abc', lat: 50.08, lng: 14.43 },
    destination: { address: 'Airport', placeId: 'def', lat: 50.10, lng: 14.26 },
    pickupDate: '2027-01-15',
    pickupTime: '10:00',
    currentStep: 2,
    completedSteps: new Set([1]),
  })
}

describe('Step3Vehicle', () => {
  beforeEach(() => {
    setupStore()
    // Mock fetch for price API
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        prices: mockPrices,
        returnLegPrices: null,
        returnDiscountPercent: 15,
        distanceKm: 30,
        quoteMode: false,
      }),
    }))
  })

  describe('BOOK-04/BOOK-05: Desktop layout — two-column', () => {
    it('renders StickyBookingPanel stub in desktop layout', () => {
      render(<Step3Vehicle />)
      expect(screen.getByTestId('sticky-booking-panel-stub')).toBeInTheDocument()
    })

    it('renders VehicleSlideshow stub in desktop layout', () => {
      render(<Step3Vehicle />)
      expect(screen.getByTestId('vehicle-slideshow-stub')).toBeInTheDocument()
    })

    it('renders section heading "Choose your experience"', () => {
      render(<Step3Vehicle />)
      expect(screen.getByText('Choose your experience')).toBeInTheDocument()
    })
  })
})
