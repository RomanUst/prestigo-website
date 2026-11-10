import { describe, it, expect } from 'vitest'
import { routeBookQuery, ROUTE_CITIES } from '@/lib/route-match'
import { ROUTES } from '@/lib/routes'

describe('ROUTE_CITIES', () => {
  it('covers every route page in lib/routes', () => {
    for (const r of ROUTES) expect(ROUTE_CITIES[r.slug], r.slug).toBeDefined()
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
})
