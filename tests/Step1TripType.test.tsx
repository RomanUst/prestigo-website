import { describe, it } from 'vitest'

describe('Step1TripType', () => {
  describe('WIZD-03: Step 1 is trip type entry', () => {
    it.todo('renders TripTypeTabs')
    it.todo('renders origin and destination AddressInput')
    it.todo('renders Passengers and Luggage steppers')
  })

  describe('STEP1-04: conditional fields by trip type', () => {
    it.todo('hourly hides destination, shows DurationSelector')
    it.todo('airport_pickup shows read-only destination with PRG')
    it.todo('airport_dropoff shows read-only origin with PRG')
    it.todo('transfer shows swap icon between origin and destination')
  })

  describe('STEP1-07: validation and Next button', () => {
    it.todo('Continue button disabled when origin is empty')
    it.todo('Continue button disabled when destination is empty (non-hourly)')
    it.todo('shows error messages on Continue click with empty fields')
    it.todo('errors clear when field receives valid value')
    it.todo('Continue calls nextStep when all fields valid')
  })
})
