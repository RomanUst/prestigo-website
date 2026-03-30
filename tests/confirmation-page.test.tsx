import { describe, it } from 'vitest'

describe('Confirmation Page', () => {
  describe('Store reset on arrival', () => {
    it.todo('calls resetBooking on mount')
    it.todo('does not display stale booking data after reset')
  })

  describe('Paid booking confirmation', () => {
    it.todo('renders BOOKING CONFIRMED label')
    it.todo('renders booking reference from URL ref param')
    it.todo('renders Print / Save PDF button')
    it.todo('renders Add to Calendar button')
    it.todo('renders Contact Us button')
  })

  describe('Quote confirmation (type=quote)', () => {
    it.todo('renders QUOTE REQUEST SENT label')
    it.todo('renders QR- prefixed reference')
    it.todo('renders quote body copy about 2-hour response')
  })

  describe('Empty state', () => {
    it.todo('renders session expired message when no ref param')
  })
})
