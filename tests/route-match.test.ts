import { describe, it, expect } from 'vitest'
import {
  matchRouteSlugByCoords,
  routeBookQuery,
  ROUTE_CITIES,
  PRAGUE,
  haversineKm,
  PRAGUE_RADIUS_KM,
} from '@/lib/route-match'
import { ROUTES } from '@/lib/routes'

const PRG_AIRPORT = { lat: 50.1008, lng: 14.26 }
const OLD_TOWN = { lat: 50.0875, lng: 14.4213 }

describe('matchRouteSlugByCoords', () => {
  it('matches Prague centre → city centre', () => {
    expect(matchRouteSlugByCoords(OLD_TOWN, ROUTE_CITIES['prague-vienna'])).toBe('prague-vienna')
  })

  it('matches PRG airport → a hotel in the city (within radius)', () => {
    expect(matchRouteSlugByCoords(PRG_AIRPORT, { lat: 47.8, lng: 13.04 })).toBe('prague-salzburg')
  })

  it('is direction-independent', () => {
    expect(matchRouteSlugByCoords({ lat: 49.45, lng: 11.08 }, OLD_TOWN)).toBe('prague-nuremberg')
  })

  it('picks the nearest of two close cities', () => {
    expect(matchRouteSlugByCoords(OLD_TOWN, { lat: 50.2, lng: 15.83 })).toBe('prague-hradec-kralove')
    expect(matchRouteSlugByCoords(OLD_TOWN, { lat: 50.04, lng: 15.77 })).toBe('prague-pardubice')
  })

  it('does not match Vienna airport (outside the city radius)', () => {
    expect(matchRouteSlugByCoords(OLD_TOWN, { lat: 48.1103, lng: 16.5697 })).toBeNull()
  })

  it('does not match trips that do not touch Prague', () => {
    expect(matchRouteSlugByCoords(ROUTE_CITIES['prague-brno'], ROUTE_CITIES['prague-vienna'])).toBeNull()
  })

  it('does not match within-Prague rides or missing points', () => {
    expect(matchRouteSlugByCoords(OLD_TOWN, PRG_AIRPORT)).toBeNull()
    expect(matchRouteSlugByCoords(null, OLD_TOWN)).toBeNull()
  })
})

describe('ROUTE_CITIES', () => {
  it('covers every route page in lib/routes', () => {
    for (const r of ROUTES) expect(ROUTE_CITIES[r.slug], r.slug).toBeDefined()
  })

  it('has no city inside the Prague radius', () => {
    for (const [slug, c] of Object.entries(ROUTE_CITIES)) {
      expect(haversineKm(c, PRAGUE), slug).toBeGreaterThan(PRAGUE_RADIUS_KM + 15)
    }
  })
})

describe('routeBookQuery', () => {
  it('builds the BookingWizard deeplink params', () => {
    const q = new URLSearchParams(routeBookQuery('prague-salzburg').slice(1))
    expect(q.get('type')).toBe('transfer')
    expect(q.get('from')).toBe('Prague, Czechia')
    expect(q.get('to')).toBe('Salzburg, Austria')
    expect(Number(q.get('toLat'))).toBeCloseTo(47.8095)
    expect(q.get('fromPlaceId')).toBeTruthy()
    expect(q.get('toPlaceId')).toBeTruthy()
  })

  it('reverses for inbound pages and returns empty for unknown slugs', () => {
    const q = new URLSearchParams(routeBookQuery('prague-vienna', { reverse: true }).slice(1))
    expect(q.get('from')).toBe('Vienna, Austria')
    expect(q.get('to')).toBe('Prague, Czechia')
    expect(routeBookQuery('prague-atlantis')).toBe('')
  })

  it('round-trips into a matched route', () => {
    const q = new URLSearchParams(routeBookQuery('prague-brno').slice(1))
    const o = { lat: Number(q.get('fromLat')), lng: Number(q.get('fromLng')) }
    const d = { lat: Number(q.get('toLat')), lng: Number(q.get('toLng')) }
    expect(matchRouteSlugByCoords(o, d)).toBe('prague-brno')
  })
})
