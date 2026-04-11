import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TripTypeTabs from '@/components/booking/TripTypeTabs'
import { useBookingStore } from '@/lib/booking-store'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

describe('TripTypeTabs', () => {
  beforeEach(() => {
    pushMock.mockClear()
    useBookingStore.setState({ tripType: 'transfer', quoteMode: false })
  })

  it('renders 3 tabs: TRANSFER, HOURLY, MULTI-DAY', () => {
    render(<TripTypeTabs />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveTextContent('TRANSFER')
    expect(tabs[1]).toHaveTextContent('HOURLY')
    expect(tabs[2]).toHaveTextContent('MULTI-DAY')
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

  it('TRANSFER tab shows aria-selected when tripType is round_trip (round_trip = transfer variant)', () => {
    useBookingStore.setState({ tripType: 'round_trip' })
    render(<TripTypeTabs />)
    const tabs = screen.getAllByRole('tab')
    // TRANSFER tab should appear active when round_trip is selected
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('clicking MULTI-DAY tab calls router.push("/book/multi-day")', async () => {
    const user = userEvent.setup()
    render(<TripTypeTabs />)
    await user.click(screen.getByRole('tab', { name: 'MULTI-DAY' }))
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/book/multi-day')
  })

  it('clicking MULTI-DAY tab does NOT update store tripType', async () => {
    const user = userEvent.setup()
    useBookingStore.setState({ tripType: 'transfer' })
    render(<TripTypeTabs />)
    await user.click(screen.getByRole('tab', { name: 'MULTI-DAY' }))
    expect(useBookingStore.getState().tripType).toBe('transfer')
  })

  it('MULTI-DAY tab is never aria-selected even when store tripType is "daily"', () => {
    useBookingStore.setState({ tripType: 'daily' })
    render(<TripTypeTabs />)
    const multiDayTab = screen.getByRole('tab', { name: 'MULTI-DAY' })
    expect(multiDayTab).toHaveAttribute('aria-selected', 'false')
  })
})
