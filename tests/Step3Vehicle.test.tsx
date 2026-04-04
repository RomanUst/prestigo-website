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

    it('Round Trip button shows "Enter return details below" when no roundTripPrice', () => {
      renderCard({ roundTripPrice: null })
      expect(screen.getByText(/enter return details below/i)).toBeInTheDocument()
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
})
