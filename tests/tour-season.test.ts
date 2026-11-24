// Migration 094: the seasonal window of a tour (lib/tours/season.ts).
import { describe, it, expect } from 'vitest'
import { hasSeason, isInSeason, isSeasonOver } from '@/lib/tours/season'

const XMAS = { from: '2026-11-26', until: '2026-12-23' }

describe('tour season', () => {
  it('treats a tour without a window as always in season', () => {
    expect(isInSeason('2026-07-01', null)).toBe(true)
    expect(isInSeason('2026-07-01', { from: null, until: null })).toBe(true)
    expect(hasSeason({ from: null, until: null })).toBe(false)
  })

  it('accepts both ends and refuses the days outside', () => {
    expect(isInSeason('2026-11-26', XMAS)).toBe(true)
    expect(isInSeason('2026-12-23', XMAS)).toBe(true)
    expect(isInSeason('2026-11-25', XMAS)).toBe(false)
    expect(isInSeason('2026-12-24', XMAS)).toBe(false)
  })

  it('handles open-ended windows', () => {
    expect(isInSeason('2030-01-01', { from: '2026-11-26', until: null })).toBe(true)
    expect(isInSeason('2020-01-01', { from: null, until: '2026-12-23' })).toBe(true)
  })

  it('reports the season over only after the last day', () => {
    expect(isSeasonOver(XMAS, '2026-12-23')).toBe(false)
    expect(isSeasonOver(XMAS, '2026-12-24')).toBe(true)
    expect(isSeasonOver({ from: '2026-11-26', until: null }, '2030-01-01')).toBe(false)
  })
})
