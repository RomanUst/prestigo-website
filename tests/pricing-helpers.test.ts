import { describe, it, expect } from 'vitest'
import { roundUpToFive, CHILD_SEAT_PRICE, EXTRA_STOP_PRICE } from '@/lib/pricing-helpers'

describe('lib/pricing-helpers', () => {
  describe('roundUpToFive', () => {
    it('returns same value when already multiple of 5', () => {
      expect(roundUpToFive(85)).toBe(85)
      expect(roundUpToFive(90)).toBe(90)
      expect(roundUpToFive(0)).toBe(0)
    })

    it('rounds up 86 to 90', () => {
      expect(roundUpToFive(86)).toBe(90)
    })

    it('rounds up 87 to 90', () => {
      expect(roundUpToFive(87)).toBe(90)
    })

    it('rounds up 3 to 5', () => {
      expect(roundUpToFive(3)).toBe(5)
    })

    it('returns 0 for 0', () => {
      expect(roundUpToFive(0)).toBe(0)
    })
  })

  describe('constants', () => {
    it('CHILD_SEAT_PRICE is 15', () => {
      expect(CHILD_SEAT_PRICE).toBe(15)
    })

    it('EXTRA_STOP_PRICE is 20', () => {
      expect(EXTRA_STOP_PRICE).toBe(20)
    })
  })
})
