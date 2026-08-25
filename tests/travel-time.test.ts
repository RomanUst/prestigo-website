import { describe, it, expect } from 'vitest'
import { estimateTravelMinutes } from '@/lib/travel-time'

describe('estimateTravelMinutes', () => {
  it('returns null when distance is unknown', () => {
    expect(estimateTravelMinutes(null)).toBeNull()
    expect(estimateTravelMinutes(0)).toBeNull()
  })

  it('estimates a short city transfer under an hour', () => {
    // Prague airport → city centre (~17 km)
    expect(estimateTravelMinutes(17)).toBeLessThan(60)
  })

  it('estimates a long intercity route near real drive time, not double it', () => {
    // Prague → Munich (~378 km road). Real drive ~4h; the old flat-45km/h
    // formula wrongly produced ~8.5h.
    const min = estimateTravelMinutes(378)!
    expect(min).toBeGreaterThan(3.5 * 60)
    expect(min).toBeLessThan(5 * 60)
  })

  it('scales monotonically with distance', () => {
    expect(estimateTravelMinutes(150)!).toBeLessThan(estimateTravelMinutes(330)!)
    expect(estimateTravelMinutes(330)!).toBeLessThan(estimateTravelMinutes(378)!)
  })
})
