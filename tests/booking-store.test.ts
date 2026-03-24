import { describe, it } from 'vitest'

describe('booking-store', () => {
  describe('ARCH-01: Zustand store shape', () => {
    it.todo('initializes with default tripType "transfer"')
    it.todo('initializes with passengers=1, luggage=0, hours=2')
    it.todo('setTripType updates tripType')
    it.todo('setOrigin and setDestination update place fields')
    it.todo('setPassengers clamps between 1 and 8')
    it.todo('setLuggage clamps between 0 and 8')
    it.todo('nextStep increments currentStep and marks previous as completed')
    it.todo('prevStep decrements currentStep')
    it.todo('swapOriginDestination swaps origin and destination')
  })

  describe('ARCH-02: sessionStorage persistence', () => {
    it.todo('persists store state to sessionStorage')
    it.todo('rehydrates Set<number> from serialized array')
  })

  describe('airport auto-fill logic', () => {
    it.todo('airport_pickup sets destination to PRG_CONFIG')
    it.todo('airport_dropoff sets origin to PRG_CONFIG')
    it.todo('switching away from airport type clears PRG auto-fill')
  })
})
