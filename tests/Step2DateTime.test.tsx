import { describe, it } from 'vitest'

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
})
