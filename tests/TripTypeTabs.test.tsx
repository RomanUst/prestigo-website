import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TripTypeTabs from '@/components/booking/TripTypeTabs'
import { useBookingStore } from '@/lib/booking-store'

describe('TripTypeTabs', () => {
  beforeEach(() => {
    useBookingStore.setState({ tripType: 'transfer', quoteMode: false })
  })

  it('renders 3 tabs: TRANSFER, HOURLY, DAILY', () => {
    render(<TripTypeTabs />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveTextContent('TRANSFER')
    expect(tabs[1]).toHaveTextContent('HOURLY')
    expect(tabs[2]).toHaveTextContent('DAILY')
  })

  it('does not render a ROUND TRIP tab', () => {
    render(<TripTypeTabs />)
    expect(screen.queryByRole('tab', { name: /round trip/i })).not.toBeInTheDocument()
  })

  it('active tab has aria-selected="true"', () => {
    render(<TripTypeTabs />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('container has role="tablist"', () => {
    render(<TripTypeTabs />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('clicking HOURLY tab updates store to hourly', async () => {
    const user = userEvent.setup()
    render(<TripTypeTabs />)
    await user.click(screen.getByRole('tab', { name: 'HOURLY' }))
    expect(useBookingStore.getState().tripType).toBe('hourly')
  })

  it('clicking DAILY tab updates store to daily', async () => {
    const user = userEvent.setup()
    render(<TripTypeTabs />)
    await user.click(screen.getByRole('tab', { name: 'DAILY' }))
    expect(useBookingStore.getState().tripType).toBe('daily')
  })

  it('TRANSFER tab shows aria-selected when tripType is round_trip (round_trip = transfer variant)', () => {
    useBookingStore.setState({ tripType: 'round_trip' })
    render(<TripTypeTabs />)
    const tabs = screen.getAllByRole('tab')
    // TRANSFER tab should appear active when round_trip is selected
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })
})
