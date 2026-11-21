// Phase 93 plan 05 (TRIP-01, TRIP-02, T-93-14): the guarded tour readers, tracer slice read -> price.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: createClientMock }))

import {
  getPublishedTourBySlug,
  getPublishedTourForLocale,
  getPublishedTourLocales,
  getTourSettings,
  listPublishedTours,
} from '@/lib/tours/store'
import { tourFare } from '@/lib/tours/pricing'

type Rows = Record<string, Array<Record<string, unknown>>>

/** Minimal PostgREST stand-in: eq / in filters are applied to the table rows, order is ignored. */
function stubClient(tables: Rows) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const builder = {
        select: () => builder,
        order: () => builder,
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val)
          return builder
        },
        in(col: string, vals: unknown[]) {
          rows = rows.filter((r) => vals.includes(r[col]))
          return builder
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: rows, error: null }),
      }
      return builder
    },
  }
}

const TOUR = {
  id: 't1',
  slug: 'dresden-day-trip',
  status: 'published',
  sort_order: 1,
  hours_included: 5,
  drive_minutes_each_way: 150,
  start_time_min: '07:00',
  start_time_max: '09:00',
  price_e_eur: '100.00',
  price_s_eur: '180.00',
  price_v_eur: '120.00',
  destination_label: 'Dresden',
  first_published_at: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-02T00:00:00Z',
}
const SETTINGS = {
  id: 1,
  extra_hour_e_eur: '40',
  extra_hour_s_eur: '60',
  extra_hour_v_eur: '50',
  free_cancel_hours: 24,
  pickup_radius_km: 15,
  updated_at: '2026-11-01T00:00:00Z',
}
function tr(locale: string, complete: boolean, extra: Record<string, unknown> = {}) {
  return {
    tour_id: 't1',
    locale,
    title: `Title ${locale}`,
    short_description: `Short ${locale}`,
    is_complete: complete,
    updated_at: '2026-11-03T00:00:00Z',
    ...extra,
  }
}
const PHOTOS = [
  { id: 'p2', tour_id: 't1', storage_path: 'tours/t1/b.jpg', position: 2, is_cover: false },
  { id: 'p1', tour_id: 't1', storage_path: 'tours/t1/a.jpg', position: 1, is_cover: false },
  { id: 'p3', tour_id: 't1', storage_path: 'tours/t1/c.jpg', position: 3, is_cover: true },
]

function tables(over: Partial<Rows> = {}): Rows {
  return {
    tours: [TOUR],
    tour_translations: [tr('en', true), tr('ru', true), tr('fr', false)],
    tour_photos: PHOTOS,
    tour_settings: [SETTINGS],
    ...over,
  }
}

beforeEach(() => {
  createClientMock.mockReset()
})

describe('getPublishedTourForLocale', () => {
  it('returns ok with the complete translation, cover-first photos and numeric prices, then prices through tourFare', async () => {
    createClientMock.mockReturnValue(stubClient(tables()))
    const res = await getPublishedTourForLocale('dresden-day-trip', 'ru')
    expect(res.status).toBe('ok')
    if (res.status !== 'ok') return
    expect(res.data.translation.locale).toBe('ru')
    expect(res.data.completeLocales.sort()).toEqual(['en', 'ru'])
    expect(res.data.photos.map((p) => p.id)).toEqual(['p3', 'p1', 'p2'])
    expect(res.data.tour.price_s_eur).toBe(180)
    expect(res.data.settings.extra_hour_s_eur).toBe(60)
    // tracer: read, then price a class with extra hours
    expect(tourFare(res.data.tour, res.data.settings, 'first_class', 2)).toBe(300)
  })

  it('a draft tour is not_found', async () => {
    createClientMock.mockReturnValue(stubClient(tables({ tours: [{ ...TOUR, status: 'draft' }] })))
    expect(await getPublishedTourForLocale('dresden-day-trip', 'en')).toEqual({ status: 'not_found' })
  })

  it('a published tour with an incomplete locale is locale_incomplete with the complete locales', async () => {
    createClientMock.mockReturnValue(stubClient(tables()))
    const res = await getPublishedTourForLocale('dresden-day-trip', 'fr')
    expect(res.status).toBe('locale_incomplete')
    if (res.status === 'locale_incomplete') expect(res.completeLocales.sort()).toEqual(['en', 'ru'])
  })

  it('an unknown slug is not_found', async () => {
    createClientMock.mockReturnValue(stubClient(tables()))
    expect(await getPublishedTourForLocale('nope-day-trip', 'en')).toEqual({ status: 'not_found' })
  })
})

describe('listPublishedTours', () => {
  it('lists published tours complete in the locale with total hours, lowest price and the cover', async () => {
    createClientMock.mockReturnValue(stubClient(tables()))
    const cards = await listPublishedTours('ru')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      slug: 'dresden-day-trip',
      title: 'Title ru',
      hoursIncluded: 5,
      totalHours: 10,
      lowestPrice: 100,
    })
    expect(cards[0].cover?.id).toBe('p3')
  })

  it('skips tours whose translation is incomplete in the locale', async () => {
    createClientMock.mockReturnValue(stubClient(tables()))
    expect(await listPublishedTours('fr')).toEqual([])
  })
})

describe('getPublishedTourLocales', () => {
  it('returns the complete locales and the latest update per published tour', async () => {
    createClientMock.mockReturnValue(stubClient(tables()))
    const out = await getPublishedTourLocales()
    expect(out).toHaveLength(1)
    expect(out[0].slug).toBe('dresden-day-trip')
    expect(out[0].locales.sort()).toEqual(['en', 'ru'])
    expect(out[0].updatedAt).toBe('2026-11-03T00:00:00Z')
  })

  it('leaves out draft tours', async () => {
    createClientMock.mockReturnValue(stubClient(tables({ tours: [{ ...TOUR, status: 'draft' }] })))
    expect(await getPublishedTourLocales()).toEqual([])
  })
})

describe('getPublishedTourBySlug and getTourSettings', () => {
  it('returns the tour, its EN title and the settings', async () => {
    createClientMock.mockReturnValue(stubClient(tables()))
    const res = await getPublishedTourBySlug('dresden-day-trip')
    expect(res?.enTitle).toBe('Title en')
    expect(res?.settings.free_cancel_hours).toBe(24)
    expect((await getTourSettings())?.pickup_radius_km).toBe(15)
  })

  it('a draft tour is null', async () => {
    createClientMock.mockReturnValue(stubClient(tables({ tours: [{ ...TOUR, status: 'draft' }] })))
    expect(await getPublishedTourBySlug('dresden-day-trip')).toBeNull()
  })
})

describe('no env', () => {
  it('every reader degrades when the service client throws (no env) and logs nothing', async () => {
    createClientMock.mockImplementation(() => {
      throw new Error('supabaseUrl is required')
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await getPublishedTourForLocale('dresden-day-trip', 'en')).toEqual({ status: 'not_found' })
    expect(await listPublishedTours('en')).toEqual([])
    expect(await getPublishedTourLocales()).toEqual([])
    expect(await getTourSettings()).toBeNull()
    expect(await getPublishedTourBySlug('dresden-day-trip')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    spy.mockRestore()
    warn.mockRestore()
  })
})
