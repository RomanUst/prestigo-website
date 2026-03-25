import { describe, it } from 'vitest'

describe('Step3Vehicle', () => {
  describe('STEP3-01: Vehicle class display', () => {
    it.todo('renders 3 vehicle cards: Business, First Class, Business Van')
    it.todo('each card shows vehicle photo, class name, passenger count, luggage count')
  })

  describe('STEP3-02: Vehicle card content', () => {
    it.todo('card displays calculated price when available')
    it.todo('card shows skeleton shimmer while price is loading')
    it.todo('card shows "Request a quote" in quoteMode')
  })

  describe('STEP3-03: Live price calculation', () => {
    it.todo('fetches prices from /api/calculate-price on mount')
    it.todo('fetch is called only once (not on every card click)')
    it.todo('stores all 3 vehicle prices in Zustand after fetch')
  })

  describe('STEP3-04: Vehicle selection', () => {
    it.todo('clicking a card calls setVehicleClass with the card key')
    it.todo('selected card shows copper border ring')
    it.todo('selected card has aria-pressed="true"')
  })

  describe('STEP3-05: Quote fallback', () => {
    it.todo('all 3 cards show "Request a quote" when route is unmappable')
    it.todo('user can still select a vehicle in quoteMode')
  })
})
