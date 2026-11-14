import { describe, it, expect } from 'vitest'
import {
  MAX_STOPS,
  STOP_FREE_WAIT_MIN,
  WAIT_BLOCK_MIN,
  MAX_STOP_WAIT_MIN,
  MAX_EXTRA_WAIT_MIN,
  isValidStopWait,
  waitingBlocks,
  totalWaitingBlocks,
  waitingFeeEur,
  priceStops,
  waitingTotalEur,
  extraWaitingBlocks,
  extraWaitingAmountMinor,
} from '@/lib/stops'
import { eurToCzk } from '@/lib/currency'

describe('lib/stops constants', () => {
  it('match the owner policy', () => {
    expect(MAX_STOPS).toBe(5)
    expect(STOP_FREE_WAIT_MIN).toBe(15)
    expect(WAIT_BLOCK_MIN).toBe(15)
    expect(MAX_STOP_WAIT_MIN).toBe(120)
    expect(MAX_EXTRA_WAIT_MIN).toBe(480)
  })
})

describe('waitingBlocks (STOP-03 boundaries)', () => {
  it.each([
    [0, 0],
    [14, 0],
    [15, 0],
    [16, 1],
    [29, 1],
    [30, 1],
    [31, 2],
    [45, 2],
    [120, 7],
  ])('%i minutes -> %i blocks', (minutes, blocks) => {
    expect(waitingBlocks(minutes)).toBe(blocks)
  })

  it('NaN, Infinity and negative values give 0', () => {
    expect(waitingBlocks(NaN)).toBe(0)
    expect(waitingBlocks(Infinity)).toBe(0)
    expect(waitingBlocks(-15)).toBe(0)
  })
})

describe('totalWaitingBlocks (free 15 minutes per stop, never pooled)', () => {
  it('two stops of 15 minutes cost nothing', () => {
    expect(totalWaitingBlocks([{ waitMinutes: 15 }, { waitMinutes: 15 }])).toBe(0)
  })
  it('two stops of 30 minutes cost 2 blocks', () => {
    expect(totalWaitingBlocks([{ waitMinutes: 30 }, { waitMinutes: 30 }])).toBe(2)
  })
  it('does not depend on the order of the stops', () => {
    const a = [{ waitMinutes: 0 }, { waitMinutes: 45 }, { waitMinutes: 15 }]
    const b = [...a].reverse()
    expect(totalWaitingBlocks(a)).toBe(totalWaitingBlocks(b))
  })
  it('empty list is 0', () => {
    expect(totalWaitingBlocks([])).toBe(0)
  })
})

describe('waitingFeeEur (round once, never per stop)', () => {
  it('45 minutes at 12 EUR -> 2 blocks -> 24', () => {
    expect(waitingFeeEur(waitingBlocks(45), 12)).toBe(24)
  })
  it('1 block at 12.5 gives 13', () => {
    expect(waitingFeeEur(1, 12.5)).toBe(13)
  })
  it('0 blocks cost 0', () => {
    expect(waitingFeeEur(0, 12)).toBe(0)
  })
})

describe('priceStops', () => {
  it('one stop of 45 minutes at 12 EUR', () => {
    const [s] = priceStops([{ address: 'Karlstejn', lat: 50, lng: 14, waitMinutes: 45 }], 12)
    expect(s).toMatchObject({ position: 1, address: 'Karlstejn', lat: 50, lng: 14, waitMinutes: 45, freeMinutes: 15, blocks: 2, feePerBlockEur: 12, feeEur: 24 })
  })
  it('a stop of 15 minutes is free even with no rate', () => {
    const [s] = priceStops([{ lat: 50, lng: 14, waitMinutes: 15 }], null)
    expect(s.blocks).toBe(0)
    expect(s.feeEur).toBe(0)
    expect(s.feePerBlockEur).toBeNull()
    expect(s.address).toBe('')
  })
  it('positions count from 1 in the received order', () => {
    const rows = priceStops(
      [
        { lat: 1, lng: 1, waitMinutes: 0 },
        { lat: 2, lng: 2, waitMinutes: 30 },
      ],
      10,
    )
    expect(rows.map((r) => r.position)).toEqual([1, 2])
    expect(rows[1].feeEur).toBe(10)
  })
})

describe('waitingTotalEur', () => {
  it('rounds the sum once', () => {
    expect(waitingTotalEur([{ feeEur: 6.25 }, { feeEur: 6.25 }])).toBe(13)
    expect(waitingTotalEur([])).toBe(0)
  })
})

describe('extra waiting at the end of a trip (D-16, no free deduction)', () => {
  it.each([
    [1, 1],
    [15, 1],
    [16, 2],
    [480, 32],
  ])('%i minutes -> %i blocks', (minutes, blocks) => {
    expect(extraWaitingBlocks(minutes)).toBe(blocks)
  })

  it('amount in minor units for EUR and CZK', () => {
    expect(extraWaitingAmountMinor(45, 12.5, 'eur')).toBe(3800)
    expect(extraWaitingAmountMinor(45, 12.5, 'czk')).toBe(eurToCzk(38) * 100)
  })
})

describe('isValidStopWait', () => {
  it('accepts 0..120 in steps of 15 only', () => {
    for (const ok of [0, 15, 30, 45, 60, 75, 90, 105, 120]) expect(isValidStopWait(ok)).toBe(true)
    for (const bad of [-15, 7.5, 20, 135, 121, NaN, Infinity]) expect(isValidStopWait(bad)).toBe(false)
  })
})
