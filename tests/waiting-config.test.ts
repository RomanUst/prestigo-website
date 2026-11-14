import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getPricingConfigMock } = vi.hoisted(() => ({ getPricingConfigMock: vi.fn() }))

vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: getPricingConfigMock,
}))

import { GET, dynamic } from '@/app/api/waiting-config/route'

function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value]
  if (Array.isArray(value)) return value.flatMap(numbersIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbersIn)
  return []
}

beforeEach(() => {
  getPricingConfigMock.mockReset()
})

describe('GET /api/waiting-config', () => {
  it('lists only classes with a positive rate, with the cache header', async () => {
    getPricingConfigMock.mockResolvedValue({ waitingRate: { business: 12.5 } })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300')
    expect(await res.json()).toEqual({
      freeMin: 15,
      blockMin: 15,
      maxMin: 120,
      offeredClasses: ['business'],
    })
  })

  it('keeps VEHICLE_CLASSES order and ignores unknown keys', async () => {
    getPricingConfigMock.mockResolvedValue({
      waitingRate: { business_van: 20, bogus: 5, business: 10 },
    })
    const body = await (await GET()).json()
    expect(body.offeredClasses).toEqual(['business', 'business_van'])
  })

  it('never leaks a rate: the only numbers are 15, 15 and 120', async () => {
    getPricingConfigMock.mockResolvedValue({
      waitingRate: { business: 12.5, first_class: 33.3, business_van: 7.77 },
    })
    const body = await (await GET()).json()
    expect(numbersIn(body)).toEqual([15, 15, 120])
  })

  it('offers no class when no rate is set (D-05)', async () => {
    getPricingConfigMock.mockResolvedValue({ waitingRate: {} })
    const body = await (await GET()).json()
    expect(body.offeredClasses).toEqual([])
  })

  it('tolerates a pricing config without waitingRate', async () => {
    getPricingConfigMock.mockResolvedValue({})
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).offeredClasses).toEqual([])
  })

  it('answers 200 with offeredClasses [] when pricing cannot be read', async () => {
    getPricingConfigMock.mockRejectedValue(new Error('db down'))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ freeMin: 15, blockMin: 15, maxMin: 120, offeredClasses: [] })
  })

  it('is force-dynamic so nothing runs at build time', () => {
    expect(dynamic).toBe('force-dynamic')
  })
})
