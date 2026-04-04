import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TripTypeTabs from '@/components/booking/TripTypeTabs'
import { useBookingStore } from '@/lib/booking-store'

describe('TripTypeTabs', () => {
  beforeEach(() => {
    useBookingStore.setState({ tripType: 'transfer', quoteMode: false })
  })

  it('renders 4 tabs: TRANSFER, HOURLY, DAILY, ROUND TRIP', () => {
    render(<TripTypeTabs />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
    expect(tabs[0]).toHaveTextContent('TRANSFER')
    expect(tabs[1]).toHaveTextContent('HOURLY')
    expect(tabs[2]).toHaveTextContent('DAILY')
    expect(tabs[3]).toHaveTextContent('ROUND TRIP')
  })

  it('active tab has aria-selected="true"', () => {
    render(<TripTypeTabs />)
    const tabs = screen.getAllByRole('tab')
    // Default tripType is 'transfer'
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[3]).toHaveAttribute('aria-selected', 'false')
  })

  it('container has role="tablist"', () => {
    render(<TripTypeTabs />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('clicking ROUND TRIP tab updates store to round_trip', async () => {
    const user = userEvent.setup()
    render(<TripTypeTabs />)
    const roundTripTab = screen.getByRole('tab', { name: 'ROUND TRIP' })
    await user.click(roundTripTab)
    expect(useBookingStore.getState().tripType).toBe('round_trip')
  })

  it('round_trip tab shows aria-selected when active', () => {
    useBookingStore.setState({ tripType: 'round_trip' })
    render(<TripTypeTabs />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
  })

  describe('TTABS-RT: quoteMode guard', () => {
    it('quoteMode=true → Round Trip tab has aria-disabled="true" and cursor not-allowed', () => {
      useBookingStore.setState({ quoteMode: true })
      render(<TripTypeTabs />)
      const roundTripTab = screen.getByRole('tab', { name: 'ROUND TRIP' })
      expect(roundTripTab).toHaveAttribute('aria-disabled', 'true')
      expect(roundTripTab).toHaveStyle({ cursor: 'not-allowed' })
    })

    it('quoteMode=true → clicking Round Trip tab does not change trip type', async () => {
      const user = userEvent.setup()
      useBookingStore.setState({ quoteMode: true, tripType: 'transfer' })
      render(<TripTypeTabs />)
      const roundTripTab = screen.getByRole('tab', { name: 'ROUND TRIP' })
      await user.click(roundTripTab)
      expect(useBookingStore.getState().tripType).toBe('transfer')
    })

    it('quoteMode=false → Round Trip tab is clickable and functional', async () => {
      const user = userEvent.setup()
      useBookingStore.setState({ quoteMode: false, tripType: 'transfer' })
      render(<TripTypeTabs />)
      const roundTripTab = screen.getByRole('tab', { name: 'ROUND TRIP' })
      expect(roundTripTab).not.toHaveAttribute('aria-disabled', 'true')
      await user.click(roundTripTab)
      expect(useBookingStore.getState().tripType).toBe('round_trip')
    })

    it('quoteMode=true AND tripType=round_trip → inline message appears', () => {
      useBookingStore.setState({ quoteMode: true, tripType: 'round_trip' })
      render(<TripTypeTabs />)
      expect(screen.getByText(/round trip is unavailable outside our coverage zone/i)).toBeInTheDocument()
    })

    it('quoteMode=true AND tripType=transfer → inline message does NOT appear', () => {
      useBookingStore.setState({ quoteMode: true, tripType: 'transfer' })
      render(<TripTypeTabs />)
      expect(screen.queryByText(/round trip is unavailable outside our coverage zone/i)).not.toBeInTheDocument()
    })
  })
})
