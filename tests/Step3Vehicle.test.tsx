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

function renderCard(overrides: Partial<Parameters<typeof VehicleCard>[0]> = {}) {
  const defaultProps = {
    config,
    isSelected: false,
    onSelect: () => {},
  }
  return render(<VehicleCard {...defaultProps} {...overrides} />)
}

describe('VehicleCard', () => {
  describe('BOOK-05: Card interaction', () => {
    it('clicking card calls onSelect', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      renderCard({ onSelect })
      await user.click(screen.getByRole('button'))
      expect(onSelect).toHaveBeenCalledTimes(1)
    })

    it('card has aria-pressed="true" when isSelected', () => {
      renderCard({ isSelected: true })
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    })

    it('card has aria-pressed="false" when not selected', () => {
      renderCard({ isSelected: false })
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('BOOK-05: Card content', () => {
    it('renders class label', () => {
      renderCard()
      expect(screen.getByText('Business')).toBeInTheDocument()
    })

    it('renders exterior photo with class label in alt text', () => {
      renderCard()
      const img = screen.getByRole('img', { name: /business.*exterior/i })
      expect(img).toBeInTheDocument()
    })

    it('renders passenger and luggage capacity', () => {
      renderCard()
      const capacityValues = screen.getAllByText(String(config.maxPassengers))
      expect(capacityValues.length).toBeGreaterThanOrEqual(2) // pax + luggage both show 3
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
