import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useBookingStore } from '@/lib/booking-store'
import type { PriceBreakdown, VehicleClass } from '@/types/booking'
import StickyBookingPanel from '@/components/booking/StickyBookingPanel'

// Mock RouteMap to avoid Google Maps in this test suite
vi.mock('@/components/booking/RouteMap', () => ({
  default: () => <div data-testid="route-map-stub" />,
}))

// Mock MetaPixel so trackMetaEvent is observable
vi.mock('@/components/MetaPixel', () => ({
  trackMetaEvent: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Import trackMetaEvent AFTER mock is set up
import { trackMetaEvent } from '@/components/MetaPixel'

const mockPriceBreakdown: Record<VehicleClass, PriceBreakdown> = {
  business: { base: 84, extras: 0, total: 84, currency: 'EUR' },
  first_class: { base: 140, extras: 0, total: 140, currency: 'EUR' },
  business_van: { base: 120, extras: 0, total: 120, currency: 'EUR' },
}

function setupStoreWithVehicle() {
  sessionStorage.setItem('booking_deeplink', '1')
  useBookingStore.setState({
    tripType: 'transfer',
    vehicleClass: 'business',
    priceBreakdown: mockPriceBreakdown,
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
    currentStep: 2,
    completedSteps: new Set([1]),
  })
}

describe('StickyBookingPanel', () => {
  beforeEach(() => {
    setupStoreWithVehicle()
    vi.stubGlobal('gtag', vi.fn())
    vi.mocked(trackMetaEvent).mockClear()
  })

  describe('TRACK-02: Analytics on CTA click', () => {
    it('calls window.gtag with "begin_checkout" when SELECT CTA is clicked', async () => {
      const user = userEvent.setup()
      render(<StickyBookingPanel />)

      // The CTA must contain "SELECT" text (e.g. "SELECT BUSINESS")
      const cta = screen.getByRole('button', { name: /select/i })
      await user.click(cta)

      const gtagFn = window.gtag as ReturnType<typeof vi.fn>
      const beginCheckoutCalls = gtagFn.mock.calls.filter(
        (call: unknown[]) => call[0] === 'event' && call[1] === 'begin_checkout'
      )
      expect(beginCheckoutCalls).toHaveLength(1)
    })

    it('calls trackMetaEvent with "InitiateCheckout" when SELECT CTA is clicked', async () => {
      const user = userEvent.setup()
      render(<StickyBookingPanel />)

      const cta = screen.getByRole('button', { name: /select/i })
      await user.click(cta)

      expect(trackMetaEvent).toHaveBeenCalledWith(
        'InitiateCheckout',
        expect.objectContaining({ currency: expect.any(String) })
      )
    })
  })

  describe('Round-trip combined total (desktop panel)', () => {
    const roundTripBreakdown: Record<VehicleClass, PriceBreakdown> = {
      business: { base: 76, extras: 0, total: 76, currency: 'EUR' },
      first_class: { base: 126, extras: 0, total: 126, currency: 'EUR' },
      business_van: { base: 108, extras: 0, total: 108, currency: 'EUR' },
    }

    it('shows Outbound + Return + Combined breakdown for round trips', () => {
      useBookingStore.setState({
        tripType: 'round_trip',
        roundTripPriceBreakdown: roundTripBreakdown,
        returnDiscountPercent: 10,
      })
      render(<StickyBookingPanel />)
      // Outbound 84 + return 76 = combined 160
      expect(screen.getByText('Outbound')).toBeInTheDocument()
      expect(screen.getByText('Combined')).toBeInTheDocument()
      expect(screen.getByText('€84')).toBeInTheDocument()
      expect(screen.getByText('€76')).toBeInTheDocument()
      expect(screen.getByText('€160')).toBeInTheDocument()
    })

    it('begin_checkout value includes the return leg for round trips', async () => {
      const user = userEvent.setup()
      useBookingStore.setState({
        tripType: 'round_trip',
        roundTripPriceBreakdown: roundTripBreakdown,
        returnDiscountPercent: 10,
      })
      render(<StickyBookingPanel />)
      await user.click(screen.getByRole('button', { name: /select/i }))
      const gtagFn = window.gtag as ReturnType<typeof vi.fn>
      const call = gtagFn.mock.calls.find(
        (c: unknown[]) => c[0] === 'event' && c[1] === 'begin_checkout'
      )
      expect(call?.[2]).toMatchObject({ value: 160 })
    })
  })
})
