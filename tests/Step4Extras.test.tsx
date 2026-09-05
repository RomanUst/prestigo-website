import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import Step4Extras from '@/components/booking/steps/Step4Extras'
import { EXTRAS_CONFIG } from '@/lib/extras'
import enMessages from '@/messages/en.json'

const extrasCatalog = (enMessages as { Booking: { extras: Record<string, { label: string; description: string }> } }).Booking.extras

describe('Step4Extras i18n catalog', () => {
  it('has a Booking.extras entry (label + description) for every EXTRAS_CONFIG key', () => {
    for (const { key } of EXTRAS_CONFIG) {
      expect(extrasCatalog[key], `missing Booking.extras.${key}`).toBeTruthy()
      expect(extrasCatalog[key].label, `missing label for ${key}`).toBeTruthy()
      expect(extrasCatalog[key].description, `missing description for ${key}`).toBeTruthy()
    }
  })

  it('renders each extra label from the catalog under renderWithIntl', () => {
    render(<Step4Extras />)
    for (const { key } of EXTRAS_CONFIG) {
      expect(screen.getByText(extrasCatalog[key].label)).toBeInTheDocument()
    }
  })
})

describe('Step4Extras', () => {
  describe('STEP4-01: User can add extras', () => {
    it.todo('renders three extra toggle cards: Child Seat, Meet & Greet, Extra Luggage')
    it.todo('toggling Child Seat updates extras.childSeat in Zustand store')
    it.todo('toggling Meet & Greet updates extras.meetAndGreet in Zustand store')
    it.todo('toggling Extra Luggage updates extras.extraLuggage in Zustand store')
    it.todo('selected extra card shows aria-pressed=true')
    it.todo('unselected extra card shows aria-pressed=false')
  })

  describe('STEP4-02: Each extra shows its price increment', () => {
    it.todo('Child Seat card displays +€15')
    it.todo('Meet & Greet card displays +€25')
    it.todo('Extra Luggage card displays +€20')
  })

  describe('STEP4-03: PriceSummary updates to include selected extras', () => {
    it.todo('selecting Child Seat adds 15 to displayed total')
    it.todo('selecting multiple extras sums their prices into total')
    it.todo('deselecting an extra removes its price from total')
  })
})
