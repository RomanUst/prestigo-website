import { describe, it, expect } from 'vitest'
import { buildTourCheckoutHref, parseTourCheckoutQuery, tourBoxStorageKey, type TourCheckoutQuery } from '@/lib/tours/checkout-query'
import { startTimeOptions, isStartBookable, isDateBookable } from '@/lib/tours/start-times'

const Q: TourCheckoutQuery = { tour: 'dresden-day-trip', date: '2027-05-10', time: '09:30', pax: 3, car: 'first_class', xh: 2 }

describe('checkout query (T-93-33)', () => {
  it('builds the six-value href in the documented order', () => {
    expect(buildTourCheckoutHref(Q)).toBe('/book/tour?tour=dresden-day-trip&date=2027-05-10&time=09%3A30&pax=3&car=first_class&xh=2')
  })

  it('round-trips through parse (URLSearchParams and plain record)', () => {
    const href = buildTourCheckoutHref(Q)
    const qs = new URLSearchParams(href.split('?')[1])
    expect(parseTourCheckoutQuery(qs)).toEqual(Q)
    expect(parseTourCheckoutQuery(Object.fromEntries(qs.entries()))).toEqual(Q)
  })

  it('ignores extra keys', () => {
    const qs = new URLSearchParams(buildTourCheckoutHref(Q).split('?')[1])
    qs.set('utm_source', 'x')
    expect(parseTourCheckoutQuery(qs)).toEqual(Q)
  })

  it.each([
    ['xh 13', { xh: '13' }],
    ['xh negative', { xh: '-1' }],
    ['xh fractional', { xh: '1.5' }],
    ['pax 0', { pax: '0' }],
    ['pax 7', { pax: '7' }],
    ["time '10:15'", { time: '10:15' }],
    ["time '24:00'", { time: '24:00' }],
    ["car 'van'", { car: 'van' }],
    ['uppercase slug', { tour: 'Dresden-day-trip' }],
    ['slug without the suffix', { tour: 'dresden' }],
    ['impossible date', { date: '2027-02-31' }],
    ['malformed date', { date: '10.05.2027' }],
  ])('rejects %s', (_name, override) => {
    const base = Object.fromEntries(new URLSearchParams(buildTourCheckoutHref(Q).split('?')[1]).entries())
    expect(parseTourCheckoutQuery({ ...base, ...override })).toBeNull()
  })

  it('rejects a missing value', () => {
    const base = Object.fromEntries(new URLSearchParams(buildTourCheckoutHref(Q).split('?')[1]).entries())
    delete (base as Record<string, string>).car
    expect(parseTourCheckoutQuery(base)).toBeNull()
  })

  it('takes the first value of a repeated key', () => {
    const base = Object.fromEntries(new URLSearchParams(buildTourCheckoutHref(Q).split('?')[1]).entries())
    expect(parseTourCheckoutQuery({ ...base, pax: ['4', '1'] })?.pax).toBe(4)
  })

  it('names the storage key tour-box:<slug>', () => {
    expect(tourBoxStorageKey('dresden-day-trip')).toBe('tour-box:dresden-day-trip')
  })
})

describe('start times', () => {
  it("startTimeOptions('08:00', '11:00') is 7 chips every 30 minutes", () => {
    expect(startTimeOptions('08:00', '11:00')).toEqual(['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00'])
  })

  it('startTimeOptions returns [] for bad or inverted input', () => {
    expect(startTimeOptions('08:15', '11:00')).toEqual([])
    expect(startTimeOptions('11:00', '08:00')).toEqual([])
  })

  it('isStartBookable: 12 h ahead is bookable, 11 h 59 min is not', () => {
    // 2027-06-10 09:00 Prague (CEST, UTC+2) = 07:00Z
    const start = Date.parse('2027-06-10T07:00:00Z')
    expect(isStartBookable('2027-06-10', '09:00', start - 12 * 3_600_000)).toBe(true)
    expect(isStartBookable('2027-06-10', '09:00', start - 12 * 3_600_000 + 60_000)).toBe(false)
  })

  it('isStartBookable holds the 12 hour rule across 2027-03-28 (Prague spring forward)', () => {
    // 2027-03-28 08:00 Prague is CEST (UTC+2) = 06:00Z, only 11 clock hours after 2027-03-27 21:00 CET.
    const start = Date.parse('2027-03-28T06:00:00Z')
    expect(isStartBookable('2027-03-28', '08:00', start - 12 * 3_600_000)).toBe(true)
    expect(isStartBookable('2027-03-28', '08:00', start - 12 * 3_600_000 + 60_000)).toBe(false)
  })

  it('isStartBookable is false for an unparsable date', () => {
    expect(isStartBookable('2027-02-31', '09:00', 0)).toBe(false)
  })

  it('isDateBookable: not before today, and needs one start 12 h ahead', () => {
    const now = Date.parse('2027-06-10T08:00:00Z') // 10:00 Prague
    expect(isDateBookable('2027-06-09', '08:00', '11:00', now)).toBe(false) // past day
    expect(isDateBookable('2027-06-10', '08:00', '11:00', now)).toBe(false) // latest start is 1 h ahead
    expect(isDateBookable('2027-06-11', '08:00', '11:00', now)).toBe(true) // 25 h ahead
    expect(isDateBookable('2027-06-10', '08:00', '22:00', now)).toBe(true) // 22:00 is exactly 12 h ahead
    expect(isDateBookable('2027-06-10', '08:00', '21:30', now)).toBe(false)
  })
})
