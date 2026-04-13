import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useBookingStore } from '@/lib/booking-store'
import Step2DateTime from '@/components/booking/steps/Step2DateTime'

function resetStore(overrides: Record<string, unknown> = {}) {
  useBookingStore.setState({
    tripType: 'transfer',
    pickupDate: null,
    pickupTime: null,
    returnDate: null,
    returnTime: null,
    ...overrides,
  })
}

describe('Step2DateTime', () => {
  describe('STEP2-01: Pickup date selection', () => {
    it.todo('renders an inline DayPicker calendar (not a popover)')
    it.todo('past dates are disabled and not selectable')
    it.todo('selecting a date calls setPickupDate with ISO format string')
    it.todo('selected date shows copper background styling')
  })

  describe('STEP2-02: Pickup time selection', () => {
    it.todo('renders 96 time slots at 15-minute increments')
    it.todo('time slots are rendered in a listbox with role="listbox"')
    it.todo('each slot has role="option" and aria-selected')
    it.todo('selecting a time calls setPickupTime with HH:MM format')
    it.todo('selected time slot scrolls into view')
  })

  describe('STEP2-03: Daily Hire return date', () => {
    it.todo('shows second calendar when tripType is "daily"')
    it.todo('hides return date calendar for non-daily trip types')
    it.todo('return date cannot be before pickup date')
    it.todo('changing pickup date clears return date if now invalid')
  })

  describe('STEP2-04: Return date section', () => {
    it('does NOT render RETURN DATE label when tripType is round_trip', () => {
      resetStore({
        tripType: 'round_trip',
        pickupDate: '2026-05-10',
        pickupTime: '14:00',
      })
      render(<Step2DateTime />)
      expect(screen.queryByText(/RETURN DATE/i)).toBeNull()
    })

    it('does NOT render return time listbox when tripType is round_trip', () => {
      resetStore({
        tripType: 'round_trip',
        pickupDate: '2026-05-10',
        pickupTime: '14:00',
        returnDate: '2026-05-10',
      })
      render(<Step2DateTime />)
      expect(screen.queryByRole('listbox', { name: /return time/i })).toBeNull()
    })

    it('does NOT render return date or return time sections when tripType is transfer', () => {
      resetStore({
        tripType: 'transfer',
        pickupDate: '2026-05-10',
        pickupTime: '14:00',
      })
      render(<Step2DateTime />)
      expect(screen.queryByText(/RETURN DATE/i)).toBeNull()
      expect(screen.queryByRole('listbox', { name: /return time/i })).toBeNull()
    })

    it('shows RETURN DATE calendar for daily trip type but NO return time listbox', () => {
      resetStore({
        tripType: 'daily',
        pickupDate: '2026-05-10',
        pickupTime: '09:00',
      })
      render(<Step2DateTime />)
      expect(screen.getByText(/RETURN DATE/i)).toBeTruthy()
      expect(screen.queryByRole('listbox', { name: /return time/i })).toBeNull()
    })
  })
})
