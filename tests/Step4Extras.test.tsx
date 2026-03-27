import { describe, it } from 'vitest'

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
