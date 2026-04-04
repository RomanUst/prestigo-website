import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import PriceSummary from '@/components/booking/PriceSummary'
import { useBookingStore } from '@/lib/booking-store'

const outboundBreakdown = {
  business: { base: 100, total: 100, extras: 0, currency: 'EUR' },
  first_class: { base: 150, total: 150, extras: 0, currency: 'EUR' },
  business_van: { base: 120, total: 120, extras: 0, currency: 'EUR' },
}

const returnLegBreakdown = {
  business: { base: 85, total: 85, extras: 0, currency: 'EUR' },
  first_class: { base: 128, total: 128, extras: 0, currency: 'EUR' },
  business_van: { base: 102, total: 102, extras: 0, currency: 'EUR' },
}

describe('PriceSummary', () => {
  describe('STEP3-04: Real-time price updates', () => {
    it.todo('shows selected vehicle class name')
    it.todo('shows price for selected vehicle class')
    it.todo('updates price display when vehicleClass changes in store')
    it.todo('shows em dash when no vehicle is selected')
  })

  describe('Desktop layout', () => {
    it.todo('renders journey summary with origin and destination')
    it.todo('truncates long addresses to 28 characters')
    it.todo('applies sticky positioning on desktop')
  })

  describe('Mobile layout', () => {
    it.todo('renders fixed bottom bar on mobile with price total')
    it.todo('mobile bar height is 56px')
  })

  describe('STEP3-05: Quote mode', () => {
    it.todo('shows "Request a quote" instead of price in quoteMode')
  })

  describe('STEP4-03: PriceSummary extras total', () => {
    it.todo('desktop panel displays base + extras total when extras are selected')
    it.todo('mobile bar displays base + extras total when extras are selected')
    it.todo('shows extras line items in desktop panel for each selected extra')
    it.todo('total updates when extras are toggled on and off')
  })

  describe('PSRT: Round-trip combined breakdown', () => {
    beforeEach(() => {
      useBookingStore.setState({
        tripType: 'round_trip',
        vehicleClass: 'business',
        priceBreakdown: outboundBreakdown,
        roundTripPriceBreakdown: returnLegBreakdown,
        quoteMode: false,
        extras: { childSeat: false, meetAndGreet: false, extraLuggage: false },
        currentStep: 3,
      })
    })

    it('tripType=round_trip + roundTripPriceBreakdown provided → shows Outbound, Return leg, Combined in desktop panel', () => {
      render(<PriceSummary desktopOnly />)
      expect(screen.getByText(/outbound/i)).toBeInTheDocument()
      expect(screen.getByText(/return leg/i)).toBeInTheDocument()
      expect(screen.getByText(/combined/i)).toBeInTheDocument()
    })

    it('Combined total = outboundWithExtras + returnLegPrice.total', () => {
      render(<PriceSummary desktopOnly />)
      // outbound business.total = 100, return business.total = 85, combined = 185
      expect(screen.getByText('€185')).toBeInTheDocument()
    })

    it('tripType=transfer → shows existing one-way layout (no Combined label)', () => {
      useBookingStore.setState({ tripType: 'transfer' })
      render(<PriceSummary desktopOnly />)
      expect(screen.queryByText(/combined/i)).not.toBeInTheDocument()
    })

    it('Mobile bar shows combined total when round_trip', () => {
      render(<PriceSummary mobileOnly />)
      // combined = 100 + 85 = 185
      expect(screen.getByText('€185')).toBeInTheDocument()
    })
  })
})
