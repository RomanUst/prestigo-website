import { describe, it } from 'vitest'

describe('Step5Passenger', () => {
  describe('STEP5-01: Required fields present', () => {
    it.todo('renders First Name input field')
    it.todo('renders Last Name input field')
    it.todo('renders Email input field')
    it.todo('renders Phone input field')
    it.todo('all four fields are required (aria-required=true)')
  })

  describe('STEP5-02: Airport ride conditional fields', () => {
    it.todo('renders Flight Number field when origin is PRG airport')
    it.todo('renders Flight Number field when destination is PRG airport')
    it.todo('Flight Number is required for airport rides (aria-required=true)')
    it.todo('does not render Flight Number for non-airport rides')
    it.todo('renders Terminal field (optional) for airport rides')
  })

  describe('STEP5-03: Special Requests field', () => {
    it.todo('renders Special Requests textarea')
    it.todo('textarea has maxLength=500 attribute')
    it.todo('displays character counter showing current/500')
  })

  describe('STEP5-04: Inline validation on blur', () => {
    it.todo('no error messages shown on initial render')
    it.todo('shows "First name is required" after blur on empty First Name')
    it.todo('shows "Last name is required" after blur on empty Last Name')
    it.todo('shows "Enter a valid email address" after blur on invalid email')
    it.todo('shows "Enter a valid phone number" after blur on short phone')
    it.todo('shows "Flight number is required for airport rides" after blur on empty Flight Number for airport ride')
    it.todo('clears error message when valid value entered and field blurred again')
  })
})
