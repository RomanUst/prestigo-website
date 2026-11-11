import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import { useBookingStore } from '@/lib/booking-store'
import LandingPickupFields from '@/components/booking/LandingPickupFields'

const airport = { address: 'Vaclav Havel Airport Prague (PRG)', placeId: 'ChIJA_IVS6-UC0cRTZBQLvHG-ec', lat: 50.1008, lng: 14.26 }

beforeEach(() => {
  useBookingStore.getState().resetBooking()
  useBookingStore.setState({ origin: airport })
})

describe('LandingPickupFields (STOP-05, D-07)', () => {
  it('offers 0, 15, 30, 45, 60 and 90 minutes with "At landing" for 0 and 30 preselected', () => {
    render(<LandingPickupFields />)
    const select = screen.getByLabelText('Pickup after landing') as HTMLSelectElement
    const options = Array.from(select.options)
    expect(options.map((o) => o.value)).toEqual(['0', '15', '30', '45', '60', '90'])
    expect(options[0].textContent).toBe('At landing')
    expect(options[2].textContent).toBe('30 min after landing')
    expect(select.value).toBe('30')
  })

  it('shows no pickup line until the landing is complete', () => {
    render(<LandingPickupFields />)
    expect(screen.queryByText(/Your driver meets you/)).not.toBeInTheDocument()
  })

  it('landing 14:00 + 30 reads "Your driver meets you at 14:30"', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    render(<LandingPickupFields />)
    expect(screen.getByText('Your driver meets you at 14:30')).toBeInTheDocument()
  })

  it('choosing 90 minutes writes the offset to the store and updates the line', async () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    render(<LandingPickupFields />)
    await userEvent.setup().selectOptions(screen.getByLabelText('Pickup after landing'), '90')
    expect(useBookingStore.getState().pickupOffsetMin).toBe(90)
    expect(screen.getByText('Your driver meets you at 15:30')).toBeInTheDocument()
  })

  it('landing 23:50 + 30 rolls past midnight: the line names the next day and 00:20', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('23:50')
    render(<LandingPickupFields />)
    const line = screen.getByText(/^Your driver meets you on .+ at 00:20$/)
    expect(line.textContent).toMatch(/11/)
    expect(screen.queryByText('Your driver meets you at 00:20')).not.toBeInTheDocument()
  })
})
