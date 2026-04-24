import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories
const { mockSelect, mockFrom } = vi.hoisted(() => {
  const mockSelect = vi.fn()
  const mockFrom = vi.fn(() => ({ select: mockSelect }))
  return { mockSelect, mockFrom }
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: mockFrom })),
}))

import { findRouteByPlaceIds } from '@/lib/route-prices'

const ORIGIN_ID = 'ChIJi3lNIT2UDkcRGBlSF2JiX1c'   // Prague
const DEST_ID = 'ChIJYXjBiRvMHkcRDGMvL1K0bCQ'     // Brno

const sampleRow = {
  slug: 'prague-brno',
  from_label: 'Prague',
  to_label: 'Brno',
  distance_km: 210,
  e_class_eur: 150,
  s_class_eur: 200,
  v_class_eur: 175,
  display_order: 1,
  place_ids: [ORIGIN_ID, DEST_ID],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFrom.mockReturnValue({ select: mockSelect })
})

describe('findRouteByPlaceIds — CALC-07 foundation', () => {
  it('findRouteByPlaceIds returns route when both placeIds present forward', async () => {
    mockSelect.mockResolvedValue({ data: [sampleRow], error: null })

    const result = await findRouteByPlaceIds(ORIGIN_ID, DEST_ID)

    expect(result).not.toBeNull()
    expect(result!.slug).toBe('prague-brno')
    expect(result!.eClassEur).toBe(150)
    expect(result!.placeIds).toContain(ORIGIN_ID)
    expect(result!.placeIds).toContain(DEST_ID)
  })

  it('findRouteByPlaceIds returns route when both placeIds present reversed', async () => {
    mockSelect.mockResolvedValue({ data: [sampleRow], error: null })

    // Reversed: destination as origin, origin as destination
    const result = await findRouteByPlaceIds(DEST_ID, ORIGIN_ID)

    expect(result).not.toBeNull()
    expect(result!.slug).toBe('prague-brno')
  })

  it('findRouteByPlaceIds returns null when only one placeId matches', async () => {
    mockSelect.mockResolvedValue({ data: [sampleRow], error: null })

    const result = await findRouteByPlaceIds(ORIGIN_ID, 'unknown-place-id')

    expect(result).toBeNull()
  })

  it('findRouteByPlaceIds returns null when place_ids[] is empty', async () => {
    const rowWithEmptyPlaceIds = { ...sampleRow, place_ids: [] }
    mockSelect.mockResolvedValue({ data: [rowWithEmptyPlaceIds], error: null })

    const result = await findRouteByPlaceIds(ORIGIN_ID, DEST_ID)

    expect(result).toBeNull()
  })

  it('findRouteByPlaceIds returns null on supabase error', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'DB error', code: '500' } })

    const result = await findRouteByPlaceIds(ORIGIN_ID, DEST_ID)

    expect(result).toBeNull()
  })
})
