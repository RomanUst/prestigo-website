// Phase 93 plan 05 (TRIP-04, D-05, D-13, D-22, T-93-13): the Prague pickup rule and the custom-tour link.
import { describe, it, expect } from 'vitest'
import { OLD_TOWN_SQUARE, checkTourPickup, distanceKm } from '@/lib/tours/pickup-area'
import { CUSTOM_TOUR_REQUEST_LIVE, buildCustomTourHref, customTourHref } from '@/lib/tours/custom-tour-link'
import { PRG_LAT, PRG_LNG } from '@/lib/airport'

describe('distanceKm', () => {
  it('is 0 for the same point and about 12 km from the Old Town to the airport', () => {
    expect(distanceKm(OLD_TOWN_SQUARE, OLD_TOWN_SQUARE)).toBe(0)
    const d = distanceKm(OLD_TOWN_SQUARE, { lat: PRG_LAT, lng: PRG_LNG })
    expect(d).toBeGreaterThan(10)
    expect(d).toBeLessThan(14)
  })
})

describe('checkTourPickup', () => {
  it('Old Town Square itself is ok', () => {
    expect(checkTourPickup({ ...OLD_TOWN_SQUARE, address: 'Staroměstské náměstí, Praha' }, 15)).toBe('ok')
  })
  it('the airport coordinates give airport, even inside the radius', () => {
    expect(checkTourPickup({ lat: PRG_LAT, lng: PRG_LNG, address: null }, 50)).toBe('airport')
  })
  it('an address naming the airport with city coordinates gives airport', () => {
    expect(checkTourPickup({ ...OLD_TOWN_SQUARE, address: 'Letiště Václava Havla Praha' }, 15)).toBe('airport')
    expect(checkTourPickup({ ...OLD_TOWN_SQUARE, address: 'Prague Airport, Terminal 2' }, 15)).toBe('airport')
  })
  it('a point 20 km out is out_of_area at radius 15 and ok at radius 25', () => {
    const point = { lat: OLD_TOWN_SQUARE.lat + 20 / 111.19, lng: OLD_TOWN_SQUARE.lng, address: 'Somewhere north' }
    expect(distanceKm(OLD_TOWN_SQUARE, point)).toBeGreaterThan(19.9)
    expect(distanceKm(OLD_TOWN_SQUARE, point)).toBeLessThan(20.1)
    expect(checkTourPickup(point, 15)).toBe('out_of_area')
    expect(checkTourPickup(point, 25)).toBe('ok')
  })
  it('unusable coordinates are out_of_area, never ok', () => {
    expect(checkTourPickup({ lat: Number.NaN, lng: 14.4, address: null }, 15)).toBe('out_of_area')
    expect(checkTourPickup({ ...OLD_TOWN_SQUARE, address: null }, Number.NaN)).toBe('out_of_area')
  })
})

describe('customTourHref', () => {
  const q = { tour: 'dresden-day-trip', date: '2027-05-01', pax: 4 }

  it('ships with the request page not live yet', () => {
    expect(CUSTOM_TOUR_REQUEST_LIVE).toBe(false)
    expect(customTourHref(q)).toBe('/contact')
    expect(customTourHref()).toBe('/contact')
  })
  it('points to /contact while not live, whatever the query', () => {
    expect(buildCustomTourHref(q, false)).toBe('/contact')
  })
  it('opens /book/custom-tour with the prefill query when live', () => {
    expect(buildCustomTourHref(q, true)).toBe('/book/custom-tour?tour=dresden-day-trip&date=2027-05-01&pax=4')
    expect(buildCustomTourHref({}, true)).toBe('/book/custom-tour')
  })
  it('drops invalid slug, date and pax values', () => {
    expect(buildCustomTourHref({ tour: 'Dresden/../x', date: '2027-02-30', pax: 0 }, true)).toBe('/book/custom-tour')
    expect(buildCustomTourHref({ tour: 'dresden-trip', date: '01.05.2027', pax: 51 }, true)).toBe('/book/custom-tour')
    expect(buildCustomTourHref({ tour: 'dresden-day-trip', date: 'x', pax: 1.5 }, true)).toBe('/book/custom-tour?tour=dresden-day-trip')
    expect(buildCustomTourHref({ tour: null, date: '2027-05-01', pax: null }, true)).toBe('/book/custom-tour?date=2027-05-01')
  })
})
