import { describe, it } from 'vitest'

describe('PriceSummary', () => {
  describe('STEP3-04: Real-time price updates', () => {
    it.todo('shows selected vehicle class name')
    it.todo('shows price for selected vehicle class')
    it.todo('updates price display when vehicleClass changes in store')
    it.todo('shows em dash when no vehicle is selected')
  })

  describe('Desktop layout', () => {
    it.todo('renders journey summary with origin and destination')
    it.todo('truncates long addresses to 28 characters')
    it.todo('applies sticky positioning on desktop')
  })

  describe('Mobile layout', () => {
    it.todo('renders fixed bottom bar on mobile with price total')
    it.todo('mobile bar height is 56px')
  })

  describe('STEP3-05: Quote mode', () => {
    it.todo('shows "Request a quote" instead of price in quoteMode')
  })

  describe('STEP4-03: PriceSummary extras total', () => {
    it.todo('desktop panel displays base + extras total when extras are selected')
    it.todo('mobile bar displays base + extras total when extras are selected')
    it.todo('shows extras line items in desktop panel for each selected extra')
    it.todo('total updates when extras are toggled on and off')
  })
})
