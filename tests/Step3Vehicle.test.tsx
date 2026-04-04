import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VehicleCard from '@/components/booking/VehicleCard'
import { VEHICLE_CONFIG } from '@/types/booking'

const config = VEHICLE_CONFIG[0] // business class

const basePrice = { base: 100, total: 100, night: 0, holiday: 0, extras: 0 }
const returnPrice = { base: 85, total: 85, night: 0, holiday: 0, extras: 0 }

function renderCard(overrides: Partial<Parameters<typeof VehicleCard>[0]> = {}) {
  const defaultProps = {
    config,
    price: basePrice,
    roundTripPrice: returnPrice,
    returnDiscountPercent: 15,
    isSelectedOneWay: false,
    isSelectedRoundTrip: false,
    isRoundTripMode: false,
    isLoading: false,
    quoteMode: false,
    onSelectOneWay: () => {},
    onSelectRoundTrip: () => {},
  }
  return render(<VehicleCard {...defaultProps} {...overrides} />)
}

describe('Step3Vehicle', () => {
  describe('STEP3-01: Vehicle class display', () => {
    it.todo('renders 3 vehicle cards: Business, First Class, Business Van')
    it.todo('each card shows vehicle photo, class name, passenger count, luggage count')
  })

  describe('STEP3-02: Vehicle card content', () => {
    it.todo('card displays calculated price when available')
    it.todo('card shows skeleton shimmer while price is loading')
    it.todo('card shows "Request a quote" in quoteMode')
  })

  describe('STEP3-03: Live price calculation', () => {
    it.todo('fetches prices from /api/calculate-price on mount')
    it.todo('fetch is called only once (not on every card click)')
    it.todo('stores all 3 vehicle prices in Zustand after fetch')
  })

  describe('STEP3-04: Vehicle selection', () => {
    it.todo('clicking a card calls setVehicleClass with the card key')
    it.todo('selected card shows copper border ring')
    it.todo('selected card has aria-pressed="true"')
  })

  describe('STEP3-05: Quote fallback', () => {
    it.todo('all 3 cards show "Request a quote" when route is unmappable')
    it.todo('user can still select a vehicle in quoteMode')
  })

  describe('STEP3-RT: Round-trip three-line VehicleCard layout', () => {
    it('isRoundTripMode=true shows Outbound, Return, Combined labels', () => {
      renderCard({ isRoundTripMode: true })
      expect(screen.getByText(/outbound/i)).toBeInTheDocument()
      expect(screen.getByText(/return/i)).toBeInTheDocument()
      expect(screen.getByText(/combined/i)).toBeInTheDocument()
    })

    it('isRoundTripMode=true does NOT show One Way / Round Trip two-button layout', () => {
      renderCard({ isRoundTripMode: true })
      expect(screen.queryByText(/one way/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/round trip/i)).not.toBeInTheDocument()
    })

    it('isRoundTripMode=false shows the two-button layout (One Way + Round Trip)', () => {
      renderCard({ isRoundTripMode: false })
      expect(screen.getByText(/one way/i)).toBeInTheDocument()
      // Round trip button only shows if roundTripPrice provided
      expect(screen.getByText(/round trip/i)).toBeInTheDocument()
    })

    it('Combined total equals price.total + roundTripPrice.total', () => {
      renderCard({ isRoundTripMode: true, price: basePrice, roundTripPrice: returnPrice })
      // combined = 100 + 85 = 185
      expect(screen.getByText(/185/)).toBeInTheDocument()
    })

    it('isRoundTripMode=true clicking card calls onSelectRoundTrip', async () => {
      const user = userEvent.setup()
      const onSelectRoundTrip = vi.fn()
      renderCard({ isRoundTripMode: true, onSelectRoundTrip })
      // The single button in round trip mode triggers onSelectRoundTrip
      const button = screen.getByRole('button', { name: /combined/i })
      await user.click(button)
      expect(onSelectRoundTrip).toHaveBeenCalledTimes(1)
    })

    it('isRoundTripMode=true + quoteMode=true shows Request a quote', () => {
      renderCard({ isRoundTripMode: true, quoteMode: true })
      expect(screen.getByText(/request a quote/i)).toBeInTheDocument()
    })
  })
})
