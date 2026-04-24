import { describe, it, expect, beforeEach, vi } from 'vitest'

const { serviceClient } = vi.hoisted(() => ({
  serviceClient: { from: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => serviceClient,
}))

import { getRoutePrice, getAllRoutes, findRouteByPlaceIds } from '@/lib/route-prices'

const brnoRow = {
  slug: 'prague-brno',
  from_label: 'Prague',
  to_label: 'Brno',
  distance_km: 205,
  e_class_eur: '320.00',
  s_class_eur: '525.00',
  v_class_eur: '350.00',
  display_order: 11,
  place_ids: [],
}

describe('PRICE-06: getRoutePrice', () => {
  beforeEach(() => { serviceClient.from.mockReset() })

  it('returns typed RoutePrice with Number() cast for NUMERIC columns', async () => {
    serviceClient.from.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: brnoRow, error: null }) }) }),
    })
    const r = await getRoutePrice('prague-brno')
    expect(r).not.toBeNull()
    expect(r!.slug).toBe('prague-brno')
    expect(r!.eClassEur).toBe(320)
    expect(r!.sClassEur).toBe(525)
    expect(r!.vClassEur).toBe(350)
    expect(typeof r!.eClassEur).toBe('number')
    expect(r!.distanceKm).toBe(205)
    expect(r!.placeIds).toEqual([])
  })

  it('returns null when single() errors', async () => {
    serviceClient.from.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'not found' } }) }) }),
    })
    const r = await getRoutePrice('nonexistent')
    expect(r).toBeNull()
  })
})

describe('PRICE-06: getAllRoutes', () => {
  beforeEach(() => { serviceClient.from.mockReset() })

  it('orders by display_order by default', async () => {
    const orderSpy = vi.fn(async () => ({ data: [brnoRow], error: null }))
    serviceClient.from.mockReturnValue({
      select: () => ({ order: orderSpy }),
    })
    const rows = await getAllRoutes()
    expect(orderSpy).toHaveBeenCalledWith('display_order', { ascending: true })
    expect(rows).toHaveLength(1)
    expect(rows[0].eClassEur).toBe(320)
  })

  it('orders by slug when argument passed', async () => {
    const orderSpy = vi.fn(async () => ({ data: [], error: null }))
    serviceClient.from.mockReturnValue({
      select: () => ({ order: orderSpy }),
    })
    await getAllRoutes('slug')
    expect(orderSpy).toHaveBeenCalledWith('slug', { ascending: true })
  })

  it('returns [] on error', async () => {
    serviceClient.from.mockReturnValue({
      select: () => ({ order: async () => ({ data: null, error: { message: 'boom' } }) }),
    })
    const rows = await getAllRoutes()
    expect(rows).toEqual([])
  })
})

describe('PRICE-06: findRouteByPlaceIds (Phase 44 stub)', () => {
  it('returns null for any inputs', async () => {
    const r = await findRouteByPlaceIds('ChIJany1', 'ChIJany2')
    expect(r).toBeNull()
  })
})
